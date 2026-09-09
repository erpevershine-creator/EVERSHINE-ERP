begin;
select plan(14);
select results_eq($$select erp_role_code from public.positions where is_active and erp_role_code is not null order by erp_role_code$$,
 array['admin','delivery','finance','inventory','owner','sales']::text[],'exactly six active ERP roles');
select has_column('public','profiles','company_position','manual company position is stored separately');
select col_not_null('public','profiles','company_position','company position is required');
select ok(not has_function_privilege('authenticated','public.create_position(text,text)','execute'),'fixed ERP catalogue cannot be expanded through old RPC');

-- All temporary accounts and changes disappear at rollback.
update public.profiles set status='inactive',disabled_at=null where erp_role='owner';
create temporary table rf(owner_id uuid,session_id uuid,sales_id uuid,other_id uuid,admin_id uuid,admin_session uuid,request_id bigint);
insert into rf(owner_id,session_id,sales_id,other_id,admin_id,admin_session) select gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid();
insert into auth.users(id,email,role,aud,email_confirmed_at) select owner_id,'roles.owner.test@gmail.com','authenticated','authenticated',now() from rf;
insert into public.profiles(id,employee_name,company_position,position_id,department,erp_role,username,contact,avatar_path)
select owner_id,'Role Test Owner','Managing Director',(select id from public.positions where erp_role_code='owner'),'Test','owner','roles.owner.test@gmail.com','test',owner_id||'/photo.png' from rf;
insert into auth.sessions(id,user_id,created_at,updated_at) select session_id,owner_id,now(),now() from rf;
-- Explicit trusted admission for this rollback fixture; raw provider sessions alone grant no ERP access.
insert into public.device_sessions(id,profile_id,device_fingerprint_hash,device_label,started_at,last_seen_at)
select s.id,s.user_id,extensions.digest(s.id::text,'sha256'),'Test admitted session',s.created_at,s.created_at
from auth.sessions s where s.id in (select unnest(array[session_id,admin_session]) from rf) on conflict(id) do nothing;
select set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','session_id',session_id)::text,true) from rf;
insert into auth.users(id,email,role,aud,email_confirmed_at,raw_app_meta_data)
select sales_id,'roles.sales.test@gmail.com','authenticated','authenticated',now(),jsonb_build_object('provisioned_by',owner_id) from rf
union all select other_id,'roles.other.test@gmail.com','authenticated','authenticated',now(),jsonb_build_object('provisioned_by',owner_id) from rf
union all select admin_id,'roles.admin.test@gmail.com','authenticated','authenticated',now(),jsonb_build_object('provisioned_by',owner_id) from rf;
select public.provision_employee(sales_id,'sales','Role Test Sales','Regional Sales Manager','Test','roles.sales.test@gmail.com','test',sales_id||'/photo.png') from rf;
select is((select company_position from public.profiles where id=(select sales_id from rf)),'Regional Sales Manager','manual job title is preserved');
select is((select pos.erp_role_code from public.profiles p join public.positions pos on pos.id=p.position_id where p.id=(select sales_id from rf)),'sales','selected Sales role derives matching permission template');
select throws_ok($$update public.profiles set position_id=(select id from public.positions where erp_role_code='finance') where id=(select sales_id from rf)$$,'23503',null,'database rejects role/template mismatch');
select throws_ok($$select public.provision_employee(other_id,'owner','Extra Owner','Director','Test','roles.other.test@gmail.com','test',other_id||'/photo.png') from rf$$,'P0001','Select a valid non-Owner ERP role','account creation cannot appoint another Owner');
select throws_ok($$select public.provision_employee(other_id,'delivery','Delivery Staff','  ','Test','roles.other.test@gmail.com','test',other_id||'/photo.png') from rf$$,'P0001','Invalid account details','blank Company Position rejected on server');
select public.provision_employee(other_id,'finance','Finance Staff','Owner','Test','roles.other.test@gmail.com','test',other_id||'/photo.png') from rf;
select is((select erp_role from public.profiles where id=(select other_id from rf)),'finance','typing Owner as company title does not grant Owner role');
select public.provision_employee(admin_id,'admin','Delegated Admin','Office Administrator','Test','roles.admin.test@gmail.com','test',admin_id||'/photo.png') from rf;

-- Explicit test-only delegated scope: Admin can customize Sales with Account view,
-- but cannot grant Account creation outside the Admin's own delegated scope.
update public.profiles set page_access='{"accounts":true,"permissions":true}',action_access='{"Positions & Permissions":["edit","approve"],"Account Management":["view"]}' where id=(select admin_id from rf);
update public.positions set version=1 where erp_role_code='sales';
update public.position_page_permissions set can_view=false where position_id=(select id from public.positions where erp_role_code='sales');
delete from public.position_action_permissions where position_id=(select id from public.positions where erp_role_code='sales');
update public.profiles set page_access='{}',action_access='{}' where id=(select sales_id from rf);
insert into auth.sessions(id,user_id,created_at,updated_at) select admin_session,admin_id,now(),now() from rf;
-- Explicit trusted admission for this rollback fixture; raw provider sessions alone grant no ERP access.
insert into public.device_sessions(id,profile_id,device_fingerprint_hash,device_label,started_at,last_seen_at)
select s.id,s.user_id,extensions.digest(s.id::text,'sha256'),'Test admitted session',s.created_at,s.created_at
from auth.sessions s where s.id in (select unnest(array[session_id,admin_session]) from rf) on conflict(id) do nothing;
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','session_id',admin_session)::text,true) from rf;
select throws_ok($$select public.draft_permission_change((select id from public.positions where erp_role_code='sales'),1,'{"accounts":true}','{"Account Management":["create"]}',array[sales_id],'Attempt outside scope') from rf$$,
 'P0001','Requested access exceeds your authority','approved Admin cannot delegate authority they do not hold');
update rf set request_id=public.draft_permission_change((select id from public.positions where erp_role_code='sales'),1,'{"accounts":true}','{"Account Management":["view"]}',array[sales_id],'Additional Sales permissions');
select public.submit_permission_change(request_id) from rf;
select set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','session_id',session_id)::text,true) from rf;
select public.decide_permission_change(request_id,true,'Owner confirms delegated cross-role access') from rf;
select ok((select page_access->>'accounts'='true' and action_access->'Account Management' ? 'view' from public.profiles where id=(select sales_id from rf)),'Sales receives approved permissions outside its role name');
select is((select company_position from public.profiles where id=(select sales_id from rf)),'Regional Sales Manager','permission changes preserve company position');
select is((select erp_role from public.profiles where id=(select sales_id from rf)),'sales','cross-module permissions preserve ERP role identity');
select finish();
rollback;
