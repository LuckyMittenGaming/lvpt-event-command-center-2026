# LVPT Event Command Center — Cursor Engineering Handoff
Updated: 2026-11-11. Branch: `feature/lvpt-sms-intelligence-review`.

## Mission (in priority order)
1. **No missed leads, replies, client promises, payments, vendor obligations, or event logistics** (conversion and retention).
2. **One trusted operational ledger and one writer per downstream surface**, with source-linked audit and data capture.
3. **Automatic, conservative closure/archival** of completed work, so inbox and calendar show real outstanding actions rather than historical noise.
4. Maintain site conversion/SEO/data collection; do not let the command-center work destabilize public LVPT pages.

Read the repo and tests first. DO NOT trust historical assistant statements that everything has been fixed. Reproduce and verify.

## Verified production repository mapping (November 11, 2026)
- Live URL: `https://lvpt-event-command-center-2026.vercel.app/v2/index.html`.
- Existing Vercel project ID: `prj_XWIQD5ptbx3J7NnVr1n6EfrdMEFs`; do **not** create a new Vercel project.
- Production Vercel deployment metadata explicitly reports GitHub **`LuckyMittenGaming/lvpt-event-command-center-2026`**, branch **`main`**, commit `63d5921ac1da1d6e4cab01a220cc00232b40246c` (verified from deployment `dpl_DiogUEfhyJpstCXVw4ae6TwuLfCr`). This identifies the owner/repo behind the production alias, but do not infer that old deployment is the newest without checking current live alias again.
- The repository also contains `public/v2/index.html` on BOTH `main` and feature branch `feature/lvpt-sms-intelligence-review`. Use the **same repository** for Cursor. Clone once, then check out the feature branch. Preserve production main.
- Another repository exists at `Las-Vegas-Poker-Training/lvpt-event-command-center-2026`. It is **not** the verified production deployment's source; do not clone or merge it by guesswork.
- The Google Apps Script projects are separate existing projects, not new Vercel/GitHub repositories. When authorized, import each into a distinct subdirectory via Google `clasp` with real verified Script IDs. Existing live TaskSync is NOT already in the repo.
- In Cursor: File → Clone Repository → `https://github.com/LuckyMittenGaming/lvpt-event-command-center-2026.git`; select feature branch; open this repository as the **single** workspace. Use a new Agent conversation inside that folder. No new Cursor app, blank template, GitHub repository or Vercel project.

## Known repository and services
- GitHub: `LuckyMittenGaming/lvpt-event-command-center-2026`; use `feature/lvpt-sms-intelligence-review`, not `main` for unreviewed changes.
- Existing Next.js/Vercel staging; `package.json` runs `npm run test:staging-safety` automatically before `npm run build`.
- Gmail business identity: `book@pokertraininglasvegas.com` (never personal account).
- Command Center database: native Google Sheet `1oHoVdD5CDcEreyRnB7cEvYfp6wWEgAmf04BwrktkMYs`. Keep **Tasks** keyed by exact `task_id` as current task source of truth; other tabs include **Events**, **Payments**, **Post Event**, and **Change Log**. Do not mutate unrelated cells, validations, or formulas.
- Four dedicated business calendars: **LVPT | Confirmed Events**, **LVPT | Proposals & Holds**, **LVPT | Operations & Payments**, **LVPT | Sales & Follow-Ups**. Never sync task data to personal `wsopamatt@gmail.com`.
- Two distinct production Google Apps Script projects:
  1. **LVPT Event Command Center Backend** (Gmail/context/API bridge); repository release source `apps-script/release/LVPT_Event_Command_Center_v1_2_COMPLETE_Code.gs`. Note the separate existing `GmailEvidence.gs` in Apps Script; the repository copy is NOT a verified export of the entire production project.
  2. **LVPT Calendar Command Center**, `TaskSync.gs`, hourly installed trigger `runLVPTTaskSync`. As of the latest owner report, corrected **TaskSync v3** was saved in Apps Script and the owner ran the function. Its EXACT live source is **not yet committed here**. FIRST bring an authenticated, read-only export into a new dedicated `apps-script/calendar-command-center/` folder, without overwriting the backend project or inventing script IDs.
- Four separate ChatGPT scheduled automations currently handle morning/evening reviews, a morning executive brief, and midnight/6AM/noon/7PM email approvals. **Cursor does not automatically inherit these schedules or their connected-account permissions**; do not assume they are native code in this repo. Identify and migrate/coordinate deliberately, with no parallel duplicate writers.
- Supabase `ogfrcwmsjbtiydlvqoyj` hosts staging/audit tables. SMS staging bodies are encrypted; current direct readable GoHighLevel SMS access is **NOT verified**. Do not pretend SMS content can be reconciled until a properly authorized GHL API/connector and source data have been tested.
- Avoid secrets in Git or prompts. Use local encrypted credential stores and Vercel environment variables, principle of least privilege, and server-side connectors.

