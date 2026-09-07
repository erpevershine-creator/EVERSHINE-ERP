# Milestone 1 acceptance record

Owner authorized coding on 2026-09-06 with “စပါ”, then “Continue Task”. Scope: local foundation skeleton only. **Owner screen/workflow acceptance remains pending.**

| Area                     | M1 result                                                                                               | Remaining                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Workspace and navigation | Compact responsive screens                                                                              | Owner UI acceptance                                                     |
| Themes and tables        | Local light/dark/system, search/filter/sort/columns, sample CSV                                         | Per-user settings / server export authorization                         |
| Login/Auth               | Login layout; password collection disabled                                                              | Real local Auth, Owner setup/recovery, session/password/device controls |
| Accounts/Positions       | Sample photo/profile creation and approved per-page visibility                                                  | Real Auth, durable permissions/audit, action templates, handover                   |
| Approval Center          | Sample Draft/Submit/Approve/Reject/Revise; reason, scope/self-approval restrictions, preserved versions | Transactional backend, concurrency, durable permissions, real jobs      |
| Audit/History            | Sample before/after events                                                                              | Append-protected database audit, PDF + Excel retention export/deletion  |
| Notifications            | Scoped sample lists, read state                                                                         | Durable in-app delivery, 3-hour scheduler, Gmail provider               |
| Settings                 | Confirmed rule overview and working theme selection                                                     | Authorized durable settings changes                                     |
| Backup/Restore           | Honest unconnected screen                                                                               | Confirm policy, implement and restore-test                              |
| Usage                    | Unknown provider state + 80% simulation                                                                 | Real provider measurements, jobs, plan choice                           |
| Business modules         | Not included                                                                                            | Individual design/approval/implementation                               |

No legacy business code, schema, users, passwords or data were copied. The only retained reference content is the Owner-confirmed decision log. No Vercel/Supabase/Gmail account or paid resource was provisioned.

## Verification evidence — 2026-09-06

- Strict TypeScript, ESLint and four policy tests passed.
- Production dependency audit reported zero vulnerabilities.
- Optimized Next.js build passed; the final independent-path optimized build and TypeScript also passed. Compiled production requests returned HTTP 503, confirming the local preview cannot be enabled in production mode.
- Chrome acceptance checks: all routes and no browser errors/external runtime requests; Owner approval and preserved revisions; Employee draft/submit/Admin reject/resubmit; Admin self-approval/scope denial; search/columns/CSV/notification read state all passed in the full run (5 checks).
- The sixth check detected mobile overflow caused by an absolutely positioned screen-reader label escaping a scroll container. The container was positioned and cell minimum widths added. The targeted theme/mobile/80% check then passed. Desktop light/dark, approval detail and mobile screenshots were captured and visually inspected.
- Agent-browser CLI attempts failed with local CDP/channel/timeout errors; isolated Chrome through Playwright was used for actual verification. Do not report the failed CLI attempts as passing.
- First cold route compilation is slower than warmed navigation. All runtime assets are local. This is development mode, not a production performance measurement.

Evidence images: `docs/evidence/workspace-light.png`, `workspace-dark.png`, `approval-detail.png`, `mobile-approvals.png`.

Passing local checks does not certify production security or accept business workflows. Final installation/restart evidence is in the active STATE.md.

## Owner-requested refinements — 2026-09-06

Implemented D114–D116: sticky sidebar controls on desktop/mobile, a complete sample account/photo form, and explicit position page visibility with exact-account approval snapshots. The account form validates Gmail, confirmed password rules, matching confirmation and duplicate usernames; passwords never enter storage/audit/CSV. Sample profiles and photos survive same-tab reload. Preview actors can be switched without sharing another account's scope.

The page matrix submits one request for individual review. Before approval, current visibility stays unchanged. Approval updates the template and only the included accounts, preserves existing individual overrides, and rejects changed template/account snapshots. Direct URLs, sidebar links and dashboard shortcuts check the same preview page rules. Read access does not grant action authority. Structured permission payloads cannot be revised as arbitrary text; subsequent page changes use the matrix.

Verification completed: 11 browser scenarios passed across the suite and targeted reruns; five policy tests, strict TypeScript, ESLint and final optimized build passed. Initial refinement-test failures were selector ambiguity (column controls, route announcer and combined record labels); corrected selectors target the visible dialog and exact intended controls. Browser checks cover account creation/password non-persistence/CSV, duplicate identifiers, role scope, approval application, excluded accounts, direct-route denial, migration, sticky desktop/mobile controls and the original M1 flows. Unit coverage includes stale snapshots, individual overrides and Owner immutability.

Five current screenshots are in docs/evidence: account-form-desktop.png, account-form-mobile.png, account-form-mobile-end.png, page-visibility-desktop.png and sidebar-scrolled-mobile.png. `node scripts/capture-refinements.mjs` reproduces these in isolated local Chrome, checks page errors/overflow and confirms mobile form actions remain reachable. Screenshot review caught vertical checkbox alignment; it was corrected before final capture/build.

Real login provisioning, server authorization/RLS, durable audit, backup/restore and email remain outside this milestone. This verification does not claim production security. Owner screen/workflow acceptance remains pending; no service was deployed or paid resource created.
