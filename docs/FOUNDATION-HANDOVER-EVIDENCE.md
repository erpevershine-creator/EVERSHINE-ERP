# Scoped handover evidence — 2026-09-10 candidate

Temporary responsibility is now represented by an audited `handover_requests`
record and explicit `handover_items`. The source account, successor, reason,
start/end window and selected pending approval IDs are immutable history fields;
the original approval requester and decision actor are preserved.

An Owner or authorized Account Management user may approve the handover. The
successor can act only on selected pending requests while the window is active.
The source's authority remains the upper bound; no permanent permission or role
is changed. Handover decisions require a reason, and an approved handover can be
revoked explicitly. Expiry/rejection/revocation cannot be replayed as approval.

The isolated handover suite previously passed eleven assertions: selected-item binding,
approval history, successor action on the selected device and permission-template
requests, replay denial and explicit revocation. The full isolated run passes
278 SQL assertions across 15 suites and eight Auth workflows. Typecheck/lint/build
evidence from the same worktree remains green. See the refreshed
`docs/evidence/foundation-db-check.json`.

This is a candidate migration and remains unapplied to Owner data. Individual
permission grants remain an intentionally Owner-only atomic operation; they are
recorded with an approved request and cannot be delegated to an Admin. Pending
device and permission-template approvals now use the request-level authority
adapter.

## Re-review: F2 remains OPEN

The earlier passing fixture did not justify closing F2. The temporary authority
helper did not require an admitted successor session and relied on a source role
template instead of the source account's current permission snapshot. Candidate
20260910160000 corrects these checks. Assignment creation/decision/revocation now
also require the regular active Admin/Owner guard; null decisions are rejected.
Negative tests cover revoked successor sessions, source recovery fences, expired
assignments and unrelated requests. These tests do not establish full handover.

D09 permanent successor transfer and source inactivation are not implemented.
Delegated appointment scope, successor RLS visibility and UI integration still
need completion, alongside reject/re-draft lifecycle coverage. The temporary
assignment implementation must not be presented as complete D09-D13 acceptance.
