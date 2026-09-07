# Confirmed Owner decisions

Source: explicit Owner replies in current task, summarized through 2026-09-06. Only entries marked confirmed are requirements. No module implementation acceptance is implied.

| ID | Confirmed requirement |
|---|---|
| D01 | One company per ERP installation. Future company branding may change; independent company deployments/accounts/data must remain separate. |
| D02 | One Head Office and two warehouses: Operations Warehouse and Reserve Warehouse. |
| D03 | Operations Warehouse handles daily operations. Reserve Warehouse replenishes it. Purchases may enter either warehouse. Transfers allowed in both directions. |
| D04 | Transfer dispatch and receipt require separate confirmations. Dispatch decreases source stock and increases In Transit. Receipt decreases In Transit and increases destination stock. |
| D05 | Receive actual quantity only. Example: dispatch 100, receive 98, leave 2 In Transit pending reasoned investigation/approval. Never silently write off differences. |
| D06 | Exactly one Owner Main Account. Admin accounts require Owner approval. Owner individually assigns each Admin's control permissions. |
| D07 | Account Management controls actions/approval permissions. Only Owner may self-approve. Admins cannot grant beyond their delegated authority. |
| D08 | Each employee has an individual account. No shared accounts. Only Owner or an explicitly authorized Admin may create accounts; no self-registration. |
| D09 | Handover transfers Position/responsibilities to a new individual account. Old account becomes inactive; old sessions close. Preserve original actor identity in Audit/Approval history. Never rename/reuse an old account as the new employee. |
| D10 | Handover approval is restricted to Owner or Admin explicitly authorized for Handover. |
| D11 | List unfinished work and Pending Approval responsibilities. Transfer only items explicitly selected by the handover approver. |
| D12 | Before a successor is available, an authorized Admin may act temporarily using their own account. Owner or authorized Handover Admin may appoint within delegated authority. Owner-only self-approval rule still applies. |
| D13 | Temporary assignment has start/end dates. Revoke temporary permissions at expiry or completed successor handover, whichever comes first; retain the Admin's original permissions. |
| D14 | If no successor at expiry, continued temporary authority requires Owner/authorized Admin approval of an extension with a reason. No automatic extension. |
| D15 | Build a clean independent local ERP foundation using V1/V2.1 as references. Review reused code; do not assume old code is correct. Local development must not require Wi-Fi/hotspot switching; app/Auth/database should run locally. |
| D16 | Phase 0 requirements draft first. Owner confirms design and accepts testing module by module before progression. Hosted verification and explicit final confirmation precede Production. |
| D17 | Maintain one concise active AI history; older histories cease being active planning sources and remain reference-only. |

| D18 | Login identifier must be assigned by the company; employees cannot choose their own identifier. Exact format (username, employee ID or assigned email) remains to be confirmed. |

| D19 | Email notifications and automatic reports must be controlled within the selected provider free allowance. No automatic paid upgrade or paid overage. Provider and quota-exhaustion behavior remain unconfirmed. |

| D20 | ERP must have a professional in-app Notification Center controlled by Owner and approved Admins within individually delegated authority. Specific controls, visibility and delivery rules remain to be confirmed. Queued email delivery after quota renewal is subsequently approved in D22. |

| D21 | Each user may view only notifications relevant to their responsibilities and within their permissions. Admin status alone does not imply access to all notifications. |

| D22 | When the free email allowance is exhausted, queue unsent emails until allowance renews. Relevant notifications remain available in the ERP Notification Center under D21 access restrictions. |

| D23 | Login uses a real Gmail address assigned/approved by the company plus a separate ERP password. Gmail password is never collected or used. This confirms the earlier conditional login preference; it does not authorize Google sign-in or Gmail sending integration. |

| D24 | Only Owner or explicitly authorized Admins may establish or change ERP accounts/login identifiers and passwords within delegated authority. Employees cannot self-change/reset them. The proposed mandatory employee password change at first login is rejected. This controls password setting/reset; it does not authorize retrieval/display of stored plaintext passwords. Existing Owner-only self-approval and unique-account rules remain. |

