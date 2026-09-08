-- Explicit logout remains effective even if provider session cleanup is delayed.
create or replace function private.is_active_user() returns boolean
language sql stable security definer set search_path='' as $$
select exists(select 1 from public.profiles p join auth.sessions s on s.user_id=p.id
 where p.id=auth.uid() and p.status='active' and not p.recovery_pending
 and p.password_expires_at>now() and s.id::text=auth.jwt()->>'session_id'
 and s.created_at>=p.sessions_valid_after
 and not exists(select 1 from public.device_sessions d where d.id=s.id and d.status<>'active'));
$$;
-- Preserve currently known sessions as history; no synthetic device identity is inferred.
insert into public.device_sessions(id,profile_id,device_fingerprint_hash,device_label,started_at,last_seen_at)
select s.id,p.id,extensions.digest(s.id::text,'sha256'),'Existing ERP session',s.created_at,coalesce(s.updated_at,s.created_at)
from auth.sessions s join public.profiles p on p.id=s.user_id
where p.status='active' on conflict(id) do nothing;
notify pgrst,'reload schema';
