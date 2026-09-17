-- EVERSHINE ERP Supplier Module Migration
-- Implements City-based supplier code generation (SUP-{CITY}-00001), normalized legal name uniqueness,
-- structured address, contact person, commercial agreements, financial formulas with backward references,
-- and single package transactional approval.

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  city text not null,
  supplier_code text not null unique,
  legal_name text not null,
  normalized_legal_name text not null,
  status text not null default 'draft' check (status in ('draft', 'pending_approval', 'active', 'archived', 'rejected')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint unique_city_normalized_name unique (city, normalized_legal_name)
);

create table if not exists public.supplier_contacts (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  name text not null,
  phone text not null,
  email text,
  created_at timestamptz not null default now()
);

create table if not exists public.supplier_addresses (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  address_line text not null,
  city_township text not null,
  state_region text not null,
  country text not null default 'Myanmar',
  created_at timestamptz not null default now()
);

create table if not exists public.supplier_commercial_agreements (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  currency_code text not null,
  currency_name text not null,
  titles jsonb not null default '[]'::jsonb,
  version int not null default 1,
  status text not null default 'draft' check (status in ('draft', 'pending_approval', 'active', 'archived')),
  created_at timestamptz not null default now()
);

create table if not exists public.supplier_financial_formulas (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  agreement_id uuid not null references public.supplier_commercial_agreements(id) on delete cascade,
  steps jsonb not null default '[]'::jsonb,
  version int not null default 1,
  status text not null default 'draft' check (status in ('draft', 'pending_approval', 'active', 'archived')),
  created_at timestamptz not null default now()
);

create table if not exists public.supplier_onboarding_approvals (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  agreement_id uuid not null references public.supplier_commercial_agreements(id) on delete cascade,
  formula_id uuid not null references public.supplier_financial_formulas(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reason text,
  requested_by uuid references auth.users(id),
  approved_by uuid references auth.users(id),
  requested_at timestamptz not null default now(),
  decided_at timestamptz
);

-- Function to generate city-based supplier code: SUP-{CITY_ABBR}-00001
create or replace function public.generate_supplier_code(p_city text)
returns text
language plpgsql
as $$
declare
  v_city_code text;
  v_seq int;
  v_code text;
begin
  -- Normalize city code to uppercase alphanumeric, max 4 chars
  v_city_code := upper(regexp_replace(p_city, '[^a-zA-Z0-9]', '', 'g'));
  if length(v_city_code) > 4 then
    v_city_code := substring(v_city_code from 1 for 4);
  end if;
  if length(v_city_code) = 0 then
    v_city_code := 'GEN';
  end if;

  select coalesce(max(cast(substring(supplier_code from length('SUP-' || v_city_code || '-') + 1) as int)), 0) + 1
  into v_seq
  from public.suppliers
  where supplier_code like 'SUP-' || v_city_code || '-%';

  v_code := 'SUP-' || v_city_code || '-' || lpad(v_seq::text, 5, '0');
  return v_code;
end;
$$;
