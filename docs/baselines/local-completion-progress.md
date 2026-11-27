# Local completion progress

Persistent automation resume record for `remaining-spec.md` tasks R00–R31.
Updated: 2026-11-25 (America/New_York inspection window).
Companion reconciliation: `docs/baselines/local-baseline-reconciliation.md`.

Rules:

- Do not store credentials, tokens, customer content, or private sheet values here.
- Do not modify completed historical phase baseline documents.
- Local agents must not commit or push.
- Prefer `VERIFIED_EXISTING` over rewrite when evidence already satisfies a task.

---

## Workspace snapshot (latest inspection)

| Field | Value |
| --- | --- |
| Branch | `ai-build/command-center-loop` |
| HEAD | includes `1c9b1ec` (pinned playwright-core 1.65.1) |
| Upstream | `origin/feature/command-center-completion-20261124` |
| Candidate included | `292103fc14480adbe84ae9c2404e4fed54ac1bf9` (ancestor of HEAD) |
| Working tree | Browser harness + verify runner + local-test-environment docs; untracked `.orchestrator/` + `scripts/verify-command-center.ps1` + `tests/verify-command-center.test.mjs` |
| Node | PATH `v24.22.1` (**owner-approved** for all local verification); Program Files `v24.19.0`; CI remains Node 22 |
| npm | 11.17.0 |
| Chrome | Program Files Chrome 158 resolved by harness; `LVPT_CHROME_PATH` supported |
| playwright-core | Available locally (`1.65.1`); browser regression exit 0 |
| Newest completed phase baseline | `docs/baselines/phase-07m-production-sync.md` |

---

## Task register

### R00 — Preserve and reconcile the local baseline

| Field | Value |
| --- | --- |
| Status | IMPLEMENTED_TESTED |
| Date/time | 2026-11-25 |
| Files inspected | `AGENTS.md`, `remaining-spec.md`, `docs/LVPT_CURSOR_HANDOFF.md`, `docs/command-center-completion-matrix.md`, `docs/command-center-staging-acceptance.md`, `docs/baselines/**` (phase-01 through phase-07m + hub audit), `package.json`, `package-lock.json`, `.github/workflows/sms-intelligence-review-ci.yml`, key V2/lib/test/calendar paths |
| Files changed | `docs/baselines/local-baseline-reconciliation.md` (created), `docs/baselines/local-completion-progress.md` (created) |
| Exact test commands | Read-only Git/environment inspection commands from R00 verification block; post-task `git status --short`, `git diff --check`, `Test-Path` on both report files |
| Exit codes | Inspection commands exit 0; report paths created |
| Evidence | Candidate is ancestor of HEAD; additive commit `8703954` carries phase-07m + calendar evidence; no protected files modified |
| Remaining blocker | None for R00 |
| Next task | R01 |

### R01 — Establish the Windows verification environment

| Field | Value |
| --- | --- |
| Status | **IMPLEMENTED_TESTED** |
| Date/time | 2026-11-25 |
| Dependencies | R00 |
| Files inspected | PATH Node `v24.22.1`; Program Files Node `v24.19.0`; `tests/command-center-browser.test.mjs`; `scripts/verify-command-center.ps1`; `tests/verify-command-center.test.mjs`; CI workflow still pins Node 22 (unchanged) |
| Files changed (T2) | `tests/command-center-browser.test.mjs`, `docs/baselines/local-test-environment.md` |
| Files changed (T3) | `scripts/verify-command-center.ps1` (NEW), `tests/verify-command-center.test.mjs` (NEW), `docs/baselines/local-test-environment.md` |
| Files changed (T3 finish / owner Node 24 approval) | `docs/baselines/local-test-environment.md`, `docs/baselines/local-completion-progress.md` |
| Owner decision | **Approved** — installed local Node 24 (`node -v` → `v24.22.1`) is authorized for local verification across all tasks; do not re-escalate over CI Node 22 vs local 24 |
| Exact test commands | `node --version` → `v24.22.1`; `npm.cmd --version` → `11.17.0`; `node .\tests\verify-command-center.test.mjs`; `powershell.exe -NoProfile -File .\scripts\verify-command-center.ps1 -Mode Targeted -TestFiles tests/command-center-acceptance.test.mjs` |
| Exit codes | runner regression **0**; Targeted acceptance **0** |
| Evidence | Targeted/Full inventories explicit; fail-fast stops later Targeted files; Full retains CI syntax+regressions, local-phase offline suite, staging-safety, acceptance, browser, tsc, build; credential env stripped; no workflow/manifest edits; no live dry-run |
| Remaining blocker | None for R01. Full-suite green run remains R21 |
| Next task | R02 / T4 orchestration policy |

### R02 — Establish local orchestration safety

| Field | Value |
| --- | --- |
| Status | **IMPLEMENTED_TESTED** |
| Date/time | 2026-11-25 |
| Dependencies | R00 |
| Files inspected | `.orchestrator/current-prompt.md`, `.orchestrator/state.json`, `remaining-spec.md` R02, `AGENTS.md` §§7/11/16/19/20, installed CLI help (`agent --help`, `agent worker --help`), T4 policy modules |
| Files changed (T4) | `scripts/local-agent-policy.json`, `scripts/local-agent-policy.mjs`, `tests/local-agent-policy.test.mjs`, `docs/baselines/local-completion-progress.md` |
| Files changed (T5) | `scripts/local-agent-loop.ps1` (NEW), `scripts/local-agent-loop.mjs` (NEW), `tests/local-agent-policy.test.mjs`, `docs/local-agent-loop.md` (NEW), `docs/baselines/local-completion-progress.md` |
| Exact test commands | `node .\tests\local-agent-policy.test.mjs`; `powershell.exe -NoProfile -File .\scripts\local-agent-loop.ps1 -DryRun` |
| Exit codes | policy+loop regression **0**; DryRun **0** |
| Policy vs executor | **T4 = policy definition** (allowlist, floors, unconditional repository-execution deny). **T5 = resumable dry-run executor** — task selection, exclusive lock, attempt/spend persistence, sanitized failures, dirty-baseline hashes; paid/worker launch **fail-closed** (`insufficient-isolation`). Env/`fromTrustedExecutor`/`isolationSatisfied` markers do **not** authorize. Protected policy files untouched by T5. |
| Integration path | `.orchestrator/` → `scripts/local-agent-policy.mjs` → `scripts/local-agent-loop.ps1`/`.mjs` → lock `.orchestrator/worker.lock` + `loop-state.json`. No competing loop. |
| Evidence | DryRun selects T5 without AI/API/CLI auth; lock contention tested; retry exhaustion at attempt 4; secrets redacted in failure reports; measured spend persists without credentials; unexpected protected changes stop without restore; CLI `--sandbox`/`--worktree` inspected and judged inadequate for credential isolation |
| Remaining blocker | Owner-approved paid budget + real trusted workspace/network/credential isolation executor before enabling paid/worker launch or redesigning repository-execution deny gate |
| Next task | R03 / T6 — verify selected-record identity |

### R03 — Verify stable event identity and record navigation

