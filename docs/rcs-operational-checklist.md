# RCS Google Messages collector — R15 readiness + R26 collection acceptance

Decision: **Hold production.** This file records offline discovery (R15) and prepares the owner-run protocol for **current** RCS collection acceptance (R26). It is **not** LIVE_VERIFIED and does **not** authorize Cursor to pair, launch the collector, open Google Messages, or invent a heartbeat.

T41 / R26 preparation date: 2026-11-26. No pairing, no `-live-test`, no Google Messages access, no allowlist edit, and no fabricated `lastSuccess` were performed for this update.

Dependencies: R15 (collector offline readiness / contracts). Live fill-in also needs an authorized staging destination and owner access to the approved computer / Google account.

Do not paste Google cookies, sync tokens, data keys, allowlisted numbers, message bodies, or sealed-session material into this file.

---

## Status words for this file

| Status | Meaning |
| --- | --- |
| PROCEDURE_READY | Owner execution steps and evidence fields are defined. Not a live pass. |
| LOCAL_SYNTHETIC_PASS | Offline fixture / static source tests only. Never promotes to LIVE_VERIFIED. |
| PENDING_OWNER_EVIDENCE | Live evidence cells stay empty until the owner records authorized results. |
| LIVE_OBSERVED | Owner recorded a sanitized ID or timestamp from an authorized current run. |
| LIVE_VERIFIED | Reserved. Requires actual pairing evidence, current collector success timestamp, controlled authorized read, stable IDs, independent SMS/RCS dedup, and send/mark-read off proof. Not used until those exist. |
| BLOCKED_OWNER | Requires approved computer/account pairing, physical access, or live evidence. |
| NOT VERIFIED | Missing or unhealthy pairing/collection; default live status without current evidence. |
| UNKNOWN | Host, sealed session, or account mapping not confirmed this session. |

Live evidence rows below remain **PENDING_OWNER_EVIDENCE**. Do not invent `lastSuccess`, pairing state, Google message IDs, or ingest outcomes from fixtures, CI, or historical staging rows.

---

## Discovery summary (R15)

