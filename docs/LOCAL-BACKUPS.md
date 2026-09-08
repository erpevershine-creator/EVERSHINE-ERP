# Local encrypted backup and isolated restore verification

Implemented 2026-09-08 under D138. This is the first local backup slice, not live Restore or an offsite disaster-recovery service.

## Use
Open http://localhost:3000/backups as Owner or an Admin with the Backup & Restore create action and backups page access. Enter a reason, then choose **Create & verify backup**. The page refreshes while queued/running; View shows the final result. Only **verified** means the archive passed the isolated restore comparison. A failed run remains in history and does not replace any prior archive.

The existing Windows Docker engine, local Supabase project evershine-erp-m2-local and localhost development server must be running. This action is blocked outside the configured local Windows/development/loopback environment. No cloud quota or paid service is used by these local operations; local disk/CPU are used.

## Captured and checked
- One PostgreSQL repeatable-read exported snapshot drives pg_dump and table fingerprints across public/private/auth/storage/supabase_migrations.
- Database custom archive, role definitions (no role passwords), Storage files, Storage inventory and runtime configuration are encrypted directly into .runtime/backups/<UUID>. No host plaintext dump is written. Credentials in runtime configuration remain encrypted and are never returned to the browser.
- A signed manifest records artifact integrity and table fingerprints. AES-256-GCM authentication, plaintext SHA-256 and byte lengths are checked before restore. The storage inventory must remain unchanged during capture; missing objects or changed files fail the run.
- A disposable PostgreSQL container uses the exact source image SHA with no network, no exposed ports and no live mounts. It restores database schema/data/ACLs and files, compares table records and file checksums, and checks protected profile access/RLS. Its label and UUID are verified before cleanup. Only this disposable container is removed.
- The new cluster uses the source bootstrap role supabase_admin. PostgreSQL 17 role grants cannot be replayed accurately with a differently named bootstrap superuser. The matching existing bootstrap CREATE ROLE statement is omitted in the test target; all other role definitions and grants are replayed. No source roles change.
- Request authority is checked in both server/RPC and again at worker execution. Anonymous clients, unscoped Admins, revoked actions/sessions, missing reasons, duplicate pending jobs and direct status writes are denied. Request/completion/failure are audited.

## Key custody and scope limits
The system generates a 32-byte key and protects it with Windows CurrentUser DPAPI at %LOCALAPPDATA%/EVERSHINE-ERP/backup-key.dpapi. No separate manually entered Backup Recovery Key is needed. **These local archives rely on this Windows profile and key file. They do not yet protect against loss of the computer/profile/key.** Do not delete or replace that file. Cross-computer/offsite recovery needs a separately reviewed recoverable key-custody arrangement; approval is authorization, not decryption material.

The isolated check verifies logical data/schema restoration, not a full restarted Supabase Auth/Storage service, restored application login, restored role passwords, or a live ERP rollback. The runtime configuration is authenticated but not applied to another application. Code remains in the local Git repository and must be preserved separately. Database role passwords are intentionally excluded from the roles archive and need trusted local provisioning for a full service rebuild.

No automatic retention deletion, scheduler, catch-up, Google Drive/Telegram sending, backup-failure notification delivery, manual archive download or live restore endpoint is enabled. Records show the latest 50 jobs. There is no automatic cleanup of failed archives. An OS/engine interruption can leave a queued/running job that must be reconciled by a trusted operator after checking that its worker is no longer running; do not blindly requeue or clear the fence. Scheduler/reconciliation and durable restore controls are next work. A tampered archive is never a valid replacement. Offsite copying must not begin before key custody and destination permissions are configured.

## Evidence
- Run e7dd5d22-4361-4046-94b1-206b00e84d7d: verified on 2026-09-08, 53 table fingerprints and 2 Storage files matched after isolated restore; 2,832,230 encrypted artifact bytes. Browser showed 2.70 MB and matching details. Clone cleanup verified; actual active Owner=1, Admin=1.
- 137/137 rollback-only pgTAP assertions; 5 application policy tests; 3 backup-crypto tests covering roundtrip/corruption/wrong key/manifest changes/path rejection. TypeScript, ESLint and optimized build passed.
- Supabase security advisors: no issues. Database lint: only existing unused create_position parameter warnings. No real account/password/grant changes, live database reset, Production deployment or external transfer.
- Earlier failed checks remain recorded; no failure was relabelled verified. Both Docker stale socket directories were renamed and preserved together to restart the engine; database volumes were retained.

Run checks with npm test, npm run typecheck, npm run lint, npm run build, npm run db:test and npm run db:lint. The crypto checks are included in npm test.

References: [PostgreSQL pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html), [Supabase backup boundaries](https://supabase.com/docs/guides/platform/backups), [PostgreSQL bootstrap-role restore discussion](https://www.postgresql.org/message-id/afpHwTR1IJypF1md%40nathan).
