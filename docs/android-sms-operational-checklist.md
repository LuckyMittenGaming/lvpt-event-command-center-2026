# Android SMS operational checklist — R14 readiness + R25 collection acceptance

Decision: **Hold production.** This file records offline discovery (R14) and prepares the owner-run protocol for **current** Android SMS collection acceptance (R25). It is **not** LIVE_VERIFIED and does **not** authorize Cursor to launch collection, enter device tokens, or invent a heartbeat.

T40 / R25 preparation date: 2026-11-26. No handset sync, no staging ingest mutation, no allowlist edit, and no fabricated `last_success_at` were performed for this update.

Dependencies: R14 (Android readiness / contracts). Live fill-in also needs an authorized staging preview host (R22) and owner handset access.

Do not paste device tokens, bypass secrets, allowlisted numbers, or message bodies into this file.

---

## Status words for this file

| Status | Meaning |
| --- | --- |
| PROCEDURE_READY | Owner execution steps and evidence fields are defined. Not a live pass. |
| LOCAL_SYNTHETIC_PASS | Offline fixture / classifier tests only. Never promotes to LIVE_VERIFIED. |
| PENDING_OWNER_EVIDENCE | Live evidence cells stay empty until the owner records authorized results. |
| LIVE_OBSERVED | Owner recorded a sanitized ID or timestamp from an authorized current run. |
| LIVE_VERIFIED | Reserved. Requires current collector `last_success_at`, approved ingest proof, and owner confirmation. Not used until those exist. |
| BLOCKED_OWNER | Requires approved handset, bridge run, or live evidence. |
| NOT VERIFIED | Missing or unhealthy heartbeat; default live status without current evidence. |
| UNKNOWN | Host, token, or device mapping not confirmed this session. |

Live evidence rows below remain **PENDING_OWNER_EVIDENCE**. Do not invent `last_success_at`, device IDs, or ingest outcomes from fixtures, CI, or historical staging rows.

---

## Discovery summary (R14)

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
| Owner action (code) | `SMS_HEARTBEAT_PREREQUISITE` / hub ownerAction: run the LVPT SMS bridge on the approved handset and confirm a current `last_success_at`. |

Phase baselines through `phase-07m` cover Calendar/sync work; they do **not** contain a live Android `last_success_at` proof. Historical SMS staging metadata is not current collection evidence.

---

## Verified server behaviors (offline / LOCAL_SYNTHETIC_PASS)

1. **Approved contacts only** — ingest rejects numbers outside `allowedNumbers()` (`invalid_or_unapproved_messages`).
2. **Encrypted storage** — `encryptBatch` writes AES-256-GCM `body_ciphertext` + nonce; phones are stored only as HMAC `contact_hash`. Table comment: no plaintext SMS or phone numbers.
3. **Stable provider IDs** — Android `sms_id` (positive bigint) + `device_id` (UUID) + `tenant_id` (`lvpt-owner-pilot`).
4. **Duplicate prevention** — request-level duplicate `sms_id` rejected; PostgREST `on_conflict=tenant_id,device_id,sms_id` with `ignore-duplicates`.
5. **Historical vs current** — `received_at` / metadata scans report stored import freshness. They do **not** certify the handset is collecting. `classifyBridgeHeartbeat(...).historicalImpliesSync` is always `false`.
6. **Collector failures** — bridge status may carry `last_failure` (string only; **no failure timestamp**). Missing `last_success_at` stays `NOT VERIFIED`. A nonempty `last_failure` beside a prior `last_success_at` is **ordering-uncertain**: `classifyBridgeHeartbeat` preserves `priorLastSuccessAt` / `lastSuccessAt` as execution evidence but sets `verified=false`, `fresh=false`, `status=NOT VERIFIED`, and `heartbeat=null`. It does **not** assume recovery or report LIVE.
7. **Unmatched review** — `matchThreads` marks non-exact contact-hash matches as `unmatched` / `ambiguous` for review (`review: true`).
8. **Heartbeat semantics** — a **current healthy** heartbeat requires validated status with observable `last_success_at` and an empty `last_failure`. Missing heartbeat is explicitly `NOT VERIFIED`. Unresolved failure with prior success remains not healthy/current until the owner clears failure evidence or a later contract supplies ordered timestamps.