| Field | Value |
| --- | --- |
| Status | **VERIFIED_EXISTING** (T6 identity + T7 navigation) |
| Date/time | 2026-11-25 |
| Dependencies | R00, R01 |
| Files inspected (T6) | `public/v2/js/core.js`, `public/v2/js/authoritative-finance.js`, `public/v2/js/lifecycle-command-center.js`, `public/v2/js/sheet-snapshot.js`, `public/v2/js/dashboard-base.js`, `public/v2/js/dashboard-upgrades.js`, `public/v2/js/unified-hub.js` |
| Files inspected (T7) | `public/v2/js/lifecycle-command-center.js` (ten `data-command-view` entry points, expandable task panel, `View associated event`, `data-back-list`/`data-close-task`, `listMemory` scroll, `popstate`/`history.back`, manual `scrollRestoration`), `public/v2/js/unified-hub.js` (`lvptRememberActionView`, `actionUi` filter/query/scroll restore), `tests/command-center-browser.test.mjs`, `tests/command-center-acceptance.test.mjs` |
| Files changed (T6) | `tests/command-center-browser.test.mjs` only; identity owners unchanged |
| Files changed (T7) | `tests/command-center-browser.test.mjs`, `tests/command-center-acceptance.test.mjs`; navigation owners unchanged — no demonstrated regression |
| Exact test commands | `powershell.exe -NoProfile -File .\scripts\verify-command-center.ps1 -Mode Targeted -TestFiles tests/command-center-browser.test.mjs,tests/command-center-acceptance.test.mjs` |
| Exit codes | Targeted verify **0** (browser **0**, acceptance **0**) |
| Evidence (T6) | Exact `data-task-id` / `data-record-event` binding; client/company input values; document counts; **both** selected-event report actions (`pre` and `post`) isolated for lead and delayed-active records; invalid event Unavailable + invalid task missing note without opening another record; rapid open discards stale event; delayed ledger race; unauthorized path clears private report + record surfaces. Never restored first-event fallback. |
| Evidence (T7) | Opening a task keeps Priority open tasks list + Close; View associated event binds exact `evt-lead`; Back to list returns to expanded task then Close restores overview scroll; proposal search `zzz-filter` restored; Action Required filter `all` + search `Synthetic Lead` + scroll + card sort restored via Back to list; finance record Back/Forward restores Event Finance without `sms-review` redirect; all ten views exercised at 375px with active nav + no overflow + no sign-in redirect; authenticated Close/Back stay on `/v2/`. Acceptance static checks for `popstate`, `scrollRestoration`, `history.back`, back/close controls, ten view ids, and `actionUi` memory. |
| Remaining blocker | None for R03. Live authenticated acceptance remains R22+ |
| Next task | R04 / T8 |

### R04 — Verify and complete executive dashboard

| Field | Value |
| --- | --- |
| Status | IMPLEMENTED_TESTED (T8 metrics + T9 presentation) |
| Date/time | 2026-11-25 |
| Dependencies | R03 |
| Files inspected | `public/v2/js/lifecycle-command-center.js`, `public/v2/js/unified-hub.js`, `public/v2/js/authoritative-finance.js`, `public/v2/js/event-finance.js`, `public/v2/js/event-status.js`, `public/v2/lifecycle-command-center.css`, `public/v2/unified-hub.css`, `public/v2/responsive-polish.css`, `tests/command-center-browser.test.mjs`, `tests/event-finance.test.cjs`, `remaining-spec.md` R04, staging acceptance / completion matrix Overview rows |
| Files changed (T8) | `public/v2/js/lifecycle-command-center.js`, `public/v2/js/unified-hub.js`, `tests/command-center-browser.test.mjs`, `docs/baselines/local-completion-progress.md` |
| Files changed (T9) | `public/v2/lifecycle-command-center.css`, `public/v2/unified-hub.css`, `tests/command-center-browser.test.mjs`, `docs/baselines/local-completion-progress.md` |
| Exact test commands | T8: `powershell.exe -NoProfile -File .\scripts\verify-command-center.ps1 -Mode Targeted -TestFiles tests/command-center-browser.test.mjs,tests/event-finance.test.cjs`; T9: `node .\tests\command-center-browser.test.mjs` |
| Exit codes | T8 targeted verify **0**; T9 browser **0** |
| Evidence (T8) | Compact Overview kept. Shared operating-picture read drives receipts, outstanding, vendor obligations, balances, freshness, exceptions. `moneyFieldLabel` honors `money.coverage` — incomplete/unverified coverage does not render numeric totals when `incompleteFields` is absent/empty. Browser regression: incomplete coverage + zero cents + empty/absent `incompleteFields` → no misleading `$0.00`. Targets separate from priced lines; tasks remain navigable. |
| Evidence (T9) | No redesign. Dark/gold/burgundy preserved. Overview keeps historical full editor, layout-grid, metrics, hub strip, and tab panel hidden by default (no Full Event Editor, no giant empty body children). Currency/summary figures use tabular-nums + overflow-wrap; label contrast raised `#71717a`→`#a1a1aa`; command-nav/action `:focus-visible` gold outline; selected nav/filter states remain readable. Overflow checked at 1280/375/320/280. Browser helpers `assertCompactPresentation` + `assertCommandNavKeyboardFocus`. |
| Remaining blocker | Authenticated staging owner confirmation later (R22). Not LIVE_VERIFIED. |
| Next task | R05 / actionable inbox |

### R05 — Complete actionable inbox behavior

| Field | Value |
| --- | --- |
| Status | IMPLEMENTED_TESTED (T10 + T11 + supervisor revisions) |
| Date/time | 2026-11-25 |
| Dependencies | R03 |
| Files inspected | `lib/action-inbox.mjs`, `app/api/sync/action-inbox/route.ts`, `public/v2/js/unified-hub.js`, `public/v2/unified-hub.css`, `tests/action-inbox.test.mjs`, `tests/command-center-browser.test.mjs`, `remaining-spec.md` R05, `.orchestrator/current-prompt.md` |
| Files changed (T10) | `lib/action-inbox.mjs`, `tests/action-inbox.test.mjs` |
| Files changed (T11) | `public/v2/js/unified-hub.js`, `public/v2/unified-hub.css`, `tests/command-center-browser.test.mjs`, `docs/baselines/local-completion-progress.md` |
| Exact test commands | `powershell.exe -NoProfile -File .\scripts\verify-command-center.ps1 -Mode Targeted -TestFiles tests/action-inbox.test.mjs,tests/command-center-browser.test.mjs` |
| Exit codes | Targeted verification **0** (action-inbox 0; browser 0) after third supervisor revision |
| Evidence (T10) | Synthetic matrix covers new_inquiry, reply_required, follow_up_due, payment_confirmation, event_task, vendor_obligation, needs_review, resolved with explicit `classification.evidence`. Inbound reply requirements stay distinct from overdue follow-ups. Stable-ID dedup + event/task conflicts + ambiguous SMS remain reviewable. Vendors and resolved excluded from `counts.actionRequired` / default hub action filter. Route keeps `denyPrivateRead` before provider reads; no mutation exports; `writesPerformed`/`sendEnabled` false. Booked-without-tasks stays `needs_review`; booked-with-open-task is `event_task`. |
| Evidence (T11) | Action Required UI: search + visible status filters with `aria-pressed`; priority-then-due ordering; expandable minimal evidence; exact event/review links; stored Gmail not verified; no approve/send/receipt controls; `actionUi` state preserved. |
| Evidence (T11 revision 1) | `dueState()` validates real calendar dates; missing due → `undated`, invalid/unavailable today → `unknown`; never infers overdue from `follow_up_due`. Browser regressions for due today / missing / invalid dates and conflicting IDs. |
| Evidence (T11 revision 2) | Same-ID disagreements and missing ids surface as integrity exceptions; identical copies collapse; recipient/evidence twin conflicts covered. |
| Evidence (T11 revision 3) | `canonicalizeActionValue()` preserves strings exactly and builds sorted `Object.create(null)` objects. `actionRecordSignature()` serializes the full record (no lossy projections); omit-set reserved only for proven non-semantic keys. Browser regressions: evidence whitespace-only conflict, draft body conflict, reordered-key identical collapse; navigation assertions preserved. Not LIVE_VERIFIED. |
| Remaining blocker | Authenticated staging later (R22). |
| Next task | R06 / CRM attribution |

### R06 — Complete CRM, SEO attribution and conversion reporting

