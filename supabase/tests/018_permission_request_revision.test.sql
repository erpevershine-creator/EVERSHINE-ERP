begin;
select plan(24);

update public.profiles set status='inactive',disabled_at=null where erp_role='owner';
create temporary table revision_fixture(
  owner_id uuid default gen_random_uuid(),
  admin_id uuid default gen_random_uuid(),
  target_id uuid default gen_random_uuid(),
  owner_session uuid default gen_random_uuid(),
  admin_session uuid default gen_random_uuid(),
  target_session uuid default gen_random_uuid(),
  original_request bigint,
  returned_draft bigint,
  expired_request bigint,
  copied_draft bigint
);
insert into revision_fixture default values;

insert into auth.users(id,email,role,aud,email_confirmed_at)
select owner_id,'revision.owner.test@gmail.com','authenticated','authenticated',now() from revision_fixture union all
select admin_id,'revision.admin.test@gmail.com','authenticated','authenticated',now() from revision_fixture union all
select target_id,'revision.target.test@gmail.com','authenticated','authenticated',now() from revision_fixture;
insert into public.profiles(id,employee_name,company_position,position_id,department,erp_role,username,contact,avatar_path)
select owner_id,'Revision Owner','Owner',(select id from public.positions where erp_role_code='owner'),'Test','owner','revision.owner.test@gmail.com','test',owner_id||'/photo.png' from revision_fixture union all
select admin_id,'Revision Admin','Admin',(select id from public.positions where erp_role_code='admin'),'Test','admin','revision.admin.test@gmail.com','test',admin_id||'/photo.png' from revision_fixture union all
select target_id,'Revision Target','Sales',(select id from public.positions where erp_role_code='sales'),'Test','sales','revision.target.test@gmail.com','test',target_id||'/photo.png' from revision_fixture;
update public.profiles set page_access=(select jsonb_object_agg(id,true) from public.pages),
  action_access='{"*":["*"],"Positions & Permissions":["edit","approve"]}'
where id=(select admin_id from revision_fixture);
insert into auth.sessions(id,user_id,created_at,updated_at)
select owner_session,owner_id,clock_timestamp(),clock_timestamp() from revision_fixture union all
select admin_session,admin_id,clock_timestamp(),clock_timestamp() from revision_fixture union all
select target_session,target_id,clock_timestamp(),clock_timestamp() from revision_fixture;
insert into public.device_sessions(id,profile_id,device_fingerprint_hash,device_label,started_at,last_seen_at)
select owner_session,owner_id,extensions.digest(owner_session::text,'sha256'),'Revision Owner',clock_timestamp(),clock_timestamp() from revision_fixture union all
select admin_session,admin_id,extensions.digest(admin_session::text,'sha256'),'Revision Admin',clock_timestamp(),clock_timestamp() from revision_fixture union all
select target_session,target_id,extensions.digest(target_session::text,'sha256'),'Revision Target',clock_timestamp(),clock_timestamp() from revision_fixture;

with inserted as (
  insert into public.approval_requests(request_type,module,requester_id,target_type,target_id,current_data,proposed_data,reason,status)
  select 'position_permissions','Positions & Permissions',admin_id,'position',
    (select id::text from public.positions where erp_role_code='sales'),
    private.template_access((select id from public.positions where erp_role_code='sales')),
    '{"pages":{"accounts":true},"actions":{"Account Management":["view"]}}',
    'Original permission reason','pending' from revision_fixture returning id
) update revision_fixture set original_request=inserted.id from inserted;
insert into public.position_permission_changes(request_id,position_id,expected_position_version,before_pages,after_pages)
select original_request,p.id,p.version,private.template_access(p.id)->'pages','{"accounts":true}'
from revision_fixture cross join public.positions p where p.erp_role_code='sales';
insert into public.approval_request_accounts(request_id,profile_id,expected_profile_version,before_pages,after_pages,account_name,before_actions,after_actions)
select original_request,target.id,target.version,target.page_access,'{"accounts":true}',target.employee_name,target.action_access,'{"Account Management":["view"]}'
from revision_fixture f join public.profiles target on target.id=f.target_id;

select ok(not has_function_privilege('anon','public.revise_permission_draft(bigint,integer,jsonb,jsonb,uuid[],text)','execute'),'anonymous cannot revise a returned draft');
select ok(not has_function_privilege('anon','public.copy_expired_permission_request(bigint,text)','execute'),'anonymous cannot copy an expired request');
select set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','session_id',owner_session)::text,true) from revision_fixture;
select lives_ok($$select public.decide_permission_change(original_request,false,'Correct the selected access') from revision_fixture$$,'Owner rejects and returns editable work');
select is((select status from public.approval_requests where id=(select original_request from revision_fixture)),'rejected','original request remains immutably rejected');
select ok((select decided_by=(select owner_id from revision_fixture) and decided_at is not null from public.approval_requests where id=(select original_request from revision_fixture)),'original rejection retains its human decision');
update revision_fixture set returned_draft=(select id from public.approval_requests where source_request_id=original_request and status='draft');
select ok((select returned_draft is not null from revision_fixture),'rejection creates a new editable Draft');
select ok((select source_request_id=(select original_request from revision_fixture) and return_reason='Correct the selected access' from public.approval_requests where id=(select returned_draft from revision_fixture)),'returned Draft links the rejection reason and source');
select is((select count(*)::integer from public.position_permission_changes where request_id=(select returned_draft from revision_fixture)),1,'position snapshot is copied to the returned Draft');
select is((select count(*)::integer from public.approval_request_accounts where request_id=(select returned_draft from revision_fixture)),1,'selected account snapshot is copied to the returned Draft');
select is((select count(*)::integer from public.notifications where title='Permission request returned to Draft' and approval_request_id=(select returned_draft from revision_fixture)),1,'requester receives the returned Draft notification');

