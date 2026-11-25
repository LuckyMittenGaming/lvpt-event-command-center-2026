# AGENTS.md
# LVPT Event Command Center — Autonomous Engineering Instructions

Version: 1.0
Project: Las Vegas Poker Training
Updated: November 25, 2026

---

## 1. PRIMARY DIRECTIVE

Continue developing the EXISTING LVPT Event Command Center.

DO NOT rebuild the application.
DO NOT reset completed development.
DO NOT discard existing local changes.
DO NOT overwrite completed phase baselines.
DO NOT create a competing application, repository, database, or Vercel project.

The objective is to produce an exceptionally reliable, secure,
operationally useful application at the lowest practical cost.

Our four business priorities are:

1. SEO
2. Conversions
3. Data Collection
4. Cost Efficiency

Security, accuracy, reliability, and data integrity are non-negotiable.

The objective is not to build cheaply.
It is to build exceptionally well at the lowest practical cost.

---

## 2. PROJECT IDENTITY

Project name:
LVPT Event Command Center

Local workspace:
E:\cursor_projects\lvpt-event-command-center-2026

Canonical GitHub repository:
LuckyMittenGaming/lvpt-event-command-center-2026

Repository URL:
https://github.com/LuckyMittenGaming/lvpt-event-command-center-2026.git

Production branch:
main

Existing staging integration branch:
feature/unified-command-center-staging

Existing development candidate branch:
feature/command-center-completion-20261124

Existing draft pull request:
https://github.com/LuckyMittenGaming/lvpt-event-command-center-2026/pull/19

Original master development issue:
https://github.com/LuckyMittenGaming/lvpt-event-command-center-2026/issues/7

Last independently verified remote candidate:
292103fc14480adbe84ae9c2404e4fed54ac1bf9

Last verified remote CI:
GitHub Actions run 45524866760 — SUCCESS

Last verified candidate deployment:
https://lvpt-event-command-center-2026-7v0lytkyn.vercel.app/v2/index.html

Existing branch preview alias:
https://lvpt-event-command-git-8f80fb-matt-carpenters-projects-7f34c5ab.vercel.app

Verify alias mapping and deployment protection before treating it
as the permanent staging URL.

Existing production URL:
https://lvpt-event-command-center-2026.vercel.app/v2/index.html

Existing Vercel project ID:
prj_XWIQD5ptbx3J7NnVr1n6EfrdMEFs

Production release status:
HOLD — explicit owner approval required.

These identifiers describe the known remote baseline.
They are NOT instructions to switch branches or reset the workspace.

The local workspace may contain newer, uncommitted development
through phase-07m or later. Preserve it.

---

## 3. SOURCE PRECEDENCE

When instructions or historical documentation conflict, use:

1. Current explicit owner instructions.
2. This AGENTS.md safety policy.
3. Verified current local code, tests, and completed phase baselines.
4. remaining-spec.md.
5. Latest verified issue #7 and PR #19 implementation evidence.
6. Current completion matrix and staging acceptance documentation.
7. Older engineering handoff documents and historical reports.

Read the following files before implementing changes:

- AGENTS.md
- remaining-spec.md
- docs/LVPT_CURSOR_HANDOFF.md
- docs/command-center-completion-matrix.md
- docs/command-center-staging-acceptance.md
- docs/baselines/lvpt-unified-hub-audit.md
- All applicable existing phase baselines through phase-07m.
- Any newer local phase baselines.
- package.json
- .github/workflows/sms-intelligence-review-ci.yml

Some files may exist only in the local workspace.

Do not treat a missing remote file as permission to recreate,
overwrite, or discard local progress.

Older handoff documentation is historical evidence, not an
unconditional instruction to repeat completed work.

### Explicit historical corrections

The following supersede conflicting older instructions:

- runLVPTSafeTaskSync is the sole authorized internal reminder writer.
- runLVPTTaskSync is retired.
- Other automations must not create, edit, or delete Calendar reminders.
- GoHighLevel is restricted to authorized contact import/export.
- Do NOT implement GoHighLevel SMS ingestion.
- The approved Android/Supabase path is the SMS integration.
- The four-times-daily Gmail approval automation remains disabled
  until its release gates are satisfied.
- No automatic customer communications.
- Owner-confirmed receipt is business-ledger evidence, not independent
  bank settlement evidence.
- Local agents must not commit or push changes.

