# Offsite backup setup — pending connection

Updated 2026-09-09. D141 authorizes continuing the integration with new accounts. This document records the setup sequence and technical constraints; it does not claim a connected or working offsite recovery service.

## Confirmed boundaries
- New Google identities only for this integration. Owner supplied erp.evershine@gmail.com for backup. Do not infer the intended identity from Codex connectors or browser sessions.
- Future Production uses new Supabase, GitHub and Vercel accounts/resources. Preserve local data and account identities for local review. Production data selection, account provisioning and release approval remain separate decisions.
- Google Drive and the dedicated private Telegram channel are confirmed destinations. Channel membership is Owner and approved Admins. Exact account, folder, channel and bot identities are not yet known.
- Daily 18:00 Asia/Yangon, catch-up, 7 daily / 3 monthly / 1 yearly, and indefinite manual retention remain confirmed. No paid resources have been authorized.
- No manually entered Backup Recovery Key. A recoverable system-managed key arrangement is still required: ERP approval alone cannot decrypt a backup if the only key is lost with the Windows profile.

## Setup sequence
1. Verify the supplied erp.evershine@gmail.com identity during the actual sign-in/connection. The user enters passwords, OTPs and recovery material privately in the provider's own UI, never chat. The ERP's scheduled integration needs its own OAuth setup; a Codex Drive connector alone does not supply an unattended application integration.
2. Prepare a new Google Cloud OAuth application and a private, explicitly bound backup destination. Prefer the narrow drive.file scope for app-created files. Confirm the returned Google identity and record the actual folder ID before enabling uploads; never fall back to another signed-in account or a public link.
3. Resolve and confirm system-key custody independently of this computer. Explain who can recover the key and what account compromise would expose. Do not upload a plaintext decryption key beside ciphertext, publish keys in Telegram, or claim copying backup-key.dpapi to Drive provides cross-computer recovery. Do not export the real key before that arrangement is settled.
4. Identify the dedicated Telegram channel and bot. Store tokens in a local protected secret store, not source code, URLs shown to users, logs or chat. Decide the recoverable delivery format against actual provider limits before sending real archives.
5. Implement resumable encrypted uploads with per-destination receipts, retry/backoff and exact backup identity checks. Mark an offsite copy verified only after authenticated retrieval and artifact integrity checks. Reconcile ambiguous uploads instead of blindly duplicating them. Track local/offsite retention separately so a missing or unverified remote replacement cannot authorize remote deletion.
6. Prove computer-loss recovery in an isolated environment without the source Windows profile: retrieve the offsite archive and recoverable system key, verify signatures/artifacts, restore into a compatible isolated target, and verify database/storage/application recovery. No production or live restore is involved in this test.
7. Only then enable scheduled external delivery. Later Production needs its own worker/scheduler and secret custody; the current Windows/Docker backup worker does not run as a Vercel Function. New managed Supabase resources require a reviewed migration and restore procedure, not blind replay of local cluster roles or local runtime secrets.

## Provider constraints checked on 2026-09-09
- Google documents drive.file as a narrower scope for app-created or explicitly selected files: https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- External Google OAuth apps in Testing generally receive seven-day refresh tokens when requesting Drive access. An unattended daily backup cannot rely on indefinite Testing tokens: https://developers.google.com/identity/protocols/oauth2
- Standard Telegram Bot API downloads through getFile are limited to 20 MB; document sends have separate limits. Do not treat a successful upload as proof a later automated download can recover it: https://core.telegram.org/bots/api
- Vercel describes Hobby as personal, non-commercial use. A new account does not change that hosting restriction; company ERP Production requires a compatible plan or separately selected host. No plan purchase or host substitution has been authorized: https://vercel.com/pricing

## Current state
Only this account boundary and setup sequence are prepared. Existing local backup capture/retention continues. No old account has been connected, no new account has been created by the agent, and no archive, secret or notification has been sent externally. Next step: Owner completes the open Google sign-in for erp.evershine@gmail.com. Do not inspect password fields while the user enters credentials. Then verify account identity and continue OAuth setup.

## Google setup progress — 2026-09-09
- Gmail connector profile independently returned erp.evershine@gmail.com, display name EVERSHINE ERP. No inbox content was read and no email was sent. Connector access is not the ERP's unattended OAuth credential.
- Google Cloud sign-in is active. Enabling Drive API selected/created My First Project (project peerless-sensor-508107-e0, number 822638054713) and navigated to its Drive API metrics page. Renamed the project to EVERSHINE ERP Backup; readback showed the new name. IAM principal list and OAuth support-email picker showed erp.evershine@gmail.com. No IAM grant was edited.
- Prepared unsaved Google Auth Platform form: application EVERSHINE ERP Backup; support/contact erp.evershine@gmail.com; External audience (personal Gmail cannot select Internal). No OAuth client, refresh token or application Drive access exists yet.
- Paused at Finish before checking “I agree to the Google API Services: User Data Policy.” and before Continue/Create. Browser interaction policy requires action-time confirmation for accepting a binding provider agreement. The user can review https://developers.google.com/terms/api-services-user-data-policy and confirm. Do not treat this pending approval as granted.
- Current setup URL: https://console.cloud.google.com/auth/overview/create?authuser=0&project=peerless-sensor-508107-e0 . Unsaved form may need re-entry if the tab closes. Existing project must be reused; do not create duplicates or enable free trials/billing.
- No paid plan, billing activation, archive upload, key export, Telegram configuration or Production deployment occurred. System-key custody, OAuth callback/client implementation and offsite restore proof remain pending.
