# Phase 7C — Calendar API authorization and 18-event verification

Recorded: 2026-11-20, 1:55 PM ET. Read-only. No Calendar write, no Apps Script edit, no deployment, no trigger change, no new OAuth consent, no scope addition, and no spreadsheet change.

The 18 pairs remain the pairs in `docs/baselines/phase-07a-reconciliation.md`. None were added.

## Recommendation

**NOT READY — ADDITIONAL VERIFICATION REQUIRED**

| Result | Count |
|---|---|
| VERIFIED — TECHNICALLY ELIGIBLE | 0 |
| HELD — INCOMPLETE VERIFICATION | 18 |
| REJECTED — FAILED SAFETY CHECK | 0 |
| Events retrieved with `events.get` | 0 |

No supported read-only Calendar API connection was established. The first allowlisted event was not requested. The other 17 were not requested. All 18 stay held.

## 1. Root cause of the Phase 7B HTTP 403

The Phase 7B call was not the public Calendar API. It was sent from the signed-in Calendar page to the internal host `clients6.google.com`:

`GET https://clients6.google.com/calendar/v3/calendars/{operationsCalendarId}/events/qeldb1q51645jklbu85q4e04jk`

The public method is:

`GET https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events/{eventId}`

The browser session was not presented as an OAuth access token for that public API. `clients6.google.com` answered HTTP 403 with `Permission denied on the service.` The body was an error object. It did not contain an event, an ETag, or `extendedProperties`. The request used no `fields` filter, so the missing marker is not a reduced response and is not proof that `lvptManaged` is absent.

## 2. Authentication methods evaluated

### Existing clasp OAuth client

One local clasp credential exists. Its identity token is for `book@pokertraininglasvegas.com` on the `pokertraininglasvegas.com` hosted domain. It was issued at 2026-11-12 06:11:11 UTC and the access token expired at 2026-11-12 07:11:11 UTC. No other local OAuth file, service-account file, or application-default credential was found.

The stored access token is no longer accepted. Google's token info endpoint returned HTTP 400, `Invalid Value`. Refreshing that same client returned HTTP 400, `invalid_grant`, with description `reauth related error (invalid_rapt)`. Google Workspace is requiring an interactive sign-in. No login was started, no scope was added, and the credential file was not printed or copied.

Because the access token is dead, its granted scopes cannot be read from it now. The Phase 7B record is that the last usable clasp token did not include `calendar.readonly`. A successful re-login of the default clasp client would restore Script and Drive access. It would not, by itself, authorize `events.get`.

### Option A — Apps Script Advanced Calendar service

The Calendar advanced service is already declared.

| Project | Script ID | Calendar advanced service | Declared scopes | Execution API |
|---|---|---|---|---|
| Staging, LVPT Calendar Preview Staging | `1rDlSTCuf7R9yYY3h5ggM-Z3Ivv9S5AMMvRZSnatrgYpTDKKiwMACJm8f` | Calendar v3 | `spreadsheets.readonly`, `calendar.readonly` | Absent |
| Production Calendar Command Center | `1bYJcEE5GUbfiWvXNiew_bfgBwDyfakhO8aiPWDtGF70ZO_zqd0z_4XDP` | Calendar v3 | None pinned. The saved code calls Calendar insert, patch, and remove | Absent |
| Event Command Center backend | separate backend script | Gmail v1 only | Spreadsheets, Drive, Gmail. No Calendar scope | Web app, not a Calendar reader |

Staging `previewLVPTTaskSync` is read-only. `runLVPTTaskSync` throws. The staging source contains no Calendar insert, patch, or remove call. It does call `Calendar.Events.get`, but only for canonical event IDs found in task notes, and the returned report keeps counts, issues, and protected rows. It does not return ETag, transparency, attendees, or `extendedProperties.private` for the Phase 7A allowlist.

There is no existing function that performs `Calendar.Events.get` for `qeldb1q51645jklbu85q4e04jk` and returns the resource. `clasp run` cannot call the staging function: the manifest has no `executionApi` block, and creating an API executable deployment would change the project. That was not done. The expired clasp token also cannot call the Apps Script API until `book@` signs in again.

