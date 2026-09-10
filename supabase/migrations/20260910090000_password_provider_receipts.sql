-- Auth v2.196.0 adminUserUpdate changes password then app_metadata in one
-- transaction. Validate the FINAL row with a deferred constraint trigger.
-- No password/verifier or recovery code is stored in receipts/audit.
create table private.password_provider_receipts (
 operation_id uuid primary key,
 target_id uuid not null references public.profiles(id),
 operation_kind text not null check(operation_kind in ('password','recovery')),
 recorded_at timestamptz not null default clock_timestamp()
);
revoke all on private.password_provider_receipts from public,anon,authenticated,service_role;

create function private.record_password_provider_receipt() returns trigger
language plpgsql security definer set search_path='' as $$
declare marker text; op uuid; kind text; p public.profiles;
begin
 -- Bootstrap Auth creation precedes ERP provisioning. Existing ERP identities
 -- must always use a governed operation, including direct Auth user updates.
 select * into p from public.profiles where id=new.id for update;
 if not found then return null; end if;
 select raw_app_meta_data->>'erp_password_operation' into marker from auth.users where id=new.id;
 if marker is null or marker !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
   raise exception 'Governed password operation required' using errcode='42501';
 end if;
 op:=marker::uuid;
 if p.password_change_pending and not p.recovery_pending and exists(
   select 1 from private.password_change_operations where id=op and target_id=p.id and status='running') then kind:='password';
 elsif p.recovery_pending and exists(
   select 1 from private.recovery_operations where id=op and owner_id=p.id and status='running') then kind:='recovery';
 else raise exception 'Password operation is no longer current' using errcode='42501'; end if;
 if exists(select 1 from private.password_provider_receipts where operation_id=op) then
   raise exception 'Password operation already applied' using errcode='42501';
 end if;
 insert into private.password_provider_receipts(operation_id,target_id,operation_kind) values(op,p.id,kind);
 return null;
end; $$;
revoke all on function private.record_password_provider_receipt() from public,anon,authenticated,service_role;
create constraint trigger erp_password_provider_receipt after update on auth.users
deferrable initially deferred for each row
when (old.encrypted_password is distinct from new.encrypted_password)
execute function private.record_password_provider_receipt();

-- Keep the already-tested completion behavior behind a proof-checking entrypoint.
alter function public.finish_password_change(uuid,boolean) set schema private;
alter function private.finish_password_change(uuid,boolean) rename to finish_password_change_record;
revoke all on function private.finish_password_change_record(uuid,boolean) from public,anon,authenticated,service_role;
create function public.finish_password_change(p_operation uuid,p_success boolean) returns void
language plpgsql security definer set search_path='' as $$
declare proven boolean; target uuid;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Server only'; end if;
 select target_id into target from private.password_change_operations where id=p_operation;
 -- Match preparation/provider lock order: profile before operation. Otherwise
 -- completion and a verified retry could deadlock while superseding the row.
 perform 1 from public.profiles where id=target for update;
 if not exists(select 1 from private.password_change_operations where id=p_operation and status='running') then raise exception 'Password operation unavailable'; end if;
 select exists(select 1 from private.password_provider_receipts r join private.password_change_operations o on o.id=r.operation_id and o.target_id=r.target_id where o.id=p_operation and r.operation_kind='password') into proven;
 if p_success is null or p_success is distinct from proven then raise exception 'Provider outcome does not match committed receipt'; end if;
 perform private.finish_password_change_record(p_operation,p_success);
end; $$;

alter function public.finish_owner_recovery(uuid,boolean) set schema private;
alter function private.finish_owner_recovery(uuid,boolean) rename to finish_owner_recovery_record;
revoke all on function private.finish_owner_recovery_record(uuid,boolean) from public,anon,authenticated,service_role;
create function public.finish_owner_recovery(p_operation uuid,p_success boolean) returns void
language plpgsql security definer set search_path='' as $$
declare proven boolean; target uuid;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Server only'; end if;
 select owner_id into target from private.recovery_operations where id=p_operation and status='running';
 if not found then raise exception 'Recovery operation unavailable'; end if;
 perform 1 from public.profiles where id=target for update;
 select exists(select 1 from private.password_provider_receipts where operation_id=p_operation and target_id=target and operation_kind='recovery') into proven;
 if p_success is null or p_success is distinct from proven then raise exception 'Provider outcome does not match committed receipt'; end if;
 perform private.finish_owner_recovery_record(p_operation,p_success);
 if p_success then
   update public.profiles set password_change_pending=false where id=target;
   update public.device_sessions set status='logged_out',ended_at=clock_timestamp(),ended_reason='Owner recovery completion' where profile_id=target and status in ('active','pending');
 end if;
