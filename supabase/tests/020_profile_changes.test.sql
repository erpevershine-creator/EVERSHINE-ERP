begin;
select no_plan();
-- Transaction-only fixture isolation; restored by the final rollback.
update public.profiles set status='inactive',disabled_at=null where erp_role='owner';
create temp table pc(owner_id uuid default gen_random_uuid(),staff_id uuid default gen_random_uuid(),admin_id uuid default gen_random_uuid(),owner_session uuid default gen_random_uuid(),admin_session uuid default gen_random_uuid(),rid bigint,operation text);
insert into pc default values;
insert into auth.users(id,email,role,aud,email_confirmed_at)
select owner_id,'profile.owner@gmail.com','authenticated','authenticated',now() from pc union all select staff_id,'profile.staff@gmail.com','authenticated','authenticated',now() from pc union all select admin_id,'profile.admin@gmail.com','authenticated','authenticated',now() from pc;
insert into public.profiles(id,employee_name,company_position,position_id,department,erp_role,username,contact,avatar_path)
select owner_id,'Profile Owner','Owner',(select id from public.positions where erp_role_code='owner'),'Test','owner','profile.owner@gmail.com','test',owner_id||'/photo.png' from pc
union all select staff_id,'Profile Staff','Sales',(select id from public.positions where erp_role_code='sales'),'Test','sales','profile.staff@gmail.com','test',staff_id||'/photo.png' from pc
union all select admin_id,'Profile Admin','Admin',(select id from public.positions where erp_role_code='admin'),'Test','admin','profile.admin@gmail.com','test',admin_id||'/photo.png' from pc;
update public.profiles set page_access='{"accounts":true,"approvals":true}',action_access='{"Account Management":["edit","approve"]}' where id=(select admin_id from pc);
insert into auth.sessions(id,user_id,created_at,updated_at) select owner_session,owner_id,clock_timestamp(),clock_timestamp() from pc union all select admin_session,admin_id,clock_timestamp(),clock_timestamp() from pc;
insert into public.device_sessions(id,profile_id,device_fingerprint_hash,device_label,started_at,last_seen_at) select owner_session,owner_id,extensions.digest(owner_session::text,'sha256'),'Owner fixture',clock_timestamp(),clock_timestamp() from pc union all select admin_session,admin_id,extensions.digest(admin_session::text,'sha256'),'Admin fixture',clock_timestamp(),clock_timestamp() from pc;
select ok(not has_function_privilege('anon','public.request_profile_change(uuid,integer,jsonb,text)','execute'),'anonymous cannot request changes');
select ok(not has_function_privilege('authenticated','private.apply_profile_change(bigint)','execute'),'clients cannot forge application');
select ok(not has_table_privilege('service_role','private.profile_change_execution','insert'),'service cannot fabricate approved operations');
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','session_id',admin_session)::text,true) from pc;
update pc set rid=public.request_profile_change(staff_id,1,'{"contact":"new contact"}','Admin requests correction');
select throws_ok($$select public.decide_profile_change(rid,true,'Self approve') from pc$$,'P0001','Only Owner may self-approve','Admin self-approval rejected');
select throws_ok($$select public.request_profile_change(owner_id,1,'{"contact":"x"}','Try Owner') from pc$$,'P0001','Owner approval required for this account or role change','Admin cannot edit Owner');
select set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','session_id',owner_session)::text,true) from pc;
select is((select contact from public.profiles where id=(select staff_id from pc)),'test','request does not mutate profile');
select is((select public.decide_profile_change(rid,true,'Owner approves correction')->>'status' from pc),'applied','non-provider change applies atomically');
select is((select contact from public.profiles where id=(select staff_id from pc)),'new contact','exact approved contact applied');
select is((select count(*) from public.audit_events where action='Profile change applied' and approval_request_id=(select rid from pc)),1::bigint,'single linked application audit');
select throws_ok($$select public.decide_profile_change(rid,true,'Replay') from pc$$,'P0001','Profile request unavailable','approval replay rejected');
select throws_ok($$select public.request_profile_change(staff_id,1,'{}','Stale') from pc$$,'P0001','Account changed; reload before editing','stale editor rejected');
select throws_ok($$select public.request_profile_change(staff_id,2,'{"erpRole":"owner"}','Escalation') from pc$$,'P0001','Owner role cannot be transferred by profile editing','cannot create another Owner');
update pc set rid=public.request_profile_change(staff_id,2,'{"username":"profile.changed@gmail.com","department":"New department"}','Company email reassigned');
update pc set operation=public.decide_profile_change(rid,true,'Approve full snapshot')->>'operation';
select is((select username::text from public.profiles where id=(select staff_id from pc)),'profile.staff@gmail.com','provider-pending keeps original username');
select is((select department from public.profiles where id=(select staff_id from pc)),'Test','all profile fields wait for provider transaction');
set constraints all immediate;
select throws_ok($$update auth.users set email='unapproved@gmail.com' where id=(select staff_id from pc)$$,'42501','Approved profile operation required','direct provider edit denied');
update auth.users set email='profile.changed@gmail.com',raw_app_meta_data=jsonb_build_object('erp_profile_operation',(select operation from pc)) where id=(select staff_id from pc);
select is((select username::text from public.profiles where id=(select staff_id from pc)),'profile.changed@gmail.com','Auth commit applies same ERP username');
select is((select department from public.profiles where id=(select staff_id from pc)),'New department','Auth commit applies complete approved profile');
select is((select public.profile_execution_status(rid)->>'status' from pc),'applied','committed execution proof visible');
select throws_ok($$update auth.users set email='replay@gmail.com' where id=(select staff_id from pc)$$,'42501','Approved profile operation required','provider operation replay rejected');
select is((select email::text from auth.users where id=(select staff_id from pc)),'profile.changed@gmail.com','rejected provider edit rolls back Auth email');
update public.profiles set individual_pages='{"audit":true}',individual_actions='{"Audit & History":["view"]}' where id=(select staff_id from pc);
update pc set rid=public.request_profile_change(staff_id,3,'{"erpRole":"inventory"}','New responsibilities');
select is((select proposed_data->'extraPages' from public.approval_requests where id=(select rid from pc)),'{"audit":true}'::jsonb,'individual grants included for explicit reapproval');
select is((select erp_role from public.profiles where id=(select staff_id from pc)),'sales','role remains unchanged while awaiting approval');
select public.decide_profile_change(rid,true,'Owner reapproves role and individual grants') from pc;
select is((select erp_role from public.profiles where id=(select staff_id from pc)),'inventory','approved role applied');
select is((select individual_pages from public.profiles where id=(select staff_id from pc)),'{"audit":true}'::jsonb,'explicitly reapproved grants retained');
select * from finish();
rollback;
