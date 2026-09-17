# F0 baseline review — 2026-09-14

Technical baseline: PASS. Owner baseline acceptance: PENDING. F1–F6 and Production remain unaccepted.

## Exact candidate and preservation

Candidate: F0-20260914, foundation worktree at D:/EVERSHINE-ERP-WORKTREES/foundation-gates-20260910, starting HEAD bfa3c427dc780c595361deafbfdf55e37f614bbf. HEAD alone is not this candidate. The authoritative 223-file content manifest is FOUNDATION-F0-MANIFEST-20260914.json, including every migration, package lock and pending implementation file. Review documents are supplemental, outside the tested application manifest.

Local evidence: .runtime/f0-20260914. It contains the original source snapshot, original/final manifests, binary pending/final patches, complete verified Git history.bundle and exact final copies of the three changed files. Restore only into a fresh directory using that bundle plus snapshot and the final copies; verify hashes before use. This is source rollback, not database rollback or disaster recovery. Credentials, env files, backup archives and database volumes were not copied. Main checkout pending work remains untouched; its status is recorded separately.

## Fresh validation

| Check | Result |
| --- | --- |
| npm run typecheck | PASS, repeated after build-generated type changes |
| npm run lint | PASS |
| npm test | 39/39 PASS, no skips |
| npm run build | PASS, optimized webpack build |
| npm ls --depth=0 | PASS; Node v26.1.0, npm 11.13.0; pinned dependency lock preserved |
| schema-only isolated database rebuild | 21 suites, 400 assertions PASS |
| isolated real Auth harness | 11 workflows PASS |
| Supabase CLI pgTAP on synthetic browser stack | 21 suites, 400 assertions PASS after fixture correction |

The initial npm db:test invocation failed because its fixed evershine-local-loopback network does not host the isolated browser database. Duplicate network flags did not override that script reliably. Final equivalent CLI command: node_modules/.bin/supabase test db --local --workdir .runtime/browser-foundation --network-id evershine-foundation-browser-20260913 D:/EVERSHINE-ERP-WORKTREES/foundation-gates-20260910/supabase/tests. No test was redirected to the real Owner database. Failed logs are retained.

The first successful CLI connection exposed existing synthetic Owner collisions in suites 020/021. Those suites now temporarily inactivate the existing Owner inside their BEGIN/ROLLBACK transaction, matching the established fixture pattern. The corrected suites passed all 400 assertions on the populated synthetic stack. The schema-only/Auth run preceded this fixture-only change; application, Auth runner and migrations did not change afterward. Build also regenerated next-env.d.ts from dev types to build types; final typecheck passed and both versions are preserved.

## Evidence boundaries and Owner checklist

- Roles, RLS, RPC authorization, approvals, audit, password/session controls and backup metadata are covered by the numbered SQL suites and exact migration hashes in isolated-db.json. These are focused baseline checks, not exhaustive security certification.
- Backup crypto, locks, retention, OAuth and recovery-bundle behavior have fresh unit coverage. Historical remote restore/Storage/browser evidence is described in FOUNDATION-CONTINUATION-20260914.md; it was not rerun or promoted into fresh F0 evidence.
- Review this candidate identity and the pass/failure records; accept or reject F0 baseline explicitly. Work authorization is not acceptance.
- F1–F5 operational gaps remain in FOUNDATION-CONTINUATION-20260914.md, including broader handover concurrency/continuation, replacement-environment OAuth and restored login, remote pruning, and approval-bound live restore/failure/retry. Supplier/main migration compatibility and full Owner application acceptance remain open.
- No merge, live migration, real account/password modification, backup delivery, live restore, Production deployment or full Foundation acceptance occurred in this F0 run.

F0 is technically ready for Owner review. Formal F0 closure requires the checklist acceptance; it does not close F6 or the entire Foundation.
