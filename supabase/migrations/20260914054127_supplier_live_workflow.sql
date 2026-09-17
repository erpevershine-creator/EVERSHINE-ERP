-- D157: City identity, immutable approval packages, guarded local commands.
-- No Owner/Auth mutation; all writes are transactional and session-authorized.
insert into public.pages(id,label,group_name,display_order)
select 'suppliers','Suppliers & Commercials','workspace',max(display_order)+1 from public.pages
on conflict(id) do nothing;
create table private.supplier_city_sequences (
 city text primary key, prefix text not null unique, last_value integer not null check(last_value between 0 and 99999)
);
alter table private.supplier_city_sequences enable row level security;
revoke all on private.supplier_city_sequences from public, anon, authenticated;
alter table public.suppliers drop constraint unique_country_normalized_name;
create unique index suppliers_city_name on public.suppliers(lower(btrim(city)),normalized_legal_name) where normalized_legal_name<>'';
alter table public.suppliers add column edit_version integer not null default 0;
alter table public.suppliers add column active_package_id uuid;
create table public.supplier_packages (
 id uuid primary key default gen_random_uuid(), supplier_id uuid not null references public.suppliers on delete restrict,
 revision integer not null check(revision>0), payload jsonb not null check(jsonb_typeof(payload)='object'),
 status text not null check(status in ('draft','pending','active','archived','rejected','cancelled')),
 created_by uuid not null references public.profiles, edited_by uuid not null references public.profiles,
 reason text not null, request_id bigint unique references public.approval_requests,
 created_at timestamptz not null default now(), unique(supplier_id,revision), unique(supplier_id,id)
);
alter table public.suppliers add constraint active_supplier_package foreign key(id,active_package_id) references public.supplier_packages(supplier_id,id);
create unique index supplier_one_active_package on public.supplier_packages(supplier_id) where status='active';
create unique index supplier_one_working_package on public.supplier_packages(supplier_id) where status in ('draft','pending');
create unique index supplier_one_active_agreement on public.supplier_commercial_agreements(supplier_id) where status='active';
create unique index supplier_one_active_formula on public.supplier_financial_formulas(supplier_id) where status='active';
create table private.supplier_commands (
 token uuid primary key, actor uuid not null references public.profiles, args jsonb not null, result jsonb not null
);
alter table private.supplier_commands enable row level security;
revoke all on private.supplier_commands from public,anon,authenticated;

