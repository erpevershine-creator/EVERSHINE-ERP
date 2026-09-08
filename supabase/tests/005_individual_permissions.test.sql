begin;
select plan(24);
update public.profiles set status='inactive',disabled_at=null where erp_role='owner';
create temporary table ip(owner_id uuid,owner_session uuid,staff uuid,peer uuid,admin_id uuid,staff_session uuid,admin_session uuid,request_id bigint,stale_id bigint,old_template jsonb);
insert into ip(owner_id,owner_session,staff,peer,admin_id,staff_session,admin_session) select gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid();
insert into auth.users(id,email,role,aud,email_confirmed_at) select owner_id,'individual.owner.test@gmail.com','authenticated','authenticated',now() from ip;
insert into public.profiles(id,employee_name,position_id,department,erp_role,username,contact,avatar_path)
select owner_id,'Individual Test Owner',(select id from public.positions where erp_role_code='owner'),'Test','owner','individual.owner.test@gmail.com','test',owner_id||'/photo.png' from ip;
insert into auth.sessions(id,user_id,created_at,updated_at) select owner_session,owner_id,now(),now() from ip;
select set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','session_id',owner_session)::text,true) from ip;
-- No dependency on permissions the real Owner assigned to these role templates.
update public.positions set version=1 where erp_role_code='sales';
update public.position_page_permissions set can_view=(page_id='dashboard') where position_id=(select id from public.positions where erp_role_code='sales');
delete from public.position_action_permissions where position_id=(select id from public.positions where erp_role_code='sales');
insert into public.position_action_permissions(position_id,module,action,allowed) select id,'Workspace','view',true from public.positions where erp_role_code='sales';
insert into auth.users(id,email,role,aud,email_confirmed_at,raw_app_meta_data)
select staff,'individual.staff.test@gmail.com','authenticated','authenticated',now(),jsonb_build_object('provisioned_by',owner_id) from ip
union all select peer,'individual.peer.test@gmail.com','authenticated','authenticated',now(),jsonb_build_object('provisioned_by',owner_id) from ip
union all select admin_id,'individual.admin.test@gmail.com','authenticated','authenticated',now(),jsonb_build_object('provisioned_by',owner_id) from ip;
select public.provision_employee(staff,'sales','Individual Staff','Sales Manager','Test','individual.staff.test@gmail.com','test',staff||'/photo.png') from ip;
select public.provision_employee(peer,'sales','Individual Peer','Sales Staff','Test','individual.peer.test@gmail.com','test',peer||'/photo.png') from ip;
select public.provision_employee(admin_id,'admin','Individual Admin','Office Manager','Test','individual.admin.test@gmail.com','test',admin_id||'/photo.png') from ip;
insert into auth.sessions(id,user_id,created_at,updated_at) select staff_session,staff,now(),now() from ip union all select admin_session,admin_id,now(),now() from ip;
update ip set old_template=private.template_access((select id from public.positions where erp_role_code='sales'));
select ok(not has_function_privilege('anon','public.approve_individual_permissions(uuid,integer,jsonb,jsonb,text)','execute'),'anonymous cannot grant individual permissions');
select ok(not has_function_privilege('authenticated','private.permission_snapshot(uuid,jsonb,jsonb)','execute'),'internal snapshot helper is not a client API');
select is(public.get_individual_permissions(staff)->'extraPages','{}'::jsonb,'new account has no individual grants') from ip;
select throws_ok($$select public.approve_individual_permissions(staff,1,'{"settings":false}','{}','Invalid false grant') from ip$$,'P0001','Additional pages must be valid grants','additional permissions cannot silently deny base access');
select throws_ok($$select public.approve_individual_permissions(staff,1,'{}','{"Workspace":["*"]}','Invalid wildcard') from ip$$,'P0001','Invalid additional actions','wildcard escalation rejected');
select throws_ok($$select public.approve_individual_permissions(staff,1,'{}','{}',' ') from ip$$,'P0001','Invalid individual permission request','reason is required');
select throws_ok($$select public.approve_individual_permissions(owner_id,1,'{}','{}','Owner cannot be a target') from ip$$,'P0001','Account unavailable','Owner account cannot be modified through individual grants');
update ip set request_id=public.approve_individual_permissions(staff,1,'{"settings":true}','{"Workspace":["export"],"Account Management":["view"]}','Owner grants extra access');
select ok((select status='approved' and requester_id=decided_by from public.approval_requests where id=(select request_id from ip)),'Owner grant is recorded as self-approved');
select is((select count(*) from public.audit_events where approval_request_id=(select request_id from ip) and action='Individual permissions approved'),1::bigint,'individual grant has an atomic audit record');
select is(private.template_access((select id from public.positions where erp_role_code='sales')),(select old_template from ip),'individual grant does not change role template');
select is((select individual_pages from public.profiles where id=(select peer from ip)),'{}'::jsonb,'another account in the same role is unchanged');
select set_config('request.jwt.claims',jsonb_build_object('sub',staff,'role','authenticated','session_id',staff_session)::text,true) from ip;
select ok(private.can_view_page('settings') and private.has_action('Workspace','view') and private.has_action('Workspace','export'),'active session immediately gets union of base and additional access');
select ok(public.my_access()->'actions'->'Workspace' ? 'export','server access snapshot includes individual actions');
select throws_ok($$select public.approve_individual_permissions(staff,2,'{}','{}','Staff direct API') from ip$$,'42501','Only Owner can manage individual permissions','employee cannot call Owner command');
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','session_id',admin_session)::text,true) from ip;
select throws_ok($$select public.get_individual_permissions(staff) from ip$$,'42501','Only Owner can manage individual permissions','Admin cannot use Owner inspection RPC');
select throws_ok($$select public.approve_individual_permissions(staff,2,'{}','{}','Admin direct API') from ip$$,'42501','Only Owner can manage individual permissions','Admin cannot edit individual grants');
select set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','session_id',owner_session)::text,true) from ip;
update ip set request_id=public.draft_permission_change((select id from public.positions where erp_role_code='sales'),1,'{"dashboard":true}','{"Workspace":["view"]}',array[staff],'Template must preserve additional grants');
select ok((select after_pages->>'settings'='true' and after_actions->'Workspace' ? 'export' from public.approval_request_accounts where request_id=(select request_id from ip)),'template request shows complete effective post-change account snapshot');
select public.submit_permission_change(request_id) from ip;
select public.decide_permission_change(request_id,true,'Confirm role update') from ip;
select is((select individual_pages->>'settings' from public.profiles where id=(select staff from ip)),'true','template approval preserves individual pages');
select ok((select individual_actions->'Workspace' ? 'export' from public.profiles where id=(select staff from ip)),'template approval preserves individual actions');
-- Changing individual access invalidates any previously captured template approval.
update ip set stale_id=public.draft_permission_change((select id from public.positions where erp_role_code='sales'),2,'{"dashboard":true}','{}',array[staff],'Stale template request');
select public.submit_permission_change(stale_id) from ip;
select public.approve_individual_permissions(staff,(select version from public.profiles where id=staff),'{}','{}','Remove extra grants') from ip;
select throws_ok($$select public.decide_permission_change(stale_id,true,'Stale must fail') from ip$$,'P0001','Stale account; create a fresh request','individual edit invalidates old template request');
select throws_ok($$select public.approve_individual_permissions(staff,1,'{}','{}','Old screen version') from ip$$,'P0001','Account changed; reload before approving','stale individual edit is rejected');
select set_config('request.jwt.claims',jsonb_build_object('sub',staff,'role','authenticated','session_id',staff_session)::text,true) from ip;
select ok(not private.can_view_page('settings') and not private.has_action('Workspace','export') and private.has_action('Workspace','view'),'removing extra access revokes it without removing base grants');
set local role authenticated;
select throws_ok($$update public.profiles set individual_actions='{"Workspace":["approve"]}'$$,'42501','permission denied for table profiles','direct updates cannot bypass Owner authority');
reset role;
select is((select count(*) from public.notifications where recipient_id=(select staff from ip) and title='Individual permissions updated'),2::bigint,'individual grant and removal notify only target account');
select finish();
rollback;
