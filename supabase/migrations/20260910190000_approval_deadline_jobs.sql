-- D105/D106: repeat deadline reminders at three-hour intervals and expire
-- overdue approvals even when no user opens Approval Center.
create table private.approval_deadline_reminder_deliveries (
  id bigint generated always as identity primary key,
  request_id bigint not null references public.approval_requests(id) on delete restrict,
  recipient_id uuid not null references public.profiles(id) on delete restrict,
  notification_id bigint not null unique references public.notifications(id) on delete restrict,
  delivered_at timestamptz not null default clock_timestamp()
);
create index approval_deadline_reminder_recent_idx
  on private.approval_deadline_reminder_deliveries(request_id,recipient_id,delivered_at desc);
revoke all on table private.approval_deadline_reminder_deliveries from public,anon,authenticated,service_role;

create function private.profile_has_action(p_actor uuid,p_module text,p_action text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.profiles actor
    where actor.id=p_actor and actor.status='active'
      and not actor.recovery_pending and not actor.password_change_pending
      and actor.password_expires_at>clock_timestamp()
      and actor.erp_role in ('owner','admin')
      and (
        actor.erp_role='owner'
        or coalesce(actor.action_access->p_module,'[]') ? p_action
        or coalesce(actor.action_access->p_module,'[]') ? '*'
        or coalesce(actor.action_access->'*','[]') ? '*'
        or coalesce(actor.individual_actions->p_module,'[]') ? p_action
      )
  );
$$;

create function private.profile_can_delegate_access(p_actor uuid,p_access jsonb) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.profiles actor where actor.id=p_actor and (
      actor.erp_role='owner'
      or (
        not exists (
          select 1 from jsonb_each_text(coalesce(p_access->'pages','{}')) requested_page
          where requested_page.value='true'
            and not (
              coalesce((actor.individual_pages->>requested_page.key)::boolean,false)
              or coalesce(
                (select override.can_view from public.user_page_overrides override
                  where override.profile_id=actor.id and override.page_id=requested_page.key),
                (actor.page_access->>requested_page.key)::boolean,
                false
              )
            )
        )
        and not exists (
          select 1
          from jsonb_each(coalesce(p_access->'actions','{}')) requested_module
          cross join lateral jsonb_array_elements_text(requested_module.value) requested_action
          where not (
            coalesce(actor.action_access->requested_module.key,'[]') ? requested_action.value
            or coalesce(actor.action_access->requested_module.key,'[]') ? '*'
            or coalesce(actor.action_access->'*','[]') ? '*'
            or coalesce(actor.individual_actions->requested_module.key,'[]') ? requested_action.value
          )
        )
      )
    )
  );
$$;

create or replace function private.can_delegate_between(p_actor uuid,p_target uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.profiles target where target.id=p_target
      and private.profile_can_delegate_access(
        p_actor,
        private.permission_snapshot(target.id,target.page_access,target.action_access)
      )
  );
$$;

create function private.approval_recipients(p_request bigint)
returns table(recipient_id uuid)
language sql stable security definer set search_path='' as $$
  with requested as (
    select ar.*,
      case when ar.request_type='device_login' then 'approve_device' else 'approve' end required_action
    from public.approval_requests ar where ar.id=p_request
  ), recipients as (
    select requester_id recipient_id from requested
    union
    select actor.id
    from requested r cross join public.profiles actor
    where private.profile_has_action(actor.id,r.module,r.required_action)
      and (actor.id<>r.requester_id or actor.erp_role='owner')
      and (
        r.request_type<>'position_permissions'
        or (
          private.profile_can_delegate_access(actor.id,r.current_data)
          and private.profile_can_delegate_access(actor.id,r.proposed_data)
        )
      )
    union
    select handover.successor_id
    from requested r
    join public.handover_items item on item.approval_request_id=r.id
    join public.handover_requests handover on handover.id=item.handover_id
    join public.profiles successor on successor.id=handover.successor_id
    where handover.status='approved'
      and clock_timestamp()>=handover.starts_at and clock_timestamp()<handover.ends_at
      and successor.status='active' and successor.erp_role in ('owner','admin')
      and not successor.recovery_pending and not successor.password_change_pending
      and successor.password_expires_at>clock_timestamp()
      and (successor.id<>r.requester_id or successor.erp_role='owner')
      and private.profile_has_action(handover.source_id,r.module,r.required_action)
      and (
        r.request_type<>'position_permissions'
        or (
          private.profile_can_delegate_access(successor.id,r.current_data)
          and private.profile_can_delegate_access(successor.id,r.proposed_data)
        )
      )
  )
  select distinct recipients.recipient_id from recipients;
