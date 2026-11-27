# Automation ownership and restoration gates — R29

Decision: **Hold scheduled approval restoration.** This file documents known vs unverified automation ownership and the gates required before any four-times-daily Gmail approval resume. It does **not** enable schedules, create competing automations, mutate Calendar, or authorize auto-send.

T44 / R29 preparation date: 2026-11-26. No ChatGPT scheduled-task change, no Apps Script trigger change, no clasp push, no Calendar write, no Gmail/SMS send, and no production deploy were performed for this update.

Dependencies: **R24 LIVE_VERIFIED** (controlled Gmail approval acceptance) **plus** separate explicit owner authorization to restore the schedule. R24 protocol prep alone is not enough.

Related:

- R24 owner protocol: `docs/gmail-operational-acceptance.md`
- Controlled rollout background: `docs/STEP_50_CONTROLLED_GMAIL_ROLLOUT.md`
- Calendar sole writer: `docs/calendar-operational-acceptance.md`
- Historical handoff inventory: `docs/LVPT_CURSOR_HANDOFF.md`
- Hub audit labels: `docs/baselines/lvpt-unified-hub-audit.md`

---

## Status words for this file

| Status | Meaning |
| --- | --- |
| KNOWN_POLICY | Ownership rule is established in AGENTS.md / remaining-spec / inspected code. Not a live run proof. |
| DOCUMENTED_EXTERNAL | Named outside this repository (typically ChatGPT scheduled tasks). Cursor does **not** have verified access. |
| NOT_VERIFIED | Inventory mentioned historically; last-success / current ownership / delivery not readable from this workspace. |
| DISABLED | Must stay off until restoration gates pass. |
| PROCEDURE_READY | Restoration plan and evidence fields are defined. Not a live reenable. |
| PENDING_OWNER_EVIDENCE | Live cells stay empty until the owner records authorized current results. |
| BLOCKED_OWNER | Requires owner access to external schedules, R24 live acceptance, or written restore approval. |
| LIVE_VERIFIED | Reserved. Not used until delivery evidence (not schedule presence) is owner-recorded after authorized restore. |

Cursor **cannot** assume access to existing ChatGPT scheduled tasks or their connected-account permissions. Do not invent task IDs, last-run timestamps, or delivery receipts from documentation alone.

---

## Inventory — known ownership vs unverified

### A. Outside this repository (ChatGPT / external schedules)

These are **not** native repo code. Do not recreate them inside Cursor. Do not modify them from this loop.

| Automation | Intended role | Cadence (documented) | Ownership access from Cursor | Current status | Evidence class |
| --- | --- | --- | --- | --- | --- |
| Morning Client Review | Owner morning client / inbox review digest | Morning ET (exact ChatGPT task identity **NOT_VERIFIED**) | **No assumed access** | Assumed separate from Command Center code; do not modify from Cursor | DOCUMENTED_EXTERNAL / NOT_VERIFIED |
| Evening Client Review | Owner evening client / inbox review digest | Evening ET (exact ChatGPT task identity **NOT_VERIFIED**) | **No assumed access** | Assumed separate; do not modify from Cursor | DOCUMENTED_EXTERNAL / NOT_VERIFIED |
| Morning Executive Inbox Brief | Executive inbox brief | Historically noted ~8:01 AM brief in hub audit; exact ChatGPT identity **NOT_VERIFIED** | **No assumed access** | Assumed separate; do not modify from Cursor | DOCUMENTED_EXTERNAL / NOT_VERIFIED |
| Four-times-daily Gmail approval workflow | Owner approval prompts for pending Gmail replies | **6:00 AM ET**, **12:00 PM ET**, **7:00 PM ET**, **12:00 AM ET** (midnight) | **No assumed access** | **DISABLED** — must remain disabled | DOCUMENTED_EXTERNAL / DISABLED |

Sources for the four-slot cadence: `AGENTS.md` §12; `docs/LVPT_CURSOR_HANDOFF.md`; matrix / staging acceptance. Sources for morning/evening/brief separation: `AGENTS.md` (“Existing morning/evening review and executive brief automations are separate”); hub audit `docs/baselines/lvpt-unified-hub-audit.md` (ChatGPT morning/evening/8:01 AM brief labeled NOT VERIFIED; four-times-daily labeled DISABLED).

**Notification delivery rule:** A configured schedule slot is **not** proof a notification was delivered. Delivery requires owner-readable run/success evidence (timestamp, task run id, or equivalent) for that slot. Missing evidence = **NOT_VERIFIED**, never “assumed OK.”

