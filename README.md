# LVPT Event Command Center 2026

Single-event and annual operations dashboard for Las Vegas Poker Training.

## Included in this release

- Six-stage guided event setup covering client, schedule, venue, experience design, production, staffing, financials, compliance and follow-up.
- Automatic event setup completeness score and missing-information checklist.
- Generated pre-event milestones, reminder dates, compliance requirements and staffing placeholders.
- Quote, payment, task, staff, compliance, post-event and partner-report tracking.
- Per-event document vault for invoices, receipts, contracts, COIs, floor plans and miscellaneous files.
- Gmail API routes for server-side mailbox search and explicit reminder sending from `book@pokertraininglasvegas.com`.
- Browser notifications for overdue and near-due tasks.
- CSV and JSON exports.
- Lifecycle navigation for sales pipeline, booked/active events, past-event archive, proposal library, and client follow-up.
- Curated live Vercel proposal previews linked back to event records.
- Email-intelligence review queue for unanswered client messages, procurement/compliance requests, scope changes, post-event follow-up, rebooking, and unmatched potential leads.
- Protected automation route for manual scans and morning/evening scheduling through the Google Apps Script backend.

## Current storage model

Event records are saved in browser `localStorage`. Uploaded document blobs are saved in browser `IndexedDB`. This makes the current release usable immediately, but records and files are not shared across devices.

The production upgrade should move event data to Postgres and private documents to Vercel Blob after admin authentication is added.

## Client lifecycle automation

The Google Apps Script backend can scan Gmail, match messages to event records, create safe deterministic follow-up tasks, and place ambiguous findings in the `Automation Inbox` sheet for human review. It also checks completed events for thank-you, review/testimonial, and rebooking opportunities.

After deploying the latest `apps-script/Code.gs` and `apps-script/appsscript.json`, run `installLvptTwiceDailyClientLifecycleTriggers` once. This installs morning and evening scans at approximately 8:00 AM and 7:00 PM in the Apps Script project time zone. The same setup can be requested from the Command Center's Client Follow-Up page after the web-app deployment has been updated.

## Gmail setup

The Gmail routes remain disabled until these encrypted Vercel environment variables are configured:

```text
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
GMAIL_REFRESH_TOKEN=
GMAIL_ACCOUNT_EMAIL=book@pokertraininglasvegas.com
GMAIL_SYNC_KEY=
```

`GMAIL_SYNC_KEY` should be a long random secret. The administrator enters it in the app for the current browser session. Search and send routes reject requests without the matching key.

The Google OAuth client must have Gmail scopes sufficient to read message metadata and send messages for the authorized mailbox.
