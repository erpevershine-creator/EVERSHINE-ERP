# Pending device approval evidence — 2026-09-10 candidate

The login action no longer signs out a provider session that is waiting for
approval. The exact session remains authenticated to the provider but has no ERP
data access until the Owner or authorized Account Management approver decides its
request. `my_login_approval_status()` exposes only the session's own status:
`pending`, `admitted`, `rejected` or `signed_out`. It cannot read other requests,
and approval does not require a second login.

The login form polls the status action while pending. Approval redirects the same
session to the dashboard; rejection/expiry returns the user to a fresh sign-in.
Provider sessions and ERP device rows remain separate, so a pending session cannot
use RLS-backed ERP actions.

The third-device suite now passes 23 assertions, including pending polling,
negative ERP admission and same-session admission after approval. The full isolated
run passes 257 SQL assertions across 13 suites and eight Auth provider workflows.
No Owner data or real device was used. This is a candidate migration and remains
unapplied to the Owner database.

Remaining device gates are stable browser identity, per-device idle heartbeat and
concurrent approval/expiry handling. The current migration still retains the
session-UUID fingerprint and those issues remain open under the Foundation Goal.
