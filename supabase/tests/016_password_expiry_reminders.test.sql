begin;
select plan(14);

update public.profiles set status='inactive',disabled_at=null where erp_role='owner';
create temporary table reminder_fixture(
  owner_id uuid default gen_random_uuid(),
  allowed_admin_id uuid default gen_random_uuid(),
  denied_admin_id uuid default gen_random_uuid(),
  due_staff_id uuid default gen_random_uuid(),
  overdue_staff_id uuid default gen_random_uuid(),
  future_staff_id uuid default gen_random_uuid(),
  pending_staff_id uuid default gen_random_uuid()
);
insert into reminder_fixture default values;

insert into auth.users(id,email,role,aud,email_confirmed_at)
select owner_id,'reminder.owner.test@gmail.com','authenticated','authenticated',now() from reminder_fixture union all
select allowed_admin_id,'reminder.allowed.admin.test@gmail.com','authenticated','authenticated',now() from reminder_fixture union all
select denied_admin_id,'reminder.denied.admin.test@gmail.com','authenticated','authenticated',now() from reminder_fixture union all
select due_staff_id,'reminder.due.staff.test@gmail.com','authenticated','authenticated',now() from reminder_fixture union all
select overdue_staff_id,'reminder.overdue.staff.test@gmail.com','authenticated','authenticated',now() from reminder_fixture union all
select future_staff_id,'reminder.future.staff.test@gmail.com','authenticated','authenticated',now() from reminder_fixture union all
select pending_staff_id,'reminder.pending.staff.test@gmail.com','authenticated','authenticated',now() from reminder_fixture;

insert into public.profiles(id,employee_name,company_position,position_id,department,erp_role,username,contact,avatar_path,password_expires_at)
select owner_id,'Reminder Owner','Owner',(select id from public.positions where erp_role_code='owner'),'Test','owner','reminder.owner.test@gmail.com','test',owner_id||'/photo.png',clock_timestamp()+interval '10 days' from reminder_fixture union all
select allowed_admin_id,'Allowed Admin','Admin',(select id from public.positions where erp_role_code='admin'),'Test','admin','reminder.allowed.admin.test@gmail.com','test',allowed_admin_id||'/photo.png',clock_timestamp()+interval '90 days' from reminder_fixture union all
select denied_admin_id,'Denied Admin','Admin',(select id from public.positions where erp_role_code='admin'),'Test','admin','reminder.denied.admin.test@gmail.com','test',denied_admin_id||'/photo.png',clock_timestamp()+interval '90 days' from reminder_fixture union all
select due_staff_id,'Due Staff','Sales',(select id from public.positions where erp_role_code='sales'),'Test','sales','reminder.due.staff.test@gmail.com','test',due_staff_id||'/photo.png',clock_timestamp()+interval '10 days' from reminder_fixture union all
select overdue_staff_id,'Overdue Staff','Sales',(select id from public.positions where erp_role_code='sales'),'Test','sales','reminder.overdue.staff.test@gmail.com','test',overdue_staff_id||'/photo.png',clock_timestamp()-interval '1 day' from reminder_fixture union all
select future_staff_id,'Future Staff','Sales',(select id from public.positions where erp_role_code='sales'),'Test','sales','reminder.future.staff.test@gmail.com','test',future_staff_id||'/photo.png',clock_timestamp()+interval '30 days' from reminder_fixture union all
select pending_staff_id,'Pending Staff','Sales',(select id from public.positions where erp_role_code='sales'),'Test','sales','reminder.pending.staff.test@gmail.com','test',pending_staff_id||'/photo.png',clock_timestamp()+interval '10 days' from reminder_fixture;

update public.profiles set action_access='{}',individual_actions='{"Account Management":["change_password"]}'
where id=(select allowed_admin_id from reminder_fixture);
update public.profiles set action_access='{}',individual_actions='{}'
where id=(select denied_admin_id from reminder_fixture);
update public.profiles set status='locked'
where id=(select overdue_staff_id from reminder_fixture);
update public.profiles set individual_actions='{"Finance":["approve"]}'
where id=(select overdue_staff_id from reminder_fixture);
update public.profiles set password_change_pending=true
where id=(select pending_staff_id from reminder_fixture);

select ok(not has_function_privilege('anon','public.run_password_expiry_reminders()','execute'),'anonymous cannot run the reminder worker');
select ok(not has_function_privilege('authenticated','public.run_password_expiry_reminders()','execute'),'authenticated clients cannot run the reminder worker');
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select is(public.run_password_expiry_reminders(),4,'service worker sends the exact eligible reminder set');
select is((select count(*)::integer from public.notifications where notification_type='security' and title in ('Password expired','Password expires soon')),4,'four password notifications are recorded');
select is((select count(*)::integer from private.password_expiry_reminder_deliveries),4,'delivery ledger matches notifications');
select is((select count(*)::integer from public.notifications where recipient_id=(select owner_id from reminder_fixture)),3,'Owner receives Owner, due staff and overdue staff reminders');
select is((select count(*)::integer from public.notifications where recipient_id=(select allowed_admin_id from reminder_fixture)),1,'authorized Admin receives only employee reminders within delegated scope');
select is((select count(*)::integer from public.notifications where recipient_id=(select denied_admin_id from reminder_fixture)),0,'Admin without password authority receives no reminders');
select is((select count(*)::integer from private.password_expiry_reminder_deliveries where profile_id=(select future_staff_id from reminder_fixture)),0,'passwords outside the fourteen-day window are excluded');
select is((select count(*)::integer from private.password_expiry_reminder_deliveries where profile_id=(select pending_staff_id from reminder_fixture)),0,'an account with a governed password operation is excluded');
select is(public.run_password_expiry_reminders(),0,'same-day worker retry is idempotent');
update public.profiles set password_expires_at=clock_timestamp()+interval '13 days'
where id=(select future_staff_id from reminder_fixture);
select is(public.run_password_expiry_reminders(),2,'a newly due password starts its own reminder cycle');
select is((select count(*)::integer from private.password_expiry_reminder_deliveries d join public.notifications n on n.id=d.notification_id),6,'every delivery retains its notification evidence');

select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select throws_ok($$select public.run_password_expiry_reminders()$$,'42501','Server only','client JWT cannot bypass the service-only check');
select * from finish();
rollback;
