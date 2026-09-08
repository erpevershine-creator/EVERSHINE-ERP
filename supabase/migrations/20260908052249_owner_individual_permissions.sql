-- Owner-approved additive grants remain separate from each account's role snapshot.
alter table public.profiles add column individual_pages jsonb not null default '{}' check(jsonb_typeof(individual_pages)='object'),
 add column individual_actions jsonb not null default '{}' check(jsonb_typeof(individual_actions)='object');

create function private.merge_permission_actions(p_base jsonb,p_extra jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select coalesce(jsonb_object_agg(module,actions),'{}') from (
 select module,jsonb_agg(action order by action) actions from (
 select distinct m.key module,a.value action from jsonb_each(p_base) m cross join lateral jsonb_array_elements_text(m.value) a
 union select distinct m.key,a.value from jsonb_each(p_extra) m cross join lateral jsonb_array_elements_text(m.value) a
 ) permissions group by module) grouped;
$$;
create function private.permission_snapshot(p_id uuid,p_pages jsonb,p_actions jsonb) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('pages',p_pages || coalesce((select jsonb_object_agg(page_id,can_view) from public.user_page_overrides where profile_id=p_id),'{}') || p.individual_pages,
 'actions',private.merge_permission_actions(p_actions,p.individual_actions)) from public.profiles p where p.id=p_id;
$$;
revoke all on function private.merge_permission_actions(jsonb,jsonb),private.permission_snapshot(uuid,jsonb,jsonb) from public,anon,authenticated,service_role;

create or replace function private.can_view_page(requested_page text) returns boolean
language sql stable security definer set search_path='' as $$
 select private.is_active_user() and exists(select 1 from public.profiles p where p.id=auth.uid() and
 (p.erp_role='owner' or coalesce((p.individual_pages->>requested_page)::boolean,false) or coalesce(
 (select can_view from public.user_page_overrides where profile_id=p.id and page_id=requested_page),(p.page_access->>requested_page)::boolean,false)));
$$;
create or replace function private.has_action(requested_module text,requested_action text) returns boolean
language sql stable security definer set search_path='' as $$
 select private.is_active_user() and exists(select 1 from public.profiles p where p.id=auth.uid() and
 (p.erp_role='owner' or coalesce(p.action_access->requested_module,'[]') ? requested_action
 or coalesce(p.action_access->requested_module,'[]') ? '*' or coalesce(p.action_access->'*','[]') ? '*'
 or coalesce(p.individual_actions->requested_module,'[]') ? requested_action));
$$;
create or replace function public.my_access() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p public.profiles; result jsonb;
begin
 if not private.is_active_user() then return null; end if;
 select * into p from public.profiles where id=auth.uid();
 select jsonb_object_agg(id,private.can_view_page(id)) into result from public.pages where is_active;
 return jsonb_build_object('id',p.id,'employeeName',p.employee_name,'username',p.username,'role',p.erp_role,
 'pages',result,'actions',private.merge_permission_actions(p.action_access,p.individual_actions));
end; $$;

create function public.get_individual_permissions(p_profile uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p public.profiles;
begin
 if not private.is_owner() then raise exception 'Only Owner can manage individual permissions' using errcode='42501'; end if;
 select * into p from public.profiles where id=p_profile and erp_role<>'owner' and status<>'inactive';
 if not found then raise exception 'Account unavailable'; end if;
 return jsonb_build_object('id',p.id,'version',p.version,
 'basePages',p.page_access || coalesce((select jsonb_object_agg(page_id,can_view) from public.user_page_overrides where profile_id=p.id),'{}'),
 'baseActions',p.action_access,'extraPages',p.individual_pages,'extraActions',p.individual_actions);
end; $$;

create function public.approve_individual_permissions(p_profile uuid,p_expected integer,p_pages jsonb,p_actions jsonb,p_reason text) returns bigint
language plpgsql security definer set search_path='' as $$
declare p public.profiles; r bigint; before_access jsonb; after_access jsonb;
begin
 if not private.is_owner() then raise exception 'Only Owner can manage individual permissions' using errcode='42501'; end if;
 if p_reason is null or length(btrim(p_reason)) not between 1 and 1000 or p_expected is null
 or p_pages is null or p_actions is null or jsonb_typeof(p_pages)<>'object' or jsonb_typeof(p_actions)<>'object' then raise exception 'Invalid individual permission request'; end if;
 if exists(select 1 from jsonb_each(p_pages) where value<>'true'::jsonb or key not in (select id from public.pages where is_active)) then raise exception 'Additional pages must be valid grants'; end if;
 if exists(select 1 from jsonb_each(p_actions) where jsonb_typeof(value)<>'array' or key not in (select label from public.pages where is_active)) then raise exception 'Invalid additional actions'; end if;
 if exists(select 1 from jsonb_each(p_actions) m cross join lateral jsonb_array_elements(m.value) a
 where jsonb_typeof(a.value)<>'string' or a.value #>> '{}' not in ('view','create','edit','approve','export','change_password','unlock','approve_device','disable','reenable')) then raise exception 'Invalid additional actions'; end if;
 select * into p from public.profiles where id=p_profile for update;
 if not found or p.erp_role='owner' or p.status='inactive' then raise exception 'Account unavailable'; end if;
 if p.version<>p_expected then raise exception 'Account changed; reload before approving'; end if;
 before_access:=private.permission_snapshot(p.id,p.page_access,p.action_access) || jsonb_build_object('extraPages',p.individual_pages,'extraActions',p.individual_actions);
 update public.profiles set individual_pages=p_pages,individual_actions=p_actions,version=version+1 where id=p.id;
 after_access:=private.permission_snapshot(p.id,p.page_access,p.action_access) || jsonb_build_object('extraPages',p_pages,'extraActions',p_actions);
 insert into public.approval_requests(request_type,module,requester_id,target_type,target_id,current_data,proposed_data,reason,status,decided_by,decided_at,decision_reason)
 values('individual_permissions','Positions & Permissions',auth.uid(),'profile',p.id::text,before_access,after_access,btrim(p_reason),'approved',auth.uid(),now(),btrim(p_reason)) returning id into r;
 insert into public.approval_request_accounts(request_id,profile_id,expected_profile_version,before_pages,after_pages,account_name,before_actions,after_actions)
 values(r,p.id,p.version,before_access->'pages',after_access->'pages',p.employee_name,before_access->'actions',after_access->'actions');
 perform private.audit('Individual permissions approved','profile',p.id::text,btrim(p_reason),before_access,after_access,r);
 insert into public.notifications(recipient_id,notification_type,title,message,approval_request_id)
 values(p.id,'approval','Individual permissions updated',btrim(p_reason),r);
 return r;
end; $$;
revoke all on function public.get_individual_permissions(uuid),public.approve_individual_permissions(uuid,integer,jsonb,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.get_individual_permissions(uuid),public.approve_individual_permissions(uuid,integer,jsonb,jsonb,text) to authenticated;

create or replace function public.draft_permission_change(p_position bigint,p_expected integer,p_pages jsonb,p_actions jsonb,p_accounts uuid[],p_reason text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare pos public.positions; r bigint; p public.profiles; old jsonb; proposed jsonb;
begin
 perform private.require_admin('Positions & Permissions','edit');
 select * into pos from public.positions where id=p_position for update;
 if not found or pos.is_owner_position or pos.version<>p_expected then raise exception 'Position changed; refresh before requesting'; end if;
 if p_pages is null or p_actions is null or p_accounts is null or p_reason is null or length(btrim(p_reason)) not between 1 and 1000 or jsonb_typeof(p_pages)<>'object' or jsonb_typeof(p_actions)<>'object' then raise exception 'Invalid request'; end if;
 if exists(select 1 from jsonb_each(p_pages) where jsonb_typeof(value)<>'boolean' or key not in (select id from public.pages)) then raise exception 'Invalid page permissions'; end if;
 if exists(select 1 from jsonb_each(p_actions) where jsonb_typeof(value)<>'array') then raise exception 'Invalid actions'; end if;
 if exists(select 1 from jsonb_each(p_actions) m cross join lateral jsonb_array_elements_text(m.value) a
 where m.key not in (select label from public.pages) or a.value not in ('view','create','edit','approve','export','change_password','unlock','approve_device','disable','reenable')) then raise exception 'Invalid action permissions'; end if;
 proposed:=jsonb_build_object('pages',p_pages,'actions',p_actions);
 if not private.can_delegate(proposed) then raise exception 'Requested access exceeds your authority'; end if;
 old:=private.template_access(p_position);
 if not private.can_delegate(old) then raise exception 'Position exceeds your current authority'; end if;
 insert into public.approval_requests(request_type,module,requester_id,target_type,target_id,current_data,proposed_data,reason)
 values('position_permissions','Positions & Permissions',auth.uid(),'position',p_position::text,old,proposed,p_reason) returning id into r;
 insert into public.position_permission_changes values(r,p_position,pos.version,old->'pages',p_pages);
 for p in select * from public.profiles where id=any(p_accounts) order by id for update loop
 if p.position_id<>p_position or p.erp_role='owner' or not private.can_delegate(private.permission_snapshot(p.id,p.page_access,p.action_access)) then raise exception 'Selected account does not belong to position'; end if;
 insert into public.approval_request_accounts(request_id,profile_id,expected_profile_version,before_pages,after_pages,account_name,before_actions,after_actions)
 values(r,p.id,p.version,private.permission_snapshot(p.id,p.page_access,p.action_access)->'pages',private.permission_snapshot(p.id,p_pages,p_actions)->'pages',p.employee_name,private.permission_snapshot(p.id,p.page_access,p.action_access)->'actions',private.permission_snapshot(p.id,p_pages,p_actions)->'actions');
 end loop;
 if (select count(*) from public.approval_request_accounts where request_id=r)<>(select count(distinct x) from unnest(p_accounts) x) then raise exception 'Selected account unavailable'; end if;
 perform private.audit('Permission draft created','position',p_position::text,p_reason,old,proposed,r);
 return r;
end; $$;

create or replace function public.decide_permission_change(p_request bigint,p_approve boolean,p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.approval_requests; c public.position_permission_changes; pos public.positions; a record;
begin
 perform private.require_admin('Positions & Permissions','approve');
 if p_approve is null or p_reason is null or length(btrim(p_reason)) not between 1 and 1000 then raise exception 'Decision reason required'; end if;
 select * into r from public.approval_requests where id=p_request for update;
 if not found or r.request_type<>'position_permissions' or r.status<>'pending' then raise exception 'Request is not pending'; end if;
 if r.requester_id=auth.uid() and not private.is_owner() then raise exception 'Only Owner may self-approve'; end if;
 if p_approve then
 if not private.can_delegate(r.proposed_data) then raise exception 'Approval exceeds your authority'; end if;
 select * into c from public.position_permission_changes where request_id=p_request;
 select * into pos from public.positions where id=c.position_id for update;
 if not private.can_delegate(private.template_access(pos.id)) then raise exception 'Position exceeds your authority'; end if;
 if pos.version<>c.expected_position_version or pos.is_owner_position then raise exception 'Stale position; create a fresh request'; end if;
 for a in select p.id,p.version,p.position_id,p.page_access,p.action_access,ra.expected_profile_version from public.approval_request_accounts ra
 join public.profiles p on p.id=ra.profile_id where ra.request_id=p_request order by p.id for update of p loop
 if not private.can_delegate(private.permission_snapshot(a.id,a.page_access,a.action_access)) then raise exception 'Account exceeds your authority'; end if;
 if a.version<>a.expected_profile_version or a.position_id<>pos.id then raise exception 'Stale account; create a fresh request'; end if;
 end loop;
 update public.positions set version=version+1 where id=pos.id;
 delete from public.position_page_permissions where position_id=pos.id;
 insert into public.position_page_permissions(position_id,page_id,can_view)
 select pos.id,id,coalesce((r.proposed_data->'pages'->>id)::boolean,false) from public.pages;
 delete from public.position_action_permissions where position_id=pos.id;
 insert into public.position_action_permissions(position_id,module,action,allowed)
 select distinct pos.id,m.key,permission_action.value,true from jsonb_each(r.proposed_data->'actions') m cross join lateral jsonb_array_elements_text(m.value) permission_action;
 update public.profiles set page_access=r.proposed_data->'pages',action_access=r.proposed_data->'actions',version=version+1
 where id in (select profile_id from public.approval_request_accounts where request_id=p_request);
 end if;
 update public.approval_requests set status=case when p_approve then 'approved' else 'rejected' end,
 decided_by=auth.uid(),decided_at=now(),decision_reason=p_reason,version=version+1 where id=p_request;
 insert into public.notifications(recipient_id,notification_type,title,message,approval_request_id)
 values(r.requester_id,'approval',case when p_approve then 'Permission request approved' else 'Permission request rejected' end,p_reason,p_request);
 perform private.audit(case when p_approve then 'Permission request approved' else 'Permission request rejected' end,'position',r.target_id,p_reason,r.current_data,r.proposed_data,p_request);
end; $$;

create or replace function public.change_account_status(p_id uuid,p_action text,p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.profiles; next_status text;
begin
 if p_action not in ('disable','reenable','unlock') or length(btrim(p_reason)) not between 1 and 1000 then raise exception 'Action and reason required'; end if;
 perform private.require_admin('Account Management',p_action);
 select * into p from public.profiles where id=p_id for update;
 if not found or p.erp_role='owner' or p.id=auth.uid() then raise exception 'This account cannot be changed here'; end if;
 if p.erp_role='admin' and not private.is_owner() then raise exception 'Only Owner may change Admin access'; end if;
 if not private.can_delegate(private.permission_snapshot(p.id,p.page_access,p.action_access)) then raise exception 'Account exceeds your scope'; end if;
 if (p_action='disable' and p.status not in ('active','locked')) or (p_action='reenable' and p.status<>'disabled')
 or (p_action='unlock' and p.status<>'locked') then raise exception 'Account state changed; refresh'; end if;
 next_status:=case when p_action='disable' then 'disabled' else 'active' end;
 update public.profiles set status=next_status,failed_login_attempts=0,sessions_valid_after=clock_timestamp(),
 disabled_at=case when next_status='disabled' then now() end,disabled_by=case when next_status='disabled' then auth.uid() end,
 version=version+1 where id=p_id;
 update public.device_sessions set status='logged_out',ended_at=now(),ended_reason=p_action where profile_id=p_id and status in ('active','pending');
 perform private.audit('Account '||p_action,'profile',p_id::text,p_reason,jsonb_build_object('status',p.status),jsonb_build_object('status',next_status));
end; $$;

create or replace function public.submit_permission_change(p_request bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.approval_requests;
begin
 perform private.require_admin('Positions & Permissions','edit');
 select * into r from public.approval_requests where id=p_request for update;
 if not found or r.request_type<>'position_permissions' or r.requester_id<>auth.uid() or r.status<>'draft' then raise exception 'Draft unavailable'; end if;
 if not private.can_delegate(r.proposed_data) then raise exception 'Your authority changed'; end if;
 update public.approval_requests set status='pending',version=version+1 where id=p_request;
 insert into public.notifications(recipient_id,notification_type,title,message,approval_request_id)
 select id,'approval','Permission approval requested',r.reason,p_request from public.profiles
 where status='active' and (erp_role='owner' or (erp_role='admin' and private.merge_permission_actions(action_access,individual_actions)->'Positions & Permissions' ? 'approve'));
 perform private.audit('Permission request submitted','position',r.target_id,r.reason,r.current_data,r.proposed_data,p_request);
end; $$;

create or replace function public.record_login_attempt(p_username text,p_success boolean,p_session uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.profiles;
begin
 if auth.role()<>'service_role' then raise exception 'Server only'; end if;
 select * into p from public.profiles where username=lower(p_username) for update;
 if not found or p.status<>'active' then return; end if;
 if p_success then
 if not exists(select 1 from auth.sessions where id=p_session and user_id=p.id and created_at>=p.sessions_valid_after) or p.recovery_pending or p.password_expires_at<=now() then return; end if;
 update public.profiles set failed_login_attempts=0 where id=p.id;
 insert into public.device_sessions(id,profile_id,device_fingerprint_hash,device_label)
 values(p_session,p.id,extensions.digest(p_session::text,'sha256'),'ERP sign-in') on conflict(id) do nothing;
 else
 update public.profiles set failed_login_attempts=least(5,failed_login_attempts+1),
 status=case when failed_login_attempts>=4 then 'locked' else status end,
 sessions_valid_after=case when failed_login_attempts>=4 then clock_timestamp() else sessions_valid_after end where id=p.id;
 if p.failed_login_attempts>=4 then
 insert into public.audit_events(actor_id,actor_name,action,entity_type,entity_id,reason)
 values(p.id,p.employee_name,'Account locked','profile',p.id::text,'Five failed password attempts');
 insert into public.notifications(recipient_id,notification_type,title,message)
 select id,'security','Account locked',p.employee_name||' requires account review.' from public.profiles
 where status='active' and (erp_role='owner' or (erp_role='admin' and private.merge_permission_actions(action_access,individual_actions)->'Account Management' ? 'unlock'));
 end if;
 end if;
end; $$;
notify pgrst,'reload schema';