| Field | Value |
| --- | --- |
| Status | IMPLEMENTED_TESTED (T12 semantics + T13 presentation) |
| Date/time | 2026-11-25 |
| Dependencies | R05 |
| Files inspected | `lib/action-inbox.mjs`, `public/v2/js/event-status.js`, `public/v2/js/lifecycle-command-center.js`, `public/v2/js/unified-hub.js`, `tests/action-inbox.test.mjs`, `tests/event-status.test.mjs`, `tests/crm-attribution.test.mjs`, `remaining-spec.md` R06, `.orchestrator/current-prompt.md` |
| Files changed (T12) | `lib/action-inbox.mjs`, `public/v2/js/event-status.js`, `public/v2/js/lifecycle-command-center.js`, `tests/event-status.test.mjs`, `tests/crm-attribution.test.mjs`, `docs/baselines/local-completion-progress.md` |
| Files changed (T13) | `public/v2/js/lifecycle-command-center.js`, `public/v2/js/unified-hub.js`, `tests/crm-attribution.test.mjs`, `docs/baselines/local-completion-progress.md` |
| Exact test commands | `node .\tests\crm-attribution.test.mjs` |
| Exit codes | crm-attribution **0** |
| Evidence (T12) | Raw lifecycle preserved on event rows as `lifecycleRaw` beside normalized `pipelineStage`. Outcome Unverified is distinct stage `outcome_unverified` (not generic unknown); needsOutcomeReview remains true. Declined/cancelled/closed/completed stay out of `activeProspectEventIds` / action queue. Acquisition kinds organic/referral/form/utm/recorded/unknown stay separate from Gmail/SMS/RCS `channel`; empty leadSource stays unknown; UTM does not invent from Phone/channel. Valid events counted once; conflicting ids reported in `pipeline.excluded.eventConflicts`. `conversion.rate` remains null. No analytics provider or GHL schema change. Not LIVE_VERIFIED. |
| Evidence (T12 revision) | `lifecycleRaw` copies exact `event.status` (not normalized `lifecycle.raw`). `classifyStatus` / `eventLane` return original `raw` plus `normalized` matching value. Unicode-dash (`\u2014`/`\u2013`) and repeated-whitespace fixtures assert exact original preservation while stages stay correct. Pipeline subgroup matchers use `normalized \|\| raw`. |
| Evidence (T13) | `LVPTCrmAttribution` presentation API exposes acquisition vs channel lines, conversion reports that name cohort/period/denominator, and booked share under its own label. Pipeline view shows CRM attribution panel + per-card acquisition. Action Required shows the same panel and distinct acquisition/channel on cards. Conversion rate stays Unavailable without cohort+period+outcome denominator; eligible fixtures can compute a rate without relabeling booked share. No public SEO/conversion page changes. Not LIVE_VERIFIED. |
| Evidence (T13 revision) | `conversionReport` requires cohort, period, non-negative whole `outcomeNumerator`/`outcomeDenominator` with numerator ≤ denominator; derives rate or validates supplied rate (±0.0001); rejects conflicting `cohortDenominator`, negative counts, and mismatched rates. Available reports keep the supplied/derived explanation and never use the default “No eligible cohort and period” copy. Contradictory fixtures covered in `tests/crm-attribution.test.mjs`. |
| Remaining blocker | No eligible cohort/period for a real conversion rate on live data — intentionally unavailable. Authenticated staging later (R22). |
| Next task | R07 / proposal and event portfolio |

### R07 — Verify proposal and event portfolio accuracy

| Field | Value |
| --- | --- |
| Status | IMPLEMENTED_TESTED (T14 + supervisor revision) |
| Date/time | 2026-11-25 |
| Dependencies | R06 |
| Files inspected | `public/v2/js/lifecycle-command-center.js`, `public/v2/js/event-status.js`, `tests/event-status.test.mjs`, `tests/command-center-browser.test.mjs`, `remaining-spec.md` R07, `.orchestrator/current-prompt.md`, matrix Proposals row |
| Files changed | `public/v2/js/event-status.js`, `public/v2/js/lifecycle-command-center.js`, `tests/event-status.test.mjs`, `tests/command-center-browser.test.mjs`, `docs/baselines/local-completion-progress.md` |
| Exact test commands | `powershell.exe -NoProfile -File .\scripts\verify-command-center.ps1 -Mode Targeted -TestFiles tests/event-status.test.mjs,tests/command-center-browser.test.mjs` |
| Exit codes | Targeted verify **0** (event-status 0; browser 0) after revision |
| Evidence | Historical six-card library forced to `Historical reference, not verified` (no Proposal Active / Accepted as live). Sheet https `proposalUrl` is the only authoritative link; invalid/non-https/credentialed URLs surface under Invalid or incomplete links without showing the raw URL; missing count stays explicit with no invented URL. Portfolio/pipeline “linked” uses validated sheet URL only (not historical eventId design refs). Event Record on historical cards only when that exact id exists in the signed-in snapshot. `payment_processing` stays Active and distinct from `booked`; declined/completed/closed/unverified lanes covered. `data-event-id` / `data-stage` / `data-lane` keep selection and portfolio membership aligned. `validateProposalUrl` / `redactedProposalUrl` avoid logging query tokens. Not LIVE_VERIFIED. |
| Evidence (revision) | `portfolioCard` proposal label stays `Not linked` when sheet URL is missing even if `historicalProposalForEvent` matches; historical association is a separate `data-historical-proposal` note. Payment-processing copy no longer implies Booked means paid-in-full; states processing does not establish receipt. Booked without `paymentRecorded` shows explicit no owner-confirmed receipt note. Browser fixtures: `evt-nium-2026` (historical assoc, no URL) and `evt-active` (Booked, no receipt evidence). |
| Remaining blocker | Live sheet proposal URLs and authenticated staging confirmation remain owner-side (R22/R23). |
| Next task | R08 — read-only event workspace |

### R08 — Complete the read-only event workspace

| Field | Value |
| --- | --- |
| Status | **IMPLEMENTED_TESTED** (T15 + T16) |
| Date/time | 2026-11-25 |
| Dependencies | R03, R07 |
| Files inspected | `remaining-spec.md` R08, `public/v2/js/lifecycle-command-center.js` (`summarizeQuotes` Cost coverage label), `public/v2/js/event-workspace-upgrade.js`, `public/v2/js/documents.js`, `public/v2/js/reports.js`, `public/v2/js/dashboard-upgrades.js`, `public/v2/js/central-sync.js`, `tests/command-center-acceptance.test.mjs`, `tests/command-center-browser.test.mjs` |
| Files changed | `public/v2/js/documents.js`, `public/v2/js/reports.js`, `public/v2/js/lifecycle-command-center.js`, `public/v2/js/dashboard-upgrades.js`, `public/v2/js/central-sync.js`, `public/v2/app.js`, `tests/command-center-browser.test.mjs`, `tests/command-center-acceptance.test.mjs`, `docs/baselines/local-completion-progress.md` |
| Exact test commands | `powershell.exe -NoProfile -File .\scripts\verify-command-center.ps1 -Mode Targeted -TestFiles tests/command-center-browser.test.mjs,tests/command-center-acceptance.test.mjs` |
| Exit codes | Targeted verify **0** (browser 0; acceptance 0) |
| Evidence | Read-only record sections for client/contact, discovery, date/venue, goals, quote/payment, tasks, staffing, compliance, documents, run of show, logistics, communications, CRM attribution, post-event obligations, and reports. Each section uses `data-workspace-section` + the same validated `data-event-id`. Missing fields labeled Unavailable. No Save/Delete/Mark Complete/Add Task on the record or selected-task panel. Desktop + 375px navigation covered. |
| Evidence (revision) | Stale acceptance `/Quote profit/` updated to intentional UI label `/Cost coverage/`. Preserved and strengthened financial-integrity static checks: `Cost not recorded`, `Missing cost is not zero`, margin-only-when-complete, budget≠target, targets not added to priced lines; rejects `Projected Profit` and stale `Quote profit`. Not LIVE_VERIFIED. |
| Evidence (T16) | Authoritative document associations via `validateDocumentSourceUrl` / `resolveDocumentSourceUrl` (`url` → `driveUrl` → `downloadUrl`). Counts and linked/unsupported/unavailable labels stay event-scoped. Pre/post print/report re-resolve by event id with no arbitrary fallback; invalid ids refuse substitution. Upload/delete/Open blob/Drive mutation paths disabled (`documentMutationsEnabled` false); private bytes not fetched. Browser fixtures cover https link, http unsupported, credentialed unsupported, missing link, rapid switch, and report isolation. Not LIVE_VERIFIED. |
| Remaining blocker | Live sheet field completeness and authenticated staging confirmation remain owner-side (R22/R23). Private document access remains owner-authorized. |
| Next task | R09 — safe granular event editing contract (isolated) |

