# EVERSHINE ERP 2.1 — Milestone 1

Clean, independent **local foundation review**. This milestone implements compact screens and interactive sample approval flows. It is not connected to real Auth, database, business data or hosted services.

## Run

Double-click `Start-Local.cmd`, then open **http://localhost:3000**. Keep the launcher running while reviewing. Stop with Ctrl+C or double-click `Stop-Local.cmd`. The server started by Codex is hidden in the background; `Stop-Local.cmd` also stops that instance. Alternatively, use Node.js 24 LTS (Node 26 supported), run `npm ci`, then `npm run dev`.

First package installation needs internet. Once installed, the foundation runs locally without a cloud backend, remote fonts, analytics, Docker or Wi-Fi switching. It only listens on the local computer. This does not provide access from a different phone/computer or prove future hosted network availability.

Use the **Owner / Admin / Employee preview** control to inspect sample access differences. The label is a preview selector, not a login. `/login` shows the planned login layout; disabled inputs intentionally do not collect passwords.

## Review

1. Inspect Workspace, Accounts and Positions at desktop/mobile sizes; switch Light, Dark, System.
2. Review a pending request. Approve/reject requires a reason. Rejected attempts stay in History and the request returns to Draft.
3. Select Employee, create a sample request, save Draft and submit. Select Admin to review an account request. Admin cannot self-approve or approve position changes.
4. As Owner, revise an approved request; inspect the original and revised versions. No second approval is required for authorized revision.
5. Search/filter/sort, toggle columns, export sample CSV, read a notification, inspect history. Manual export has no extra approval when permitted by the illustrative profile.
6. Review Settings policies and the 80% Usage simulation. Backup and live quota measurements are explicitly unavailable.

Sample changes survive reload/navigation **in the same browser tab** through sessionStorage. They are not durable ERP records and are readable/editable by the local browser user. Reset via Settings → Appearance → Reset samples. Theme preference is saved separately on this browser.

## Verification

`npm run typecheck` · `npm run lint` · `npm test` · `npm run build`

With `npm run dev` active: `npm run test:e2e` (uses installed Google Chrome; no cloud service). Evidence and limits: `docs/MILESTONE-1.md`.

Production build compilation can be verified, but `next start` intentionally returns 503 for app pages. Review mode requires development mode, the explicit local-launcher flag and a loopback Host. Binding is 127.0.0.1. This prevents accidentally publishing a credential-free preview as a real ERP. Host validation is an additional guard, not authentication.

## Next

Owner accepts/adjusts the foundation screens → define and implement local Docker/Supabase Auth/database and server-enforced controls → verify access, audit and recovery → confirm business modules individually → hosted verification → separate Production confirmation.

Vercel Hobby is for non-commercial personal use. Free company ERP Production on that plan is not an approved assumption. No cloud service, email, subscription or deployment was created here.
