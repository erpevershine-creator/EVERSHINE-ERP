# Foundation source baseline — 2026-09-10

This freezes the starting source for foundation remediation, not production acceptance. The checkpoint is on `codex/foundation-gates-20260910`; the original checkout and Owner data are preserved. Nineteen previously pending source/document files were copied with matching SHA-256 before new work. No credentials, environment files, archives or database volumes were copied.

`FOUNDATION-BASELINE-20260910.json` identifies the exact source files, migration hashes and dependency lock. Its manifest excludes itself and subsequent remediation scripts. Use the commit containing this document for the immutable Git checkpoint.

## Fresh verification of the starting candidate

- Clean `npm ci`: passed (377 packages).
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test`: 28/28 passed, including actual disposable Windows DPAPI and lock contention checks.
- `npm run build`: passed, optimized Next.js build. No production deployment or Auth/Storage browser acceptance is implied.
- `npm run db:test`: eight rollback-only files, 160/160 pgTAP assertions passed against the existing local schema. No reset was run.
- `npm run db:lint`: no errors; existing unused `create_position` parameter warnings remain.

## Owner acceptance checklist (pending)

- [ ] F1 identity, session/device, password and recovery controls have passing positive/negative workflow evidence.
- [ ] F2 delegated permissions, approvals and handover preserve original actors and enforce scope.
- [ ] F3 lists/operations/settings distinguish live behavior and cover search, pagination and governed exports.
- [ ] F4 backup/DR independently restores without the original profile, with maintenance/retry/retention and confirmed destinations.
- [ ] F5 integrated Auth/Storage and desktop/mobile workflows are tested against the final source, with failures disclosed.
- [ ] F6 Owner reviews and explicitly accepts the completed evidence package.

Known starting gaps remain documented in FOUNDATION-GATE-REVIEW.md and FOUNDATION-EXECUTION-PLAN.md. In particular, the old session predicate accepts an Auth session without an admitted ERP session row; the baseline tests did not cover that bypass. A passing baseline does not close this gap. Supplier/business questions remain paused under D155.
