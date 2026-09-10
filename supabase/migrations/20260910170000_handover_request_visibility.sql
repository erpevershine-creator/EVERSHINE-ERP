-- Parent request and affected-account details use one visibility boundary.
create or replace function private.can_view_request(request_id bigint)
returns boolean language sql stable security definer set search_path='' as $$
 select private.is_active_user() and exists (
 select 1 from public.approval_requests ar where ar.id=request_id and (
 ar.requester_id=auth.uid() or private.is_owner()
 or private.has_action(ar.module,case when ar.request_type='device_login' then 'approve_device' else 'approve' end)
 or private.handover_can_act(ar.id,ar.module,case when ar.request_type='device_login' then 'approve_device' else 'approve' end)))
$$;
drop policy approval_requests_read on public.approval_requests;
create policy approval_requests_read on public.approval_requests for select to authenticated
using (private.can_view_request(id));

-- These newer tables must also reject a revoked session on direct reads.
create policy handover_active_session on public.handover_requests
as restrictive for select to authenticated using ((select private.is_active_user()));

-- Bounded UI capability hints; the decision RPC rechecks authority at execution.
create function public.request_decision_capabilities(p_requests bigint[])
returns table(request_id bigint,can_decide boolean)
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_active_user() then raise exception 'Permission denied' using errcode='42501'; end if;
 if p_requests is null or cardinality(p_requests)>50 then raise exception 'Invalid request page'; end if;
 return query select ar.id,
   ar.status='pending' and ar.request_type in ('device_login','position_permissions')
   and exists(select 1 from public.profiles where id=auth.uid() and erp_role in ('owner','admin'))
   and (ar.requester_id<>auth.uid() or private.is_owner())
   and (private.has_action(ar.module,case when ar.request_type='device_login' then 'approve_device' else 'approve' end)
     or private.handover_can_act(ar.id,ar.module,case when ar.request_type='device_login' then 'approve_device' else 'approve' end))
 from public.approval_requests ar where ar.id=any(p_requests) and private.can_view_request(ar.id);
end; $$;
revoke all on function public.request_decision_capabilities(bigint[]) from public,anon,service_role;
grant execute on function public.request_decision_capabilities(bigint[]) to authenticated;
create policy handover_items_active_session on public.handover_items
as restrictive for select to authenticated using ((select private.is_active_user()));
