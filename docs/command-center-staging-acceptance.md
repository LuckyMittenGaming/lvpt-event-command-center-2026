# Command Center staging acceptance

Decision: **Hold production.** Draft PR #19 is the staging candidate. Do not merge it and do not promote the preview until the owner-only checks below pass. This file is source evidence plus locally simulated tests. It is not a deployed browser session and not a live provider read.

## Capability status

| Capability | Status | Evidence in this repo |
| --- | --- | --- |
| V2 navigation | STAGING | Ten views stay in `lifecycle-command-center.js`. Pipeline, Active, Past, Proposals, and Follow-Up read the owner-session sheet snapshot. A failed read is unavailable, not zero. The browser roster scripts are no longer loaded. |
| Auth entry | STAGING | Private reads call `denyPrivateRead` before Apps Script. `lib/owner-read-guard.mjs` requires the existing HttpOnly review session. A missing cookie is 401. A foreign Origin is 403. The session signer was not changed. |
| Dashboard overview | STAGING | Overview keeps the existing event workspace. Source badges come from the same `sourceStatus` helper as Source Health. Browser roster files are still loaded and are not the sheet ledger. |
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
- The pipeline card is labeled “Quote profit estimate.” It is a browser quote figure, not sheet profit and not drawable cash.

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

The roster files under `public/v2/js/roster-*.js` and `nium-profit-lineaje-neo-update.js` are still deployed as static files and contain client contact fields. The command center no longer loads them. Removing those public files is an owner decision and was not done in this pass.

Local browser evidence is `tests/command-center-browser.test.mjs` against a synthetic fixture and system Chrome. It is not a live sheet or a deployed preview.

COMMAND_CENTER_BROWSER_REGRESSION_READY