| D25 | Only Owner may change/reset the Owner Main Account password. No Admin may change/reset it, regardless of other delegated permissions. Exceptional Owner account recovery remains unconfirmed. |
| D26 | If Owner forgets the ERP password, Owner may self-recover through a time-limited one-use reset link sent only to the preverified Owner Gmail address. This is Owner self-recovery, not Admin reset. Loss of access to the preverified Owner Gmail remains separately unconfirmed. |
| D27 | If Owner also loses access to the preverified Owner Gmail, recovery is allowed only through an offline emergency recovery code created in advance and kept only by Owner. Without that code, ERP must not allow automatic Owner password recovery. |
| D28 | Owner emergency recovery code is generated during initial Owner setup, shown one time only, never stored in readable form, and replaced only when Owner intentionally creates a new recovery code. Creating a new code invalidates the old code. |
| D29 | After Owner recovery, existing Owner login session records must be preserved as History/Audit records rather than deleted. Whether those existing sessions remain active or are forced to log out remains unconfirmed. |
| D30 | After successful Owner recovery, preserve session records as History/Audit and automatically log out all existing Owner active sessions on other devices. |
| D31 | Normal ERP login allows each user to have at most two active device sessions at a time, from phone or laptop/desktop devices. Third-device handling remains unconfirmed. |
| D32 | When a user already has two active devices and logs in on a third device, ERP must request approval first. If approved, ERP automatically logs out the oldest active session and preserves the logout in History/Audit. Who may approve third-device login remains unconfirmed. |
| D33 | Third-device login requests may be approved by Owner or by Admins explicitly authorized for Account Management. This approval authority applies to device-login requests and does not override Owner-only password recovery rules. |
| D34 | Every third-device login approval requires a reason note from the approver. ERP must save the note in History/Audit together with device, user, time, approval actor, and old session logout record. |
| D35 | If a third-device login request is rejected or not approved within the configured time limit, ERP blocks that login attempt and records the rejection/timeout in History/Audit. The exact approval time limit remains unconfirmed. |
| D36 | Third-device login approval requests expire automatically after a maximum of 1 day if not approved. Expired requests follow D35: login remains blocked and the expiry is recorded in History/Audit. |
| D37 | Normal logged-in user sessions may remain idle for a maximum of 7 days. Idle-session report and approval behavior is required in principle, but the exact action after 7 days remains unconfirmed. |
| D38 | After a normal user session is idle for 7 days, ERP automatically logs out that session, creates an idle-session report, and requires Owner or Account Management Admin approval before that device can log in again. |
| D39 | If a user repeatedly enters the wrong ERP password, ERP temporarily locks the login/account and records failed attempts in History/Audit. Wrong-attempt count and lock duration remain unconfirmed. |
| D40 | ERP temporarily locks the login/account after 5 wrong ERP password attempts. Lock duration remains unconfirmed. |
| D41 | After 5 wrong ERP password attempts, the login/account remains locked until Owner/Admin approval unlocks it. Which Admins may approve unlock remains unconfirmed. |
| D42 | Wrong-password account unlock approval is limited to Owner and Admins explicitly authorized for Account Management. |
| D43 | Every wrong-password account unlock approval requires an approver reason note and must be saved in History/Audit with user, time, failed-attempt count, and approval actor. |
| D44 | When a wrong-password lock is approved for unlock, ERP immediately resets that user's failed-attempt count back to zero. The underlying failed-attempt history remains preserved in History/Audit. |
| D45 | ERP passwords must be at least 8 characters and include at least one uppercase letter and at least one number. A symbol is not required by the confirmed minimum rule. |
| D46 | When an ERP password is changed or reset, reusing a previously used ERP password is allowed as long as it satisfies the confirmed minimum password strength rule. ERP must not store readable password history. |
| D47 | ERP passwords expire after 6 months. When expiry is reached, ERP shows notifications and Owner or approved Admins must change/reset the password according to their delegated authority. Employees still cannot self-change/reset passwords under D24. |
| D48 | When a user's ERP password reaches the 6-month expiry, ERP blocks that user's login until Owner or an approved Admin changes/resets the password according to delegated authority. |
| D49 | ERP starts showing password-expiry reminder notifications to Owner/approved Admins 14 days before the 6-month password expiry date. Reminder frequency remains unconfirmed. |
| D50 | After password-expiry reminders start 14 days before expiry, ERP shows the reminder daily until Owner or an approved Admin changes/resets the password. |
| D51 | Owner or Account Management Admin may manually disable an employee account immediately while preserving all History/Audit records. Active-session behavior after disable remains unconfirmed. |
| D52 | When an employee account is manually disabled, ERP automatically logs out all active sessions for that account and blocks future login until the account is re-enabled. |
| D53 | Employee account re-enable requires Owner or Account Management Admin approval, and the approver reason note must be saved in History/Audit. |
| D54 | Employee account History/Audit retention is limited to a maximum of 3 years rather than forever. Exact handling after 3 years remains unconfirmed. |
| D55 | After the 3-year employee account History/Audit retention period ends, ERP downloads/exports the old records and then permanently deletes them from the active system. Export format and deletion approval authority remain unconfirmed. |
| D56 | The 3-year employee account History/Audit export and permanent deletion may be approved by Owner and approved Admins within delegated authority. Export format and reason/audit details remain unconfirmed. |
| D57 | Every 3-year History/Audit export and permanent deletion requires an approver reason note, and ERP must save a deletion certificate separately. Export format remains unconfirmed. |
| D58 | ERP must export 3-year History/Audit records in both PDF and Excel formats before permanent deletion. Storage/location rules for exported files remain unconfirmed. |
| D59 | After ERP exports 3-year History/Audit records as PDF and Excel, ERP keeps only a data-free internal record of the export/deletion event and deletion certificate. The exported data files themselves are not retained inside ERP. Exact metadata fields remain unconfirmed. |
| D60 | The data-free export/deletion record must save metadata including export date/time, approved by, reason note, record period, file names, and deletion certificate number. |
| D61 | ERP permissions are assigned through Positions first, then may be individually adjusted by Owner/authorized Admin for each user when needed. |
| D62 | Position permission templates may be created, edited, or deactivated by Owner and approved Admins within delegated authority. Reason/audit requirements remain unconfirmed. |
| D63 | Every Position permission template create/edit/deactivate action requires a reason note and must be saved in History/Audit with before/after permission details. |
| D64 | When a Position permission template edit requires approval, the approval request must include the Position template changes and the specific accounts that will be updated. If approved, ERP applies the template change only to the accounts included in that approval request. |
| D65 | If a Position permission template is edited but some accounts under that Position are not included in the approval request, those excluded accounts keep their existing permissions unchanged. |
| D66 | If a user has individual permission adjustments, later Position template updates preserve those individual adjustments unless the approval request explicitly changes them. |
| D67 | Individual user permission adjustments may be added, removed, or changed by Owner and approved Admins within delegated authority. Reason/audit requirements remain unconfirmed. |
| D68 | Every individual user permission adjustment add/remove/change action requires a reason note and must be saved in History/Audit with before/after permission details. |
| D69 | ERP does not support temporary individual permission adjustments. Individual permission adjustments do not use start/end dates and remain in effect until changed by another authorized, audited permission adjustment. |
| D70 | ERP permission controls are separated by module and action, including view, create, edit, delete, approve, export, and report access. Exact delete/void behavior remains unconfirmed. |
| D71 | Business records should avoid true delete. ERP uses void/cancel/inactive with reason note and History/Audit instead. Permanent deletion is allowed only for approved 3-year retention deletion workflows. Approval rules for void/cancel/inactive remain unconfirmed. |
| D72 | Void/cancel/inactive actions on business records require approval by Owner or module-authorized Admin before they take effect. Request/audit details remain unconfirmed. |
| D73 | Every business record void/cancel/inactive request and approval must save reason notes and before/after details in History/Audit. |
| D74 | ERP allows restoring a voided/cancelled/inactive business record only after Owner or module-authorized Admin approval with reason note and History/Audit. |
| D75 | The ERP plan must be designed to fit within free-plan usage as much as possible. Avoid paid upgrades, paid add-ons, and paid overage unless the Owner explicitly approves later. Exact provider limits must be verified before implementation because free-plan quotas can change. |
| D76 | The free-plan runtime constraint applies to Vercel hosting, Supabase database/auth/storage, and Gmail/email sending. AI/Codex development usage is not part of the ERP runtime free-plan scope, but development should still be managed economically. |
| D77 | When a free-plan limit is close to being reached, ERP automatically pauses non-critical features such as email sending, scheduled reports, and large exports while keeping core login and business entry usable. The warning threshold remains unconfirmed. |
| D78 | ERP treats a free-plan limit as close to reached at 80% usage and starts the configured warnings/pauses at that threshold. Exact pause categories remain unconfirmed. |
| D79 | At 80% free-plan usage, ERP pauses all outgoing email sending immediately while keeping in-app notifications active. |
| D80 | Export/download actions that are explicitly allowed for a user's Position may be performed without additional approval. Export/download access remains controlled by Position/module/action permissions and individual adjustments. Scheduled automatic report behavior at 80% free-plan usage remains unconfirmed. |
| D81 | At 80% free-plan usage, ERP pauses scheduled automatic reports while still allowing position-authorized manual export/download without extra approval. Large export controls remain unconfirmed. |
| D82 | At 80% free-plan usage, ERP does not block position-authorized export/download. ERP shows a warning only, and users with the relevant Position/module/action permission may continue exporting/downloading. |
| D83 | Build the professional webapp foundation first, then use Localhost 3000 to test, edit, and update workflows, processes, and functions based on the V2.1 UAT-agreed points. Foundation confirmation comes before business workflow implementation; Production still requires separate final confirmation. |
| D84 | The professional foundation must include these core parts before business modules: Login/Auth, Account Management, Position/Permission Control, Approval Center, Audit/History, Notification Center, Settings, Backup/Restore, and Free-plan Usage Monitor. This scope is accepted as the best professional foundation approach. |
| D85 | Create the clean professional project as an independent folder at C:/Users/DELL/Desktop/EVERSHINE-ERP. Use V1/V2.1 as reference only, and copy old code only after review/approval so old errors, extra code, unrelated parts, or unclear behavior are not automatically carried forward. |
| D86 | First implementation milestone creates only the professional foundation skeleton on Localhost 3000. Supplier, Purchase, Sales, Inventory, and other business data entry modules must wait until the Owner confirms the foundation screens and workflow. |
| D87 | Foundation skeleton uses a professional ERP layout with left sidebar navigation, top header, dashboard workspace, and separate pages for Login/Auth, Account Management, Positions/Permissions, Approval Center, Audit/History, Notification Center, Settings, Backup/Restore, and Usage Monitor. |
| D88 | UI must be easy to use, clear, professional, and not look like an AI-generated app. Use international app font sizes, avoid repeated titles/headers, avoid oversized or overly bold headers, avoid excessive spacing that wastes screen area, avoid unnecessary messages/warnings, keep loading pages fast/minimal, and include Light, Dark, and System theme modes. |
| D89 | Foundation UI uses compact professional ERP density by default: smaller standard headers, table-first workflows, minimal explanatory text, and layouts that do not waste screen space. |
| D90 | Every table/list page includes standard controls for search, filter, sort, column visibility, and export/download when the user's Position permission allows it. |
| D91 | Data-entry forms use a standard Draft -> Submit for Approval -> Approved/Rejected workflow when the action requires approval. |
| D92 | For actions that do not require approval, authorized users may save/post directly, and ERP records History/Audit automatically. |
| D93 | If an approval request is rejected, ERP returns it to Draft with the rejection reason so the requester can edit and resubmit. |
| D94 | Already approved business records may be revised only by Owner and approved Admins using a Revise action. Exact revision history/change-request behavior remains unconfirmed. |
| D95 | When an approved business record is revised, ERP preserves the original approved version and saves the revised version as a new version with reason note and before/after History/Audit. |
| D96 | Revised versions created by Owner or approved Admins through the Revise action do not require a separate additional approval before becoming the current active version. The Revise action itself still requires reason note, version history, and before/after History/Audit under D95. |
| D97 | Normal non-Owner users cannot directly Revise approved business records. When they need a correction, they must submit a change request to Owner/approved Admin. Required change-request details remain unconfirmed. |
| D98 | A normal user's change request must include target record, requested change details, and reason note. Attachment/photo evidence is not required by default. |
| D99 | Owner/approved Admin may approve a normal user's change request and apply the revision directly, or reject it with a rejection reason. |
| D100 | Change request notifications are visible only to the requester, Owner, and approved Admins who have permission for that module/action. |
| D101 | Approval Center shows separate tabs/statuses for Pending, Approved, Rejected, Revised, Cancelled, and Expired requests. |
| D102 | Approval Center includes search/filter/sort by module, requester, approver, date range, status, and priority. Superseded by D103 for priority: priority is not used. |
| D103 | Approval request priority levels are not used. Approval Center should not use Low/Normal/High/Urgent priority levels or priority-based filter/sort. |
| D104 | Without priority levels, Approval Center sorts Pending requests by oldest request first by default. |
| D105 | If an approval request has a deadline, ERP sends message notifications to the relevant users every 3 hours before the deadline. Auto-expiry behavior after deadline remains unconfirmed. |
| D106 | When an approval request reaches its deadline without approval or rejection, ERP automatically marks it as Expired and preserves the record in History/Audit. |
| D107 | If an approval request expires, only Owner and approved Admins may copy it back to a new Draft and resubmit with a new reason note. Normal requesters cannot directly resubmit expired requests unless they have that approved authority. |
| D108 | Every expired-request copy/resubmit action by Owner or approved Admin requires a reason note and preserves a link back to the original expired request in History/Audit. |
| D109 | Approval Center does not allow bulk approve/reject. Each approval request must be reviewed and approved/rejected one by one. |
| D110 | Approval Center provides a compact approval detail view on one screen showing current data, requested changes, reason notes, requester history, and audit timeline. |
| D111 | Approval Center shows approve/reject/revise action buttons only when the logged-in user has permission for that specific module/action. |
| D112 | Before starting coding implementation, Codex must tell the Owner that the base is sufficient for coding and request explicit confirmation, because coding uses AI model time/credit. |

