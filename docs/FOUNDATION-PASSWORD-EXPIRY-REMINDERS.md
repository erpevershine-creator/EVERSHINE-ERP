# Password-expiry reminder evidence — 2026-09-10 candidate

Foundation remains OPEN. This is an isolated worktree candidate and migration
`20260910180000` has not been applied to the Owner database.

## Result

The local foundation scheduler invokes one service-only reminder command. It
starts daily reminders when an active or locked account is within fourteen days
of password expiry and continues reminders after expiry until a governed
password change or recovery changes the expiry version. A running or failed
password/recovery operation remains fenced and does not receive a misleading
ordinary expiry reminder.

Each recipient must be active, unfenced and able to sign in. Owner receives all
eligible reminders. An Admin receives a non-Owner/non-Admin account reminder
only when the Admin has `Account Management/change_password` and can delegate
every page/action in that target account's current permission snapshot. This
matches the authority and scope checks enforced again by the password-change
RPC. Owner and Admin account passwords remain Owner-controlled.

`private.password_expiry_reminder_deliveries` binds each notification to target,
recipient, exact password-expiry value and Yangon calendar date. A transaction
advisory lock plus that primary key makes concurrent runs and same-day retries
idempotent. Resetting a password creates a new expiry value and therefore a new
future reminder cycle without deleting prior evidence.

## Validation

- `node scripts/foundation-db-check.mjs --auth`: 304/304 SQL assertions across
  sixteen rollback suites and eight isolated Auth workflows passed.
- The fourteen reminder assertions cover service ACLs, exact Owner/Admin
  recipients, delegated-scope exclusion, Owner-only privileged targets,
  fourteen-day entry, overdue continuation, password-operation exclusion,
  retry idempotency and notification-ledger integrity.
- Typecheck, ESLint, 33/33 Node tests and the optimized Next.js build passed.
- A direct worker probe rejected a non-local Supabase endpoint before making a
  request.
- Frozen evidence: `docs/evidence/password-expiry-reminders-20260910.json`
  (SHA-256 `D79C0C0C6FEA980C0EBD1BC82B73B1BBAD2F5B6D94D0E96EEE65CE69F4474499`).

The isolated runner copies schema and reference catalogues only. It does not
copy account data, credentials, Storage objects or backups; its database has no
external network and is removed after validation.

## Acceptance limits

The bundled worker is deliberately local-only: it refuses any Supabase URL
other than `http://127.0.0.1:55321` and runs only while the local development app
supervises it. A durable Production scheduler and operational monitoring remain
an F3/release concern. This evidence does not close profile editing, permanent
handover, global list/export behavior, disaster recovery, browser acceptance or
Owner acceptance.
