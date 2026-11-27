# Command Center production release plan — R30

Decision: **HOLD production.** This file prepares the exact owner-controlled release sequence. It is **not** permission to merge, deploy, promote, clasp push, migrate SQL, mutate Sheets/Calendar, enable send, or activate automation.

T45 / R30 preparation date: 2026-11-26. No Git merge, Vercel promote, Apps Script deploy, SQL change, or live activation was performed for this update.

Companion rollback: `docs/command-center-rollback-plan.md`  
Staging acceptance: `docs/command-center-staging-acceptance.md`  
Completion matrix: `docs/command-center-completion-matrix.md`  
Editing activation (separate): `docs/event-editing-release-plan.md`  
Automation restore (separate): `docs/automation-ownership.md`

---

## Status words for this file

| Status | Meaning |
| --- | --- |
| PROCEDURE_READY | Release sequence and gates are defined. Not a live release. |
| RECORDED | Revision or URL recorded from local Git / AGENTS. Not dashboard-verified. |
| HISTORICAL | Prior verified evidence; must be reconfirmed before use as the release target. |
| UNKNOWN | Mapping, protection, or production SHA not verified this session. |
| HOLD | Production must not change until explicit owner release approval. |
| BLOCKED_OWNER | Requires owner access, evidence, or written decision. |
| DISABLED | Capability stays off through and after application release unless separately approved. |
| UNRESOLVED | Known issue that must not be silently waived if release depends on it. |

Production remains **HOLD** until every material gate below is either cleared with owner evidence or explicitly waived in writing by the owner with the residual risk named.

---

## 1. Verified candidate and local / remote divergence

