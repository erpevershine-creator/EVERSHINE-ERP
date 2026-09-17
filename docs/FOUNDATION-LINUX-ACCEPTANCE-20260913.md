# Linux and browser evidence — 2026-09-13

Foundation remains open. This continuation completes a focused browser profile flow and provides a repeatable portable Linux test runner. Nothing was applied to the Owner database.

## Verified

- `npm run test:linux`: Linux Node v24.20.0, 32 passed, zero failed, one explicitly skipped Windows DPAPI test. The runner records the exact Docker image ID, source hashes and full output in `.runtime/evidence/foundation-linux-check.json`.
- The container has no network, Windows profile, credentials, backup archives, Docker socket or host node_modules. Only staged source files are mounted read-only. Temporary test files use container tmpfs.
- `node scripts/foundation-browser-check.mjs`: passed at 2026-09-13T13:45:42.301Z against the disposable browser project. Verified authorized Accounts access, synthetic employee provisioning through Auth/Storage, preservation of pending profile values, and approval applying Gmail, Department and ERP Role. The individual permission snapshot is shown for reapproval. Evidence and desktop/mobile screenshots are under `.runtime/browser-foundation/`.
- Browser automation ran on Windows Chrome against the isolated Supabase Linux stack. This is not Linux browser acceptance.

The browser harness previously navigated to Login instead of Accounts and clicked table rows instead of the explicit View buttons. These were harness defects. Accounts access now has an explicit URL/button assertion before being recorded as passed. Failure evidence includes URL and timestamp, and screenshots have a bounded timeout.

## Remaining gates

- Permanent handover suite 019 remains unresolved. `20260913084041_permanent_handover_security.sql` is empty; its existence provides no hardening evidence. Do not apply the unsafe prototype.
- Password, device, recovery and handover browser acceptance are not established by the profile test.
- Portable crypto, split-key, retry and retention tests are not a complete independent-profile restore. Real destination retention, recovery authorization, live restore/maintenance and retry integration remain to be demonstrated.
- Owner final acceptance remains outstanding. Owner database application is already requested, but requires compatible, validated migrations; the live Supplier migration must be preserved.

Correction: WSL2 is available through Docker Desktop. A separate Ubuntu distribution is not required for these Linux container tests.
