# Command Center staging acceptance

Decision: **Hold production.** Draft PR #19 is the staging candidate. Do not merge it and do not promote the preview until the owner-only checks below pass. This file is source evidence plus locally simulated tests. It is not a deployed browser session and not a live provider read.

## Capability status

| Capability | Status | Evidence in this repo |
| --- | --- | --- |
| V2 navigation | STAGING | Ten views stay in `lifecycle-command-center.js`. Pipeline, Active, Past, Proposals, and Follow-Up read the owner-session sheet snapshot. A failed read is unavailable, not zero. The browser roster scripts are no longer loaded. |
| Auth entry | STAGING | Private reads call `denyPrivateRead` before Apps Script. `lib/owner-read-guard.mjs` requires the existing HttpOnly review session. A missing cookie is 401. A foreign Origin is 403. The session signer was not changed. |
| Dashboard overview | STAGING | Overview is a compact global summary. Confirmed upcoming events stay separate from dated inquiries. Ledger receipts and outstanding come from the shared operating-picture read and are labeled ledger-recorded, not bank receipts and not drawable cash. |
| Action Required / CRM | STAGING | `lib/action-inbox.mjs` keeps stage, acquisition, and channel separate. Duplicate event ids count once. Conflicting ids are excluded. The hub draft is read-only. |
| Approval handoff | STAGING | The hub links to `/sms-review/index.html#inboxReviewTitle`. Approve, Make Changes, Deny, and Edit Myself are not recorded on the hub. `readyToSend` stays false. |
| Send | DISABLED | `app/api/gmail/send/route.ts` returns 403. The SMS reply route stays `staging_only_no_production_send`. |
| Events lifecycle | STAGING | Pipeline, active, and archive views are the existing browser lifecycle. Past dates move into the archive. This is not a new calendar writer. |
| Sheet finance | STAGING | `public/v2/js/event-finance.js` is read-only. Bank verification stays false. A missing payment or payout id is excluded. A conflicting id makes the affected total Incomplete. A payout is dropped only when it links to an included vendor bill on the same event. |
| Forecast margin | UNVERIFIED | A ledger estimate of client invoices minus vendor bills and unlinked vendor payouts. Owner draws are not operating expenses. It stays unavailable until expense completeness, overlap, and tax are established. No 3.5% tax is invented. |
| Drawable cash | UNVERIFIED | Always unavailable from the ledger. Receipts, paid costs, and planned obligations do not verify the cash balance, bank settlement, tax reserve, prior distributions, or overlap. |
| Ledger contribution | STAGING | Recorded receipts minus recorded paid costs and recorded paid draws. Not bank-verified and not drawable cash. Unavailable while a planned or unpaid obligation remains. |
| Tasks | STAGING | Open and completed copies of one task id are a conflict. The open copy does not survive alone. A supplied owner is kept. Due today is not overdue. |
| Calendar sync | UNVERIFIED | Safe TaskSync shows an hourly schedule. That schedule is not proof `runLVPTSafeTaskSync` ran. The writer was not called and was not changed. |
| Gmail headers | STAGING | A failed or partial header read is unavailable or partial, metadata only, and not a full mailbox. Production Gmail writes stay off. |
| Android SMS | UNVERIFIED | A stored row is not a heartbeat. This preview has no heartbeat reader. |
| RCS collector | UNVERIFIED | Stored rows do not make the collector live. Send and mark-read stay off. |
| Production deploy | DISABLED | This branch is not merged. No manual production deploy is part of this package. |

## What the local regression covers

`tests/command-center-acceptance.test.mjs` simulates one synthetic path: referral lead, one stable event id, an identical duplicate counted once, a conflicting event excluded, an owned task counted once, an open/completed task conflict, a protected draft that does not send, two client invoices, one vendor bill, one unlinked vendor payout, and one owner draw. Forecast margin includes the unpaid vendor bill and the planned vendor payout. Drawable cash stays null, including when the ledger shows $1,000 of receipts beside $200, $80, and $300 still unpaid or planned. A second ledger with a missing id, a conflicting id, and a payout linked to a client invoice leaves the affected totals incomplete. The test also simulates a failed Gmail header read and a stored SMS row with no heartbeat.

The same test checks the navigation labels and the CSS breakpoints already in the repo (`280`, `320`, `720`, `1120`, plus horizontal overflow hidden). That is a source check. No browser was opened and no new browser service was added.

## Owner-only checks

These are not done by the local tests:

