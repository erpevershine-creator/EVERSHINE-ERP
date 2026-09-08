-- Live identity access: per-account snapshots, audited commands, recovery fencing.
alter table public.profiles add column page_access jsonb not null default '{}',
  add column action_access jsonb not null default '{}',
  add column sessions_valid_after timestamptz not null default '-infinity',
  add column recovery_pending boolean not null default false;
alter table public.approval_request_accounts add column account_name text not null default '',
 add column before_actions jsonb not null default '{}',add column after_actions jsonb not null default '{}';

create function private.template_access(p_position bigint) returns jsonb
language sql stable security definer set search_path = '' as $$
select jsonb_build_object(
 'pages', coalesce((select jsonb_object_agg(page_id,can_view) from public.position_page_permissions where position_id=p_position),'{}'),
 'actions', coalesce((select jsonb_object_agg(module,actions) from (
   select module,jsonb_agg(action order by action) actions from public.position_action_permissions
   where position_id=p_position and allowed group by module) x),'{}'));
$$;
update public.profiles set page_access=private.template_access(position_id)->'pages',
 action_access=private.template_access(position_id)->'actions';
create function private.initialize_profile_access() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 new.page_access:=private.template_access(new.position_id)->'pages';
 new.action_access:=private.template_access(new.position_id)->'actions';
 return new;
end; $$;
create trigger initialize_profile_access before insert on public.profiles
for each row execute function private.initialize_profile_access();

create or replace function private.is_active_user() returns boolean
language sql stable security definer set search_path = '' as $$
select exists(select 1 from public.profiles p join auth.sessions s on s.user_id=p.id
 where p.id=auth.uid() and p.status='active' and not p.recovery_pending
 and p.password_expires_at>now() and s.id::text=auth.jwt()->>'session_id'
 and s.created_at>=p.sessions_valid_after);
$$;
create or replace function private.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
select private.is_active_user() and exists(select 1 from public.profiles where id=auth.uid() and erp_role='owner');
$$;
create or replace function private.has_action(requested_module text, requested_action text) returns boolean
language sql stable security definer set search_path = '' as $$
select private.is_active_user() and exists(select 1 from public.profiles p where p.id=auth.uid() and
 (p.erp_role='owner' or coalesce(p.action_access->requested_module,'[]') ? requested_action
 or coalesce(p.action_access->requested_module,'[]') ? '*' or coalesce(p.action_access->'*','[]') ? '*'));
$$;
create or replace function private.can_view_page(requested_page text) returns boolean
language sql stable security definer set search_path = '' as $$
select private.is_active_user() and exists(select 1 from public.profiles p where p.id=auth.uid() and
 (p.erp_role='owner' or coalesce((select can_view from public.user_page_overrides where profile_id=p.id and page_id=requested_page),
 (p.page_access->>requested_page)::boolean,false)));
$$;
-- A restrictive policy closes old self-read paths for locked/revoked sessions.
do $$ declare t text; begin
 foreach t in array array['app_settings','locations','positions','pages','position_page_permissions',
 'position_action_permissions','profiles','approval_requests','position_permission_changes',
 'approval_request_accounts','user_page_overrides','audit_events','notifications','device_sessions'] loop
 execute format('create policy active_session_required on public.%I as restrictive for all to authenticated using ((select private.is_active_user())) with check ((select private.is_active_user()))',t);
 end loop;
end $$;

create function public.my_access() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare p public.profiles; result jsonb;
begin
 if not private.is_active_user() then return null; end if;
 select * into p from public.profiles where id=auth.uid();
 select jsonb_object_agg(id,private.can_view_page(id)) into result from public.pages where is_active;
 return jsonb_build_object('id',p.id,'employeeName',p.employee_name,'username',p.username,'role',p.erp_role,
 'pages',result,'actions',p.action_access);
end; $$;

