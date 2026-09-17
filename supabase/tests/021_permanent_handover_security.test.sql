begin;
select no_plan();
-- Transaction-only fixture isolation; restored by the final rollback.
update public.profiles set status='inactive',disabled_at=null where erp_role='owner';
create temp table hx(o uuid default gen_random_uuid(),s uuid default gen_random_uuid(),n uuid default gen_random_uuid(),os uuid default gen_random_uuid(),ss uuid default gen_random_uuid(),ns uuid default gen_random_uuid(),item bigint,rid bigint);
insert into hx default values;
insert into auth.users(id,email,role,aud,email_confirmed_at)
select o,'handover.owner@gmail.com','authenticated','authenticated',now() from hx union all select s,'handover.source@gmail.com','authenticated','authenticated',now() from hx union all select n,'handover.next@gmail.com','authenticated','authenticated',now() from hx;
insert into public.profiles(id,employee_name,company_position,position_id,department,erp_role,username,contact,avatar_path)
select o,'Handover Owner','Owner',(select id from public.positions where erp_role_code='owner'),'Test','owner','handover.owner@gmail.com','test',o||'/photo.png' from hx
union all select s,'Handover Source','Operations Manager',(select id from public.positions where erp_role_code='admin'),'Test','admin','handover.source@gmail.com','test',s||'/photo.png' from hx
union all select n,'Handover Next','Sales',(select id from public.positions where erp_role_code='sales'),'Test','sales','handover.next@gmail.com','test',n||'/photo.png' from hx;
update public.profiles set individual_pages='{"audit":true}',individual_actions='{"Audit & History":["view"]}' where id=(select s from hx);
update public.profiles set individual_pages='{"notifications":true}',individual_actions='{"Notifications":["view"]}' where id=(select n from hx);
insert into auth.sessions(id,user_id,created_at,updated_at) select os,o,clock_timestamp(),clock_timestamp() from hx union all select ss,s,clock_timestamp(),clock_timestamp() from hx union all select ns,n,clock_timestamp(),clock_timestamp() from hx;
insert into public.device_sessions(id,profile_id,device_fingerprint_hash,device_label,started_at,last_seen_at) select os,o,extensions.digest(os::text,'sha256'),'Owner',clock_timestamp(),clock_timestamp() from hx union all select ss,s,extensions.digest(ss::text,'sha256'),'Source',clock_timestamp(),clock_timestamp() from hx union all select ns,n,extensions.digest(ns::text,'sha256'),'Next',clock_timestamp(),clock_timestamp() from hx;
insert into public.approval_requests(request_type,module,requester_id,target_type,target_id,current_data,proposed_data,reason,status,deadline_at)
select 'device_login','Account Management',s,'profile',s::text,'{}','{}','Selected source responsibility','pending',clock_timestamp()+interval '1 day' from hx;
update hx set item=(select id from public.approval_requests where requester_id=s order by id desc limit 1);
insert into public.user_page_overrides(profile_id,page_id,can_view,reason,approved_request_id) select s,'dashboard',false,'Reviewed source override',item from hx;
select set_config('request.jwt.claims',jsonb_build_object('sub',o,'role','authenticated','session_id',os)::text,true) from hx;
select throws_ok($$select public.request_permanent_handover(o,n,1,1,'{}','Try Owner') from hx$$,'P0001','Owner identity cannot be transferred','sole Owner preserved');
select throws_ok($$select public.request_permanent_handover(s,s,1,1,'{}','Same identity') from hx$$,'P0001','Invalid permanent handover','distinct successor required');
select throws_ok($$select public.request_permanent_handover(s,n,1,1,array[item,item],'Duplicate') from hx$$,'P0001','Invalid permanent handover','duplicate selected items rejected');
select throws_ok($$select public.request_permanent_handover(s,n,1,1,array[null::bigint],'Null item') from hx$$,'P0001','Invalid permanent handover','null selected item rejected');
select throws_ok($$select public.request_permanent_handover(s,n,1,1,array[-1::bigint],'Missing item') from hx$$,'P0001','Only selected pending source responsibilities may transfer','missing selected item rejected');
update hx set rid=public.request_permanent_handover(s,n,1,1,array[item],'Owner reviews merged permissions');
update public.profiles set action_access='{"Account Management":["handover"]}' where id=(select s from hx);
select set_config('request.jwt.claims',jsonb_build_object('sub',s,'role','authenticated','session_id',ss)::text,true) from hx;
select throws_ok($$select public.decide_permanent_handover(rid,true,'Admin attempts merged grant approval') from hx$$,'P0001','Owner must reapprove merged individual permissions','Admin cannot approve merged grants');
select set_config('request.jwt.claims',jsonb_build_object('sub',o,'role','authenticated','session_id',os)::text,true) from hx;
-- Restore the exact captured base so this fixture continues testing target staleness.
update public.profiles set action_access=(select current_data->'source'->'baseActions' from public.approval_requests where id=(select rid from hx)) where id=(select s from hx);
select is((select status from public.profiles where id=(select s from hx)),'active','source stays active while pending');
select is((select erp_role from public.profiles where id=(select n from hx)),'sales','successor stays unchanged while pending');
select ok((select proposed_data->'extraPages' @> '{"audit":true,"notifications":true}' from public.approval_requests where id=(select rid from hx)),'both individual grants in review snapshot');
select throws_ok($$select public.decide_permanent_handover(rid,null,'Null decision') from hx$$,'P0001','Decision reason required','null decision rejected');
update public.profiles set version=version+1 where id=(select n from hx);
select throws_ok($$select public.decide_permanent_handover(rid,true,'Stale approval') from hx$$,'P0001','Handover snapshot is stale','stale target fails atomically');
select is((select status from public.profiles where id=(select s from hx)),'active','failed approval does not inactivate source');
select public.decide_permanent_handover(rid,false,'Reject stale request') from hx;
update hx set rid=public.request_permanent_handover(s,n,1,2,array[item],'Fresh review');
select is((select public.decide_permanent_handover(rid,true,'Owner reapproves merged grants') from hx),'approved','reviewed transfer commits');
select is((select status from public.profiles where id=(select s from hx)),'inactive','source inactive after commit');
select is((select erp_role from public.profiles where id=(select n from hx)),'admin','source ERP role transferred');
select is((select company_position from public.profiles where id=(select n from hx)),'Operations Manager','descriptive position transferred');
select is((select username::text from public.profiles where id=(select n from hx)),'handover.next@gmail.com','successor identity preserved');
select ok((select individual_pages @> '{"audit":true,"notifications":true}' from public.profiles where id=(select n from hx)),'merged individual permissions applied');
select is((select count(*) from public.device_sessions where id in ((select ss from hx),(select ns from hx)) and status='logged_out'),2::bigint,'source revoked and successor reauthentication required');
select is((select requester_id from public.approval_requests where id=(select item from hx)),(select s from hx),'original requester preserved');
select is((select approved_request_id from public.user_page_overrides where profile_id=(select n from hx) and page_id='dashboard'),(select rid from hx),'transferred override binds the new approval');
select throws_ok($$select public.decide_permanent_handover(rid,true,'Replay') from hx$$,'P0001','Handover request unavailable','decision replay denied');
select is((select count(*) from public.audit_events where approval_request_id=(select rid from hx) and action='Permanent handover completed'),1::bigint,'single completion audit');
select set_config('request.jwt.claims',jsonb_build_object('sub',s,'role','authenticated','session_id',ss)::text,true) from hx;
select ok(not private.is_active_user(),'old source JWT is fenced after handover');
update hx set ns=gen_random_uuid();
insert into auth.sessions(id,user_id,created_at,updated_at) select ns,n,clock_timestamp(),clock_timestamp() from hx;
insert into public.device_sessions(id,profile_id,device_fingerprint_hash,device_label,started_at,last_seen_at) select ns,n,extensions.digest(ns::text,'sha256'),'Successor new login',clock_timestamp(),clock_timestamp() from hx;
select set_config('request.jwt.claims',jsonb_build_object('sub',n,'role','authenticated','session_id',ns)::text,true) from hx;
select ok(private.has_action('Audit & History','view'),'successor grant works after source inactivation and fresh sign-in');
select * from finish();
rollback;