| Item | Discovered location / finding |
| --- | --- |
| Collector source | `services/google-messages-collector/` |
| CLI entrypoint | `services/google-messages-collector/cmd/lvpt-rcs-collector/main.go` |
| Documented preflight / build | `services/google-messages-collector/PREFLIGHT.txt` |
| Default (no Google link) build | `go build -o lvpt-rcs-collector.exe ./cmd/lvpt-rcs-collector` |
| Live AGPL build (not started in R15/T41) | `go build -tags livelibgm -o lvpt-rcs-collector-live.exe ./cmd/lvpt-rcs-collector` |
| Launcher scripts in repo | **None.** The executable itself is the launcher; flags are documented in `PREFLIGHT.txt` and `main.go`. |
| Local control / config dir | `%LOCALAPPDATA%\LVPT\rcs\` (override with `LVPT_RCS_CONTROL_DIR`) |
| Allowlist path (verified against collector) | `%LOCALAPPDATA%\LVPT\rcs\allowlist.txt` (or `LVPT_RCS_ALLOWLIST`) |
| Sealed pairing bundle | `%LOCALAPPDATA%\LVPT\rcs\session.sealed` (or `LVPT_RCS_SEALED_SESSION`) |
| Session key path | `%LOCALAPPDATA%\LVPT\rcs\session.key` via `LVPT_RCS_SESSION_KEY_FILE` (must stay outside the git checkout) |
| Staging ingest path | `POST /api/sms/staging/rcs-ingest` — production host `lvpt-event-command-center-2026.vercel.app` is refused |
| Staging table | `lvpt_rcs_staging` only (`sql/rcs-staging.sql`); never `lvpt_sms_staging` |
| Status API (preview) | `GET /api/sms/staging/rcs-collector` — always reports `pairing: 'unpaired'`, `heartbeat: 'unverified'`, `sendEnabled: false`, `markReadEnabled: false` from this deployment |
| Hub surface | `public/v2/js/unified-hub.js` Communications — stored RCS rows ≠ live collector |
| Health classifier | `collectorHealth` in `lib/rcs-staging.mjs` |
| SMS/RCS dedup | `lib/rcs-dedup.mjs` — independent provider IDs; overlap is `possible_duplicate` review, not merge |
| libgm pin | commit `ed5dc19eb2b4149ee242cf000c86a7150dca9947` |

Offline `Test-Path` for the allowlist path checks **file existence only**. Existence is not validity, not staging allowlist match, and not pairing.

**T41 path-existence note (2026-11-26, this workspace PC):** `Test-Path "$env:LOCALAPPDATA\LVPT\rcs\allowlist.txt"` → **True**. Contents were **not** read or disclosed. No `session.sealed` was observed in a name-only listing of the control dir during prep. Path existence alone remains **NOT VERIFIED** for live collection.

---

## Documented CLI flags (from `main.go` / `PREFLIGHT.txt`)

| Flag | Behavior |
| --- | --- |
| `-synthetic` | Offline synthetic rehearsal; no Google session |
| `-preflight` | Check Windows staging path / external key path; reports `pairing: unpaired`; does not open Google |
| `-pair` | Localhost-only pairing helper (`127.0.0.1`); does not contact Google |
| `-check-allowlist` | Compare one local contact hash to staging `contactCheck`; does not contact Google |
| `-health` | Print local `health.json` if present (rejects unsafe cookie material); no Google call |
| `-stop` / `-reconnect` | Local control files under the RCS control dir |
| `-revoke` | Delete local sealed pairing bundle on this PC |
| `-live-test` | Authorized read-only collection; **requires** `livelibgm` build + `LVPT_RCS_OWNER_CONFIRM=yes` |

Default executable without `-synthetic` / `-preflight` / `-pair` / `-revoke` / etc. exits with pairing not authorized and opens no Google session. The default build links `live_off.go` and cannot open a Google session.

---

## Verified offline behaviors (LOCAL_SYNTHETIC_PASS)

1. **Allowlist enforcement** — ingest rejects non-allowlisted `contactHash` (`unapproved_contact` / `invalid_or_unapproved_messages`). Collector live path requires one local contact and staging `ConfirmAllowlist` before any Google gateway. Repo keys inside the checkout are rejected by `preflight.SessionKeyAllowed`.
2. **Approved staging destination** — `ValidateStagingURL` requires path `/api/sms/staging/rcs-ingest`, HTTPS or `127.0.0.1`, and refuses the production Vercel host.
3. **Pairing prerequisites** — sealed bundle + owner confirm + livelibgm build + matching allowlist. Preview status route hard-codes `pairing: 'unpaired'` and does not invent `lastSuccess`.
4. **Stored ≠ paired / current** — `collectorHealth({ pairing: 'unpaired', lastSuccess })` stays `not_paired` / `live: false`. Hub copy: “A stored row is not a live collector.”
5. **Stable RCS identities** — `google_message_id` + `conversation_id` + tenant; public records expose `providerId` = Google message id.
6. **Independent SMS/RCS dedup** — SMS uses `sms:device:smsId`; RCS uses `rcs:googleMessageId`. Same-source replay dedupes; cross-channel overlap is linked as `possible_duplicate`, never auto-merged (`merged: false` on ingest).
7. **No send / no mark-read** — Go source has no `SendMessage` / `MarkRead` / react / delete / typing calls. Route and health contracts keep `sendEnabled` / `markReadEnabled` false. Protocol RPC ack is explicitly not MarkRead (`PREFLIGHT.txt` / `internal/upstream`).
8. **Unapproved ingestion blocked** — bad token, production host, wrong source, wrong tenant, tampered ciphertext, and unapproved contact all fail closed.
9. **Stale / failed evidence explicit** — health states include `synchronization_delayed`, `authentication_expired`, `ingestion_failed`, `paired_disconnected`, `not_paired`.

Tests under `tests/rcs-collector.test.mjs`, `tests/rcs-dedup.test.mjs`, and `tests/rcs-staging.test.mjs` use synthetic fixtures and static source reads only. They do not launch the collector, open Google Messages, or print allowlist contents.

Local prerequisite commands (synthetic; no Google / pairing):

```powershell
node .\tests\rcs-collector.test.mjs
node .\tests\rcs-dedup.test.mjs
node .\tests\rcs-staging.test.mjs
```

Or the targeted package:

```powershell
powershell.exe -NoProfile -File .\scripts\verify-command-center.ps1 -Mode Targeted -TestFiles tests/rcs-collector.test.mjs,tests/rcs-dedup.test.mjs,tests/rcs-staging.test.mjs
```

A green local run is **LOCAL_SYNTHETIC_PASS** only. It does **not** satisfy R26 LIVE_VERIFIED.

---

## Hard boundaries (do not cross during prep or acceptance)

1. **Do not pair, launch, or access Google Messages from Cursor.** No `-pair`, no `-live-test`, no cookie paste, no sealed-session creation from this agent.
2. **Do not invent `lastSuccess` or pairing state.** Missing pairing stays `not_paired` / **NOT VERIFIED**. Fixtures and CI timestamps are not live evidence.
3. **Historical staging rows cannot satisfy current collection acceptance.** Rows in `lvpt_rcs_staging`, preview `/rcs-collector` hard-coded unpaired status, and hub stored-RCS counts are **not** a live collector heartbeat.
4. **Approved computer / account / contacts only.** Do not pair a personal or unapproved Google account. Do not list allowlisted numbers or account emails in this file. **During R26 acceptance, do not submit or collect unapproved contact data** — no live unapproved-contact probe.
5. **Allowlist verification without disclosure.** Confirm path existence, one-contact scope, and staging hash match via `-check-allowlist` / `contactCheck` only. Never paste allowlist contents, phone numbers, or hashes into docs, prompts, or progress records.
6. **No plaintext message bodies** in docs, prompts, or progress records. Record IDs, pass/fail, and ISO timestamps only. Diagnostic output may contain Google message IDs; it must not contain bodies (`PREFLIGHT.txt`).
7. **Production ingest host disabled.** Staging URL validation refuses `lvpt-event-command-center-2026.vercel.app`.
8. **Sending and mark-read remain disabled.** Do not add send/react/delete/mark-read capabilities. RPC acknowledgement is not MarkRead; watch the phone unread badge during a real live test.
9. **Unpaired or unavailable access is an explicit owner blocker** — escalate; do not work around with personal accounts or remote rented servers for the first device test.

---

## Exact owner steps (from discovered `PREFLIGHT.txt`)

Run on the **approved owner PC** only. Keys stay outside the repository. Cursor must not execute these live steps.

### A. Build (owner machine)

From `services/google-messages-collector` with Go 1.26+:

1. `go test ./...`
2. `go test -tags livelibgm ./...`
3. `go build -o lvpt-rcs-collector.exe ./cmd/lvpt-rcs-collector`
4. `go build -tags livelibgm -o lvpt-rcs-collector-live.exe ./cmd/lvpt-rcs-collector`  
   Keep the livelibgm binary as its own AGPL process. Do not start it during ordinary development.

### B. Offline readiness (safe; no Google)

1. `.\lvpt-rcs-collector.exe -synthetic`
2. `.\lvpt-rcs-collector.exe -preflight`
3. Confirm allowlist **path exists** (do not paste contents):  
   `Test-Path "$env:LOCALAPPDATA\LVPT\rcs\allowlist.txt"`
4. Optionally: `.\lvpt-rcs-collector.exe -check-allowlist` with staging env already configured — compares hashes only; still does not open Google.
5. `.\lvpt-rcs-collector.exe -health`

### C. Authorized live one-contact acceptance (R26 — owner only)

Requires separate written authorization. Summary from `PREFLIGHT.txt`:

1. Name the Google account and the one consenting contact (redacted labels only in evidence log).
2. Put that contact alone in the external allowlist. Leave every other contact out.
3. Note encrypted SMS row count before the run (`lvpt_sms_staging` count — independent channel check).
4. Pair on this PC (`-pair` then authorized live path), confirm the emoji on the phone, keep messages.google.com closed afterward.
5. Collect one bounded window from that conversation only.
6. Confirm one incoming and one outgoing RCS message by identifier, direction, and timestamp.
7. Diagnostic output may contain Google message IDs; it must not contain bodies.
8. Confirm the SMS row count is unchanged.
9. Confirm no send, reaction, delete, or mark-read call was made.
10. Disconnect, confirm the health failure, reconnect once, then stop and unpair if finished.

Live start command shape (not executed in R15/T41):

```powershell
$env:LVPT_RCS_OWNER_CONFIRM = 'yes'
.\lvpt-rcs-collector-live.exe -live-test
```

`-stop` disconnects locally. `-revoke` deletes sealed files on this PC. Phone-side unpair in Google Messages is still required after a real pairing.

---

## Distinctions the owner must keep

| Observation | Means | Does not mean |
| --- | --- | --- |
| `Test-Path` allowlist = True | File exists at the configured path | Valid staging match, paired session, or live collection |
| Staging `contactCheck` / `-check-allowlist` allowed | Hash is on server allowlist | Collector is paired |
| Rows in `lvpt_rcs_staging` | Historical encrypted ingest | Current collector heartbeat |
| Preview `/rcs-collector` `pairing: unpaired` | Deployment is not a paired collector | — |
| Hub shows stored RCS rows | Metadata available for review | LIVE collection |
| `sendCalls=0` / `markReadCalls=0` in offline health | Contract / local counters | Live Google session proof without pairing |

---

## Discovery limits (do not invent)

- Pairing cookie intake is localhost-only on the approved PC after separate written authorization (`PREFLIGHT.txt`). Do not paste cookies into Cursor.
- Preview `GET /api/sms/staging/rcs-collector` hard-codes unpaired / unverified and cannot certify a live collector.
- No automation in this workspace may claim LIVE collection from stored rows or synthetic fixtures.
- Unpaired sealed session, missing allowlist match, or unavailable approved-PC access ⇒ **BLOCKED_OWNER** — stop and escalate.

---

## R26 owner-run protocol (ordered)

Stop at the first failed expected result. Record only sanitized IDs / timestamps and pass/fail in the evidence log. Do not paste cookies, tokens, numbers, allowlist contents, or message bodies.

### Phase A — Approved computer / account / allowlist

1. **Approved computer.** Confirm the physical machine is the owner-designated approved business PC (redacted label only, e.g. `approved-pc-1`). Expected: not a rented server or unapproved workstation for the first device test (`PREFLIGHT.txt`).
2. **Approved Google account.** Confirm the pairing target is the owner-approved business Google account (redacted label only). Expected: **not** a personal or unapproved account.
3. **Allowlist path present (no disclosure).** On that PC: `Test-Path "$env:LOCALAPPDATA\LVPT\rcs\allowlist.txt"` → True. Do not open or paste contents into docs.
4. **One-contact allowlist scope.** Owner places **only** the one consenting approved contact in the external allowlist; every other contact stays out (`PREFLIGHT.txt` step 2). Confirm scope verbally/pass-fail only — no numbers recorded here.
5. **Staging allowlist match without disclosure.** With staging env configured: `.\lvpt-rcs-collector.exe -check-allowlist` (or staging `contactCheck`). Expected: allowed/match; still unpaired; **no Google session**. Do not print hashes into this file.
6. **SMS baseline count.** Note encrypted `lvpt_sms_staging` row count before the run (pass/fail later that it is unchanged).

### Phase B — Pairing evidence (owner only; Cursor does not execute)

7. **Separate written authorization** for live pairing / `-live-test` is present.
8. **Build livelibgm binary** on the approved PC (`lvpt-rcs-collector-live.exe`) if not already built. Do not start it during ordinary development.
9. **Localhost pair helper.** Owner runs `.\lvpt-rcs-collector.exe -pair` (127.0.0.1 only; does not contact Google per docs). Complete cookie intake on that PC only.
10. **Phone emoji confirm.** Owner confirms the pairing emoji on the phone; keep messages.google.com closed afterward.
11. **Sealed pair bundle.** Confirm `%LOCALAPPDATA%\LVPT\rcs\session.sealed` present and DPAPI-protected after pairing. Expected: sealed bundle exists; cookies never enter git or this checklist.

### Phase C — Current collector execution / controlled authorized read

12. **Owner confirm env.** `$env:LVPT_RCS_OWNER_CONFIRM = 'yes'`
13. **Controlled live read.** `.\lvpt-rcs-collector-live.exe -live-test` — one bounded window from the allowlisted conversation only.
14. **Current execution timestamp.** From local `health.json` / live health after the authorized run, record ISO `lastSuccess` **from this run**. Expected: present and current; not an old staging row time.
15. **Controlled message evidence.** Confirm one incoming and one outgoing RCS message by `google_message_id`, direction, and timestamp (IDs + direction + time only; no bodies).
16. **Stable RCS identity.** Record distinct `google_message_id` values (+ `conversation_id` / tenant as available). Expected: stable provider identity; public `providerId` = Google message id.
17. **Independent SMS/RCS identities.** Confirm SMS row count unchanged; no auto-merge into `lvpt_sms_staging`. Cross-channel overlap, if any, is review `possible_duplicate` only (`merged: false`).
18. **Same-source RCS dedup (live).** If the same `google_message_id` is presented again, staging returns duplicate / accepted 0 with `merged: false` (`on_conflict=tenant_id,google_message_id`). Record pass/fail without pasting payloads. Offline contract remains LOCAL_SYNTHETIC_PASS; live confirmation uses owner-observed staging outcome after authorized replay of the same id only when the owner chooses an authorized method.

### Phase D — No-send / no-mark-read + disconnect

19. **Mutation counters.** From live health: `sendCalls=0`, `markReadCalls=0`. Confirm no send, reaction, delete, or mark-read call was made. Note: protocol RPC ack is **not** MarkRead; watch phone unread badge.
20. **Contract flags.** Confirm `sendEnabled: false` and `markReadEnabled: false` on health / pair UI / staging responses inspected.
21. **Disconnect / reconnect (optional acceptance).** `-stop`, confirm health failure, `-reconnect` once, then `-stop` and `-revoke` / phone unpair if the test is finished.
22. **Reject historical substitution.** Confirm acceptance does **not** use older `lvpt_rcs_staging` row counts or preview unpaired hard-code as the collector proof.

---

## Live success requirements (LIVE_VERIFIED gate)

R26 may be marked **LIVE_VERIFIED** only when **all** of the following are owner-recorded from a **current** authorized run on the approved computer:

1. Approved computer + approved Google account pairing evidence (sealed bundle + phone emoji confirm).
2. Allowlist verification without disclosure: path present, one approved contact only, staging match via hash check (no numbers pasted); no unapproved contact collected.
3. Actual current collector `lastSuccess` (ISO) from that run.
4. Controlled authorized read of one bounded conversation window.
5. Stable RCS identities (`google_message_id` for inbound + outbound proof messages).
6. Independent SMS/RCS identities: SMS table unchanged; no incorrect SMS/RCS merge; cross-channel overlap is `possible_duplicate` review only if observed.
7. Sending and mark-read remain disabled (`sendCalls=0`, `markReadCalls=0`; `sendEnabled`/`markReadEnabled` false).
8. Historical staging rows / preview unpaired hard-code were **not** used as the collector proof.

Missing pairing, fabricated `lastSuccess`, unpaired/unavailable approved-PC access, or treating stored RCS rows as LIVE ⇒ **not** LIVE_VERIFIED. Live status remains **PENDING_OWNER_EVIDENCE** / **NOT VERIFIED** / **BLOCKED_OWNER** until the evidence log is filled.

**Unpaired or unavailable access:** explicit **BLOCKED_OWNER**. Do not pair a personal account and do not launch from Cursor.

---

## Evidence log (authorized entries only)

Fill only with owner-supplied authorized evidence. Leave PENDING otherwise. IDs and timestamps only — no cookies, tokens, phone numbers, allowlist contents, or message bodies.

| Evidence field | How to obtain (discovered) | Pass criteria | Value | Status |
| --- | --- | --- | --- | --- |
| `observation_at` (ISO-8601 + tz) | Owner wall clock at acceptance | Present | | PENDING_OWNER_EVIDENCE |
| Approved computer label | Owner designation | Approved business PC; not rented first-test host | | PENDING_OWNER_EVIDENCE |
| Approved Google account label | Owner designation (redacted) | Business account only; not personal/unapproved | | PENDING_OWNER_EVIDENCE |
| Allowlist path present | `Test-Path` only (no contents) | True on approved PC | | PENDING_OWNER_EVIDENCE |
| Allowlist one-contact scope | Owner inspects external allowlist (no paste) | Exactly one consenting approved contact | | PENDING_OWNER_EVIDENCE |
| Staging allowlist match | `-check-allowlist` / `contactCheck` | Allowed/match; no Google session; hashes not disclosed | | PENDING_OWNER_EVIDENCE |
| Allowlist rejection (synthetic) | Offline: ingest `unapproved_contact` / tests | LOCAL_SYNTHETIC_PASS; not a live unapproved probe | | LOCAL_SYNTHETIC_PASS |
| Written live authorization | Owner record | Present before `-pair` / `-live-test` | | PENDING_OWNER_EVIDENCE |
| Pairing emoji confirmed | Phone Google Messages | Confirmed; messages.google.com closed after | | PENDING_OWNER_EVIDENCE |
| Sealed pair bundle | `%LOCALAPPDATA%\LVPT\rcs\session.sealed` | Present + DPAPI-protected; not in git | | PENDING_OWNER_EVIDENCE |
| Actual current `lastSuccess` | Local `health.json` / live health after `-live-test` | ISO from **this** run | | PENDING_OWNER_EVIDENCE |
| Controlled inbound `google_message_id` | Diagnostic / staging metadata | ID + incoming + timestamp | | PENDING_OWNER_EVIDENCE |
| Controlled outbound `google_message_id` | Diagnostic / staging metadata | ID + outgoing + timestamp | | PENDING_OWNER_EVIDENCE |
| Stable identity / conversation | Staging metadata | Distinct Google message IDs; conversation scoped | | PENDING_OWNER_EVIDENCE |
| SMS row count unchanged | Pre/post `lvpt_sms_staging` count | Unchanged (independent channel) | | PENDING_OWNER_EVIDENCE |
| Independent SMS/RCS dedup (live) | Owner observation + `lib/rcs-dedup.mjs` contract | No incorrect merge; overlap = `possible_duplicate` only | | PENDING_OWNER_EVIDENCE |
| Same-source RCS dedup (server) | Offline: `on_conflict=tenant_id,google_message_id`; `merged: false` | LOCAL_SYNTHETIC_PASS until owner observes live duplicate | | LOCAL_SYNTHETIC_PASS |
| `sendCalls` | Live health counters | `0` | | PENDING_OWNER_EVIDENCE |
| `markReadCalls` | Live health counters | `0` | | PENDING_OWNER_EVIDENCE |
| `sendEnabled` / `markReadEnabled` | Health / pair UI / staging | Both false | | PENDING_OWNER_EVIDENCE |
| Historical rows used as heartbeat? | Owner confirmation | Must be **No** | | PENDING_OWNER_EVIDENCE |
| LIVE_VERIFIED | All gates above | Reserved until complete | | Not claimed |

**Offline result (2026-11-26 / T41):** source contracts, CLI docs, staging/dedup tests, and allowlist **path existence** verified. Owner protocol prepared (**PROCEDURE_READY**). Collector was **not** launched, paired, or given Google Messages access in this task. **Ops / live status: NOT VERIFIED** — pairing and current collector success remain owner blockers.

---

## What was not done in T41

- No collector launch, `-pair`, or `-live-test` from Cursor.
- No Google Messages / messages.google.com access.
- No fabricated or synthetic `lastSuccess` written as live evidence.
- No allowlist contents read or disclosed; no allowlist edit.
- No sealed-session creation and no cookie paste.
- No live unapproved-contact probe.
- No production ingest enablement.
- No send or mark-read capability added.
- No LIVE_VERIFIED claim.

---

## Remaining blockers

- Approved computer + approved Google account access and separate written authorization for live pairing.
- Actual pairing evidence (sealed bundle + phone emoji confirm).
- Current collector `lastSuccess` after authorized `-live-test`.
- Controlled authorized read (one inbound + one outbound Google message ID proof).
- Allowlist verification without disclosure completed on the approved PC (path + one-contact + staging hash match).
- Independent SMS/RCS identity confirmation (SMS count unchanged; no incorrect merge).
- No-send / no-mark-read live health counters from that run.
- Unpaired or unavailable access remains **BLOCKED_OWNER** — escalate; do not use a personal account.
- Preview `/rcs-collector` remains hard-coded unpaired; stored rows cannot satisfy acceptance.
- R22 authenticated staging host confirmation still BLOCKED_OWNER for hub displayed-freshness checks on a verified alias.

Completion matrix: `docs/command-center-completion-matrix.md`.

COMMAND_CENTER_R26_RCS_COLLECTION_ACCEPTANCE_READY
