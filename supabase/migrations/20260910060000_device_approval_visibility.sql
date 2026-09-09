-- Device approvals use the dedicated approve_device action in RLS; they must
-- not depend on the broader permission-template approve action.
drop policy approval_requests_read on public.approval_requests;
create policy approval_requests_read on public.approval_requests for select to authenticated
using (
  requester_id = (select auth.uid())
  or (select private.is_owner())
  or (request_type='device_login' and (select private.has_action(module,'approve_device')))
  or (request_type<>'device_login' and (select private.has_action(module,'approve')))
);
notify pgrst,'reload schema';
