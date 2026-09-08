create table public.local_backup_runs (
 id uuid primary key default gen_random_uuid(), requester_id uuid not null references public.profiles(id),
 reason text not null check(length(btrim(reason)) between 1 and 1000),
 status text not null default 'queued' check(status in ('queued','running','verified','failed')),
 stage text not null default 'Queued', created_at timestamptz not null default now(), finished_at timestamptz,
 archive_bytes bigint, table_count integer, storage_files integer, manifest_sha256 text,
 error_code text, check((status in ('verified','failed'))=(finished_at is not null))
);
create index local_backup_runs_created_idx on public.local_backup_runs(created_at desc);
create index local_backup_runs_requester_idx on public.local_backup_runs(requester_id);
alter table public.local_backup_runs enable row level security;
revoke all on public.local_backup_runs from public,anon,authenticated;
grant select on public.local_backup_runs to authenticated;
create policy backup_runs_read on public.local_backup_runs for select to authenticated using(
 private.is_active_user() and private.can_view_page('backups') and
 (private.is_owner() or exists(select 1 from public.profiles where id=auth.uid() and erp_role='admin')));
create function public.request_local_backup(p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 perform private.require_admin('Backup & Restore','create');
 if not private.can_view_page('backups') then raise exception 'Backup page access required' using errcode='42501'; end if;
 if p_reason is null or length(btrim(p_reason)) not between 1 and 1000 then raise exception 'Backup reason required'; end if;
 perform pg_advisory_xact_lock(211803);
 if exists(select 1 from public.local_backup_runs where status in ('queued','running')) then raise exception 'A local backup is already pending'; end if;
 insert into public.local_backup_runs(requester_id,reason) values(auth.uid(),btrim(p_reason)) returning id into result;
 perform private.audit('Local backup requested','local_backup',result::text,btrim(p_reason));
 return result;
end; $$;
revoke all on function public.request_local_backup(text) from public,anon,authenticated,service_role;
grant execute on function public.request_local_backup(text) to authenticated;
notify pgrst,'reload schema';

create function public.fail_queued_local_backup(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_admin('Backup & Restore','create');
 update public.local_backup_runs set status='failed',stage='Worker not started',error_code='WORKER_START_FAILED',finished_at=now() where id=p_id and requester_id=auth.uid() and status='queued';
end; $$;
revoke all on function public.fail_queued_local_backup(uuid) from public,anon,authenticated,service_role;
grant execute on function public.fail_queued_local_backup(uuid) to authenticated;