### R09 — Prepare safe granular event editing

| Field | Value |
| --- | --- |
| Status | IMPLEMENTED_TESTED |
| Date/time | 2026-11-25 |
| Dependencies | R08 |
| Files inspected | `remaining-spec.md` R09, `public/v2/js/wizard.js`, `public/v2/js/core.js`, `public/v2/js/central-sync.js`, `app/api/sync/events/route.ts`, `apps-script/live/event-command-center-backend/Code.js` (read-only), `docs/command-center-completion-matrix.md` |
| Files changed | `lib/event-mutation-contract.mjs` (new), `tests/event-mutation-contract.test.mjs` (new), `docs/event-mutation-contract.md` (new), `app/api/sync/events/route.ts` (bulk POST disabled), `docs/command-center-completion-matrix.md`, `docs/baselines/local-completion-progress.md`, `docs/baselines/local-baseline-reconciliation.md` |
| Exact test commands | `powershell.exe -NoProfile -File .\scripts\verify-command-center.ps1 -Mode Targeted -TestFiles tests/event-mutation-contract.test.mjs,tests/command-center-acceptance.test.mjs` |
| Exit codes | Targeted verify **0** (mutation contract 0; acceptance 0) |
| Evidence | Isolated synthetic contract covers create, field/status update, quote upsert, task complete/reopen, proposal link, follow-up, post-event. Rejects unauthorized, unknown fields, stale revisions, cross-event task/quote ownership, and bulk snapshot shapes. Idempotent replays do not duplicate. Armed atomic failures roll back with unrelated fields preserved. `PRODUCTION_MUTATIONS_ENABLED=false`; granular contract not wired to routes; no Apps Script proposal. |
| Evidence (T17 revision) | Inspected POST: auth via `authorizeAppRequest` only; no prior write-disable gate existed (authenticated callers previously reached `saveAllEvents`). Disabled bulk snapshot POST to 403 `bulk_event_mutation_disabled` / `writesPerformed: false` without changing auth primitives or wiring the granular contract. Behavioral harness proves unauthorized → 401 and authenticated bulk `events[]` → 403 with zero `appsScriptRequest` calls. Not LIVE_VERIFIED. |
| Remaining blocker | Live activation remains R28 / owner; production Event writes stay DISABLED |
| Next task | R10 (independent) or continue remaining-spec order |

### R10 — Complete financial drilldown and reconciliation

| Field | Value |
| --- | --- |
| Status | IMPLEMENTED_TESTED (T18 + T19) |
| Date/time | 2026-11-25 |
| Dependencies | R03 |
| Files inspected | `public/v2/js/event-finance.js`, `public/v2/js/authoritative-finance.js`, `public/v2/js/unified-hub.js`, `app/api/sync/operating-picture/route.ts`, `tests/event-finance.test.cjs`, `tests/command-center-acceptance.test.mjs`, `tests/command-center-browser.test.mjs`, `tests/owner-read-guard.test.mjs`, `remaining-spec.md` R10 |
| Files changed (T18) | `public/v2/js/event-finance.js`, `tests/event-finance.test.cjs`, `docs/baselines/local-completion-progress.md` |
| Files changed (T19) | `public/v2/js/unified-hub.js`, `public/v2/js/event-finance.js`, `app/api/sync/operating-picture/route.ts`, `tests/command-center-acceptance.test.mjs`, `tests/event-finance.test.cjs`, `docs/baselines/local-completion-progress.md` |
| Exact test commands (T19) | `powershell.exe -NoProfile -File .\scripts\verify-command-center.ps1 -Mode Targeted -TestFiles tests/event-finance.test.cjs,tests/command-center-acceptance.test.mjs,tests/command-center-browser.test.mjs` |
| Exit codes (T19) | Targeted verify **0** (event-finance 0; acceptance 0; browser 0) after supervisor revision |
| Evidence (T18) | `refundBlocksProfit` now derives from every refund-classified countable payment (`settlement === 'refunded'`), including fee/tax and other roles—not only client/vendor. Conflict/missing-ID safeguards preserved. Regressions assert refunded fee and tax rows (otherwise complete ledger) leave margin/contribution null with explicit `refundTreatment` incomplete coverage. Prior T18 refund conservatism and hub exactly-once copy remain in place. Drawable cash stays unavailable; authoritative rows unchanged. |
| Evidence (T19) | Event Finance hub renders distinct source-linked client/vendor tables with due dates, separate owner distributions, per-event/global reconciliation, and linked exceptions. Per-event `vendorCommittedCents` lives in `buildLedger` using countable vendor rows (identical `duplicate_copy` counted once; only conflict/missing IDs or amount gaps mark incomplete). `buildFinanceReconciliation` moved into `event-finance.js`; operating-picture consumes it and no longer hosts `vendorCommittedForEvent`. Acceptance/event-finance regressions exercise the reconciliation payload: identical vendor duplicate reconciles once; missing ID, conflicting ID, and unknown amount stay explicitly incomplete. Auth-before-read and GET-only `writesPerformed: false` preserved. |
| Remaining blocker | Live payment/payout completeness and bank evidence remain owner-side (R23); not LIVE_VERIFIED |
| Next task | R11 |

### R11 — Complete Gmail full-thread read readiness

| Field | Value |
| --- | --- |
| Status | IMPLEMENTED_TESTED (T20 + T21 + supervisor revisions) |
| Date/time | 2026-11-25 |
| Dependencies | R05 |
| Files inspected (read-only) | `apps-script/GmailEvidence.gs`, `apps-script/GmailDraftContext.gs`, `apps-script/release/LVPT_Event_Command_Center_v1_2_COMPLETE_Code.gs`, `app/api/sms/staging/draft-context/route.ts`, `app/api/sms/staging/gmail-evidence/route.ts`, `app/api/sms/staging/inbox-thread/route.ts` |
| Files changed (T20) | `public/sms-review/gmail-thread-triage.js`, `public/sms-review/gmail-intelligence.js`, `public/sms-review/index.html`, `tests/gmail-thread-triage.test.cjs`, `tests/sms-gmail-intelligence.test.cjs`, `docs/baselines/local-completion-progress.md` |
| Files changed (T21 + revisions) | `public/sms-review/message-preview.js`, `public/sms-review/reply-workflow.js`, `public/sms-review/reply-qualification.js`, `public/sms-review/app.js`, `public/sms-review/reply-review-controls.js`, `tests/sms-reply-qualification.test.cjs`, `tests/sms-reply-review.test.cjs`, `tests/sms-message-preview.test.cjs`, `docs/baselines/local-completion-progress.md` |
| Exact test commands (T20) | `node .\tests\sms-gmail-intelligence.test.cjs`; `powershell.exe -NoProfile -File .\scripts\verify-command-center.ps1 -Mode Targeted -TestFiles tests/gmail-thread-triage.test.cjs,tests/sms-gas-long-thread-preview.test.cjs,tests/sms-gas-recipient-verification.test.cjs,tests/gmail-ingest.test.cjs`; also `node tests/gmail-thread-triage.test.cjs` |
| Exact test commands (T21 revision) | `powershell.exe -NoProfile -File .\scripts\verify-command-center.ps1 -Mode Targeted -TestFiles tests/sms-message-preview.test.cjs,tests/sms-reply-qualification.test.cjs,tests/sms-gas-recipient-verification.test.cjs`; also `node .\tests\sms-reply-review.test.cjs` |
| Exit codes (T20) | sms-gmail-intelligence **0**; Targeted verify **0**; gmail-thread-triage **0** |
| Exit codes (T21 revision) | Targeted verify **0** (message-preview 0; reply-qualification 0; gas-recipient-verification 0); sms-reply-review **0** |
| Evidence (T20) | Protected readers/routes unchanged. Readiness delegates to triage `assessThreadContext`. Latest revision: `evaluateClient` no longer falls back observed `mailbox` to `BUSINESS_MAILBOX`—only explicit thread/record mailbox evidence establishes observed identity; expected mailbox may still default to `BUSINESS_MAILBOX`. Regression asserts missing mailbox keeps `mailboxIdentityVerified` / `fullThreadReady` / `completeClientContext` false; explicit business mailbox still verifies positively. |
| Evidence (T21 revision) | Wired `describeContext`/`displayLines` + `retainLatestInbound` into review UI and qualification. `approvalReady` gates live Approve controls. Conflict-aware mailbox verification. **Latest fix:** `resolveEvidenceKind` / `incompleteContext` treat any `context.messages[].truncated===true` as truncated (not only latest); `approvalReady` also fails closed on any earlier truncated message. Regressions cover earlier truncated + complete latest: display truncated/incomplete, `canPrepare` allowed, Approve disabled with “Not approval-ready”. Provider readers/send untouched. Not LIVE_VERIFIED; no auto-send. |
| Remaining blocker | Live full-thread confirmation and owner-approved send remain later (R24); not LIVE_VERIFIED; no auto-send |
| Next task | R12/T22 completed — proceed to R13 |

