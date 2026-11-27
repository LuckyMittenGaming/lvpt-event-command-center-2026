# Gmail operational acceptance — R24 controlled approval workflow

Decision: **Hold production.** This file prepares the owner-run protocol for a single controlled Gmail approval acceptance. It is **not** a live send, **not** LIVE_VERIFIED, and **not** authorization to resume the four-times-daily approval job.

T39 / R24 preparation date: 2026-11-26. No Gmail provider send, no customer recipient contact, no scheduled-approval activation, and no production deploy were performed for this update.

Dependencies: R11 (full-thread / mailbox readiness), R12 (one-at-a-time decisions), R13 (exactly-once send safety), R22 (authenticated staging on a verified host). Procedure prep does not require those owner gates already passed; live fill-in does.

Related rollout notes (historical controls): `docs/STEP_50_CONTROLLED_GMAIL_ROLLOUT.md`. This R24 checklist is the acceptance gate; Step 50 remains advisory background and does not authorize send.

Business mailbox identity (record only; do not paste tokens or message bodies):

- `book@pokertraininglasvegas.com`

---

## Status words for this file

| Status | Meaning |
| --- | --- |
| PROCEDURE_READY | Owner protocol and evidence fields are defined. Not a live pass. |
| LOCAL_SYNTHETIC_PASS | Offline fixture / reply-review / send-runtime tests only. Never promotes to LIVE_VERIFIED. |
| PENDING_OWNER_EVIDENCE | Live evidence cells stay empty until the owner records authorized results. |
| LIVE_OBSERVED | Owner recorded a sanitized aggregate or ID from an authorized controlled run. |
| LIVE_VERIFIED | Reserved. Requires provider-confirmed message ID, exactly-once proof, and owner confirmation. Not used until those exist. |
| BLOCKED_OWNER | Requires owner authorization, controlled recipient, or live evidence. |
| DISABLED | Capability or schedule remains off. |
| UNKNOWN | Mapping, host, or configuration not confirmed this session. |

Live evidence rows below remain **PENDING_OWNER_EVIDENCE**. Do not invent recipient addresses, thread IDs, message IDs, or send outcomes from fixtures or CI.

---

## Hard boundaries (do not cross during prep or acceptance)

1. **No actual customer** as an automated or casual test recipient. The controlled recipient must be an explicitly owner-approved non-customer address (for example an LVPT-owned external test mailbox the owner designates). Do not use a live client thread for automated testing.
2. **No live send** from this preparation task or from Cursor. Owner may perform at most one authorized controlled send only after every prerequisite below is checked and switches are intentionally enabled for that window.
3. **No scheduled approval activation.** The four-times-daily Gmail approval automation stays **DISABLED**. Restoration is R29 and requires separate owner approval after R24 LIVE_VERIFIED.
4. **No production send enablement.** Staging-only opt-in remains the only path under consideration; production `LVPT_ENABLE_OWNER_APPROVED_GMAIL_SEND` stays off.
5. Hub `POST /api/gmail/send` remains **403** (`app/api/gmail/send/route.ts`). Do not reopen it as part of R24.
6. Clipboard copy is **not** a sent message. An attempted send without a provider message ID is **not** SENT.
7. Uncertain / reserved / timeout outcomes mean **STOP, INSPECT SENT, NO RETRY**.
8. Do not paste customer content, draft bodies, credentials, or device tokens into this file. Record IDs and pass/fail only.

---

## Local / code prerequisites (already implemented; synthetic only)

These establish PROCEDURE_READY / LOCAL_SYNTHETIC_PASS. They do **not** satisfy LIVE_VERIFIED.

| Gate | Local evidence | Live status |
| --- | --- | --- |
| Mailbox + full-thread readiness | R11: triage / preview / qualification fail closed without verified business mailbox and non-truncated thread context | PENDING_OWNER_EVIDENCE |
| Owner decisions | R12: APPROVE / MAKE CHANGES / DENY / EDIT MYSELF with binding invalidation | PENDING_OWNER_EVIDENCE |
| Exactly-once delivery safety | R13: dual opt-in, digest, unique intent reservation, concurrent duplicate claim → one provider send; missing `gmailMessageId` → uncertain / doNotRetry | PENDING_OWNER_EVIDENCE |
| Recipient verification helpers | GAS `lvptStep48VerifyReplyRecipient_` regressions (synthetic `client@example.com` only) | PENDING_OWNER_EVIDENCE |
| Hub send route | Always 403 | DISABLED |
| Four-times-daily approval job | Matrix / staging acceptance: DISABLED | DISABLED |

Local prerequisite commands (synthetic; no provider calls):

```powershell
node .\tests\sms-reply-review.test.cjs
node .\tests\sms-reply-queue-navigation.test.cjs
node .\tests\sms-reply-send-runtime.test.cjs
node .\tests\sms-gas-recipient-verification.test.cjs
```

Or the targeted package:

```powershell
powershell.exe -NoProfile -File .\scripts\verify-command-center.ps1 -Mode Targeted -TestFiles tests/sms-reply-review.test.cjs,tests/sms-reply-queue-navigation.test.cjs,tests/sms-reply-send-runtime.test.cjs,tests/sms-gas-recipient-verification.test.cjs
```