end; $$;
revoke all on function public.finish_password_change(uuid,boolean),public.finish_owner_recovery(uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.finish_password_change(uuid,boolean),public.finish_owner_recovery(uuid,boolean) to service_role;

-- A receipt-only check is safe after an uncertain provider response. It never
-- clears a fence or treats elapsed time as evidence of success.
create function public.password_provider_applied(p_operation uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Server only'; end if;
 return exists(select 1 from private.password_provider_receipts where operation_id=p_operation);
end; $$;
revoke all on function public.password_provider_applied(uuid) from public,anon,authenticated,service_role;
grant execute on function public.password_provider_applied(uuid) to service_role;

alter table private.password_change_operations drop constraint password_change_operations_status_check;
alter table private.password_change_operations add check(status in ('running','failed','completed','superseded'));
alter table private.recovery_operations drop constraint recovery_operations_status_check;
alter table private.recovery_operations add check(status in ('running','failed','completed','superseded'));
create function private.supersede_password_operations(p_target uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare o record;
begin
 -- Caller has already locked the target and verified current authority or code.
 -- The Auth commit trigger uses that same profile lock, so a late old request
 -- either commits before replacement or is rejected after replacement.
 for o in select id,'password'::text as kind from private.password_change_operations where target_id=p_target and status='running'
 union all select id,'recovery' from private.recovery_operations where owner_id=p_target and status='running' loop
   if o.kind='password' then update private.password_change_operations set status='superseded',finished_at=clock_timestamp() where id=o.id;
   else update private.recovery_operations set status='superseded',finished_at=clock_timestamp() where id=o.id; end if;
   insert into public.audit_events(actor_id,actor_name,action,entity_type,entity_id,reason,after_data)
   select coalesce(auth.uid(),p_target),employee_name,'Password operation superseded','profile',p_target::text,p_reason,
   jsonb_build_object('operation',o.id,'kind',o.kind,'providerApplied',exists(select 1 from private.password_provider_receipts where operation_id=o.id))
   from public.profiles where id=coalesce(auth.uid(),p_target);
 end loop;
end; $$;
revoke all on function private.supersede_password_operations(uuid,text) from public,anon,authenticated,service_role;
-- Existing application definers are owned by the local postgres admin role;
-- callers still have no direct privilege on this internal helper.
grant execute on function private.supersede_password_operations(uuid,text) to postgres;
create or replace function public.prepare_password_change(p_target uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.profiles; op uuid;
begin
 if p_reason is null or length(btrim(p_reason)) not between 1 and 1000 then raise exception 'Reason required'; end if;
 perform private.require_admin('Account Management','change_password');
 select * into p from public.profiles where id=p_target for update;
 if not found or p.recovery_pending or p.status in ('inactive','disabled') then raise exception 'Account unavailable'; end if;
 if p.erp_role='owner' and (not private.is_owner() or p.id<>auth.uid()) then raise exception 'Only Owner may change Owner password'; end if;
 if p.id=auth.uid() and p.erp_role<>'owner' then raise exception 'Employees cannot change their own password'; end if;
 if p.erp_role='admin' and not private.is_owner() then raise exception 'Only Owner may change Admin password'; end if;
 if not private.can_delegate(private.permission_snapshot(p.id,p.page_access,p.action_access)) then raise exception 'Account exceeds your scope'; end if;
 perform private.supersede_password_operations(p.id,'Authorized password retry');
 insert into private.password_change_operations(actor_id,target_id,reason,status) values(auth.uid(),p.id,btrim(p_reason),'running') returning id into op;
 update public.profiles set password_change_pending=true,sessions_valid_after=clock_timestamp(),version=version+1 where id=p.id;
 update public.device_sessions set status='logged_out',ended_at=clock_timestamp(),ended_reason='Password change' where profile_id=p.id and status in ('active','pending');
 perform private.audit('Password change started','profile',p.id::text,btrim(p_reason),jsonb_build_object('status',p.status),jsonb_build_object('status','password_change_pending'));
 return jsonb_build_object('operation',op,'target',p.id);
end; $$;

create or replace function public.begin_owner_recovery(p_username text,p_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.profiles; t private.recovery_throttle; op uuid;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Server only'; end if;
 select * into t from private.recovery_throttle where id for update;
 if t.window_start<now()-interval '15 minutes' then update private.recovery_throttle set attempts=0,window_start=now() where id; t.attempts:=0; end if;
 if t.attempts>=5 then return jsonb_build_object('error','Recovery temporarily limited. Try again later.'); end if;
 update private.recovery_throttle set attempts=attempts+1 where id;
 select * into p from public.profiles where erp_role='owner' and status in ('active','locked') and username=lower(p_username) for update;
 if not found or p_hash !~ '^[0-9a-f]{64}$' or not exists(select 1 from private.owner_recovery_codes
 where owner_id=p.id and invalidated_at is null and used_at is null and code_hash=decode(p_hash,'hex')) then
 return jsonb_build_object('error','Recovery details could not be verified.'); end if;
 perform private.supersede_password_operations(p.id,'Verified Owner recovery retry');
 insert into private.recovery_operations(owner_id,status) values(p.id,'running') returning id into op;
 update public.profiles set recovery_pending=true,sessions_valid_after=clock_timestamp(),version=version+1 where id=p.id;
 update public.device_sessions set status='logged_out',ended_at=now(),ended_reason='Owner recovery' where profile_id=p.id and status in ('active','pending');
 insert into public.audit_events(actor_id,actor_name,action,entity_type,entity_id,reason)
 values(p.id,p.employee_name,'Owner recovery started','profile',p.id::text,'Emergency recovery code verified');
 return jsonb_build_object('operation',op,'owner',p.id);
end; $$;

notify pgrst,'reload schema';