create function private.require_admin(p_module text,p_action text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
 if not private.has_action(p_module,p_action) or not exists(select 1 from public.profiles
 where id=auth.uid() and erp_role in ('owner','admin')) then
 raise exception 'Permission denied' using errcode='42501'; end if;
end; $$;
create function private.audit(p_action text,p_entity text,p_id text,p_reason text,p_before jsonb default null,p_after jsonb default null,p_request bigint default null)
returns void language sql security definer set search_path = '' as $$
insert into public.audit_events(actor_id,actor_name,action,entity_type,entity_id,reason,before_data,after_data,approval_request_id)
select id,employee_name,p_action,p_entity,p_id,p_reason,p_before,p_after,p_request from public.profiles where id=auth.uid();
$$;
create function private.can_delegate(p_access jsonb) returns boolean
language sql stable security definer set search_path = '' as $$
select private.is_owner() or (
 not exists(select 1 from jsonb_each_text(p_access->'pages') where value='true' and not private.can_view_page(key))
 and not exists(select 1 from jsonb_each(p_access->'actions') m cross join lateral jsonb_array_elements_text(m.value) a
 where not private.has_action(m.key,a.value)));
$$;

create function public.create_position(p_name text,p_code text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare result bigint;
begin
 perform private.require_admin('Positions & Permissions','create');
 if length(btrim(p_name)) not between 1 and 120 then raise exception 'Invalid position name'; end if;
 insert into public.positions(code,name) values(p_code,btrim(p_name)) returning id into result;
 insert into public.position_page_permissions(position_id,page_id,can_view) select result,id,false from public.pages;
 perform private.audit('Position created','position',result::text,'New position with no access');
 return result;
end; $$;

create function public.provision_employee(p_id uuid,p_position bigint,p_name text,p_department text,p_role text,p_username text,p_contact text,p_avatar text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); template jsonb;
begin
 perform private.require_admin('Account Management','create');
 if p_role not in ('admin','employee') or (p_role='admin' and not private.is_owner()) then raise exception 'Only Owner can appoint Admins'; end if;
 perform 1 from public.positions where id=p_position and is_active and not is_owner_position for update;
 if not found then raise exception 'Invalid position'; end if;
 template:=private.template_access(p_position);
 if not private.can_delegate(template) then raise exception 'Position exceeds your authority'; end if;
 if length(p_name) not between 1 and 120 or length(p_department) not between 1 and 120 or length(p_contact) not between 1 and 120 then raise exception 'Invalid account details'; end if;
 if p_avatar not like p_id::text||'/%' then raise exception 'Invalid photo'; end if;
 -- The server tags newly created Auth accounts. A caller cannot attach an unrelated Auth user.
 if not exists(select 1 from auth.users where id=p_id and lower(email)=lower(p_username)
 and raw_app_meta_data->>'provisioned_by'=actor::text and email_confirmed_at is not null)
 then raise exception 'Account provisioning mismatch'; end if;
 insert into public.profiles(id,employee_name,position_id,department,erp_role,username,contact,avatar_path,created_by)
 values(p_id,btrim(p_name),p_position,btrim(p_department),p_role,lower(p_username),btrim(p_contact),p_avatar,actor);
 perform private.audit('Account created','profile',p_id::text,'Company-assigned account',null,jsonb_build_object('name',p_name,'position',p_position,'role',p_role));
 return p_id;
end; $$;

create function public.change_account_status(p_id uuid,p_action text,p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.profiles; next_status text;
begin
 if p_action not in ('disable','reenable','unlock') or length(btrim(p_reason)) not between 1 and 1000 then raise exception 'Action and reason required'; end if;
 perform private.require_admin('Account Management',p_action);
 select * into p from public.profiles where id=p_id for update;
 if not found or p.erp_role='owner' or p.id=auth.uid() then raise exception 'This account cannot be changed here'; end if;
 if p.erp_role='admin' and not private.is_owner() then raise exception 'Only Owner may change Admin access'; end if;
 if not private.can_delegate(jsonb_build_object('pages',p.page_access,'actions',p.action_access)) then raise exception 'Account exceeds your scope'; end if;
 if (p_action='disable' and p.status not in ('active','locked')) or (p_action='reenable' and p.status<>'disabled')
 or (p_action='unlock' and p.status<>'locked') then raise exception 'Account state changed; refresh'; end if;
 next_status:=case when p_action='disable' then 'disabled' else 'active' end;
 update public.profiles set status=next_status,failed_login_attempts=0,sessions_valid_after=clock_timestamp(),
 disabled_at=case when next_status='disabled' then now() end,disabled_by=case when next_status='disabled' then auth.uid() end,
 version=version+1 where id=p_id;
 update public.device_sessions set status='logged_out',ended_at=now(),ended_reason=p_action where profile_id=p_id and status in ('active','pending');
 perform private.audit('Account '||p_action,'profile',p_id::text,p_reason,jsonb_build_object('status',p.status),jsonb_build_object('status',next_status));
end; $$;

create function public.draft_permission_change(p_position bigint,p_expected integer,p_pages jsonb,p_actions jsonb,p_accounts uuid[],p_reason text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare pos public.positions; r bigint; p public.profiles; old jsonb; proposed jsonb;
begin
 perform private.require_admin('Positions & Permissions','edit');
 select * into pos from public.positions where id=p_position for update;
 if not found or pos.is_owner_position or pos.version<>p_expected then raise exception 'Position changed; refresh before requesting'; end if;
 if length(btrim(p_reason)) not between 1 and 1000 or jsonb_typeof(p_pages)<>'object' or jsonb_typeof(p_actions)<>'object' then raise exception 'Invalid request'; end if;
 if exists(select 1 from jsonb_each(p_pages) where jsonb_typeof(value)<>'boolean' or key not in (select id from public.pages)) then raise exception 'Invalid page permissions'; end if;
 if exists(select 1 from jsonb_each(p_actions) where jsonb_typeof(value)<>'array') then raise exception 'Invalid actions'; end if;
 if exists(select 1 from jsonb_each(p_actions) m cross join lateral jsonb_array_elements_text(m.value) a
 where m.key not in (select label from public.pages) or a.value not in ('view','create','edit','approve','export','change_password','unlock','approve_device','disable','reenable')) then raise exception 'Invalid action permissions'; end if;
 proposed:=jsonb_build_object('pages',p_pages,'actions',p_actions);
 if not private.can_delegate(proposed) then raise exception 'Requested access exceeds your authority'; end if;
 old:=private.template_access(p_position);
 insert into public.approval_requests(request_type,module,requester_id,target_type,target_id,current_data,proposed_data,reason)
 values('position_permissions','Positions & Permissions',auth.uid(),'position',p_position::text,old,proposed,p_reason) returning id into r;
 insert into public.position_permission_changes values(r,p_position,pos.version,old->'pages',p_pages);
 for p in select * from public.profiles where id=any(p_accounts) order by id for update loop
 if p.position_id<>p_position or p.erp_role='owner' then raise exception 'Selected account does not belong to position'; end if;
 insert into public.approval_request_accounts(request_id,profile_id,expected_profile_version,before_pages,after_pages,account_name,before_actions,after_actions)
 values(r,p.id,p.version,p.page_access,p_pages,p.employee_name,p.action_access,p_actions);
 end loop;
 if (select count(*) from public.approval_request_accounts where request_id=r)<>(select count(distinct x) from unnest(p_accounts) x) then raise exception 'Selected account unavailable'; end if;
 perform private.audit('Permission draft created','position',p_position::text,p_reason,old,proposed,r);
 return r;
end; $$;

create function public.submit_permission_change(p_request bigint) returns void
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
 where status='active' and (erp_role='owner' or (erp_role='admin' and action_access->'Positions & Permissions' ? 'approve'));
 perform private.audit('Permission request submitted','position',r.target_id,r.reason,r.current_data,r.proposed_data,p_request);
end; $$;

create function public.decide_permission_change(p_request bigint,p_approve boolean,p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.approval_requests; c public.position_permission_changes; pos public.positions; a record;
begin
 perform private.require_admin('Positions & Permissions','approve');
 if length(btrim(p_reason)) not between 1 and 1000 then raise exception 'Decision reason required'; end if;
 select * into r from public.approval_requests where id=p_request for update;
 if not found or r.request_type<>'position_permissions' or r.status<>'pending' then raise exception 'Request is not pending'; end if;
 if r.requester_id=auth.uid() and not private.is_owner() then raise exception 'Only Owner may self-approve'; end if;
 if p_approve then
 if not private.can_delegate(r.proposed_data) then raise exception 'Approval exceeds your authority'; end if;
 select * into c from public.position_permission_changes where request_id=p_request;
 select * into pos from public.positions where id=c.position_id for update;
 if pos.version<>c.expected_position_version or pos.is_owner_position then raise exception 'Stale position; create a fresh request'; end if;
 for a in select p.id,p.version,p.position_id,ra.expected_profile_version from public.approval_request_accounts ra
 join public.profiles p on p.id=ra.profile_id where ra.request_id=p_request order by p.id for update of p loop
 if a.version<>a.expected_profile_version or a.position_id<>pos.id then raise exception 'Stale account; create a fresh request'; end if;
 end loop;
 update public.positions set version=version+1 where id=pos.id;
 delete from public.position_page_permissions where position_id=pos.id;
 insert into public.position_page_permissions(position_id,page_id,can_view)
 select pos.id,id,coalesce((r.proposed_data->'pages'->>id)::boolean,false) from public.pages;
 delete from public.position_action_permissions where position_id=pos.id;
 insert into public.position_action_permissions(position_id,module,action,allowed)
 select distinct pos.id,m.key,a.value,true from jsonb_each(r.proposed_data->'actions') m cross join lateral jsonb_array_elements_text(m.value) a;
 update public.profiles set page_access=r.proposed_data->'pages',action_access=r.proposed_data->'actions',version=version+1
 where id in (select profile_id from public.approval_request_accounts where request_id=p_request);
 end if;
 update public.approval_requests set status=case when p_approve then 'approved' else 'rejected' end,
 decided_by=auth.uid(),decided_at=now(),decision_reason=p_reason,version=version+1 where id=p_request;
 insert into public.notifications(recipient_id,notification_type,title,message,approval_request_id)
 values(r.requester_id,'approval',case when p_approve then 'Permission request approved' else 'Permission request rejected' end,p_reason,p_request);
 perform private.audit(case when p_approve then 'Permission request approved' else 'Permission request rejected' end,'position',r.target_id,p_reason,r.current_data,r.proposed_data,p_request);
end; $$;

-- Recovery is a durable, fail-closed operation around the external Auth password API.
create table private.recovery_operations(id uuid primary key default gen_random_uuid(),owner_id uuid not null references public.profiles,
 status text not null check(status in ('running','failed','completed')),created_at timestamptz not null default now(),finished_at timestamptz);
create unique index one_running_recovery on private.recovery_operations(owner_id) where status='running';
create table private.recovery_throttle(id boolean primary key default true check(id),attempts integer not null default 0,window_start timestamptz not null default now());
insert into private.recovery_throttle default values;
create function public.begin_owner_recovery(p_username text,p_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.profiles; t private.recovery_throttle; op uuid;
begin
 if auth.role()<>'service_role' then raise exception 'Server only'; end if;
 select * into t from private.recovery_throttle where id for update;
 if t.window_start<now()-interval '15 minutes' then update private.recovery_throttle set attempts=0,window_start=now() where id; t.attempts:=0; end if;
 if t.attempts>=5 then return jsonb_build_object('error','Recovery temporarily limited. Try again later.'); end if;
 update private.recovery_throttle set attempts=attempts+1 where id;
 select * into p from public.profiles where erp_role='owner' and status in ('active','locked') and username=lower(p_username) for update;
 if not found or p_hash !~ '^[0-9a-f]{64}$' or not exists(select 1 from private.owner_recovery_codes
 where owner_id=p.id and invalidated_at is null and used_at is null and code_hash=decode(p_hash,'hex')) then
 return jsonb_build_object('error','Recovery details could not be verified.'); end if;
 if exists(select 1 from private.recovery_operations where owner_id=p.id and status='running') then
 return jsonb_build_object('error','Recovery is already running. If interrupted, administrator reconciliation is required.'); end if;
 insert into private.recovery_operations(owner_id,status) values(p.id,'running') returning id into op;
 update public.profiles set recovery_pending=true,sessions_valid_after=clock_timestamp(),version=version+1 where id=p.id;
 update public.device_sessions set status='logged_out',ended_at=now(),ended_reason='Owner recovery' where profile_id=p.id and status in ('active','pending');
 insert into public.audit_events(actor_id,actor_name,action,entity_type,entity_id,reason)
 values(p.id,p.employee_name,'Owner recovery started','profile',p.id::text,'Emergency recovery code verified');
 return jsonb_build_object('operation',op,'owner',p.id);
end; $$;
create function public.finish_owner_recovery(p_operation uuid,p_success boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare op private.recovery_operations; p public.profiles;
begin
 if auth.role()<>'service_role' then raise exception 'Server only'; end if;
 select * into op from private.recovery_operations where id=p_operation for update;
 if not found or op.status<>'running' then raise exception 'Recovery operation unavailable'; end if;
 select * into p from public.profiles where id=op.owner_id for update;
 update private.recovery_operations set status=case when p_success then 'completed' else 'failed' end,finished_at=now() where id=op.id;
 if p_success then
 update public.profiles set status='active',failed_login_attempts=0,recovery_pending=false,sessions_valid_after=clock_timestamp(),
 password_changed_at=now(),password_expires_at=now()+interval '6 months',version=version+1 where id=p.id;
 end if;
 insert into public.audit_events(actor_id,actor_name,action,entity_type,entity_id,reason)
 values(p.id,p.employee_name,case when p_success then 'Owner recovery completed' else 'Owner recovery failed' end,'profile',p.id::text,
 case when p_success then 'Password changed; previous sessions revoked' else 'Account remains fenced; verify recovery code to retry' end);
end; $$;

create function public.record_login_attempt(p_username text,p_success boolean,p_session uuid default null) returns void
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
 where status='active' and (erp_role='owner' or (erp_role='admin' and action_access->'Account Management' ? 'unlock'));
 end if;
 end if;
end; $$;

-- Explicit callable boundaries. Private helpers are never exposed as RPCs.
revoke all on function private.template_access(bigint),private.initialize_profile_access(),private.require_admin(text,text),private.audit(text,text,text,text,jsonb,jsonb,bigint),private.can_delegate(jsonb) from public,anon,authenticated,service_role;
revoke all on private.recovery_operations,private.recovery_throttle from public,anon,authenticated,service_role;
revoke all on function public.my_access(),public.create_position(text,text),public.provision_employee(uuid,bigint,text,text,text,text,text,text),public.change_account_status(uuid,text,text),public.draft_permission_change(bigint,integer,jsonb,jsonb,uuid[],text),public.submit_permission_change(bigint),public.decide_permission_change(bigint,boolean,text),public.begin_owner_recovery(text,text),public.finish_owner_recovery(uuid,boolean),public.record_login_attempt(text,boolean,uuid) from public,anon,authenticated,service_role;
grant execute on function public.my_access(),public.create_position(text,text),public.provision_employee(uuid,bigint,text,text,text,text,text,text),public.change_account_status(uuid,text,text),public.draft_permission_change(bigint,integer,jsonb,jsonb,uuid[],text),public.submit_permission_change(bigint),public.decide_permission_change(bigint,boolean,text) to authenticated;
grant execute on function public.begin_owner_recovery(text,text),public.finish_owner_recovery(uuid,boolean),public.record_login_attempt(text,boolean,uuid) to service_role;

-- Existing seeds are foundation templates; users remain the Owner's explicit appointments.
notify pgrst,'reload schema';
