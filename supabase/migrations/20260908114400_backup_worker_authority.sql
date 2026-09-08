-- Persist only the session identifier, never a JWT or credential.
alter table public.local_backup_runs add column requester_session uuid;
create or replace function public.request_local_backup(p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 perform private.require_admin('Backup & Restore','create');
 if not private.can_view_page('backups') then raise exception 'Backup page access required' using errcode='42501'; end if;
 if p_reason is null or length(btrim(p_reason)) not between 1 and 1000 then raise exception 'Backup reason required'; end if;
 perform pg_advisory_xact_lock(211803);
 if exists(select 1 from public.local_backup_runs where status in ('queued','running')) then raise exception 'A local backup is already pending'; end if;
 insert into public.local_backup_runs(requester_id,reason,requester_session) values(auth.uid(),btrim(p_reason),(auth.jwt()->>'session_id')::uuid) returning id into result;
 perform private.audit('Local backup requested','local_backup',result::text,btrim(p_reason));
 return result;
end; $$;

-- Only the local OS worker's database operator can invoke this internal check.
create function private.assert_local_backup_authority(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare job public.local_backup_runs; previous_claims text;
begin
 select * into job from public.local_backup_runs where id=p_id and status='running';
 if not found or job.requester_session is null then raise exception 'Backup requester unavailable' using errcode='42501'; end if;
 previous_claims:=current_setting('request.jwt.claims',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',job.requester_id,'role','authenticated','session_id',job.requester_session)::text,true);
 perform private.require_admin('Backup & Restore','create');
 if not private.can_view_page('backups') then raise exception 'Backup page access required' using errcode='42501'; end if;
 perform set_config('request.jwt.claims',coalesce(previous_claims,''),true);
end; $$;
revoke all on function private.assert_local_backup_authority(uuid) from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
