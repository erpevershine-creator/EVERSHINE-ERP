# Next confirmation

Last confirmed: D117 authorizes the isolated Milestone 2 local Auth/data foundation. The schema, RLS, Auth configuration, private profile-photo storage and local Supabase integration are implemented and verified. No real Owner/user account exists yet. Production approval remains separate.

Next Owner confirmation: use a localhost-only, one-time Owner setup form. The Owner enters the company-approved Gmail username and ERP password privately in the app; the server creates exactly one Owner Auth user/profile, shows the emergency recovery code once, records the setup audit event and permanently closes the setup route. No password or recovery code is sent through AI chat or committed to files.

After that confirmation, implement the one-time setup and real login boundary, then verify the confirmed account/session/permission/recovery rules. Ask only genuinely unresolved essentials, one at a time: Owner lock/expiry recovery interaction, warehouse scope detail, timezone/currency, backup destination/frequency/encryption/recovery objectives. Do not ask again about previously settled password/retention/device/template policies.

Later business modules require individual confirmation. Transfer request approval, separate-actor dispatch/receipt, discrepancy resolution, partial receipt, cancellation and reversal details remain open.

Production dependency: Vercel Hobby is non-commercial personal use only. A company ERP requires a compatible hosting choice; no paid plan or alternate host has been authorized. Outbound email provider, volume, schedule and sender remain open. Local foundation testing does not consume hosted provider quotas.
