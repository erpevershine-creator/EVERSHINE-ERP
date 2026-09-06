# Milestone 1 acceptance record

Owner authorized coding on 2026-09-06 with “စပါ”, then “Continue Task”. Scope: local foundation skeleton only. **Owner screen/workflow acceptance remains pending.**

| Area                     | M1 result                                                                                               | Remaining                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Workspace and navigation | Compact responsive screens                                                                              | Owner UI acceptance                                                     |
| Themes and tables        | Local light/dark/system, search/filter/sort/columns, sample CSV                                         | Per-user settings / server export authorization                         |
| Login/Auth               | Login layout; password collection disabled                                                              | Real local Auth, Owner setup/recovery, session/password/device controls |
| Accounts/Positions       | Sample lists/detail and illustrative permission matrix                                                  | Durable account control, template snapshots, handover                   |
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
