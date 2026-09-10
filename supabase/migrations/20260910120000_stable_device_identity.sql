-- A browser device is identified by a random HttpOnly token, never by the
-- short-lived Auth session UUID. Missing tokens keep the legacy fail-closed path.
drop function if exists public.complete_login_attempt(uuid,text,uuid);
create or replace function public.complete_login_attempt(p_ticket uuid,p_outcome text,p_session uuid,p_device_token text) returns text
language plpgsql security definer set search_path='' as $$
declare a private.login_attempts; p public.profiles; s auth.sessions; idle_count integer; fingerprint bytea; known public.device_sessions;
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
 if not found or s.created_at<a.created_at or s.created_at<p.sessions_valid_after or p.password_expires_at<=now() then return 'rejected'; end if;
 if p_device_token is null or length(p_device_token)<43 or length(p_device_token)>128 then fingerprint:=extensions.digest(s.id::text,'sha256'); else fingerprint:=extensions.digest(p_device_token,'sha256'); end if;
 select * into known from public.device_sessions where profile_id=p.id and device_fingerprint_hash=fingerprint and status='active' order by last_seen_at desc limit 1 for update;
 if known.id is not null then
   update public.device_sessions set status='logged_out',ended_at=clock_timestamp(),ended_reason='Same device new sign-in' where id=known.id;
   insert into public.device_sessions(id,profile_id,device_fingerprint_hash,device_label,started_at,last_seen_at) values(s.id,p.id,fingerprint,'ERP sign-in',s.created_at,clock_timestamp());
   update public.profiles set failed_login_attempts=0 where id=p.id;
   return 'admitted';
 end if;
 update public.device_sessions set status='logged_out',ended_at=clock_timestamp(),ended_reason='Idle seven-day reapproval' where profile_id=p.id and status='active' and last_seen_at<clock_timestamp()-interval '7 days';
 get diagnostics idle_count = row_count;
 if idle_count>0 then update public.profiles set requires_login_approval=true where id=p.id; p.requires_login_approval:=true; end if;
 if p.requires_login_approval or (select count(*) from public.device_sessions where profile_id=p.id and status='active') >= 2 then
   if exists(select 1 from public.approval_requests where request_type='device_login' and requester_id=p.id and status='pending' and proposed_data->>'sessionId'=p_session::text) then return 'pending'; end if;
   insert into public.approval_requests(request_type,module,requester_id,target_type,target_id,current_data,proposed_data,reason,status,deadline_at)
   values('device_login','Account Management',p.id,'profile',p.id::text,jsonb_build_object('activeDeviceCount',(select count(*) from public.device_sessions where profile_id=p.id and status='active'),'idleReapproval',p.requires_login_approval),jsonb_build_object('sessionId',p_session::text,'deviceFingerprint',encode(fingerprint,'hex'),'deviceLabel','ERP sign-in','startedAt',s.created_at,'reasonCode',case when p.requires_login_approval then 'idle-seven-day' else 'third-device' end),'Login approval required','pending',clock_timestamp()+interval '1 day');
   insert into public.notifications(recipient_id,notification_type,title,message) select q.id,'approval','Device sign-in approval required',p.employee_name||' has a device sign-in waiting for approval.' from public.profiles q where q.status='active' and (q.erp_role='owner' or (q.erp_role='admin' and private.merge_permission_actions(q.action_access,q.individual_actions)->'Account Management' ?| array['approve_device','approve','*']));
   return 'pending';
 end if;
 insert into public.device_sessions(id,profile_id,device_fingerprint_hash,device_label,started_at,last_seen_at) values(s.id,p.id,fingerprint,'ERP sign-in',s.created_at,clock_timestamp());
 update public.profiles set failed_login_attempts=0 where id=p.id;
 return 'admitted';
