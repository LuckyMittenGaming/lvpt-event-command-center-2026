# Phase 5 staging readiness

Recorded: 2026-11-12. Production Apps Script was not changed. No production `clasp push`, no trigger, no Calendar write, no email, and no git commit.

Production deployment remains **NO-GO**. The isolated staging preview is ready for one editor run.

## Recorded production preview

Saved TaskSync v3.0, three calendars, November 12, 2026:

| Result | Value |
|---|---|
| Total task rows | 156 |
| Active tasks with dates | 40 |
| Unchanged reminders | 40 |
| Undated tasks preserved | 4 |
| Proposed Calendar modifications | 0 |
| Calendar writes | 0 |

These figures are also in `docs/baselines/phase-04-verification.md`. They do not describe the four-calendar candidate.

## Staging project

New standalone project, not the production Calendar Command Center:

https://script.google.com/d/1rDlSTCuf7R9yYY3h5ggM-Z3Ivv9S5AMMvRZSnatrgYpTDKKiwMACJm8f/edit

Local source: `apps-script/staging-calendar-preview/`. A read-back pull confirmed the saved staging files match that source. The staging script id is not the production script id.

Safeguards:

- Manifest scopes are only `spreadsheets.readonly` and `calendar.readonly`. Gmail, trigger, and external-request scopes are absent.
- `previewLVPTTaskSync` reads the Tasks sheet and all four business calendars, logs `WOULD` lines, and returns `calendarWrites: 0`.
- `runLVPTTaskSync` throws before any read or write. Calling the sync with a write flag throws. The apply function throws.
- The staging file contains no insert, patch, remove, trigger, Gmail, or sheet-write call.
- Undated tasks stay undated. Events with guests are classified as customer events and are not proposed for removal.
- `conferenceRestClear` stays false. Meet cleanup is not part of this run.
- `Code.js` and `setupLVPTCalendars()` are not in the staging project. The production hourly trigger was not edited.

`npm run test:staging-safety` passed, including `tests/calendar-staging-readonly.test.cjs`.

## Next action

Sign in as book@pokertraininglasvegas.com. Open the staging URL above and confirm the title is **LVPT Calendar Preview Staging**. Select `previewLVPTTaskSync` and click Run.

Approve the consent screen only when it asks to view spreadsheets and view calendars. Deny it if it asks to edit or delete calendars, send email, or manage triggers.

Do not run `runLVPTTaskSync`, do not add a trigger, and do not paste this file into the production project. Send back the execution log. `calendarWrites` must be 0, and `noDueDate` should be 4 unless the sheet changed after the production preview.
