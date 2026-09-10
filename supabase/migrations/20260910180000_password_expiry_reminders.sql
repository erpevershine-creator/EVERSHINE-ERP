-- Daily D49/D50 password-expiry reminders. The scheduler invokes one
-- service-only command; this ledger makes the command safe to retry.
create table private.password_expiry_reminder_deliveries (
  profile_id uuid not null references public.profiles(id) on delete restrict,
  recipient_id uuid not null references public.profiles(id) on delete restrict,
  password_expires_at timestamptz not null,
  sent_on date not null,
  notification_id bigint not null unique references public.notifications(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  primary key(profile_id,recipient_id,password_expires_at,sent_on)
);
create index password_expiry_reminder_target_idx
  on private.password_expiry_reminder_deliveries(profile_id,sent_on desc);
revoke all on table private.password_expiry_reminder_deliveries from public,anon,authenticated,service_role;

-- The reminder recipient must be able to perform the same delegated-scope
-- check as prepare_password_change, evaluated for that recipient rather than
-- the service worker's identity.
create function private.can_delegate_between(p_actor uuid,p_target uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.profiles actor cross join public.profiles target
    where actor.id=p_actor and target.id=p_target and (
      actor.erp_role='owner'
      or (
        not exists (
          select 1
          from jsonb_each_text(private.permission_snapshot(target.id,target.page_access,target.action_access)->'pages') target_page
          where target_page.value='true'
            and not (
              coalesce((actor.individual_pages->>target_page.key)::boolean,false)
              or coalesce(
                (select override.can_view from public.user_page_overrides override
                  where override.profile_id=actor.id and override.page_id=target_page.key),
                (actor.page_access->>target_page.key)::boolean,
                false
              )
            )
        )
        and not exists (
          select 1
          from jsonb_each(private.permission_snapshot(target.id,target.page_access,target.action_access)->'actions') target_module
          cross join lateral jsonb_array_elements_text(target_module.value) target_action
          where not (
            coalesce(actor.action_access->target_module.key,'[]') ? target_action.value
            or coalesce(actor.action_access->target_module.key,'[]') ? '*'
            or coalesce(actor.action_access->'*','[]') ? '*'
            or coalesce(actor.individual_actions->target_module.key,'[]') ? target_action.value
          )
        )
      )
    )
  );
$$;
revoke all on function private.can_delegate_between(uuid,uuid) from public,anon,authenticated,service_role;

create function public.run_password_expiry_reminders() returns integer
language plpgsql security definer set search_path='' as $$
declare
  reminder record;
  created_notification bigint;
  delivered integer:=0;
  yangon_day date:=(clock_timestamp() at time zone 'Asia/Yangon')::date;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Server only' using errcode='42501';
  end if;

  -- Serialize daily batches. A worker retry or a second scheduler cannot create
  -- duplicate notifications for the same password-expiry version.
  perform pg_catalog.pg_advisory_xact_lock(20260910,18);
  for reminder in
    select target.id profile_id,target.employee_name,target.password_expires_at,
      recipient.id recipient_id,
      (target.password_expires_at<=clock_timestamp()) is_overdue
    from public.profiles target
    join public.profiles recipient on recipient.status='active'
      and not recipient.recovery_pending
      and not recipient.password_change_pending
      and recipient.password_expires_at>clock_timestamp()
      and (
        recipient.erp_role='owner'
        or (
          recipient.erp_role='admin'
          and target.erp_role not in ('owner','admin')
          and (
            private.merge_permission_actions(recipient.action_access,recipient.individual_actions)
              ->'Account Management' ?| array['change_password','*']
            or coalesce(recipient.action_access->'*','[]') ? '*'
          )
          and private.can_delegate_between(recipient.id,target.id)
        )
      )
    where target.status in ('active','locked')
      and not target.recovery_pending
      and not target.password_change_pending
      and target.password_expires_at<=clock_timestamp()+interval '14 days'
      and not exists (
        select 1 from private.password_expiry_reminder_deliveries sent
        where sent.profile_id=target.id
          and sent.recipient_id=recipient.id
          and sent.password_expires_at=target.password_expires_at
          and sent.sent_on=yangon_day
      )
    order by target.password_expires_at,target.id,recipient.id
  loop
    insert into public.notifications(recipient_id,notification_type,title,message)
    values(
      reminder.recipient_id,
      'security',
      case when reminder.is_overdue then 'Password expired' else 'Password expires soon' end,
      reminder.employee_name||case when reminder.is_overdue
        then '''s ERP password has expired. A governed password change is required.'
        else '''s ERP password expires on '||to_char(reminder.password_expires_at at time zone 'Asia/Yangon','YYYY-MM-DD')||'.'
      end
    ) returning id into created_notification;
    insert into private.password_expiry_reminder_deliveries(
      profile_id,recipient_id,password_expires_at,sent_on,notification_id
    ) values(
      reminder.profile_id,reminder.recipient_id,reminder.password_expires_at,yangon_day,created_notification
    );
    delivered:=delivered+1;
  end loop;
  return delivered;
end; $$;
revoke all on function public.run_password_expiry_reminders() from public,anon,authenticated,service_role;
grant execute on function public.run_password_expiry_reminders() to service_role;
notify pgrst,'reload schema';
