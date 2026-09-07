-- EVERSHINE ERP 2.1: identity, authorization, approval and audit foundation.
-- No real user or credential is seeded by this migration.

create extension if not exists citext with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon;

create table public.app_settings (
  id smallint primary key default 1 check (id = 1),
  company_name text not null check (btrim(company_name) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.locations (
  code text primary key check (code ~ '^[a-z][a-z0-9-]*$'),
  name text not null unique check (btrim(name) <> ''),
  location_type text not null check (location_type in ('office', 'warehouse')),
  is_active boolean not null default true,
  display_order smallint not null check (display_order > 0),
  created_at timestamptz not null default now()
);

create table public.positions (
  id bigint generated always as identity primary key,
  code text not null unique check (code ~ '^[a-z][a-z0-9-]*$'),
  name text not null unique check (btrim(name) <> ''),
  scope_description text not null default '',
  is_owner_position boolean not null default false,
  is_active boolean not null default true,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index positions_single_owner_idx
  on public.positions (is_owner_position)
  where is_owner_position;

create table public.pages (
  id text primary key check (id ~ '^[a-z][a-z0-9-]*$'),
  label text not null unique check (btrim(label) <> ''),
  group_name text not null check (group_name in ('workspace', 'administration', 'system')),
  display_order smallint not null unique check (display_order > 0),
  is_active boolean not null default true
);

create table public.position_page_permissions (
  position_id bigint not null references public.positions (id) on delete restrict,
  page_id text not null references public.pages (id) on delete restrict,
  can_view boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (position_id, page_id)
);

create index position_page_permissions_page_id_idx
  on public.position_page_permissions (page_id);

create table public.position_action_permissions (
  position_id bigint not null references public.positions (id) on delete restrict,
  module text not null check (btrim(module) <> ''),
  action text not null check (btrim(action) <> ''),
  allowed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (position_id, module, action)
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete restrict,
  employee_name text not null check (btrim(employee_name) <> ''),
  position_id bigint not null references public.positions (id) on delete restrict,
  department text not null check (btrim(department) <> ''),
  erp_role text not null check (erp_role in ('owner', 'admin', 'employee')),
  username extensions.citext not null unique,
  contact text not null check (btrim(contact) <> ''),
  avatar_path text not null check (btrim(avatar_path) <> ''),
  status text not null default 'active'
    check (status in ('active', 'locked', 'disabled', 'inactive', 'pending_handover')),
  failed_login_attempts smallint not null default 0
    check (failed_login_attempts between 0 and 5),
  password_changed_at timestamptz not null default now(),
  password_expires_at timestamptz not null default (now() + interval '6 months'),
  requires_login_approval boolean not null default false,
  created_by uuid references public.profiles (id) on delete restrict,
  disabled_at timestamptz,
  disabled_by uuid references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  check (lower(username::text) ~ '^[a-z0-9][a-z0-9._%+\-]*@gmail\.com$'),
  check ((status = 'disabled') = (disabled_at is not null))
);

create unique index profiles_single_current_owner_idx
  on public.profiles (erp_role)
  where erp_role = 'owner' and status <> 'inactive';
create index profiles_position_id_idx on public.profiles (position_id);
create index profiles_created_by_idx on public.profiles (created_by) where created_by is not null;
create index profiles_disabled_by_idx on public.profiles (disabled_by) where disabled_by is not null;
create index profiles_active_username_idx on public.profiles (username) where status = 'active';

create table public.approval_requests (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  request_type text not null check (btrim(request_type) <> ''),
  module text not null check (btrim(module) <> ''),
  requester_id uuid not null references public.profiles (id) on delete restrict,
  target_type text not null check (btrim(target_type) <> ''),
  target_id text not null check (btrim(target_id) <> ''),
  current_data jsonb not null default '{}'::jsonb check (jsonb_typeof(current_data) = 'object'),
  proposed_data jsonb not null default '{}'::jsonb check (jsonb_typeof(proposed_data) = 'object'),
  reason text not null check (btrim(reason) <> ''),
  status text not null default 'draft'
    check (status in ('draft', 'pending', 'approved', 'rejected', 'revised', 'cancelled', 'expired')),
  deadline_at timestamptz,
  decision_reason text,
  decided_by uuid references public.profiles (id) on delete restrict,
  decided_at timestamptz,
  source_request_id bigint references public.approval_requests (id) on delete restrict,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status in ('approved', 'rejected', 'revised')) = (decided_by is not null and decided_at is not null))
);

create index approval_requests_requester_created_idx
  on public.approval_requests (requester_id, created_at desc);
create index approval_requests_module_status_created_idx
  on public.approval_requests (module, status, created_at);
create index approval_requests_pending_deadline_idx
  on public.approval_requests (deadline_at)
  where status = 'pending' and deadline_at is not null;
create index approval_requests_decided_by_idx
  on public.approval_requests (decided_by) where decided_by is not null;
create index approval_requests_source_request_id_idx
  on public.approval_requests (source_request_id) where source_request_id is not null;

create table public.position_permission_changes (
  request_id bigint primary key references public.approval_requests (id) on delete restrict,
  position_id bigint not null references public.positions (id) on delete restrict,
  expected_position_version integer not null check (expected_position_version > 0),
  before_pages jsonb not null check (jsonb_typeof(before_pages) = 'object'),
  after_pages jsonb not null check (jsonb_typeof(after_pages) = 'object')
);

create index position_permission_changes_position_id_idx
  on public.position_permission_changes (position_id);

create table public.approval_request_accounts (
  request_id bigint not null references public.approval_requests (id) on delete restrict,
  profile_id uuid not null references public.profiles (id) on delete restrict,
  expected_profile_version integer not null check (expected_profile_version > 0),
  before_pages jsonb not null check (jsonb_typeof(before_pages) = 'object'),
  after_pages jsonb not null check (jsonb_typeof(after_pages) = 'object'),
  primary key (request_id, profile_id)
);

create index approval_request_accounts_profile_id_idx
  on public.approval_request_accounts (profile_id);

create table public.user_page_overrides (
  profile_id uuid not null references public.profiles (id) on delete restrict,
  page_id text not null references public.pages (id) on delete restrict,
  can_view boolean not null,
  reason text not null check (btrim(reason) <> ''),
  approved_request_id bigint not null references public.approval_requests (id) on delete restrict,
  updated_at timestamptz not null default now(),
  primary key (profile_id, page_id)
);

create index user_page_overrides_page_id_idx on public.user_page_overrides (page_id);
create index user_page_overrides_approved_request_id_idx on public.user_page_overrides (approved_request_id);

create table public.audit_events (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  actor_id uuid references public.profiles (id) on delete restrict,
  actor_name text not null check (btrim(actor_name) <> ''),
  action text not null check (btrim(action) <> ''),
  entity_type text not null check (btrim(entity_type) <> ''),
  entity_id text not null check (btrim(entity_id) <> ''),
  before_data jsonb check (before_data is null or jsonb_typeof(before_data) = 'object'),
  after_data jsonb check (after_data is null or jsonb_typeof(after_data) = 'object'),
  reason text not null check (btrim(reason) <> ''),
  approval_request_id bigint references public.approval_requests (id) on delete restrict,
  occurred_at timestamptz not null default now()
);

create index audit_events_actor_occurred_idx on public.audit_events (actor_id, occurred_at desc);
create index audit_events_entity_occurred_idx on public.audit_events (entity_type, entity_id, occurred_at desc);
create index audit_events_approval_request_id_idx
  on public.audit_events (approval_request_id) where approval_request_id is not null;

create table public.notifications (
  id bigint generated always as identity primary key,
  recipient_id uuid not null references public.profiles (id) on delete restrict,
  notification_type text not null check (btrim(notification_type) <> ''),
  title text not null check (btrim(title) <> ''),
  message text not null check (btrim(message) <> ''),
  approval_request_id bigint references public.approval_requests (id) on delete restrict,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_recipient_unread_idx
  on public.notifications (recipient_id, created_at desc) where read_at is null;
create index notifications_approval_request_id_idx
  on public.notifications (approval_request_id) where approval_request_id is not null;

create table public.device_sessions (
  id uuid primary key,
  profile_id uuid not null references public.profiles (id) on delete restrict,
  device_fingerprint_hash bytea not null,
  device_label text not null check (btrim(device_label) <> ''),
  status text not null default 'active'
    check (status in ('pending', 'active', 'rejected', 'expired', 'logged_out')),
  approval_request_id bigint references public.approval_requests (id) on delete restrict,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ended_at timestamptz,
  ended_reason text,
  check (
    (status in ('rejected', 'expired', 'logged_out')) =
    (ended_at is not null and btrim(coalesce(ended_reason, '')) <> '')
  )
);

create unique index device_sessions_active_device_idx
  on public.device_sessions (profile_id, device_fingerprint_hash)
  where status = 'active';
create index device_sessions_profile_active_idx
  on public.device_sessions (profile_id, started_at) where status = 'active';
create index device_sessions_approval_request_id_idx
  on public.device_sessions (approval_request_id) where approval_request_id is not null;

create table private.owner_recovery_codes (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.profiles (id) on delete restrict,
  code_hash bytea not null,
  version integer not null check (version > 0),
  created_at timestamptz not null default now(),
  used_at timestamptz,
  invalidated_at timestamptz
);

create unique index owner_recovery_codes_current_idx
  on private.owner_recovery_codes (owner_id)
  where used_at is null and invalidated_at is null;

-- Profile photos remain private and are written only by trusted server workflows.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'profile-photos',
  'profile-photos',
  false,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.reject_audit_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'audit_events are append-only';
end;
$$;

create trigger app_settings_set_updated_at before update on public.app_settings
for each row execute function private.set_updated_at();
create trigger positions_set_updated_at before update on public.positions
for each row execute function private.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function private.set_updated_at();
create trigger approval_requests_set_updated_at before update on public.approval_requests
for each row execute function private.set_updated_at();
create trigger audit_events_append_only before update or delete on public.audit_events
for each row execute function private.reject_audit_mutation();

create or replace function private.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.status = 'active'
  );
$$;

create or replace function private.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.status = 'active' and p.erp_role = 'owner'
  );
