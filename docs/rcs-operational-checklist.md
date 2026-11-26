# RCS Google Messages collector operational checklist (R15 offline readiness)

Updated: 2026-11-26  
Scope: local discovery and offline verification only.  
Do **not** paste Google cookies, sync tokens, data keys, allowlisted numbers, message bodies, or sealed-session material into this file.  
Do **not** launch or pair the collector from an automation loop without separate owner authorization (R26).

---

## Discovery summary

| Item | Discovered location / finding |
| --- | --- |
| Collector source | `services/google-messages-collector/` |
| CLI entrypoint | `services/google-messages-collector/cmd/lvpt-rcs-collector/main.go` |
| Documented preflight / build | `services/google-messages-collector/PREFLIGHT.txt` |
| Default (no Google link) build | `go build -o lvpt-rcs-collector.exe ./cmd/lvpt-rcs-collector` |
| Live AGPL build (not started in R15) | `go build -tags livelibgm -o lvpt-rcs-collector-live.exe ./cmd/lvpt-rcs-collector` |
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

## Verified offline behaviors

1. **Allowlist enforcement** — ingest rejects non-allowlisted `contactHash` (`unapproved_contact`). Collector live path requires one local contact and staging `ConfirmAllowlist` before any Google gateway. Repo keys inside the checkout are rejected by `preflight.SessionKeyAllowed`.
2. **Approved staging destination** — `ValidateStagingURL` requires path `/api/sms/staging/rcs-ingest`, HTTPS or `127.0.0.1`, and refuses the production Vercel host.
3. **Pairing prerequisites** — sealed bundle + owner confirm + livelibgm build + matching allowlist. Preview status route hard-codes `pairing: 'unpaired'` and does not invent `lastSuccess`.
4. **Stored ≠ paired / current** — `collectorHealth({ pairing: 'unpaired', lastSuccess })` stays `not_paired` / `live: false`. Hub copy: “A stored row is not a live collector.”
5. **Stable RCS identities** — `google_message_id` + `conversation_id` + tenant; public records expose `providerId` = Google message id.
6. **Independent SMS/RCS dedup** — SMS uses `sms:device:smsId`; RCS uses `rcs:googleMessageId`. Same-source replay dedupes; cross-channel overlap is linked as `possible_duplicate`, never auto-merged (`merged: false` on ingest).
7. **No send / no mark-read** — Go source has no `SendMessage` / `MarkRead` / react / delete / typing calls. Route and health contracts keep `sendEnabled` / `markReadEnabled` false. Protocol RPC ack is explicitly not MarkRead.
8. **Unapproved ingestion blocked** — bad token, production host, wrong source, wrong tenant, tampered ciphertext, and unapproved contact all fail closed.
9. **Stale / failed evidence explicit** — health states include `synchronization_delayed`, `authentication_expired`, `ingestion_failed`, `paired_disconnected`, `not_paired`.

Tests under `tests/rcs-collector.test.mjs`, `tests/rcs-dedup.test.mjs`, and `tests/rcs-staging.test.mjs` use synthetic fixtures and static source reads only. They do not launch the collector, open Google Messages, or print allowlist contents.

---

## Exact owner steps (from discovered `PREFLIGHT.txt`)

Run on the **approved owner PC** only. Keys stay outside the repository.

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

1. Name the Google account and the one consenting contact.
2. Put that contact alone in the external allowlist.
3. Note encrypted SMS row count before the run.
4. Pair on this PC (`-pair` then authorized live path), confirm the emoji on the phone, keep messages.google.com closed afterward.
5. Collect one bounded window from that conversation only.
6. Confirm one incoming and one outgoing RCS message by identifier, direction, and timestamp.
7. Diagnostic output may contain Google message IDs; it must not contain bodies.
8. Confirm the SMS row count is unchanged.
9. Confirm no send, reaction, delete, or mark-read call was made.
10. Disconnect, confirm the health failure, reconnect once, then stop and unpair if finished.

Live start command shape (not executed in R15):

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
| Staging `contactCheck` allowed | Hash is on server allowlist | Collector is paired |
| Rows in `lvpt_rcs_staging` | Historical encrypted ingest | Current collector heartbeat |
| Preview `/rcs-collector` `pairing: unpaired` | Deployment is not a paired collector | — |
| Hub shows stored RCS rows | Metadata available for review | LIVE collection |

---

## Owner evidence fields (prepare for R26 — do not fabricate)

| Evidence field | How to obtain | Pass criteria |
| --- | --- | --- |
| Allowlist path present | `Test-Path` only | True on approved PC; contents never committed |
| Staging allowlist match | `-check-allowlist` or staging `contactCheck` | `allowed: true`; still unpaired until live pair |
| Sealed pair bundle | `%LOCALAPPDATA%\LVPT\rcs\session.sealed` after `-pair` | Present + DPAPI-protected; no cookies in git |
| Collector success time | Local `health.json` / live health after authorized run | Current `lastSuccess`; send/mark-read remain 0 |
| Stable IDs | Staging metadata | Distinct `google_message_id` values; SMS table unchanged |
| Dedup | Replay + SMS overlap fixture | Same RCS id ignored; SMS/RCS overlap = review link only |
| No mutation | Live health counters | `sendCalls=0`, `markReadCalls=0` |

**Offline result (2026-11-26):** source contracts, CLI docs, staging/dedup tests, and allowlist **path existence** verified. Collector was **not** launched or paired in this task. **Ops status: UNVERIFIED** — live pairing and current collector success remain R26.
