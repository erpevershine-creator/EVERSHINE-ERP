# Foundation continuation — 2026-09-14

Owner database remains unchanged. Foundation acceptance remains OPEN.

## Verified candidate progress

- D158 records the Owner decision to merge successor individual permissions with source permissions and require Owner approval. Permanent handover now uses a separate Approval Center request, exact source/successor/work snapshots, deterministic row locks, stale/replay rejection, source inactivation, session fencing, merged grants and an audit link. The legacy immediate-transfer RPC is disabled.
- Latest isolated SQL run: suites 001–021 passed (400 assertions), plus 11 synthetic Auth workflows. Suite 019 now verifies closure of the unsafe legacy API; suite 021 supplies 25 security/behavior assertions. This replaces the old unsafe only-Owner transfer test, not a claim that its behavior was acceptable.
- Browser run completed at 2026-09-13T23:57:37.500Z: real synthetic Auth/Storage profile workflow and Owner-approved permanent handover passed. Source became inactive; successor retained its Gmail identity and received the role. Evidence: `.runtime/browser-foundation/browser-evidence.json`, `handover-approval.png`, `handover-applied.png`.
- Remote archive `827f945e-ceba-4234-b7ac-0f8a746b915e` was discovered without local receipts, retrieved from both existing account-bound Drive connections, verified in Linux without a Windows profile/local archive/DPAPI backup key, and restored into a disposable Linux PostgreSQL container. All 54 table fingerprints and 2 Storage files matched; profile RLS/direct-write restrictions passed. Existing Windows OAuth was used for retrieval, so fresh Google authorization on a replacement computer remains unproven. Evidence: `.runtime/evidence/remote-recovery-check.json`.
- Real remote retention inventory: one verified archive, KEEP. Its signed manifest lacks scheduled/manual provenance; no deletion is eligible. Two unmanaged debug files were preserved. This is a read-only review, not executed remote pruning. Evidence: `.runtime/evidence/remote-retention-review.json`.
- Local pruning now calls remote verification before removal, including reconciliation. A failed/missing remote copy preserves the local archive for retry. New captures include origin in the signed manifest; legacy archives remain unknown rather than being relabeled.
- Portable Linux suite: 36 passed, zero failed, one Windows DPAPI skip. Focused retention/recovery/Drive tests: 7 passed. Full typecheck passed; full lint had one warning in the recovery runner, subsequently corrected.

## Required work before final acceptance

1. Handover concurrent execution, RLS under actual client roles, selected-work continuation after source inactivation, and broader browser negatives. Current browser handover has no pending responsibilities selected.
2. Fresh two-account recovery authorization on a replacement environment and restored application/Auth login acceptance.
3. Real remote pruning implementation and interruption/retry exercise against disposable artifacts in the approved destinations. Current inventory correctly deletes nothing; no remote DELETE/PATCH was issued.
4. Approval-bound live restore, maintenance write/approval fencing, failure notifications and manual reasoned retry, exercised on an isolated running stack. Do not treat an isolated archive restore as live-restore acceptance.
5. Full final build/checkpoint, live Supplier migration compatibility, Owner review package and explicit final acceptance. Owner application is authorized but not performed while these gates remain open.

Google Drive pagination follows all pages and rejects incomplete search/loops/duplicate IDs before planning. API reference: https://developers.google.com/workspace/drive/api/reference/rest/v3/files/list