### B. In-repository / Apps Script Calendar writer

| Automation | Intended role | Cadence | Ownership | Current status | Evidence class |
| --- | --- | --- | --- | --- | --- |
| `runLVPTSafeTaskSync` | **Sole** authorized internal Calendar reminder writer | Hourly Time-Driven trigger (live ownership PENDING_OWNER_EVIDENCE per R27) | LVPT Calendar Command Center script `1bYJcEE5GUbfiWvXNiew_bfgBwDyfakhO8aiPWDtGF70ZO_zqd0z_4XDP` | Authorized entry; live cycles not claimed here | KNOWN_POLICY; live proof is R27 |
| `runLVPTTaskSync` | Retired planner | Must **not** be scheduled | Retired | **RETIRED** — do not reinstall, schedule, or execute | KNOWN_POLICY / DISABLED |

Rules (KNOWN_POLICY):

1. No other agent, scheduled job, UI component, ChatGPT task, or automation may create, update, or delete internal Calendar reminders.
2. Morning/evening reviews and the executive brief may **read** calendars and report; they must **not** create competing task reminders.
3. R29 restoration of approvals must **not** introduce Calendar writes.
4. Schedule ≠ execution for TaskSync: see `docs/calendar-operational-acceptance.md`.

### C. In-repository Gmail send / approval surfaces

| Surface | Role | Current status |
| --- | --- | --- |
| Hub `POST /api/gmail/send` | Production send route | **403** — remains disabled |
| SMS-review staging reply-send | Dual opt-in + digest + unique intent reservation | Staging-gated; no auto-send; R24 live pilot still PENDING_OWNER_EVIDENCE |
| Four-times-daily ChatGPT approval job | External approval prompts | **DISABLED** (this file’s restore target only after gates) |

Owner approval actions remain: **APPROVE**, **MAKE CHANGES**, **DENY**, **EDIT MYSELF**. DENY and EDIT MYSELF must not send. MAKE CHANGES returns a revised draft for approval. Clipboard copy is not a send. Uncertain provider outcomes must not auto-resend.

---

## Four-times-daily approval cadence (documented; currently DISABLED)

| Slot (America/New_York) | Intended check | Restored? |
| --- | --- | --- |
| 6:00 AM ET | Approval queue review prompt | **No — DISABLED** |
| 12:00 PM ET | Approval queue review prompt | **No — DISABLED** |
| 7:00 PM ET | Approval queue review prompt | **No — DISABLED** |
| 12:00 AM ET | Approval queue review prompt | **No — DISABLED** |

This table documents the **intended** cadence only. It is not authorization to create or enable ChatGPT tasks. Cursor must not create a competing four-slot automation inside the repo or on Vercel cron as a substitute.

---

## Hard constraints preserved under any future restore

These remain mandatory after R24 and after any owner-authorized R29 restore:

| Constraint | Requirement |
| --- | --- |
| No auto-send | Every outbound client Gmail/SMS requires explicit owner approval for that message. Scheduled prompts are review prompts, not senders. |
| Intent deduplication | One durable send intent / revision; concurrent duplicate claims → exactly one provider send; `duplicate_send_intent` / doNotRetry on replay. |
| Failure visibility | Uncertain, timeout, reserved-without-message-id, and delivery failures stay visible; never convert failure into empty success. |
| Schedule vs execution | Presence of a 6 AM / noon / 7 PM / midnight schedule (or hub label) is **not** execution or delivery proof. |
| No duplicate Calendar writer | Only `runLVPTSafeTaskSync` writes internal reminders. Approvals and reviews never create Calendar task events. |
| Independent queue coordination | Per Step 50: before any send, confirm the independent approval automation has not created a newer reply or pending draft; never silently merge queues or send one reply from both systems. |
| No customer pilot from restore alone | R29 does not authorize customer recipients; R24 controlled non-customer pilot remains the send gate. |

---

## Restoration plan (PROCEDURE_READY — not enabled)

### Gates (all required)

