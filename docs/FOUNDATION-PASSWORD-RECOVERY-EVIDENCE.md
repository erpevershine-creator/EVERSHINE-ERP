# Password and recovery evidence — 2026-09-10 candidate

Foundation remains OPEN. These changes are isolated worktree candidates, not
applied to the Owner database. No real password or recovery code was changed.

## Result

Password success now requires a database receipt from the Auth password-update
transaction. A deferred trigger validates the final operation marker, target,
running operation and access fence, then records a single-use receipt. A direct
Auth user password change, replay or superseded operation rolls back. A provider
HTTP success alone cannot clear ERP access.

The implementation is based on the deployed Auth image `v2.196.0` and its
[adminUserUpdate transaction](https://github.com/supabase/auth/blob/v2.196.0/internal/api/admin.go):
password and application metadata writes occur inside the same transaction.
The actual image, rather than only source inspection, was exercised in isolation.

After an uncertain response the server checks the receipt and finishes only on
proof. If the process died or no proof is available, an authorized password retry
or verified Owner recovery supersedes the earlier operation. History and any
earlier receipt remain. A late earlier provider call cannot overwrite the retry.
Owner recovery clears both recovery and password-administration fences only
after its own provider receipt. There is no timer-based automatic unlock.

## Validation

- Typecheck, application lint, 33 Node tests and optimized build passed.
- Isolated database: 257 assertions across 13 suites passed.
- Actual Auth container: eight workflows passed, including concurrent duplicate
  updates (exactly one commit), receipt generation, replay rejection, new-password
  login, direct self-change rollback, superseded recovery rejection, Owner
  recovery through both fences, and the confirmed password-reuse policy.
- The Node cases separately inject lost provider responses, missing proof,
  definitive rejection, unavailable evidence and interrupted finalization.
- SQL fixtures also cover metadata-only false proof, deferred provider write
  order, forged completion, conflicting outcome and preserved audit attribution.

Reproduce with `node scripts/foundation-db-check.mjs --auth`. The runner clones
schema/reference catalogues and Auth migration version history, not account data.
Its fresh PostgreSQL container has network `none`; Auth shares only that isolated
network namespace. Neither exposes host ports. All credentials and accounts used
for this test are synthetic. Both containers are removed after the run.

The frozen [validation result](evidence/password-recovery-20260910.json), also
written locally as `.runtime/evidence/foundation-db-check.json`, records exact SQL/harness
hashes, database/Auth image IDs, test counts and workflow names. Source hashes
identify the bytes tested even before the candidate is committed.

## Acceptance limits

These are database, orchestration and real Auth API checks. The Next.js forms
have compiled but have not yet received real browser acceptance. Original
checkout/RPC compatibility remains a separate integration gate. Migrations
`20260910080000` and `20260910090000` remain unapplied to Owner data.

Password administration is only the password portion of D24. Identifier editing,
full delegated scope review, expiry reminders, device identity/pending approval,
handover and the remaining F2–F6 gates still require their own evidence. This
document is not Foundation acceptance or a claim of complete ERP security.