$$;

create function private.expire_approval_request(p_request bigint,p_reason text) returns boolean
language plpgsql security definer set search_path='' as $$
declare request public.approval_requests;
begin
  select * into request from public.approval_requests where id=p_request for update;
  if not found or request.status<>'pending' or request.deadline_at is null
    or request.deadline_at>clock_timestamp() then return false; end if;
  update public.approval_requests
    set status='expired',updated_at=clock_timestamp(),version=version+1
    where id=request.id;
  insert into public.notifications(recipient_id,notification_type,title,message,approval_request_id)
    select recipient_id,'approval','Approval request expired',
      request.module||' request #'||request.id||' reached its deadline.',request.id
    from private.approval_recipients(request.id);
  insert into public.audit_events(actor_name,action,entity_type,entity_id,reason,before_data,after_data,approval_request_id)
    values('Approval deadline scheduler',case when request.request_type='device_login' then 'Device sign-in expired' else 'Approval request expired' end,'approval_request',request.id::text,
      p_reason,request.proposed_data,jsonb_build_object('status','expired','deadlineAt',request.deadline_at),request.id);
  return true;
end; $$;

create function public.run_approval_deadline_jobs() returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  request record;
  recipient uuid;
  notification bigint;
  expired_count integer:=0;
  reminder_count integer:=0;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Server only' using errcode='42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(20260910,19);

  for request in
    select id from public.approval_requests
    where status='pending' and deadline_at<=clock_timestamp()
    order by deadline_at,id for update
  loop
    if private.expire_approval_request(request.id,'Approval deadline reached') then
      expired_count:=expired_count+1;
    end if;
  end loop;

  for request in
    select * from public.approval_requests ar
    where ar.status='pending' and ar.deadline_at>clock_timestamp()
      and ar.created_at<=clock_timestamp()-interval '3 hours'
    order by ar.deadline_at,ar.id
  loop
    for recipient in select recipient_id from private.approval_recipients(request.id)
    loop
      if not exists (
        select 1 from private.approval_deadline_reminder_deliveries delivery
        where delivery.request_id=request.id and delivery.recipient_id=recipient
          and delivery.delivered_at>clock_timestamp()-interval '3 hours'
      ) then
        insert into public.notifications(recipient_id,notification_type,title,message,approval_request_id)
          values(recipient,'approval','Approval deadline reminder',
            request.module||' request #'||request.id||' is due at '
              ||to_char(request.deadline_at at time zone 'Asia/Yangon','YYYY-MM-DD HH24:MI')||' Myanmar time.',request.id)
          returning id into notification;
        insert into private.approval_deadline_reminder_deliveries(request_id,recipient_id,notification_id)
          values(request.id,recipient,notification);
        reminder_count:=reminder_count+1;
      end if;
    end loop;
  end loop;
  return jsonb_build_object('expired',expired_count,'reminders',reminder_count);
end; $$;

revoke all on function private.profile_has_action(uuid,text,text),
  private.profile_can_delegate_access(uuid,jsonb),private.can_delegate_between(uuid,uuid),
  private.approval_recipients(bigint),private.expire_approval_request(bigint,text)
  from public,anon,authenticated,service_role;
