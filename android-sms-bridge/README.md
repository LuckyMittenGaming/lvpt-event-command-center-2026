# LVPT SMS Test v0.5 — Owner-only staging sync pilot

**Build branch:** `feature/lvpt-sms-bridge-prototype`. Never merge to production by accident.

This app does **not** replace Google Messages, cannot read Google Messages RCS, and does not send SMS. It can read Android-stored standard SMS with permission, group several approved numbers under one person, browse messages, export locally and **optionally** synchronize authorized SMS into a separate encrypted staging backend.

## What changed from v0.4

- Optional **Enable staging auto-sync** section, disabled until the owner explicitly enters a staging HTTPS endpoint and an authentication token and checks the authorization box.
- Credentials are encrypted with AndroidKeyStore and never compiled into the APK.
- The app sends a maximum of 50 approved SMS at a time with HTTPS and acknowledgments, tracking a cursor so it can resume/retry after network failures.
- Scheduled jobs run best-effort; outgoing SMS is typically detected by a scheduled scan, not necessarily instantly.
- **Sync now** provides a manual trigger and reports safe progress or status messages.
- **Disable staging sync** erases saved server credentials locally. It does not delete messages already staged on the server.
- Adds the Android INTERNET permission solely for the explicitly enabled staging synchronization.

## Owner test steps

1. Keep Google Messages as the default SMS app. Uninstall previous LVPT SMS Test debug APKs before installing a new build: CI debug signing changes on every run. Uninstall does not delete Android's existing messages, but app-private contact settings are lost and must be re-added.
2. Add one or more approved contacts with **+ Add monitored contact**. Use **+ Number** for additional known numbers for the same person.
3. Grant SMS permission. Tap **Start monitoring**. Browsing and local JSON export still work without any staging connection.
4. Wait until the **separate** Supabase staging project, staging server variables, allowlist and Vercel protection bypass (if required) are configured.
5. Enter the HTTPS `*.vercel.app` preview host, the unique staging sync token (not its SHA256), and any optional Vercel preview bypass token.
6. Check the opt-in authorization box and tap **Enable staging auto-sync**. This authorizes an initial historical backfill of all available standard SMS for **every** approved contact, not just the currently selected person, followed by scheduled incremental synchronization.
7. Tap **Sync approved SMS now** to observe progress. Uploads are batched and can take repeated scheduled runs. Incoming/outgoing counts on the monitoring screen are a separate diagnostic and do not equal staged message totals.
8. Once staging is configured, open the SMS Intelligence Review page on the preview deployment to view authenticated, redacted findings. This does **not** post accounting changes or tasks to live records.
9. Use **Disable staging sync** to stop network transmission and clear the locally stored credentials. Use **Stop monitoring** to stop both monitoring and staging sync.

## Current limitations

- Android operating system power and permission restrictions can delay or prevent background capture. No claim of 100% real-time delivery.
- RCS, MMS, WhatsApp and erased messages are not supported.
- The phone filters contacts locally before reading message bodies, and the staging server additionally enforces its own allowlisted numbers.
- The backend stores encrypted SMS using AES-256-GCM. Plaintext is transported over TLS and is temporarily visible to the server during encryption; this is **not** end-to-end encryption.
- Vercel staging uses separate service credentials; the phone receives only a restricted user-entered sync token, not a database key.
- Local JSON exports remain **unencrypted** and should be stored securely. Saving a file into a cloud folder may cause that provider to sync it.
- Debug APKs are not ready for public app-store distribution. Production design must address Play's restricted SMS permissions, verified user entitlements/tiers, multiple accounts/tenants, rate limits, account recovery, audits, key rotation, deleted-message handling, and consent.

## Hosting and cost

Prototype Android SMS reading has no per-message gateway fee. Server requests and storage can have hosting costs; no AI API is used in the sync and deterministic-review pipeline. Proposed 2/5/10-account tiers are only a design concept and are not currently enforced by the server.

**Do not upload plaintext test archives, credentials, or personal conversations into public GitHub branches or build artifacts.**
