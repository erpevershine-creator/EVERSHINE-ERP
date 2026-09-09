# Local encrypted backup and isolated restore verification

Implemented 2026-09-08 under D138; daily scheduler added 2026-09-09 under D139. This is the first local backup slice, not live Restore or an offsite disaster-recovery service.

## Use
Open http://localhost:3000/backups as Owner or an Admin with the Backup & Restore create action and backups page access. Enter a reason, then choose **Create & verify backup**. The page refreshes while queued/running; View shows the final result. Only **verified** means the archive passed the isolated restore comparison. A failed run remains in history and does not replace any prior archive.

The existing Windows Docker engine, local Supabase project evershine-erp-m2-local and localhost development server must be running. This action is blocked outside the configured local Windows/development/loopback environment. No cloud quota or paid service is used by these local operations; local disk/CPU are used.

## Captured and checked
- One PostgreSQL repeatable-read exported snapshot drives pg_dump and table fingerprints across public/private/auth/storage/supabase_migrations.
- Database custom archive, role definitions (no role passwords), Storage files, Storage inventory and runtime configuration are encrypted directly into .runtime/backups/<DD-MM-YYYY>/<UUID>. No host plaintext dump is written. Credentials in runtime configuration remain encrypted and are never returned to the browser.
- A signed manifest records artifact integrity and table fingerprints. AES-256-GCM authentication, plaintext SHA-256 and byte lengths are checked before restore. The storage inventory must remain unchanged during capture; missing objects or changed files fail the run.
- A disposable PostgreSQL container uses the exact source image SHA with no network, no exposed ports and no live mounts. It restores database schema/data/ACLs and files, compares table records and file checksums, and checks protected profile access/RLS. Its label and UUID are verified before cleanup. Only this disposable container is removed.
- The new cluster uses the source bootstrap role supabase_admin. PostgreSQL 17 role grants cannot be replayed accurately with a differently named bootstrap superuser. The matching existing bootstrap CREATE ROLE statement is omitted in the test target; all other role definitions and grants are replayed. No source roles change.
- Request authority is checked in both server/RPC and again at worker execution. Anonymous clients, unscoped Admins, revoked actions/sessions, missing reasons, duplicate pending jobs and direct status writes are denied. Request/completion/failure are audited.

## Key custody and scope limits
The system generates a 32-byte key and protects it with Windows CurrentUser DPAPI at %LOCALAPPDATA%/EVERSHINE-ERP/backup-key.dpapi. No separate manually entered Backup Recovery Key is needed. **These local archives rely on this Windows profile and key file. They do not yet protect against loss of the computer/profile/key.** Do not delete or replace that file. Cross-computer/offsite recovery needs a separately reviewed recoverable key-custody arrangement; approval is authorization, not decryption material.

The isolated check verifies logical data/schema restoration, not a full restarted Supabase Auth/Storage service, restored application login, restored role passwords, or a live ERP rollback. The runtime configuration is authenticated but not applied to another application. Code remains in the local Git repository and must be preserved separately. Database role passwords are intentionally excluded from the roles archive and need trusted local provisioning for a full service rebuild.

No automatic retention deletion, Google Drive/Telegram sending, manual archive download or live restore endpoint is enabled. Records show the latest 50 jobs. There is no automatic cleanup of failed archives. Interrupted running jobs are reconciled only by a scheduler tick holding the exclusive Windows worker lock. Queued manual jobs recheck their original active session and permissions before capture. Durable live restore controls remain next work. A tampered archive is never a valid replacement. Offsite copying must not begin before key custody and destination permissions are configured.

## Evidence
- Run e7dd5d22-4361-4046-94b1-206b00e84d7d: verified on 2026-09-08, 53 table fingerprints and 2 Storage files matched after isolated restore; 2,832,230 encrypted artifact bytes. Browser showed 2.70 MB and matching details. Clone cleanup verified; actual active Owner=1, Admin=1.
- 137/137 rollback-only pgTAP assertions; 5 application policy tests; 3 backup-crypto tests covering roundtrip/corruption/wrong key/manifest changes/path rejection. TypeScript, ESLint and optimized build passed.
- Supabase security advisors: no issues. Database lint: only existing unused create_position parameter warnings. No real account/password/grant changes, live database reset, Production deployment or external transfer.
- Earlier failed checks remain recorded; no failure was relabelled verified. Both Docker stale socket directories were renamed and preserved together to restart the engine; database volumes were retained.

Run checks with npm test, npm run typecheck, npm run lint, npm run build, npm run db:test and npm run db:lint. The crypto checks are included in npm test.

References: [PostgreSQL pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html), [Supabase backup boundaries](https://supabase.com/docs/guides/platform/backups), [PostgreSQL bootstrap-role restore discussion](https://www.postgresql.org/message-id/afpHwTR1IJypF1md%40nathan).

## Daily schedule and restart behavior
The local development launcher supervises scripts/backup-scheduler.mjs. It checks the fixed 18:00 Asia/Yangon deadline every 60 seconds after the preceding worker finishes. It starts with npm run dev and stops when that local server launcher closes; it does not install an OS startup service or run with the computer off. Docker availability is retried on a later tick without recreating/resetting the database.

The latest due slot is computed using the database clock and Asia/Yangon. Before 18:00 it is the preceding date; on/after 18:00 it is today. Slots before activation are ignored. A completed manual capture started after the slot deadline also satisfies that day's backup. Multi-day downtime produces one current snapshot labelled with the latest due date, not historical snapshots. Scheduled failures back off 30 minutes. Existing archives are never deleted by scheduling.

System jobs have origin=scheduled and no user/session requester. Only internal database operator functions create them. They do not bypass a user's login as Owner or mint a token. Manual jobs still require live authority at capture. Backup failures produce recipient-scoped ERP notifications to active Owner/scoped Backup Admins; no external email/Telegram is sent.

The operating-system FileShare.None lock is shared by manual workers and scheduler ticks. A missing heartbeat is not sufficient to declare a worker abandoned. After the lock is acquired, previously running rows are marked failed with audit/notification; matching disposable clone names/labels are checked before cleanup. The lock is held through capture, verification and cleanup and releases on process/pipe closure. Loss of the lock guard stops its worker. Failed archives stay for investigation. Source volumes and terminal backup status are preserved.

Latest evidence: actual manual run c2283c9d-95b1-46a6-a9b3-4a47f08cace3 verified 54 table fingerprints and 2 stored files with scheduler/lock integration active. 156 pgTAP assertions and 9 Node tests passed; typecheck, lint, build and security advisors passed (existing unused create_position parameter DB-lint warnings remain). Timing/catch-up/retry/system-authority cases use rollback fixtures, and lock contention/loss uses disposable Windows test files. The live next daily deadline remains future behavior; heartbeat and duplicate suppression were observed, not a fabricated scheduled capture. [Windows FileShare semantics](https://learn.microsoft.com/en-us/dotnet/api/system.io.fileshare?view=net-10.0).

## Date folders — 2026-09-09
Owner requested date-only folder names. Archives are grouped by backup start date in Asia/Yangon as DD-MM-YYYY, with a UUID subfolder per backup to avoid overwrites. Existing five archives were moved while holding the worker lock; file SHA-256 checksums matched before/after. Database IDs, signed manifests and encryption were unchanged. New manual and scheduled captures use the same layout.
