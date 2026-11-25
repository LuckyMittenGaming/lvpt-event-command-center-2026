# Command Center completion matrix

Issue #7. Draft PR #19. Branch `feature/command-center-completion-20261124`. Decision: **hold production.** This file is the handoff. A passing test is not a live source.

Status words: IMPLEMENTED+TESTED means a local synthetic or source test passed. STAGING means the code is on this draft and still needs an owner session or a live read. LIVE VERIFIED is not used below. DISABLED means the control stays off. BLOCKED means the next step needs the owner or a permission this draft does not have.

| Module | Status | Evidence | Remaining prerequisite |
| --- | --- | --- | --- |
| Record navigation | IMPLEMENTED+TESTED | `public/v2/js/lifecycle-command-center.js` opens one validated event id. `tests/command-center-browser.test.mjs` covers task list, Back, Forward, rapid switch, invalid id, 401 clear, finance and action entry, 1280 and 375. | Owner opens the signed-in preview and confirms two real events do not mix. |
| Daily overview | STAGING | Overview shows ledger receipts, outstanding, new open leads, overdue, due today, undated tasks, open client balances, open vendor bills, and source freshness from the shared operating picture. | The signed-in sheet read is the proof. Counts are not copied into source. |
| Ten views and review link | STAGING | The command nav has the ten existing views. Approvals open `/sms-review/index.html#inboxReviewTitle`. | The HttpOnly review session has to exist on that host. |
| CRM and conversion | STAGING | `lib/action-inbox.mjs` keeps acquisition apart from channel. `conversion.rate` stays null. Booked share is not a conversion rate. | No cohort period is defined. Do not invent one from the current sheet. |
| Proposals | STAGING | An https `proposalUrl` on the event is the only live link. The older six cards stay labeled historical. | Missing links stay missing. |
| Event workspace | STAGING | The read-only record shows setup, quote lines, tasks, staff, compliance, document count, stored mail count, venue, and post-event from that event id. | Sheet writes, task completion, and document changes stay off. |
| Event writes | DISABLED | No save control is rendered. `saveEvents` does not write the sheet. Authenticated `POST /api/sync/events` returns 403 `bulk_event_mutation_disabled` with `writesPerformed: false` and does not call Apps Script. | Granular activation needs owner approval (R28). Isolated contract exists; not wired to this route. |
| Finance | STAGING | `public/v2/js/event-finance.js` keeps client, vendor, fee, tax, refund, and owner rows apart. Drawable cash stays null. Same-amount rows are not merged. A finance row opens that event only. | A complete live payment-row read is still an owner check. NIUM, NEO, and OWS rows were not edited. |
| Gmail headers | STAGING | Bounded header read, stored activity count, and unique thread count stay separate. A nonempty queue is not described as no new threads. | Full threads stay on the authorized thread route. Production writes stay off. |
| Approval send | DISABLED | `app/api/gmail/send/route.ts` returns 403. The hub does not record Approve, Make Changes, Deny, or Edit Myself. The four-times-daily approval job stays disabled. | Owner approval after an exact test recipient, full thread, and idempotent send proof. Do not resume the schedule before that. |
| SMS | BLOCKED | Historical metadata is not a heartbeat. This preview has no `last_success_at` reader. | On the approved handset, run the LVPT SMS bridge and confirm a current `last_success_at`. |
| RCS | BLOCKED | Stored rows do not make the collector live. Send and mark-read stay off. | Pair the read-only collector on the approved computer. |
| Tasks and calendar | STAGING | Open and completed copies of one task id conflict. Due today is not overdue. `runLVPTSafeTaskSync` is still the only reminder writer and was not called. | Confirm one current run in the approved Apps Script project. The hourly schedule is not that run. Two later scheduled cycles are the operational check. |
| Security | STAGING | Private reads use the existing HttpOnly review session. The snapshot is not stored in localStorage. Legacy roster scripts are in `archive/public-roster-2026-11-24/` and are not served by this draft. | Older deployments were not probed. Do not treat them as cleaned. |
| Release | DISABLED | This branch is not merged. No production deploy is part of this package. | Use the ordered checklist in `docs/command-center-staging-acceptance.md`. |

## Selective integration

Do not merge draft PR #6 wholesale. This branch already carries the reviewed staging behavior. A later release is a merge of this draft after the owner checklist, not a second project and not a history rewrite.

Rollback: do not merge. Production stays on its current release. There is no Apps Script or database migration in this package.
