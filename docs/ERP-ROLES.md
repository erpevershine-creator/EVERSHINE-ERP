# Company Position and ERP Roles — D136

Verified 2026-09-08 in the independent local project, C:/Users/DELL/Desktop/EVERSHINE-ERP.

## Delivered
- Company Position is required manual text, stored separately from ERP Role. Typing a privileged title does not grant authority.
- ERP Role is selected from Owner, Admin, Sales, Delivery, Finance and Inventory. Owner remains a single existing account; new-account selection disables Owner. Only Owner appoints Admins.
- Role selection derives the permission template server-side. A composite database foreign key also rejects role/template mismatches.
- ERP Roles & Permissions replaces the visible Positions & Permissions title. Stored permission module identifiers remain stable to preserve authorization, snapshots and audit history.
- Owner and scoped approved Admins can configure additional page/action permissions across modules on a selected role. Existing Draft → Submit → individual Approve/Reject, Owner-only self-approval, authority limits, version checks and exact included-account snapshots remain enforced. Excluded accounts and existing individual page overrides remain unchanged.
- Sales/Delivery/Finance/Inventory start with no access until configured and approved. Legacy unassigned templates are retained inactive; no historical template is deleted. A migration guard refuses to guess mappings for any preexisting employee role.

## Verification
- TypeScript, ESLint and optimized Next.js build passed; application policy tests passed 5/5.
- Transaction-only pgTAP tests passed 96/96 across four files. New tests cover manual titles, role/template matching, extra-Owner denial, blank-title denial, cross-module permission grants, and delegated-Admin scope limits. All fixture writes roll back.
- Database lint reports no schema errors; it reports two unused-parameter warnings on the retained, revoked legacy create_position stub. The stub cannot create additional roles.
- Authenticated browser inspection confirmed six roles, Owner count one, the Sales page/action matrix and required account fields. Company Position is a text input; ERP Role offers the six canonical choices with Owner disabled. Modal layout was visually inspected. No account or permission change was submitted through the UI during verification.

## Runtime recovery during verification
Docker Desktop 4.89.0 failed at startup because Windows could not access stale runtime socket reparse points. After stopping Docker processes, its two socket-only runtime directories were renamed and recreated. Retained directories: Local/Docker/run.stale-erp-20260908-0444, Local/Docker/run.stale-erp-20260908-0445, Local/docker-secrets-engine.stale-erp-20260908, Local/docker-secrets-engine.stale-erp-20260908-0445 under the user's AppData directory. No database volume, Docker configuration, Auth credential or application data was deleted or reset. Docker then restarted existing containers successfully. Its restart policies also resumed the older UAT containers; their schema/data/config were not changed.

The Next.js dev server was restarted on localhost:3000. Requests made while Docker was down produced temporary connection errors; authenticated /permissions and /accounts loaded after recovery. The existing Owner remains signed in and is the only account shown.

## Boundaries and next review
Review a role, choose page/action access, submit its draft and approve before creating staff with that role. A role name does not automatically grant access. Protected administration operations still require Owner or authorized Admin; granting a checkbox to a business role does not bypass that restriction. Existing permission controls for future operations do not mean those operations are implemented.

Real employee Auth+Storage creation has not been exercised end to end by this change. Full profile editing, device approvals, handover, backup/email, future business modules and Production remain separate pending work. No paid resources, external messages or Production deployment occurred.
