# Supplier completion audit — 2026-09-14

## Verdict

NOT COMPLETE / NOT READY FOR LIVE BUSINESS USE. The UI is a sample client implementation, while a partial database schema is installed. Product requirements can be discussed, but Product implementation must not treat this Supplier implementation as an approved, durable dependency.

Scope: D:/EVERSHINE-ERP current working tree; confirmed D145–D154 and docs/SUPPLIER-CONTRACT.md; route, client state, approval provider, live approval reader/actions, SQL migration, actual local database metadata, supplier unit tests and targeted in-memory probes. No business records, permissions, credentials or database schema changed. Prior-turn desktop visual checks cover New/Edit and formula layout only. No new full browser workflow, full-suite or production acceptance is claimed.

## Findings, ordered by impact

### 1. BLOCKER — Save/Edit/Import do not persist Supplier data
- src/features/suppliers.tsx:154 initializes component state from a hard-coded supplier. Save at 405 and import update that state only; there is no Supplier server action or database reader/writer.
- Refresh/remount reinitializes this list. The displayed Active sample is not evidence of a real approved database supplier.
- Required: authenticated durable draft/read/update services, failure feedback, retry/idempotency, server validation, reload and cross-session evidence.

### 2. BLOCKER — Submit does not reach the live Approval Center
- src/features/suppliers.tsx:443 calls useReview.addDraft. src/components/review-provider.tsx:359 creates a sample request with status Draft and a sample actor; that provider stores review state in sessionStorage.
- src/features/live-pages.tsx:92 reads public.approval_requests, restricted to position_permissions and individual_permissions. src/app/live/actions.ts:192 handles permission-change decisions.
- Supplier becomes locally Pending while its request is a sample Draft. No exact package/version snapshot or Supplier activation callback is connected.
- Required: one transactional Supplier+Agreement+Formula request; live queue/detail integration; authorized decision; atomic activation; duplicate-submit protection; reject/revision handling; exact reviewed versions and real requester.

### 3. BLOCKER — Active edits destroy the current effective version in the client
- src/features/suppliers.tsx:405 replaces the existing record with Draft; submit similarly replaces it with Pending. There is no separate active snapshot and proposed revision.
- Delete at 454 removes any selected record, including Active/Pending, from the list. No governed reason, immutable revision history or downstream-use check is present.
- SQL has version/status columns but no unique active-version indexes or mutation guards. Contacts/addresses have no unique supplier_id constraint; formula agreement_id does not enforce agreement and formula belong to the same supplier.
- Required: preserve current active facts during revision; atomic replacement/archive; version conflict checks; one contact/address and one active agreement/formula; settle lifecycle actions without inventing a hard-delete policy.

### 4. BLOCKER — Permission and database security implementation is incomplete
- Route requires real login and page access, which is useful. Supplier buttons do not receive action-level Access; useReview defaults to a sample owner actor.
- Live metadata: all six Supplier tables have RLS disabled; anon and authenticated have no SELECT grants, and authenticated has no INSERT grants. This audit does NOT claim current anonymous data exposure: the absent grants currently prevent direct access.
- Only supplier-related public/private function found: generate_supplier_code. No guarded Supplier write/submit/approve RPC exists.
- Migration grants Supplier page view to all positions; that is not a reviewed per-account action permission design.
- Required before live use: explicit role/action model, guarded session-aware operations, RLS and least-privilege grants, non-owner creator self-approval denial, preserved Owner exception, cross-account/direct API negative tests.

### 5. HIGH — Code and duplicate rules contradict D145
- src/lib/suppliers.ts:64 and the installed SQL generator use city abbreviation, e.g. SUP-YANG-00001. Contract requires independent country numbering, e.g. SUP-MM-00001.
- Duplicate checks and SQL uniqueness use city + normalized name, allowing the same country/name in different cities. Draft save bypasses duplicate checks.
- Code generation uses maximum existing code + 1; deletion can permit reuse and simultaneous callers can receive the same proposal. CSV accepts caller-provided codes at src/features/suppliers.tsx:535. Edit permits Country changes while keeping the old code.
- Required: authoritative country identity, atomic non-reusable sequence, exhaustion handling, approved normalization examples, database uniqueness, immutable generated code and no unapproved country-change workflow.

### 6. HIGH — Rounding and numeric validation are incorrect/incomplete
- src/lib/suppliers.ts:123 rounds Base Price × Quantity to two decimals before adjustments. Lines 206/216 also round before subsequent arithmetic. This does not preserve six-decimal internal values until final output.
- Reproduced in memory: basePrice 0.014 × quantity 1, amount adjustment +0.004, deposit 0 returns 0.01. Keeping precision produces 0.018, final two-decimal HALF_UP 0.02.
- NaN and Infinity base prices are accepted and propagate into grandTotal. The Math.round/EPSILON helper is not sufficient proof of decimal HALF_UP behavior, particularly ties/negative values.
- Required: decimal-safe six-place internal arithmetic, approved rounding boundary and tie examples, finite/bounded inputs, server/preview parity and reconciliation tests.