The production project was not opened for execution. Its Calendar grant is a write-capable script authorization, not a read-only REST client, and it has no Execution API.

### Option B — public Calendar REST client

No usable authorized client remains. The only stored OAuth client cannot refresh. The public `events.get` endpoint was not called.

### Option C — connector

This workspace has no Google Calendar connector that returns a raw event ETag or `extendedProperties.private`. A partial connector record would not have been treated as verification.

### Google Cloud API enablement

No Cloud project setting was changed. The staging manifest already enables the Calendar advanced service inside that Apps Script project. This phase could not query a Google Cloud project, because the only stored credential cannot refresh. Enabling the Calendar API on a new or external Cloud project was not done.

### Access to the four calendars

The clasp identity is `book@pokertraininglasvegas.com`. November 12 exports showed that account's four LVPT calendars, and Phase 7B saw those calendars in the Calendar product. This phase did not list them through the Calendar API, so API-level access is not re-proven.

## 3. Supported read-only connection

Not established.

## 4. Events inspected

Zero. Authorization failed before the first read, so API testing stopped.

The event that was not requested is the first Phase 7A pair:

- Event ID: `qeldb1q51645jklbu85q4e04jk`
- Operations calendar: `c_a9756e49c39a571a2c21d99524f4c226e1772fca9f0c4156e245d5fd7d941a2a@group.calendar.google.com`
- Allowlisted task ID: `id-o7d4f2t0-msgkz6li`

`extendedProperties.private.lvptManaged === "taskSyncV1"` was not tested. The TaskSync schema still requires both `lvptManaged` equal to `taskSyncV1` and `lvptTaskId` equal to the allowlisted task ID. A matching title or description is not ownership.

The other 17 pairs were not sent. Each remains **HELD — INCOMPLETE VERIFICATION** for the same reason: no event resource was returned.

## 5. Totals

Verified: 0. Held: 18. Rejected: 0.

## 6. Owner action required

Do not approve a Calendar write from this phase.

The safest restoration uses the existing staging project and its existing read-only scopes. It does not use the production Calendar Command Center, and it does not add a scope to clasp.

1. Sign in as `book@pokertraininglasvegas.com`.
2. Open the existing staging project, LVPT Calendar Preview Staging, script `1rDlSTCuf7R9yYY3h5ggM-Z3Ivv9S5AMMvRZSnatrgYpTDKKiwMACJm8f`.
3. Approve a consent screen only when it asks to view calendars and view spreadsheets. Deny a request to edit calendars, send mail, or manage triggers.
4. Approve a staging-only read-only function that calls `Calendar.Events.get` for the exact 18 Phase 7A pairs and returns the full resource fields needed for verification: ETag, status, transparency, `extendedProperties.private`, summary, description, start, end, attendees, organizer, reminders, and conference data. That function does not exist today. `previewLVPTTaskSync` does not return those fields. Adding the function is a staging edit and was not performed here.
5. After that read succeeds, repeat the Phase 7C classification. An event is technically eligible only when its own resource passes every check.

Re-authenticating clasp is a separate requirement if Script or Drive access is needed again. The current failure is `invalid_rapt`. Restoring the default clasp scopes still does not authorize the public Calendar API.

## 7. Why the current permissions are insufficient

The Calendar product session can display the calendars and still cannot call the public Calendar API. The stored OAuth client belongs to `book@`, but its access token expired on November 12 and Google will not refresh it without an interactive sign-in. The staging project is the only manifest that already limits Calendar access to `calendar.readonly`, and it cannot be executed remotely. The production Calendar project has the advanced service, and its saved code is a writer. Neither path produced an event resource.

## 8. Next phase

Stay on read-only verification. After the owner completes the staging read above, classify each of the 18 from its own `Calendar.Events.get` response. Do not carry eligibility from one event to another.

If all 18 later pass, the unexecuted correction remains the one recorded in `docs/baselines/phase-07b-api-verification.md`: a fresh GET, a conditional PATCH whose body is only `{"transparency":"transparent"}`, `If-Match` set to the ETag just read, and a rollback that patches only `{"transparency":"opaque"}` with a new ETag. That plan was not run.

Stop. No production write is requested.
