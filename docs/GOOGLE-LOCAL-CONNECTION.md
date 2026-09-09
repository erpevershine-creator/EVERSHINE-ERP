# Google Drive local connection

This utility connects the Windows backup worker, not ERP user login. It is fixed to the approved erp.evershine@gmail.com account and the new Google project. No backup uploads or cloud deletions are enabled.

The Desktop client EVERSHINE Local Backup Worker has already been created and stored under Windows CurrentUser DPAPI. Never print or copy its secret into chat/source. Reuse it.

From C:/Users/DELL/Desktop/EVERSHINE-ERP:

- Run node scripts/google-drive-connect.mjs connect to start a loopback callback. Open the URL in .runtime/google-drive-authorization.json in a supported system browser. The request expires after five minutes. Google may ask the Owner to sign in and grant the displayed app-file access.
- Run node scripts/google-drive-connect.mjs status after successful consent. This refreshes access and checks the Google identity; only success verifies the real connection. It prints the account address, never the token.
- import-browser opens a temporary masked local form for initial client configuration. import <path-to-downloaded-json> is the file-based alternative. Both validate the fixed project and Desktop client type, protect storage with DPAPI and refuse silent replacement with a different client. The helper is not exposed on the LAN or added to the ERP web routes.

Client and connection secrets are separate files in %LOCALAPPDATA%/EVERSHINE-ERP. No Google password is stored. Reconnecting on another computer requires a fresh Google authorization; storing Google credentials is not the backup decryption-key recovery design.

Current state: client configuration saved; live Drive consent/refresh not completed. The Google project is in Testing with a publication-branding warning. Seven-day Testing refresh tokens do not support durable unattended daily backup; resolve that before enabling delivery. No public homepage/policy domain has been approved yet.

References: https://developers.google.com/identity/protocols/oauth2/native-app and https://developers.google.com/identity/protocols/oauth2 .