Tests under `tests/sms-scan-health.test.mjs` and `tests/source-reliability.test.mjs` use synthetic fixtures only. They do not call ingest, open a handset, or load unapproved contacts.

Local prerequisite commands (synthetic; no provider / handset calls):

```powershell
node .\tests\sms-scan-health.test.mjs
node .\tests\source-reliability.test.mjs
```

Or the targeted package:

```powershell
powershell.exe -NoProfile -File .\scripts\verify-command-center.ps1 -Mode Targeted -TestFiles tests/sms-scan-health.test.mjs,tests/source-reliability.test.mjs
```

A green local run is **LOCAL_SYNTHETIC_PASS** only. It does **not** satisfy R25 LIVE_VERIFIED.

---

## Hard boundaries (do not cross during prep or acceptance)

1. **Do not launch collection from Cursor.** No handset sync, no ingest POST, no allowlist mutation, no device-token entry from this agent.
2. **Do not invent `last_success_at`.** Missing heartbeat stays `NOT VERIFIED`. Fixtures and CI timestamps are not live evidence.
3. **Historical imports cannot satisfy current collection acceptance.** Stored `lvpt_sms_staging` rows, old JSON exports (v0.4), prior staging reviews, and metadata scan freshness are **not** collector heartbeats. `historicalImpliesSync` is always false.
4. **Approved contacts only.** Do not add personal or unapproved numbers. Do not list allowlisted numbers in this file. **During R25 acceptance, do not submit, sync, or ingest unapproved contact data** — no live unapproved-number probe, negative ingest of personal numbers, or temporary allowlist edits for testing.
5. **No plaintext message bodies** in docs, prompts, or progress records. Record IDs, pass/fail, and ISO timestamps only.
6. **Production ingest host disabled.** `stableIngestHost` refuses `lvpt-event-command-center-2026.vercel.app` (`production_ingest_disabled`). Use the **same preview deployment** host only.
7. **No GoHighLevel SMS ingestion.** Use the approved Android/Supabase path only.
8. **No automatic customer SMS send.** Review decisions remain owner-approved.

---

## Exact existing bridge instructions (discovered; owner executes)

Source: `SMS-STAGING-SETUP.md` § “Android v0.5 steps (after staging is ready)”.

**No local `adb`, `./gradlew`, or APK build command exists in this workspace.** Do not invent them. Use the GitHub Actions APK artifact from `feature/lvpt-sms-bridge-prototype` and the in-app UI steps below.

**Prerequisite (owner):** Preview env vars for SMS staging must already be configured on the Vercel project for the SMS intelligence preview branch (`LVPT_SMS_STAGING_*` including `LVPT_SMS_STAGING_ALLOWED_NUMBERS` and token SHA-256). Do not commit secrets. Generate tokens locally per that document’s `node -e` snippet if rotating credentials — never paste results into git.

| Step | Existing owner / device action | Expected result |
| --- | --- | --- |
| 1 | Download the successful APK artifact from the feature-branch GitHub Actions build. Uninstall an older test build first if present (fresh debug key). | APK installs; prior app removed |
| 2 | Re-add **only** authorized business contacts and all their aliases; tap **Start monitoring**. Grant Android READ_SMS. | Monitoring can start; unapproved contacts not added |
| 3 | Enter the **preview HTTPS host**, the unique **device sync token** (not its SHA256), and optional Vercel preview bypass token. | Host/token accepted in-app |
| 4 | Check the explicit authorization checkbox; tap **Enable staging auto-sync**. | Auto-sync enabled for staging only |
| 5 | Allow batch upload (up to 50 approved SMS per HTTPS request; up to three batches per immediate background job). **Cursor advances only when the server acknowledges each batch** (`SMS-STAGING-SETUP.md`). Repeated **Sync now** / background runs progress through **unacknowledged** history — they do **not** re-send already-acknowledged `sms_id` values. | Server ack advances cursor; next run continues forward |
| 6 | Tap **Sync now** to test the connection and progress (background timing is best effort). | Bridge status shows a **new** `last_success_at` for this run; `last_failure` empty |
| 7 | Open `/sms-review/index.html` on the **same preview deployment**. Enter device token (+ optional bypass) once for **redacted** findings — not raw SMS. | Redacted review loads; no plaintext bodies copied here |