---

## 4. APPLICATION PURPOSE

Maintain ONE private, authenticated LVPT operational workspace.

It must consolidate:

- Executive dashboard
- Action Required
- CRM and sales pipeline
- Active events
- Past events
- Proposal library
- Client follow-up
- Event finance
- Gmail and approved SMS/RCS communications
- Communication approval workspace
- Tasks and Calendar evidence
- System/source health
- Event reports and operational history

The application must help the owner immediately understand:

- Who needs a response.
- Which opportunities require follow-up.
- Which proposals are outstanding.
- Which events are confirmed.
- Which payments are outstanding.
- Which vendor obligations remain open.
- Which tasks need attention.
- Which communications require approval.
- Which data sources have failed or become stale.

Avoid features that do not contribute to these objectives.

---

## 5. TECHNOLOGY STACK

Use the existing architecture.

### Application

- Next.js
- React
- TypeScript
- Node.js
- Existing modular JavaScript V2 frontend
- Existing HTML and CSS design system
- Vercel deployment infrastructure

### Business data

- Google Sheets
- Existing Google Apps Script backend
- Google Workspace business Gmail
- Google Calendar

### Communications

- Existing encrypted Supabase SMS staging database
- Existing approved Android SMS bridge
- Existing read-only Google Messages RCS collector
- Existing protected SMS/Gmail review workspace

### Development automation

- Local Windows PowerShell
- Cursor CLI
- OpenAI API orchestration
- Existing GitHub repository
- Existing Node.js regression tests
- Existing local Chrome browser regression tests

Do not replace the modular V2 frontend merely because Next.js or
React is available.

Do not introduce another framework, UI component library, database,
queue provider, or paid dependency without a demonstrated need
and explicit owner approval.

---

## 6. REPOSITORY STRUCTURE

The following paths are established in the verified remote
candidate. Additional completed local paths must be inventoried
and preserved.

### Application

app/
    page.tsx
    api/
        gmail/
        sms/
            staging/
        sync/

public/
    v2/
        index.html
        app.js
        styles.css
        lifecycle-command-center.css
        unified-hub.css
        js/
            core.js
            wizard.js
            dashboard-base.js
            dashboard-tabs.js
            dashboard-upgrades.js
            documents.js
            gmail.js
            reports.js
            central-sync.js
            event-status.js
            lifecycle-command-center.js
            event-finance.js
            unified-hub.js
            authoritative-finance.js
            sheet-snapshot.js
            event-workspace-upgrade.js

    sms-review/
        index.html
        app.js
        review-engine.js
        case-engine.js
        reconciliation.js
        evidence-overlap.js
        gmail-thread-triage.js
        gmail-intelligence.js
        action-queue.js
        reply-qualification.js
        message-preview.js
        reply-workflow.js
        reply-review-controls.js
        draft-helper.js

lib/
    action-inbox.mjs
    owner-read-guard.mjs
    sms-review-session.mjs
    sms-intelligence.mjs
    sms-scan-health.mjs
    lvpt-personalized-policy.mjs

### Apps Script

apps-script/
    Code.gs
    GmailEvidence.gs
    GmailDraftContext.gs
    appsscript.json
    release/
        LVPT_Event_Command_Center_v1_2_COMPLETE_Code.gs

Inspect existing local Apps Script subdirectories, including
apps-script/live/ and apps-script/calendar-command-center/
if present.

Do not assume these local directories match the remote repository.

### Tests and documentation

tests/

docs/
    LVPT_CURSOR_HANDOFF.md
    command-center-completion-matrix.md
    command-center-staging-acceptance.md
    baselines/
    staging-migrations/

archive/
    public-roster-2026-11-24/

.github/
    workflows/
        sms-intelligence-review-ci.yml

package.json
package-lock.json
tsconfig.json

AGENTS.md
remaining-spec.md

---

## 7. PROTECTED FILES AND DIRECTORIES

### 7.1 Immutable historical and live-source material

Do not modify:

