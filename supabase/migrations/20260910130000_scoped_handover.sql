-- Temporary responsibility is an explicit, audited assignment of selected
-- pending approvals. It never changes the original requester/actor or grants
-- the successor broader permanent permissions.
create table public.handover_requests (
 id bigint generated always as identity primary key,
 source_id uuid not null references public.profiles(id) on delete restrict,
 successor_id uuid not null references public.profiles(id) on delete restrict,
 starts_at timestamptz not null,
 ends_at timestamptz not null,
 reason text not null check(length(btrim(reason)) between 1 and 1000),
 status text not null default 'pending' check(status in ('pending','approved','rejected','revoked','expired')),
 decided_by uuid references public.profiles(id) on delete restrict,
 decided_at timestamptz,
 decision_reason text,
 created_at timestamptz not null default clock_timestamp(),
 version integer not null default 1 check(version>0),
 check(ends_at>starts_at),
 check((status in ('approved','rejected','revoked','expired'))=(decided_by is not null and decided_at is not null))
);
create table public.handover_items (
 handover_id bigint not null references public.handover_requests(id) on delete restrict,
 approval_request_id bigint not null references public.approval_requests(id) on delete restrict,
 primary key(handover_id,approval_request_id)
);
create index handover_active_idx on public.handover_requests(successor_id,status,starts_at,ends_at);
alter table public.handover_requests enable row level security;
alter table public.handover_items enable row level security;
create policy handover_read on public.handover_requests for select to authenticated using(source_id=auth.uid() or successor_id=auth.uid() or private.is_owner() or private.has_action('Account Management','handover'));
create policy handover_items_read on public.handover_items for select to authenticated using(exists(select 1 from public.handover_requests h where h.id=handover_id and (h.source_id=auth.uid() or h.successor_id=auth.uid() or private.is_owner() or private.has_action('Account Management','handover'))));
grant select on public.handover_requests,public.handover_items to authenticated;

create function private.handover_can_act(p_request bigint,p_module text,p_action text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.approval_requests ar join public.handover_items hi on hi.approval_request_id=ar.id join public.handover_requests h on h.id=hi.handover_id
   where ar.id=p_request and ar.status='pending' and ar.module=p_module and h.successor_id=auth.uid() and h.status='approved'
   and clock_timestamp() between h.starts_at and h.ends_at
   and (select private.is_owner() or private.has_action(p_module,p_action) or exists(select 1 from public.profiles s where s.id=h.source_id and (s.erp_role='owner' or exists(select 1 from public.position_action_permissions pap where pap.position_id=s.position_id and pap.allowed and pap.module in (p_module,'*') and pap.action in (p_action,'*'))))));
$$;
create function private.require_request_authority(p_module text,p_action text,p_request bigint) returns void
language plpgsql security definer set search_path='' as $$
begin
 if private.has_action(p_module,p_action) or private.handover_can_act(p_request,p_module,p_action) then return; end if;
 raise exception 'Permission denied' using errcode='42501';
end; $$;
revoke all on function private.handover_can_act(bigint,text,text),private.require_request_authority(text,text,bigint) from public,anon,authenticated,service_role;
grant execute on function private.handover_can_act(bigint,text,text) to authenticated;
grant execute on function private.handover_can_act(bigint,text,text),private.require_request_authority(text,text,bigint) to supabase_admin;
grant execute on function private.handover_can_act(bigint,text,text),private.require_request_authority(text,text,bigint) to postgres;

