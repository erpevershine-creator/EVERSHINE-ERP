-- Every data-access session must have been explicitly admitted by the ERP server.
-- Existing ERP rows are retained; unknown provider sessions are never backfilled.
create or replace function private.is_active_user() returns boolean
language sql stable security definer set search_path='' as $$
select exists(select 1 from public.profiles p
 join auth.sessions s on s.user_id=p.id
 join public.device_sessions d on d.id=s.id and d.profile_id=p.id and d.status='active'
 where p.id=auth.uid() and p.status='active' and not p.recovery_pending
 and p.password_expires_at>now() and s.id::text=auth.jwt()->>'session_id'
 and s.created_at>=p.sessions_valid_after);
$$;

-- Bounded, durable reservations precede provider authentication. Account lockout
-- remains five wrong passwords; transport/service failures never count as wrong.
create table private.login_attempts (
 id uuid primary key default gen_random_uuid(),
 username text not null,
 created_at timestamptz not null default clock_timestamp(),
 consumed_at timestamptz
);
create index login_attempts_window_idx on private.login_attempts(created_at);
create index login_attempts_username_window_idx on private.login_attempts(username,created_at);
revoke all on private.login_attempts from public,anon,authenticated,service_role;

create function public.reserve_login_attempt(p_username text) returns uuid
language plpgsql security definer set search_path='' as $$
declare ticket uuid; t timestamptz:=clock_timestamp(); name text:=lower(btrim(p_username));
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Server only' using errcode='42501'; end if;
 if name is null or length(name) not between 1 and 254 then return null; end if;
 -- One namespace lock makes global and per-identifier limits atomic, including
 -- unknown identifiers. No spoofable forwarded-IP header is used as authority.
 perform pg_advisory_xact_lock(2070910,1);
 delete from private.login_attempts where created_at<t-interval '15 minutes';
 if (select count(*) from private.login_attempts where created_at>t-interval '1 minute')>=120
 or (select count(*) from private.login_attempts where username=name)>=15 then return null; end if;
 insert into private.login_attempts(username,created_at) values(name,t) returning id into ticket;
 return ticket;
end; $$;

create function public.complete_login_attempt(p_ticket uuid,p_outcome text,p_session uuid default null) returns boolean
language plpgsql security definer set search_path='' as $$
declare a private.login_attempts; p public.profiles; s auth.sessions;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Server only' using errcode='42501'; end if;
 if p_outcome is null or p_outcome not in ('success','invalid_credentials','service_failure') then raise exception 'Invalid outcome'; end if;
 select * into a from private.login_attempts where id=p_ticket for update;
 if not found or a.consumed_at is not null or a.created_at<clock_timestamp()-interval '15 minutes' then return false; end if;
 update private.login_attempts set consumed_at=clock_timestamp() where id=a.id;
 if p_outcome='service_failure' then return false; end if;
 select * into p from public.profiles where username=a.username for update;
 if not found or p.status<>'active' or p.recovery_pending then return false; end if;
 if p_outcome='invalid_credentials' then
   update public.profiles set failed_login_attempts=least(5,failed_login_attempts+1),
     status=case when failed_login_attempts>=4 then 'locked' else status end,
     sessions_valid_after=case when failed_login_attempts>=4 then clock_timestamp() else sessions_valid_after end where id=p.id;
   insert into public.audit_events(actor_id,actor_name,action,entity_type,entity_id,reason,after_data)
     values(p.id,p.employee_name,'Password sign-in failed','profile',p.id::text,'Invalid ERP password',jsonb_build_object('failedAttempts',least(5,p.failed_login_attempts+1)));
   if p.failed_login_attempts>=4 then
     update public.device_sessions set status='logged_out',ended_at=clock_timestamp(),ended_reason='Five failed password attempts'
       where profile_id=p.id and status in ('active','pending');
     insert into public.audit_events(actor_id,actor_name,action,entity_type,entity_id,reason)
       values(p.id,p.employee_name,'Account locked','profile',p.id::text,'Five failed password attempts');
     insert into public.notifications(recipient_id,notification_type,title,message)
       select id,'security','Account locked',p.employee_name||' requires account review.' from public.profiles
       where status='active' and (erp_role='owner' or (erp_role='admin' and
         private.merge_permission_actions(action_access,individual_actions)->'Account Management' ?| array['unlock','*']));
   end if;
   return false;
 end if;
 select * into s from auth.sessions where id=p_session and user_id=p.id;
 if not found or s.created_at<a.created_at or s.created_at<p.sessions_valid_after or p.password_expires_at<=now()
   or exists(select 1 from public.device_sessions where id=p_session) then return false; end if;
 insert into public.device_sessions(id,profile_id,device_fingerprint_hash,device_label,started_at,last_seen_at)
   values(s.id,p.id,extensions.digest(s.id::text,'sha256'),'ERP sign-in',s.created_at,clock_timestamp());
 update public.profiles set failed_login_attempts=0 where id=p.id;
 return true;
end; $$;

-- Remove the legacy externally callable path that bypassed reservation/replay checks.
revoke all on function public.record_login_attempt(text,boolean,uuid) from service_role;
revoke all on function public.reserve_login_attempt(text),public.complete_login_attempt(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.reserve_login_attempt(text),public.complete_login_attempt(uuid,text,uuid) to service_role;
notify pgrst,'reload schema';