create function private.supplier_authorize(p_action text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.can_view_page('suppliers') or not private.has_action('Suppliers & Commercials',p_action) then
  raise exception 'Supplier permission denied' using errcode='42501';
 end if;
 if p_action='approve' and (not private.can_view_page('approvals') or not exists(select 1 from public.profiles where id=auth.uid() and erp_role in ('owner','admin'))) then
  raise exception 'Supplier approval requires Owner or authorized Admin' using errcode='42501';
 end if;
end; $$;
create function private.supplier_name(p_name text) returns text language sql immutable set search_path='' as $$
 select lower(regexp_replace(normalize(p_name,NFKC),'[^a-zA-Z0-9Ā-￿]','','g'));
$$;
create function private.supplier_city_prefix(p_city text) returns text language plpgsql immutable set search_path='' as $$
declare c text; begin
 c:=case lower(btrim(p_city)) when 'yangon' then 'YGN' when 'mandalay' then 'MDY' when 'naypyitaw' then 'NPT'
 else left(upper(regexp_replace(btrim(p_city),'[^a-zA-Z]','','g')),3) end;
 if c is null or c !~ '^[A-Z]{3}$' then raise exception 'Enter a city with a valid three-letter code'; end if;
 return c;
end; $$;
-- Preview is advisory. Only save_supplier_package allocates a number.
drop function public.generate_supplier_code(text);
create function public.generate_supplier_code(p_city text) returns text language plpgsql security definer set search_path='' as $$
declare c text; n integer; begin
 perform private.supplier_authorize('create'); c:=private.supplier_city_prefix(p_city);
 select last_value+1 into n from private.supplier_city_sequences where city=lower(btrim(p_city));
 n:=coalesce(n,1); if n>99999 then raise exception 'Supplier city sequence exhausted'; end if;
 return 'SUP-'||c||'-'||lpad(n::text,5,'0');
end; $$;

create function private.supplier_number(j jsonb) returns numeric language plpgsql immutable set search_path='' as $$
declare n numeric; begin
 if j is null or jsonb_typeof(j)<>'number' then raise exception 'A finite numeric value is required'; end if;
 n:=j::text::numeric;
 if abs(n)>1000000000000 then raise exception 'Calculation exceeds supported range'; end if;
 return round(n,6);
end; $$;
create function private.validate_supplier_payload(p jsonb, complete boolean) returns jsonb language plpgsql immutable set search_path='' as $$
declare path text; v text; titles jsonb; steps jsonb; t jsonb; st jsonb; i integer:=0; refs jsonb:='{}'; ids text[]:='{}';
 base numeric; qty numeric; dep numeric; total numeric; running numeric; basis numeric; adj numeric; out_value numeric; val numeric;
 ref integer; details jsonb:='[]'; currency text;
begin
 if p is null or jsonb_typeof(p)<>'object' or octet_length(p::text)>100000 then raise exception 'Invalid Supplier package'; end if;
 foreach path in array array['city','legalName','contact,name','contact,phone','contact,email','address,addressLine','address,cityTownship','address,stateRegion','address,country','agreement,currencyCode','agreement,currencyName'] loop
  v:=p#>>string_to_array(path,',');
  if v is null and path='contact,email' then continue; end if;
  if v is null or jsonb_typeof(p#>string_to_array(path,','))<>'string' or length(v)>240 then raise exception 'Invalid field: %',path; end if;
  if complete and btrim(v)='' and path<>'contact,email' then raise exception 'Required field: %',path; end if;
 end loop;
 perform private.supplier_city_prefix(p->>'city');
 if btrim(p#>>'{address,country}')='' then raise exception 'Country is required before assigning Supplier identity'; end if;
 titles:=p#>'{agreement,titles}'; steps:=p#>'{formula,steps}';
 if jsonb_typeof(titles) is distinct from 'array' or jsonb_typeof(steps) is distinct from 'array' then raise exception 'Titles and steps must be arrays'; end if;
 if jsonb_array_length(titles)>100 or jsonb_array_length(steps)>100 then raise exception 'Maximum 100 titles and steps'; end if;
 base:=private.supplier_number(p->'sampleBasePrice'); qty:=private.supplier_number(p->'sampleQuantity'); dep:=private.supplier_number(p->'sampleDeposit');
 if not complete then return '{}'::jsonb; end if;
 if private.supplier_name(p->>'legalName')='' then raise exception 'Legal Name is required'; end if;
 if p#>>'{contact,phone}' !~ '^\+?[0-9 ()-]{5,30}$' then raise exception 'Invalid contact phone'; end if;
 if coalesce(p#>>'{contact,email}','')<>'' and p#>>'{contact,email}' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invalid contact email'; end if;
 currency:=case p#>>'{agreement,currencyCode}' when 'MMK' then 'Myanmar Kyat' when 'USD' then 'US Dollar' when 'THB' then 'Thai Baht' when 'CNY' then 'Chinese Yuan' when 'INR' then 'Indian Rupee' end;
 if currency is null or currency<>p#>>'{agreement,currencyName}' then raise exception 'Invalid currency code or name'; end if;
 if base<0 or qty<=0 or dep<0 then raise exception 'Invalid sample price, quantity or Deposit'; end if;
 for t in select value from jsonb_array_elements(titles) loop
  if jsonb_typeof(t->'id') is distinct from 'string' or coalesce(t->>'id','')='' or t->>'id'=any(ids)
   or jsonb_typeof(t->'name') is distinct from 'string' or coalesce(btrim(t->>'name'),'')='' or coalesce(t->>'valueType','') not in ('amount','percentage') then raise exception 'Invalid or duplicate Financial Title'; end if;
  ids:=array_append(ids,t->>'id'); perform private.supplier_number(t->'value');
 end loop;
 if jsonb_array_length(titles)>0 and jsonb_array_length(steps)=0 then raise exception 'Configure steps for Financial Titles'; end if;
 total:=round(base*qty,6); running:=total;
 for st in select value from jsonb_array_elements(steps) loop
  i:=i+1;
  if jsonb_typeof(st->'stepNumber') is distinct from 'number' or (st->>'stepNumber')::numeric<>i then raise exception 'Steps must be consecutive and ordered'; end if;
  select value into t from jsonb_array_elements(titles) where value->>'id'=st->>'titleId';
  if t is null then raise exception 'Financial Title reference missing'; end if;
  if st->>'basis'='total' then basis:=total;
  elsif st->>'basis'='current_value' then basis:=running;
  elsif st->>'basis' ~ '^step_[1-9][0-9]*$' then
   ref:=substring(st->>'basis',6)::integer;
   if ref>=i or not refs ? ref::text then raise exception 'Invalid earlier-step reference'; end if;
   basis:=(refs->>ref::text)::numeric;
  else raise exception 'Invalid formula Basis'; end if;
  val:=private.supplier_number(t->'value'); adj:=case when t->>'valueType'='percentage' then round(basis*val/100,6) else val end;
  case st->>'operator'
   when '+' then out_value:=basis+adj; running:=running+adj;
   when '-' then out_value:=basis-adj; running:=running-adj;
   when '*' then out_value:=round(basis*adj,6); running:=round(running*adj,6);
   when '/' then if adj=0 then raise exception 'Division by zero'; end if; out_value:=round(basis/adj,6); running:=round(running/adj,6);
   else raise exception 'Invalid formula operator';
  end case;
  if abs(running)>1000000000000 or abs(out_value)>1000000000000 then raise exception 'Calculation exceeds supported range'; end if;
  refs:=refs||jsonb_build_object(i::text,out_value);
  details:=details||jsonb_build_array(jsonb_build_object('stepNumber',i,'titleName',t->>'name','valueType',t->>'valueType','value',val,'basisUsed',basis,'adjustment',adj,'runningTotal',running));
 end loop;
 if dep>running then raise exception 'Deposit cannot exceed Sub Total'; end if;
 if abs(total)>1000000000000 then raise exception 'Calculation exceeds supported range'; end if;
 return jsonb_build_object('total',total,'subTotal',round(running,2),'deposit',round(dep,2),'grandTotal',round(running-dep,2),'stepDetails',details);
end; $$;

create function private.supplier_immutable() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='DELETE' then raise exception 'Supplier history cannot be deleted'; end if;
 if old.status<>'draft' and (new.payload is distinct from old.payload or new.supplier_id<>old.supplier_id or new.revision<>old.revision or new.created_by<>old.created_by or new.edited_by<>old.edited_by or new.reason<>old.reason) then raise exception 'Submitted Supplier package is immutable'; end if;
 if old.status in ('archived','rejected','cancelled') and new is distinct from old then raise exception 'Terminal Supplier history is immutable'; end if;
 if new.status<>old.status and not ((old.status='draft' and new.status in ('pending','cancelled')) or (old.status='pending' and new.status in ('active','rejected','cancelled')) or (old.status='active' and new.status='archived')) then raise exception 'Invalid package transition'; end if;
 return new;
end; $$;
create trigger supplier_package_immutable before update or delete on public.supplier_packages for each row execute function private.supplier_immutable();

create function public.save_supplier_package(p_id uuid,p_expected integer,p_payload jsonb,p_reason text,p_submit boolean,p_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.suppliers; pkg public.supplier_packages; n integer; prefix text; code text; req bigint; result jsonb; args jsonb; prior private.supplier_commands; calc jsonb;
begin
 perform private.supplier_authorize(case when p_id is null then 'create' else 'edit' end);
 if p_submit then perform private.supplier_authorize('submit'); end if;
 if p_submit is null or p_expected is null or p_token is null or coalesce(length(btrim(p_reason)),0) not between 1 and 1000 then raise exception 'Reason and command identity required'; end if;
 -- One lock order for every mutation also serializes duplicate name and city allocation.
 perform pg_advisory_xact_lock(1572026);
 args:=jsonb_build_object('id',p_id,'expected',p_expected,'payload',p_payload,'reason',p_reason,'submit',p_submit);
 select * into prior from private.supplier_commands where token=p_token;
 if found then
  if prior.actor<>auth.uid() or prior.args<>args then raise exception 'Command token was already used with different input'; end if;
  return prior.result;
 end if;
 calc:=private.validate_supplier_payload(p_payload,p_submit);
 if exists(select 1 from public.suppliers where id is distinct from p_id and lower(btrim(city))=lower(btrim(p_payload->>'city')) and normalized_legal_name=private.supplier_name(p_payload->>'legalName') and normalized_legal_name<>'')
 or exists(select 1 from public.supplier_packages where supplier_id is distinct from p_id and status in ('draft','pending') and lower(btrim(payload->>'city'))=lower(btrim(p_payload->>'city')) and private.supplier_name(payload->>'legalName')=private.supplier_name(p_payload->>'legalName') and private.supplier_name(payload->>'legalName')<>'') then raise exception 'Supplier Legal Name already exists in this city'; end if;
 if p_id is null then
  if p_expected<>0 then raise exception 'New Supplier must start at version zero'; end if;
  prefix:=private.supplier_city_prefix(p_payload->>'city');
  insert into private.supplier_city_sequences(city,prefix,last_value) values(lower(btrim(p_payload->>'city')),prefix,1)
  on conflict(city) do update set last_value=private.supplier_city_sequences.last_value+1 returning last_value into n;
  code:='SUP-'||prefix||'-'||lpad(n::text,5,'0');
  insert into public.suppliers(city,country,supplier_code,legal_name,normalized_legal_name,created_by)
   values(btrim(p_payload->>'city'),btrim(p_payload#>>'{address,country}'),code,btrim(p_payload->>'legalName'),private.supplier_name(p_payload->>'legalName'),auth.uid()) returning * into s;
 else
  select * into s from public.suppliers where id=p_id for update;
  if not found or s.edit_version<>p_expected then raise exception 'Supplier changed; reload before saving'; end if;
  if lower(btrim(s.city))<>lower(btrim(p_payload->>'city')) or s.country<>btrim(p_payload#>>'{address,country}') then raise exception 'Supplier city and country cannot change after creation'; end if;
 end if;
 select * into pkg from public.supplier_packages where supplier_id=s.id and status in ('draft','pending') for update;
 if found and pkg.status='pending' then raise exception 'Withdraw the pending request before editing'; end if;
 if pkg.id is null then
  select coalesce(max(revision),0)+1 into n from public.supplier_packages where supplier_id=s.id;
  insert into public.supplier_packages(supplier_id,revision,payload,status,created_by,edited_by,reason)
   values(s.id,n,p_payload,'draft',auth.uid(),auth.uid(),btrim(p_reason)) returning * into pkg;
 else
  update public.supplier_packages set payload=p_payload,edited_by=auth.uid(),reason=btrim(p_reason) where id=pkg.id returning * into pkg;
 end if;
 if p_submit then
  insert into public.approval_requests(request_type,module,requester_id,target_type,target_id,current_data,proposed_data,reason,status)
   values('supplier_package','Suppliers & Commercials',auth.uid(),'supplier',s.id::text,
    coalesce((select jsonb_build_object('packageId',id,'revision',revision,'payload',payload) from public.supplier_packages where id=s.active_package_id),'{}'),
    jsonb_build_object('packageId',pkg.id,'revision',pkg.revision,'code',s.supplier_code,'payload',p_payload,'calculation',calc),btrim(p_reason),'pending') returning id into req;
  update public.supplier_packages set status='pending',request_id=req where id=pkg.id;
  insert into public.notifications(recipient_id,notification_type,title,message,approval_request_id)
   select id,'approval','Supplier approval requested',s.supplier_code||' · '||btrim(p_reason),req from public.profiles
   where status='active' and (erp_role='owner' or (erp_role='admin' and (coalesce(action_access->'Suppliers & Commercials','[]') ? 'approve' or coalesce(action_access->'Suppliers & Commercials','[]') ? '*' or coalesce(individual_actions->'Suppliers & Commercials','[]') ? 'approve')));
 end if;
 update public.suppliers set edit_version=edit_version+1,updated_at=now(),
  legal_name=case when active_package_id is null then btrim(p_payload->>'legalName') else legal_name end,
  normalized_legal_name=case when active_package_id is null then private.supplier_name(p_payload->>'legalName') else normalized_legal_name end,
  status=case when active_package_id is not null then 'active' when p_submit then 'pending_approval' else 'draft' end where id=s.id;
 perform private.audit(case when p_submit then 'Supplier submitted' else 'Supplier draft saved' end,'supplier',s.id::text,p_reason,null,p_payload,req);
 result:=jsonb_build_object('id',s.id,'code',s.supplier_code,'version',s.edit_version+1,'requestId',req);
 insert into private.supplier_commands values(p_token,auth.uid(),args,result);
 return result;
end; $$;

create function public.decide_supplier_package(p_request bigint,p_decision text,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare r public.approval_requests; pkg public.supplier_packages; s public.suppliers; p jsonb;
begin
 perform private.supplier_authorize(case when p_decision='withdraw' then 'submit' else 'approve' end);
 if p_decision is null or p_decision not in ('approve','reject','withdraw') or coalesce(length(btrim(p_reason)),0) not between 1 and 1000 then raise exception 'Valid decision and reason required'; end if;
 perform pg_advisory_xact_lock(1572026);
 select * into r from public.approval_requests where id=p_request for update;
 if not found or r.request_type<>'supplier_package' or r.status<>'pending' then raise exception 'Supplier request is not pending'; end if;
 select * into pkg from public.supplier_packages where request_id=r.id for update;
 select * into s from public.suppliers where id=pkg.supplier_id for update;
 if pkg.id is null or s.id is null or pkg.status<>'pending' or r.proposed_data->>'packageId' is distinct from pkg.id::text or r.proposed_data->'payload' is distinct from pkg.payload or coalesce(r.current_data->>'packageId','')<>coalesce(s.active_package_id::text,'') then raise exception 'Supplier approval snapshot changed'; end if;
 if p_decision='withdraw' and r.requester_id<>auth.uid() then raise exception 'Only requester can withdraw'; end if;
 if p_decision<>'withdraw' and not private.is_owner() and (r.requester_id=auth.uid() or pkg.created_by=auth.uid() or pkg.edited_by=auth.uid() or s.created_by=auth.uid()) then raise exception 'Only Owner may self-approve'; end if;
 p:=pkg.payload;
 if p_decision='approve' then
  perform private.validate_supplier_payload(p,true);
  update public.supplier_packages set status='archived' where id=s.active_package_id;
  update public.supplier_commercial_agreements set status='archived' where supplier_id=s.id and status='active';
  update public.supplier_financial_formulas set status='archived' where supplier_id=s.id and status='active';
  insert into public.supplier_commercial_agreements(id,supplier_id,currency_code,currency_name,titles,version,status)
   values(pkg.id,s.id,p#>>'{agreement,currencyCode}',p#>>'{agreement,currencyName}',p#>'{agreement,titles}',pkg.revision,'active');
  insert into public.supplier_financial_formulas(id,supplier_id,agreement_id,steps,version,status)
   values(pkg.id,s.id,pkg.id,p#>'{formula,steps}',pkg.revision,'active');
  insert into public.supplier_contacts(supplier_id,name,phone,email) values(s.id,p#>>'{contact,name}',p#>>'{contact,phone}',nullif(p#>>'{contact,email}',''))
   on conflict(supplier_id) do update set name=excluded.name,phone=excluded.phone,email=excluded.email;
  insert into public.supplier_addresses(supplier_id,address_line,city_township,state_region,country)
   values(s.id,p#>>'{address,addressLine}',p#>>'{address,cityTownship}',p#>>'{address,stateRegion}',p#>>'{address,country}')
   on conflict(supplier_id) do update set address_line=excluded.address_line,city_township=excluded.city_township,state_region=excluded.state_region;
  update public.supplier_packages set status='active' where id=pkg.id;
  update public.suppliers set active_package_id=pkg.id,status='active',legal_name=btrim(p->>'legalName'),normalized_legal_name=private.supplier_name(p->>'legalName') where id=s.id;
 else
  update public.supplier_packages set status=case when p_decision='withdraw' then 'cancelled' else 'rejected' end where id=pkg.id;
  update public.suppliers set status=case when active_package_id is not null then 'active' else 'rejected' end where id=s.id;
 end if;
 update public.suppliers set edit_version=edit_version+1,updated_at=now() where id=s.id;
 update public.approval_requests set status=case p_decision when 'approve' then 'approved' when 'reject' then 'rejected' else 'cancelled' end,decided_by=auth.uid(),decided_at=now(),decision_reason=btrim(p_reason),version=version+1 where id=r.id;
 insert into public.notifications(recipient_id,notification_type,title,message,approval_request_id) values(r.requester_id,'approval','Supplier request '||p_decision,s.supplier_code||' · '||btrim(p_reason),r.id);
 perform private.audit('Supplier '||p_decision,'supplier',s.id::text,p_reason,r.current_data,r.proposed_data,r.id);
end; $$;

alter table public.supplier_packages enable row level security;
revoke all on public.supplier_packages from public,anon,authenticated;
grant select on public.supplier_packages to authenticated;
create policy supplier_packages_read on public.supplier_packages for select to authenticated using ((select private.can_view_page('suppliers')));
-- Every Supplier read is additionally fenced by the real page/session check.
do $$ declare t text; begin
 foreach t in array array['suppliers','supplier_contacts','supplier_addresses','supplier_commercial_agreements','supplier_financial_formulas','supplier_onboarding_approvals'] loop
  execute format('create policy supplier_session_read on public.%I as restrictive for select to authenticated using ((select private.can_view_page(''suppliers'')))',t);
 end loop;
end; $$;
revoke all on function private.supplier_authorize(text), private.supplier_name(text), private.supplier_city_prefix(text), private.supplier_number(jsonb), private.validate_supplier_payload(jsonb,boolean), private.supplier_immutable() from public,anon,authenticated;
revoke all on function public.generate_supplier_code(text),public.save_supplier_package(uuid,integer,jsonb,text,boolean,uuid),public.decide_supplier_package(bigint,text,text) from public,anon;
grant execute on function public.generate_supplier_code(text),public.save_supplier_package(uuid,integer,jsonb,text,boolean,uuid),public.decide_supplier_package(bigint,text,text) to authenticated;
notify pgrst,'reload schema';
