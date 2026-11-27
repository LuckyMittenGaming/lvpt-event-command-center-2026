# Command Center staging acceptance

Decision: **Hold production.** Draft PR #19 remains the staging integration target. Do not merge it and do not promote any preview until the owner-only R22 checks below pass. This file prepares authenticated staging acceptance. It is **not** a deployed browser session and **not** a live provider read.

T37 / R22 preparation date: 2026-11-26. No deployment and no owner sign-in were performed for this update.

---

## Candidate, preview, and protection evidence

| Item | Status | Verified evidence |
| --- | --- | --- |
| Local workspace branch | RECORDED | `ai-build/command-center-loop` |
| Exact local candidate revision (HEAD) | RECORDED | `4e53021b1d52527a26cbb332d2124c5e2bd11646` — `test: complete and record full local regression` |
| Upstream tracking branch | RECORDED | `origin/feature/command-center-completion-20261124` (local branch ahead by 38 commits) |
| Last independently verified remote candidate | HISTORICAL | `292103fc14480adbe84ae9c2404e4fed54ac1bf9` — ancestor of HEAD; subject `Finish the read-only command center handoff.` |
| Last verified remote CI (historical) | HISTORICAL | GitHub Actions run `45524866760` — SUCCESS (recorded in `AGENTS.md`; not re-run this session) |
| Historical candidate deployment URL | HISTORICAL ONLY | `https://lvpt-event-command-center-2026-7v0lytkyn.vercel.app/v2/index.html` — recorded in `AGENTS.md` as last verified candidate deployment. **Not confirmed current for HEAD.** Do not treat as the R22 target by assumption. |
| Historical branch preview alias | HISTORICAL ONLY | `https://lvpt-event-command-git-8f80fb-matt-carpenters-projects-7f34c5ab.vercel.app` — recorded in `AGENTS.md`. **Not confirmed mapped to HEAD.** |
| Alias → revision mapping | **UNKNOWN** | No Vercel CLI / dashboard mapping check was available this session. Mapping to `4e53021…` or `292103fc…` is unverified. |
| Deployment protection (Vercel Authentication / password) | **UNKNOWN** | Not probed. Owner must confirm protection before treating any preview as the acceptance host. |
| Current staging preview URL for R22 | **UNKNOWN** | Do not invent a URL. Owner supplies or confirms the host that serves the intended candidate after mapping/protection are verified. If a new preview deploy is required to expose local HEAD, that is an owner-authorized Git/deploy step outside this loop. |
| Production URL | HOLD | `https://lvpt-event-command-center-2026.vercel.app/v2/index.html` — not used for R22. Production release remains HOLD. |

If alias mapping or protection cannot be confirmed, stop before signed-in acceptance and escalate. Do not fall back to a historical URL as if it were current.

---

## Status separation: local tests vs authenticated staging

Use these status words only as defined:

| Status | Meaning |
| --- | --- |
| LOCAL_SYNTHETIC_PASS | Deterministic fixture / source / browser harness passed offline. Not live sheet, not owner session. |
| STAGING_CODE_READY | Code is present on the draft candidate and ready for an owner signed-in preview. |
| AUTHENTICATED_STAGING | Owner completed the signed-in check on a verified preview host. |
| LIVE_VERIFIED | Not used in this file for R22. Reserved for later live-source confirmation. |
| UNKNOWN | Evidence missing this session. |
| DISABLED / BLOCKED_OWNER | Control off, or next step requires the owner. |

| R22 acceptance item | Local / synthetic | Authenticated staging |
| --- | --- | --- |
| Signed-out access reveals no private records | LOCAL_SYNTHETIC_PASS — browser harness asserts Owner sign-in required and refuses empty “no deals” fallbacks | NOT STARTED — owner opens verified preview signed out |
| Existing authorized sign-in works | STAGING_CODE_READY — HttpOnly review session + `denyPrivateRead` before provider reads | NOT STARTED — owner completes device-token exchange on that host |
| Overview loads current data | LOCAL_SYNTHETIC_PASS — Overview strip, ledger labeling, delayed/incomplete reads | NOT STARTED — owner confirms live sheet snapshot on Overview |
| Priority task preserves its list | LOCAL_SYNTHETIC_PASS — task expands in overview list; originating list retained | NOT STARTED |
| Two event records never mix | LOCAL_SYNTHETIC_PASS — rapid switch, invalid id, finance/action entry, report isolation | NOT STARTED — two real event ids |
| Browser Back works | LOCAL_SYNTHETIC_PASS — Back returns to originating list/view | NOT STARTED |
| Pipeline classifications correct | LOCAL_SYNTHETIC_PASS — lead / awaiting / unverified lanes; booked and processing excluded from pipeline | NOT STARTED — live statuses |
| Active events appear correctly | LOCAL_SYNTHETIC_PASS — booked + payment_processing in active; declined excluded | NOT STARTED |
| Financial data reconciles to authoritative rows | LOCAL_SYNTHETIC_PASS — invoice/vendor/payout separation; drawable cash null; incomplete totals | NOT STARTED — live Payments / Event Payouts rows |
| Communications statuses understandable | LOCAL_SYNTHETIC_PASS — session vs audit; stored Gmail vs header queue; void not “no new threads” | NOT STARTED |
| Mobile navigation works | LOCAL_SYNTHETIC_PASS — 1280 / 375 / 320 / 280 viewport checks in browser harness | NOT STARTED — owner phone or narrow viewport on verified preview |

