-- Permission-template approvals use the same request-scoped handover boundary
-- as device approvals. A temporary successor may act only on the selected
-- pending request and never receives permanent Positions & Permissions access.
create or replace function public.decide_permission_change(p_request bigint,p_approve boolean,p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.approval_requests; c public.position_permission_changes; pos public.positions; a record;
begin
 perform private.require_request_authority('Positions & Permissions','approve',p_request);
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
