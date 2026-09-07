# EVERSHINE ERP — active handoff

Updated: 2026-09-07, Asia/Rangoon. Phase: **Milestone 2.1 initial Owner setup and real login boundary**. Owner authorized and confirmed the localhost-only one-time setup. This is the sole active project handoff.

1. Read this file and DECISIONS.md once. Read STATE.md for implementation evidence and OPEN_ITEMS.md for the next confirmation.
2. Read only the affected source files. Do not replay old transcripts or use legacy UAT approvals as acceptance of the clean ERP.
3. Ask one unresolved business question at a time in Burmese. Never reopen a settled decision just because an earlier row says “unconfirmed”; later confirmed decisions resolve it.
4. Current user instructions > explicit confirmed decisions > verified runtime evidence > handoff summaries > legacy references.
5. Keep history concise and free of credentials. No agent delegation unless Owner asks. Do not claim zero bugs, security certification, or fixed credit savings.

Independent project: `C:/Users/DELL/Desktop/EVERSHINE-ERP`. Original workspace `C:/Users/DELL/Desktop/KOE KOE ERP` is reference-only for this new effort. No old application code, data, keys, schema or node_modules junction is part of this foundation.

M1 remains a **sample UI/workflow review**. M2 supplies an isolated local Supabase Auth/database/storage foundation, explicit RLS/grants, server-only administration helpers and tested schema. M2.1 adds the confirmed one-time Owner form, transactional profile/recovery/audit provisioning, real Supabase sign-in/sign-out and protected workspace routes. No real Owner has been created yet because the Owner must enter private credentials and save the one-time recovery code in the local form. Other account actions, complete session/lock/recovery policies, backup and email remain later work. Production requires separate final confirmation; Vercel Hobby commercial-use restriction is unresolved.

Resume: read this handoff and STATE.md. Verify Docker, local Supabase and the existing app server before starting another process. Continue only the authorized milestone, report actual completion and remaining work, and preserve decisions D01–D118. The next concrete step is for the Owner to complete `http://localhost:3000/setup/owner` privately and save the recovery code; never request those secrets in chat. After end-to-end login verification, ask only one unresolved business question at a time, beginning with Owner lock/password-expiry recovery interaction.