end; $$;
revoke all on function public.complete_login_attempt(uuid,text,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.complete_login_attempt(uuid,text,uuid,text) to service_role;
create function public.complete_login_attempt(p_ticket uuid,p_outcome text,p_session uuid) returns text
language sql security definer set search_path='' as $$ select public.complete_login_attempt(p_ticket,p_outcome,p_session,null); $$;
revoke all on function public.complete_login_attempt(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.complete_login_attempt(uuid,text,uuid) to service_role;
create function public.complete_login_attempt(p_ticket uuid,p_outcome text) returns text
language sql security definer set search_path='' as $$ select public.complete_login_attempt(p_ticket,p_outcome,null,null); $$;
revoke all on function public.complete_login_attempt(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.complete_login_attempt(uuid,text) to service_role;

-- The approval row carries the fingerprint captured at login, so the approver
-- cannot substitute a different browser device.
create or replace function public.decide_device_login(p_request bigint,p_approve boolean,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.approval_requests; p public.profiles; sid uuid; started timestamptz; label text; old public.device_sessions; fingerprint bytea;
begin
 perform private.require_request_authority('Account Management','approve_device',p_request);
 if p_approve is null or p_reason is null or length(btrim(p_reason)) not between 1 and 1000 then raise exception 'Decision reason required'; end if;
 select * into r from public.approval_requests where id=p_request for update;
 if not found or r.request_type<>'device_login' or r.status<>'pending' then raise exception 'Request is not pending'; end if;
 if r.requester_id=auth.uid() and not private.is_owner() then raise exception 'Only Owner may self-approve'; end if;
 select * into p from public.profiles where id=r.requester_id for update;
 if not found or p.status<>'active' or p.recovery_pending or p.password_change_pending then raise exception 'Account is unavailable'; end if;
 if r.deadline_at<=clock_timestamp() then
   update public.approval_requests set status='expired',decided_at=clock_timestamp(),decision_reason='Approval window expired',version=version+1 where id=r.id;
   insert into public.audit_events(actor_id,actor_name,action,entity_type,entity_id,reason,before_data,after_data,approval_request_id)
     values(auth.uid(),(select employee_name from public.profiles where id=auth.uid()),'Device sign-in expired','approval_request',r.id::text,'Approval window expired',r.current_data,r.proposed_data,r.id);
   return;
 end if;
 sid:=(r.proposed_data->>'sessionId')::uuid; label:=coalesce(r.proposed_data->>'deviceLabel','ERP sign-in'); started:=(r.proposed_data->>'startedAt')::timestamptz; fingerprint:=decode(r.proposed_data->>'deviceFingerprint','hex');
 if not exists(select 1 from auth.sessions where id=sid and user_id=p.id) then raise exception 'Provider session is unavailable'; end if;
 if p_approve then
   if exists(select 1 from public.device_sessions where id=sid) then raise exception 'Device session already decided'; end if;
   select * into old from public.device_sessions where profile_id=p.id and status='active' order by started_at asc for update limit 1;
   if (select count(*) from public.device_sessions where profile_id=p.id and status='active')>=2 and old.id is not null then update public.device_sessions set status='logged_out',ended_at=clock_timestamp(),ended_reason='Approved third-device replacement' where id=old.id; end if;
   insert into public.device_sessions(id,profile_id,device_fingerprint_hash,device_label,started_at,last_seen_at) values(sid,p.id,coalesce(fingerprint,extensions.digest(sid::text,'sha256')),label,started,clock_timestamp());
   update public.profiles set requires_login_approval=false where id=p.id;
 end if;
 update public.approval_requests set status=case when p_approve then 'approved' else 'rejected' end,decided_by=auth.uid(),decided_at=clock_timestamp(),decision_reason=p_reason,version=version+1 where id=r.id;
 insert into public.notifications(recipient_id,notification_type,title,message,approval_request_id) values(r.requester_id,'approval',case when p_approve then 'Device sign-in approved' else 'Device sign-in rejected' end,p_reason,r.id);
 insert into public.audit_events(actor_id,actor_name,action,entity_type,entity_id,reason,before_data,after_data,approval_request_id) values(auth.uid(),(select employee_name from public.profiles where id=auth.uid()),case when p_approve then 'Device sign-in approved' else 'Device sign-in rejected' end,'approval_request',r.id::text,p_reason,r.current_data,r.proposed_data,r.id);
end; $$;
revoke all on function public.decide_device_login(bigint,boolean,text) from public,anon,authenticated,service_role;
grant execute on function public.decide_device_login(bigint,boolean,text) to authenticated;
