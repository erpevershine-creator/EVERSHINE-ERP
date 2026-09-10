begin;
select plan(10);
update public.profiles set status='inactive' where erp_role='owner';
create temp table ph(owner_id uuid default gen_random_uuid(), admin_id uuid default gen_random_uuid(), session_id uuid default gen_random_uuid(), request_id bigint, handover_id bigint);
insert into ph default values;
insert into auth.users(id,email,role,aud,email_confirmed_at) select owner_id,'permanent.owner@test.invalid','authenticated','authenticated',now() from ph union all select admin_id,'permanent.admin@test.invalid','authenticated','authenticated',now() from ph;
insert into public.profiles(id,employee_name,company_position,position_id,department,erp_role,username,contact,avatar_path)
select owner_id,'Permanent Source','Owner',(select id from public.positions where erp_role_code='owner'),'Test','owner','permanent.owner@test.invalid','test',owner_id||'/photo.png' from ph
union all select admin_id,'Permanent Successor','Admin',(select id from public.positions where erp_role_code='admin'),'Test','admin','permanent.admin@test.invalid','test',admin_id||'/photo.png' from ph;
update public.profiles set action_access=jsonb_build_object('*',jsonb_build_array('*')),page_access=(select jsonb_object_agg(id,true) from public.pages) where id=(select owner_id from ph);
insert into auth.sessions(id,user_id,created_at,updated_at) select session_id,owner_id,clock_timestamp(),clock_timestamp() from ph;
insert into public.device_sessions(id,profile_id,device_fingerprint_hash,device_label,started_at,last_seen_at) select session_id,owner_id,extensions.digest(session_id::text,'sha256'),'Source',clock_timestamp(),clock_timestamp() from ph;
insert into public.approval_requests(request_type,module,requester_id,target_type,target_id,current_data,proposed_data,reason,status,deadline_at)
select 'device_login','Account Management',owner_id,'profile',owner_id::text,'{}','{}','Permanent fixture','pending',clock_timestamp()+interval '1 hour' from ph;
update ph set request_id=(select id from public.approval_requests where requester_id=owner_id and status='pending' order by id desc limit 1);
select set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','session_id',session_id)::text,true) from ph;
select public.complete_permanent_handover(owner_id,admin_id,array[request_id],'Permanent successor appointed') from ph;
select is((select status from public.profiles where id=owner_id),'inactive','source becomes inactive') from ph;
select is((select status from public.device_sessions where id=session_id),'logged_out','source sessions are revoked') from ph;
select is((select count(*) from public.approval_requests where id=request_id and requester_id=owner_id and status='pending'),1::bigint,'original requester and pending state are preserved') from ph;
select is((select count(*) from public.handover_requests where source_id=owner_id and successor_id=admin_id and status='approved'),1::bigint,'permanent handover assignment is recorded') from ph;
select is((select count(*) from public.handover_items where handover_id=(select id from public.handover_requests where source_id=owner_id and successor_id=admin_id)),1::bigint,'only selected responsibility transfers') from ph;
select throws_ok($$select public.complete_permanent_handover(owner_id,admin_id,array[request_id],'Replay') from ph$$,'P0001','Handover account unavailable','inactive source cannot be replayed') from ph;
select is((select count(*) from public.audit_events where action='Permanent handover completed' and entity_id=owner_id::text),1::bigint,'permanent handover audit is append-only') from ph;
select is((select status from public.profiles where id=admin_id),'active','successor remains active') from ph;
select * from finish();
rollback;
