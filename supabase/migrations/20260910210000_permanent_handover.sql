-- D09-D13 permanent successor handover. The successor is a distinct account;
-- the source actor and every historical approval remain unchanged.
create or replace function public.complete_permanent_handover(
  p_source uuid,
  p_successor uuid,
  p_items bigint[],
  p_reason text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  source public.profiles;
  successor public.profiles;
  item bigint;
  handover bigint;
begin
  if p_source = p_successor or coalesce(array_length(p_items,1),0) = 0 or btrim(coalesce(p_reason,'')) = '' then
    raise exception 'Invalid permanent handover';
  end if;
  perform private.require_admin('Account Management','handover');
  select * into source from public.profiles where id=p_source for update;
  select * into successor from public.profiles where id=p_successor for update;
  if not found or source.status <> 'active' or successor.status <> 'active' then
    raise exception 'Handover account unavailable';
  end if;
  if successor.erp_role not in ('admin','owner') then raise exception 'Successor must be an Admin or Owner'; end if;
  if exists(select 1 from public.approval_requests r where r.id=any(p_items) and (r.status<>'pending' or r.requester_id<>p_source)) then
    raise exception 'Only selected pending source responsibilities may transfer';
  end if;
  insert into public.handover_requests(source_id,successor_id,starts_at,ends_at,reason,status,decided_by,decided_at,decision_reason)
    values(p_source,p_successor,clock_timestamp(),clock_timestamp()+interval '100 years',btrim(p_reason),'approved',auth.uid(),clock_timestamp(),btrim(p_reason))
    returning id into handover;
  foreach item in array p_items loop insert into public.handover_items(handover_id,approval_request_id) values(handover,item); end loop;
  update public.profiles set status='inactive', sessions_valid_after=clock_timestamp(), version=version+1 where id=p_source;
  update public.device_sessions set status='logged_out', ended_at=clock_timestamp(), ended_reason='Permanent handover' where profile_id=p_source and status in ('active','pending');
  insert into public.audit_events(actor_id,actor_name,action,entity_type,entity_id,reason,before_data,after_data)
  values(auth.uid(),(select employee_name from public.profiles where id=auth.uid()),'Permanent handover completed','handover',p_source::text,btrim(p_reason),
    jsonb_build_object('source',p_source,'successor',p_successor,'items',p_items),
    jsonb_build_object('sourceStatus','inactive','successor',p_successor,'items',p_items));
end;
$$;
revoke all on function public.complete_permanent_handover(uuid,uuid,bigint[],text) from public,anon,service_role;
grant execute on function public.complete_permanent_handover(uuid,uuid,bigint[],text) to authenticated;