| D113 | Owner explicitly authorized coding Milestone 1 local foundation skeleton on 2026-09-06 with “စပါ”, then “Continue Task”. Screen/workflow acceptance and Production approval remain separate. |

## Latest confirmed refinements

| ID | Owner-confirmed decision |
| --- | --- |
| D114 | Owner delegated the remaining local foundation checks to Codex and requested that sidebar On/Off remain accessible when scrolling. This authorizes M1 refinements, not live backend or Production acceptance. |
| D115 | Account creation must include Profile Photo, Employee Name, Position, Department, ERP Role, company-assigned @gmail.com Username, Password, Confirm Password and Contact. Existing Owner/Admin creation authority and the confirmed password policy still apply. |
| D116 | Positions & Permissions must explicitly control which pages are visible/hidden. Page visibility is separate from action authority; apply the already-confirmed template approval with exact included accounts and preserved excluded accounts/individual overrides. |
| D117 | After reviewing the Milestone 1 local UI, Owner instructed Codex to continue and delegated the remaining checks. This authorizes Milestone 2's isolated local Supabase Auth/database/storage technical foundation and verification. It does not provision a real Owner/user, accept every future workflow, or authorize Production. |
| D118 | Owner confirmed a localhost-only, one-time initial Owner setup form. The Owner privately enters Profile Photo, Employee Name, Department, company-approved Gmail Username, ERP Password/confirmation and Contact; Position and ERP Role are fixed as Owner. The trusted server creates exactly one Auth user/profile, displays the emergency recovery code once, records the setup audit event and permanently closes the setup route. Password and recovery code must not be sent through AI chat or committed to files. |

