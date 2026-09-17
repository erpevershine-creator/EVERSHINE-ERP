-- One Approval Center record binds the complete profile and permission snapshot.
-- This candidate supersedes the unaccepted split-table profile prototype.
create table private.profile_change_execution (
 request_id bigint primary key references public.approval_requests(id),
 operation_id uuid not null unique default gen_random_uuid(),
 target_id uuid not null references public.profiles(id),
 actor_id uuid not null references public.profiles(id),
 actor_version integer not null,
 actor_cutoff timestamptz not null,
 expires_at timestamptz not null default clock_timestamp()+interval '15 minutes',
 applied_at timestamptz
);
revoke all on private.profile_change_execution from public,anon,authenticated,service_role;

create function private.profile_review_snapshot(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select private.permission_snapshot(p.id,p.page_access,p.action_access) || jsonb_build_object(
 'employeeName',p.employee_name,'companyPosition',p.company_position,'department',p.department,
 'contact',p.contact,'username',p.username,'erpRole',p.erp_role,'avatar',p.avatar_path,
 'profileVersion',p.version,'positionId',p.position_id,'basePages',p.page_access,'baseActions',p.action_access,
 'extraPages',p.individual_pages,'extraActions',p.individual_actions,
 'overrides',coalesce((select jsonb_object_agg(page_id,can_view) from public.user_page_overrides where profile_id=p.id),'{}'))
 from public.profiles p where p.id=p_id;
$$;
revoke all on function private.profile_review_snapshot(uuid) from public,anon,authenticated,service_role;

create function private.require_profile_target(p_target uuid,p_proposed_role text) returns void
language plpgsql stable security definer set search_path='' as $$
declare p public.profiles;
begin
 select * into p from public.profiles where id=p_target;
 if not found or p.status<>'active' or p.password_change_pending or p.recovery_pending then raise exception 'Account unavailable'; end if;
 if (p.erp_role='owner' and p_proposed_role<>'owner') or (p.erp_role<>'owner' and p_proposed_role='owner') then raise exception 'Owner role cannot be transferred by profile editing'; end if;
 if (p.erp_role in ('owner','admin') or p_proposed_role='admin') and not private.is_owner() then raise exception 'Owner approval required for this account or role change'; end if;
 if not private.can_delegate(private.permission_snapshot(p.id,p.page_access,p.action_access)) then raise exception 'Account exceeds your scope'; end if;
end; $$;
revoke all on function private.require_profile_target(uuid,text) from public,anon,authenticated,service_role;

create function public.request_profile_change(p_target uuid,p_expected integer,p_proposed jsonb,p_reason text) returns bigint
language plpgsql security definer set search_path='' as $$
declare p public.profiles; pos public.positions; before_data jsonb; proposed jsonb; base jsonb; item text; rid bigint;
begin
 perform private.require_admin('Account Management','edit');
 if p_expected is null or jsonb_typeof(p_proposed) is distinct from 'object' or length(btrim(coalesce(p_reason,''))) not between 1 and 1000 then raise exception 'Profile change details required'; end if;
 if exists(select 1 from jsonb_object_keys(p_proposed) k where k not in ('employeeName','companyPosition','department','contact','username','erpRole','avatar')) then raise exception 'Unexpected profile field'; end if;
 select * into p from public.profiles where id=p_target for update;
 if not found or p.version<>p_expected then raise exception 'Account changed; reload before editing'; end if;
 before_data:=private.profile_review_snapshot(p.id);
 proposed:=before_data || p_proposed;
 foreach item in array array['employeeName','companyPosition','department','contact'] loop
  if jsonb_typeof(proposed->item) is distinct from 'string' or length(btrim(proposed->>item)) not between 1 and 120 then raise exception 'Invalid profile field'; end if;
  proposed:=jsonb_set(proposed,array[item],to_jsonb(btrim(proposed->>item)));
 end loop;
 if jsonb_typeof(proposed->'username') is distinct from 'string' or lower(proposed->>'username') !~ '^[a-z0-9][a-z0-9._%+\-]*@gmail\.com$' then raise exception 'Company Gmail username required'; end if;
 proposed:=jsonb_set(proposed,'{username}',to_jsonb(lower(proposed->>'username')));
 if jsonb_typeof(proposed->'erpRole') is distinct from 'string' or proposed->>'erpRole' not in ('owner','admin','sales','delivery','finance','inventory') then raise exception 'Invalid ERP role'; end if;
 perform private.require_profile_target(p.id,proposed->>'erpRole');
 select * into pos from public.positions where erp_role_code=proposed->>'erpRole' and is_active for share;
 if not found then raise exception 'ERP role unavailable'; end if;
 if proposed->>'avatar' is distinct from p.avatar_path then
  if jsonb_typeof(proposed->'avatar') is distinct from 'string' or proposed->>'avatar' not like p.id::text||'/%'
  or not exists(select 1 from storage.objects where bucket_id='profile-photos' and name=proposed->>'avatar') then raise exception 'Uploaded profile photo required'; end if;
 end if;
 if proposed->>'erpRole'<>p.erp_role then
  base:=private.template_access(pos.id);
  -- D157: existing individual grants and overrides are explicitly included in
  -- the approval snapshot. They are not discarded or silently carried forward.
  proposed:=proposed || jsonb_build_object('basePages',base->'pages','baseActions',base->'actions',
   'pages',(base->'pages')||(before_data->'overrides')||p.individual_pages,
   'actions',private.merge_permission_actions(base->'actions',p.individual_actions));
 end if;
 if not private.can_delegate(proposed) then raise exception 'Requested permissions exceed your scope'; end if;
 proposed:=proposed || jsonb_build_object('positionId',pos.id,'positionVersion',pos.version);
 insert into public.approval_requests(request_type,module,requester_id,target_type,target_id,current_data,proposed_data,reason,status,deadline_at)
 values('profile_change','Account Management',auth.uid(),'profile',p.id::text,before_data,proposed,btrim(p_reason),'pending',clock_timestamp()+interval '1 day') returning id into rid;
 insert into public.approval_request_accounts(request_id,profile_id,expected_profile_version,account_name,before_pages,after_pages,before_actions,after_actions)
 values(rid,p.id,p.version,p.employee_name,before_data->'pages',proposed->'pages',before_data->'actions',proposed->'actions');
 insert into public.notifications(recipient_id,notification_type,title,message,approval_request_id)
 select id,'approval','Profile change awaiting review',p.employee_name,rid from public.profiles where status='active' and erp_role='owner';
 perform private.audit('Profile change requested','profile',p.id::text,btrim(p_reason),before_data,proposed,rid);
 return rid;
end; $$;
revoke all on function public.request_profile_change(uuid,integer,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.request_profile_change(uuid,integer,jsonb,text) to authenticated;

create function private.apply_profile_change(p_request bigint) returns void
language plpgsql security definer set search_path='' as $$
declare r public.approval_requests; p public.profiles; e private.profile_change_execution; actor public.profiles;
begin
 select * into e from private.profile_change_execution where request_id=p_request;
 if not found or e.applied_at is not null or e.expires_at<=clock_timestamp() then raise exception 'Profile execution unavailable'; end if;
 -- Stable lock order for actor/target, followed by the request and operation.
 perform 1 from public.profiles where id in (e.target_id,e.actor_id) order by id for update;
 select * into p from public.profiles where id=e.target_id;
 select * into actor from public.profiles where id=e.actor_id;
 select * into r from public.approval_requests where id=p_request for update;
 select * into e from private.profile_change_execution where request_id=p_request for update;
 if e.applied_at is not null or e.expires_at<=clock_timestamp() or r.status<>'approved'
 or actor.version<>e.actor_version or actor.sessions_valid_after<>e.actor_cutoff or actor.status<>'active'
 or actor.password_change_pending or actor.recovery_pending or actor.password_expires_at<=clock_timestamp()
 or p.status<>'active' or p.password_change_pending or p.recovery_pending
 or private.profile_review_snapshot(p.id) is distinct from r.current_data then raise exception 'Profile execution is stale'; end if;
 if not exists(select 1 from public.positions where id=(r.proposed_data->>'positionId')::bigint and version=(r.proposed_data->>'positionVersion')::integer and is_active) then raise exception 'Role template changed'; end if;
 if not exists(select 1 from auth.users where id=p.id and lower(email)=r.proposed_data->>'username') then raise exception 'Provider identity is not committed'; end if;
 update public.profiles set employee_name=r.proposed_data->>'employeeName',company_position=r.proposed_data->>'companyPosition',department=r.proposed_data->>'department',contact=r.proposed_data->>'contact',username=r.proposed_data->>'username',avatar_path=r.proposed_data->>'avatar',position_id=(r.proposed_data->>'positionId')::bigint,erp_role=r.proposed_data->>'erpRole',page_access=r.proposed_data->'basePages',action_access=r.proposed_data->'baseActions',individual_pages=r.proposed_data->'extraPages',individual_actions=r.proposed_data->'extraActions',version=version+1,
 sessions_valid_after=case when username<>r.proposed_data->>'username' or erp_role<>r.proposed_data->>'erpRole' then clock_timestamp() else sessions_valid_after end where id=p.id;
 if p.username<>r.proposed_data->>'username' or p.erp_role<>r.proposed_data->>'erpRole' then
  update public.device_sessions set status='logged_out',ended_at=clock_timestamp(),ended_reason='Approved profile identity or role change' where profile_id=p.id and status in ('active','pending');
 end if;
 update private.profile_change_execution set applied_at=clock_timestamp() where request_id=r.id;
 insert into public.audit_events(actor_id,actor_name,action,entity_type,entity_id,reason,before_data,after_data,approval_request_id)
 values(actor.id,actor.employee_name,'Profile change applied','profile',p.id::text,r.decision_reason,r.current_data,r.proposed_data,r.id);
 insert into public.notifications(recipient_id,notification_type,title,message,approval_request_id) values(p.id,'approval','Profile change applied',r.decision_reason,r.id);
end; $$;
revoke all on function private.apply_profile_change(bigint) from public,anon,authenticated,service_role;

create function public.decide_profile_change(p_request bigint,p_approve boolean,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.approval_requests; p public.profiles; op uuid;
begin
 perform private.require_admin('Account Management','approve');
 if p_approve is null or length(btrim(coalesce(p_reason,''))) not between 1 and 1000 then raise exception 'Decision reason required'; end if;
 select * into r from public.approval_requests where id=p_request;
 if not found or r.request_type<>'profile_change' then raise exception 'Profile request unavailable'; end if;
 perform 1 from public.profiles where id in (r.target_id::uuid,auth.uid()) order by id for update;
 select * into r from public.approval_requests where id=p_request for update;
 if r.status<>'pending' then raise exception 'Profile request unavailable'; end if;
 if r.requester_id=auth.uid() and not private.is_owner() then raise exception 'Only Owner may self-approve'; end if;
 perform private.require_profile_target(r.target_id::uuid,r.proposed_data->>'erpRole');
 if r.deadline_at<=clock_timestamp() then perform private.expire_approval_request(r.id,'Profile approval expired'); return jsonb_build_object('status','expired'); end if;
 if p_approve then
  if r.current_data->>'erpRole'<>r.proposed_data->>'erpRole' and not private.is_owner() then raise exception 'Owner must reapprove individual permissions on role change'; end if;
  if private.profile_review_snapshot(r.target_id::uuid) is distinct from r.current_data then raise exception 'Profile request is stale'; end if;
  if not private.can_delegate(r.proposed_data) then raise exception 'Approval exceeds your authority'; end if;
 end if;
 update public.approval_requests set status=case when p_approve then 'approved' else 'rejected' end,decided_by=auth.uid(),decided_at=clock_timestamp(),decision_reason=btrim(p_reason),version=version+1 where id=r.id;
 perform private.audit(case when p_approve then 'Profile change approved' else 'Profile change rejected' end,'profile',r.target_id,btrim(p_reason),r.current_data,r.proposed_data,r.id);
 if not p_approve then return jsonb_build_object('status','rejected'); end if;
 select * into p from public.profiles where id=auth.uid();
 insert into private.profile_change_execution(request_id,target_id,actor_id,actor_version,actor_cutoff) values(r.id,r.target_id::uuid,p.id,p.version,p.sessions_valid_after) returning operation_id into op;
 if r.proposed_data->>'username'=r.current_data->>'username' then perform private.apply_profile_change(r.id); return jsonb_build_object('status','applied'); end if;
 return jsonb_build_object('status','provider_pending','operation',op,'target',r.target_id,'username',r.proposed_data->>'username');
end; $$;
revoke all on function public.decide_profile_change(bigint,boolean,text) from public,anon,authenticated,service_role;
grant execute on function public.decide_profile_change(bigint,boolean,text) to authenticated;

-- Auth and ERP profile changes share ONE database transaction. Failed, stale,
-- replayed or direct provider edits roll back the Auth email as well.
create function private.commit_profile_email_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare marker text; e private.profile_change_execution;
begin
 if not exists(select 1 from public.profiles where id=new.id) then return null; end if;
 select raw_app_meta_data->>'erp_profile_operation' into marker from auth.users where id=new.id;
 select * into e from private.profile_change_execution where operation_id::text=marker and target_id=new.id and applied_at is null;
 if not found then raise exception 'Approved profile operation required' using errcode='42501'; end if;
 perform private.apply_profile_change(e.request_id);
 return null;
end; $$;
revoke all on function private.commit_profile_email_change() from public,anon,authenticated,service_role;
create constraint trigger erp_profile_email_commit after update on auth.users deferrable initially deferred for each row when (old.email is distinct from new.email) execute function private.commit_profile_email_change();

create function public.profile_execution_status(p_request bigint) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare e private.profile_change_execution;
begin
 if not private.can_view_request(p_request) then raise exception 'Permission denied' using errcode='42501'; end if;
 select * into e from private.profile_change_execution where request_id=p_request;
 return jsonb_build_object('status',case when not found then 'not_started' when e.applied_at is not null then 'applied' when e.expires_at<=clock_timestamp() then 'expired' else 'provider_pending' end);
end; $$;
revoke all on function public.profile_execution_status(bigint) from public,anon,authenticated,service_role;
grant execute on function public.profile_execution_status(bigint) to authenticated;
notify pgrst,'reload schema';

create function public.retry_profile_change(p_request bigint,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.approval_requests; e private.profile_change_execution; actor public.profiles;
begin
 perform private.require_admin('Account Management','approve');
 if length(btrim(coalesce(p_reason,''))) not between 1 and 1000 then raise exception 'Retry reason required'; end if;
 select * into r from public.approval_requests where id=p_request and request_type='profile_change';
 if not found or r.status<>'approved' or r.decided_by<>auth.uid() then raise exception 'Original approver must retry'; end if;
 perform 1 from public.profiles where id in (r.target_id::uuid,auth.uid()) order by id for update;
 select * into e from private.profile_change_execution where request_id=r.id for update;
 if not found then raise exception 'Execution unavailable'; end if;
 if e.applied_at is not null then return jsonb_build_object('status','applied'); end if;
 perform private.require_profile_target(e.target_id,r.proposed_data->>'erpRole');
 if private.profile_review_snapshot(e.target_id) is distinct from r.current_data or not private.can_delegate(r.proposed_data) then raise exception 'Profile request is stale'; end if;
 if r.current_data->>'erpRole'<>r.proposed_data->>'erpRole' and not private.is_owner() then raise exception 'Owner must reapprove individual permissions on role change'; end if;
 select * into actor from public.profiles where id=auth.uid();
 update private.profile_change_execution set operation_id=gen_random_uuid(),actor_version=actor.version,actor_cutoff=actor.sessions_valid_after,expires_at=clock_timestamp()+interval '15 minutes' where request_id=r.id returning * into e;
 perform private.audit('Profile execution retried','profile',r.target_id,btrim(p_reason),null,jsonb_build_object('request',r.id),r.id);
 return jsonb_build_object('status','provider_pending','operation',e.operation_id,'target',e.target_id,'username',r.proposed_data->>'username');
end; $$;
revoke all on function public.retry_profile_change(bigint,text) from public,anon,authenticated,service_role;
grant execute on function public.retry_profile_change(bigint,text) to authenticated;
create or replace function public.request_decision_capabilities(p_requests bigint[])
returns table(request_id bigint,can_decide boolean,can_copy boolean)
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_active_user() then raise exception 'Permission denied' using errcode='42501'; end if;
 if p_requests is null or cardinality(p_requests)>50 then raise exception 'Invalid request page'; end if;
 return query select ar.id,
   ar.status='pending' and ar.request_type in ('device_login','position_permissions','profile_change')
   and exists(select 1 from public.profiles where id=auth.uid() and erp_role in ('owner','admin'))
   and (ar.requester_id<>auth.uid() or private.is_owner())
   and (private.has_action(ar.module,case when ar.request_type='device_login' then 'approve_device' else 'approve' end)
     or private.handover_can_act(ar.id,ar.module,case when ar.request_type='device_login' then 'approve_device' else 'approve' end)),
   ar.status='expired' and ar.request_type='position_permissions'
   and exists(select 1 from public.profiles where id=auth.uid() and erp_role in ('owner','admin'))
   and private.has_action('Positions & Permissions','edit')
   and private.can_delegate(ar.current_data) and private.can_delegate(ar.proposed_data)
 from public.approval_requests ar where ar.id=any(p_requests) and private.can_view_request(ar.id);
end; $$;

create function public.profile_provider_applied(p_operation uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Server only'; end if;
 return exists(select 1 from private.profile_change_execution where operation_id=p_operation and applied_at is not null);
end; $$;
revoke all on function public.profile_provider_applied(uuid) from public,anon,authenticated,service_role;
grant execute on function public.profile_provider_applied(uuid) to service_role;

create function public.check_profile_edit(p_target uuid,p_expected integer,p_role text) returns boolean
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.require_admin('Account Management','edit');
 perform private.require_profile_target(p_target,p_role);
 if not exists(select 1 from public.profiles where id=p_target and version=p_expected) then raise exception 'Account changed; reload before editing'; end if;
 return true;
end; $$;
revoke all on function public.check_profile_edit(uuid,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.check_profile_edit(uuid,integer,text) to authenticated;
alter table private.profile_change_execution enable row level security;