### R12 — Complete one-at-a-time approval state machine

| Field | Value |
| --- | --- |
| Status | IMPLEMENTED_TESTED (T22 + T23 durable queue advancement — synthetic; not LIVE_VERIFIED) |
| Date/time | 2026-11-26 |
| Dependencies | R11 |
| Files inspected (read-only) | `app/api/sms/staging/reply-decisions/route.ts` |
| Files changed (T22) | `public/sms-review/reply-workflow.js`, `public/sms-review/reply-review-controls.js`, `tests/sms-reply-review.test.cjs`, `docs/baselines/local-completion-progress.md` |
| Files changed (T22 revision) | `public/sms-review/reply-workflow.js`, `public/sms-review/reply-review-controls.js`, `tests/sms-reply-review.test.cjs`, `tests/sms-reply-send-ui.test.cjs`, `docs/baselines/local-completion-progress.md` |
| Files changed (T22 revision 2) | `public/sms-review/reply-review-controls.js`, `tests/sms-reply-review.test.cjs`, `docs/baselines/local-completion-progress.md` |
| Files changed (T23) | `public/sms-review/action-queue.js`, `public/sms-review/app.js`, `tests/sms-reply-queue-navigation.test.cjs`, `docs/baselines/local-completion-progress.md` |
| Exact test commands (T22) | `powershell.exe -NoProfile -File .\scripts\verify-command-center.ps1 -Mode Targeted -TestFiles tests/sms-reply-review.test.cjs,tests/sms-reply-qualification.test.cjs` |
| Exact test commands (T22 revision / revision 2) | `powershell.exe -NoProfile -File .\scripts\verify-command-center.ps1 -Mode Targeted -TestFiles tests/sms-reply-review.test.cjs,tests/sms-reply-qualification.test.cjs,tests/sms-reply-send-ui.test.cjs,tests/sms-reply-send.test.cjs,tests/sms-reply-send-runtime.test.cjs` |
| Exact test commands (T23) | `powershell.exe -NoProfile -File .\scripts\verify-command-center.ps1 -Mode Targeted -TestFiles tests/sms-reply-review.test.cjs,tests/sms-reply-queue-navigation.test.cjs,tests/sms-reply-qualification.test.cjs` |
| Exit codes (T22) | Targeted verify **0** (sms-reply-review 0; sms-reply-qualification 0) |
| Exit codes (T22 revision) | Targeted verify **0** (review 0; qualification 0; send-ui 0; send 0; send-runtime 0) |
| Exit codes (T22 revision 2) | Targeted verify **0** (review 0; qualification 0; send-ui 0; send 0; send-runtime 0) |
| Exit codes (T23) | Targeted verify **0** (sms-reply-review 0; sms-reply-queue-navigation 0; sms-reply-qualification 0) |
| Evidence (T22) | Extended existing one-at-a-time controls (no competing state machine). Owner decisions: APPROVE → `approved_for_manual_copy` with exact recipient/thread/inbound/digest binding; MAKE CHANGES → `draft_prepared` clearing binding and requiring renewed APPROVE; DENY → `denied` (never sends); EDIT MYSELF → local close without send/audit send. Recipient, draft digest, and newer inbound invalidate stale APPROVE. Decision route inspected read-only (`noGmailWrites`/`noAutomaticSend`; decisions limited to draft_prepared/approved_for_manual_copy/denied). Synthetic adapters only. Not LIVE_VERIFIED; no auto-send. |
| Evidence (T22 revision) | APPROVE now binds latest relevant inbound via stable provider `messageId` when present **and** a deterministic inbound evidence digest from existing excerpt/direction/at/domain/flags (not timestamp alone). `buildApprovalBinding` fails closed without inbound identity. Same-timestamp replacement of inbound ID/content invalidates APPROVE; copy/send stay blocked pending renewed review. Live routes untouched. |
| Evidence (T22 revision 2) | `save()` validates complete APPROVE binding (recipient, thread, inbound identity, draft digest) **before** the decision/audit adapter call; failure records zero `approved_for_manual_copy` writes and reuses the pre-validated binding on success. Regressions cover missing recipient and missing inbound evidence: no approved audit, no copy/send. |
| Evidence (T23) | Existing queue ownership extended (no second state machine). `action-queue.js` adds `isPausedByDecision`/`partitionQueueItems` for durable hold/dismissed restore; `app.js` uses them and refuses `advanceToNextInboxThread` while a draft lock is active. Queue-navigation regressions cover exactly-once concurrent advance, synthetic audit persistence across refresh, unresolved-item preservation, duplicate terminal decisions, and fail-closed decision reads. No private message persistence; live decision recording not enabled. Not LIVE_VERIFIED; no auto-send. |
| Remaining blocker | Live decision recording / controlled send remain later (R24); synthetic-only until owner gates |
| Next task | R13 — exactly-once approval delivery safety |

### R13 — Verify exactly-once approval delivery safety