| D119 | Owner confirmed self-recovery using the previously issued Emergency Recovery Code to set a new ERP password when the Owner account is locked after failed logins or its password has expired. This is an Owner-only exception, not Admin reset authority. Existing D28 code replacement and D29-D30 session history/logout rules still apply. This confirms the rule; implementation and verification remain pending. |

| D120 | Owner confirmed Myanmar Kyat (MMK) as the ERP base currency. Foreign-currency support, exchange-rate rules, decimal precision and rounding are not determined by this decision. |

| D121 | Owner confirmed Myanmar Standard Time, Asia/Yangon (UTC+06:30), for ERP dates, times, reports and approval deadlines. This governs business-time interpretation and display; implementation and runtime verification remain pending. |

## Proposed phase sequence, not individually confirmed
Phase sequence: foundation (Login, accounts, permissions, audit, approval, settings, backup) → Supplier/Product → Purchase/receipt → promotions/customer agreements → Orders/delivery → invoices/consignment surveys → returns/exchanges/damage → finance/statements → dashboards/reports → release validation. Detailed rules, entities, screens and accounting behavior still require confirmation.

## Historical conditional preference — resolved for login by D23
Owner prefers company-assigned Gmail-address login plus ERP password IF free email notifications/automatic report sending meet needs; otherwise company-assigned @evershine.com-style identifier plus password. The identifier choice is now confirmed by D23; outbound provider/integration remains unconfirmed. Login identifiers, recipient emails, outbound sender and Google sign-in are separate concerns. Gmail password is never the ERP password. Daily delivery volume, schedule and recipient scope remain unknown; no email sending/integration is authorized by this requirements discussion.
