# Android SMS operational checklist (R14 offline readiness)

Updated: 2026-11-26  
Scope: local discovery and offline verification only.  
Do not paste device tokens, bypass secrets, allowlisted numbers, or message bodies into this file.

---

## Discovery summary

| Item | Discovered location / finding |
| --- | --- |
| Android bridge **source / APK** | **Not present** in this workspace. No `android/`, Gradle, or APK tree was found. |
| Documented bridge branch | `feature/lvpt-sms-bridge-prototype` (see `SMS-STAGING-SETUP.md`) |
| Documented app names | LVPT SMS Test / LVPT SMS bridge (Android v0.4 local JSON export; v0.5 HTTPS staging sync) |
| Package owner id in hub jobs | `com.lvpt.smsbridge` (`app/api/sync/operating-picture/route.ts`) |
| Server bridge helpers | `lib/sms-bridge.mjs` (`validateBridgeStatus`, `contactHash`, `matchThreads`, `stableIngestHost`) |
| Staging ingest + encryption | `app/api/sms/staging/ingest/route.ts`, `app/api/sms/staging/_lib.ts` |
| Schema (ciphertext only) | `sql/sms-staging.sql` → `lvpt_sms_staging` |
| Metadata scan health | `lib/sms-scan-health.mjs` (`classifySmsScan`, `classifyBridgeHeartbeat`) |
| Upload vs heartbeat probes | `lib/source-reliability.mjs` (`classifyStoredCollection`) |
| Approved-number configuration | Env `LVPT_SMS_STAGING_ALLOWED_NUMBERS` (comma-separated 10-digit US numbers). Values are **not** committed and must not be printed. |
| Heartbeat reader on this preview | **None.** `operating-picture` always passes `heartbeat: null`. Stored rows are never treated as a device heartbeat. |
| Isolated heartbeat contract | `validateBridgeStatus` + `classifyBridgeHeartbeat` — require a real `last_success_at` with empty `last_failure` for LIVE; unresolved failure keeps prior success evidence but is not healthy/current; do not invent timestamps. |

Phase baselines through `phase-07m` cover Calendar/sync work; they do **not** contain a live Android `last_success_at` proof. Historical SMS staging metadata is not current collection evidence.

---

## Verified server behaviors (offline)

1. **Approved contacts only** — ingest rejects numbers outside `allowedNumbers()` (`invalid_or_unapproved_messages`).
2. **Encrypted storage** — `encryptBatch` writes AES-256-GCM `body_ciphertext` + nonce; phones are stored only as HMAC `contact_hash`. Table comment: no plaintext SMS or phone numbers.
3. **Stable provider IDs** — Android `sms_id` (positive bigint) + `device_id` (UUID) + `tenant_id` (`lvpt-owner-pilot`).
4. **Duplicate prevention** — request-level duplicate `sms_id` rejected; PostgREST `on_conflict=tenant_id,device_id,sms_id` with `ignore-duplicates`.
5. **Historical vs current** — `received_at` / metadata scans report stored import freshness. They do **not** certify the handset is collecting. `classifyBridgeHeartbeat(...).historicalImpliesSync` is always `false`.
6. **Collector failures** — bridge status may carry `last_failure` (string only; **no failure timestamp**). Missing `last_success_at` stays `NOT VERIFIED`. A nonempty `last_failure` beside a prior `last_success_at` is **ordering-uncertain**: `classifyBridgeHeartbeat` preserves `priorLastSuccessAt` / `lastSuccessAt` as execution evidence but sets `verified=false`, `fresh=false`, `status=NOT VERIFIED`, and `heartbeat=null`. It does **not** assume recovery or report LIVE.
7. **Unmatched review** — `matchThreads` marks non-exact contact-hash matches as `unmatched` / `ambiguous` for review (`review: true`).
8. **Heartbeat semantics** — a **current healthy** heartbeat requires validated status with observable `last_success_at` and an empty `last_failure`. Missing heartbeat is explicitly `NOT VERIFIED`. Unresolved failure with prior success remains not healthy/current until the owner clears failure evidence or a later contract supplies ordered timestamps.

