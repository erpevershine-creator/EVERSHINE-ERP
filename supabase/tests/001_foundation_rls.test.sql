begin;
select plan(34);

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'positions', 'positions table exists');
select has_table('public', 'position_page_permissions', 'page permissions table exists');
select has_table('public', 'approval_requests', 'approval requests table exists');
select has_table('public', 'audit_events', 'audit table exists');
select has_table('public', 'notifications', 'notifications table exists');
select has_table('public', 'device_sessions', 'device sessions table exists');
select has_table('private', 'owner_recovery_codes', 'recovery hashes are private');

select ok((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), 'profiles RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.approval_requests'::regclass), 'approvals RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.audit_events'::regclass), 'audit RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.notifications'::regclass), 'notifications RLS enabled');

select ok(not has_table_privilege('anon', 'public.profiles', 'select'), 'anon cannot read profiles');
select ok(not has_table_privilege('anon', 'public.profiles', 'insert'), 'anon cannot create profiles');
select ok(has_table_privilege('authenticated', 'public.profiles', 'select'), 'authenticated may select through RLS');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'insert'), 'authenticated cannot directly create profiles');
select ok(not has_table_privilege('authenticated', 'public.audit_events', 'update'), 'audit cannot be updated by clients');
select ok(not has_table_privilege('authenticated', 'public.audit_events', 'delete'), 'audit cannot be deleted by clients');
select has_trigger('public', 'audit_events', 'audit_events_append_only', 'audit has an append-only database trigger');
select ok(not has_table_privilege('authenticated', 'private.owner_recovery_codes', 'select'), 'authenticated clients cannot read recovery hashes');
select ok(has_schema_privilege('service_role', 'private', 'usage'), 'service role may enter the private schema');
select ok(has_table_privilege('service_role', 'private.owner_recovery_codes', 'select'), 'service role may read recovery hashes');
select ok(has_table_privilege('service_role', 'private.owner_recovery_codes', 'insert'), 'service role may create recovery hashes');
select ok(has_table_privilege('service_role', 'private.owner_recovery_codes', 'update'), 'service role may invalidate recovery hashes');
select ok(not has_table_privilege('service_role', 'private.owner_recovery_codes', 'delete'), 'service role cannot directly delete recovery hashes');

select results_eq(
  $$ select count(*)::bigint from public.profiles where erp_role = 'owner' and status <> 'inactive' $$,
  array[0::bigint],
  'migration never invents an Owner account'
);
select results_eq(
  $$ select count(*)::bigint from public.locations $$,
  array[3::bigint],
  'confirmed office and warehouses are seeded'
);
select results_eq(
  $$ select count(*)::bigint from public.pages $$,
  array[9::bigint],
  'foundation pages are seeded'
);
select results_eq(
  $$ select count(*)::bigint from public.position_page_permissions $$,
  array[27::bigint],
  'each initial position has an explicit page row'
);
select results_eq(
  $$ select count(*)::bigint from public.position_page_permissions ppp join public.positions p on p.id = ppp.position_id where p.code = 'owner' and ppp.can_view $$,
  array[9::bigint],
  'Owner position sees every foundation page'
);
select results_eq(
  $$ select count(*)::bigint from storage.buckets where id = 'profile-photos' and name = 'profile-photos' and not public $$,
  array[1::bigint],
  'profile photos use a private bucket'
);
select results_eq(
  $$ select file_size_limit from storage.buckets where id = 'profile-photos' $$,
  array[2097152::bigint],
  'profile photos are limited to two MiB'
);
select is(
  (select allowed_mime_types from storage.buckets where id = 'profile-photos'),
  array['image/jpeg', 'image/png', 'image/webp']::text[],
  'profile photos allow only expected image types'
);

select col_is_pk('public', 'profiles', 'id', 'profile identity is the Auth user primary key');

select finish();
rollback;
