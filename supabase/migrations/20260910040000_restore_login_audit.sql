-- Preserve the password-failure audit trail while retaining the pending-device fix.
create or replace function public.complete_login_attempt(p_ticket uuid,p_outcome text,p_session uuid default null) returns text
language plpgsql security definer set search_path='' as $$
declare a private.login_attempts; p public.profiles; s auth.sessions;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Server only' using errcode='42501'; end if;
 if p_outcome is null or p_outcome not in ('success','invalid_credentials','service_failure') then raise exception 'Invalid outcome'; end if;
 select * into a from private.login_attempts where id=p_ticket for update;
 if not found or a.consumed_at is not null or a.created_at<clock_timestamp()-interval '15 minutes' then return 'rejected'; end if;
 update private.login_attempts set consumed_at=clock_timestamp() where id=a.id;
 if p_outcome='service_failure' then return 'service_failure'; end if;
 select * into p from public.profiles where username=a.username for update;
 if not found or p.status<>'active' or p.recovery_pending then return 'rejected'; end if;
 if p_outcome='invalid_credentials' then
   update public.profiles set failed_login_attempts=least(5,failed_login_attempts+1),status=case when failed_login_attempts>=4 then 'locked' else status end,sessions_valid_after=case when failed_login_attempts>=4 then clock_timestamp() else sessions_valid_after end where id=p.id;
   insert into public.audit_events(actor_id,actor_name,action,entity_type,entity_id,reason,after_data) values(p.id,p.employee_name,'Password sign-in failed','profile',p.id::text,'Invalid ERP password',jsonb_build_object('failedAttempts',least(5,p.failed_login_attempts+1)));
   if p.failed_login_attempts>=4 then
     update public.device_sessions set status='logged_out',ended_at=clock_timestamp(),ended_reason='Five failed password attempts' where profile_id=p.id and status in ('active','pending');
     insert into public.audit_events(actor_id,actor_name,action,entity_type,entity_id,reason) values(p.id,p.employee_name,'Account locked','profile',p.id::text,'Five failed password attempts');
     insert into public.notifications(recipient_id,notification_type,title,message) select id,'security','Account locked',p.employee_name||' requires account review.' from public.profiles where status='active' and (erp_role='owner' or (erp_role='admin' and private.merge_permission_actions(action_access,individual_actions)->'Account Management' ?| array['unlock','*']));
   end if;
   return 'invalid_credentials';
 end if;
 select * into s from auth.sessions where id=p_session and user_id=p.id;
 if not found or s.created_at<a.created_at or s.created_at<p.sessions_valid_after or p.password_expires_at<=now() or exists(select 1 from public.device_sessions where id=p_session) then return 'rejected'; end if;
 if (select count(*) from public.device_sessions where profile_id=p.id and status='active') >= 2 then
   if exists(select 1 from public.approval_requests where request_type='device_login' and requester_id=p.id and status='pending' and proposed_data->>'sessionId'=p_session::text) then return 'pending'; end if;
   insert into public.approval_requests(request_type,module,requester_id,target_type,target_id,current_data,proposed_data,reason,status,deadline_at) values('device_login','Account Management',p.id,'profile',p.id::text,jsonb_build_object('activeDeviceCount',2),jsonb_build_object('sessionId',p_session::text,'deviceLabel','ERP sign-in','startedAt',s.created_at),'Third-device sign-in approval required','pending',clock_timestamp()+interval '1 day');
   insert into public.notifications(recipient_id,notification_type,title,message) select q.id,'approval','Third-device sign-in approval required',p.employee_name||' is requesting a third device.' from public.profiles q where q.status='active' and (q.erp_role='owner' or (q.erp_role='admin' and private.merge_permission_actions(q.action_access,q.individual_actions)->'Account Management' ?| array['approve_device','approve','*']));
   return 'pending';
 end if;
 insert into public.device_sessions(id,profile_id,device_fingerprint_hash,device_label,started_at,last_seen_at) values(s.id,p.id,extensions.digest(s.id::text,'sha256'),'ERP sign-in',s.created_at,clock_timestamp());
 update public.profiles set failed_login_attempts=0 where id=p.id;
 return 'admitted';
end; $$;
revoke all on function public.complete_login_attempt(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.complete_login_attempt(uuid,text,uuid) to service_role;
notify pgrst,'reload schema';