1. **R24 LIVE_VERIFIED** — owner-recorded controlled pilot evidence in `docs/gmail-operational-acceptance.md` (provider message ID, exactly-once proof, DENY/EDIT MYSELF/MAKE CHANGES non-send behavior, audit identity, queue advancement). Protocol prep alone is insufficient.
2. **Explicit written owner authorization** to restore the four-times-daily approval schedule (separate from R24 send pilot approval).
3. **No competing automation** — owner confirms no parallel Cursor/Vercel/Apps Script approval cron was added; ChatGPT remains the only intended four-slot owner (or owner documents a deliberate single replacement and retires the other).
4. **Send switches remain conservative** — hub `/api/gmail/send` stays 403 unless a separate production send release exists; staging dual opt-ins stay off except during an authorized window.
5. **Calendar boundary** — restore does not schedule `runLVPTTaskSync` or any second reminder writer.
6. **Delivery evidence plan** — owner defines how each restored slot’s run success/failure will be observable (ChatGPT run log or equivalent). Schedule rows alone will not satisfy LIVE_VERIFIED for R29.

### Owner steps after gates (owner-only; Cursor does not execute)

1. Record authorization reference (date, who approved, scope = four-times-daily approval **prompts only**, no auto-send).
2. Confirm R24 evidence log is complete and LIVE_VERIFIED.
3. In the owner’s ChatGPT (or documented successor) schedule UI, restore **only** the four slots above — do not alter Morning/Evening Client Review or Morning Executive Inbox Brief unless the owner separately decides.
4. For the first restored cycle of each slot, record: slot time, run started_at, run outcome (success/fail), whether any send occurred (**must be none** unless a separate approved send), and failure visibility if the run failed.
5. Confirm intent-dedup / doNotRetry path still rejects duplicate sends for the same revision.
6. Confirm no Calendar reminder creates/updates/deletes originated from the approval job.
7. If any gate fails: **disable the schedule again** and escalate. Do not leave a half-restored noisy sender.

### Evidence log (PENDING_OWNER_EVIDENCE)

| Field | Value |
| --- | --- |
| R24 LIVE_VERIFIED recorded | PENDING_OWNER_EVIDENCE |
| Owner restore authorization reference | PENDING_OWNER_EVIDENCE |
| Competing automation scan | PENDING_OWNER_EVIDENCE |
| Slot 6:00 AM ET — first post-restore run evidence | PENDING_OWNER_EVIDENCE |
| Slot 12:00 PM ET — first post-restore run evidence | PENDING_OWNER_EVIDENCE |
| Slot 7:00 PM ET — first post-restore run evidence | PENDING_OWNER_EVIDENCE |
| Slot 12:00 AM ET — first post-restore run evidence | PENDING_OWNER_EVIDENCE |
| Auto-send observed during restore window | Must be **none** / PENDING_OWNER_EVIDENCE |
| Duplicate intent rejected | PENDING_OWNER_EVIDENCE |
| Calendar writes from approval job | Must be **none** / PENDING_OWNER_EVIDENCE |
| Failure visibility confirmed | PENDING_OWNER_EVIDENCE |
| R29 LIVE_VERIFIED | Not claimed |

---

## What Cursor / this task must not do

- Do not enable, create, edit, or delete ChatGPT scheduled tasks.
- Do not add Vercel cron / Apps Script triggers that compete with Morning/Evening reviews, the executive brief, or four-times-daily approvals.
- Do not resume four-times-daily approvals without R24 LIVE_VERIFIED + explicit owner restore authorization.
- Do not call `runLVPTSafeTaskSync` or `runLVPTTaskSync` from this loop.
- Do not reopen hub Gmail send (403) or turn on production send switches.
- Do not treat schedule documentation as notification delivery evidence.
- Do not claim LIVE_VERIFIED for R29 from this preparation document.

---

## What was not done in T44

- No scheduled-task change (ChatGPT or otherwise).
- No four-times-daily approval enablement (remains **DISABLED**).
- No competing automation introduced.
- No Calendar writer change; sole writer remains `runLVPTSafeTaskSync`.
- No live Gmail/SMS send; no clasp push; no production deploy.
- Morning/Evening Client Review and Morning Executive Inbox Brief left untouched (access **NOT_VERIFIED** from Cursor).
- No LIVE_VERIFIED claim for R29.

---

## Remaining blockers

- R24 live controlled acceptance remains BLOCKED_OWNER / PENDING_OWNER_EVIDENCE.
- ChatGPT schedule inventory and last-success timestamps remain NOT_VERIFIED from this workspace.
- R29 restore remains **DISABLED** until R24 LIVE_VERIFIED and explicit owner authorization.
- R27 Calendar live cycles remain a separate gate and must stay sole-writer.

Completion matrix: `docs/command-center-completion-matrix.md`.

COMMAND_CENTER_R29_AUTOMATION_OWNERSHIP_DOCUMENTED
