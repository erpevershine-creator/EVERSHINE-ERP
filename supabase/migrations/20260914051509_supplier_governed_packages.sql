-- Supplier package hardening and local execution boundary.
-- Applies only to the Supplier module; preserves existing Owner/Auth rows.
alter table public.suppliers add column if not exists country text;
update public.suppliers set country = coalesce(nullif(country,''),'Myanmar') where country is null or country='';
alter table public.suppliers alter column country set not null;
alter table public.suppliers drop constraint if exists unique_city_normalized_name;
alter table public.suppliers add constraint unique_country_normalized_name unique (country, normalized_legal_name);
alter table public.supplier_contacts add constraint one_supplier_contact unique (supplier_id);
alter table public.supplier_addresses add constraint one_supplier_address unique (supplier_id);
alter table public.supplier_commercial_agreements add constraint agreement_supplier_id_id unique (supplier_id,id);
alter table public.supplier_financial_formulas add constraint formula_agreement_same_supplier foreign key (supplier_id, agreement_id) references public.supplier_commercial_agreements(supplier_id, id);
-- Replace the previous city-identity preview function.
drop function if exists public.generate_supplier_code(text);
create function public.generate_supplier_code(p_country text)
returns text language plpgsql security invoker set search_path = public as $$
declare v_country text; v_seq integer; begin
  v_country := case lower(btrim(p_country)) when 'myanmar' then 'MM' when 'china' then 'CN' when 'india' then 'IN' when 'thailand' then 'TH' when 'united states' then 'US' else upper(btrim(p_country)) end;
  if v_country !~ '^[A-Z]{2}$' then raise exception 'Country must resolve to a two-letter ISO code'; end if;
  select coalesce(max(nullif(regexp_replace(supplier_code, '^SUP-'||v_country||'-', ''), '')::integer),0)+1 into v_seq from public.suppliers where supplier_code like 'SUP-'||v_country||'-%';
  if v_seq > 99999 then raise exception 'Supplier country sequence exhausted'; end if;
  return format('SUP-%s-%s',v_country,lpad(v_seq::text,5,'0'));
end; $$;
revoke all on function public.generate_supplier_code(text) from public;
-- Supplier data is only reachable through an active authenticated session and module action.
DO $$ declare t text; begin
 foreach t in array array['suppliers','supplier_contacts','supplier_addresses','supplier_commercial_agreements','supplier_financial_formulas','supplier_onboarding_approvals'] loop
   execute format('alter table public.%I enable row level security',t);
   execute format('revoke all on table public.%I from anon, authenticated',t);
   execute format('grant select on table public.%I to authenticated',t);
   execute format('create policy supplier_read on public.%I for select to authenticated using ((select private.has_action(''Suppliers & Commercials'',''view'')))',t);
 end loop; end $$;
-- The no-adjustment package is represented by zero titles and zero steps. This is
-- deliberately a small local RPC; approval activation remains a separate gate.
create or replace function public.validate_supplier_no_adjustment(p_titles jsonb, p_steps jsonb)
returns boolean language sql immutable as $$ select jsonb_typeof(p_titles)='array' and jsonb_array_length(p_titles)=0 and jsonb_typeof(p_steps)='array' and jsonb_array_length(p_steps)=0 $$;
revoke all on function public.validate_supplier_no_adjustment(jsonb,jsonb) from public;