### 7. HIGH — Complete-package validation accepts invalid input
- A direct validateSupplierPackage probe accepted whitespace-only address fields/country, currency XYZ with mismatched name, empty financial title name, alphabetic phone and invalid email.
- Validator only checks presence for currency/address, and title/step arrays mostly through calculator execution. Native input types do not replace validation in click handlers or CSV imports.
- Required: schema/type validation, trimmed required fields, agreed phone/email rules, ISO currency mapping, title identity/type/value validation, unique step identities and valid references, and identical server checks. Incomplete Draft remains intentionally allowed under D146.

### 8. HIGH — Formula editor does not fully implement the confirmed review experience
- It supports add/delete/settings but has no explicit sequence move/reorder controls. The calculator returns stepDetails, but UI only displays aggregate totals instead of each step's basis/adjustment/running result.
- Deleting a referenced step silently switches dependent basis to current_value (src/features/suppliers.tsx:316), potentially changing the calculation meaning.
- New forms prefill a 5% Trade Discount. The contract's examples do not authorize an automatic commercial default.
- Required: explicit sequence adjustment with stable references, visible per-step calculation trace, clear invalid-reference handling, reviewable exact submitted sequence, no invented default commercial terms.

### 9. MEDIUM — Business decisions remain open
- Zero-title/no-adjustment completeness is unanswered, but UI and validator force at least one title and step.
- Final allowed Basis/reference catalogue and Amount/Percentage multiply/divide interpretation/result bounds remain open.
- Whether an Agreement-only or Formula-only change revises both, exact normalization examples, rejection/cancel lifecycle and sequence exhaustion need resolution.
- Payment evidence/allocation and invoice reconciliation should be assigned to later Purchase/Finance/Invoice scope; they are not authorization to implement payment posting inside Supplier.
- Resolve one business question at a time. Suggested first: whether a supplier with no financial adjustments may submit an agreement with zero titles and a direct Total → Sub Total formula.

### 10. MEDIUM — User workflow, import and acceptance evidence remain incomplete
- No user-entered governed Reason Note; submit constructs a generic reason. No persistent success/failure feedback or request tracking back to Supplier.
- No explicit pending lock/withdrawal/rejected revision experience; no unsaved-change warning. Form labels are not associated with inputs via htmlFor/id; inline accessible error links and decimal entry affordances need review.
- CSV validates client-side only and can accept arbitrary codes; import atomicity/partial success and permissions need defined behavior. Export/print exist for sample state, not durable governed records.
- No supplier-specific SQL tests are present under supabase/tests. Existing unit tests enforce city numbering, so their passing result does not demonstrate contract compliance.

## Fresh evidence

- node --experimental-strip-types --test tests/suppliers.test.ts: 5/5 PASS.
- Four targeted in-memory probes: early-rounding defect reproduced; NaN accepted; Infinity accepted; invalid package accepted as valid. No test files or business records created by these probes.
- Read-only SQL BEGIN READ ONLY / ROLLBACK against verified container supabase_db_evershine-erp-m2-local, host loopback port 55322. Config project_id matches evershine-erp-m2-local.
- Migration 20260911120000 is present in the actual local ledger. Six Supplier tables exist; RLS/grants and supplier function inventory checked as described above. No SQL migration applied by this audit.
- Prior-turn evidence: New/Edit desktop layout and formula footer visually checked; typecheck and focused Supplier lint passed; build passed during that UI turn. Full lint reported a separate login Link rule error. These are prior-turn results, not a fresh full-suite run.
- Active project docs lag the actual installed Supplier schema/UI: they still describe Supplier as requirements only. Update handoff evidence after implementation is reconciled; do not mistake stale text for actual absence of tables.

## Completion order and Product gate

1. Reconcile Supplier contract questions, correct country identity and define the approved module scope.
2. Implement durable Supplier services, schema constraints/RLS and action permissions without modifying real Owner/Auth records.
3. Integrate single package approval, immutable active revisions, audit and notifications.
4. Correct calculator precision, strict validation and sequence/sample review; connect import/export to the same governed services if included in this slice.
5. Verify isolated create → incomplete draft → reload → submit → authorized approval → active → revision → reject/approve, plus unauthorized/self-approval/conflict/replay and numeric edge cases. Run relevant typecheck/lint/unit/build/rollback SQL checks and real browser acceptance.
6. Obtain Owner Supplier acceptance, separately from foundation acceptance. F0 alone is accepted in the current handoff; F1–F6 remain unaccepted there.

Product may proceed to requirements discovery now. Product implementation should depend on stable supplier_id and approved immutable agreement/formula version identities, not sample codes or client-only Active state. Supplier acceptance and the existing foundation governance remain separate prerequisites for live business use.