A green local run is **LOCAL_SYNTHETIC_PASS** only.

---

## Controlled send prerequisites (must all be true before any owner send)

| # | Prerequisite | Pass criteria | Evidence status |
| --- | --- | --- | --- |
| P1 | Authenticated staging host | R22 host URL, candidate revision, and deployment protection confirmed | PENDING_OWNER_EVIDENCE (R22) |
| P2 | Business mailbox identity | Signed-in session / diagnostic shows `book@pokertraininglasvegas.com` as the active business mailbox | PENDING_OWNER_EVIDENCE |
| P3 | Authorized full-thread reader | Full thread opens with non-truncated messages; Sent mail included in owner review | PENDING_OWNER_EVIDENCE |
| P4 | Exact controlled test recipient | Owner-selected **non-customer** address written here as a redacted pattern only (e.g. `owner-test@…`); never a live client | PENDING_OWNER_EVIDENCE |
| P5 | Exact controlled thread / message | Exact Gmail `thread_id` and latest inbound provider `message_id` recorded (IDs only) | PENDING_OWNER_EVIDENCE |
| P6 | Exact controlled window | Owner-declared start/end (timezone) for the single pilot send; no overlap with scheduled approval automation | PENDING_OWNER_EVIDENCE |
| P7 | Current draft context | Draft subject/body match the thread under review; approved SHA-256 digest bound; no stale binding | PENDING_OWNER_EVIDENCE |
| P8 | Independent automation quiet | Four-times-daily job confirmed still disabled; no competing pending Gmail draft from that workflow | PENDING_OWNER_EVIDENCE / DISABLED |
| P9 | Existing audit + send-intent safeguards | Dual staging opt-in switches still off until the owner expressly enables them for this window; intent reservation path intact | PENDING_OWNER_EVIDENCE |
| P10 | Environment / provider configuration | Staging-only send path; production send remains disabled; Apps Script send gate off until owner enables for the pilot | PENDING_OWNER_EVIDENCE |

If any prerequisite is UNKNOWN or fails, **do not send**.

---

## Exact approval boundaries

| Owner action | Allowed effect | Must not |
| --- | --- | --- |
| **APPROVE** | Bind exact recipient + thread + inbound identity + draft digest; audit `approved_for_manual_copy` (or staging approved-send binding when pilot enabled) | Infer permission from diagnostics alone; approve without full-thread review |
| **MAKE CHANGES** | Return a revised draft; clear prior binding; require renewed APPROVE | Send; keep stale approval binding |
| **DENY** | Audit `denied`; advance queue exactly once when policy says so | Call reply-send / Gmail send |
| **EDIT MYSELF** | Local close / owner edits outside the send path | Call reply-send; create send intent; mark SENT |
| Clipboard copy | Owner convenience only | Count as provider send or advance as SENT |
| Controlled approved send (pilot only) | Exactly one provider-confirmed send for the bound revision | Retry on uncertain; second send on duplicate approval; production enablement |

Invalidators that require renewed APPROVE before any send path:

- Changed recipient
- Changed draft subject/body (digest mismatch)
- Newer inbound message, or same-timestamp inbound identity/content replacement
- Missing recipient, thread, inbound identity, or draft digest at save time

---

## Owner-run protocol (ordered)

Stop at the first failed expected result. Record only sanitized IDs and pass/fail in the evidence table. Do not enable the four-times-daily job at any step.

### Phase A — Read-only verification (no send switches)

1. **Mailbox identity.** Confirm the review session operates as `book@pokertraininglasvegas.com`. Expected: mailbox identity verified; wrong-mailbox threads fail closed.
2. **Full-thread open.** Open the controlled thread via the authorized full-thread reader. Expected: complete (non-truncated) conversation context including relevant Sent history; Approve stays disabled if any message is truncated.
3. **Exact recipient.** Run recipient verification against the current thread. Expected: verified external recipient equals the owner-designated controlled test address — **not** a customer. Cross-thread newer Sent to the same address blocks duplicate follow-up.
4. **Draft matches current context.** Confirm subject/body and digest match the thread under review. Expected: no independent-automation draft conflict; CRM/event notes reviewed as applicable without pasting content here.

### Phase B — Decision behavior (still no live customer send)

5. **MAKE CHANGES → revised review.** Apply MAKE CHANGES with a deliberate draft edit. Expected: revised draft returned; prior APPROVE binding cleared; send path blocked until renewed APPROVE; zero provider sends.
6. **DENY non-send.** On a disposable controlled item (or synthetic staging fixture if live decision recording is still off), DENY. Expected: audit denied; **no** reply-send / Gmail API send; queue advances exactly once per policy.
7. **EDIT MYSELF non-send.** EDIT MYSELF. Expected: local close only; **no** send intent; **no** provider send.

### Phase C — One controlled approved send (owner-authorized pilot only)

Perform **only** after P1–P10 pass and the owner expressly authorizes the pilot window. Enable staging send switches for this window only. Do not enable production.