| Field | Value |
| --- | --- |
| Status | **IMPLEMENTED_TESTED** (T24) |
| Date/time | 2026-11-26 |
| Dependencies | R12 |
| Files inspected (read-only) | `app/api/gmail/send/route.ts`, `app/api/sms/staging/reply-send/route.ts`, `app/api/sms/staging/reply-recipient/route.ts`, `app/api/sms/staging/reply-decisions/route.ts` |
| Files changed (T24) | `public/sms-review/reply-workflow.js`, `public/sms-review/reply-review-controls.js`, `tests/approval-idempotency.test.mjs` (NEW), `tests/sms-reply-send-runtime.test.cjs`, `tests/sms-reply-send.test.cjs`, `docs/baselines/local-completion-progress.md` |
| Files changed (T24 revision) | `public/sms-review/reply-workflow.js`, `tests/approval-idempotency.test.mjs`, `docs/baselines/local-completion-progress.md` |
| Exact test commands | `powershell.exe -NoProfile -File .\scripts\verify-command-center.ps1 -Mode Targeted -TestFiles tests/sms-reply-send.test.cjs,tests/sms-reply-send-runtime.test.cjs,tests/sms-reply-send-ui.test.cjs,tests/sms-negative-gmail-canary.test.mjs,tests/approval-idempotency.test.mjs` |
| Exit codes | Targeted verify **0** (send 0; send-runtime 0; send-ui 0; negative-canary 0; approval-idempotency 0) |
| Exit codes (T24 revision) | Targeted verify **0** |
| Evidence (T24) | Protected send/recipient/decision routes inspected read-only with isolated provider mocks: production Gmail POST 403; staging reply-send requires dual opt-in + exact confirmation + approval digest + unique intent reservation; uncertain/timeout outcomes mark `doNotRetry` without automatic resend; SENT requires provider `gmailMessageId`. Concurrent duplicate claims allow exactly one provider send. Workflow adds `classifySendIntentOutcome` / `sendAttemptAllowed` (clipboard never SENT; recipient/revision/inbound invalidate). Client `sendApproved` now claims busy lock before first await and will not downgrade a confirmed SENT on a late duplicate error. Four-times-daily approval automation remains disabled in hub. Not LIVE_VERIFIED; no production send enabled. |
| Evidence (T24 revision) | `sendAttemptAllowed` no longer defaults missing ledger status to `not_attempted`; absent/null/empty/`none`/unrecognized status fail closed. `classifySendIntentOutcome` grants `mayAttemptSend` only for explicit authoritative `not_attempted`. Idempotency regressions cover absent records and missing/empty statuses with otherwise valid approval. Protected routes unchanged. |
| Protected-runtime flaws | None requiring a protected-route patch. Client busy-lock race (fingerprint await before `working=`) was fixed in authorized UI controls; durable server uniqueness remains the backstop. |
| Remaining blocker | Live controlled send proof remains R24 (owner-approved recipient/message/window) |
| Next task | R14 — Android SMS readiness |

### R14 — Verify Android SMS readiness

| Field | Value |
| --- | --- |
| Status | IMPLEMENTED_TESTED (code/contracts); ops UNVERIFIED |
| Date/time | 2026-11-26 |
| Dependencies | R00 |
| Files inspected | `lib/sms-bridge.mjs`, `lib/sms-scan-health.mjs`, `lib/source-reliability.mjs`, `app/api/sms/staging/_lib.ts`, `app/api/sms/staging/ingest/route.ts`, `app/api/sync/operating-picture/route.ts`, `sql/sms-staging.sql`, `SMS-STAGING-SETUP.md`, `SMS-REVIEW-README.md`, phase baselines through `phase-07m` |
| Files changed | `lib/sms-scan-health.mjs`, `tests/sms-scan-health.test.mjs`, `docs/android-sms-operational-checklist.md`, `docs/baselines/local-completion-progress.md` |
| Exact test commands | `powershell.exe -NoProfile -File .\scripts\verify-command-center.ps1 -Mode Targeted -TestFiles tests/sms-scan-health.test.mjs,tests/source-reliability.test.mjs,tests/sms-intelligence.test.mjs` |
| Exit codes | Targeted verify **0** (sms-scan-health 0; source-reliability 0; sms-intelligence 0) |
| Evidence | Android APK/source absent locally; bridge lives on documented `feature/lvpt-sms-bridge-prototype`. Server allowlist/AES-GCM/sms_id dedup/unmatched review verified offline. `classifyBridgeHeartbeat` requires `last_success_at`; historical rows never imply sync. Preview passes `heartbeat: null`. Checklist records exact SMS-STAGING-SETUP Android v0.5 UI steps without inventing adb/gradle commands. |
| Remaining blocker | Approved handset current `last_success_at` (R25); no heartbeat persistence reader on this preview |
| Next task | R15 — RCS collector readiness |

### R15 — Verify RCS collector readiness

| Field | Value |
| --- | --- |
| Status | IMPLEMENTED_TESTED (code/contracts); ops UNVERIFIED |
| Date/time | 2026-11-26 |
| Dependencies | R00 |
| Files inspected | `services/google-messages-collector/**` (main CLI, PREFLIGHT.txt, preflight, live staging/gateway_off/live_off, collect health), `lib/rcs-staging.mjs`, `lib/rcs-dedup.mjs`, `lib/source-reliability.mjs`, `app/api/sms/staging/rcs-collector/route.ts`, `public/v2/js/unified-hub.js`, `tests/rcs-*.mjs` |
| Files changed | `tests/rcs-collector.test.mjs`, `tests/rcs-staging.test.mjs`, `docs/rcs-operational-checklist.md` (NEW), `docs/baselines/local-completion-progress.md` |
| Exact test commands | `powershell.exe -NoProfile -File .\scripts\verify-command-center.ps1 -Mode Targeted -TestFiles tests/rcs-collector.test.mjs,tests/rcs-dedup.test.mjs,tests/rcs-staging.test.mjs`; `Test-Path "$env:LOCALAPPDATA\LVPT\rcs\allowlist.txt"` |
| Exit codes | Targeted verify **0**; allowlist `Test-Path` **True** (existence only; contents not read) |
| Evidence | Windows collector at `services/google-messages-collector`; launcher = `lvpt-rcs-collector.exe` flags in `main.go`/`PREFLIGHT.txt` (no repo .ps1 launcher). Allowlist path matches `%LOCALAPPDATA%\LVPT\rcs\allowlist.txt`. Staging path `/api/sms/staging/rcs-ingest` refuses production host. Preview route hard-codes unpaired + unverified heartbeat; stored success cannot set live. Dedup keeps SMS/RCS IDs independent (`possible_duplicate` only). Send/mark-read absent in Go + contracts false. Collector not launched or paired. |
| Remaining blocker | Live pairing + current collector success on approved PC (R26) |
| Next task | R16 — task normalization / safe Calendar reconciliation |

### R16 — Verify task normalization and safe Calendar reconciliation

| Field | Value |
| --- | --- |
| Status | VERIFIED_EXISTING (TaskSync fixture/VM); live Calendar writer not executed |
| Date/time | 2026-11-26 |
| Dependencies | R00 |
| Files inspected | `apps-script/calendar-command-center/TaskSync.safe-sync.js`, `TaskSync.safe-review.js`, `TaskSync.safe-integrate.js`, `TaskSync.js` (retired local planner), `apps-script/live/calendar-command-center/TaskSync.js` (read-only historical), `docs/baselines/phase-07m-production-sync.md`, `lib/action-inbox.mjs` (read-only; no behavior change retained), existing `tests/calendar-safe-sync.test.cjs`, `tests/calendar-safe-review.test.cjs` |
| Files changed | `tests/calendar-task-reconcile.test.cjs`, `tests/action-inbox.test.mjs` (regression/observation only), `docs/baselines/local-completion-progress.md` |
| Exact test commands | `powershell.exe -NoProfile -File .\scripts\verify-command-center.ps1 -Mode Targeted -TestFiles tests/action-inbox.test.mjs,tests/command-center-acceptance.test.mjs,tests/calendar-task-reconcile.test.cjs` |
| Exit codes | Targeted verify **0** (after revision) |
| Evidence | Safe TaskSync stubs: sole writer `runLVPTSafeTaskSync`; retired writer unused in safe sources; stable-ID uniqueness; duplicate/conflict → REVIEW; undated/impossible due → REVIEW (no create); due-today and future dated approved creates allowed; completed/cancelled suppression; real meetings untouched; Free/15-min/no guests/conference/recurrence; repeat-run idempotency; Calendar/Sheets stubs never contacted. Action-inbox existing timing: due today is not overdue. Phase-07m documents production hourly trigger on `runLVPTSafeTaskSync`. |
| Finding (not fixed; R16 is read-only) | `lib/action-inbox.mjs` does not set `review=true` for an undated open task on an open-stage event. Undated→REVIEW is enforced by TaskSync safe-review for Calendar creates. Unauthorized action-inbox behavior edits from the prior pass were reverted. |
| Remaining blocker | Fresh operational proof of current scheduled cycles is R27; optional later owner-scoped action-inbox undated-review backlog change |
| Next task | R17 — observable system health |

