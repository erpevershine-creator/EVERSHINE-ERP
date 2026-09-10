begin;
select plan(8);
update public.profiles set status='inactive',disabled_at=null where erp_role='owner';
create temporary table ho(owner_id uuid default gen_random_uuid(),admin_id uuid default gen_random_uuid(),s1 uuid default gen_random_uuid(),s2 uuid default gen_random_uuid(),s3 uuid default gen_random_uuid(),s4 uuid default gen_random_uuid(),sa uuid default gen_random_uuid(),t1 uuid,t2 uuid,t3 uuid,hid bigint,request_id bigint);
insert into ho default values;
insert into auth.users(id,email,role,aud,email_confirmed_at) select owner_id,'handover.owner.test@gmail.com','authenticated','authenticated',now() from ho union all select admin_id,'handover.admin.test@gmail.com','authenticated','authenticated',now() from ho;
insert into public.profiles(id,employee_name,company_position,position_id,department,erp_role,username,contact,avatar_path)
select owner_id,'Handover Owner','Owner',(select id from public.positions where erp_role_code='owner'),'Test','owner','handover.owner.test@gmail.com','test',owner_id||'/photo.png' from ho
union all select admin_id,'Handover Admin','Admin',(select id from public.positions where erp_role_code='admin'),'Test','admin','handover.admin.test@gmail.com','test',admin_id||'/photo.png' from ho;
insert into public.position_action_permissions(position_id,module,action,allowed) select (select id from public.positions where erp_role_code='admin'),'Account Management','approve_device',true on conflict (position_id,module,action) do update set allowed=true;
update public.profiles set action_access=jsonb_set(coalesce(action_access,'{}'::jsonb),'{Account Management}',(coalesce(action_access->'Account Management','[]'::jsonb)||'["approve_handover","handover"]'::jsonb)) where id=(select admin_id from ho);
insert into auth.sessions(id,user_id,created_at,updated_at) select s1,owner_id,clock_timestamp(),clock_timestamp() from ho union all select s2,owner_id,clock_timestamp()+interval '1 second',clock_timestamp()+interval '1 second' from ho union all select s3,owner_id,clock_timestamp()+interval '2 seconds',clock_timestamp()+interval '2 seconds' from ho union all select s4,owner_id,clock_timestamp()+interval '3 seconds',clock_timestamp()+interval '3 seconds' from ho union all select sa,admin_id,clock_timestamp(),clock_timestamp() from ho;
insert into public.device_sessions(id,profile_id,device_fingerprint_hash,device_label,started_at,last_seen_at) select sa,admin_id,extensions.digest(sa::text,'sha256'),'Handover admin',clock_timestamp(),clock_timestamp() from ho;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
update ho set t1=public.reserve_login_attempt('handover.owner.test@gmail.com'),t2=public.reserve_login_attempt('handover.owner.test@gmail.com'),t3=public.reserve_login_attempt('handover.owner.test@gmail.com');
select public.complete_login_attempt(t1,'success',s1) from ho;
select public.complete_login_attempt(t2,'success',s2) from ho;
insert into public.device_sessions(id,profile_id,device_fingerprint_hash,device_label,started_at,last_seen_at) select s1,owner_id,extensions.digest(s1::text,'sha256'),'Source one',clock_timestamp(),clock_timestamp() from ho on conflict do nothing;
insert into public.device_sessions(id,profile_id,device_fingerprint_hash,device_label,started_at,last_seen_at) select s2,owner_id,extensions.digest(s2::text,'sha256'),'Source two',clock_timestamp(),clock_timestamp() from ho on conflict do nothing;
select ok((select count(*)=2 from public.device_sessions where profile_id=(select owner_id from ho) and status='active'),'source retains its approved device capacity');
insert into public.approval_requests(request_type,module,requester_id,target_type,target_id,current_data,proposed_data,reason,status,deadline_at)
select 'device_login','Account Management',owner_id,'profile',owner_id::text,'{}'::jsonb,jsonb_build_object('sessionId',s4::text,'deviceLabel','Handover fixture','startedAt',clock_timestamp()),'Handover fixture','pending',clock_timestamp()+interval '1 hour' from ho;
update ho set request_id=(select id from public.approval_requests where requester_id=(select owner_id from ho) and status='pending' and request_type='device_login' order by id desc limit 1);
select ok(request_id is not null,'pending approval is selected for handover') from ho;
select ok((select requester_id=(select owner_id from ho) and status='pending' from public.approval_requests where id=(select request_id from ho)),'selected approval belongs to source');
select set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','session_id',s1)::text,true) from ho;
update ho set hid=public.create_handover(admin_id,clock_timestamp(),clock_timestamp()+interval '1 hour',array[request_id],'Owner temporarily unavailable');
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','session_id',sa)::text,true) from ho;
select public.decide_handover(hid,true,'Admin approved temporary responsibility') from ho;
select is((select status from public.handover_requests where id=(select hid from ho)),'approved','handover approval is recorded');
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','session_id',sa)::text,true) from ho;
select public.decide_device_login(request_id,true,'Temporary Account Management handover') from ho;
select is((select status from public.approval_requests where id=(select request_id from ho)),'approved','successor can act only on selected approval');
select ok((select status='active' from public.device_sessions where id=(select s4 from ho)),'successor approval admits selected device');
select throws_ok($$select public.decide_device_login(request_id,true,'Replay') from ho$$,'P0001','Request is not pending','selected approval cannot replay');
select public.revoke_handover(hid,'Owner returned') from ho;
select is((select status from public.handover_requests where id=(select hid from ho)),'revoked','handover is explicitly revocable');
select * from finish();
rollback;