Local prerequisite command for this package:

```powershell
node .\tests\command-center-browser.test.mjs
```

A passing local browser test is **not** authenticated staging acceptance.

---

## Capability status (draft code)

| Capability | Local / staging code | Authenticated / live | Evidence in this repo |
| --- | --- | --- | --- |
| V2 navigation | STAGING_CODE_READY | NOT STARTED | Ten views in `lifecycle-command-center.js`. Pipeline, Active, Past, Proposals, and Follow-Up read the owner-session sheet snapshot. A failed read is unavailable, not zero. |
| Auth entry | STAGING_CODE_READY | NOT STARTED | Private reads call `denyPrivateRead` before Apps Script. `lib/owner-read-guard.mjs` requires the existing HttpOnly review session. Missing cookie → 401. Foreign Origin → 403. |
| Dashboard overview | STAGING_CODE_READY | NOT STARTED | Compact global summary. Confirmed upcoming stays separate from dated inquiries. Ledger receipts/outstanding are ledger-recorded, not bank receipts, not drawable cash. |
| Action Required / CRM | STAGING_CODE_READY | NOT STARTED | `lib/action-inbox.mjs` keeps stage, acquisition, and channel separate. Duplicate event ids count once. Conflicting ids excluded. Hub draft is read-only. |
| Approval handoff | STAGING_CODE_READY | NOT STARTED | Hub links to `/sms-review/index.html#inboxReviewTitle`. Approve / Make Changes / Deny / Edit Myself are not recorded on the hub. `readyToSend` stays false. |
| Send | DISABLED | DISABLED | `app/api/gmail/send/route.ts` returns 403. SMS reply route stays `staging_only_no_production_send`. |
| Events lifecycle | STAGING_CODE_READY | NOT STARTED | Pipeline, active, and archive views. Past dates move into the archive. Not a new calendar writer. |
| Sheet finance | STAGING_CODE_READY | NOT STARTED | `public/v2/js/event-finance.js` is read-only. Bank verification stays false. Missing/conflicting payment ids make affected totals Incomplete. |
| Forecast margin | UNVERIFIED | UNVERIFIED | Unavailable until expense completeness, overlap, and tax are established. |
| Drawable cash | UNVERIFIED | UNVERIFIED | Always unavailable from the ledger alone. |
| Tasks | STAGING_CODE_READY | NOT STARTED | Open + completed copies of one task id conflict. Due today is not overdue. |
| Calendar sync | UNVERIFIED | BLOCKED_OWNER | Hourly schedule is not proof `runLVPTSafeTaskSync` ran. Writer not called from this loop. |
| Gmail headers | STAGING_CODE_READY | NOT STARTED | Failed/partial header read is unavailable or partial. Production Gmail writes stay off. |
| Android SMS | UNVERIFIED | BLOCKED_OWNER | Stored row is not a heartbeat. |
| RCS collector | UNVERIFIED | BLOCKED_OWNER | Stored rows do not make the collector live. Send and mark-read stay off. |
| Production deploy | DISABLED | DISABLED | Branch not merged. No production deploy in this package. |

---

## What the local regression covers

`tests/command-center-acceptance.test.mjs` simulates one synthetic path: referral lead, one stable event id, an identical duplicate counted once, a conflicting event excluded, an owned task counted once, an open/completed task conflict, a protected draft that does not send, two client invoices, one vendor bill, one unlinked vendor payout, and one owner draw. Forecast margin includes the unpaid vendor bill and the planned vendor payout. Drawable cash stays null. Failed Gmail header read and stored SMS without heartbeat stay unavailable / not verified.

`tests/command-center-browser.test.mjs` exercises synthetic signed-out privacy, Overview, pipeline/active classification, task-list preservation, event isolation, Back navigation, finance entry, communications labeling, and mobile widths against a local fixture and system Chrome. It is not a live sheet and not a deployed preview.