**Documented server contract (not an owner UI action):** `SMS-STAGING-SETUP.md` states “Re-sending the same Android SMS ID is idempotent,” and ingest implements request-level + PostgREST `on_conflict=tenant_id,device_id,sms_id` with `ignore-duplicates`. That is **LOCAL_SYNTHETIC_PASS** / offline contract evidence only. No discovered Android UI control, curl recipe, or workspace command authorizes the owner to deliberately re-POST an already-acknowledged batch.

Older local-only path (v0.4): `SMS-REVIEW-README.md` File API JSON export — **not** HTTPS current collection. v0.4 export alone **cannot** pass R25.

---

## Discovery limits (do not invent)

- This workspace does **not** contain the Android project, Gradle commands, `adb` install scripts, or CI workflow that builds the APK.
- No local command was discovered that prints or reads live `last_success_at` from a handset.
- Preview `operating-picture` passes `heartbeat: null`; there is no persisted heartbeat reader on this preview.
- Live collection, device-token entry, allowlist authorization, and any future heartbeat persistence remain **owner actions**.
- **No authorized duplicate-replay owner action was discovered.** Documented **Sync now** is cursor-advancing after ack; it must not be treated as a replay of acknowledged messages. Do not invent a replay button, `adb` push, or manual ingest curl.
---

## R25 owner-run protocol (ordered)

Stop at the first failed expected result. Record only sanitized IDs / timestamps and pass/fail in the evidence log. Do not paste tokens, numbers, or message bodies.

### Phase A — Approved handset / bridge

1. **Approved handset.** Confirm the physical device is the owner-designated approved business handset (identity noted as a redacted label only, e.g. `approved-handset-1`). Expected: not a personal-only device used for unapproved contacts.
2. **Bridge installed.** Install/open LVPT SMS bridge from the documented CI APK artifact (`com.lvpt.smsbridge` / documented app name). Expected: app opens.
3. **Allowlist scope in-app.** Re-enter only authorized business contacts and aliases. Expected: no personal/unapproved numbers.
4. **Start monitoring + staging sync.** Tap **Start monitoring**, enter preview host + device sync token (+ optional bypass), authorize, **Enable staging auto-sync**.

### Phase B — Current collector execution (independent of stored rows)

5. **Sync now.** Tap **Sync now**. Expected: bridge status UI / validated status payload shows an ISO `last_success_at` **from this run**, with `last_failure` empty.
6. **Classify heartbeat.** Mentally apply `validateBridgeStatus` + `classifyBridgeHeartbeat`: verified + LIVE only when `last_success_at` present and `last_failure` empty. If `last_failure` is nonempty, prior success may be preserved but status stays **NOT VERIFIED**.
7. **Reject historical substitution.** Confirm acceptance does **not** use older staging row counts, old `received_at` / `newestIngestAt`, or v0.4 JSON export time as the heartbeat. Expected: collector timestamp ≠ stored message/import time as the acceptance proof.

### Phase C — Controlled approved-message ingestion

8. **Controlled approved message.** If a fresh ingest proof is required, use an **explicitly approved** controlled contact/message only (owner-designated). Do not use unapproved contacts.
9. **Ingest accept.** Confirm staging accepts the batch with encrypted storage (`body_ciphertext` + nonce; contact as `contact_hash` only). Expected: no plaintext body or phone column in DB evidence the owner inspects.
10. **Stable identity.** Record `device_id` + Android `sms_id` (+ `tenant_id` `lvpt-owner-pilot`). Expected: stable provider identity for the controlled message.
11. **Duplicate prevention (live replay) — BLOCKED_OWNER.** Do **not** tap **Sync now** again expecting a replay: after server ack the documented cursor advances and subsequent syncs progress through remaining history (`SMS-STAGING-SETUP.md` steps 5–6). **No existing authorized owner/device replay action was discovered** in this workspace (no APK source UI for “resend batch,” no documented staging curl, no review-page resubmit of acknowledged `sms_id`s). Server-side idempotency (`ignore-duplicates` / `on_conflict=tenant_id,device_id,sms_id`) remains **LOCAL_SYNTHETIC_PASS** only. Live duplicate-replay evidence stays **PENDING_OWNER_EVIDENCE** until an authorized mechanism is discovered or the bridge branch documents one. Do not invent a command.
12. **Allowlist scope (no live unapproved probe).** **Prohibited:** submitting, syncing, or ingesting unapproved contact data during acceptance (including optional “negative” probes). **Required instead:** (a) Owner inspects the **existing** approved-contact configuration — in-app authorized business contacts/aliases only, and preview env `LVPT_SMS_STAGING_ALLOWED_NUMBERS` already configured for those same approved contacts (confirm presence/alignment without printing numbers); (b) Rely on **synthetic rejection evidence** already covered by offline contracts and targeted tests (`allowedNumbers()` / ingest `invalid_or_unapproved_messages` in `app/api/sms/staging/_lib.ts` + `ingest/route.ts`; `tests/sms-scan-health.test.mjs` asserts `allowedNumbers`). Expected: configuration is approved-only; rejection behavior is LOCAL_SYNTHETIC_PASS; no unapproved data leaves the device toward staging.

