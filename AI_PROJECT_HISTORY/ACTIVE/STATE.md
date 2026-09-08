# Current implementation and evidence

Updated 2026-09-08. Milestone 2.2 live local identity/permissions slice is implemented. One real active Owner remains; no employee business account was invented. The older chronological state is archived at AI_PROJECT_HISTORY/legacy-snapshot-20260908/pre-m22-STATE.md.

## Runtime
- Clean independent source: C:/Users/DELL/Desktop/EVERSHINE-ERP. Local Next.js on 127.0.0.1:3000, isolated Supabase project evershine-erp-m2-local on API 55321 / DB 55322, network evershine-local-loopback. Old UAT stack untouched.
- Existing Owner setup/login works. Global self-signup is disabled; local auth.email.enable_signup=true enables the email login provider. Keep this distinction.
- All new migrations were applied incrementally. No database reset, production deployment, paid resource, outbound message, actual password reset or removal of Owner data occurred.

## Live behavior
- Accounts: database-backed list, private authenticated photo endpoint, required photo/name/manual Company Position/department/ERP Role/Gmail username/password/confirmation/contact creation form. Owner or authorized Admin only; only Owner appoints Admins. Auth creation and photo upload precede transactional profile/snapshot/audit provisioning. Compensation checks for committed profile before cleanup.
- Admin actions: scoped disable, reenable and unlock with reason; Owner cannot be changed there. Previous sessions are revoked using server/database checks. Employee general profile/password editing and handover are not implemented.
- ERP Roles & Permissions (D136): fixed Owner/Admin/Sales/Delivery/Finance/Inventory catalogue. Manual Company Position is descriptive; the selected ERP Role derives the permission template, enforced by a composite database foreign key. New Sales/Delivery/Finance/Inventory templates start with no page/action access until configured and approved. Configure additional page/action permissions on a role, select exact affected accounts, save Draft, Submit, then individually Approve/Reject. Only Owner self-approves. RPCs check current authority, versions and scope; stale requests cannot apply. Each account keeps its own page/action snapshot. Excluded accounts and existing individual page overrides are preserved.
- Approval Center fetches the complete affected-account snapshot per opened request before showing decision controls. Snapshot includes account name/version and before/after page/action access. Lists currently show latest 200 requests; account list has an initial 500-row cap. Full server list paging and rejected-request re-drafting/revision remain follow-up work.
- Audit and recipient-scoped notifications use real data and Myanmar time. Notification read state persists through RLS. No Gmail/Telegram messages are sent. Audit is append-only.
- Sidebar and direct routes use logged-in database access, with server actions/RPCs enforcing authority separately. Removed synthetic actor selector from the live shell. Remaining sample review screens are explicitly labelled.
- ERP sign-in records session history and counts five invalid password attempts before locking. Service failures do not count. Six-month expiry blocks access. Manual account unlock requires authorized Owner/Admin. The counter is on the ERP login path; direct provider-auth attempts and full throttling/security coverage require further hardening before Production.
- /recover contains the Emergency Recovery Code input and calls server-only verification plus Auth admin password update. Recovery fences account access first; success clears lock/expiry and rejects every prior session, including refreshed old JWTs. It preserves history and the existing emergency-code hash. No clear recovery code/password is persisted or audited.
- Recovery uncertainty is fail-closed: an interrupted/ambiguous Auth update leaves a durable running operation requiring local operator reconciliation. There is intentionally no timeout that blindly unlocks the account. A dedicated reconciliation procedure/UI is still needed; do not clear a running operation without checking the Auth outcome.
- Session revocation uses Auth session creation time plus explicit device-session status. This is session history/revocation, **not yet** two-device enforcement, third-device approval, oldest-session replacement or seven-day idle reapproval.

## Latest role refinement
See docs/ERP-ROLES.md for current D136 verification and runtime evidence. The following M2.2 verification predates this refinement.

## Verification
- 82/82 transaction-only pgTAP tests passed. Tests isolate fixtures and roll back; they cover creation, page/action separation, RLS denial, Admin self-approval rejection, selected/excluded accounts, override preservation, stale requests, five failures, recovery concurrency, refreshed-JWT revocation, new sessions, logout and direct privilege escalation denial. Test account/audit fixtures do not persist.
- Database lint passed. Five application policy tests passed. TypeScript and ESLint passed. The final optimized build passed after the snapshot-loading refinement. See docs/MILESTONE-2.2.md.
- Browser verified authenticated /accounts, actual private Owner photo, all required account form fields, live positions/page matrix, and /recover fields. Owner session remains signed in on /accounts.
- Real Owner password change and an end-to-end Auth+Storage employee creation were deliberately not exercised against the Owner's account. Database RPC/security tests and UI inspection are not a claim of full real-account acceptance. M1 Playwright tests target the previous sample flow and must be adapted for live scenarios.

## Remaining
See OPEN_ITEMS.md. Business modules, backup/restore, real email/quota integrations and Production remain unimplemented/unaccepted. Backup requirements D120–D134 are preserved in DECISIONS.md; no scheduler is configured.