Full local gate evidence (R21 / T36): `docs/baselines/t36-full-local-regression.md` — LOCAL_SYNTHETIC_PASS only.

---

## R22 — One owner checklist

Owner-only checks. Do these in order on a **verified** staging host. Stop at the first failed expected result. None of these steps is a production deploy. None may be marked AUTHENTICATED_STAGING from local tests alone.

### Preconditions (owner)

0. Confirm the preview host maps to the intended candidate revision and that deployment protection is active. If mapping or protection is **UNKNOWN**, do not continue with historical URLs by assumption. Record the exact URL and revision used.

### Acceptance steps

1. **Signed-out privacy.** Open `/v2/index.html` on that host while signed out. Expected: Owner sign-in required; no event names, task titles, message bodies, or invoice amounts.
2. **Authorized sign-in.** Open `/sms-review/index.html` on the same host and finish the existing device-token exchange. Expected: HttpOnly review cookie set. Command-center private reads before that cookie stay 401.
3. **Overview current data.** Return to `/v2/index.html` signed in. Expected: sheet-backed Overview loads; global summary stays global; ledger lines stay ledger-recorded (not bank / not drawable cash); priority tasks appear without inventing zero totals on failed reads.
4. **Task-list preservation.** Expand or open a priority task from the overview / action list. Expected: the originating task list remains; the task does not destroy navigation context.
5. **Event isolation.** Choose View associated event, then open a second distinct event from Pipeline or Finance. Expected: heading, client, tasks, staff, invoices, and documents belong only to the event just opened. No fallback to the first event.
6. **Browser Back.** Use Browser Back after opening a record. Expected: return to the list/view you came from (Pipeline, Finance, or Overview), with search/filter context preserved where applicable.
7. **Pipeline classifications.** Open Pipeline. Expected: open / inquiry / awaiting-style rows appear; booked and payment-processing rows do not masquerade as pipeline deals; declined/closed stay out.
8. **Active events.** Open Active. Expected: booked and payment-processing appear under Active with correct labels; payment-processing is not treated as paid-in-full receipt; pipeline-only leads do not appear as active bookings.
9. **Financial reconciliation.** Open Event Finance (and a sample event record). Expected: client invoices, vendor bills, and payouts stay in separate rows with stable payment/payout ids; same amounts are not merged across ids; Payment Initiated / refund are not labeled bank receipt; drawable cash stays unavailable; Incomplete when ids conflict or are missing.
10. **Communications statuses.** Open Communications. Expected: session line separate from audit line; stored Gmail Activity rows and unique thread ids separate from the bounded header queue; a void/failed read is not “no new threads”; SMS metadata is not a heartbeat.
11. **Mobile navigation.** At a phone-width viewport (or approved handset), cycle the command nav. Expected: selected view remains visible and usable; no horizontal page overflow that hides primary controls; record open/close still works.

### Related owner ops (not R22 pass criteria, still blocked)

These remain separate from the R22 AUTHENTICATED_STAGING mark:

- Approved handset: current Android `last_success_at` (R25).
- Approved computer: read-only RCS pairing (R26).
- Apps Script: one confirmed `runLVPTSafeTaskSync` run plus two later scheduled cycles (R27). Do not run `runLVPTTaskSync`.
- Do not resume the four-times-daily Gmail approval job (R24 / R29).

---

## Release and rollback

Release, if the owner accepts it later: merge the staging draft only after R22 and dependent owner checks, then let the existing preview promotion path update the staging alias. Do not deploy Apps Script, change SQL, or enable send as part of that merge.

Rollback: do not merge. Production stays on its current release. Revert the staging branch if the preview is wrong. There is no Apps Script or database migration in this package to undo. The existing calendar writer is unchanged.

---

## Remaining blockers

- Authenticated staging browser acceptance (**R22**) is **BLOCKED_OWNER**.
- Current preview URL, alias→revision mapping, and deployment protection are **UNKNOWN** this session.
- No live Apps Script, Gmail, SMS, RCS, or calendar call was made for T37.
- Forecast margin and drawable cash stay unavailable from ledger-only evidence.
- The hub still cannot record an approval or prove exactly-once delivery.

Local browser evidence remains synthetic. Completion matrix: `docs/command-center-completion-matrix.md`.

COMMAND_CENTER_BROWSER_REGRESSION_READY

COMMAND_CENTER_OPERATIONS_RETEST_READY

COMMAND_CENTER_RECORD_NAVIGATION_READY

COMMAND_CENTER_FULL_COMPLETION_HANDOFF_READY

COMMAND_CENTER_R22_ACCEPTANCE_CHECKLIST_READY
