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
| Status | **IMPLEMENTED_TESTED** (T15 + revision) |
| Date/time | 2026-11-25 |
| Dependencies | R03, R07 |
| Files inspected | `remaining-spec.md` R08, `public/v2/js/lifecycle-command-center.js` (`summarizeQuotes` Cost coverage label), `public/v2/js/event-workspace-upgrade.js`, `tests/command-center-acceptance.test.mjs`, `tests/command-center-browser.test.mjs` |
| Files changed | `public/v2/js/lifecycle-command-center.js`, `public/v2/js/event-workspace-upgrade.js`, `public/v2/lifecycle-command-center.css`, `public/v2/event-workspace-upgrade.css`, `tests/command-center-browser.test.mjs`, `tests/command-center-acceptance.test.mjs`, `docs/baselines/local-completion-progress.md` |
| Exact test commands | `node .\tests\command-center-acceptance.test.mjs`; `node .\tests\command-center-browser.test.mjs` |
| Exit codes | acceptance **0**; browser **0** |
| Evidence | Read-only record sections for client/contact, discovery, date/venue, goals, quote/payment, tasks, staffing, compliance, documents, run of show, logistics, communications, CRM attribution, post-event obligations, and reports. Each section uses `data-workspace-section` + the same validated `data-event-id`. Missing fields labeled Unavailable. No Save/Delete/Mark Complete/Add Task on the record or selected-task panel. Desktop + 375px navigation covered. |
| Evidence (revision) | Stale acceptance `/Quote profit/` updated to intentional UI label `/Cost coverage/`. Preserved and strengthened financial-integrity static checks: `Cost not recorded`, `Missing cost is not zero`, margin-only-when-complete, budget≠target, targets not added to priced lines; rejects `Projected Profit` and stale `Quote profit`. Not LIVE_VERIFIED. |
| Remaining blocker | Live sheet field completeness and authenticated staging confirmation remain owner-side (R22/R23). |
| Next task | R09 — safe granular event editing contract (isolated) |

### R09 — Prepare safe granular event editing

| Field | Value |
| --- | --- |
| Status | NOT_STARTED |
| Dependencies | R08 |
| Evidence | Event writes DISABLED in matrix; mutation contract files absent |
| Remaining blocker | Isolated development only; activation is R28 / owner |
| Next task | Create contract/tests only; no live enablement |

### R10 — Complete financial drilldown and reconciliation

| Field | Value |
| --- | --- |
| Status | NOT_STARTED (planned VERIFY_EXISTING) |
| Dependencies | R03 |
| Evidence | `event-finance.js`, acceptance fixtures, financial safeguard Part A |
| Remaining blocker | Live payment/payout completeness is owner-side |
| Next task | Verify classifications; keep drawable cash unavailable |

### R11 — Complete Gmail full-thread read readiness

| Field | Value |
| --- | --- |
| Status | NOT_STARTED (planned VERIFY_EXISTING / gap fill) |
| Dependencies | R05 |
| Evidence | Gmail triage/intelligence + Apps Script evidence files + SMS-review tests |
| Remaining blocker | Live full-thread confirmation later; no auto-send |
| Next task | Readiness + labeling; no production mutation |

### R12 — Complete one-at-a-time approval state machine

| Field | Value |
| --- | --- |
| Status | NOT_STARTED (planned VERIFY_EXISTING / gap fill) |
| Dependencies | R11 |
| Evidence | reply workflow/controls/tests; hub does not record approvals |
| Remaining blocker | Synthetic-only until R24 |
| Next task | Strengthen state machine tests without enabling send |

### R13 — Verify exactly-once approval delivery safety

| Field | Value |
| --- | --- |
| Status | NOT_STARTED (planned VERIFY_EXISTING / gap fill) |
| Dependencies | R12 |
| Evidence | reply-send regression suite; production Gmail send route 403 |
| Remaining blocker | Live delivery proof blocked on owner |
| Next task | Idempotency / unknown-result reconciliation tests |

### R14 — Verify Android SMS readiness

| Field | Value |
| --- | --- |
| Status | NOT_STARTED (planned VERIFY_EXISTING code; ops UNVERIFIED) |
| Dependencies | R00 |
| Evidence | SMS staging routes/tests; historical metadata present in Part A notes |
| Remaining blocker | No current heartbeat; checklist doc absent; R25 for live |
| Next task | Readiness docs/tests; never treat ciphertext as content |

### R15 — Verify RCS collector readiness

| Field | Value |
| --- | --- |
| Status | NOT_STARTED (planned VERIFY_EXISTING code; ops UNVERIFIED) |
| Dependencies | R00 |
| Evidence | `tests/rcs-*.mjs`; send/mark-read off |
| Remaining blocker | Pairing not verified; checklist doc absent; R26 for live |
| Next task | Keep RCS distinct from SMS; readiness only |

### R16 — Verify task normalization and safe Calendar reconciliation

| Field | Value |
| --- | --- |
| Status | NOT_STARTED (planned VERIFY_EXISTING) |
| Dependencies | R00 |
| Evidence | `TaskSync.safe-sync.js`, calendar test suite, phase-07m production sync baseline |
| Remaining blocker | No Cursor Calendar writes; fresh ops proof is R27 |
| Next task | Run fixture suite; confirm sole writer remains `runLVPTSafeTaskSync` |

### R17 — Complete observable system health

| Field | Value |
| --- | --- |
| Status | NOT_STARTED (planned VERIFY_EXISTING / gap fill) |
| Dependencies | R11, R14, R15, R16 |
| Evidence | source-reliability / scan-health / hub health surfaces |
| Remaining blocker | Must distinguish heartbeat vs stored rows vs scheduled vs executed |
| Next task | Explicit freshness states; no false zeros |

### R18 — Complete private-data and authorization audit

| Field | Value |
| --- | --- |
| Status | NOT_STARTED (planned VERIFY_EXISTING / gap fill) |
| Dependencies | R03–R17 where applicable |
| Evidence | `owner-read-guard` tests; roster archived out of public |
| Remaining blocker | `docs/command-center-security-acceptance.md` and private-asset exposure test absent |
| Next task | Audit + tests; do not weaken auth for green tests |

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
| Last completed task | R00; R01/T3 **IMPLEMENTED_TESTED**; R02/T4+T5 **IMPLEMENTED_TESTED**; R03/T6+T7 **VERIFIED_EXISTING**; R04/T8+T9 **IMPLEMENTED_TESTED**; R05/T10+T11 **IMPLEMENTED_TESTED**; R06/T12+T13 **IMPLEMENTED_TESTED**; R07/T14 **IMPLEMENTED_TESTED**; R08/T15 **IMPLEMENTED_TESTED** (read-only event workspace) |
| Next authorized task | R09 — safe granular event editing contract |
| Stop conditions currently active | Repository-execution (`node tests/*`, `npm run`, `npx`) unconditionally denied (trusted isolation executor unimplemented; markers do not unlock); paid/worker launch denied (`insufficient-isolation` + $0 budget); do not re-escalate local Node 24 vs CI Node 22 |
| Forbidden until owner approval | Production deploy, clasp push, Calendar writes, customer sends, git commit/push by local agent, paid API spend; worker must not modify `scripts/local-agent-policy.{json,mjs}` |