### Phase D — Displayed freshness

13. **Hub Source Health / operating-picture.** On the authenticated preview, confirm SMS metadata freshness is shown separately from collector heartbeat. Expected: missing heartbeat remains **NOT VERIFIED** / prerequisite text; stored row count alone does not display as LIVE collection.
14. **Independence.** Confirm displayed collection-live / heartbeat verified is true only when a current validated `last_success_at` is supplied — not when only historical imports exist. On this preview, heartbeat input is still `null` until a reader exists; owner must still record bridge UI `last_success_at` as independent collector evidence.

---

## Live success requirements (LIVE_VERIFIED gate)

R25 may be marked **LIVE_VERIFIED** only when **all** of the following are owner-recorded from a **current** authorized run:

1. Approved handset / bridge installed and monitoring enabled.
2. Actual current bridge `last_success_at` (ISO) from that run, with `last_failure` empty.
3. Controlled approved-message ingestion accepted (encrypted row).
4. Stable identity (`device_id` + `sms_id`) recorded.
5. **Live duplicate-replay** did not create a second row — **only after** an authorized replay mechanism is discovered and executed. Until then this gate remains **BLOCKED_OWNER**; offline `ignore-duplicates` contract alone does **not** satisfy it. Do not use a second **Sync now** as substitute evidence.
6. Allowlist scope: owner inspected existing approved-contact configuration (pass/fail only; no numbers pasted) **and** synthetic rejection tests/contracts remain green. No unapproved contact data was submitted during acceptance.
7. Encryption maintained (`body_ciphertext` + nonce; no plaintext phone/body in storage evidence).
8. Displayed freshness keeps heartbeat distinct from stored import/metadata; missing heartbeat would remain not verified.
9. Historical imports / old exports were **not** used as the collector proof.

Missing or fabricated `last_success_at`, reliance on historical row counts alone, or treating cursor-advancing **Sync now** as a duplicate replay ⇒ **not** LIVE_VERIFIED. Live status remains **PENDING_OWNER_EVIDENCE** / **NOT VERIFIED** until the evidence log is filled.

**Protocol completeness:** Steps that use discovered v0.5 UI actions (install, monitor, sync, ingest observation, freshness) are executable by the owner. Live duplicate-replay execution is **not** part of a fully executable protocol until an authorized mechanism is discovered — see matrix / progress distinction.

---

## Evidence log (authorized entries only)

Fill only with owner-supplied authorized evidence. Leave PENDING otherwise. IDs and timestamps only — no tokens, phone numbers, or message bodies.