select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','session_id',admin_session)::text,true) from revision_fixture;
select lives_ok($$select public.revise_permission_draft(returned_draft,1,'{"accounts":true,"audit":true}','{"Account Management":["view"],"Audit & History":["view"]}',array[target_id],'Revised after Owner feedback') from revision_fixture$$,'original requester edits the returned Draft');
select ok((select version=2 and reason='Revised after Owner feedback' from public.approval_requests where id=(select returned_draft from revision_fixture)),'Draft revision advances version and reason');
select ok((select after_pages->>'audit'='true' and after_actions->'Audit & History' ? 'view' from public.approval_request_accounts where request_id=(select returned_draft from revision_fixture)),'Draft rebuilds the exact affected-account snapshot');
select is((select count(*)::integer from public.audit_events where action='Permission draft revised' and approval_request_id=(select returned_draft from revision_fixture)),1,'Draft edit is audited');
select throws_ok($$select public.revise_permission_draft(returned_draft,1,'{}','{}',array[]::uuid[],'Stale edit') from revision_fixture$$,'P0001','Draft changed; reload before saving','stale Draft edit is rejected');
select lives_ok($$select public.submit_permission_change(returned_draft) from revision_fixture$$,'requester resubmits the revised Draft');
select is((select status from public.approval_requests where id=(select returned_draft from revision_fixture)),'pending','revised Draft returns to Pending Approval');
select set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','session_id',owner_session)::text,true) from revision_fixture;
select lives_ok($$select public.decide_permission_change(returned_draft,true,'Revised scope accepted') from revision_fixture$$,'Owner approves the resubmitted Draft');
select ok((select status='approved' from public.approval_requests where id=(select returned_draft from revision_fixture)) and (select action_access->'Audit & History' ? 'view' from public.profiles where id=(select target_id from revision_fixture)),'approval applies only the revised Draft snapshot');

with inserted as (
  insert into public.approval_requests(request_type,module,requester_id,target_type,target_id,current_data,proposed_data,reason,status,deadline_at)
  select 'position_permissions','Positions & Permissions',admin_id,'position',p.id::text,
    private.template_access(p.id),private.template_access(p.id),'Expired source reason','expired',clock_timestamp()-interval '1 hour'
  from revision_fixture cross join public.positions p where p.erp_role_code='sales' returning id
) update revision_fixture set expired_request=inserted.id from inserted;
insert into public.position_permission_changes(request_id,position_id,expected_position_version,before_pages,after_pages)
select expired_request,p.id,p.version,private.template_access(p.id)->'pages',private.template_access(p.id)->'pages'
from revision_fixture cross join public.positions p where p.erp_role_code='sales';
insert into public.approval_request_accounts(request_id,profile_id,expected_profile_version,before_pages,after_pages,account_name,before_actions,after_actions)
select expired_request,target.id,target.version,target.page_access,target.page_access,target.employee_name,target.action_access,target.action_access
from revision_fixture f join public.profiles target on target.id=f.target_id;
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','session_id',admin_session)::text,true) from revision_fixture;
select ok((select can_copy from public.request_decision_capabilities(array[(select expired_request from revision_fixture)])),'authorized Admin receives an exact expired-copy capability');
select lives_ok($$update revision_fixture set copied_draft=public.copy_expired_permission_request(expired_request,'Retry after deadline review')$$,'authorized Admin copies an expired request with reason');
select ok((select source_request_id=(select expired_request from revision_fixture) and requester_id=(select admin_id from revision_fixture) and return_reason='Retry after deadline review' from public.approval_requests where id=(select copied_draft from revision_fixture)),'expired copy links source, actor and new reason');
select ok((select count(*)=1 from public.position_permission_changes where request_id=(select copied_draft from revision_fixture)) and (select count(*)=1 from public.approval_request_accounts where request_id=(select copied_draft from revision_fixture)),'expired copy preserves both review snapshots');

select set_config('request.jwt.claims',jsonb_build_object('sub',target_id,'role','authenticated','session_id',target_session)::text,true) from revision_fixture;
select throws_ok($$select public.copy_expired_permission_request(expired_request,'Unauthorized retry') from revision_fixture$$,'42501','Permission denied','normal employee cannot copy an expired request');
select * from finish();
rollback;