create function public.create_handover(p_successor uuid,p_starts timestamptz,p_ends timestamptz,p_items bigint[],p_reason text) returns bigint
language plpgsql security definer set search_path='' as $$
declare h bigint; x bigint; source public.profiles; successor public.profiles;
begin
 perform private.require_admin('Account Management','handover');
 select * into source from public.profiles where id=auth.uid() for update;
 select * into successor from public.profiles where id=p_successor for update;
 if not found or source.status<>'active' or successor.status<>'active' or successor.erp_role not in ('admin','owner') then raise exception 'Handover account unavailable'; end if;
 if p_starts is null or p_ends is null or p_ends<=p_starts or p_reason is null or length(btrim(p_reason)) not between 1 and 1000 or p_items is null or cardinality(p_items)=0 then raise exception 'Handover details required'; end if;
 if source.id<>auth.uid() and not private.is_owner() then raise exception 'Only Owner may hand over another account'; end if;
 if source.erp_role<>'owner' and not(private.has_action('Account Management','handover') or private.is_owner()) then raise exception 'Handover authority required'; end if;
 insert into public.handover_requests(source_id,successor_id,starts_at,ends_at,reason) values(source.id,p_successor,p_starts,p_ends,btrim(p_reason)) returning id into h;
 foreach x in array p_items loop
   if not exists(select 1 from public.approval_requests ar where ar.id=x and ar.status='pending' and ar.requester_id=source.id) then raise exception 'Selected approval is unavailable: %',x; end if;
   insert into public.handover_items values(h,x);
 end loop;
 insert into public.audit_events(actor_id,actor_name,action,entity_type,entity_id,reason,after_data) values(auth.uid(),source.employee_name,'Handover requested','handover',h::text,btrim(p_reason),jsonb_build_object('successor',p_successor,'startsAt',p_starts,'endsAt',p_ends,'items',p_items));
 return h;
end; $$;

create function public.decide_handover(p_handover bigint,p_approve boolean,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare h public.handover_requests; source public.profiles; successor public.profiles;
begin
 perform private.require_admin('Account Management','approve_handover');
 if p_approve is null then raise exception 'Decision required'; end if;
 if p_reason is null or length(btrim(p_reason)) not between 1 and 1000 then raise exception 'Decision reason required'; end if;
 select * into h from public.handover_requests where id=p_handover for update;
 if not found or h.status<>'pending' then raise exception 'Handover is not pending'; end if;
 if h.source_id=auth.uid() and not private.is_owner() then raise exception 'Only Owner may self-approve'; end if;
 select * into source from public.profiles where id=h.source_id for update;
 select * into successor from public.profiles where id=h.successor_id for update;
 if h.ends_at<=clock_timestamp() then update public.handover_requests set status='expired',decided_by=auth.uid(),decided_at=clock_timestamp(),decision_reason='Handover window expired',version=version+1 where id=h.id; return; end if;
 if p_approve then update public.handover_requests set status='approved',decided_by=auth.uid(),decided_at=clock_timestamp(),decision_reason=btrim(p_reason),version=version+1 where id=h.id;
 else update public.handover_requests set status='rejected',decided_by=auth.uid(),decided_at=clock_timestamp(),decision_reason=btrim(p_reason),version=version+1 where id=h.id; end if;
 insert into public.audit_events(actor_id,actor_name,action,entity_type,entity_id,reason,after_data) values(auth.uid(),(select employee_name from public.profiles where id=auth.uid()),case when p_approve then 'Handover approved' else 'Handover rejected' end,'handover',h.id::text,btrim(p_reason),jsonb_build_object('source',h.source_id,'successor',h.successor_id,'items',(select jsonb_agg(approval_request_id) from public.handover_items where handover_id=h.id)));
end; $$;

create function public.revoke_handover(p_handover bigint,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_admin('Account Management','handover');
 if p_reason is null or length(btrim(p_reason)) not between 1 and 1000 then raise exception 'Reason required'; end if;
 update public.handover_requests set status='revoked',decided_by=auth.uid(),decided_at=clock_timestamp(),decision_reason=btrim(p_reason),version=version+1 where id=p_handover and status='approved';
 if not found then raise exception 'Handover is not active'; end if;
end; $$;
revoke all on function public.create_handover(uuid,timestamptz,timestamptz,bigint[],text),public.decide_handover(bigint,boolean,text),public.revoke_handover(bigint,text) from public,anon,service_role;
grant execute on function public.create_handover(uuid,timestamptz,timestamptz,bigint[],text),public.decide_handover(bigint,boolean,text),public.revoke_handover(bigint,text) to authenticated;