## Verified behavior vs outstanding work
- Nov 11 owner executed the saved `runLVPTTaskSync`: log `preview:false, totalTaskRows:156, datedActiveTasks:43, unchanged:43, zero writes`. This is NOT proof all linked records are correct.
- Earlier 28/33 recurring weekday OVERDUE masters were repeatedly deleted; TaskSync v3 was introduced to prevent recreation. Follow-up live Calendar checks saw **zero RRULE recurring tasks**.
- Multiple **independent automation writers created duplicate one-time reminders** after a supposed clean scan. Approximately 23 duplicates were removed in a later pass; prevent new duplicates through architectural ownership, not just deletion.
- Source-of-truth policy now says **TaskSync is the sole creator/updater** of internal task reminders. Other automation agents may read the calendar and only remove a verified owner-only completed/duplicate task reminder, never create/modify separate task events. Confirm there are no remaining alternative writers.
- On Nov 11, a screenshot showed a **NIUM internal task masquerading as a 2-hour Google Meet appointment** and containing a false 'await final-invoice payment' instruction. The live task entry `gpgtdkh0p7rmik88v479dfhghk` was subsequently shortened to 15 minutes, marked transparent/Free, and its title/description edited to remove the stale payment requirement. Across the four business calendars, 15-minute/Free normalization was checked. **19 older internal reminders still showed fake Google Meet links**; the Calendar connector's update action could not remove existing conference data. Investigate a safe Google Calendar API path (with source checks) to remove ONLY internal-task conference data, never a real meeting.
- Real client meetings must remain on the Confirmed Events calendar as actual events; historical completed client sessions remain auditable. Internal task reminders should NEVER create actual meetings or block time.
- Owner confirmed **NIUM and NEO client invoices paid in full**; separate client payment tasks were closed, corresponding reminders removed, and NIUM supplemental `INV-000847` Zip $1,353.39 recorded owner-confirmed paid. Do not treat unreconciled vendor fees, supplier credit, photo archiving, or remaining event deliverables as automatically completed by client payment.
- Some payment and delivery notes contain historical text that contradicts newer owner confirmations. Generate reminder title/description from the **latest authoritative Tasks state**; do not copy stale concatenated notes verbatim.
- BlackEdge Capital Nov 4 event was declined; its eight resolved Inbox messages were archived (not deleted). SafeLease November 4 follow-up was sent without reply; its specific follow-up-check task was closed, but the opportunity remains available for new inbound.
- A recent review reported zero completed-task reminders and zero recurrence in the scanned period; re-run scans yourself over a broad appropriate window before claiming stable completion.

## Mandatory business acceptance rules
### Email and SMS
- Business Gmail Inbox, Sent, Drafts, labels; inspect entire relevant thread, latest reply and prior commitments. Stable Gmail message/thread IDs; source-proven classification of inquiry vs vendor vs talent vs contract vs notification; no fabricated contact.
- No automatic sends. Owner approval actions: **APPROVE**, **MAKE CHANGES**, **DENY**, **EDIT MYSELF**. Permit exactly one human-approved send, verify Gmail message ID and threading, deduplicate by intent/revision; a clipboard copy is NOT sent. On denial/confirmed sent, advance exactly once to next actionable mail.
- Archive removes Inbox label only, preserves searchable history; archive only verified resolved threads/messages with no new question or obligation. Never mark an event done simply because its date passed or an email was answered.
- SMS: do not use encrypted data/metadata as if it were readable source content. Implement authorized GoHighLevel API ingestion with attribution, exact timestamps/IDs, idempotent cursors and webhook replay handling. If integration unavailable, show a visible coverage gap.

### Payments
- **Matt Carpenter or Mark Streeter explicitly confirming funds RECEIVED (email, readable text, or conversation) is definitive Paid In Full evidence**; no Bizly/ACH/bank notification needed.
- Client saying 'sent', payment initiated, remittance advice, or future arrival notice alone: mark *Awaiting owner receipt confirmation*; ask owner no more than once per invoice/day, repeat on subsequent days until confirmed; aggregate pending payment questions, never silently expire. Partial payments record paid amount and exact remaining balance. Preserve original invoice/reference and source time.
- On receipt confirmation, immediately reconcile Payments+Task+Calendar+archivable notifications; do not resurrect old payment tasks. Keep separate vendor and post-event payables open until separately verified.

