-- Complete initial Owner profile/recovery/audit records in one database transaction.
-- Auth user creation and private photo upload remain server-only operations.
create or replace function public.provision_initial_owner(
  p_owner_id uuid,
  p_employee_name text,
  p_department text,
  p_username text,
  p_contact text,
  p_avatar_path text,
  p_recovery_code_hash_hex text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_position_id bigint;
  normalized_username text := lower(btrim(p_username));
begin
  if (select auth.role()) <> 'service_role' then
    raise exception using errcode = '42501', message = 'Service role required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('evershine.initial-owner', 0));

  if exists (
    select 1 from public.profiles
    where erp_role = 'owner' and status <> 'inactive'
  ) then
    raise exception using errcode = '23505', message = 'Owner already provisioned';
  end if;

  if btrim(coalesce(p_employee_name, '')) = ''
    or btrim(coalesce(p_department, '')) = ''
    or btrim(coalesce(p_contact, '')) = '' then
    raise exception using errcode = '22023', message = 'Owner details are required';
  end if;

  if normalized_username !~ '^[a-z0-9][a-z0-9._%+\-]*@gmail\.com$' then
    raise exception using errcode = '22023', message = 'A company-approved Gmail username is required';
  end if;

  if p_avatar_path !~ ('^' || p_owner_id::text || '/[^/]+$') then
    raise exception using errcode = '22023', message = 'Invalid private photo path';
  end if;

  if p_recovery_code_hash_hex !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Invalid recovery hash';
  end if;

  if not exists (
    select 1 from auth.users u
    where u.id = p_owner_id and lower(u.email) = normalized_username
  ) then
    raise exception using errcode = '23503', message = 'Matching Auth user is required';
  end if;

  select id into owner_position_id
  from public.positions
  where code = 'owner' and is_owner_position
  limit 1;

  if owner_position_id is null then
    raise exception using errcode = '23503', message = 'Owner position is unavailable';
  end if;

  insert into public.profiles (
    id,
    employee_name,
    position_id,
    department,
    erp_role,
    username,
    contact,
    avatar_path,
    status
  ) values (
    p_owner_id,
    btrim(p_employee_name),
    owner_position_id,
    btrim(p_department),
    'owner',
    normalized_username,
    btrim(p_contact),
    p_avatar_path,
    'active'
  );

  insert into private.owner_recovery_codes (owner_id, code_hash, version)
  values (p_owner_id, decode(p_recovery_code_hash_hex, 'hex'), 1);

  insert into public.audit_events (
    actor_id,
    actor_name,
    action,
    entity_type,
    entity_id,
    after_data,
    reason
  ) values (
    p_owner_id,
    btrim(p_employee_name),
    'owner.setup.completed',
    'profile',
    p_owner_id::text,
    jsonb_build_object(
      'employee_name', btrim(p_employee_name),
      'department', btrim(p_department),
      'erp_role', 'owner',
      'position', 'Owner',
      'username', normalized_username,
      'contact', btrim(p_contact),
      'status', 'active'
    ),
    'Initial Owner setup confirmed by Owner'
  );

  return p_owner_id;
end;
$$;

revoke all on function public.provision_initial_owner(uuid, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.provision_initial_owner(uuid, text, text, text, text, text, text)
  to service_role;

comment on function public.provision_initial_owner(uuid, text, text, text, text, text, text)
  is 'Server-only, one-time transaction for initial EVERSHINE Owner profile provisioning.';
