-- Password changes are a fenced server/provider operation. Plaintext
-- passwords never enter PostgreSQL, audit rows or approval records.
create table private.password_change_operations (
 id uuid primary key default gen_random_uuid(),
 actor_id uuid not null references public.profiles(id) on delete restrict,
 target_id uuid not null references public.profiles(id) on delete restrict,
 reason text not null check (length(btrim(reason)) between 1 and 1000),
 status text not null check (status in ('running','failed','completed')),
 created_at timestamptz not null default clock_timestamp(),
 finished_at timestamptz
);
create unique index one_running_password_change on private.password_change_operations(target_id) where status='running';
revoke all on private.password_change_operations from public,anon,authenticated,service_role;

create function public.prepare_password_change(p_target uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.profiles; op uuid;
begin
 if p_reason is null or length(btrim(p_reason)) not between 1 and 1000 then raise exception 'Reason required'; end if;
 perform private.require_admin('Account Management','change_password');
 select * into p from public.profiles where id=p_target for update;
 if not found or p.status in ('inactive','disabled') then raise exception 'Account unavailable'; end if;
 if p.erp_role='owner' and (not private.is_owner() or p.id<>auth.uid()) then raise exception 'Only Owner may change Owner password'; end if;
 if p.id=auth.uid() and p.erp_role<>'owner' then raise exception 'Employees cannot change their own password'; end if;
 if p.erp_role='admin' and not private.is_owner() then raise exception 'Only Owner may change Admin password'; end if;
 if not private.can_delegate(private.permission_snapshot(p.id,p.page_access,p.action_access)) then raise exception 'Account exceeds your scope'; end if;
 if exists(select 1 from private.password_change_operations where target_id=p.id and status='running') then raise exception 'Password change already running'; end if;
 insert into private.password_change_operations(actor_id,target_id,reason,status) values(auth.uid(),p.id,btrim(p_reason),'running') returning id into op;
 update public.profiles set sessions_valid_after=clock_timestamp(),version=version+1 where id=p.id;
 update public.device_sessions set status='logged_out',ended_at=clock_timestamp(),ended_reason='Password change' where profile_id=p.id and status in ('active','pending');
 perform private.audit('Password change started','profile',p.id::text,btrim(p_reason),jsonb_build_object('status',p.status),jsonb_build_object('status','password_change_pending'));
 return jsonb_build_object('operation',op,'target',p.id);
end; $$;

create function public.finish_password_change(p_operation uuid,p_success boolean) returns void
language plpgsql security definer set search_path='' as $$
declare o private.password_change_operations; p public.profiles;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Server only'; end if;
 select * into o from private.password_change_operations where id=p_operation for update;
 if not found or o.status<>'running' then raise exception 'Password operation unavailable'; end if;
 select * into p from public.profiles where id=o.target_id for update;
 update private.password_change_operations set status=case when p_success then 'completed' else 'failed' end,finished_at=clock_timestamp() where id=o.id;
 if p_success then update public.profiles set password_changed_at=clock_timestamp(),password_expires_at=clock_timestamp()+interval '6 months',failed_login_attempts=0,version=version+1 where id=p.id; end if;
 perform private.audit(case when p_success then 'Password change completed' else 'Password change failed' end,'profile',p.id::text,o.reason,jsonb_build_object('operation',o.id),jsonb_build_object('status',case when p_success then 'completed' else 'failed' end));
end; $$;

revoke all on function public.prepare_password_change(uuid,text),public.finish_password_change(uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.prepare_password_change(uuid,text) to authenticated;
grant execute on function public.finish_password_change(uuid,boolean) to service_role;
notify pgrst,'reload schema';
