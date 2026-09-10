begin;
select plan(20);

update public.profiles set status='inactive',disabled_at=null where erp_role='owner';
create temporary table deadline_fixture(
  owner_id uuid default gen_random_uuid(),
  allowed_admin_id uuid default gen_random_uuid(),
  denied_admin_id uuid default gen_random_uuid(),
  requester_id uuid default gen_random_uuid(),
  owner_session uuid default gen_random_uuid(),
  due_request bigint,
  recent_request bigint,
  expired_request bigint,
  synchronous_device bigint,
  synchronous_permission bigint
);
insert into deadline_fixture default values;

insert into auth.users(id,email,role,aud,email_confirmed_at)
select owner_id,'deadline.owner.test@gmail.com','authenticated','authenticated',now() from deadline_fixture union all
select allowed_admin_id,'deadline.allowed.admin.test@gmail.com','authenticated','authenticated',now() from deadline_fixture union all
select denied_admin_id,'deadline.denied.admin.test@gmail.com','authenticated','authenticated',now() from deadline_fixture union all
select requester_id,'deadline.requester.test@gmail.com','authenticated','authenticated',now() from deadline_fixture;

insert into public.profiles(id,employee_name,company_position,position_id,department,erp_role,username,contact,avatar_path)
select owner_id,'Deadline Owner','Owner',(select id from public.positions where erp_role_code='owner'),'Test','owner','deadline.owner.test@gmail.com','test',owner_id||'/photo.png' from deadline_fixture union all
select allowed_admin_id,'Deadline Approver','Admin',(select id from public.positions where erp_role_code='admin'),'Test','admin','deadline.allowed.admin.test@gmail.com','test',allowed_admin_id||'/photo.png' from deadline_fixture union all
select denied_admin_id,'Deadline Denied','Admin',(select id from public.positions where erp_role_code='admin'),'Test','admin','deadline.denied.admin.test@gmail.com','test',denied_admin_id||'/photo.png' from deadline_fixture union all
select requester_id,'Deadline Requester','Sales',(select id from public.positions where erp_role_code='sales'),'Test','sales','deadline.requester.test@gmail.com','test',requester_id||'/photo.png' from deadline_fixture;
update public.profiles set action_access='{}',individual_actions='{"Positions & Permissions":["approve"],"Account Management":["approve_device"]}'
  where id=(select allowed_admin_id from deadline_fixture);
update public.profiles set action_access='{}',individual_actions='{}'
  where id=(select denied_admin_id from deadline_fixture);
insert into auth.sessions(id,user_id,created_at,updated_at)
  select owner_session,owner_id,clock_timestamp(),clock_timestamp() from deadline_fixture;
insert into public.device_sessions(id,profile_id,device_fingerprint_hash,device_label,started_at,last_seen_at)
  select owner_session,owner_id,extensions.digest(owner_session::text,'sha256'),'Deadline Owner',clock_timestamp(),clock_timestamp() from deadline_fixture;

with inserted as (
  insert into public.approval_requests(request_type,module,requester_id,target_type,target_id,current_data,proposed_data,reason,status,created_at,deadline_at)
  select 'position_permissions','Positions & Permissions',requester_id,'position','fixture','{"pages":{},"actions":{}}','{"pages":{},"actions":{}}','Due reminder fixture','pending',clock_timestamp()-interval '4 hours',clock_timestamp()+interval '10 hours' from deadline_fixture
  returning id
) update deadline_fixture set due_request=inserted.id from inserted;
with inserted as (
  insert into public.approval_requests(request_type,module,requester_id,target_type,target_id,current_data,proposed_data,reason,status,created_at,deadline_at)
  select 'device_login','Account Management',requester_id,'profile',requester_id::text,'{}','{}','Recent fixture','pending',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '10 hours' from deadline_fixture
  returning id
) update deadline_fixture set recent_request=inserted.id from inserted;
with inserted as (
  insert into public.approval_requests(request_type,module,requester_id,target_type,target_id,current_data,proposed_data,reason,status,created_at,deadline_at)
  select 'device_login','Account Management',requester_id,'profile',requester_id::text,'{}','{}','Expired fixture','pending',clock_timestamp()-interval '5 hours',clock_timestamp()-interval '1 minute' from deadline_fixture
  returning id
) update deadline_fixture set expired_request=inserted.id from inserted;

