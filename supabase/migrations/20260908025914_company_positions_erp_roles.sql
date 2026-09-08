-- Company job titles are descriptive; six ERP roles bind to permission templates.
do $$ begin
 if exists(select 1 from public.profiles where erp_role not in ('owner','admin')) then
 raise exception 'Existing employee accounts need an explicitly approved ERP role mapping before migration'; end if;
end $$;
alter table public.positions add column erp_role_code text unique
 check(erp_role_code in ('owner','admin','sales','delivery','finance','inventory'));
update public.positions set erp_role_code='owner' where code='owner';
update public.positions set erp_role_code='admin',name='Admin' where code='account-administrator';
update public.positions set is_active=false where erp_role_code is null;
insert into public.positions(code,name,erp_role_code) values
 ('sales','Sales','sales'),('delivery','Delivery','delivery'),('finance','Finance','finance'),('inventory','Inventory','inventory');
insert into public.position_page_permissions(position_id,page_id,can_view)
select p.id,pg.id,false from public.positions p cross join public.pages pg
where p.erp_role_code in ('sales','delivery','finance','inventory');
alter table public.positions add constraint positions_id_role_unique unique(id,erp_role_code);
alter table public.positions add constraint positions_owner_role_consistent
 check((erp_role_code='owner')=is_owner_position);

alter table public.profiles add column company_position text;
update public.profiles p set company_position=pos.name from public.positions pos where pos.id=p.position_id;
alter table public.profiles alter column company_position set not null;
alter table public.profiles add constraint profiles_company_position_valid check(length(btrim(company_position)) between 1 and 120);
alter table public.profiles drop constraint profiles_erp_role_check;
alter table public.profiles add constraint profiles_erp_role_check
 check(erp_role in ('owner','admin','sales','delivery','finance','inventory'));
alter table public.profiles add constraint profiles_role_template_match
 foreign key(position_id,erp_role) references public.positions(id,erp_role_code) on delete restrict;

create or replace function private.initialize_profile_access() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.erp_role='owner' and new.company_position is null then new.company_position:='Owner'; end if;
 new.page_access:=private.template_access(new.position_id)->'pages';
 new.action_access:=private.template_access(new.position_id)->'actions';
 return new;
end; $$;

-- Owner is already provisioned; account creation always derives template from role.
drop function public.provision_employee(uuid,bigint,text,text,text,text,text,text);
create function public.provision_employee(p_id uuid,p_role text,p_name text,p_company_position text,p_department text,p_username text,p_contact text,p_avatar text)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); template jsonb; role_position bigint;
begin
 perform private.require_admin('Account Management','create');
 if p_role is null or p_role not in ('admin','sales','delivery','finance','inventory') then raise exception 'Select a valid non-Owner ERP role'; end if;
 if p_role='admin' and not private.is_owner() then raise exception 'Only Owner can appoint Admins'; end if;
 select id into role_position from public.positions where erp_role_code=p_role and is_active and not is_owner_position for update;
 if not found then raise exception 'ERP role unavailable'; end if;
 template:=private.template_access(role_position);
 if not private.can_delegate(template) then raise exception 'ERP role permissions exceed your authority'; end if;
 if p_company_position is null or length(btrim(p_company_position)) not between 1 and 120
 or p_name is null or length(btrim(p_name)) not between 1 and 120
 or p_department is null or length(btrim(p_department)) not between 1 and 120
 or p_contact is null or length(btrim(p_contact)) not between 1 and 120 then raise exception 'Invalid account details'; end if;
 if p_avatar is null or p_avatar not like p_id::text||'/%' then raise exception 'Invalid photo'; end if;
 if not exists(select 1 from auth.users where id=p_id and lower(email)=lower(p_username)
 and raw_app_meta_data->>'provisioned_by'=actor::text and email_confirmed_at is not null)
 then raise exception 'Account provisioning mismatch'; end if;
 insert into public.profiles(id,employee_name,company_position,position_id,department,erp_role,username,contact,avatar_path,created_by)
 values(p_id,btrim(p_name),btrim(p_company_position),role_position,btrim(p_department),p_role,lower(p_username),btrim(p_contact),p_avatar,actor);
 perform private.audit('Account created','profile',p_id::text,'Company-assigned account',null,
 jsonb_build_object('name',p_name,'company_position',btrim(p_company_position),'position',role_position,'role',p_role));
 return p_id;
end; $$;
revoke all on function public.provision_employee(uuid,text,text,text,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.provision_employee(uuid,text,text,text,text,text,text,text) to authenticated;

-- Fixed role catalogue; customization belongs to approved permission changes.
create or replace function public.create_position(p_name text,p_code text) returns bigint
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_admin('Positions & Permissions','create');
 raise exception 'ERP role catalogue is fixed; configure an existing role';
end; $$;
revoke all on function public.create_position(text,text) from public,anon,authenticated,service_role;

-- Existing permission module keys stay stable; the application displays the new label.
notify pgrst,'reload schema';
