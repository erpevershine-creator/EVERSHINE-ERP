begin;
select plan(35);
-- All fixtures, temporary Owner isolation and audit writes roll back together.
update public.profiles set status='inactive',disabled_at=null where erp_role='owner';
create temporary table fixture (owner_id uuid,owner_session uuid,staff1 uuid,staff2 uuid,admin_id uuid,staff_session uuid,admin_session uuid,position_id bigint,request_id bigint,stale_id bigint,operation uuid);
insert into fixture(owner_id,owner_session,staff1,staff2,admin_id,staff_session,admin_session) select gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid();
insert into auth.users(id,email,role,aud,email_confirmed_at,raw_app_meta_data)
select owner_id,'live.owner.test@gmail.com','authenticated','authenticated',now(),'{}' from fixture;
insert into public.profiles(id,employee_name,position_id,department,erp_role,username,contact,avatar_path)
select owner_id,'Test Owner',(select id from public.positions where code='owner'),'Test','owner','live.owner.test@gmail.com','test',owner_id||'/photo.png' from fixture;
insert into auth.sessions(id,user_id,created_at,updated_at) select owner_session,owner_id,now(),now() from fixture;
select set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','session_id',owner_session)::text,true) from fixture;
select ok(private.is_owner(),'verified active Owner session has authority');
select ok(not has_function_privilege('anon','public.my_access()','execute'),'anonymous access context denied');
select ok(not has_function_privilege('authenticated','public.begin_owner_recovery(text,text)','execute'),'clients cannot invoke service recovery RPC');
select ok(not has_function_privilege('authenticated','public.record_login_attempt(text,boolean,uuid)','execute'),'clients cannot reset lockout counter');
select ok(not has_table_privilege('authenticated','private.recovery_operations','select'),'recovery operations remain private');
update fixture set position_id=(select id from public.positions where erp_role_code='sales');
update public.positions set version=1 where id=(select position_id from fixture);
update public.position_page_permissions set can_view=false where position_id=(select position_id from fixture);
delete from public.position_action_permissions where position_id=(select position_id from fixture);
insert into public.position_action_permissions(position_id,module,action,allowed)
select position_id,'Workspace','view',true from fixture;
update public.position_page_permissions set can_view=true where position_id=(select position_id from fixture) and page_id='dashboard';
insert into auth.users(id,email,role,aud,email_confirmed_at,raw_app_meta_data)
select staff1,'live.staff1.test@gmail.com','authenticated','authenticated',now(),jsonb_build_object('provisioned_by',owner_id) from fixture
union all select staff2,'live.staff2.test@gmail.com','authenticated','authenticated',now(),jsonb_build_object('provisioned_by',owner_id) from fixture
union all select admin_id,'live.admin.test@gmail.com','authenticated','authenticated',now(),jsonb_build_object('provisioned_by',owner_id) from fixture;
select is(public.provision_employee(staff1,'sales','Test Staff 1','Sales Representative','Test','live.staff1.test@gmail.com','test',staff1||'/photo.png'),staff1,'authorized account transaction creates employee') from fixture;
select public.provision_employee(staff2,'sales','Test Staff 2','Senior Sales Representative','Test','live.staff2.test@gmail.com','test',staff2||'/photo.png') from fixture;
select public.provision_employee(admin_id,'admin','Test Admin','Account Administrator','Test','live.admin.test@gmail.com','test',admin_id||'/photo.png') from fixture;
select ok((select page_access->>'dashboard'='true' from public.profiles where id=(select staff1 from fixture)),'new account receives position snapshot');
insert into auth.sessions(id,user_id,created_at,updated_at) select staff_session,staff1,now(),now() from fixture union all select admin_session,admin_id,now(),now() from fixture;
update fixture set request_id=public.draft_permission_change(position_id,1,'{"dashboard":true,"settings":true}','{"Workspace":["view"]}',array[staff1],'Test selected account change');
select is((select status from public.approval_requests where id=(select request_id from fixture)),'draft','change starts as draft');
insert into public.user_page_overrides(profile_id,page_id,can_view,reason,approved_request_id)
select staff1,'dashboard',false,'Test retained exception',request_id from fixture;
select public.submit_permission_change(request_id) from fixture;
select is((select status from public.approval_requests where id=(select request_id from fixture)),'pending','explicit submit queues approval');
select public.decide_permission_change(request_id,true,'Test Owner approval') from fixture;
select is((select status from public.approval_requests where id=(select request_id from fixture)),'approved','Owner may self-approve');
select ok((select page_access->>'settings'='true' from public.profiles where id=(select staff1 from fixture)),'included account updated');
select ok(not coalesce((select (page_access->>'settings')::boolean from public.profiles where id=(select staff2 from fixture)),false),'excluded account unchanged');
select is((select count(*) from public.approval_request_accounts where request_id=(select request_id from fixture)),1::bigint,'exact selected-account snapshot persisted');
select ok(exists(select 1 from public.audit_events where approval_request_id=(select request_id from fixture) and action='Permission request approved'),'decision audit persisted atomically');
update fixture set stale_id=public.draft_permission_change(position_id,2,'{"dashboard":true}','{}',array[staff1],'Stale test');
select public.submit_permission_change(stale_id) from fixture;
update public.profiles set version=version+1 where id=(select staff1 from fixture);
select throws_ok($$select public.decide_permission_change(stale_id,true,'Test stale approval') from fixture$$,'P0001','Stale account; create a fresh request','stale account blocks entire approval');
select is((select status from public.approval_requests where id=(select stale_id from fixture)),'pending','failed approval changes nothing');