| Evidence field | How to obtain (discovered) | Pass criteria | Value | Status |
| --- | --- | --- | --- | --- |
| `observation_at` (ISO-8601 + tz) | Owner wall clock at acceptance | Present | | PENDING_OWNER_EVIDENCE |
| Staging preview host URL | Same host used in Android + `/sms-review` | Preview only; not production ingest host | | PENDING_OWNER_EVIDENCE |
| Approved handset / bridge installed | Owner installs CI APK; app opens; **Start monitoring** | App opens; monitoring can start | | PENDING_OWNER_EVIDENCE |
| Bridge package / app identity | In-app / device app info | Matches documented LVPT SMS bridge / `com.lvpt.smsbridge` | | PENDING_OWNER_EVIDENCE |
| Actual current `last_success_at` | Bridge status UI after **Sync now** | ISO from **this** run; not an old import time | | PENDING_OWNER_EVIDENCE |
| `last_failure` empty | Same bridge status payload | Empty / absent | | PENDING_OWNER_EVIDENCE |
| Heartbeat classifier result | Apply `classifyBridgeHeartbeat` mentally / offline tool on sanitized status | verified + LIVE only if success present and failure empty | | PENDING_OWNER_EVIDENCE |
| Controlled approved-message ingest | Owner-approved contact only; staging accept | Encrypted row created/updated this run | | PENDING_OWNER_EVIDENCE |
| Stable identity `device_id` | Bridge / staging metadata | UUID present | | PENDING_OWNER_EVIDENCE |
| Stable identity `sms_id` | Android provider id for controlled message | Positive bigint recorded from ingest | | PENDING_OWNER_EVIDENCE |
| Duplicate prevention (server contract) | Offline: `app/api/sms/staging/ingest/route.ts` + `_lib.ts`; `SMS-STAGING-SETUP.md` idempotent note | LOCAL_SYNTHETIC_PASS only; not live owner proof | | LOCAL_SYNTHETIC_PASS |
| Duplicate prevention (live replay) | **No authorized owner replay action discovered.** Sync now is cursor-advancing after ack — not a replay | Live no-second-row proof after authorized replay | | BLOCKED_OWNER / PENDING_OWNER_EVIDENCE |
| Allowlist scope (owner config inspection) | Inspect existing in-app approved contacts + preview `LVPT_SMS_STAGING_ALLOWED_NUMBERS` alignment (do not list numbers; do not edit for the test) | Approved-only configuration confirmed; **no** unapproved data submitted | | PENDING_OWNER_EVIDENCE |
| Allowlist rejection (synthetic) | Offline: `allowedNumbers()` / `invalid_or_unapproved_messages`; `tests/sms-scan-health.test.mjs` | LOCAL_SYNTHETIC_PASS; not a live unapproved ingest | | LOCAL_SYNTHETIC_PASS |
| Encryption | Staging row shape | `body_ciphertext` + nonce; no phone column | | PENDING_OWNER_EVIDENCE |
| Displayed freshness | Hub Source Health / operating-picture | Heartbeat separate from stored row count; missing heartbeat stays not verified | | PENDING_OWNER_EVIDENCE |
| Historical import used as heartbeat? | Owner confirmation | Must be **No** | | PENDING_OWNER_EVIDENCE |
| LIVE_VERIFIED | All gates above | Reserved until complete | | Not claimed |

**Offline result (2026-11-26 / T40 revision):** code contracts and partial owner protocol prepared (**PROCEDURE_READY** for discovered UI steps). Allowlist evidence path uses config inspection + synthetic rejection (live unapproved probe removed). Live duplicate-replay execution **BLOCKED_OWNER** (no authorized mechanism discovered). **Ops / live status: NOT VERIFIED** — no current handset `last_success_at` was read in this workspace. No collection launched.

---

## What was not done in T40

- No Android collection launch and no **Sync now** from Cursor.
- No fabricated or synthetic `last_success_at` written as live evidence.
- No device-token entry, allowlist edit, or staging ingest mutation.
- No invented duplicate-replay command; **Sync now** was not treated as replay of acknowledged messages.
- No live unapproved-number probe and no submission of unapproved contact data.
- No production ingest enablement.
- No LIVE_VERIFIED claim.

---

## Remaining blockers

- Approved handset access and owner execution of the discovered v0.5 bridge steps.
- Actual current `last_success_at` with empty `last_failure`.
- Controlled approved-message ingest + encryption evidence; allowlist via owner config inspection (not a live unapproved probe).
- **Live duplicate-replay:** BLOCKED_OWNER pending discovery of an authorized owner/device mechanism (server `ignore-duplicates` alone is insufficient for live acceptance).
- Preview still has no persisted heartbeat reader (`operating-picture` → `heartbeat: null`); owner bridge UI evidence remains required until a separate authorized reader exists.
- R22 authenticated staging host confirmation still BLOCKED_OWNER for hub displayed-freshness checks on a verified alias.

Completion matrix: `docs/command-center-completion-matrix.md`.

COMMAND_CENTER_R25_ANDROID_COLLECTION_ACCEPTANCE_READY