Tests under `tests/sms-scan-health.test.mjs` and `tests/source-reliability.test.mjs` use synthetic fixtures only. They do not call ingest, open a handset, or load unapproved contacts.

---

## Exact existing bridge instructions (from repo docs)

Source: `SMS-STAGING-SETUP.md` § “Android v0.5 steps (after staging is ready)”.

**Prerequisite (owner):** Preview env vars for SMS staging must already be configured on the Vercel project for the SMS intelligence preview branch. Do not commit secrets. Generate tokens locally per that document’s `node -e` snippet if rotating credentials — never paste results into git.

1. Download the successful APK artifact from the feature branch GitHub Actions build. Each private CI debug APK is signed with a fresh debug key; uninstall an older test build before installing. Exported SMS remains in Google Messages after uninstall, but the app's approved-contact list must be re-entered.
2. Re-add only authorized business contacts and all their aliases, then tap **Start monitoring**. Android READ_SMS permission is required.
3. Enter the **preview HTTPS host**, the unique **device sync token** (not its SHA256), and optional Vercel preview bypass token.
4. Check the explicit authorization checkbox and tap **Enable staging auto-sync**.
5. Android sends up to 50 approved SMS per HTTPS request and up to three batches per immediate background job; repeated runs progress through history. The cursor advances only when the server acknowledges each batch. Re-sending the same Android SMS ID is idempotent.
6. Background job timing is best effort; Android may delay it for battery/network constraints. Tap **Sync now** to test the connection and progress.
7. Open the staging review page `/sms-review/index.html` in the **same preview deployment**. Enter the device token and optional bypass token once to retrieve **redacted findings**, not raw SMS.

Older local-only path (v0.4): `SMS-REVIEW-README.md` describes choosing an owner-exported JSON file from “LVPT SMS Test Android v0.4” in the browser File API — not HTTPS ingest.

---

## Discovery limits (do not invent)

- This workspace does **not** contain the Android project, Gradle commands, `adb` install scripts, or CI workflow that builds the APK.
- No local command was discovered that prints or reads live `last_success_at` from a handset.
- Do not invent `adb`, `./gradlew`, or package-manager commands. Use the GitHub Actions APK artifact and in-app UI steps above when the owner runs the bridge.
- Production ingest host `lvpt-event-command-center-2026.vercel.app` is explicitly disabled by `stableIngestHost` (`production_ingest_disabled`).
- Live collection, device-token entry, allowlist authorization, and heartbeat persistence migrations remain **owner actions** (R25).

---

## Owner evidence fields (prepare for R25 — do not fabricate)

| Evidence field | How to obtain | Pass criteria |
| --- | --- | --- |
| Approved handset / bridge installed | Owner installs APK from documented CI artifact | App opens; monitoring can start |
| Bridge status `last_success_at` | Read from the bridge status UI / validated status payload after **Sync now** | ISO timestamp from that run; `last_failure` empty; classifier `classifyBridgeHeartbeat` → verified + LIVE. If `last_failure` is nonempty, prior success is preserved but status stays NOT VERIFIED. |
| Controlled approved-message ingest | Owner-approved contact only | Staging accept with encrypted row; no plaintext in DB |
| Stable identity | `device_id` + `sms_id` | Same message replay does not create a second row |
| Duplicate prevention | Replay same batch | `ignore-duplicates` / idempotent accept |
| Allowlist scope | Confirm only approved aliases (do not list numbers here) | Unapproved numbers rejected |
| Encryption | Staging row shape | `body_ciphertext` + nonce; no phone column |
| Displayed freshness | Hub Source Health / operating-picture | Heartbeat separate from stored row count; missing heartbeat stays not verified |

**Offline result (2026-11-26):** code contracts and docs verified. **Ops status: UNVERIFIED** — no current handset `last_success_at` was read in this workspace.
