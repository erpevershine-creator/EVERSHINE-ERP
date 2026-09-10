-- Durable ERP access fence. Provider outcome proof and interrupted-operation
-- reconciliation remain separate acceptance gates; this migration does not claim them.
alter table public.profiles add column password_change_pending boolean not null default false;
update public.profiles p set password_change_pending=true where exists (
 select 1 from private.password_change_operations o where o.target_id=p.id
 and o.status in ('running','failed') and not exists (
 select 1 from private.password_change_operations newer where newer.target_id=p.id
 and newer.created_at>o.created_at and newer.status='completed'));
-- Every data-access session must have been explicitly admitted by the ERP server.
-- Existing ERP rows are retained; unknown provider sessions are never backfilled.
create or replace function private.is_active_user() returns boolean
language sql stable security definer set search_path='' as $$
select exists(select 1 from public.profiles p
 join auth.sessions s on s.user_id=p.id
 join public.device_sessions d on d.id=s.id and d.profile_id=p.id and d.status='active'
 where p.id=auth.uid() and p.status='active' and not p.recovery_pending and not p.password_change_pending
 and p.password_expires_at>now() and s.id::text=auth.jwt()->>'session_id'
 and s.created_at>=p.sessions_valid_after);
$$;

create or replace function public.prepare_password_change(p_target uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.profiles; op uuid;
begin
 if p_reason is null or length(btrim(p_reason)) not between 1 and 1000 then raise exception 'Reason required'; end if;
 perform private.require_admin('Account Management','change_password');
 select * into p from public.profiles where id=p_target for update;
 if not found or p.recovery_pending or p.status in ('inactive','disabled') then raise exception 'Account unavailable'; end if;
 if p.erp_role='owner' and (not private.is_owner() or p.id<>auth.uid()) then raise exception 'Only Owner may change Owner password'; end if;
 if p.id=auth.uid() and p.erp_role<>'owner' then raise exception 'Employees cannot change their own password'; end if;
 if p.erp_role='admin' and not private.is_owner() then raise exception 'Only Owner may change Admin password'; end if;
 if not private.can_delegate(private.permission_snapshot(p.id,p.page_access,p.action_access)) then raise exception 'Account exceeds your scope'; end if;
 if exists(select 1 from private.password_change_operations where target_id=p.id and status='running') then raise exception 'Password change already running'; end if;
 insert into private.password_change_operations(actor_id,target_id,reason,status) values(auth.uid(),p.id,btrim(p_reason),'running') returning id into op;
 update public.profiles set password_change_pending=true,sessions_valid_after=clock_timestamp(),version=version+1 where id=p.id;
 update public.device_sessions set status='logged_out',ended_at=clock_timestamp(),ended_reason='Password change' where profile_id=p.id and status in ('active','pending');
 perform private.audit('Password change started','profile',p.id::text,btrim(p_reason),jsonb_build_object('status',p.status),jsonb_build_object('status','password_change_pending'));
 return jsonb_build_object('operation',op,'target',p.id);
end; $$;

create or replace function public.finish_password_change(p_operation uuid,p_success boolean) returns void
language plpgsql security definer set search_path='' as $$
declare o private.password_change_operations; p public.profiles;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Server only'; end if;
 select * into o from private.password_change_operations where id=p_operation for update;
 if not found or o.status<>'running' then raise exception 'Password operation unavailable'; end if;
 select * into p from public.profiles where id=o.target_id for update;
 update private.password_change_operations set status=case when p_success then 'completed' else 'failed' end,finished_at=clock_timestamp() where id=o.id;
 if p_success is null then raise exception 'Completion outcome required'; end if;
 if p_success then update public.profiles set password_change_pending=false,sessions_valid_after=clock_timestamp(),password_changed_at=clock_timestamp(),password_expires_at=clock_timestamp()+interval '6 months',failed_login_attempts=0,version=version+1 where id=p.id; end if;
 update public.device_sessions set status='logged_out',ended_at=clock_timestamp(),ended_reason='Password change completion' where profile_id=p.id and status in ('active','pending');
 insert into public.audit_events(actor_id,actor_name,action,entity_type,entity_id,reason,before_data,after_data) select o.actor_id,a.employee_name,case when p_success then 'Password change completed' else 'Password change failed' end,'profile',p.id::text,o.reason,jsonb_build_object('operation',o.id),jsonb_build_object('status',case when p_success then 'completed' else 'failed' end) from public.profiles a where a.id=o.actor_id;
end; $$;

-- A device idle for seven days is closed and the next login needs the same
-- explicit Owner/Account Management approval as a third device.
create or replace function public.complete_login_attempt(p_ticket uuid,p_outcome text,p_session uuid default null) returns text
language plpgsql security definer set search_path='' as $$
declare a private.login_attempts; p public.profiles; s auth.sessions; idle_count integer;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Server only' using errcode='42501'; end if;
 if p_outcome is null or p_outcome not in ('success','invalid_credentials','service_failure') then raise exception 'Invalid outcome'; end if;
 select * into a from private.login_attempts where id=p_ticket for update;
 if not found or a.consumed_at is not null or a.created_at<clock_timestamp()-interval '15 minutes' then return 'rejected'; end if;
 update private.login_attempts set consumed_at=clock_timestamp() where id=a.id;
 if p_outcome='service_failure' then return 'service_failure'; end if;
 select * into p from public.profiles where username=a.username for update;
 if not found or p.status<>'active' or p.recovery_pending or p.password_change_pending then return 'rejected'; end if;
 if p_outcome='invalid_credentials' then
   update public.profiles set failed_login_attempts=least(5,failed_login_attempts+1),status=case when failed_login_attempts>=4 then 'locked' else status end,sessions_valid_after=case when failed_login_attempts>=4 then clock_timestamp() else sessions_valid_after end where id=p.id;
   insert into public.audit_events(actor_id,actor_name,action,entity_type,entity_id,reason,after_data) values(p.id,p.employee_name,'Password sign-in failed','profile',p.id::text,'Invalid ERP password',jsonb_build_object('failedAttempts',least(5,p.failed_login_attempts+1)));
   if p.failed_login_attempts>=4 then update public.device_sessions set status='logged_out',ended_at=clock_timestamp(),ended_reason='Five failed password attempts' where profile_id=p.id and status in ('active','pending'); end if;
   return 'invalid_credentials';
 end if;
 select * into s from auth.sessions where id=p_session and user_id=p.id;
 if not found or s.created_at<a.created_at or s.created_at<p.sessions_valid_after or p.password_expires_at<=now() or exists(select 1 from public.device_sessions where id=p_session) then return 'rejected'; end if;
 update public.device_sessions set status='logged_out',ended_at=clock_timestamp(),ended_reason='Idle seven-day reapproval' where profile_id=p.id and status='active' and last_seen_at<clock_timestamp()-interval '7 days';
 get diagnostics idle_count = row_count;
 if idle_count>0 then update public.profiles set requires_login_approval=true where id=p.id; p.requires_login_approval:=true; end if;
 if p.requires_login_approval or (select count(*) from public.device_sessions where profile_id=p.id and status='active') >= 2 then
   if exists(select 1 from public.approval_requests where request_type='device_login' and requester_id=p.id and status='pending' and proposed_data->>'sessionId'=p_session::text) then return 'pending'; end if;
   insert into public.approval_requests(request_type,module,requester_id,target_type,target_id,current_data,proposed_data,reason,status,deadline_at)
   values('device_login','Account Management',p.id,'profile',p.id::text,jsonb_build_object('activeDeviceCount',(select count(*) from public.device_sessions where profile_id=p.id and status='active'),'idleReapproval',p.requires_login_approval),jsonb_build_object('sessionId',p_session::text,'deviceLabel','ERP sign-in','startedAt',s.created_at,'reasonCode',case when p.requires_login_approval then 'idle-seven-day' else 'third-device' end),'Login approval required','pending',clock_timestamp()+interval '1 day');
   insert into public.notifications(recipient_id,notification_type,title,message) select q.id,'approval','Device sign-in approval required',p.employee_name||' has a device sign-in waiting for approval.' from public.profiles q where q.status='active' and (q.erp_role='owner' or (q.erp_role='admin' and private.merge_permission_actions(q.action_access,q.individual_actions)->'Account Management' ?| array['approve_device','approve','*']));
   return 'pending';
 end if;
 insert into public.device_sessions(id,profile_id,device_fingerprint_hash,device_label,started_at,last_seen_at) values(s.id,p.id,extensions.digest(s.id::text,'sha256'),'ERP sign-in',s.created_at,clock_timestamp());
 update public.profiles set failed_login_attempts=0 where id=p.id;
 return 'admitted';
end; $$;
revoke all on function public.complete_login_attempt(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.complete_login_attempt(uuid,text,uuid) to service_role;


notify pgrst,'reload schema';
create or replace function public.decide_device_login(p_request bigint,p_approve boolean,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.approval_requests; p public.profiles; sid uuid; started timestamptz; label text; old public.device_sessions;
begin
 perform private.require_admin('Account Management','approve_device');
 if p_approve is null or p_reason is null or length(btrim(p_reason)) not between 1 and 1000 then raise exception 'Decision reason required'; end if;
 select * into r from public.approval_requests where id=p_request for update;
 if not found or r.request_type<>'device_login' or r.status<>'pending' then raise exception 'Request is not pending'; end if;
 if r.requester_id=auth.uid() and not private.is_owner() then raise exception 'Only Owner may self-approve'; end if;
 select * into p from public.profiles where id=r.requester_id for update;
 if not found or p.status<>'active' or p.recovery_pending or p.password_change_pending then raise exception 'Account is unavailable'; end if;
 if r.deadline_at<=clock_timestamp() then update public.approval_requests set status='expired',version=version+1 where id=r.id; raise exception 'Request expired'; end if;
 sid:=(r.proposed_data->>'sessionId')::uuid; label:=coalesce(r.proposed_data->>'deviceLabel','ERP sign-in'); started:=(r.proposed_data->>'startedAt')::timestamptz;
 if not exists(select 1 from auth.sessions where id=sid and user_id=p.id) then raise exception 'Provider session is unavailable'; end if;
 if p_approve then
   if exists(select 1 from public.device_sessions where id=sid) then raise exception 'Device session already decided'; end if;
   select * into old from public.device_sessions where profile_id=p.id and status='active' order by started_at asc for update skip locked limit 1;
   if old.id is not null then update public.device_sessions set status='logged_out',ended_at=clock_timestamp(),ended_reason=case when r.proposed_data->>'reasonCode'='idle-seven-day' then 'Idle seven-day reapproval' else 'Approved third-device replacement' end where id=old.id; end if;
   insert into public.device_sessions(id,profile_id,device_fingerprint_hash,device_label,started_at,last_seen_at) values(sid,p.id,extensions.digest(sid::text,'sha256'),label,started,clock_timestamp());
   update public.profiles set requires_login_approval=false where id=p.id;
 end if;
 update public.approval_requests set status=case when p_approve then 'approved' else 'rejected' end,decided_by=auth.uid(),decided_at=clock_timestamp(),decision_reason=p_reason,version=version+1 where id=r.id;
 insert into public.notifications(recipient_id,notification_type,title,message,approval_request_id) values(r.requester_id,'approval',case when p_approve then 'Device sign-in approved' else 'Device sign-in rejected' end,p_reason,r.id);
 insert into public.audit_events(actor_id,actor_name,action,entity_type,entity_id,reason,before_data,after_data,approval_request_id) values(auth.uid(),(select employee_name from public.profiles where id=auth.uid()),case when p_approve then 'Device sign-in approved' else 'Device sign-in rejected' end,'approval_request',r.id::text,p_reason,r.current_data,r.proposed_data,r.id);
end; $$;
notify pgrst,'reload schema';

