# Owner-managed individual permissions — D137

Implemented and verified locally on 2026-09-08. Independent project: C:/Users/DELL/Desktop/EVERSHINE-ERP.

## Behavior
ERP Roles & Permissions now has an Owner-only Individual permissions button. Owner selects one employee, sees that account's current base access, chooses additional page/action grants, enters a reason, then explicitly chooses Approve & save. This is the existing Owner-only self-approval exception. The transaction records an approved request, exact before/after effective account access and individual grant details, audit and target-only in-app notification.

Additional grants remain separate from the role template and the account's existing base snapshot. They remain effective until removed, including after later template approvals. Removing an additional grant retains any grant supplied by the base. Existing legacy page overrides are preserved; an explicit new Owner additional page grant can allow that page, and removing it restores the previous base/override result. This slice adds grants, not new deny overrides. Protected administration operations still require the appropriate ERP identity and authority; only Owner may manage individual grants in this implementation.

Existing accounts excluded from template approvals retain their base snapshots. Template approval previews include the selected accounts' additional grants and legacy overrides. Individual changes increment account versions so an older individual edit or template approval cannot overwrite newer access. Actual authority is checked on the server/database for every command. Existing Admin scope checks now include the target's additional permissions. Approval/lockout notification routing also includes delegated individual action authority.

The Owner has created a real Admin account. Development did not reset, recreate, disable, change credentials or assign permissions to either real account. No external message, paid service or Production deployment occurred.

## Verification
- Transaction-only pgTAP: 120/120 passed across five files, including 24 new checks for anonymous/Admin/employee denial, reason validation, no wildcard grant, no extra Owner target, correct effective union, base/template/peer preservation, stale edits, explicit revocation and audit/notification behavior. Fixtures and audit writes roll back.
- TypeScript, ESLint, five application policy tests and optimized Next.js build passed.
- Supabase local security advisors: no issues found at warn/error level. Database lint: no schema errors; only the two preexisting unused-parameter warnings on the revoked create_position compatibility stub.
- Browser: authenticated Owner sees Individual permissions and the real Admin in its selector; loading returns the real base permissions with unchecked additional grants; page/action controls and required reason/Approve & save are accessible. Narrow-panel layout visually inspected. No real permission save was submitted as a test.
- New RPCs restrict execution grants and check a live Owner session internally. Pure helper/snapshot functions remain non-callable to API clients. No new exposed table was added; existing profile RLS and mutation restrictions remain in force. Stale asynchronous UI loads are discarded when the dialog is closed/reopened.

## Remaining scope
Owner can now choose the actual Admin's additional grants. End-to-end user acceptance of that real save is still pending. Delegated-Admin individual adjustments and new deny overrides are separate follow-ups; prior confirmed rules remain recorded. Existing future-operation checkboxes do not implement those operations. Device approval, handover, full account editing, backup/email, business modules and Production remain pending.

Reference checked for function execution/search-path guidance: https://supabase.com/docs/guides/database/functions. The changelog markdown endpoint could not be fetched by the browsing tool; no dependency or API version was changed.
