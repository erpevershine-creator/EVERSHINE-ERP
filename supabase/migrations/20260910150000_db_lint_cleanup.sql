-- The ERP role catalogue is fixed. Reference the legacy RPC arguments so the
-- database linter does not hide real unused-parameter warnings.
create or replace function public.create_position(p_name text,p_code text) returns bigint
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_admin('Positions & Permissions','create');
 if p_name is null or p_code is null then
   raise exception 'ERP role catalogue is fixed; configure an existing role';
 end if;
 raise exception 'ERP role catalogue is fixed; configure an existing role';
end; $$;