select ok(not has_function_privilege('anon','public.run_approval_deadline_jobs()','execute'),'anonymous cannot run deadline jobs');
select ok(not has_function_privilege('authenticated','public.run_approval_deadline_jobs()','execute'),'authenticated clients cannot run deadline jobs');
select set_config('request.jwt.claims','{"role":"service_role"}',true);
create temporary table first_job(result jsonb);
insert into first_job select public.run_approval_deadline_jobs();
select is((select (result->>'expired')::integer from first_job),1,'overdue pending request expires');
select is((select (result->>'reminders')::integer from first_job),3,'old pending request reaches exactly three relevant recipients');
select is((select status from public.approval_requests where id=(select expired_request from deadline_fixture)),'expired','expired status persists');
select ok((select decided_by is null and decided_at is null from public.approval_requests where id=(select expired_request from deadline_fixture)),'system expiry does not forge a human decision actor');
select is((select count(*)::integer from public.audit_events where action='Device sign-in expired' and approval_request_id=(select expired_request from deadline_fixture)),1,'system expiry preserves an audit event');
select is((select count(*)::integer from public.notifications where title='Approval request expired' and approval_request_id=(select expired_request from deadline_fixture)),3,'expiry notifies the exact relevant users');
select is((select count(*)::integer from private.approval_deadline_reminder_deliveries where request_id=(select due_request from deadline_fixture)),3,'reminder ledger records requester and exact approvers');
select is((select count(*)::integer from public.notifications where recipient_id=(select denied_admin_id from deadline_fixture)),0,'Admin without approval authority receives nothing');
select is((select count(*)::integer from private.approval_deadline_reminder_deliveries where request_id=(select recent_request from deadline_fixture)),0,'first repeat waits three hours after request creation');

create temporary table retry_job(result jsonb);
insert into retry_job select public.run_approval_deadline_jobs();
select is((select (result->>'expired')::integer from retry_job),0,'same scheduler retry does not re-expire');
select is((select (result->>'reminders')::integer from retry_job),0,'same scheduler retry does not duplicate reminders');
update private.approval_deadline_reminder_deliveries set delivered_at=clock_timestamp()-interval '3 hours 1 minute';
select is((public.run_approval_deadline_jobs()->>'reminders')::integer,3,'reminders repeat only after three hours');
update public.approval_requests set deadline_at=clock_timestamp()-interval '1 minute' where id=(select due_request from deadline_fixture);
select is((public.run_approval_deadline_jobs()->>'expired')::integer,1,'a reminded request expires without another reminder');

with inserted as (
  insert into public.approval_requests(request_type,module,requester_id,target_type,target_id,current_data,proposed_data,reason,status,deadline_at)
  select 'device_login','Account Management',requester_id,'profile',requester_id::text,'{}','{}','Synchronous device expiry','pending',clock_timestamp()-interval '1 minute' from deadline_fixture
  returning id
) update deadline_fixture set synchronous_device=inserted.id from inserted;
with inserted as (
  insert into public.approval_requests(request_type,module,requester_id,target_type,target_id,current_data,proposed_data,reason,status,deadline_at)
  select 'position_permissions','Positions & Permissions',requester_id,'position','fixture','{"pages":{},"actions":{}}','{"pages":{},"actions":{}}','Synchronous permission expiry','pending',clock_timestamp()-interval '1 minute' from deadline_fixture
  returning id
) update deadline_fixture set synchronous_permission=inserted.id from inserted;
select set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','session_id',owner_session)::text,true) from deadline_fixture;
select lives_ok($$select public.decide_device_login(synchronous_device,true,'Too late') from deadline_fixture$$,'device decision path expires rather than approving after deadline');
select is((select status from public.approval_requests where id=(select synchronous_device from deadline_fixture)),'expired','device approval cannot pass its deadline');
select lives_ok($$select public.decide_permission_change(synchronous_permission,true,'Too late') from deadline_fixture$$,'permission decision path expires rather than approving after deadline');
select is((select status from public.approval_requests where id=(select synchronous_permission from deadline_fixture)),'expired','permission approval cannot pass its deadline');

select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select throws_ok($$select public.run_approval_deadline_jobs()$$,'42501','Server only','client JWT cannot bypass deadline service authority');
select * from finish();
rollback;