- Open the review workspace and complete the existing device-token exchange. Without the HttpOnly cookie, command-center reads stay closed.
- On the approved handset, run the LVPT SMS bridge and confirm a current `last_success_at`. This preview cannot read that report.
- Pair the read-only RCS collector on the approved computer.
- Sign in to the business mailbox and confirm whether the unattended staging Apps Script header job completed. A header read is still not a full thread.
- Confirm a current run of `runLVPTSafeTaskSync` in the approved Apps Script project.
- Confirm the live Apps Script response includes one row per payment and one row per payout before treating sheet totals as complete.
- Decide whether expense completeness, overlap, and tax are established before using forecast margin. Drawable cash is not available from this ledger.
- A positive `setup.targetQuote` is a recorded target quote, shown apart from line items. A blank target and an explicit zero both arrive as 0 from `listEvents`, so 0 is not shown as a recorded target. A budget range is not a quote. Quote profit appears only when every priced line has a cost. Missing cost is not zero.

## Release and rollback

Release, if the owner accepts it later: merge this draft only after the owner-only checks, then let the existing preview promotion path update the staging alias. Do not deploy Apps Script, change SQL, or enable send as part of that merge.

Rollback: do not merge. Production stays on its current release. Revert this branch if the preview is wrong. There is no Apps Script or database migration in this package to undo. The existing calendar writer is unchanged.

## Remaining blockers

- No deployed browser pass was run for this package. Responsive evidence is the CSS and navigation source.
- No live Apps Script, Gmail, SMS, RCS, or calendar call was made.
- Forecast margin stays unavailable on the current sheet read. Drawable cash stays unavailable even after a ledger looks settled.
- The pipeline quote estimate is not the sheet forecast.
- The hub still cannot record an approval or prove exactly-once delivery.
- Android heartbeat, RCS pairing, Gmail full threads, and a confirmed TaskSync run are still owner prerequisites.

Legacy roster scripts now live in `archive/public-roster-2026-11-24/` and are not part of the public site output for this draft. Git history still contains them. This check did not request the deployed or older production URLs, so it does not say whether those older deployments still serve the files.

Local browser evidence is `tests/command-center-browser.test.mjs` against a synthetic fixture and system Chrome. It is not a live sheet or a deployed preview.

COMMAND_CENTER_BROWSER_REGRESSION_READY

Operating read on this draft: one in-memory operating-picture snapshot is shared across finance, communications, and health. It uses the 50 second read. A timeout is timed out, not disconnected. A 401 or refresh drops that snapshot. Audit health is not the owner session. SMS metadata, the Android heartbeat, stored Gmail, the bounded header read, and RCS pairing stay separate. Action Required is a short list with source status on demand. The hub still does not approve or send.

COMMAND_CENTER_OPERATIONS_RETEST_READY

Record navigation on this draft: a task opens in the overview list. View associated event and the existing record buttons open one read-only record for a validated event id. There is no fallback to the first event. Browser Back stays inside the app view that was open. A 401 or refresh clears the open record. Stored Gmail activity rows and unique thread ids stay separate from the bounded header queue.

COMMAND_CENTER_RECORD_NAVIGATION_READY

The completion matrix is `docs/command-center-completion-matrix.md`. Safe read-only work on this draft is in that matrix. Live verification is not claimed.

## One owner checklist

Do these in order. Stop at the first failed expected result. None of these steps is a production deploy.

1. Open the staging preview for this branch while signed out. Expected: Owner sign-in required, and no event, task, or message body.
2. Open `/sms-review/index.html` on that same host and finish the existing device-token exchange. Expected: the HttpOnly review cookie exists. Command-center reads before that cookie stay 401.
3. Return to `/v2/index.html`. Expected: the sheet list loads, Overview stays global, and a priority task expands in the list.
4. Choose View associated event, then open a second event from Pipeline or Finance. Expected: headings, tasks, staff, and invoice rows belong to the event just opened. Browser Back returns to the list you came from.
5. Open Event Finance. Expected: client invoices, vendor bills, and payouts stay in separate rows. Drawable cash stays unavailable. A refund or Payment Initiated row is not labeled as a bank receipt.
6. Open Communications. Expected: the session line and the audit line are separate. Stored Gmail Activity rows and unique thread ids are separate from the header queue. A queue row is not described as no new threads.
7. Open Source Health. Expected: a missing heartbeat stays not verified. A blocked read is not labeled as a disconnected provider.
8. On the approved handset, run the LVPT SMS bridge and record `last_success_at`. Expected: a timestamp from that run. This preview cannot read it. A stored SMS count is not that timestamp.
9. On the approved computer, pair the read-only RCS collector. Expected: the collector reports paired. Send and mark-read stay off.
10. In the approved Apps Script project, run `runLVPTSafeTaskSync` once and note the execution time. Expected: one execution record. The hourly trigger is not that record. Do not run `runLVPTTaskSync`.
11. After that run, watch two later scheduled cycles of the hourly trigger. Expected: two more execution records that do not delete cancelled reminders or mark internal reminders Busy.
12. Do not resume the four-times-daily Gmail approval job. Expected: it stays disabled until a later approval that names a test recipient, a full thread, and an idempotent send. Sending stays off in this draft.

COMMAND_CENTER_FULL_COMPLETION_HANDOFF_READY
