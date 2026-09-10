-- Temporary assignment never revives a revoked login or an unavailable source.
create or replace function private.handover_can_act(p_request bigint,p_module text,p_action text) returns boolean
language sql stable security definer set search_path='' as $$
 select private.is_active_user() and exists (
 select 1 from public.approval_requests ar
 join public.handover_items hi on hi.approval_request_id=ar.id
 join public.handover_requests h on h.id=hi.handover_id
 join public.profiles source on source.id=h.source_id
 join public.profiles successor on successor.id=h.successor_id
 where ar.id=p_request and ar.status='pending' and ar.module=p_module
 and h.successor_id=auth.uid() and successor.erp_role in ('owner','admin')
 and h.status='approved' and clock_timestamp()>=h.starts_at and clock_timestamp()<h.ends_at
 and source.status='active' and not source.recovery_pending and not source.password_change_pending
 and source.password_expires_at>now()
 and (source.erp_role='owner' or (
 source.erp_role='admin' and (
 coalesce(source.action_access->p_module,'[]') ? p_action
 or coalesce(source.action_access->p_module,'[]') ? '*'
 or coalesce(source.action_access->'*','[]') ? '*'
 or coalesce(source.individual_actions->p_module,'[]') ? p_action))))
$$;

create or replace function private.require_request_authority(p_module text,p_action text,p_request bigint) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not private.is_active_user() or not exists(select 1 from public.profiles where id=auth.uid() and erp_role in ('owner','admin')) then
   raise exception 'Permission denied' using errcode='42501';
 end if;
 if private.has_action(p_module,p_action) or private.handover_can_act(p_request,p_module,p_action) then return; end if;
 raise exception 'Permission denied' using errcode='42501';
end; $$;
