-- D09-D14, D158: separate immutable request and Owner-reviewed merged grants.
-- Disable the unreviewed immediate-transfer entry point, including old clients.
create or replace function public.complete_permanent_handover(p_source uuid,p_successor uuid,p_items bigint[],p_reason text)
returns void language plpgsql security definer set search_path='' as $$
begin raise exception 'Permanent handover requires an approved request'; end; $$;
revoke all on function public.complete_permanent_handover(uuid,uuid,bigint[],text) from public,anon,authenticated,service_role;

create function private.handover_snapshot(p_source uuid,p_successor uuid,p_items bigint[]) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('source',private.profile_review_snapshot(p_source),'successor',private.profile_review_snapshot(p_successor),
 'items',coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.approval_requests r where r.id=any(p_items)),'[]'::jsonb));
$$;
revoke all on function private.handover_snapshot(uuid,uuid,bigint[]) from public,anon,authenticated,service_role;

create function public.request_permanent_handover(p_source uuid,p_successor uuid,p_source_version integer,p_successor_version integer,p_items bigint[],p_reason text) returns bigint
language plpgsql security definer set search_path='' as $$
declare s public.profiles; n public.profiles; before_data jsonb; proposed jsonb; extras jsonb; rid bigint;
begin
 perform private.require_admin('Account Management','handover');
 if p_source is null or p_successor is null or p_source=p_successor or p_source_version is null or p_successor_version is null
 or length(btrim(coalesce(p_reason,''))) not between 1 and 1000 or p_items is null or cardinality(p_items)>100
 or array_position(p_items,null) is not null or cardinality(p_items)<>(select count(distinct x) from unnest(p_items) x) then raise exception 'Invalid permanent handover'; end if;
 perform 1 from public.profiles where id in (p_source,p_successor,auth.uid()) order by id for update;
 select * into s from public.profiles where id=p_source;
 select * into n from public.profiles where id=p_successor;
 if s.id is null or n.id is null or s.status<>'active' or n.status<>'active' or s.password_change_pending or s.recovery_pending or n.password_change_pending or n.recovery_pending then raise exception 'Handover account unavailable'; end if;
 if s.erp_role='owner' or n.erp_role='owner' then raise exception 'Owner identity cannot be transferred'; end if;
 if s.version<>p_source_version or n.version<>p_successor_version then raise exception 'Handover snapshot is stale'; end if;
 if (s.erp_role='admin' or n.erp_role='admin') and not private.is_owner() then raise exception 'Owner required for Admin handover'; end if;
 perform 1 from public.approval_requests where id=any(p_items) order by id for update;
 if (select count(*) from public.approval_requests where id=any(p_items) and status='pending' and requester_id=p_source and deadline_at>clock_timestamp())<>cardinality(p_items) then raise exception 'Only selected pending source responsibilities may transfer'; end if;
 before_data:=private.handover_snapshot(p_source,p_successor,p_items);
 -- Individual grants are additive. Explicit page overrides remain separately reviewed.
 select coalesce(jsonb_object_agg(k,true),'{}') into extras from (
 select key k from jsonb_each(s.individual_pages) where value='true'::jsonb
 union select key from jsonb_each(n.individual_pages) where value='true'::jsonb) grants;
 proposed:=before_data->'source' || jsonb_build_object('extraPages',extras,'extraActions',private.merge_permission_actions(s.individual_actions,n.individual_actions),
 'sourceId',p_source,'successorId',p_successor,'itemIds',to_jsonb(p_items),'mergePolicy','Owner-approved union of individual grants',
 'pages',s.page_access||(before_data->'source'->'overrides')||extras,
 'actions',private.merge_permission_actions(s.action_access,private.merge_permission_actions(s.individual_actions,n.individual_actions)));
 if not private.can_delegate(before_data->'source') or not private.can_delegate(before_data->'successor') or not private.can_delegate(proposed) then raise exception 'Handover exceeds your scope'; end if;
 insert into public.approval_requests(request_type,module,requester_id,target_type,target_id,current_data,proposed_data,reason,status,deadline_at)
 values('permanent_handover','Account Management',auth.uid(),'profile',p_source::text,before_data,proposed,btrim(p_reason),'pending',clock_timestamp()+interval '1 day') returning id into rid;
 insert into public.approval_request_accounts(request_id,profile_id,expected_profile_version,account_name,before_pages,after_pages,before_actions,after_actions)
 values(rid,n.id,n.version,n.employee_name,before_data->'successor'->'pages',proposed->'pages',before_data->'successor'->'actions',proposed->'actions'),
 (rid,s.id,s.version,s.employee_name,before_data->'source'->'pages','{}',before_data->'source'->'actions','{}');
 insert into public.notifications(recipient_id,notification_type,title,message,approval_request_id)
 select id,'approval','Permanent handover awaiting Owner review',s.employee_name||' to '||n.employee_name,rid from public.profiles where status='active' and erp_role='owner';
 perform private.audit('Permanent handover requested','profile',s.id::text,btrim(p_reason),before_data,proposed,rid);
 return rid;
end; $$;
revoke all on function public.request_permanent_handover(uuid,uuid,integer,integer,bigint[],text) from public,anon,authenticated,service_role;
grant execute on function public.request_permanent_handover(uuid,uuid,integer,integer,bigint[],text) to authenticated;

