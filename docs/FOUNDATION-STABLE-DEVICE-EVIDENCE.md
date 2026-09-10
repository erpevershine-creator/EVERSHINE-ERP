# Stable device identity evidence — 2026-09-10 candidate

The login flow now creates a random 32-byte HttpOnly `erp_device_token` when a
browser has no token. Only its SHA-256 digest enters the database. The token is
never used as an authority by itself; the current Auth session, profile fences
and active ERP device row remain required.

On a later login from the same browser, the matching active device is replaced by
the new Auth session without consuming a second device slot. A different browser
gets a different fingerprint and follows the two-device/approval gate. Pending
approval stores the captured fingerprint, so approval cannot substitute another
device. Legacy calls without a token remain fail-closed and use the session
fallback only for compatibility fixtures.

The proxy calls `touch_my_device()` after claims validation. It updates activity
for the current admitted session. A seven-day gap closes only that device,
raises the reapproval fence and records an audit event. Approval of an idle device
preserves a healthy device when capacity permits.

Validation passed 264 isolated SQL assertions across 14 suites, eight isolated
Auth workflows, typecheck, lint and optimized build. Evidence is in
[stable-device-identity-20260910.json](evidence/stable-device-identity-20260910.json).
The migration is a worktree candidate and remains unapplied to Owner data.

Still open: real browser acceptance, concurrent approval/expiry probes, and the
remaining F2–F6 permission, operation, backup/DR and Owner acceptance gates.
