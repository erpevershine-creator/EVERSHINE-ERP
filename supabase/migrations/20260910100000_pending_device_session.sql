-- Pending Auth sessions stay alive for approval, but receive no ERP data access
-- until decide_device_login admits their exact provider session.
create function public.my_login_approval_status() returns text
language plpgsql security definer set search_path='' as $$
declare sid uuid; p uuid; r public.approval_requests;
begin
 if auth.uid() is null then return 'signed_out'; end if;
 sid := nullif(auth.jwt()->>'session_id','')::uuid;
 select user_id into p from auth.sessions where id=sid and user_id=auth.uid();
 if p is null then return 'signed_out'; end if;
 select * into r from public.approval_requests where request_type='device_login' and requester_id=p
   and proposed_data->>'sessionId'=sid::text order by id desc limit 1;
 if not found then return 'pending'; end if;
 if r.status='approved' then return 'admitted'; end if;
 if exists(select 1 from public.device_sessions where id=sid and status='active') then return 'admitted'; end if;
 if r.status in ('rejected','expired') or r.deadline_at<=clock_timestamp() then return 'rejected'; end if;
 return 'pending';
end; $$;
revoke all on function public.my_login_approval_status() from public,anon,service_role;
grant execute on function public.my_login_approval_status() to authenticated;