select set_config('request.jwt.claims',jsonb_build_object('sub',staff1,'role','authenticated','session_id',staff_session)::text,true) from fixture;
select ok(not private.can_view_page('dashboard'),'existing individual override survives template approval');
select ok(private.can_view_page('settings') and not private.has_action('Account Management','create'),'viewing a page grants no account creation authority');
select throws_ok($$select public.create_position('Forbidden','forbidden')$$,'42501','Permission denied','employee cannot invoke admin command directly');
set local role authenticated;
select is((select count(*) from public.profiles),1::bigint,'employee RLS exposes only own profile');
select is((select count(*) from public.notifications),0::bigint,'employee cannot read others notifications');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','session_id',admin_session)::text,true) from fixture;
select ok(not private.has_action('Positions & Permissions','approve'),'account Admin has no implicit permissions approval');
select throws_ok($$select public.change_account_status(owner_id,'disable','Test deny') from fixture$$,'P0001','This account cannot be changed here','Admin cannot disable Owner');

update public.profiles set page_access='{"dashboard":true,"settings":true}',action_access='{"Positions & Permissions":["edit","approve"],"Workspace":["view"]}' where id=(select admin_id from fixture);
update fixture set request_id=public.draft_permission_change(position_id,2,'{"dashboard":true}','{}',array[staff2],'Admin self-approval test');
select public.submit_permission_change(request_id) from fixture;
select throws_ok($$select public.decide_permission_change(request_id,true,'Self approve') from fixture$$,'P0001','Only Owner may self-approve','delegated Admin still cannot self-approve');

select set_config('request.jwt.claims','{"role":"service_role"}',true);
select public.record_login_attempt('live.staff1.test@gmail.com',false) from generate_series(1,5);
select is((select status from public.profiles where id=(select staff1 from fixture)),'locked','five failures lock the account');
select set_config('request.jwt.claims',jsonb_build_object('sub',staff1,'role','authenticated','session_id',staff_session)::text,true) from fixture;
select ok(not private.is_active_user(),'locked account loses database authority');
set local role authenticated;
select is((select count(*) from public.profiles),0::bigint,'locked session cannot use old self-read RLS policy');
reset role;

insert into private.owner_recovery_codes(owner_id,code_hash,version) select owner_id,decode(repeat('a',64),'hex'),1 from fixture;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
update private.recovery_throttle set attempts=0,window_start=now();
select ok(public.begin_owner_recovery('live.owner.test@gmail.com',repeat('b',64)) ? 'error','wrong recovery hash rejected');
update fixture set operation=(public.begin_owner_recovery('live.owner.test@gmail.com',repeat('a',64))->>'operation')::uuid;
select ok((select recovery_pending from public.profiles where id=(select owner_id from fixture)),'verified recovery fences account before Auth update');
select ok(public.begin_owner_recovery('live.owner.test@gmail.com',repeat('a',64)) ? 'error','concurrent recovery cannot start');
select public.finish_owner_recovery(operation,true) from fixture;
select set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','session_id',owner_session,'iat',extract(epoch from clock_timestamp()+interval '1 hour'))::text,true) from fixture;
select ok(not private.is_active_user(),'old Owner session stays revoked even with refreshed JWT iat');
update fixture set owner_session=gen_random_uuid();
insert into auth.sessions(id,user_id,created_at,updated_at) select owner_session,owner_id,clock_timestamp(),clock_timestamp() from fixture;
select set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','session_id',owner_session)::text,true) from fixture;
select ok(private.is_owner(),'fresh Owner sign-in works after recovery');
select ok(not exists(select 1 from public.audit_events where after_data ?| array['password','code','recovery_hash']),'audit contains no recovery or password secrets');
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select public.record_login_attempt('live.owner.test@gmail.com',true,owner_session) from fixture;
select set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','session_id',owner_session)::text,true) from fixture;
select public.end_my_session();
select ok(not private.is_active_user(),'explicit logout blocks JWT even before Auth cleanup');
set local role authenticated;
select throws_ok($$update public.profiles set erp_role='owner'$$,'42501','permission denied for table profiles','direct profile privilege escalation denied');
reset role;
select finish();
rollback;
