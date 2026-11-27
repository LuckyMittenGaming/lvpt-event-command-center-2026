# R31 changed-file manifest

Updated: 2026-11-26 23:15 -05:00 (America/New_York)
Status: read-only Git inventory for R31 / T47 handoff §5
Policy: additive documentation only — does not rewrite historical phase baselines.

## Scope

| Field | Value |
| --- | --- |
| Base | `292103fc14480adbe84ae9c2404e4fed54ac1bf9` |
| HEAD | `9403ff83dee2b0f7648f9fef20f47dba8b6d1112` |
| Range syntax | `git diff --name-only <base>..<HEAD>` then unique sort |
| Net unique paths (this list) | **143** |
| Historical path occurrences across commits in range | **266** (same path counted once per commit that touches it) |
| Historical unique paths | **143** (equals net unique for this range) |

**143 means net unique / distinct repository-relative paths** that differ between the base tree and HEAD (equivalently: unique paths touched at least once in the 48-commit range). It is **not** a sum of per-commit historical touch counts (that sum is **266**).

This committed-range inventory is **separate from** T47 uncommitted working-tree edits to `docs/COMMAND_CENTER_FINAL_HANDOFF.md` and `docs/baselines/local-completion-progress.md` (and untracked `.orchestrator/`).

Appearance of `docs/baselines/phase-*` or `apps-script/live/**` here records that those paths differ from the staging-tip ancestor in Git history. It does **not** claim the R31/T47 Cursor loop edited historical phase baselines or performed clasp/live mutations.

## Exhaustive path list (143)