grant execute on function private.profile_has_action(uuid,text,text),
  private.profile_can_delegate_access(uuid,jsonb),private.can_delegate_between(uuid,uuid),
  private.approval_recipients(bigint),private.expire_approval_request(bigint,text)
  to supabase_admin,postgres;
revoke all on function public.run_approval_deadline_jobs() from public,anon,authenticated,service_role;
grant execute on function public.run_approval_deadline_jobs() to service_role;

-- Deadline enforcement remains synchronous if the scheduler is late.
create or replace function public.decide_permission_change(p_request bigint,p_approve boolean,p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.approval_requests; c public.position_permission_changes; pos public.positions; a record;
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
end; $$;

create or replace function public.decide_device_login(p_request bigint,p_approve boolean,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.approval_requests; p public.profiles; sid uuid; started timestamptz; label text; old public.device_sessions; fingerprint bytea;
begin
 perform private.require_request_authority('Account Management','approve_device',p_request);
 if p_approve is null or p_reason is null or length(btrim(p_reason)) not between 1 and 1000 then raise exception 'Decision reason required'; end if;
 select * into r from public.approval_requests where id=p_request for update;
 if not found or r.request_type<>'device_login' or r.status<>'pending' then raise exception 'Request is not pending'; end if;
 if r.requester_id=auth.uid() and not private.is_owner() then raise exception 'Only Owner may self-approve'; end if;
 select * into p from public.profiles where id=r.requester_id for update;
 if not found or p.status<>'active' or p.recovery_pending or p.password_change_pending then raise exception 'Account is unavailable'; end if;
 if r.deadline_at<=clock_timestamp() then
   perform private.expire_approval_request(r.id,'Approval deadline reached during decision');
   return;
 end if;
 sid:=(r.proposed_data->>'sessionId')::uuid; label:=coalesce(r.proposed_data->>'deviceLabel','ERP sign-in'); started:=(r.proposed_data->>'startedAt')::timestamptz; fingerprint:=decode(r.proposed_data->>'deviceFingerprint','hex');
 if not exists(select 1 from auth.sessions where id=sid and user_id=p.id) then raise exception 'Provider session is unavailable'; end if;
 if p_approve then
   if exists(select 1 from public.device_sessions where id=sid) then raise exception 'Device session already decided'; end if;
   select * into old from public.device_sessions where profile_id=p.id and status='active' order by started_at asc for update limit 1;
   if (select count(*) from public.device_sessions where profile_id=p.id and status='active')>=2 and old.id is not null then update public.device_sessions set status='logged_out',ended_at=clock_timestamp(),ended_reason='Approved third-device replacement' where id=old.id; end if;
   insert into public.device_sessions(id,profile_id,device_fingerprint_hash,device_label,started_at,last_seen_at) values(sid,p.id,coalesce(fingerprint,extensions.digest(sid::text,'sha256')),label,started,clock_timestamp());
   update public.profiles set requires_login_approval=false where id=p.id;
 end if;
 update public.approval_requests set status=case when p_approve then 'approved' else 'rejected' end,decided_by=auth.uid(),decided_at=clock_timestamp(),decision_reason=p_reason,version=version+1 where id=r.id;
 insert into public.notifications(recipient_id,notification_type,title,message,approval_request_id) values(r.requester_id,'approval',case when p_approve then 'Device sign-in approved' else 'Device sign-in rejected' end,p_reason,r.id);
 insert into public.audit_events(actor_id,actor_name,action,entity_type,entity_id,reason,before_data,after_data,approval_request_id) values(auth.uid(),(select employee_name from public.profiles where id=auth.uid()),case when p_approve then 'Device sign-in approved' else 'Device sign-in rejected' end,'approval_request',r.id::text,p_reason,r.current_data,r.proposed_data,r.id);
end; $$;
notify pgrst,'reload schema';
