# EVERSHINE ERP — Business phase start

Updated 2026-09-10. D155 takes priority: foundation execution and acceptance first; Supplier/business questions and coding are paused. The current business sequence and dependency-review gate are in FOUNDATION-EXECUTION-PLAN.md. Earlier sequence wording below is superseded by D155. No live business entry or Production release is accepted.

## Confirmed delivery order

1. Freeze a reviewable foundation baseline with migration/RLS/RPC/roles/audit/backup evidence, exact source identity, validation results and Owner acceptance checklist.
2. Close remaining identity/security controls according to the confirmed decisions.
3. Prove backup/disaster-recovery acceptance independently, including recovery without the source profile.
4. Confirm each business module contract, asking one unresolved business question at a time.
5. Build Supplier and Product as separate local modules with schema/RLS/server enforcement/UI/audit and meaningful verification. Navigation grouping is deferred.
6. Accept each module before proceeding: Supplier/Product → Purchase/Receipt → Promotions/Customer Agreements → Orders/Delivery → Invoice/Consignment → Returns/Exchange/Damage → Finance/Statements → Reports → Release Validation.

Supplier onboarding includes a complete Commercial Agreement and Financial Formula in one approval package. See SUPPLIER-CONTRACT.md and D144–D152; their confirmed decisions supersede this document's earlier statement that Supplier numbering and approval were unconfirmed.

The Supplier/Product slice does not post stock movements or accounting entries. The confirmed warehouse context remains one Head Office, Operations Warehouse and Reserve Warehouse; detailed transaction workflows require their own contracts.

## Current boundary

Supplier contract: separate modules, immutable code, per-country numbering, contact/address, single package approval, global Agreement/Formula, currency selection, revision history, configurable Financial Titles/Basis/operators, six-decimal internal precision/two-decimal final totals, Tax before Deposit and adjustable Sequence with Sample Calculation are recorded.

Product fields/rules and remaining Supplier financial details are still open. Do not infer them from V1/V2.1. Reference review is not permission to copy old application code/data/credentials.

Foundation baseline and gates are not accepted. Full identity/device/handover/recovery controls and no-profile backup/DR remain open; see AI_PROJECT_HISTORY/ACTIVE/OPEN_ITEMS.md and FOUNDATION-GATE-REVIEW.md. Main Backup account re-verification was deferred under D143; do not repeat consent based only on a stale browser URL.
