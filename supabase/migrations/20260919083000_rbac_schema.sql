create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  created_at timestamptz default now()
);

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  created_at timestamptz default now()
);

create table if not exists public.user_roles (
  user_id uuid references auth.users(id) on delete cascade,
  role_id uuid references public.roles(id) on delete cascade,
  primary key(user_id, role_id)
);

create table if not exists public.role_permissions (
  role_id uuid references public.roles(id) on delete cascade,
  permission_id uuid references public.permissions(id) on delete cascade,
  primary key(role_id, permission_id)
);

alter table public.user_roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