### R17 — Complete observable system health

| Field | Value |
| --- | --- |
| Status | IMPLEMENTED_TESTED (T28 + T29) |
| Date/time | 2026-11-26 |
| Dependencies | R11, R14, R15, R16 |
| Files inspected | `lib/source-reliability.mjs`, `lib/sms-scan-health.mjs`, `app/api/sync/operating-picture/route.ts`, `public/v2/js/unified-hub.js`, `tests/source-reliability.test.mjs`, `tests/sms-scan-health.test.mjs`, `tests/command-center-browser.test.mjs`, `tests/command-center-acceptance.test.mjs`, R11–R16 readiness evidence |
| Files changed (T28) | `lib/source-reliability.mjs`, `lib/sms-scan-health.mjs`, `tests/source-reliability.test.mjs`, `tests/sms-scan-health.test.mjs`, `docs/baselines/local-completion-progress.md` |
| Files changed (T29) | `app/api/sync/operating-picture/route.ts`, `public/v2/js/unified-hub.js`, `tests/command-center-browser.test.mjs`, `tests/command-center-acceptance.test.mjs`, `tests/source-reliability.test.mjs`, `docs/baselines/local-completion-progress.md` |
| Exact test commands | `powershell.exe -NoProfile -File .\scripts\verify-command-center.ps1 -Mode Targeted -TestFiles tests/source-reliability.test.mjs,tests/sms-scan-health.test.mjs,tests/command-center-browser.test.mjs,tests/command-center-acceptance.test.mjs` |
| Exit codes | T28 targeted verify **0**; T29 targeted verify **0** (source-reliability 0; sms-scan-health 0; command-center-browser 0; command-center-acceptance 0) |
| Evidence (T28) | Reused source-reliability (no second model). `normalizeSourceHealth` / `normalizeLocalReadiness` separate last attempt/success, coverage, latest record/ingest, heartbeat, schedule vs execution, error, retry, and owner action. Auth, timeout, provider, stale, partial, and unavailable remain distinct. Failed auth/timeout/unavailable reads keep `recordsExamined: null` (never empty successful totals). Schedules, audits, and stored rows cannot substitute for execution/heartbeat. SMS scan attaches failureKind + retry/ownerAction; classifiers attach `.evidence`. Not LIVE_VERIFIED; no provider endpoints or migrations added. |
| Evidence (T28 revision) | `classifySmsScan` keeps timeout/provider/authorization **cause** independent of `coverage='partial'` via `stopCause`/`cause`/`failureKind`. `timedOut` stays true after a successful page then timeout, and `input.timedOut` sets `timeoutBlocked` so top-level timeout evidence is consistent. Retry/owner-action guidance derives from that cause. Added deterministic tests for page-then-timeout, page-then-provider, and top-level timeout with no pages. Targeted verify **0**. |
| Evidence (T29) | Protected operating-picture GET still denies before provider reads and remains GET-only with `writesPerformed: false`. Jobs are presented through `presentJob`/`normalizeSourceHealth`; response includes `sourceHealth` from `normalizeLocalReadiness`. Failed SMS metadata reads use `recordsExamined: null` (not false zeros). Hub Source Health reuses shared operating-picture + action-inbox reads; renders normalized coverage/freshness, schedule-vs-execution, collector heartbeat, and owner actions; schedule-only and missing heartbeat cannot paint LIVE. Browser fixture asserts health tables and non-LIVE TaskSync/heartbeat badges. |
| Remaining blocker | Live collector/Gmail execution proof remains owner ops (NOT VERIFIED until real heartbeat/run evidence); no new provider endpoints |
| Next task | R18 — private-data and authorization audit |

### R18 — Complete private-data and authorization audit

| Field | Value |
| --- | --- |
| Status | **IN_PROGRESS** (T30 **IMPLEMENTED_TESTED** after owner-authorized status-route remediation; T31 pending) |
| Date/time | 2026-11-26 20:45 -05:00 |
| Dependencies | R03–R17 where applicable |
| Files inspected (T30) | `lib/owner-read-guard.mjs`, `lib/sms-review-session.mjs`, `app/api/sync/_owner-read.ts`, `app/api/sms/staging/_review-auth.ts`, `app/api/sms/staging/session/route.ts`, **all 31** `app/api/**/route.ts` files (inventory below), `public/v2/js/sheet-snapshot.js`, `public/v2/js/unified-hub.js`, `public/v2/js/authoritative-finance.js`, `lib/rcs-staging.mjs` (ingest auth) |
| Files changed (T30) | `app/api/sync/status/route.ts`, `app/api/gmail/status/route.ts`, `tests/owner-read-guard.test.mjs`, `tests/sms-review-session.test.mjs`, `tests/command-center-browser.test.mjs`, `docs/baselines/local-completion-progress.md` |
| Exact test commands | `powershell.exe -NoProfile -File .\scripts\verify-command-center.ps1 -Mode Targeted -TestFiles tests/owner-read-guard.test.mjs,tests/sms-review-session.test.mjs,tests/command-center-browser.test.mjs`; `npm.cmd run test:staging-safety` |
| Exit codes | Targeted verify **0**; staging-safety **0** |
| Evidence (T30) | Decision + handler-level coverage for `events` and both status routes. Owner decision authorized `denyPrivateRead` on `sync/status` and `gmail/status`: unauthenticated/forged/expired/Origin-only/foreign-Origin → 401/403 with **zero** Apps Script calls, **zero** `gmailConfigured`/`accountEmail` reads, and no email/`@` leakage in denial bodies. Authorized positive controls still return configured status (sync calls mocked `status` once; gmail returns synthetic email once). Signing primitives unchanged; existing owner-read guard reused (not redesigned). Browser cache-clear assertions retained. |
| Remaining blocker | T31 — `docs/command-center-security-acceptance.md` and `tests/private-asset-exposure.test.mjs` still absent |
| Next task | T31 — Audit private assets and document exposure risks |
| Owner-auth defects | Previously open `sync/status` and `gmail/status` gaps **remediated** under explicit owner authorization (2026-11-26) using existing `denyPrivateRead`. No remaining T30 auth defects open. |

#### T30 private-route inventory (read-only)

| Route | Guard | Provider risk if unauth | Test coverage |
| --- | --- | --- | --- |
| `sync/events` GET | `denyPrivateRead` | Apps Script `listEvents` | T30 handler mock counters + static order; browser 401 |
| `sync/events` POST | `authorizeAppRequest`; bulk disabled | none (no Apps Script) | T30 handler mock; `event-mutation-contract` |
| `sync/action-inbox` GET | preview_only then `denyPrivateRead` | Apps Script + Supabase SMS | static order; `action-inbox` / acceptance |
| `sync/operating-picture` GET | preview_only then `denyPrivateRead` | Apps Script + SMS meta | static order; acceptance/browser |
| `sync/ledger` GET | `authorizeAppRequest` (sync key, not review cookie) | Apps Script ledger | acceptance financial; distinct auth model |
| `sync/documents` POST/DELETE | `authorizeAppRequest` | Apps Script upload/delete | staging-safety / mutation hold |
| `sync/automation` GET/POST | `authorizeAppRequest` | Apps Script automation | static inventory marker |
| `sync/status` GET | `denyPrivateRead` (owner-authorized 2026-11-26) | Apps Script `status` after auth | T30 handler mock counters + static order |
| `sms/staging/conversations` GET | `denyPrivateRead` + same-origin | Supabase SMS + optional sheet | static order; acceptance |
| `sms/staging/rcs-collector` GET | `denyPrivateRead` + same-origin | Supabase RCS | static order; browser |
| `sms/staging/session` GET/POST/DELETE | `hasReviewSession` / `allowedReviewMutation` + token hash on login | none on GET; cookie mint on POST | `sms-review-session` static + unit |
| `sms/staging/review`, `audit-health`, `inbox-review`, `inbox-thread`, `gmail-evidence`, `reconcile` | `authorizedReviewer` (session **or** SMS sync token) | Gmail/Supabase as applicable | SMS review suite (existing) |
| `sms/staging/draft-context`, `reply-recipient` | `hasReviewSession` | Apps Script / Gmail readers | SMS reply/send suite |
| `sms/staging/reply-send`, `reply-decisions`, `reply-personalized-draft`, `personalized-draft`, `action-decisions`, `inbox-diagnostics`, `ai-smoke-test`, `decisions` | `hasReviewSession` + `allowedReviewMutation` on mutating verbs | provider/AI as applicable | SMS reply/send/review suites |
| `sms/staging/ingest` POST | `authorized` (SMS sync token) | encrypted SMS write | SMS intelligence / staging |
| `sms/staging/rcs-ingest` POST | `ingestRcs` → `x-lvpt-rcs-sync-token` | RCS staging write | `rcs-staging` tests |
| `gmail/search` GET | `authorizeSyncRequest` | Gmail API | gmail ingest tests |
| `gmail/send` POST | hard-closed 403 | none | negative canary / send disabled |
| `gmail/status` GET | `denyPrivateRead` (owner-authorized 2026-11-26) | account email only after auth | T30 handler mock counters + static order; denial leaks no email |