- apps-script/live/**
- Existing authenticated live Apps Script exports.
- Existing completed phase baseline documents.
- Existing historical data backups.
- Existing archived private roster files.
- Existing production snapshots.
- .git/**
- Any file containing production credentials or tokens.

The apps-script/live/ restriction applies if that directory exists.
Do not create an artificial live export if it does not.

Treat existing apps-script/calendar-command-center/ exports as
read-only unless a specific approved task establishes that a
particular file is a development candidate rather than live evidence.

Never edit an authenticated source export in place.

Create proposed changes separately under:

apps-script/proposed/

Only create that directory if an actual remaining task requires it.

Never move archived private roster information back into public/.

### 7.2 Sensitive production release files

The following are read-only to the autonomous worker unless the
owner explicitly authorizes a narrowly defined change:

- apps-script/Code.gs
- apps-script/GmailEvidence.gs
- apps-script/GmailDraftContext.gs
- apps-script/appsscript.json
- apps-script/release/**
- Production SQL migrations.
- .github/workflows/**
- Production deployment configuration.
- Authentication/session signing primitives.
- Actual Gmail/SMS provider send implementations.
- Live Calendar writer implementations.

Inspect and test these files.

Prepare proposed patches or isolated adapters where necessary.
Do not silently weaken production safeguards.

### 7.3 Sensitive API routes

Changes to private read routes are permitted when explicitly
required by remaining-spec.md and accompanied by authorization
and no-write regression tests.

Examples:

- app/api/sync/events/route.ts
- app/api/sync/operating-picture/route.ts
- app/api/sync/action-inbox/route.ts

Preserve the existing authorization guards.

Do not bypass authentication to make a test pass.

Provider mutation routes remain disabled or restricted to their
existing approved behavior.

---

## 8. GIT AND WORKSPACE SAFETY

The local agent is permitted to inspect Git state.

It is NOT permitted to create Git commits or push anything.

Forbidden commands and operations:

- git add
- git commit
- git push
- git reset
- git clean
- git checkout -- .
- git restore of existing owner changes
- git stash
- git rebase
- git merge
- git cherry-pick
- Automatic branch switching
- Force pushes
- Deletion of tracked or untracked owner work
- Automatic pull operations that modify the working tree

Never use destructive operations as a recovery mechanism.

Do not switch to main.

Do not automatically adopt the remote candidate over the
local workspace.

Do not merge draft PR #6 wholesale.

Do not merge PR #19.

### Mandatory startup inspection

Run from the repository root:

    git status --short
    git branch --show-current
    git rev-parse HEAD
    git remote -v
    git diff --stat
    git diff --cached --stat
    git log -5 --oneline

Inspect baseline filenames:

    Get-ChildItem .\docs\baselines -Recurse -File |
        Sort-Object FullName |
        Select-Object FullName

Identify completed phase-07m material and newer local evidence.

If required remote development is missing locally, produce a
reconciliation report and proposed non-destructive integration plan.

Do not perform the integration automatically when it would require
a prohibited Git operation or overwrite existing work.

Escalate that specific decision to the owner.

---

## 9. AUTHORITATIVE DATA SOURCES

Business Gmail:
book@pokertraininglasvegas.com

Authoritative Google Sheet:
1oHoVdD5CDcEreyRnB7cEvYfp6wWEgAmf04BwrktkMYs

Existing Supabase SMS staging project:
ogfrcwmsjbtiydlvqoyj

Google Sheets remains the business source of truth.

Preserve existing sheet tabs, including:

- Events
- Tasks
- Payments
- Event Payouts
- Gmail Activity
- Documents
- Change Log
- Reminder History
- Post Event, where present

Never replace the authoritative ledger with browser storage.

Never write an entire browser snapshot back to the sheet.

Never rebaseline existing business data merely to make
application counts agree.

Use stable identifiers:

- event_id
- task_id
- payment_id
- payout_id
- document_id
- Gmail message ID
- Gmail thread ID
- SMS source/provider ID
- RCS provider ID

Never automatically merge records using a fuzzy company,
contact, amount, title, date, or phone match.

Ambiguous associations require review.

Missing IDs and conflicting duplicates must be explicitly reported.

Historical record counts are observations, not constants.

---

## 10. FINANCIAL INTEGRITY

Keep the following concepts separate:

- Client budget.
- Recorded target quote.
- Priced quote line items.
- Issued invoice.
- Not-invoiced placeholder.
- Client payment initiated.
- Owner-confirmed receipt.
- Ledger-recorded receipt.
- Independently verified bank settlement.
- Outstanding receivable.
- Vendor commitment.
- Vendor invoice.
- Vendor payment.
- Refund.
- Fee.
- Tax.
- Instructor or vendor payout.
- Owner distribution.
- Forecast profit.
- Actual operating contribution.
- Drawable cash.

### Mandatory rules

1. Missing monetary data is not zero.
2. A budget is not a quote.
3. A payment is not a quote.
4. A target quote is not added to its component line items.
5. Unknown expenses do not mean zero expenses.
6. Never clamp negative profit to zero.
7. Owner distributions are not operating expenses.
8. Payment Initiated is not payment received.
9. Never treat an invoice as a booking without explicit
   booking evidence.
10. Multiple invoices with identical amounts remain distinct
    when their stable payment IDs differ.
11. Vendor payouts may be deduplicated against expenses only
    with an explicit validated same-event vendor-payment link.
12. Never automatically adjust unresolved financial exceptions.
13. Do not apply the standard 3.5% LVPT tax to every record
    without establishing its applicable tax basis.

An explicit owner confirmation of funds received can support
the business ledger's paid status for the exact invoice and amount.

It does not establish independent bank verification.

Do not infer drawable cash from the ledger.

Drawable cash requires sufficient verified evidence of:

- Actual cash balance.
- Settlement.
- Outstanding obligations.
- Tax reserves.
- Previous distributions.
- Expense completeness.
- Overlap reconciliation.

Until these are established, drawable cash remains unavailable.

---

## 11. CALENDAR AND TASK OWNERSHIP

Authorized business calendars:

- LVPT | Confirmed Events
- LVPT | Proposals & Holds
- LVPT | Operations & Payments
- LVPT | Sales & Follow-Ups

Never use a personal calendar for business task synchronization.

The sole authorized internal reminder writer is:

runLVPTSafeTaskSync

The retired function is:

runLVPTTaskSync

Do not reinstall, execute, or recreate the retired writer.

No other agent, scheduled job, UI component, or automation
may independently create, update, or delete internal reminders.

### Reminder requirements

- One active reminder per stable task ID.
- No recurring task reminders.
- Maximum duration of 15 minutes.
- Free/transparent.
- No fake Google Meet conference.
- No external guests.
- Preserve actual client appointments.
- Preserve cancelled reminder suppression.
- Preserve historical records and audit evidence.

Tasks without valid due dates belong in a review backlog.

Due today is not overdue.

A past event date does not establish event completion.

A completed client payment does not automatically close
vendor, production, payout, or post-event tasks.

Do not modify existing Google Calendar triggers.

Do not write to Calendar from the development loop.

---

## 12. COMMUNICATION AND APPROVAL RULES

Never automatically send client Gmail or SMS communications.

The owner approval actions are:

- APPROVE
- MAKE CHANGES
- DENY
- EDIT MYSELF

The workflow must verify:

- Correct business mailbox.
- Exact provider thread ID.
- Latest relevant message.
- Exact recipient.
- Full relevant conversation context.
- Draft revision or digest.
- Explicit owner approval.
- Idempotent send intent.
- Provider-confirmed send outcome.
- Audit history.
- Exactly-once queue advancement.

A clipboard copy is not a sent message.

An attempted send is not a confirmed send.

An uncertain provider response must enter reconciliation,
not automatic resend.

A changed recipient, changed draft, or newer inbound message
invalidates approval where appropriate.

DENY and EDIT MYSELF must not send.

MAKE CHANGES must return the revised draft for approval.

Never resume the four-times-daily approval automation until
the required controlled owner tests pass.

Existing intended approval schedule:

- 6:00 AM ET
- 12:00 PM ET
- 7:00 PM ET
- 12:00 AM ET

Current state: disabled pending approval and verification.

Existing morning/evening review and executive brief automations
are separate. Do not modify them from Cursor.

### Gmail archival

Archive only verified resolved communications.

Preserve searchable history.

Do not delete customer emails.

Do not archive a thread with a newer unresolved inbound message.

### SMS/RCS

Use the existing approved-number Android/Supabase path.

Do not ingest personal or unapproved contacts.

Do not interpret encrypted metadata as readable message content.

Do not confuse SMS with RCS.

Keep independent provider identities and deduplication.

RCS sending and mark-read remain off.

---

## 13. AUTHENTICATION AND PRIVACY

The application is private.

Preserve the existing signed HttpOnly owner-review session.

Private routes must reject unauthorized requests BEFORE
performing provider reads.

Do not rely on Origin headers or deployment protection alone
as application authentication.

Do not expose:

- API keys.
- Device tokens.
- Session secrets.
- Supabase service-role keys.
- Encryption keys.
- OAuth credentials.
- Client message bodies.
- Client contact information.
- Private proposal tokens.

Do not include credentials or customer content in:

- Prompts.
- Test fixtures.
- Build logs.
- URLs.
- Browser localStorage.
- Public assets.
- Git diffs submitted to external AI providers.
- AI orchestration state files.

Use synthetic fixtures for all development testing.

Clear private state when a session expires or becomes unauthorized.

Keep private operational pages out of public search indexes.

Public LVPT website SEO and conversion pages must remain unaffected.

---

## 14. UI AND DESIGN RULES

Preserve the existing LVPT dark, gold and burgundy design system.

Do not redesign the application during ordinary feature completion.

Requirements:

- Compact executive header.
- Clear, persistent navigation.
- Readable currency and dates.
- Desktop and mobile responsiveness.
- Visible selected states and keyboard focus.
- Accessible contrast.
- No unnecessary visual complexity.
- No giant empty vertical spaces.
- No full editor automatically shown on Overview.
- No misleading decorative success indicators.
- No fake or nonfunctional action controls.

### Record integrity

One open record must correspond to ONE validated event ID.

All displayed components must use the same ID:

- Event heading.
- Client.
- Tasks.
- Staffing.
- Quotes.
- Invoices.
- Documents.
- Reports.
- Communication history.

Do not fall back to the first event when a selected ID is missing.

Handle delayed responses and rapid switching safely.

### Navigation

Opening a task must not destroy its originating task list.

Opening details must preserve:

- Current page.
- Search.
- Filters.
- Sort.
- Scroll position.

Use expandable details or an appropriate detail panel.

Provide explicit Back to list and Close controls.

Browser Back and Forward must work within application history.

Do not redirect an authenticated user to sign-in merely because
they closed a record.

---

## 15. DATA FRESHNESS AND SOURCE HEALTH

Every integration must distinguish:

- Authenticated session.
- Provider availability.
- Last attempted read.
- Last successful read.
- Latest stored message/record.
- Latest ingestion.
- Actual collector heartbeat.
- Complete or partial coverage.
- Failed or timed-out read.
- Scheduled versus actually executed job.
- Verified versus unverified delivery.

A database row is not a heartbeat.

A historical import is not current phone collection.

A bounded Gmail header scan is not a complete mailbox scan.

A stored Gmail activity count is not a unique thread count.

A successful audit request is not proof of live synchronization.

A scheduled execution time is not proof a job executed.

Use explicit states:

- LIVE VERIFIED
- STAGING
- DISABLED
- NOT VERIFIED
- AUTHORIZATION REQUIRED
- STALE
- PARTIAL
- TIMED OUT
- UNAVAILABLE

Never convert a failed read into an empty successful response.

Never display misleading zero totals when data is unavailable.

Reuse authorized in-memory reads across views.

Do not indefinitely cache failures.

---

## 16. COST EFFICIENCY

Use existing subscriptions and infrastructure first.

The local orchestrator must favor:

- Deterministic checks before AI calls.
- Focused prompts.
- Small diffs.
- Existing tests.
- Existing working components.
- Reusable code.
- One worker at a time.
- Targeted code context.
- Actual test failures rather than speculative reviews.

Do not repeatedly send the entire repository to a model.

Do not send protected source data to an external model without
appropriate authorization and sanitization.

Do not call a paid API simply to determine whether a file exists,
a process exited, or a test passed.

Do not automatically increase model tier or token budgets.

Do not launch paid background agents.

Do not change subscriptions, billing settings, or spending limits.

The owner must establish an explicit API budget before enabling
unattended paid orchestration.

When the authorized budget is exhausted or cannot be verified,
stop paid operations and report the precise blocker.

---

## 17. LOCAL BUILD AND TEST COMMANDS

Run from:

E:\cursor_projects\lvpt-event-command-center-2026

Use PowerShell.

Use Node.js 22 to match the existing CI environment unless the
verified local project has an explicitly approved newer requirement.

### Environment checks

    node --version
    npm.cmd --version
    git --version
    Get-Command cursor, cursor-agent -ErrorAction SilentlyContinue

Do not assume the CLI executable name or its arguments.
Inspect installed CLI help before invoking it.

### Install dependencies

Only when required and authorized:

    npm.cmd ci

Do not run npm install or regenerate the lockfile unnecessarily.

Do not run npm audit fix --force.

Inspect package.json and package-lock.json first.

### Standard verification

    npm.cmd run test:staging-safety
    npx.cmd --no-install tsc --noEmit
    npm.cmd run build

The build automatically invokes the prebuild staging-safety tests.

Do not invent an npm test script.

Check for a nonzero exit code after every command.

Example:

    npm.cmd run test:staging-safety
    if ($LASTEXITCODE -ne 0) {
        throw "Staging safety tests failed."
    }

### Integrated acceptance test

    node .\tests\command-center-acceptance.test.mjs

### Browser regression test

    node .\tests\command-center-browser.test.mjs

The verified remote browser test imports playwright-core and
uses a Linux-specific Chrome path.

First complete the Windows compatibility task in remaining-spec.md
if that issue is still present.

Never skip browser tests because the executable path is wrong.

Never add a paid browser testing service.

### Full existing CI command sequence

Use the following PowerShell-compatible equivalent of the
verified SMS Review Engine workflow.

    $syntaxFiles = @(
        'public/sms-review/review-engine.js'
        'public/sms-review/app.js'
        'public/sms-review/case-engine.js'
        'public/sms-review/reconciliation.js'
        'public/sms-review/evidence-overlap.js'
        'public/sms-review/gmail-thread-triage.js'
        'public/sms-review/gmail-intelligence.js'
        'public/sms-review/action-queue.js'
        'public/sms-review/reply-qualification.js'
        'public/sms-review/message-preview.js'
        'lib/lvpt-diagnostic-selection.mjs'
        'lib/lvpt-diagnostic-message.mjs'
        'public/sms-review/reply-workflow.js'
        'public/sms-review/reply-review-controls.js'
        'public/sms-review/draft-helper.js'
        'lib/sms-intelligence.mjs'
        'lib/lvpt-personalized-policy.mjs'
        'lib/sms-review-session.mjs'
    )

    foreach ($file in $syntaxFiles) {
        node --check $file
        if ($LASTEXITCODE -ne 0) {
            throw "Syntax check failed: $file"
        }
    }

    $gasFiles = @(
        'apps-script/GmailEvidence.gs'
        'apps-script/GmailDraftContext.gs'
        'apps-script/release/LVPT_Event_Command_Center_v1_2_COMPLETE_Code.gs'
    )

    foreach ($file in $gasFiles) {
        Get-Content -LiteralPath $file -Raw |
            node --check

        if ($LASTEXITCODE -ne 0) {
            throw "Apps Script syntax check failed: $file"
        }
    }

    $tests = @(
        'tests/sms-review.test.js'
        'tests/sms-intelligence.test.mjs'
        'tests/sms-reconciliation.test.cjs'
        'tests/sms-evidence.test.cjs'
        'tests/sms-action-queue.test.cjs'
        'tests/sms-reply-qualification.test.cjs'
        'tests/sms-message-preview.test.cjs'
        'tests/sms-inbox-diagnostics.test.cjs'
        'tests/sms-inbox-diagnostics-autoselect.test.mjs'
        'tests/sms-diagnostic-message.test.mjs'
        'tests/sms-negative-gmail-canary.test.mjs'
        'tests/sms-gas-long-thread-preview.test.cjs'
        'tests/sms-gas-recipient-verification.test.cjs'
        'tests/sms-reply-review.test.cjs'
        'tests/sms-reply-send.test.cjs'
        'tests/sms-reply-send-runtime.test.cjs'
        'tests/sms-reply-send-ui.test.cjs'
        'tests/sms-reply-ai.test.cjs'
        'tests/sms-draft-preview.test.cjs'
        'tests/sms-personalized-draft.test.cjs'
        'tests/sms-ai-smoke-test.test.cjs'
        'tests/sms-ai-oidc-auth.test.cjs'
        'tests/gmail-thread-triage.test.cjs'
        'tests/sms-gmail-intelligence.test.cjs'
        'tests/sms-gmail-scope-static.test.cjs'
        'tests/sms-review-audit-static.test.cjs'
        'tests/sms-review-session.test.mjs'
    )

    foreach ($file in $tests) {
        node $file
        if ($LASTEXITCODE -ne 0) {
            throw "Regression failed: $file"
        }
    }

    npx.cmd --no-install tsc --noEmit
    if ($LASTEXITCODE -ne 0) {
        throw "TypeScript validation failed."
    }

Inspect the current local CI workflow before final acceptance.
Run any additional legitimate tests introduced by completed local
phases.

Never remove a test from the list to obtain a passing result.

Before running any historical test or build command, confirm it
does not call live providers or mutate production data.

Use isolated fixtures and mock provider adapters.

---

## 18. AUTONOMOUS EXECUTION PROTOCOL

The worker must follow remaining-spec.md in order.

For each task:

1. Read its acceptance criteria.
2. Inspect existing implementation and completed phase evidence.
3. Run its targeted verification.
4. If already implemented and verified, mark VERIFIED_EXISTING.
5. Otherwise make the smallest necessary change.
6. Add or strengthen deterministic regression coverage.
7. Run the targeted tests.
8. Run relevant staging safety checks.
9. Review the changed files and diff.
10. Record the result.
11. Proceed to the next authorized task.

Do not redo completed work merely because a task is listed.

Do not require owner approval for ordinary implementation
decisions within the authorized scope.

Pause at genuine external authorization or security boundaries.

When a task is externally blocked, continue independent tasks
that do not depend on it.

### Task states

- NOT_STARTED
- IN_PROGRESS
- VERIFIED_EXISTING
- IMPLEMENTED_TESTED
- BLOCKED_OWNER
- BLOCKED_ENVIRONMENT
- FAILED
- READY_FOR_ACCEPTANCE
- LIVE_VERIFIED

Do not use LIVE_VERIFIED for synthetic fixtures.

### Required persistent progress record

Create or update:

docs/baselines/local-completion-progress.md

Do not modify completed historical phase documents.

For every task record:

- Task ID.
- Status.
- Date/time.
- Files inspected.
- Files changed.
- Exact test commands.
- Exit codes.
- Evidence.
- Remaining blocker.
- Next task.

The automation must use this record to resume work after a restart.

Do not store raw customer content or credentials in it.

---

## 19. RETRY AND ESCALATION POLICY

Maximum proposed default:

Two corrective attempts for the same concrete failure after the
initial implementation attempt.

After that, stop the failing task and escalate with:

- Exact task ID.
- Relevant file.
- Sanitized error.
- Test command.
- What was attempted.
- Proposed next action.
- Required owner decision, if any.

Do not repeatedly retry unchanged errors.

Do not disable assertions, mock a successful production response,
or weaken security to make the loop advance.

Never modify the orchestration policy itself to bypass a budget
or approval gate.

---

## 20. STRICTLY FORBIDDEN EXTERNAL ACTIONS

Without separate explicit owner authorization:

- No production deployment.
- No Vercel promotion.
- No GitHub merge.
- No git commit or push.
- No clasp push.
- No clasp deploy or redeploy.
- No SQL migrations against live databases.
- No production Sheet writes.
- No Calendar writes.
- No live document uploads or deletions.
- No customer email or SMS sends.
- No Gmail archive, delete, or mark-read mutations.
- No new provider permissions.
- No credential creation or rotation.
- No billing changes.
- No paid agent creation.
- No automated RCS mark-read or send.
- No enabling disabled production flags.

Preparing isolated development code, tests, documentation and
proposed changes is allowed within the specified file scope.

---

## 21. DEFINITION OF DONE

The project is not complete merely because:

- Code compiles.
- CI passes.
- A Vercel build succeeds.
- A synthetic browser test succeeds.
- The agent emits a completion marker.

Development readiness requires:

- Existing progress preserved.
- Every remaining safe task implemented or verified.
- All applicable deterministic and browser tests pass.
- Correct event identity across all views.
- No production mutations.
- Accurate financial classifications.
- Accurate authentication and source states.
- Completed security review.
- Consolidated external acceptance checklist.

Operational readiness additionally requires:

- Actual authenticated browser acceptance.
- Live authoritative data verification.
- Current Android collection evidence.
- RCS pairing and collection evidence.
- Gmail full-thread and recipient verification.
- Controlled approval workflow testing.
- Verified safe Calendar execution and subsequent cycles.
- Explicit approval of editing and sending capabilities.
- Owner-approved production release and rollback plan.

Report these as separate milestones.

Final production decision remains with the owner.