$$;

create or replace function private.has_action(requested_module text, requested_action text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.status = 'active'
      and (
        p.erp_role = 'owner'
        or exists (
          select 1 from public.position_action_permissions pap
          where pap.position_id = p.position_id
            and pap.allowed
            and pap.module in (requested_module, '*')
            and pap.action in (requested_action, '*')
        )
      )
  );
$$;

create or replace function private.can_view_page(requested_page text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.status = 'active'
      and (
        p.erp_role = 'owner'
        or coalesce(
          (select upo.can_view from public.user_page_overrides upo
           where upo.profile_id = p.id and upo.page_id = requested_page),
          (select ppp.can_view from public.position_page_permissions ppp
           where ppp.position_id = p.position_id and ppp.page_id = requested_page),
          false
        )
      )
  );
$$;

create or replace function private.can_view_request(request_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.approval_requests ar
    where ar.id = request_id
      and (
        ar.requester_id = (select auth.uid())
        or (select private.is_owner())
        or (select private.has_action(ar.module, 'approve'))
      )
  );
$$;

revoke all on all functions in schema private from public, anon, authenticated, service_role;
revoke all on all tables in schema private from public, anon, authenticated;
revoke all on all sequences in schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;
grant execute on function private.is_active_user() to authenticated;
grant execute on function private.is_owner() to authenticated;
grant execute on function private.has_action(text, text) to authenticated;
grant execute on function private.can_view_page(text) to authenticated;
grant execute on function private.can_view_request(bigint) to authenticated;
grant select, insert, update on private.owner_recovery_codes to service_role;
grant usage, select on sequence private.owner_recovery_codes_id_seq to service_role;

