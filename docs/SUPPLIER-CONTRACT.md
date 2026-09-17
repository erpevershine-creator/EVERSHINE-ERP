# Supplier contract — confirmed decisions and remaining questions

Updated 2026-09-10, Asia/Yangon. Status: REQUIREMENTS RECORDED; IMPLEMENTATION AND ACCEPTANCE PENDING.

This records the Owner's decisions in the active conversation through configurable Sequence / Sample Calculation, actual per-Purchase Deposit and rejection of Deposit above Sub Total. It is not proof of a working Supplier module. Current user decisions override V1/V2.1 reference behavior.

## Module and identity

- Supplier and Product are separate modules/pages. Navigation grouping is deferred until the business pages are built.
- Supplier code format: SUP-MM-00001 (SUP + country code + five-digit sequence). Numbering starts independently for each country. Generated codes cannot be edited or reused.
- Do not implement a Country-change workflow or regenerate codes; the Owner explicitly said no Country/code change was being requested.
- Legal Name only. A new Supplier with the same country and normalized Legal Name is blocked. The exact normalization algorithm still needs documented examples before implementation.
- One Contact Person and one structured Address per Supplier. Draft may be incomplete; submission requires both.
- Contact Person: Name and Phone required, Email optional.
- Address: Address Line, City/Township, State/Region, Country.
- The Owner declined Tax ID / Company Registration Number for this first Supplier master.

## One onboarding approval

New Supplier has one approval request covering Supplier details, one Commercial Agreement and one Financial Formula. All three must be complete before Request Approval is permitted. There must not be three separate onboarding requests.

Only Owner or an Admin with the relevant approval authority may approve. Preserve the explicitly confirmed Owner self-approval exception; all other creators cannot self-approve. An earlier assistant statement excluding every creator was too broad and did not revoke the Owner exception.

Approval activates all three immediately. No future activation date is required. The technical design must commit this as one transaction: either the complete approved package becomes Active or none of it does. The request must bind the exact versions and calculation definition reviewed.

## Scope and revisions

- Exactly one current Active Commercial Agreement and one current Active Financial Formula per Supplier.
- Both apply globally to that Supplier; no Account/Site/Warehouse overrides.
- One currency for both. Select by ISO 4217 code and display code plus full currency name; for example MMK — Myanmar Kyat.
- Changes use Draft Revision → Pending Approval → Approved → Active.
- The current Active version remains effective until its replacement is approved. Replaced Agreement/Formula versions become Archived history and are not deleted.
- Active Supplier detail changes preserve original facts and revision history.
- Reason Note remains required for governed actions. Initial incomplete draft validation must be distinguished from submission validation.
- Later Agreement/Formula changes require approval. Whether a change to one must revise both is still open; never silently activate incompatible versions.

## Commercial Agreement and Financial Formula responsibilities

Commercial Agreement defines Financial Titles and their values. A selected title's Value Type can be Amount or Percentage. Tax is optional: add its title/value when needed; omission means no tax calculation, not a fabricated zero-rate/exemption classification.

Supplier prices exclude tax. A configured tax setting applies globally to the Supplier Agreement. The later Amount-or-Percentage choice supersedes the earlier percentage-only framing.

Financial Formula references these titles and controls Basis, +, -, *, / and the calculation sequence. Do not hard-code every value as a Discount or Markup, infer an operator from a title's text, or independently duplicate Agreement values in Formula settings.

## Calculation structure

1. Base Price × Quantity = Total.
2. Run configured Financial Title steps using their selected Basis and operators.
3. The result after these steps is Sub Total. Tax, when configured, is a title inside this stage.
4. Sub Total − Deposit = Grand Total.

Deposit is applied after the tax/title stage. D153 confirms it is the actual amount prepaid for the individual Purchase. It is a per-Purchase monetary input, not a fixed Supplier Agreement value or a percentage rule. D154 confirms that Deposit greater than the calculated Sub Total is rejected. Do not silently reduce the entered Deposit, convert the excess into Supplier Advance, or accept a negative Grand Total caused by excess Deposit. Recheck this bound when formula/title inputs change; preview and server-side submission validation must agree. Payment evidence/linking and partial allocation remain open. Do not implement payment or ledger posting from this contract.

