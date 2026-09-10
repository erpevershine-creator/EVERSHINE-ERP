# Architecture and boundaries

## Implemented in M1

- Next.js App Router / React / strict TypeScript; exact package versions and independent lockfile/dependencies.
- Shared responsive shell and table/dialog components. Local system fonts, no CDN, no service worker, no background polling of providers.
- `lib/policy.ts`: confirmed constants and pure rule helpers. `lib/review-data.ts`: synthetic request transitions, preserved revisions and sample event records.
- `ReviewProvider`: browser-tab sample store only. No server writes, database tables, public API routes or Server Actions.
- Context-specific sample request/notification visibility. Illustrative Admin has Account Management approval only; not an approved real Position template.
- CSP is not claimed implemented. Response headers include frame denial, MIME sniff protection, no-referrer, restrictive unused device features and no-store.
- No authenticated page/offline cache. M1 is served only from local Next development launcher and fails closed in production.

## Required before real data

Use an isolated new Docker/Supabase local project after screen acceptance; never import the old UAT schema or data wholesale. Browser → same-origin Next server → local Supabase during development. Keep cloud environments separate. Service keys stay server-only.

Build a server data access layer with fresh user/session checks for every request and mutation. Database RLS must enforce actual per-action/record/warehouse authority; a role label or hidden button is insufficient. Do not rely on editable user_metadata for authorization. Mutations and audit records must be transactional; use concurrency/version guards and idempotency for approvals/posting. Session invalidation must be checked against active server state. API errors should be concise, with private diagnostic detail in controlled logs.

Implement and test Owner provisioning/recovery, account lock/expiry, delegated administration, device approval, durable history, permission snapshots, handover, backup/restore and notification jobs against confirmed decisions. M1 does not enforce these against Supabase Auth. Password-expiry reminders now have an idempotent local worker; durable Production scheduling and the real 3-hour approval-deadline reminders remain pending.

Approved company names and warehouse labels are fixed reference values in M1. `Asia/Yangon` is a preview display default matching this workspace, not a newly approved ERP timezone/currency policy.

## Provider constraints checked 2026-09-06

- https://vercel.com/docs/plans/hobby — non-commercial personal use only; company ERP Production free hosting unresolved.
- https://supabase.com/docs/guides/local-development — local development through CLI/Docker; M1 has not started/mutated a Supabase stack.
- https://nextjs.org/docs/app/getting-started/installation — current App Router installation reference.
- Supabase changelog markdown fetch returned an upstream error; no Supabase feature was implemented based on unchecked changelog assumptions.

80% pause policy is a client-side simulation only. Provider monitoring/quotas cannot promise uninterrupted core service after a provider hard limit. Live usage is shown as unknown, not 0%. Unknown usage will require a fail-safe sending policy before email is connected. Gmail sending integration and real delivery volumes remain unconfirmed.

Retention approval concerns employee account History/Audit. Do not generalize it into deleting financial/business ledgers after three years. Export CSV is sample table export; it is not the approved retention PDF + Excel deletion process.