alter table public.app_settings enable row level security;
alter table public.locations enable row level security;
alter table public.positions enable row level security;
alter table public.pages enable row level security;
alter table public.position_page_permissions enable row level security;
alter table public.position_action_permissions enable row level security;
alter table public.profiles enable row level security;
alter table public.approval_requests enable row level security;
alter table public.position_permission_changes enable row level security;
alter table public.approval_request_accounts enable row level security;
alter table public.user_page_overrides enable row level security;
alter table public.audit_events enable row level security;
alter table public.notifications enable row level security;
alter table public.device_sessions enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant select on public.app_settings, public.locations, public.pages to authenticated;
grant select on public.positions, public.position_page_permissions,
  public.position_action_permissions, public.profiles to authenticated;
grant select on public.approval_requests, public.position_permission_changes,
  public.approval_request_accounts, public.user_page_overrides to authenticated;
grant select on public.audit_events, public.notifications, public.device_sessions to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

create policy app_settings_read on public.app_settings for select to authenticated
  using ((select private.is_active_user()));
create policy locations_read on public.locations for select to authenticated
  using ((select private.is_active_user()));
create policy pages_read on public.pages for select to authenticated
  using ((select private.is_active_user()));
create policy positions_read on public.positions for select to authenticated
  using (
    (select private.is_owner())
    or id = (select p.position_id from public.profiles p where p.id = (select auth.uid()))
    or (select private.has_action('Positions & Permissions', 'view'))
  );