### Calendar task reminders
- Exactly one active internal reminder per active task_id, across **all four** business calendars and all relevant dates. The Apps Script TaskSync process is the sole calendar task event writer. Task identity, not title/date, is the dedup key.
- Tasks are **15 minutes maximum, Free/transparent, no guests except own account if API inserts it, no conference/Google Meet, no recurrence**, with a clear non-client task marker and source link. No 2-hour fake meetings. Real client events are separate and may be Busy/with real invited guests.
- A completed Task loses its task reminder only after verified completion; preserve actual client appointments and historical records.
- Tasks without valid due dates remain in review backlog (not falsely dropped or assigned fabricated time).
- Before creating/updating/deleting any task event, reconcile existing IDs from all calendars and handle stale canonical_event_id notes. Avoid recreating deleted/replaced entries.

### Event outcomes and UX
- Past event dates alone DO NOT prove delivery/payment/completion. Keep completed-event history in Events/Payments/Post Event; close exact finished subtasks and archived correspondence; keep active vendor/payout/production tasks.
- Present ONE owner queue of decisions and consolidated daily digest: urgent leads; awaiting approval; payment-confirmation requests; impending events; overdue vendors; blocked source integrations. Avoid repetitive alerts/noisy all-day duplicate calendar stacks.
- Dashboard must show last successful sync per connector, coverage gaps, error counts and next action.

## Engineering phases (perform independently until real owner permission required)
0. **Baseline**: create `docs/baselines/` evidence report (counts by system; read-only), document running sources, branch commit and current deployed versions; do not overwrite live scripts. Identify API/credential gaps and missing TaskSync source.
1. **Tests first**: fake Gmail/Calendar/Sheets/GHL interfaces; deterministic replay fixtures for duplicate event, stale invoice description, multi-calendar task, real booking vs internal reminder, 15-minute Free/no Meet, inbound newer than archived thread, owner receipt confirmation, client sent only, partial payment, send approval; assert idempotency when same batch processed twice.
2. **Single reconciliation engine**: ingest normalized evidence with immutable source IDs and timestamps; idempotent task reducer; one append-only audit; provider-specific Gmail archive and Calendar adapter. Do not create unapproved messages or appointments.
3. **Source adapters**: authenticated Apps Script via `clasp` from live projects; Gmail API, Google Sheets API, Google Calendar API, then GHL SMS API only with real approved credentials. Separate development/staging vs production. Secret scans.
4. **One writer**: eliminate overlapping Calendar writers and duplicated schedules; ensure TaskSync owns task event mutation and other review jobs only write to the tracker. Legacy bad events remediation with before/after diff and rollback path.
5. **Dashboard and actioning**: owner-approval queue, consolidated receipts, exception resolution, and evidence links. Show exact actual provider outcomes rather than generic 'success'.
6. **Dry run and safe canary**: run `npm run test:staging-safety`, `npm run build`, all new contract tests; produce human-readable proposed changes. Only after explicit owner authorization permit production writes/sends. Actual client email/SMS sends must remain gated individually.
7. **Observability**: owner-facing last run, message coverage, unresolved exceptions, reminder dedup, archive counts, payment receipt checks. Tests for rerun after interrupted execution and partial provider failures.

## Cursor + Apps Script deployment boundary
- Use the Cursor workspace/terminal for code and tests. Use `clasp` (Google's CLI) **only after owner signs into the correct business Google account** and grants Script API access.
- Find each existing Script ID in Apps Script Project Settings. `clasp clone <script-id>` / `clasp pull` to distinct project directories, commit code but **never** OAuth tokens or secrets. Review `.claspignore`/gitignore.
- **A saved Head `TaskSync.gs` is used by its hourly trigger; it is not the same as deploying the separate existing backend web app.** A `clasp push` to the wrong script would be a destructive overwrite: backup and verify Script IDs before any push. Production `clasp push` or web app redeploy requires explicit owner approval.
- Cursor background agents, if used, may run terminal commands in a remote environment; use read-only staging credentials only, not live Gmail/Calendar write tokens.

## First Cursor task
Inspect the repo branch and produce an inventory of code, tests, provider permissions and observed feature gaps, referencing exact files. Open PR-like branch changes only; implement pure deterministic reconciliation tests before touching live integrations. Determine where live TaskSync v3 source must be imported. Produce a concise Phase 0/1 report with green/red acceptance criteria. Do NOT claim a production integration was tested if only mocks or read-only data were available.
