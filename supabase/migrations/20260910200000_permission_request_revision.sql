-- D93/D107/D108: preserve immutable rejection/expiry history while returning
-- editable permission work as a linked new Draft.
alter table public.approval_requests add column return_reason text
  check(return_reason is null or length(btrim(return_reason)) between 1 and 1000);

create function private.clone_permission_draft(
  p_source bigint,p_requester uuid,p_draft_reason text,p_return_reason text
) returns bigint
language plpgsql security definer set search_path='' as $$
declare source public.approval_requests; result bigint;
begin
  select * into source from public.approval_requests where id=p_source for update;
  if not found or source.request_type<>'position_permissions'
    or source.status not in ('rejected','expired') then raise exception 'Source request unavailable'; end if;
  insert into public.approval_requests(
    request_type,module,requester_id,target_type,target_id,current_data,proposed_data,
    reason,status,source_request_id,return_reason
  ) values(
    source.request_type,source.module,p_requester,source.target_type,source.target_id,
    source.current_data,source.proposed_data,p_draft_reason,'draft',source.id,p_return_reason
  ) returning id into result;
  insert into public.position_permission_changes(request_id,position_id,expected_position_version,before_pages,after_pages)
    select result,position_id,expected_position_version,before_pages,after_pages
    from public.position_permission_changes where request_id=source.id;
  if not found then raise exception 'Source permission snapshot unavailable'; end if;
  insert into public.approval_request_accounts(
    request_id,profile_id,expected_profile_version,before_pages,after_pages,
    account_name,before_actions,after_actions
  ) select result,profile_id,expected_profile_version,before_pages,after_pages,
      account_name,before_actions,after_actions
    from public.approval_request_accounts where request_id=source.id;
  return result;
end; $$;

create function public.revise_permission_draft(
  p_request bigint,p_expected integer,p_pages jsonb,p_actions jsonb,p_accounts uuid[],p_reason text
) returns void
language plpgsql security definer set search_path='' as $$
declare
  request public.approval_requests;
  change public.position_permission_changes;
  position public.positions;
  account public.profiles;
  current_access jsonb;
  proposed_access jsonb;
  before_request jsonb;
begin
  perform private.require_admin('Positions & Permissions','edit');
  if p_expected is null or p_pages is null or p_actions is null or p_accounts is null
    or p_reason is null or length(btrim(p_reason)) not between 1 and 1000
    or jsonb_typeof(p_pages)<>'object' or jsonb_typeof(p_actions)<>'object' then
    raise exception 'Invalid request';
  end if;
  if exists(select 1 from jsonb_each(p_pages) where jsonb_typeof(value)<>'boolean' or key not in (select id from public.pages)) then raise exception 'Invalid page permissions'; end if;
  if exists(select 1 from jsonb_each(p_actions) where jsonb_typeof(value)<>'array') then raise exception 'Invalid actions'; end if;
  if exists(
    select 1 from jsonb_each(p_actions) module
    cross join lateral jsonb_array_elements_text(module.value) action
    where module.key not in (select label from public.pages)
      or action.value not in ('view','create','edit','approve','export','change_password','unlock','approve_device','disable','reenable')
  ) then raise exception 'Invalid action permissions'; end if;

  select * into request from public.approval_requests where id=p_request for update;
  if not found or request.request_type<>'position_permissions' or request.status<>'draft'
    or request.requester_id<>auth.uid() then raise exception 'Draft unavailable'; end if;
  if request.version<>p_expected then raise exception 'Draft changed; reload before saving'; end if;
  select * into change from public.position_permission_changes where request_id=request.id;
  if not found then raise exception 'Draft snapshot unavailable'; end if;
  select * into position from public.positions where id=change.position_id for update;
  if not found or position.is_owner_position then raise exception 'ERP role unavailable'; end if;

  current_access:=private.template_access(position.id);
  proposed_access:=jsonb_build_object('pages',p_pages,'actions',p_actions);
  if not private.can_delegate(current_access) or not private.can_delegate(proposed_access) then
    raise exception 'Requested access exceeds your authority';
  end if;
  before_request:=jsonb_build_object('current',request.current_data,'proposed',request.proposed_data,'reason',request.reason,'version',request.version);
  update public.approval_requests set current_data=current_access,proposed_data=proposed_access,
    reason=btrim(p_reason),updated_at=clock_timestamp(),version=version+1 where id=request.id;
  update public.position_permission_changes set expected_position_version=position.version,
    before_pages=current_access->'pages',after_pages=p_pages where request_id=request.id;
  delete from public.approval_request_accounts where request_id=request.id;
  for account in select * from public.profiles where id=any(p_accounts) order by id for update loop
    if account.position_id<>position.id or account.erp_role='owner'
      or not private.can_delegate(private.permission_snapshot(account.id,account.page_access,account.action_access)) then
      raise exception 'Selected account does not belong to ERP role';
    end if;
    insert into public.approval_request_accounts(
      request_id,profile_id,expected_profile_version,before_pages,after_pages,
      account_name,before_actions,after_actions
    ) values(
      request.id,account.id,account.version,
      private.permission_snapshot(account.id,account.page_access,account.action_access)->'pages',
      private.permission_snapshot(account.id,p_pages,p_actions)->'pages',account.employee_name,
      private.permission_snapshot(account.id,account.page_access,account.action_access)->'actions',
      private.permission_snapshot(account.id,p_pages,p_actions)->'actions'
    );
  end loop;
  if (select count(*) from public.approval_request_accounts where request_id=request.id)
    <>(select count(distinct selected) from unnest(p_accounts) selected) then
    raise exception 'Selected account unavailable';
  end if;
  perform private.audit('Permission draft revised','approval_request',request.id::text,btrim(p_reason),before_request,
    jsonb_build_object('current',current_access,'proposed',proposed_access,'version',request.version+1),request.id);
