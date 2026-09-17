# Foundation continuation — 2026-09-13

Status: IN PROGRESS, not accepted. Current paths are D:/EVERSHINE-ERP and
D:/EVERSHINE-ERP-WORKTREES/foundation-gates-20260910. Git worktree linkage was repaired.

## Newly confirmed by Owner
- Continue profile editing, identity/device/password browser acceptance, remote retry/retention,
  independent-profile recovery, live restore and the final Owner review package.
- Profile editing includes Photo, Employee Name, Company Position, Department, Contact,
  Gmail Username and ERP Role.
- Changing ERP Role requires reapproval of individual permissions as well as the new base permissions.
  Do not silently carry individual grants into the new role.

## Evidence and boundaries
- Live DB has Supplier migration 20260911120000, absent from this foundation candidate.
  Original source schema/catalogue cloning failed three exact foundation assertions (10 pages vs 9).
- Runner now recreates application schemas ONLY in its labelled disposable clone and applies
  this candidate's full migration chain. No live data/schema is reset or rewritten.
- First 18 suites pass 348 assertions. Suite 019 has an invalid non-Gmail fixture and an incorrect
  TAP plan; its permanent-handover implementation can inactivate Owner and lacks required controls.
  Preserve that failure; no merge or live migration is authorized by a passing subset.
- Runner continues independent suites/Auth after a failed suite and retains overall failure status.
- Offsite publisher now persists immutable DPAPI-protected share envelopes before upload;
  retries reuse existing complete receipts and require all five encrypted artifacts.
- Idle backup ticks retry one pending verified local archive with a durable 30-minute backoff,
  under the existing exclusive worker lock. No additional scheduler was started.
- These changes are candidate code, not live offsite delivery acceptance. Legacy interrupted
  uploads without a persisted share plan may still fail closed and require reconciliation.
- Remote retention, live restore/maintenance/retry, profile-edit approval/provider integration,
  independent-profile Google reauthorization and browser acceptance remain unfinished.
- Main Supplier implementation and Owner data were not changed.
## Fresh validation after this increment
- npm test: 35/35 passed, including real disposable Windows DPAPI share-plan persistence,
  concurrent publishers, backoff restart, and provider error redaction.
- npm run typecheck: PASS. npm run lint: PASS. npm run build: PASS.
- Isolated database: first 18 suites / 348 assertions PASS; permanent handover suite 019 FAIL.
- Isolated real Auth provider: eight workflows PASS. Overall database gate remains FAIL.
- git diff --check: PASS. Existing table/live-pages/next-env modifications were preserved.
- No hosted/browser acceptance, real remote retry, remote retention or live restore was performed.
- Independent-profile recovery target was requested from Owner and remains pending.

## Profile change increment — 2026-09-13
- Added candidate migration `20260913040325_governed_profile_changes.sql`.
- Added Approval Center profile-change request with complete before/after snapshot,
  Photo, Employee Name, Company Position, Department, Contact, company Gmail and ERP Role.
- Role changes include base template and individual permissions in the approval snapshot;
  they are applied only after explicit approval. Owner-only/self-approval and stale-version
  checks are enforced. Profile fields wait until provider identity commit when Gmail changes.
- Added server actions and UI review/retry controls. Direct Auth email edits are rejected
  unless they carry a current approved operation; Auth email and ERP profile are committed
  together through a deferred constraint trigger; sessions are revoked on identity/role change.
- Added `020_profile_changes.test.sql`: 24/24 isolated assertions pass, including Auth provider
  email proof, replay rejection, stale request rejection, Owner escalation denial and role/permission snapshot.
- Isolated Auth check now reports 11 workflows passed. Typecheck remains passing.
- Browser runner was added with a disposable Supabase stack and no copied accounts. Setup page
  rendered successfully, but the first login-stage browser run failed because the synthetic fixture
  setup path did not expose a login form after setup. This is a test harness defect to fix; no
  Owner or real employee was affected.
- Added migration `20260913084041_permanent_handover_security.sql` as a candidate hardening layer;
  permanent handover SQL suite remains a known failing gate and requires a separate approval/target
  design review before any live use.
- No Owner database migration, no production deployment, no live restore, no remote retention
  deletion, no new Google consent and no external message was performed.

## Latest continuation run
- Isolated browser stack starts at `http://127.0.0.1:3100`; anonymous `/login` rendering was fixed to avoid calling the strict authorization RPC before a session exists.
- Browser setup and sign-in rendered, but the synthetic Owner did not receive the expected Account Management button during the employee-creation step. The browser harness remains FAIL and requires route/session-state repair.
- Candidate manifest written to `.runtime/evidence/foundation-candidate-manifest-20260913.json`.
- No `supabase db push --linked`, `supabase db push`, production migration, Owner password change, Owner recovery-code change or data reset was run.