Internal calculation precision is six decimal places. Final Line Total / Invoice Total are rounded to two decimal places; the earlier MMK 0.5 rounding proposal was superseded. HALF_UP has been the discussed convention; final formula acceptance must include tie/negative examples and reconciliation of rounded lines versus invoice totals.

## Configurable sequence and sample calculation — latest Owner decision

While defining or revising a Financial Formula, the user arranges the steps, views Sample Calculation, and adjusts Sequence as needed. The sequence is not fixed automatically from title names.

The reviewable editor design should:
- Accept sample Base Price, Quantity and a sample Deposit amount representing actual prepayment for that Purchase.
- Show each step's Sequence, Financial Title, Value Type/value, selected Basis amount, operator, calculated adjustment/factor, and running result.
- Show Total, Sub Total, Deposit and Grand Total separately.
- Recalculate the sample after changing a step's sequence or calculation settings.
- Keep sample calculation separate from business data and payment posting.
- Bind submission to the exact reviewed sequence and versions. An Active Formula's sequence changes follow the already-confirmed revision/approval rule.
- Report invalid/missing references and divide-by-zero rather than silently ignoring a step or substituting zero. The final allowed Basis catalogue and forward-reference behavior remain to be agreed.

Illustrative example, not a default commercial rule: Total 100,000; Discount 10% of Current Value; Delivery Amount 2,000; Deposit 5,000.
- Discount → Delivery: Sub Total 92,000; Grand Total 87,000.
- Delivery → Discount: Sub Total 91,800; Grand Total 86,800.
This difference occurs because Discount uses Current Value. If its Basis is the original Total in both orders, these two additive/subtractive steps produce the same 87,000 Grand Total.

## V2.1 reference boundary

Reviewed reference files under C:/Users/DELL/Desktop/KOE KOE ERP/EVERSHINE-ERP-V2.1-LOCAL:
- src/lib/supplierOnboarding.ts: title/value/type definitions, TOTAL and CURRENT_VALUE bases, four operators and ordered accumulator preview.
- tests/supplier-commercial-formula-onboarding.test.ts: package validation and expected preview/approval behavior.
- supabase/migrations/20260828091409_add_supplier_commercial_formula_onboarding.sql: Supplier Agreement and Formula assignment, database simulation and approval execution.
- src/lib/pricingFormulas.ts is a different legacy block-expression implementation; do not conflate it with the Supplier onboarding calculator.

These are design references, not authority to copy code, data, credentials, legacy default formulas or old rounding. The Owner's new two-decimal final totals, global Supplier scope and single package approval govern the new work.

## Open business decisions — ask one at a time

- Deposit: payment evidence/linking and partial allocation still need confirmation. The actual per-Purchase source and rejection of Deposit above Sub Total are settled.
- Final allowed Basis choices and references to prior results.
- Zero-title/no-adjustment Agreement completeness; optional title handling in a referenced Formula.
- Formula result bounds and multiply/divide interpretation for Amount versus Percentage.
- Invoice total reconciliation with rounded lines and document-level adjustments; do not double-apply Deposit.
- Exact normalization, sequence exhaustion and Draft/rejection/cancel details not already settled by foundation policy.

## Delivery gates

The Owner requested foundation baseline freeze, identity/security closure and backup/DR acceptance before live business entry. Track these independently from Supplier requirements. Existing local/offsite integrity proof does not close full recovery acceptance. Preserve Owner data. No Supplier schema, UI or runtime validation was implemented by this documentation update.

## 2026-09-14 — No-adjustment agreement confirmed
Owner confirms zero Financial Titles and zero formula steps are a complete no-adjustment agreement/formula: Total = Sub Total. Deposit remains an actual per-Purchase amount after Sub Total, bounded by Sub Total. CNY — Chinese Yuan and INR — Indian Rupee are requested alongside existing currencies. Supplier completion is explicitly authorized locally; outstanding business decisions remain to be resolved one at a time.

## 2026-09-14 — City code correction and execution authority
Latest Owner instruction supersedes country-based numbering: use City numbering, Yangon = SUP-YGN-00001. City is the sequence and duplicate-name scope. Keep Country as structured address data. No existing generated code may be edited/reused. Whole Supplier + Agreement + Formula packages are submitted and reviewed together; current Active package remains effective until a new package is approved. Owner requests isolated SQL/concurrency and browser workflow evidence before completion.