create policy position_pages_read on public.position_page_permissions for select to authenticated
  using (
    (select private.is_owner())
    or position_id = (select p.position_id from public.profiles p where p.id = (select auth.uid()))
    or (select private.has_action('Positions & Permissions', 'view'))
  );
create policy position_actions_read on public.position_action_permissions for select to authenticated
  using (
    (select private.is_owner())
    or position_id = (select p.position_id from public.profiles p where p.id = (select auth.uid()))
    or (select private.has_action('Positions & Permissions', 'view'))
  );
create policy profiles_read on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or (select private.is_owner())
    or (select private.has_action('Account Management', 'view'))
  );
create policy approval_requests_read on public.approval_requests for select to authenticated
  using (
    requester_id = (select auth.uid())
    or (select private.is_owner())
    or (select private.has_action(module, 'approve'))
  );
create policy permission_changes_read on public.position_permission_changes for select to authenticated
  using ((select private.can_view_request(request_id)));
create policy approval_accounts_read on public.approval_request_accounts for select to authenticated
  using ((select private.can_view_request(request_id)));
create policy user_page_overrides_read on public.user_page_overrides for select to authenticated
  using (
    profile_id = (select auth.uid())
    or (select private.is_owner())
    or (select private.has_action('Positions & Permissions', 'view'))
  );
create policy audit_events_read on public.audit_events for select to authenticated
  using (
    actor_id = (select auth.uid())
    or (select private.is_owner())
    or (approval_request_id is not null and (select private.can_view_request(approval_request_id)))
  );
create policy notifications_read on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid()));
create policy notifications_mark_read on public.notifications for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));
create policy device_sessions_read on public.device_sessions for select to authenticated
  using (
    profile_id = (select auth.uid())
    or (select private.is_owner())
    or (select private.has_action('Account Management', 'view'))
  );

insert into public.app_settings (id, company_name) values (1, 'EVERSHINE');
insert into public.locations (code, name, location_type, display_order) values
  ('head-office', 'Head Office', 'office', 1),
  ('operations-warehouse', 'Operations Warehouse', 'warehouse', 2),
  ('reserve-warehouse', 'Reserve Warehouse', 'warehouse', 3);

insert into public.pages (id, label, group_name, display_order) values
  ('dashboard', 'Workspace', 'workspace', 1),
  ('approvals', 'Approval Center', 'workspace', 2),
  ('notifications', 'Notifications', 'workspace', 3),
  ('accounts', 'Account Management', 'administration', 4),
  ('permissions', 'Positions & Permissions', 'administration', 5),
  ('audit', 'Audit & History', 'administration', 6),
  ('settings', 'Settings', 'system', 7),
  ('backups', 'Backup & Restore', 'system', 8),
  ('usage', 'Usage Monitor', 'system', 9);

insert into public.positions (code, name, scope_description, is_owner_position) values
  ('owner', 'Owner', 'Company', true),
  ('account-administrator', 'Account Administrator', 'Account Management', false),
  ('operations-staff', 'Operations Staff', 'Assigned records', false);

insert into public.position_page_permissions (position_id, page_id, can_view)
select p.id, pg.id,
  case
    when p.code = 'owner' then true
    when p.code = 'account-administrator' then pg.id in ('dashboard', 'approvals', 'notifications', 'accounts', 'audit')
    else pg.id in ('dashboard', 'approvals', 'notifications', 'audit')
  end
from public.positions p cross join public.pages pg;

insert into public.position_action_permissions (position_id, module, action, allowed)
select p.id, permission.module, permission.action, true
from public.positions p
cross join (values ('*', '*')) as permission(module, action)
where p.code = 'owner';

insert into public.position_action_permissions (position_id, module, action, allowed)
select p.id, permission.module, permission.action, true
from public.positions p
cross join (values
  ('Account Management', 'view'),
  ('Account Management', 'create'),
  ('Account Management', 'change_password'),
  ('Account Management', 'unlock'),
  ('Account Management', 'approve_device'),
  ('Account Management', 'disable'),
  ('Account Management', 'reenable')
) as permission(module, action)
where p.code = 'account-administrator';
