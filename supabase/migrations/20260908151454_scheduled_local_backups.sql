alter table public.local_backup_runs alter column requester_id drop not null;
alter table public.local_backup_runs add column origin text not null default 'manual' check(origin in ('manual','scheduled')),
 add column scheduled_for date;
alter table public.local_backup_runs add constraint backup_origin_identity check(
 (origin='manual' and requester_id is not null and scheduled_for is null) or
 (origin='scheduled' and requester_id is null and requester_session is null and scheduled_for is not null));
create unique index backup_scheduled_once_idx on public.local_backup_runs(scheduled_for)
 where origin='scheduled' and status in ('queued','running','verified');
create table public.local_backup_schedule (
 id boolean primary key default true check(id), enabled boolean not null default true,
 activated_on date not null default (now() at time zone 'Asia/Yangon')::date,
 last_checked_at timestamptz
);
insert into public.local_backup_schedule(id) values(true);
alter table public.local_backup_schedule enable row level security;
revoke all on public.local_backup_schedule from public,anon,authenticated,service_role;
grant select on public.local_backup_schedule to authenticated;
create policy backup_schedule_read on public.local_backup_schedule for select to authenticated using(
 private.is_active_user() and private.can_view_page('backups') and
 exists(select 1 from public.profiles where id=auth.uid() and erp_role in ('owner','admin')));

create function private.notify_backup_failure() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='failed' and old.status<>'failed' then
 insert into public.notifications(recipient_id,notification_type,title,message)
 select p.id,'backup_failure','Local backup failed','Backup '||new.id::text||' did not verify ('||coalesce(new.error_code,'BACKUP_FAILED')||'). Review Backup & Restore.'
 from public.profiles p where p.status='active' and (p.erp_role='owner' or (p.erp_role='admin' and
 (coalesce((p.individual_pages->>'backups')::boolean,false) or coalesce((select can_view from public.user_page_overrides where profile_id=p.id and page_id='backups'),(p.page_access->>'backups')::boolean,false)) and
 (coalesce(p.action_access->'Backup & Restore','[]') ? 'create' or coalesce(p.action_access->'Backup & Restore','[]') ? '*'
 or coalesce(p.action_access->'*','[]') ? '*' or coalesce(p.individual_actions->'Backup & Restore','[]') ? 'create')));
 end if;
 return new;
end; $$;
revoke all on function private.notify_backup_failure() from public,anon,authenticated,service_role;
create trigger local_backup_failure_notification after update of status on public.local_backup_runs
 for each row execute function private.notify_backup_failure();

-- Called only while the Windows exclusive worker lock is held. A heartbeat timeout alone is never proof of abandonment.
create function private.prepare_local_backup_tick(p_now timestamptz default now()) returns jsonb
language plpgsql security definer set search_path='' as $$
declare due_date date; due_at timestamptz; job uuid; abandoned jsonb; config public.local_backup_schedule;
begin
 perform pg_advisory_xact_lock(211803);
 select * into config from public.local_backup_schedule where id;
 update public.local_backup_schedule set last_checked_at=now() where id;
 select coalesce(jsonb_agg(id),'[]') into abandoned from public.local_backup_runs where status='running';
 with interrupted as (
 update public.local_backup_runs set status='failed',stage='Worker interrupted',error_code='WORKER_INTERRUPTED',finished_at=now()
 where status='running' returning *)
 insert into public.audit_events(actor_name,action,entity_type,entity_id,reason,after_data)
 select 'Local backup scheduler','Interrupted backup reconciled','local_backup',id::text,
 'Exclusive local worker lock acquired; previous worker is no longer holding it.',jsonb_build_object('origin',origin,'error_code',error_code) from interrupted;
 select id into job from public.local_backup_runs where status='queued' order by created_at limit 1;
 if job is not null then return jsonb_build_object('job',job,'abandoned',abandoned); end if;
 due_date:=(p_now at time zone 'Asia/Yangon')::date;
 if (p_now at time zone 'Asia/Yangon')::time < time '18:00' then due_date:=due_date-1; end if;
 due_at:=(due_date+time '18:00') at time zone 'Asia/Yangon';
 if not config.enabled or due_date<config.activated_on or not exists(select 1 from public.profiles where erp_role='owner') then
 return jsonb_build_object('job',null,'abandoned',abandoned); end if;
 -- A verified manual backup captured after the deadline also satisfies this day's backup.
 if exists(select 1 from public.local_backup_runs where status='verified' and created_at>=due_at and created_at<=p_now) then
 return jsonb_build_object('job',null,'abandoned',abandoned); end if;
 -- Back off after failures; do not generate a failed archive every minute.
 if exists(select 1 from public.local_backup_runs where origin='scheduled' and status='failed' and finished_at>p_now-interval '30 minutes') then
 return jsonb_build_object('job',null,'abandoned',abandoned); end if;
 insert into public.local_backup_runs(origin,scheduled_for,reason)
 values('scheduled',due_date,'Daily 18:00 Asia/Yangon backup; capture current data when available') returning id into job;
 insert into public.audit_events(actor_name,action,entity_type,entity_id,reason,after_data)
 values('Local backup scheduler','Scheduled local backup requested','local_backup',job::text,'Confirmed daily local backup schedule',jsonb_build_object('scheduled_for',due_date));
 return jsonb_build_object('job',job,'abandoned',abandoned);
end; $$;
revoke all on function private.prepare_local_backup_tick(timestamptz) from public,anon,authenticated,service_role;

create or replace function private.assert_local_backup_authority(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare job public.local_backup_runs; previous_claims text;
begin
 select * into job from public.local_backup_runs where id=p_id and status='running';
 if not found then raise exception 'Backup requester unavailable' using errcode='42501'; end if;
 if job.origin='scheduled' then
 if not exists(select 1 from public.local_backup_schedule where id and enabled) then raise exception 'Schedule disabled' using errcode='42501'; end if;
 return;
 end if;
 if job.requester_session is null then raise exception 'Backup requester unavailable' using errcode='42501'; end if;
 previous_claims:=current_setting('request.jwt.claims',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',job.requester_id,'role','authenticated','session_id',job.requester_session)::text,true);
 perform private.require_admin('Backup & Restore','create');
 if not private.can_view_page('backups') then raise exception 'Backup page access required' using errcode='42501'; end if;
 perform set_config('request.jwt.claims',coalesce(previous_claims,''),true);
end; $$;
notify pgrst,'reload schema';