| Item | Value | Status |
| --- | --- | --- |
| Local development branch | `ai-build/command-center-loop` | RECORDED |
| Exact local HEAD (this prep) | `3330948a77f7957d35f920290b0b83f86ea33d45` — `docs: document automation ownership and restoration gates` | RECORDED |
| Staging integration branch (remote tip) | `origin/feature/command-center-completion-20261124` @ `292103fc14480adbe84ae9c2404e4fed54ac1bf9` | RECORDED |
| Local ahead of staging remote tip | **46** commits (local contains remote tip as ancestor) | RECORDED |
| Last independently verified remote candidate | `292103fc14480adbe84ae9c2404e4fed54ac1bf9` — `Finish the read-only command center handoff.` | HISTORICAL |
| Last verified remote CI | GitHub Actions run `45524866760` — SUCCESS (AGENTS.md; not re-run this session) | HISTORICAL |
| Draft PR | [#19](https://github.com/LuckyMittenGaming/lvpt-event-command-center-2026/pull/19) — staging integration target | RECORDED (draft; do not merge from this prep) |
| Draft PR #6 | Must **not** be merged wholesale | KNOWN_POLICY |
| Working tree (this prep) | Untracked `.orchestrator/` only expected; no production mutation from docs prep | RECORDED |

**Divergence rule:** Do not treat historical candidate deployment URLs or the Nov 25 remote tip as identical to current local HEAD. Before any promote, the owner must name the **exact SHA** being released and confirm the acceptance host serves that SHA.

---

## 2. Production revision to preserve

| Item | Value | Status |
| --- | --- | --- |
| Production Git branch | `main` | RECORDED |
| `origin/main` tip observed this session | `63d5921ac1da1d6e4cab01a220cc00232b40246c` — `Use native multipart FormSubmit for selected image attachments` (2026-08-23) | RECORDED (Git only) |
| Production URL | `https://lvpt-event-command-center-2026.vercel.app/v2/index.html` | HOLD |
| Vercel project ID | `prj_XWIQD5ptbx3J7NnVr1n6EfrdMEFs` | RECORDED |
| Exact SHA currently served by production | **UNKNOWN** — dashboard / Deployment list not read this session | UNKNOWN / BLOCKED_OWNER |

**Preserve rule:** Before any production promote, the owner records:

1. Exact production Deployment ID / Git SHA currently live.
2. Exact candidate SHA to promote.
3. Confirmation that rollback target = recorded production SHA (or an explicitly named prior good deployment).

If the live production SHA cannot be confirmed, **stop**. Do not promote on assumption that `origin/main` equals the live deployment.

---

## 3. Deployment protection and preview alias evidence

| Item | Evidence | Status |
| --- | --- | --- |
| Historical candidate deployment | `https://lvpt-event-command-center-2026-7v0lytkyn.vercel.app/v2/index.html` | HISTORICAL ONLY — not confirmed for current HEAD |
| Historical branch preview alias | `https://lvpt-event-command-git-8f80fb-matt-carpenters-projects-7f34c5ab.vercel.app` | HISTORICAL ONLY — mapping to HEAD **UNKNOWN** |
| Alias → revision mapping | Not verified this session | **UNKNOWN** |
| Deployment protection (Vercel Authentication / password) | Not probed this session | **UNKNOWN** |
| Current staging host for R22 | Owner must supply after mapping + protection confirmed | **UNKNOWN** |

If alias mapping or protection remains UNKNOWN, do **not** treat historical URLs as the release or acceptance host. Escalate before signed-in acceptance or promote.

---

## 4. Backup requirements (before any production promote)

Perform these **owner** backups before merging to `main` or promoting production. Cursor does not run them from this prep.

| # | Backup | Purpose | Forbidden shortcuts |
| --- | --- | --- | --- |
| B1 | Record live Vercel production Deployment ID + Git SHA | Application rollback target | Guessing from `origin/main` alone |
| B2 | Export or confirm recoverable copy of authoritative Google Sheet `1oHoVdD5CDcEreyRnB7cEvYfp6wWEgAmf04BwrktkMYs` (Events, Tasks, Payments, Event Payouts, Gmail Activity, Documents, Change Log, Reminder History, Post Event) | Ledger integrity | Rebaselining counts to match the app |
| B3 | Confirm Apps Script project revisions for LVPT Calendar Command Center (`1bYJcEE5GUbfiWvXNiew_bfgBwDyfakhO8aiPWDtGF70ZO_zqd0z_4XDP`) and any Event Command Center Apps Script deployables remain recoverable | Calendar / backend rollback | `clasp push` as backup |
| B4 | Confirm Supabase SMS staging project `ogfrcwmsjbtiydlvqoyj` is not being migrated as part of this release | SMS data isolation | Treating historical SMS rows as a heartbeat |
| B5 | Note current DISABLED flags (send, event writes, four-times-daily, RCS send/mark-read) | Prevent accidental activation during promote | Enabling flags “temporarily” during release |

A Vercel application rollback must **not** rewrite Sheet, Calendar, Gmail, or SMS authoritative data. See `docs/command-center-rollback-plan.md`.

---

## 5. Reviewed change set (what a selective release may include)

This release package is the **read-only / staging Command Center candidate** developed on the completion line, plus later local documentation and synthetic-gated work on `ai-build/command-center-loop`.

**In scope for a later owner-approved application promote (after gates):**

- V2 Command Center UI and navigation (Overview, ten views, record isolation).
- Protected private read routes and HttpOnly owner-review session behavior already in the candidate.
- Financial display safeguards (no drawable cash invention; distinct payment/payout ids).
- Source-health / operating-picture labeling.
- Synthetic-tested bulk event write **disable** (`403 bulk_event_mutation_disabled`).
- SMS-review / Gmail intelligence code paths that remain non-sending unless separately activated.

**Explicitly out of scope for the initial production promote (remain DISABLED):**

| Flag / capability | Current state | Separate gate |
| --- | --- | --- |
| `PRODUCTION_MUTATIONS_ENABLED` / CAP-01–CAP-08 event writes | DISABLED | R28 + per-capability owner approval |
| Hub `POST /api/gmail/send` | 403 DISABLED | R24 LIVE_VERIFIED |
| Four-times-daily Gmail approval schedule | DISABLED | R29 after R24 |
| Document upload/delete activation | UI off; route risk noted | R28 CAP-07 + route gate |
| RCS send / mark-read | Off | Never part of this release |
| Retired `runLVPTTaskSync` | RETIRED | Must stay unused |
| Parallel Calendar reminder writers | Forbidden | R27 sole-writer rule |
| Wholesale draft PR #6 | Forbidden | Selective PR #19 only |
| Apps Script clasp push / SQL migrations | Forbidden in this package | Separate owner change |
| GoHighLevel SMS ingestion | Not implemented / not authorized | Do not add |

---

## 6. Selective PR #19 strategy (no wholesale PR #6)

| Rule | Detail |
| --- | --- |
| Integration vehicle | Draft PR #19 against the staging/completion line — **selective** reviewed candidate |
| Forbidden | Wholesale merge of draft **PR #6** |
| Forbidden | New competing Vercel project, repo, or database |
| Forbidden | History rewrite / force-push of `main` |
| Recommended path | (1) Owner confirms release SHA on staging branch or PR #19 head; (2) R22–R23 (and any required R24–R27) evidence recorded; (3) explicit written production release approval; (4) merge **only** the approved SHA to `main` via normal PR merge; (5) promote existing project `prj_XWIQD5…` only |
| Local loop commits | Local is 46 commits ahead of remote staging tip. Owner must decide whether to push/update PR #19 with the later docs/synthetic work **before** naming the release SHA. This prep does not push. |

Do not merge PR #19 from Cursor. Do not merge PR #6 at all.

---

## 7. Capability-specific activation flags (stay off through promote)

Application promote ≠ capability activation. After a successful read-only promote, these remain **DISABLED** until their own plans clear:

| Flag family | Default through release | Activation doc |
| --- | --- | --- |
| Event create / edit / task / quote / proposal / follow-up / post-event / document association | DISABLED | `docs/event-editing-release-plan.md` |
| Approval send (APPROVE path) | DISABLED | `docs/gmail-operational-acceptance.md` |
| Four-times-daily approval restore | DISABLED | `docs/automation-ownership.md` |
| Android current-collection claims | NOT VERIFIED until R25 evidence | `docs/android-sms-operational-checklist.md` |
| RCS current-collection claims | NOT VERIFIED until R26 evidence | `docs/rcs-operational-checklist.md` |
| Calendar TaskSync “current cycles” claim | PENDING_OWNER_EVIDENCE | `docs/calendar-operational-acceptance.md` |

A production promote that accidentally enables any of the above is a failed release — roll back application deploy and disable flags (see rollback plan).

---

## 8. Required owner approvals (ordered gates)

Every dependency below is explicit. Skipping a material security or operational gate keeps production **HOLD**.

| Order | Gate | Required evidence | If missing |
| --- | --- | --- | --- |
| G0 | Exact release SHA + production SHA recorded | Owner dashboard / Deployment list | **HOLD** |
| G1 | Alias mapping + deployment protection confirmed | Owner records URL → SHA + protection on | **HOLD** (no R22 on guessed URL) |
| G2 | R22 authenticated staging acceptance | `docs/command-center-staging-acceptance.md` signed-in checklist | **HOLD** |
| G3 | R23 authoritative live completeness | `docs/baselines/live-source-acceptance.md` filled cells | **HOLD** for data-truth claims |
| G4 | Material security acceptance | `docs/command-center-security-acceptance.md` + owner signed-out production/privacy checks | **HOLD** if unresolved exposure |
| G5 | Backups B1–B5 complete | Owner checklist | **HOLD** |
| G6 | Activation flags remain DISABLED | Matrix rows unchanged unless separately approved | Promote only read-only posture |
| G7 | Agent Relay dependency decision (see §9) | Explicit owner architecture note | **HOLD** if release depends on relay |
| G8 | Written production release approval | Owner names SHA, project, time window | **HOLD** without it |

**Operational gates that do not block a strictly read-only UI promote, but block LIVE_VERIFIED / ops claims:**

| Gate | Status | Note |
| --- | --- | --- |
| R24 controlled Gmail send pilot | BLOCKED_OWNER | Keep send 403 |
| R25 Android current collection | BLOCKED_OWNER | No fabricated heartbeat |
| R26 RCS current collection | BLOCKED_OWNER | No pair/send from Cursor |
| R27 Calendar current cycles | BLOCKED_OWNER | Do not run TaskSync from Cursor |
| R28 editing activation | DISABLED | Separate per-CAP approvals |
| R29 schedule restore | DISABLED | After R24 only |

Owner may approve a **read-only** production promote while R24–R29 remain blocked, **only if** G0–G8 for that narrow scope are satisfied and no disabled capability is enabled.

---

## 9. Agent Relay build failure (UNRESOLVED orchestration issue)

| Item | Status |
| --- | --- |
| Separate Agent Relay build failure | **UNRESOLVED** |
| Silent waiver | **Forbidden** if release depends on the relay |
| Repair via unrelated Command Center feature work | **Forbidden** |
| Local orchestrator loop (`.orchestrator/` / `ai-build/command-center-loop`) | Present as the **development** execution path for remaining-spec tasks |

**Architectural decision required (owner):**

1. **If production application release depends on Agent Relay** (for example, relay-driven verification or promote automation): keep production **HOLD** until the relay build failure is resolved **in the relay**, or until the owner explicitly waives that dependency in writing.
2. **If the local loop replaces Agent Relay for development orchestration only:** document that replacement as an explicit architectural decision with isolation evidence (local loop does not obtain production credentials, does not auto-merge, does not auto-deploy, and cannot bypass G0–G8). That decision does **not** by itself authorize production promote.
3. Do **not** treat Command Center UI/docs work as a fix for the Agent Relay build failure.

This prep records the issue as **UNRESOLVED** and does not waive it.

---

## 10. Exact release sequence (owner-executed; not run by this prep)

0. Confirm G0–G8 (or explicit written waiver with residual risk for any non-material item).
1. Freeze the release SHA (tag or PR #19 head commit recorded).
2. Complete backups B1–B5.
3. Confirm activation flags remain DISABLED on that SHA.
4. Merge approved PR #19 (or equivalent approved SHA) to `main` — **owner GitHub action only**.
5. Promote on existing Vercel project `prj_XWIQD5ptbx3J7NnVr1n6EfrdMEFs` to production URL — **owner only**.
6. Do **not** clasp push, edit live Apps Script, run SQL migrations, enable send, enable event writes, or restore four-times-daily as part of this promote.
7. Run post-release checks (§11).
8. If any post-release check fails materially, execute `docs/command-center-rollback-plan.md` immediately.

**Forbidden during release:**

- `git commit` / `git push` / merge / deploy from Cursor autonomous loop
- Wholesale PR #6 merge
- New Vercel project
- Production Sheet rewrite / Calendar mutation / customer send
- Enabling CAP flags “to test production”

---

## 11. Post-release checks

### 11.1 Source / deployment checks

| Check | Expected |
| --- | --- |
| Production URL serves recorded release SHA | Match G0 record |
| Deployment protection still on | No public private-data exposure |
| Signed-out `/v2/index.html` | Owner sign-in required; no private records |
| Authenticated Overview | Sheet-backed load; failed reads not fake zeros |
| Event writes | Still DISABLED (no save; bulk POST still 403) |
| Gmail send | Still 403 |
| Four-times-daily | Still DISABLED |

### 11.2 Browser verification (owner)

Re-run the R22 acceptance steps on **production** (signed-out privacy, sign-in, Overview, task list preservation, two-event isolation, Back, Pipeline/Active, finance separation, communications labels, mobile). Stop at first failure → rollback plan.

### 11.3 Scheduled execution verification

| Surface | Check | Rule |
| --- | --- | --- |
| Calendar TaskSync | Schedule presence ≠ execution | R27 evidence still required for LIVE_VERIFIED cycles |
| Four-times-daily approvals | Must remain off | Schedule ≠ delivery |
| Morning/evening / executive brief | External; do not modify | NOT_VERIFIED from Cursor |

---

## 12. Explicit non-actions of this prep

- No Git commit, push, merge, or branch switch
- No Vercel deploy or production promotion
- No clasp push / Apps Script or SQL change
- No live provider reads claimed as fresh acceptance
- No activation of send, event writes, or schedules
- No Agent Relay repair
- No wholesale PR #6 proposal

---

## Marker

COMMAND_CENTER_R30_RELEASE_PLAN_READY

Production decision remains **HOLD** until explicit owner release approval.