8. **Renewed APPROVE** on the exact controlled recipient / thread / inbound / digest.
9. **Single send attempt.** Confirm exact confirmation phrase / checkboxes required by the staging path. Expected: exactly one Gmail send API attempt.
10. **Provider confirmation.** Success requires:
    - Provider Gmail **message ID** present and recorded
    - Ledger / intent status **sent** (not `uncertain`, `reserved`, or empty)
    - Threading to the expected `thread_id`
11. **Duplicate prevention.** Re-submit the same approval / intent. Expected: durable uniqueness rejects a second provider send (`duplicate_send_intent` / doNotRetry); no second message ID created for the same revision.
12. **Audit identity.** Confirm audit records owner decision, bound recipient/thread/inbound/digest, intent id, and provider message ID — without storing raw bodies in this doc.
13. **Queue advancement.** After confirmed SENT (or DENY per policy), queue advances exactly once to the next actionable item; unresolved items remain; concurrent advance does not double-step.
14. **Disable switches.** Turn staging send opt-ins **OFF** again. Confirm four-times-daily job still DISABLED. Confirm hub `/api/gmail/send` still 403.

If step 10 yields uncertain/timeout: **STOP**. Inspect Gmail Sent for the controlled recipient. Do **not** retry. Escalate to owner with intent id and observation time only.

---

## Live success requirements (LIVE_VERIFIED gate)

R24 may be marked **LIVE_VERIFIED** only when **all** of the following are owner-recorded from the controlled pilot:

1. Full controlled thread opened with verified business mailbox.
2. Exact controlled (non-customer) recipient verified.
3. Draft matched current context at APPROVE time.
4. MAKE CHANGES returned a revised draft and did not send.
5. DENY did not send.
6. EDIT MYSELF did not send.
7. Exactly one provider-confirmed approved send for the bound revision.
8. Provider **message ID** recorded.
9. Duplicate approval did not resend.
10. Queue advanced correctly.
11. Audit complete (decision + binding + intent + provider message ID).
12. Four-times-daily approval job remained DISABLED throughout.
13. No actual customer was used as the test recipient.

Missing provider message ID or uncertain outcome ⇒ **not** LIVE_VERIFIED.

---

## Evidence log (authorized entries only)

Fill only with owner-supplied authorized evidence. Leave PENDING otherwise. IDs only — no bodies, subjects, or personal names.

| Field | Value | Status |
| --- | --- | --- |
| `observation_at` (ISO-8601 + tz) | | PENDING_OWNER_EVIDENCE |
| Staging host URL | | PENDING_OWNER_EVIDENCE |
| Candidate revision served | | PENDING_OWNER_EVIDENCE |
| Business mailbox verified | | PENDING_OWNER_EVIDENCE |
| Full-thread reader OK (non-truncated) | | PENDING_OWNER_EVIDENCE |
| Controlled recipient (redacted) | | PENDING_OWNER_EVIDENCE |
| Controlled `thread_id` | | PENDING_OWNER_EVIDENCE |
| Latest inbound `message_id` | | PENDING_OWNER_EVIDENCE |
| Controlled window start / end | | PENDING_OWNER_EVIDENCE |
| Draft digest bound at APPROVE | | PENDING_OWNER_EVIDENCE |
| MAKE CHANGES non-send | | PENDING_OWNER_EVIDENCE |
| DENY non-send | | PENDING_OWNER_EVIDENCE |
| EDIT MYSELF non-send | | PENDING_OWNER_EVIDENCE |
| Send intent id | | PENDING_OWNER_EVIDENCE |
| Provider Gmail message ID | | PENDING_OWNER_EVIDENCE |
| Intent / ledger status (`sent`) | | PENDING_OWNER_EVIDENCE |
| Duplicate re-approval blocked | | PENDING_OWNER_EVIDENCE |
| Queue advanced exactly once | | PENDING_OWNER_EVIDENCE |
| Audit complete | | PENDING_OWNER_EVIDENCE |
| Four-times-daily job | DISABLED | DISABLED |
| Hub `/api/gmail/send` | 403 | DISABLED |
| Production send switch | OFF | DISABLED |
| LIVE_VERIFIED | | Not claimed |

---

## What was not done in T39

- No live Gmail send and no customer email.
- No enablement of `LVPT_ENABLE_OWNER_APPROVED_GMAIL_SEND` (staging or production).
- No four-times-daily approval job resume (R29 remains separate).
- No change to hub `app/api/gmail/send/route.ts` (remains 403).
- No clasp push, Calendar write, Sheet write, or production deploy.
- No LIVE_VERIFIED claim.

---

## Remaining blockers

- R22 authenticated staging remains BLOCKED_OWNER until owner signed-in preview evidence exists.
- R24 live controlled send remains BLOCKED_OWNER / PENDING_OWNER_EVIDENCE until the owner supplies the evidence log above.
- R29 scheduled approval restoration remains DISABLED until R24 is LIVE_VERIFIED and the owner separately approves.

Completion matrix: `docs/command-center-completion-matrix.md`.

COMMAND_CENTER_R24_GMAIL_APPROVAL_PROTOCOL_READY