end; $$;

create function public.copy_expired_permission_request(p_source bigint,p_reason text) returns bigint
language plpgsql security definer set search_path='' as $$
declare source public.approval_requests; result bigint;
begin
  perform private.require_admin('Positions & Permissions','edit');
  if p_reason is null or length(btrim(p_reason)) not between 1 and 1000 then raise exception 'Reason required'; end if;
  select * into source from public.approval_requests where id=p_source for update;
  if not found or source.status<>'expired' or source.request_type<>'position_permissions' then
    raise exception 'Expired permission request unavailable';
  end if;
  if not private.can_delegate(source.current_data) or not private.can_delegate(source.proposed_data) then
    raise exception 'Request exceeds your authority';
  end if;
  result:=private.clone_permission_draft(source.id,auth.uid(),btrim(p_reason),btrim(p_reason));
  perform private.audit('Expired permission request copied','approval_request',result::text,btrim(p_reason),
    jsonb_build_object('sourceRequest',source.id),jsonb_build_object('status','draft'),result);
  return result;
end; $$;

revoke all on function private.clone_permission_draft(bigint,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function private.clone_permission_draft(bigint,uuid,text,text) to supabase_admin,postgres;
revoke all on function public.revise_permission_draft(bigint,integer,jsonb,jsonb,uuid[],text),
  public.copy_expired_permission_request(bigint,text) from public,anon,authenticated,service_role;
grant execute on function public.revise_permission_draft(bigint,integer,jsonb,jsonb,uuid[],text),
  public.copy_expired_permission_request(bigint,text) to authenticated;

create or replace function public.decide_permission_change(p_request bigint,p_approve boolean,p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.approval_requests; c public.position_permission_changes; pos public.positions; a record; returned_draft bigint;
begin
 perform private.require_request_authority('Positions & Permissions','approve',p_request);
 if p_approve is null or p_reason is null or length(btrim(p_reason)) not between 1 and 1000 then raise exception 'Decision reason required'; end if;
 select * into r from public.approval_requests where id=p_request for update;
 if not found or r.request_type<>'position_permissions' or r.status<>'pending' then raise exception 'Request is not pending'; end if;
 if r.requester_id=auth.uid() and not private.is_owner() then raise exception 'Only Owner may self-approve'; end if;
 if r.deadline_at is not null and r.deadline_at<=clock_timestamp() then
   perform private.expire_approval_request(r.id,'Approval deadline reached during decision');
   return;
 end if;
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
 if not p_approve then
   returned_draft:=private.clone_permission_draft(r.id,r.requester_id,r.reason,btrim(p_reason));
   insert into public.notifications(recipient_id,notification_type,title,message,approval_request_id)
     values(r.requester_id,'approval','Permission request returned to Draft',
       'Draft #'||returned_draft||' is linked to rejected request #'||r.id||'.',returned_draft);
 end if;
end; $$;

drop function public.request_decision_capabilities(bigint[]);
create function public.request_decision_capabilities(p_requests bigint[])
returns table(request_id bigint,can_decide boolean,can_copy boolean)
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_active_user() then raise exception 'Permission denied' using errcode='42501'; end if;
 if p_requests is null or cardinality(p_requests)>50 then raise exception 'Invalid request page'; end if;
 return query select ar.id,
   ar.status='pending' and ar.request_type in ('device_login','position_permissions')
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
revoke all on function public.request_decision_capabilities(bigint[]) from public,anon,service_role;
grant execute on function public.request_decision_capabilities(bigint[]) to authenticated;
notify pgrst,'reload schema';
