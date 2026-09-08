-- Harden scope checks without rewriting an applied migration.
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
 if p.position_id<>p_position or p.erp_role='owner' or not private.can_delegate(jsonb_build_object('pages',p.page_access,'actions',p.action_access)) then raise exception 'Selected account does not belong to position'; end if;
 insert into public.approval_request_accounts(request_id,profile_id,expected_profile_version,before_pages,after_pages,account_name,before_actions,after_actions)
 values(r,p.id,p.version,p.page_access,p_pages,p.employee_name,p.action_access,p_actions);
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
 if not private.can_delegate(jsonb_build_object('pages',a.page_access,'actions',a.action_access)) then raise exception 'Account exceeds your authority'; end if;
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
drop policy positions_read on public.positions;
create policy positions_read on public.positions for select to authenticated using (
 (select private.is_owner()) or id=(select p.position_id from public.profiles p where p.id=auth.uid())
 or (select private.has_action('Positions & Permissions','view')) or (select private.has_action('Account Management','create')));

create function public.end_my_session() returns void language plpgsql security definer set search_path='' as $$
begin
 update public.device_sessions set status='logged_out',ended_at=now(),ended_reason='Signed out'
 where id::text=auth.jwt()->>'session_id' and profile_id=auth.uid() and status in ('active','pending');
end; $$;
revoke all on function public.end_my_session() from public,anon,service_role;
grant execute on function public.end_my_session() to authenticated;
notify pgrst,'reload schema';
