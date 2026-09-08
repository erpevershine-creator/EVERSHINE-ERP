# EVERSHINE ERP

Start at AI_PROJECT_HISTORY/ACTIVE/START_HERE.md, then STATE.md and relevant DECISIONS.md. This is the independent clean project; old V1/V2.1 are references only.

- Current phase: M2.2 live local accounts/permissions/recovery slice. Six administration screens use real data, including local encrypted backup/isolated restore checks; remaining workspace/settings/usage screens are samples. Daily local scheduling/catch-up is implemented; live restore, retention pruning and offsite backup are not implemented. Read STATE.md for exact boundaries.
- Preserve the real Owner, Auth records and volumes. Do not run a database reset or repeat Owner setup. Use transaction-only test fixtures and rollback. Never copy credentials into history/source or browser bundles.
- Run npm run typecheck, npm run lint, npm test, npm run build and npm run db:test for relevant auth/SQL changes. db:test uses the dedicated evershine-local-loopback Docker network. Existing sample M1 browser tests are not real Auth acceptance.
- Keep localhost-only and Production fail-closed guards. No production deployment, paid resources, external messages or new business rules without their applicable user authorization.
- Ask one unresolved business question at a time. Preserve settled decisions. No subagents unless Owner asks.
- Report evidence and remaining work. Do not claim complete ERP, perfect security or full end-to-end verification from UI smoke tests.
