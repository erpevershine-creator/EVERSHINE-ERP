# Approval deadline evidence — 2026-09-10 candidate

Foundation remains OPEN. This is an isolated worktree candidate and migration
`20260910190000` has not been applied to the Owner database.

## Result

The service-only deadline job implements D105 and D106 for approval requests
that have a deadline. It sends the first repeat reminder after three hours,
then no more than once per relevant recipient in each following three-hour
interval. Requests that reach the deadline become `Expired` before reminders
are evaluated and receive a system-attributed audit event.

Recipients are calculated from current authority. The requester is included.
Owner and Admin approvers must be active and have the exact module action; a
permission-template approver must also be able to delegate both current and
proposed access. An active temporary handover successor is included only for an
explicitly selected request and must still satisfy the applicable delegated
scope. Admin self-approval remains excluded.

The delivery ledger links every reminder to its request, recipient,
notification and delivery time. A transaction advisory lock and the last
delivery check make retries and concurrent scheduler runs idempotent. Both the
device-login and permission-decision RPCs enforce the deadline synchronously,
so a late scheduler cannot permit approval after the deadline.

## Validation

- `node scripts/foundation-db-check.mjs --auth`: 324/324 SQL assertions across
  seventeen rollback suites and eight isolated Auth workflows passed.
- Twenty deadline assertions cover service ACLs, exact recipients, first and
  repeat timing, retry idempotency, automatic expiry, audit attribution,
  notification evidence and both synchronous decision guards.
- Typecheck, ESLint, 33/33 Node tests and the optimized Next.js build passed.
- A direct worker probe rejected a non-local Supabase endpoint before making a
  request.
- Frozen evidence: `docs/evidence/approval-deadlines-20260910.json`
  (SHA-256 `178D0077C7D0E374EE93D1BA989463C61FAAE0784ECA74FDDE233203891532D6`).

## Acceptance limits

The bundled worker runs only while the local development app is running and
refuses non-local Supabase URLs. Durable Production scheduling and monitoring
remain open. Rejected-request re-drafting, expired-request authorized copying,
Approval Center tabs/search/filter/sort, permanent handover, browser acceptance
and Owner acceptance are separate gates.
