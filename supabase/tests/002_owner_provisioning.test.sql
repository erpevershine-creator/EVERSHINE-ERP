begin;
select plan(13);

select has_function(
  'public',
  'provision_initial_owner',
  array['uuid', 'text', 'text', 'text', 'text', 'text', 'text'],
  'initial Owner provisioning function exists'
);

select ok(
  (select prosecdef from pg_proc where oid = 'public.provision_initial_owner(uuid,text,text,text,text,text,text)'::regprocedure),
  'Owner provisioning is a security-definer transaction'
);

select ok(
  (select array_to_string(proconfig, ',') like '%search_path=%'
   from pg_proc where oid = 'public.provision_initial_owner(uuid,text,text,text,text,text,text)'::regprocedure),
  'Owner provisioning fixes its search path'
);

select ok(
  not has_function_privilege('anon', 'public.provision_initial_owner(uuid,text,text,text,text,text,text)', 'execute'),
  'anonymous clients cannot provision Owner'
);

select ok(
  not has_function_privilege('authenticated', 'public.provision_initial_owner(uuid,text,text,text,text,text,text)', 'execute'),
  'authenticated clients cannot provision Owner'
);

select ok(
  has_function_privilege('service_role', 'public.provision_initial_owner(uuid,text,text,text,text,text,text)', 'execute'),
  'only the trusted server role may call Owner provisioning'
);

select results_eq(
  $$ select count(*)::bigint from public.profiles where erp_role = 'owner' and status <> 'inactive' $$,
  array[0::bigint],
  'the migration does not invent an Owner account'
);

set local request.jwt.claim.role = 'service_role';

insert into auth.users (id, email, role, aud, is_sso_user, is_anonymous)
values (
  '11111111-1111-4111-8111-111111111111',
  'owner.setup.test@gmail.com',
  'authenticated',
  'authenticated',
  false,
  false
);

select is(
  public.provision_initial_owner(
    '11111111-1111-4111-8111-111111111111',
    'Owner Setup Test',
    'Management',
    'owner.setup.test@gmail.com',
    '0912345678',
    '11111111-1111-4111-8111-111111111111/profile.png',
    repeat('a', 64)
  ),
  '11111111-1111-4111-8111-111111111111'::uuid,
  'trusted server can complete the Owner transaction'
);

select results_eq(
  $$ select count(*)::bigint from public.profiles where erp_role = 'owner' and status = 'active' $$,
  array[1::bigint],
  'provisioning creates one active Owner profile'
);

select results_eq(
  $$ select count(*)::bigint from private.owner_recovery_codes where owner_id = '11111111-1111-4111-8111-111111111111' $$,
  array[1::bigint],
  'provisioning stores one private recovery hash'
);

select results_eq(
  $$ select count(*)::bigint from public.audit_events where action = 'owner.setup.completed' $$,
  array[1::bigint],
  'provisioning records the setup audit event'
);

select ok(
  not exists (
    select 1 from public.audit_events
    where after_data ?| array['password', 'recovery_code', 'recovery_hash']
  ),
  'setup audit contains no password or recovery secret'
);

select throws_ok(
  $$
    select public.provision_initial_owner(
      '11111111-1111-4111-8111-111111111111',
      'Owner Setup Test',
      'Management',
      'owner.setup.test@gmail.com',
      '0912345678',
      '11111111-1111-4111-8111-111111111111/profile-2.png',
      repeat('b', 64)
    )
  $$,
  '23505',
  'Owner already provisioned',
  'a second current Owner is rejected'
);

select finish();
rollback;