```
AGENTS.md
app/api/gmail/status/route.ts
app/api/sync/events/route.ts
app/api/sync/operating-picture/route.ts
app/api/sync/status/route.ts
apps-script/calendar-command-center/reportLVPTManagedPatchDetails.js
apps-script/calendar-command-center/TaskSync.js
apps-script/calendar-command-center/TaskSync.live-v3.0.js
apps-script/calendar-command-center/TaskSync.production-candidate.js
apps-script/calendar-command-center/TaskSync.safe-integrate.js
apps-script/calendar-command-center/TaskSync.safe-review.js
apps-script/calendar-command-center/TaskSync.safe-sync.js
apps-script/calendar-command-center/verifyLVPTSafeIntegrationLive.js
apps-script/live/calendar-command-center/appsscript.json
apps-script/live/calendar-command-center/Code.js
apps-script/live/calendar-command-center/TaskSync.js
apps-script/live/client-event-integration/appsscript.json
apps-script/live/client-event-integration/Code.js
apps-script/live/event-command-center-backend/appsscript.json
apps-script/live/event-command-center-backend/Code.js
apps-script/live/event-command-center-backend/GmailEvidence.js
apps-script/staging-calendar-preview/appsscript.json
apps-script/staging-calendar-preview/TaskSync.js
apps-script/verify-readonly/calendar-command-center/appsscript.json
apps-script/verify-readonly/calendar-command-center/Code.js
apps-script/verify-readonly/calendar-command-center/TaskSync.js
apps-script/verify-readonly/staging-push-check/appsscript.json
apps-script/verify-readonly/staging-push-check/TaskSync.js
apps-script/verify-readonly/staging-sheets-check/appsscript.json
apps-script/verify-readonly/staging-sheets-check/TaskSync.js
docs/android-sms-operational-checklist.md
docs/automation-ownership.md
docs/baselines/final-local-regression.md
docs/baselines/live-source-acceptance.md
docs/baselines/local-baseline-reconciliation.md
docs/baselines/local-completion-progress.md
docs/baselines/local-test-environment.md
docs/baselines/phase-01-inventory.md
docs/baselines/phase-03-deployment-review.md
docs/baselines/phase-04-verification.md
docs/baselines/phase-05-staging-readiness.md
docs/baselines/phase-06-patch-audit.md
docs/baselines/phase-07a-reconciliation.md
docs/baselines/phase-07b-api-verification.md
docs/baselines/phase-07c-authorization-verification.md
docs/baselines/phase-07d-staging-verification.md
docs/baselines/phase-07e-default-value-verification.md
docs/baselines/phase-07f-cancelled-event-reconciliation.md
docs/baselines/phase-07g-reminder-recreation-safety.md
docs/baselines/phase-07h-production-correction-review.md
docs/baselines/phase-07i-final-reminder-reconciliation.md
docs/baselines/phase-07j-final-readonly-integration.md
docs/baselines/phase-07k-browser-live-verification.md
docs/baselines/phase-07l-production-correction.md
docs/baselines/phase-07l-production-diff.diff
docs/baselines/phase-07m-production-sync.md
docs/baselines/r31-final-acceptance-reconciliation.md
docs/baselines/t36-full-local-regression.md
docs/calendar-operational-acceptance.md
docs/COMMAND_CENTER_FINAL_HANDOFF.md
docs/command-center-completion-matrix.md
docs/command-center-release-plan.md
docs/command-center-rollback-plan.md
docs/command-center-security-acceptance.md
docs/command-center-staging-acceptance.md
docs/event-editing-release-plan.md
docs/event-mutation-contract.md
docs/gmail-operational-acceptance.md
docs/local-agent-loop.md
docs/rcs-operational-checklist.md
lib/action-inbox.mjs
lib/event-mutation-contract.mjs
lib/sms-scan-health.mjs
lib/source-reliability.mjs
package.json
package-lock.json
public/sms-review/action-queue.js
public/sms-review/app.js
public/sms-review/gmail-intelligence.js
public/sms-review/gmail-thread-triage.js
public/sms-review/index.html
public/sms-review/message-preview.js
public/sms-review/reply-qualification.js
public/sms-review/reply-review-controls.js
public/sms-review/reply-workflow.js
public/v2/app.js
public/v2/event-workspace-upgrade.css
public/v2/js/authoritative-finance.js
public/v2/js/central-sync.js
public/v2/js/dashboard-upgrades.js
public/v2/js/documents.js
public/v2/js/event-finance.js
public/v2/js/event-status.js
public/v2/js/event-workspace-upgrade.js
public/v2/js/lifecycle-command-center.js
public/v2/js/reports.js
public/v2/js/sheet-snapshot.js
public/v2/js/unified-hub.js
public/v2/lifecycle-command-center.css
public/v2/unified-hub.css
remaining-spec.md
scripts/local-agent-loop.mjs
scripts/local-agent-loop.ps1
scripts/local-agent-policy.json
scripts/local-agent-policy.mjs
scripts/lvpt-safe-readonly-dry-run.cjs
scripts/verify-command-center.ps1
tests/action-inbox.test.mjs
tests/approval-idempotency.test.mjs
tests/calendar-production-candidate.test.cjs
tests/calendar-safe-integrate.test.cjs
tests/calendar-safe-live-verify.test.cjs
tests/calendar-safe-review.test.cjs
tests/calendar-safe-sync.test.cjs
tests/calendar-staging-readonly.test.cjs
tests/calendar-task-reconcile.test.cjs
tests/command-center-acceptance.test.mjs
tests/command-center-browser.test.mjs
tests/command-hub-finance.test.cjs
tests/crm-attribution.test.mjs
tests/event-finance.test.cjs
tests/event-mutation-contract.test.mjs
tests/event-status.test.mjs
tests/fixtures/LVPT_Phase7I_Verified_Event_Handoff.json
tests/gmail-thread-triage.test.cjs
tests/local-agent-policy.test.mjs
tests/operational-reports.test.mjs
tests/owner-read-guard.test.mjs
tests/private-asset-exposure.test.mjs
tests/rcs-collector.test.mjs
tests/rcs-staging.test.mjs
tests/sms-gmail-intelligence.test.cjs
tests/sms-message-preview.test.cjs
tests/sms-reply-qualification.test.cjs
tests/sms-reply-queue-navigation.test.cjs
tests/sms-reply-review.test.cjs
tests/sms-reply-send.test.cjs
tests/sms-reply-send-runtime.test.cjs
tests/sms-reply-send-ui.test.cjs
tests/sms-review-session.test.mjs
tests/sms-scan-health.test.mjs
tests/source-reliability.test.mjs
tests/verify-command-center.test.mjs
```

Inspection command (read-only):

```powershell
git diff --name-only 292103fc14480adbe84ae9c2404e4fed54ac1bf9..HEAD | Sort-Object -Unique
```