### R19 — Verify performance and shared data requests

| Field | Value |
| --- | --- |
| Status | NOT_STARTED (planned VERIFY_EXISTING) |
| Dependencies | R17, R18 |
| Evidence | Shared operating-picture read documented in staging acceptance |
| Remaining blocker | Re-verify timeout/401 snapshot clearing |
| Next task | Confirm reuse across views |

### R20 — Complete operational reports

| Field | Value |
| --- | --- |
| Status | NOT_STARTED (planned VERIFY_EXISTING / gap fill) |
| Dependencies | R06, R08, R10 |
| Evidence | V2 reports surfaces present |
| Remaining blocker | Cross-event contamination must remain impossible |
| Next task | Verify report identity binding |

### R21 — Consolidated end-to-end regression

| Field | Value |
| --- | --- |
| Status | NOT_STARTED |
| Dependencies | All safe R00–R20 |
| Evidence | acceptance + staging-safety + browser tests exist |
| Remaining blocker | R01 verify script; full green local suite; `final-local-regression.md` absent |
| Next task | Full local regression after prior safe tasks |

### R22 — Authenticated staging browser acceptance

| Field | Value |
| --- | --- |
| Status | BLOCKED_OWNER |
| Dependencies | R21 |
| Evidence | staging acceptance checklist exists |
| Remaining blocker | Owner signed-in preview session |
| Next task | Prepare checklist; do not fake LIVE_VERIFIED |

### R23 — Verify authoritative live data completeness

| Field | Value |
| --- | --- |
| Status | BLOCKED_OWNER |
| Dependencies | R22 |
| Evidence | Historical Part A counts are observations only |
| Remaining blocker | Live authoritative read confirmation |
| Next task | Document live acceptance without rebaselining sheet |

### R24 — Verify Gmail and controlled approval workflow

| Field | Value |
| --- | --- |
| Status | BLOCKED_OWNER |
| Dependencies | R11–R13, R22 |
| Evidence | Send disabled; synthetic reply tests present |
| Remaining blocker | Exact recipient/thread/idempotent send owner proof |
| Next task | Keep four-times-daily approvals disabled |

### R25 — Verify current Android SMS collection

| Field | Value |
| --- | --- |
| Status | BLOCKED_OWNER |
| Dependencies | R14 |
| Evidence | Historical metadata ≠ heartbeat |
| Remaining blocker | Approved handset current `last_success_at` |
| Next task | Checklist only until owner evidence |

### R26 — Verify current RCS collection

| Field | Value |
| --- | --- |
| Status | BLOCKED_OWNER |
| Dependencies | R15 |
| Evidence | Collector code; send/mark-read off |
| Remaining blocker | Pairing on approved computer |
| Next task | Checklist only until owner evidence |

### R27 — Verify actual Calendar execution

| Field | Value |
| --- | --- |
| Status | BLOCKED_OWNER |
| Dependencies | R16 |
| Evidence | phase-07m recorded prior live enablement and cycles |
| Remaining blocker | Fresh owner-confirmed current execution evidence for acceptance package |
| Next task | Do not run Calendar writer from Cursor |

### R28 — Prepare controlled editing activation

| Field | Value |
| --- | --- |
| Status | BLOCKED_OWNER |
| Dependencies | R09, R22, R23 |
| Evidence | Editing disabled |
| Remaining blocker | Explicit owner activation approval |
| Next task | Prepare release plan only |

### R29 — Restore scheduled approval checks only after acceptance

| Field | Value |
| --- | --- |
| Status | BLOCKED_OWNER |
| Dependencies | R24 |
| Evidence | Approvals DISABLED in matrix/acceptance |
| Remaining blocker | R24 gates + owner approval |
| Next task | Keep schedule off |

### R30 — Controlled production release preparation

| Field | Value |
| --- | --- |
| Status | BLOCKED_OWNER |
| Dependencies | R21–R29 as applicable |
| Evidence | Production HOLD; draft PR #19 referenced in AGENTS |
| Remaining blocker | Release/rollback docs + explicit owner release decision |
| Next task | Prepare plans; no merge/deploy |

### R31 — Consolidated completion and owner handoff

| Field | Value |
| --- | --- |
| Status | NOT_STARTED |
| Dependencies | Prior gates |
| Evidence | Matrices + R00 reconciliation |
| Remaining blocker | Earlier tasks incomplete |
| Next task | Final handoff only after distinctions in remaining-spec Part D |

---

## Resume pointer

| Field | Value |
| --- | --- |
| Last completed task | R00; R01/T3 **IMPLEMENTED_TESTED**; R02/T4+T5 **IMPLEMENTED_TESTED**; R03/T6+T7 **VERIFIED_EXISTING**; R04/T8+T9 **IMPLEMENTED_TESTED**; R05/T10+T11 **IMPLEMENTED_TESTED**; R06/T12+T13 **IMPLEMENTED_TESTED**; R07/T14 **IMPLEMENTED_TESTED**; R08/T15+T16 **IMPLEMENTED_TESTED**; R09/T17 **IMPLEMENTED_TESTED**; R10/T18+T19 **IMPLEMENTED_TESTED**; R11/T20+T21 **IMPLEMENTED_TESTED**; R12/T22+T23 **IMPLEMENTED_TESTED**; R13/T24 **IMPLEMENTED_TESTED**; R14/T25 **IMPLEMENTED_TESTED** (Android SMS offline readiness; ops UNVERIFIED); R15/T26 **IMPLEMENTED_TESTED** (RCS collector offline readiness; ops UNVERIFIED); R16/T27 **VERIFIED_EXISTING** (safe TaskSync stubs; action-inbox behavior unchanged; live writer not executed); R17/T28+T29 **IMPLEMENTED_TESTED** (normalized source-health through operating-picture + actionable hub health); R18/T30 **IMPLEMENTED_TESTED** (auth/session invalidation audit; signing primitives unchanged) |
| Next authorized task | R18/T31 — Audit private assets and document exposure risks |
| Stop conditions currently active | Repository-execution (`node tests/*`, `npm run`, `npx`) unconditionally denied (trusted isolation executor unimplemented; markers do not unlock); paid/worker launch denied (`insufficient-isolation` + $0 budget); do not re-escalate local Node 24 vs CI Node 22 |
| Forbidden until owner approval | Production deploy, clasp push, Calendar writes, customer sends, git commit/push by local agent, paid API spend; worker must not modify `scripts/local-agent-policy.{json,mjs}` |
