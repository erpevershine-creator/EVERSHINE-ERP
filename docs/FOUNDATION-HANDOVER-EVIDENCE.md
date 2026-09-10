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

The isolated handover suite passes eight assertions: selected-item binding,
approval history, successor action on the selected device request, replay denial
and explicit revocation. The full isolated run passes 275 SQL assertions across
15 suites and eight Auth workflows. Typecheck/lint/build evidence from the same
worktree remains green. See `docs/evidence/handover-20260910.json`.

This is a candidate migration and remains unapplied to Owner data. Permission
template handover for non-device approval types still needs the same request-level
authority adapter before F2 can be closed completely.
