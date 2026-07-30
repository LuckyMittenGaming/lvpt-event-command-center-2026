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

## Current storage model

Event records are saved in browser `localStorage`. Uploaded document blobs are saved in browser `IndexedDB`. This makes the current release usable immediately, but records and files are not shared across devices.

The production upgrade should move event data to Postgres and private documents to Vercel Blob after admin authentication is added.

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