create function public.decide_permanent_handover(p_request bigint,p_approve boolean,p_reason text) returns text
language plpgsql security definer set search_path='' as $$
declare r public.approval_requests; sid uuid; nid uuid; items bigint[]; hid bigint;
begin
 perform private.require_admin('Account Management','handover');
 if not private.is_owner() then raise exception 'Owner must reapprove merged individual permissions'; end if;
 if p_approve is null or length(btrim(coalesce(p_reason,''))) not between 1 and 1000 then raise exception 'Decision reason required'; end if;
 select * into r from public.approval_requests where id=p_request and request_type='permanent_handover';
 if not found then raise exception 'Handover request unavailable'; end if;
 sid:=(r.proposed_data->>'sourceId')::uuid; nid:=(r.proposed_data->>'successorId')::uuid;
 select coalesce(array_agg(value::bigint),'{}'::bigint[]) into items from jsonb_array_elements_text(r.proposed_data->'itemIds');
 perform 1 from public.profiles where id in (sid,nid,auth.uid()) order by id for update;
 perform 1 from public.approval_requests where id=any(items||p_request) order by id for update;
 select * into r from public.approval_requests where id=p_request;
 if r.status<>'pending' then raise exception 'Handover request unavailable'; end if;
 if r.deadline_at<=clock_timestamp() then perform private.expire_approval_request(r.id,'Handover approval expired'); return 'expired'; end if;
 if p_approve then
  if private.handover_snapshot(sid,nid,items) is distinct from r.current_data then raise exception 'Handover snapshot is stale'; end if;
  if exists(select 1 from public.profiles where id in (sid,nid) and (status<>'active' or erp_role='owner' or recovery_pending or password_change_pending)) then raise exception 'Handover account unavailable'; end if;
  if (select count(*) from public.approval_requests where id=any(items) and status='pending' and requester_id=sid and deadline_at>clock_timestamp())<>cardinality(items) then raise exception 'Selected responsibilities changed'; end if;
  update public.profiles set erp_role=r.proposed_data->>'erpRole',position_id=(r.proposed_data->>'positionId')::bigint,
   company_position=r.proposed_data->>'companyPosition',page_access=r.proposed_data->'basePages',action_access=r.proposed_data->'baseActions',
   individual_pages=r.proposed_data->'extraPages',individual_actions=r.proposed_data->'extraActions',version=version+1,sessions_valid_after=clock_timestamp() where id=nid;
  delete from public.user_page_overrides where profile_id=nid;
  insert into public.user_page_overrides(profile_id,page_id,can_view,reason,approved_request_id) select nid,key,value::boolean,btrim(p_reason),r.id from jsonb_each_text(r.proposed_data->'overrides');
  update public.profiles set status='inactive',version=version+1,sessions_valid_after=clock_timestamp() where id=sid;
  update public.device_sessions set status='logged_out',ended_at=clock_timestamp(),ended_reason='Approved permanent handover' where profile_id in (sid,nid) and status in ('active','pending');
  update public.handover_requests set status='revoked',version=version+1,decision_reason='Superseded by permanent handover',decided_by=auth.uid(),decided_at=clock_timestamp() where source_id=sid and status in ('pending','approved');
  insert into public.handover_requests(source_id,successor_id,starts_at,ends_at,reason,status,decided_by,decided_at,decision_reason)
  values(sid,nid,clock_timestamp(),clock_timestamp()+interval '100 years',r.reason,'approved',auth.uid(),clock_timestamp(),btrim(p_reason)) returning id into hid;
  insert into public.handover_items(handover_id,approval_request_id) select hid,unnest(items);
 end if;
 update public.approval_requests set status=case when p_approve then 'approved' else 'rejected' end,version=version+1,decided_by=auth.uid(),decided_at=clock_timestamp(),decision_reason=btrim(p_reason) where id=r.id;
 perform private.audit(case when p_approve then 'Permanent handover completed' else 'Permanent handover rejected' end,'profile',sid::text,btrim(p_reason),r.current_data,r.proposed_data,r.id);
 return case when p_approve then 'approved' else 'rejected' end;
end; $$;
revoke all on function public.decide_permanent_handover(bigint,boolean,text) from public,anon,authenticated,service_role;
grant execute on function public.decide_permanent_handover(bigint,boolean,text) to authenticated;
create or replace function public.request_decision_capabilities(p_requests bigint[])
returns table(request_id bigint,can_decide boolean,can_copy boolean)
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_active_user() then raise exception 'Permission denied' using errcode='42501'; end if;
 if p_requests is null or cardinality(p_requests)>50 then raise exception 'Invalid request page'; end if;
 return query select ar.id,
   ar.status='pending' and ar.request_type in ('device_login','position_permissions','profile_change','permanent_handover')
   and (ar.request_type<>'permanent_handover' or private.is_owner()) and exists(select 1 from public.profiles where id=auth.uid() and erp_role in ('owner','admin'))
   and (ar.requester_id<>auth.uid() or private.is_owner())
   and (private.has_action(ar.module,case when ar.request_type='device_login' then 'approve_device' else 'approve' end)
     or private.handover_can_act(ar.id,ar.module,case when ar.request_type='device_login' then 'approve_device' else 'approve' end)),
   ar.status='expired' and ar.request_type='position_permissions'
   and (ar.request_type<>'permanent_handover' or private.is_owner()) and exists(select 1 from public.profiles where id=auth.uid() and erp_role in ('owner','admin'))
   and private.has_action('Positions & Permissions','edit')
   and private.can_delegate(ar.current_data) and private.can_delegate(ar.proposed_data)
 from public.approval_requests ar where ar.id=any(p_requests) and private.can_view_request(ar.id);
end; $$;


