# Foundation failure-path review

2026-09-10. Foundation Goal remains active. This review supersedes earlier
claims that passing SQL fixtures prove password/device workflows complete.

## Password access fence candidate

Migration `20260910080000_password_access_fence.sql` adds a durable profile fence.
Preparation sets it before the provider call; admission, access checks and device
approval reject fenced accounts. A failed operation retains the fence. Completion
revokes concurrent sessions and records the original authorized actor, even when
the caller is the service role. Existing migrations remain unchanged.

The additional regression assertions exercise a fresh provider session while an
operation runs, RLS rejection even with a matching device row, failure persistence,
successful clearance and completion audit attribution. Provider outcomes are still
simulated by these database fixtures. They do not prove Auth integration.

This migration is a worktree candidate, not applied to the Owner database.

Validation: typecheck, lint, 28 Node tests and optimized build passed. The final
isolated schema-only run passed 240 assertions across 12 suites, including 20
password assertions (eight additional regressions). The runner records SHA-256
hashes of the exact SQL bytes it executes; its local result is
`.runtime/evidence/foundation-db-check.json`. No live Auth/browser acceptance is
implied by this result.

Docker startup was repaired by preserving two sets of stale zero-byte socket
directories, after checking their absolute parents and contents. Preserved paths:
`C:/Users/DELL/AppData/Local/Docker/run-foundation-stale-20260910` (and `-b`) and
`C:/Users/DELL/AppData/Local/docker-secrets-engine-foundation-stale-20260910`
(and `-b`). Both current socket directories needed replacement during the same
stopped-engine interval. Engine 29.7.2 then started and the isolated check ran.
No factory reset, database volume removal or real account update was performed.

## Required next checks, in order

Password/recovery update: [current provider evidence](FOUNDATION-PASSWORD-RECOVERY-EVIDENCE.md)
now proves receipt-backed completion, safe retry, direct password API rejection
and eight real Auth workflows in isolation. The original issue description below
is retained as review history; its browser/runtime acceptance remains pending.

1. Password/recovery provider proof and reconciliation: completion currently trusts
   the server outcome. Interrupted calls need verified provider evidence and safe
   retry handling, including late responses. Owner self-change failure must have
   an independently authenticated recovery path. Direct provider password changes
   must also obey the confirmed administration policy. Do not use a real password
   change to test these incomplete workflows.
2. Pending device login: the current login action signs out a pending Auth session,
   deleting the session its approval needs. Preserve a restricted pending session
   and implement an approval-status/resume flow, with negative RLS tests first.
3. Device identity and idle: the current fingerprint hashes the session UUID, not
   a stable device identity. Idle approval currently fences the whole account;
   existing admitted sessions lack an idle cutoff/heartbeat contract. Approval
   can unnecessarily remove a healthy session when capacity is already available.
4. Approval failure/concurrency: expiry followed by an exception rolls back expiry.
   Validate delegated target scope, password expiry/cutoff at approval, durable
   expiry, oldest-device selection and concurrent decisions through actual flows.
5. Runtime integration: the original checkout and worktree are separate source
   candidates but previous migrations were applied to the shared local database.
   Verify the source running on port 3000 and RPC compatibility before presenting
   the Owner with browser acceptance. Passing a worktree build is not that proof.

Then continue F2 scope/handover, F3 operational lists/exports, F4 backup and
disaster recovery, F5 integrated validation and F6 Owner acceptance in the execution
plan. Supplier questions and business implementation remain paused.
