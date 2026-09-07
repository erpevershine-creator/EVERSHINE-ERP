# Milestone 2 — local Auth and data foundation

Status: implemented and verified locally on 2026-09-07. This milestone establishes security and data boundaries. It does not create a real Owner account, replace the sample UI state, implement backup/email, or authorize Production.

## Local architecture

- Next.js 16 uses `@supabase/ssr` to refresh Auth cookies in the proxy and separate browser/server clients.
- Only `NEXT_PUBLIC_SUPABASE_URL` and the publishable key are available to browser code. `SUPABASE_SECRET_KEY` is read only by server administration code.
- Supabase runs locally in Docker under project id `evershine-erp-m2-local`, with API port 55321 and Postgres port 55322. The start command creates and uses the dedicated `evershine-local-loopback` network recommended by Supabase for untrusted networks. Docker Desktop's built-in `Localhost only` port policy is also enabled on this workstation, so changing WiFi or hotspot does not change the app address or expose these services to the LAN. The reset helper reconnects a recreated database container to the project network while the CLI reset is running. This project does not reuse the UAT project id, database or keys.
- `.env.local` is generated from the running local stack, ignored by Git and never printed by the sync script.

## Database and authorization

The single migration creates the confirmed foundation records and constraints for locations, positions, page/action permissions, Auth-linked profiles, approval snapshots, individual overrides, immutable audit history, scoped notifications, device sessions and private Owner recovery hashes. It seeds Head Office, Operations Warehouse and Reserve Warehouse plus the foundation pages and initial position templates.

Every exposed foundation table has RLS enabled. Default `anon` and `authenticated` table privileges are revoked and only the required reads and notification read-state update are granted. Authorization helpers use fixed search paths and execute only for authenticated users. Audit rows have a database-level append-only trigger. Recovery hashes are unavailable to browser roles; the server role has only select, insert and update access so it can generate, verify and invalidate a hash without directly deleting it. All business mutations will go through validated server actions using the server-only secret so UI visibility never becomes mutation authority.

Profile photos use the private `profile-photos` bucket with a two MiB limit and JPEG, PNG and WebP MIME types. Direct client storage policies are intentionally absent; account-management server actions will validate and write photos.

Local Auth disables self-signup and anonymous sign-in. Its built-in baseline requires at least eight characters with a letter and number; the server account workflow will additionally require the confirmed uppercase letter. This avoids adding an unconfirmed lowercase requirement. The schema permits only one Owner profile. A real Owner user is deferred until the Owner confirms the one-time provisioning flow.

## Commands

```text
npm run supabase:start
npm run supabase:env
npm run supabase:reset
npm run db:test
npm run db:lint
npm test
npm run typecheck
npm run lint
npm run build
```

`supabase:reset` proves the schema can be rebuilt from migration and seed files. `supabase:env` writes local values without printing secrets. Production stays blocked by the existing local-review proxy until separate Owner approval and production configuration.

## Verification evidence

- Clean migration reset: pass.
- pgTAP schema, RLS, constraint, recovery-access and private-bucket tests: 34/34 pass.
- Supabase database lint at warning level: no schema errors.
- App policy tests: 5/5 pass.
- TypeScript and ESLint: pass.
- Optimized Next.js build: pass.
- All-foundation-routes browser smoke test: pass; no browser errors or external runtime requests.
- DB, Auth, Storage and Kong container health: healthy; Auth, Storage and REST endpoints: HTTP 200.
- API and database listeners: `127.0.0.1`/`::1` only; active LAN-IP probe blocked.

The next implementation step is a localhost-only one-time Owner setup followed by real login/account-management server actions. Session limits, lock/unlock, recovery, approvals and audit effects must be exercised end to end before they can be described as working.
