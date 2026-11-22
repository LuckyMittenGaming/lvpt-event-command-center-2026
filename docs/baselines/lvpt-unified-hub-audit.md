# LVPT unified hub audit

Read-only baseline for issue #7. Captured 2026-11-22. No Apps Script deployment, no Sheet writes, no Calendar writes, no customer sends, and no merge of draft PR #6.

## Labels

| Surface | Status | Evidence |
| --- | --- | --- |
| Production V2, `main` @ `63d5921`, https://lvpt-event-command-center-2026.vercel.app/v2/index.html | LIVE | Public production alias. Existing dashboard only. |
| Apps Script web app `status` | LIVE | Production `GET /api/sync/status` returned 200 at `2026-11-22T19:29:06.676Z` for spreadsheet `1oHoVdD5CDcEreyRnB7cEvYfp6wWEgAmf04BwrktkMYs`, mailbox `book@pokertraininglasvegas.com`, app sync key configured. This is a health ping, not a row count. |
| `runLVPTSafeTaskSync` | NOT VERIFIED | Nov 22 owner baseline says it is the sole hourly Calendar writer. This session did not read triggers and did not change the script. |
| Vercel Gmail routes on production | NOT CONNECTED | `GET /api/gmail/status` returned `configured: false`. |
| SMS routes on production `main` | NOT CONNECTED | `GET /api/sms/staging/audit-health` returned 404. SMS code is only on the feature branch. |
| Feature preview https://lvpt-event-command-center-2026-dzwr3l3cz.vercel.app | STAGING | GitHub deployment `7727477518` succeeded on 2026-11-12 for sha `1344896`. Vercel Authentication returned 302. The older host in `SMS-STAGING-SETUP.md` does not resolve. |
| SMS intake, Supabase `ogfrcwmsjbtiydlvqoyj` | NOT VERIFIED | Issue baseline says the project reported inactive. This session could not pass the preview login, so today's messages are not confirmed. |
| Every-invoice `paymentRecords` on the live Apps Script | NOT VERIFIED | The read-only action is in git. It is not treated as deployed. Calling it needs the app sync key, which is not in this workspace. |
| ChatGPT morning review, evening review, 8:01 AM brief | NOT VERIFIED | Schedules are outside this repository. No last-success timestamp was readable here. |
| Four-times-daily email approvals | DISABLED | Left disabled. No send path was turned on. |
| GoHighLevel | OUT OF SCOPE | Not used for SMS, finance, or operations. |
| Draft PR #6 | STAGING | Left open and unmerged. |

## What this change adds

The existing V2 navigation gains Event Finance, Communications, and Source Health. Finance reads `GET /api/sync/ledger` with the same sync key the dashboard already uses. Until the live Apps Script returns one row per payment, the screen stays `NOT CONNECTED` and does not total the first invoice on an event. Communications links into `/sms-review` and does not send. Source Health refuses a green badge without a timestamp.

Prepared Apps Script fields `lineLabel`, `ledgerRole`, and `counterparty` are in the repository only. They are not deployed.

## Counts not re-baselined

The issue's Nov 22 connector read (44 Events, 35 Payments, 11 Event Payouts, 169 Tasks, 249 Gmail Activity) was not repeated. Those sheets were not overwritten.
