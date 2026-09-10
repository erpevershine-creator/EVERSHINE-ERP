# Foundation execution plan and goal

Updated 2026-09-10. Owner priority: FOUNDATION FIRST. Business questions and coding are paused until the foundation acceptance gate; the latest no-adjustment Supplier question is parked, not answered.

## Goal G1 — finish a reviewable, tested foundation

Complete the confirmed foundation controls, preserve Owner data, capture reproducible evidence and present a concrete acceptance package. Do not equate a successful build, a single restore test or a source checkpoint with a perfect/production-accepted ERP.

Working branch: codex/foundation-gates-20260910.
Working directory: C:/Users/DELL/Desktop/EVERSHINE-ERP-WORKTREES/foundation-gates-20260910.
This is a native Git worktree created for this task, not a new Codex task. The original checkout stays at C:/Users/DELL/Desktop/EVERSHINE-ERP. Nineteen pending source/document files were copied with matching SHA-256; no env files, credentials, database volumes or backup archives were copied.

## Ordered gates

| Gate | Work and acceptance evidence | Status |
| --- | --- | --- |
| F0 Baseline | Exact source checkpoint, pending-file preservation, migration/hash manifest, dependency lock, fresh typecheck/lint/unit/build/DB results, roles/RLS/RPC/audit/backup evidence and Owner checklist | IN PROGRESS — candidate evidence is current at 324 isolated SQL assertions and eight Auth workflows; Owner freeze/acceptance is still pending |
| F1 Identity/security | Account/profile/password administration, provider-operation fencing/reconciliation, login throttling, two-device and third-device approval, seven-day idle reapproval, expiry/reminders; real bypass/role/concurrency probes on isolated fixtures | IN PROGRESS — admission, device, password fencing/provider receipts, recovery reconciliation and local daily expiry reminders pass; general profile editing and final browser/Owner acceptance remain open |
| F2 Permissions/approval/handover | Delegated Admin scope, individual overrides/denies, reject/re-draft/expiry, exact approvals and handover/temporary responsibilities without changing original actors | OPEN — temporary assignment and deadline expiry/reminders pass isolated checks; permanent successor handover (D09), delegated appointment scope, explicit deny behavior and rejected/expired re-draft lifecycle remain unaccepted |
| F3 Foundation operation | Server pagination/search/filter/sort, governed exports, audit/notification consistency, settings and truthful usage monitoring; remove or clearly gate remaining sample-only behavior | IN PROGRESS — live settings/usage, server page ranges/counts and local idempotent password/deadline workers are implemented; global search/filter/sort, governed server export and durable Production scheduling remain open |
| F4 Backup/DR | Existing local capture/schedule/retention, durable offsite retries/retention, independent-profile recovery, restore maintenance/failure/manual retry, destination-bound external delivery and recovery verification | OPEN |
| F5 Integrated verification | Source/SQL/server enforcement, relevant unit + database + isolated Auth/Storage + desktop/mobile workflow tests; negative/replay/stale/interruption probes, exact results and remaining external dependencies | IN PROGRESS — 33 Node tests, 324 isolated SQL assertions and eight Auth workflows pass; final UI/browser and external DR proof remain open |
| F6 Owner acceptance | Concrete review bundle with pass/fail/blocked per requirement, source identity, residual limits and explicit Owner acceptance; no open critical control is reported as passed | PENDING |

Work each gate to a reviewable increment, record its evidence, then continue in dependency order. Runtime prerequisites can be repaired while source review continues. Never resume Supplier questions simply because a foundation test is slow. Ask only essential foundation decisions or external account actions that cannot be established from confirmed requirements.

## Execution constraints

- No Owner/password/recovery-code changes, database reset, production deployment, payment posting or paid resources. Use rollback fixtures or a separately identified disposable validation database.
- Existing local database: evershine-erp-m2-local; do not run an additional backup scheduler from the worktree against it. Worktree code must not start workers until target/lock isolation is verified.
- Keep exact source checkpoints separate from acceptance. Preserve failed checks and avoid mixing old successful outputs with a new uncommitted candidate.
- Fresh Google reauthorization, named Telegram bot/channel and a genuinely separate-profile restore are external dependencies, not reasons to fabricate a pass.
- Fast mode is optional under the latest instruction. Its setting is not a foundation prerequisite and is not claimed changed.

## Business work after foundation acceptance

Review the architecture and dependency contracts first, then follow the Owner's supplied sequence: Supplier → Product → Purchase → Inventory/Pricing → Customer → Promotion → Order → Stock Survey → Return/Exchange → Delivery → Invoice → Finance → Statement → Reports → App User Guideline → further agreed scope.

Define each module's fields, numbering, permissions, status/approval, revisions, audit, calculations, search/report/export, error handling and interfaces before implementation. Document any dependency requiring an adjusted implementation order for Owner review; do not silently rearrange the plan or import V2.1 behavior as a new rule. After this review, resume the remaining Supplier questions in contract order, one business question at a time.

Supplier decisions D145–D154 remain preserved, including Deposit <= Sub Total. No-adjustment Formula completeness and other unresolved rules remain parked in SUPPLIER-CONTRACT.md.
