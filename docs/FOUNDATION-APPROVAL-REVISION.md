# Approval revision evidence — 2026-09-10 candidate

Foundation remains OPEN. This candidate has not been applied to the Owner database.

Rejected permission-template requests remain immutable as rejected decisions. The decision transaction creates a linked Draft carrying the original review snapshot and rejection reason. The original requester can edit page visibility, action permissions, selected affected accounts and the reason with an optimistic version check, then submit the linked Draft again. The revision rebuilds its account snapshots and records a new audit event without overwriting the rejected request or its decision audit.

An expired permission-template request can be copied only by Owner or an authorized Positions & Permissions Admin. The copy requires a new reason, links to the expired source and remains Draft until reviewed and submitted. Stale versions, missing snapshots, invalid actions, out-of-scope access and normal-employee copy attempts are rejected by the database. Expired device-login requests are not copied because an old provider session must be re-authenticated.

Approval Center exposes returned Draft details and source/rejection reason. Draft editors can revise the permission contract and retain or remove selected affected accounts. Expired authorized copies have an explicit reason form; server RPCs recheck every boundary.

Validation: `node scripts/foundation-db-check.mjs --auth` passed **348/348 SQL assertions** across eighteen rollback suites and eight isolated Auth workflows. Typecheck, ESLint, 33/33 Node tests and the optimized build passed. Evidence is [permission-request-revision-20260910.json](evidence/permission-request-revision-20260910.json), SHA-256 `6DEA794EA4A5B563E531F8F3EFBBA28F2F0D1877A5771B57E77BF27B99750DAC`.

The Approval Center still needs complete status tabs, global server-side search/filter/sort and governed full-result exports. Account editing and permanent successor handover remain separate foundation gates. No Owner data or live credentials were changed.
