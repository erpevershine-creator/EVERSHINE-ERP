alter table public.local_backup_runs
 add column archive_state text not null default 'present' check(archive_state in ('present','pruning','pruned')),
 add column prune_replacement_id uuid references public.local_backup_runs(id),
 add column prune_started_at timestamptz,
 add column prune_checked_at timestamptz,
 add column prune_error_code text,
 add column pruned_at timestamptz,
 add constraint only_scheduled_archives_pruned check(archive_state='present' or (origin='scheduled' and status='verified' and prune_replacement_id is not null and prune_replacement_id<>id)),
 add constraint pruned_timestamp_matches check((archive_state='pruned')=(pruned_at is not null));
create index backup_prune_replacement_idx on public.local_backup_runs(prune_replacement_id);
notify pgrst,'reload schema';
