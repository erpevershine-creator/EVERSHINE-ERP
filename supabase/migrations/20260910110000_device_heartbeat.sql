-- Refresh the admitted device's activity only from its current Auth session.
-- A seven-day gap closes that device and requires the normal approval flow.
create function public.touch_my_device() returns text
language plpgsql security definer set search_path='' as $$
declare sid uuid; d public.device_sessions; p public.profiles;
begin
 if auth.uid() is null then return 'signed_out'; end if;
 sid:=nullif(auth.jwt()->>'session_id','')::uuid;
 select * into d from public.device_sessions where id=sid and profile_id=auth.uid() for update;
 if not found or d.status<>'active' then return 'not_admitted'; end if;
 select * into p from public.profiles where id=auth.uid() for update;
 if p.status<>'active' or p.recovery_pending or p.password_change_pending then return 'blocked'; end if;
 if d.last_seen_at<clock_timestamp()-interval '7 days' then
   update public.device_sessions set status='logged_out',ended_at=clock_timestamp(),ended_reason='Idle seven-day reapproval' where id=sid;
   update public.profiles set requires_login_approval=true,version=version+1 where id=p.id;
   insert into public.audit_events(actor_id,actor_name,action,entity_type,entity_id,reason,after_data)
     values(p.id,p.employee_name,'Device idle reapproval required','device_session',sid::text,'Seven-day inactivity',jsonb_build_object('status','logged_out'));
   return 'idle_reapproval';
 end if;
 update public.device_sessions set last_seen_at=clock_timestamp() where id=sid;
 return 'active';
end; $$;
revoke all on function public.touch_my_device() from public,anon,service_role;
grant execute on function public.touch_my_device() to authenticated;
