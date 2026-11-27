# Command Center completion matrix

Issue #7. Draft PR #19. Staging integration branch `feature/command-center-completion-20261124`. Local development branch `ai-build/command-center-loop` @ `433beafad25687d470561569c84abefb6745273a`. Decision: **hold production.**

A passing local test is not a live source. Authenticated staging is not claimed from synthetic fixtures.

Status words:

| Word | Meaning |
| --- | --- |
| IMPLEMENTED+TESTED | Local synthetic or source test passed. |
| STAGING | Code is on the draft and still needs an owner session or live read. |
| AUTHENTICATED_STAGING | Owner completed the signed-in preview check on a verified host. Not used below until R22 owner evidence exists. |
| LIVE VERIFIED | Not used below. |
| DISABLED | Control stays off. |
| BLOCKED | Next step needs the owner or a permission this draft does not have. |
| UNKNOWN | Mapping, protection, or preview host not verified this session. |

T37 (2026-11-26): R22 owner checklist prepared in `docs/command-center-staging-acceptance.md`. Candidate revision recorded. Alias mapping and deployment protection left **UNKNOWN**. No deploy and no owner sign-in performed.

T38 (2026-11-26): R23 read-only live completeness comparison procedure prepared in `docs/baselines/live-source-acceptance.md`. Stable-ID set diffs, duplicate/conflict classes, coverage qualifications, finance distinctness, and observation timestamps defined. Live observation cells remain **PENDING_AUTHORIZED_READ**. Historical Part A counts are observations only. No live provider access and no writes.

| Module | Local / code status | Authenticated staging | Evidence | Remaining prerequisite |
| --- | --- | --- | --- | --- |
| Record navigation | IMPLEMENTED+TESTED | NOT STARTED | `public/v2/js/lifecycle-command-center.js` opens one validated event id. `tests/command-center-browser.test.mjs` covers task list, Back, Forward, rapid switch, invalid id, 401 clear, finance and action entry, 1280 and 375. | Owner opens a verified signed-in preview and confirms two real events do not mix (R22). |
| Daily overview | STAGING | NOT STARTED | Overview shows ledger receipts, outstanding, new open leads, overdue, due today, undated tasks, open client balances, open vendor bills, and source freshness from the shared operating picture. Local synthetic Overview assertions pass. | Signed-in sheet read on verified preview is the proof. |
| Ten views and review link | STAGING | NOT STARTED | Command nav has the ten existing views. Approvals open `/sms-review/index.html#inboxReviewTitle`. | HttpOnly review session must exist on that host. |
| CRM and conversion | STAGING | NOT STARTED | `lib/action-inbox.mjs` keeps acquisition apart from channel. `conversion.rate` stays null. Booked share is not a conversion rate. | No cohort period is defined. Do not invent one from the current sheet. |
| Proposals | STAGING | NOT STARTED | An https `proposalUrl` on the event is the only live link. Older six cards stay labeled historical. | Missing links stay missing. |
| Event workspace | STAGING | NOT STARTED | Read-only record shows setup, quote lines, tasks, staff, compliance, document count, stored mail count, venue, and post-event from that event id. | Sheet writes, task completion, and document changes stay off. |
| Event writes | DISABLED | DISABLED | No save control is rendered. Authenticated `POST /api/sync/events` returns 403 `bulk_event_mutation_disabled` with `writesPerformed: false`. | Granular activation needs owner approval (R28). |
| Finance | STAGING | NOT STARTED | `public/v2/js/event-finance.js` keeps client, vendor, fee, tax, refund, and owner rows apart. Drawable cash stays null. Same-amount rows are not merged. R23 comparison procedure requires distinct `payment_id` / `payout_id` sets. | Authorized live payment/payout ID comparison (R23) still pending. |
| Gmail headers | STAGING | NOT STARTED | Bounded header read, stored activity count, and unique thread count stay separate. | Full threads stay on the authorized thread route. Production writes stay off. |
| Approval send | DISABLED | DISABLED | `app/api/gmail/send/route.ts` returns 403. Hub does not record Approve / Make Changes / Deny / Edit Myself. Four-times-daily approval job stays disabled. | Owner approval after exact test recipient, full thread, and idempotent send proof (R24). |
| SMS | BLOCKED | BLOCKED | Historical metadata is not a heartbeat. Preview has no `last_success_at` reader. | Approved handset current `last_success_at` (R25). |
| RCS | BLOCKED | BLOCKED | Stored rows do not make the collector live. Send and mark-read stay off. | Pair read-only collector on approved computer (R26). |
| Tasks and calendar | STAGING | BLOCKED | Open and completed copies of one task id conflict. Due today is not overdue. `runLVPTSafeTaskSync` is the only reminder writer and was not called. | Confirm one current run plus two later scheduled cycles (R27). |
| Security / signed-out privacy | IMPLEMENTED+TESTED (local) | NOT STARTED | Private reads use HttpOnly review session. Synthetic signed-out browser path asserts Owner sign-in required. Snapshot not stored in localStorage. | Owner signed-out check on verified preview (R22). Older deployments NOT VERIFIED. |
| Pipeline / Active classifications | IMPLEMENTED+TESTED (local) | NOT STARTED | Browser harness separates pipeline leads from booked / payment_processing active rows. | Owner confirms live classifications (R22). |
| Mobile navigation | IMPLEMENTED+TESTED (local) | NOT STARTED | Browser harness covers 1280 / 375 / 320 / 280. | Owner phone-width check on verified preview (R22). |
| R22 staging acceptance package | IMPLEMENTED+TESTED (checklist prep) | BLOCKED_OWNER | Consolidated checklist in `docs/command-center-staging-acceptance.md`. Local vs authenticated columns explicit. | Owner signed-in preview after candidate/alias/protection confirmation. |
| R23 live completeness comparison | IMPLEMENTED+TESTED (procedure prep) | BLOCKED_OWNER | `docs/baselines/live-source-acceptance.md` defines Events/Tasks/Payments/Event Payouts/Gmail Activity/Documents stable-ID set comparison, duplicate/conflict treatment, coverage codes, finance distinctness, and `observation_at`. Live cells PENDING_AUTHORIZED_READ. | Owner authorized current read-only evidence after R22; no historical counts as constants. |
| Candidate revision | RECORDED | n/a | Local HEAD `433beafad25687d470561569c84abefb6745273a` (includes T37 R22 checklist). Historical verified remote candidate `292103fc14480adbe84ae9c2404e4fed54ac1bf9` (ancestor). | Owner confirms which revision the acceptance host serves. |
| Preview alias mapping | UNKNOWN | UNKNOWN | Historical alias recorded in `AGENTS.md` only. Not mapped to HEAD this session. | Owner verifies alias → revision before R22. |
| Deployment protection | UNKNOWN | UNKNOWN | Not probed this session. | Owner confirms Vercel Authentication / protection on the acceptance host. |
| Release | DISABLED | DISABLED | Branch not merged. No production deploy in this package. | Use ordered checklist in `docs/command-center-staging-acceptance.md` after R22+. |

## Selective integration

Do not merge draft PR #6 wholesale. This branch already carries the reviewed staging behavior. A later release is a merge of this draft after the owner checklist, not a second project and not a history rewrite.

Rollback: do not merge. Production stays on its current release. There is no Apps Script or database migration in this package.
