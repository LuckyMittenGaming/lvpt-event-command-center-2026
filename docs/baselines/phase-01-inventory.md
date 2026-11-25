# Phase 0/1 baseline — LVPT Event Command Center

Recorded: 2026-11-12. Local inventory only. No Apps Script push, Calendar write, Gmail/SMS send, Sheet edit, Vercel deploy, or git commit was performed for this baseline.

## Verified workspace

| Item | Value |
|---|---|
| GitHub repository | `LuckyMittenGaming/lvpt-event-command-center-2026` |
| Branch | `feature/lvpt-sms-intelligence-review` |
| HEAD at inventory | `1344896` — Record verified Vercel production-to-GitHub mapping for safe single-workspace Cursor setup |
| Production alias named in handoff | `https://lvpt-event-command-center-2026.vercel.app/v2/index.html` |
| Vercel project named in handoff | `prj_XWIQD5ptbx3J7NnVr1n6EfrdMEFs` |
| Business mailbox | `book@pokertraininglasvegas.com` |
| Tasks spreadsheet | `1oHoVdD5CDcEreyRnB7cEvYfp6wWEgAmf04BwrktkMYs` (Tasks keyed by `task_id`) |
| Other repository | `Las-Vegas-Poker-Training/lvpt-event-command-center-2026` is not the verified production source |

`main` was not checked out. This document does not claim the November 11 deployment commit is still the live alias.

## Ownership

- **Internal task Calendar reminders:** Apps Script `runLVPTTaskSync` in the LVPT Calendar Command Center project. It is the only intended writer of internal task events.
- **Gmail evidence, sheet bridge, owner-approved send:** LVPT Event Command Center Backend. Repository release copy: `apps-script/release/LVPT_Event_Command_Center_v1_2_COMPLETE_Code.gs`. Send function: `lvptStep48SendApprovedReply_`, gated by `LVPT_ENABLE_OWNER_APPROVED_GMAIL_SEND`.
- **Vercel owner-approval send path:** `app/api/sms/staging/reply-send/route.ts`, with decisions in `app/api/sms/staging/reply-decisions/route.ts` and UI in `public/sms-review/reply-review-controls.js`. Tests: `tests/sms-reply-send.test.cjs`, `tests/sms-reply-review.test.cjs`, `tests/sms-reply-send-runtime.test.cjs`.
- **Payment ledger checks (not TaskSync):** `public/sms-review/reconciliation.js` (`checkCase`) and `tests/sms-reconciliation.test.cjs`. Invoice-by-invoice queue: `public/sms-review/action-queue.js` (`buildQueue`) and `tests/sms-action-queue.test.cjs`. Sheet payment enumeration belongs to backend `listReconciliationEvidence` / payment records, not the calendar synchronizer.
- **Public command center:** `public/v2/`. Staging safety suite is `npm run test:staging-safety`, and `prebuild` runs it.

## Source files

Committed release snippets (not a verified full production export):

- `apps-script/Code.gs`
- `apps-script/GmailEvidence.gs`
- `apps-script/GmailDraftContext.gs`
- `apps-script/release/LVPT_Event_Command_Center_v1_2_COMPLETE_Code.gs`

Untracked local clasp pulls (left in place, not overwritten by this baseline):

- `apps-script/live/calendar-command-center/TaskSync.js` — header says TaskSync v3.0, 2026-11-11
- `apps-script/live/calendar-command-center/Code.js`
- `apps-script/live/event-command-center-backend/`
- `apps-script/live/client-event-integration/` (not named in the handoff)

Version-controlled local snapshot, copied after a secret scan and then patched only in this folder:

- `apps-script/calendar-command-center/TaskSync.js`

`.clasp.json`, `.clasprc.json`, and OAuth client files stay gitignored. No clasp mapping was copied.

## Secret scan before the snapshot

`apps-script/live/calendar-command-center/TaskSync.js` was searched for API keys, OAuth client secrets, refresh tokens, private keys, and bearer tokens. None were present. The file contains the already-documented spreadsheet id and `book@pokertraininglasvegas.com`. Calendar `pageToken` variables are list cursors, not credentials. No client message bodies or payment amounts are in that file.

## Behavior of the live TaskSync pull (read locally, not re-executed)

- 15-minute duration, no recurrence field, `sendUpdates: 'none'`, script lock, preview mode.
- Dedupes by `task_id` across the calendars it loads.
- Does not set `transparency: 'transparent'`.
- Does not clear `conferenceData` / Meet links.
- `calendarNames` lists Sales & Follow-Ups, Proposals & Holds, and Operations & Payments only. **LVPT | Confirmed Events is not scanned.**
- A managed event with attendees throws and aborts the run.

## Current risks

- Live Head was not re-pulled. The untracked file may differ from the hourly trigger.
- Nineteen older internal reminders were previously reported to still carry Meet links. That count was not re-scanned.
- `apps-script/live/calendar-command-center/Code.js` contains `setupLVPTCalendars()`, which can grant the personal Gmail address writer ACL on the four business calendars. Task sync must not target that personal calendar. This baseline did not change that file.
- Overlapping automation writers are not proven absent.
- GoHighLevel SMS bodies are encrypted and not a verified readable source.
- Stale payment sentences in task notes can disagree with later owner receipt confirmations. TaskSync must not invent payment status.

## Unverified assumptions

- The local v3 file is the script the installed `runLVPTTaskSync` trigger actually runs.
- The Nov 11 log (`datedActiveTasks: 43`, `unchanged: 43`, zero writes) is still true.
- Exact calendar titles still match the four business names above.
- No second Apps Script project inserts task events.
- Staging SMS tests have not been re-run as part of this baseline document itself.

## Acceptance at the end of Phase 0/1

Green: correct repo and feature branch; clasp credentials ignored; TaskSync source present locally; SMS staging tests exist.

Red before the local calendar patch: no committed four-calendar Free/no-Meet reconciliation; Confirmed Events omitted from the live pull; Meet cleanup not represented in source; deterministic calendar fixtures were absent.
