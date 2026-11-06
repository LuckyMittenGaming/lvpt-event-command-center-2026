# LVPT SMS Staging — secure owner-only sync pilot (not production)


## November 5 v0.8 — full-thread Gmail triage and full Payments tab (prepared)

**Gmail:** the connected business mailbox revealed that the current \`Gmail Activity\` sheet covers only a fraction of real conversations. A read-only, standalone, synthetic-tested \`public/sms-review/gmail-thread-triage.js\` classifier now handles complete-thread messages with the actual Gmail connector \`from_\` metadata. It distinguishes explicit client declines (closed for the specific proposal), proposal sent without reply, agreement signed plus invoice sent (fulfillment check), outgoing reply sent, incoming-last message, and insufficient/truncated evidence. It excludes quoted older messages before evaluating acceptance/decline language and requires timestamps/complete thread data. **The classifier does not yet query Gmail autonomously in the deployed dashboard.** The assistant can use the connected business Gmail plugin for independent read-only audits. Do not copy raw Gmail bodies to GitHub or a public endpoint; no auto-sending or automatic lead closure.

**Important client examples from live Gmail review (not committed as sensitive fixtures):** BlackEdge and Odysseys declined their prior events and were acknowledged, Lorna received an introduction Nov 4, Quinn Emanuel and Kirkland received proposals, CertaPro contract and invoice were sent. An email in a SENT label does not prove client interest, payment, or a closed sales outcome.

**Payments:** \`listEvents\` currently takes \`(paymentByEvent[eventId] || [])[0]\` and therefore may hide a **second invoice on a paid main event**. This is particularly relevant for NIUM's separately recorded $1,353.39 add-on decks invoice, which was marked \`Payment Initiated\` on Nov 4, and OWS's $21,183.50 invoice, also \`Payment Initiated\`, plus CertaPro's $11,281.50 \`Invoice Sent\` entry. Initiated is **not** received; the payment stage must be verified independently before posting Paid In Full.

The feature branch prepares a **read-only additive change** to the already-deployed Apps Script \`listReconciliationEvidence\`: \`paymentRecords\` enumerates every Payments row separately, reporting only event ID, payment ID, invoice number, totals, amounts, statuses and dates. A new staging dashboard section \`Invoice-by-invoice payment exceptions\` will show it when connected. **It is deliberately unavailable until the owner explicitly deploys this updated Apps Script function.** Do not infer payment records from a single event summary or the existing payout ledger. The optional endpoint returns \`paymentSourceStatus: not_connected\` until this happens.

The updated response excludes payment notes, PO numbers, contact data, private email bodies and raw SMS. All UI remains read-only. Synthetic tests verify that a Paid In Full main event invoice does not settle a separate add-on payment, and that Payment Initiated stays unverified.


## v0.8 — Direct business Gmail evidence (approval-gated, read-only)

**State:** The GitHub development branch and protected Vercel preview are built and tested. Gmail's new action is NOT DEPLOYED in the currently live Apps Script. Until the owner enables it, the dashboard must show Gmail metadata as unavailable. No inbox writes occur.

### When owner explicitly approves the backend update
1. In the existing **LVPT Event Command Center Backend** Apps Script editor, add a new script file named **GmailEvidence.gs**. Copy the complete contents of [the standalone source file](apps-script/GmailEvidence.gs). Leave Code.gs untouched except for step 2.
2. Inside Code.gs doPost(e), immediately after listReconciliationEvidence, add one line: `if (action === 'listGmailThreadEvidence') return lvptJson_(lvptReadOnlyGmailEvidence_(String(payload.eventKey || '')));`
3. Save. The source manifest includes gmail.readonly and script.external_request; confirm active Apps Script scopes if prompted.
4. Update the EXISTING Apps Script deployment using Manage deployments > Edit > New version, preserving execute-as Me, Anyone access, same URL and shared-secret guard. Review any consent screens.
5. Reload the protected staging dashboard with the existing 7-day browser login.

### Data minimization and safety
- Fixed corporate domains only: lithic.com, quinnemanuel.com, kirkland.com, ows.com.co, imperativex.com. No arbitrary mailbox queries supplied by a browser.
- Google Gmail REST API under existing gmail.readonly scope; format=metadata. Maximum 60 matching messages and 8 distinct threads per client, cached within Apps Script for up to 10 minutes.
- Returned only: sanitized subject, opaque thread ID, last message timestamp/direction, bounded message count, and coverage flags. No email bodies, snippets, attachments, or correspondent addresses returned or persisted in Supabase/GitHub.
- Direction indicates suggested review, not an automatic unanswered-email determination. No reply or booking status is ever inferred from one thread without owner review.
- Search truncation or provider failures show limited/incomplete coverage; missing matches are not proof of no response.
- The existing Apps Script secret check guards the action. The Vercel staging endpoint additionally requires the owner's Device Token or seven-day HttpOnly review session.
- No Gmail messages sent, drafts created, inbox labels changed, CRM tasks created, or money moved.
- Regressions: sms-gmail-intelligence.test.cjs, sms-gmail-scope-static.test.cjs, and JavaScript, Apps Script, TypeScript and existing SMS tests.



## November 5 v0.7 — actionable owner brief, audit and reconciliation boundaries

- **Top five owner reviews** appear above the full SMS queue and link to supporting messages. Advisory only; never create tasks, contact clients, or alter ledger entries.
- **Payout exceptions** distinguish the authoritative Command Center's Paid, Planned and Other statuses, calculate exact-cent Planned totals only when every amount is present, and display a count of recorded Paid entries without dates. A Planned distribution is not necessarily currently payable; a Paid ledger status is not independent bank evidence.
- **False-positive safeguards:** a payout link requires the same unique event ID plus the exact amount, payee surname and payout context in **one** redacted SMS; amounts/names across separate messages cannot combine into a false match. A 2025 Mosaic/NEO reference cannot be linked to the 2026 event payment record. Website valuations and preliminary sales pricing are not treated as client receivables; explicit developer/vendor payments are vendor-cost topics.
- **Sales priority:** specifically named potential leads and follow-ups are ranked for CRM/Gmail verification even when no authoritative event ID is linked. Do not automatically send follow-ups or infer a live opportunity from historical SMS.
- **Source coverage:** Command Center Gmail Activity is **not** a full business-mailbox search. Connector-based spot checks found substantially more message threads than the six Gmail Activity rows in the spreadsheet; a missing entry does not establish an unanswered inquiry. Bank records, vendor invoice ledger and RCS/MMS remain unconnected.
- **Atomic reviewer audit:** on Nov 5 the **isolated staging Supabase** project received an append-only \`lvpt_sms_review_audit\` table and \`lvpt_save_sms_decisions_with_audit\` service-role-only RPC. Future review saves update latest encrypted notes and append a keyed note-fingerprint audit entry **in a single database transaction**. Notes and raw SMS are not recorded in the audit table. No anonymous/authenticated DB read or RPC permissions. The historical NIUM review predates the audit and is preserved but **not falsely backfilled**.
- **Health gate:** the authenticated dashboard checks the RPC using a zero-record batch, returning 0 without writing any data. **Save reviewed cases stays disabled** when the audit health check is unavailable; each successful save must explicitly acknowledge that auditing occurred. Testing with a synthetic one-record transaction verified both writes, then a rollback verified no test records persisted.
- **QA:** GitHub Actions runs JavaScript/TypeScript, finance/lead classification, cross-year mapping, payout evidence, cookie, and audit security regression checks. Vercel staging previews build from the feature branch; user login remains an HttpOnly seven-day browser session.
- **Production:** GitHub draft PR #6 stays unmerged. Only the user-approved read-only payout action was manually deployed to the existing Google Apps Script backend; no automatic email, invoice, task or accounting writes were enabled.


## Evidence matching v0.5 — task, email and payout signals

The staging reviewer now compares candidate SMS bundles with the existing Apps Script `listEvents` output **read-only**. The API supplies bounded, sanitized task titles/statuses and Gmail Activity subjects (not mailbox contents), and the browser identifies **possible** overlaps only when at least two distinctive non-generic words agree. The UI never treats a similar email subject as proof that someone replied or a task as completed.

A new **optional** Apps Script action `listReconciliationEvidence` is prepared in this GitHub development branch. It reads the authoritative `Event Payouts` tab and returns only event ID, payout ID, payee, type, amount, ledger status, and date. **Important:** the GitHub version of Apps Script is NOT automatically deployed to the active Apps Script project. Until the user explicitly approves and deploys the matching backend script, the review API reports `payoutSourceStatus: not_connected`. The UI must never invent payout totals or mark distributions settled when this endpoint is unavailable.

When connected, a payout candidate requires the **same verified event ID, matching amount to the cent, and an identifiable payee surname/name** in SMS excerpts. It remains a provisional match. A `Planned` payout must stay **Planned**, never be reported as Paid, and a `Paid` ledger status is not independent proof of a bank transfer. Event-wide counts are grouped by recorded status, including Paid, Planned and Other.

Developer QA includes synthetic unit tests for generic-word false positives, event isolation, payee-plus-amount matching, payout-ledger availability, and the Planned-vs-Paid boundary. No user SMS or real payout data is committed to GitHub. No live Sheets, Gmail or accounting mutations are triggered by this code.


## SMS Review v0.3 — persistent browser session (staging only)

**Preferred stable preview host:** `https://lvpt-event-command-git-9d0b2b-matt-carpenters-projects-7f34c5ab.vercel.app/sms-review/index.html`.

Use this *same host* after every branch deployment; changing to a deployment-specific host creates a separate browser cookie scope. Leave Vercel Authentication enabled and sign in to Vercel if prompted.

1. First visit: enter the existing Device Token **once**. The token is exchanged server-side for a signed, seven-day `Secure; HttpOnly; SameSite=Strict; Path=/` browser cookie.
2. Subsequent visits from the same browser and stable preview host: the page automatically checks this cookie, loads staged SMS findings, restores encrypted case decisions and performs a read-only Command Center comparison. There is no Device Token field when the review session is already active.
3. **Sign out of review session** clears the browser cookie. **Clear results only** does not log the owner out. Cookie is host-bound, expires automatically and becomes invalid if the Device Token hash or server encryption key changes.
4. The Vercel Automation Bypass Token is intentionally **not saved by the browser**. Vercel SSO handles owner browsing; Android already stores the bypass secret encrypted with AndroidKeyStore so it can continue sending SMS. An app-generated session cookie cannot bypass Vercel's deployment-protection edge for a browser that isn't signed in.
5. No device token, bypass token, service key or encryption key is committed to GitHub or stored in browser localStorage, sessionStorage or JavaScript state. A one-time unlock briefly places the Device Token in a password field/request body; it is cleared immediately after the login attempt. Cookie includes only a timestamp and an HMAC.
6. The review cookie authorizes `review`, `reconcile` and `decisions` endpoints **only**, not Android `ingest`. Mutating review decisions requires same-origin HTTPS, and all data remains in isolated staging.

**Automated developer checks:** GitHub Actions runs session-signature, token rotation, expiration and tampering unit tests, SMS grouping/reconciliation tests, JavaScript syntax checks and TypeScript checks. Vercel CI builds deploy staging previews. The assistant can independently inspect these and query permitted Supabase metadata without access to browser credentials. Real authenticated user/browser session testing still requires the owner to unlock once.


## Status

**Code implemented, backend secrets not provisioned, uploads disabled by default.**
The staging ingest and review endpoints live ONLY on the isolated `feature/lvpt-sms-intelligence-review` preview branch. Android v0.5 sync lives on `feature/lvpt-sms-bridge-prototype`. Neither branch should be merged to `main` until authenticated end-to-end tests are complete.

Do **not** store plaintext SMS exports, test keys, bank details or contact phone numbers in GitHub.

## Isolated datastore

- Create a **separate**, dedicated Supabase project named `lvpt-sms-staging` after owner selects the organization and explicitly approves any quoted cost.
- Apply `sql/sms-staging.sql` only to that project, not to the unrelated NIUM Pick Me Up database.
- Never expose the service role key in the Android app, browser, repositories, build logs, or customer support.
- Data rows are AES-256-GCM ciphertext (authentication tags included), nonces, HMAC-ed contact numbers, timestamps, direction and an Android device-scoped row ID. Supabase role restrictions deny direct access from browser/mobile clients.
- The server encrypts each SMS body before database insertion, with per-message random nonce and authenticated additional data binding tenant, device and SMS ID.
- Set a retention/deletion policy before any customer or cross-tenant use. A one-device owner test can manually purge its staging database after verification.

## Preview-only environment configuration

On the **LVPT Event Command Center** Vercel project, configure the following variables for **Preview** restricted to `feature/lvpt-sms-intelligence-review`. Never deploy the testing credentials to production:

```text
LVPT_SMS_STAGING_SUPABASE_URL=https://<staging-project-ref>.supabase.co
LVPT_SMS_STAGING_SUPABASE_SERVICE_KEY=<private service-role secret>
LVPT_SMS_STAGING_DATA_KEY_BASE64=<32 random bytes, base64 encoded>
LVPT_SMS_STAGING_TOKEN_SHA256=<sha256 hex digest of a unique 32+ character device token>
LVPT_SMS_STAGING_ALLOWED_NUMBERS=<comma-separated approved US phone numbers, 10 digits each>
```

Generate the 32-byte encryption key and a 48-byte random sync token from a trusted local terminal:

```bash
node -e "const c=require('node:crypto'); const t=c.randomBytes(48).toString('base64url'); console.log('DEVICE TOKEN (enter in Android and browser, never commit):',t); console.log('SHA256 (store in Vercel):',c.createHash('sha256').update(t).digest('hex')); console.log('ENCRYPTION KEY (Vercel only):',c.randomBytes(32).toString('base64'));"
```

Store the encryption key in a secure password manager and restrict it to the staging deployment. Losing it makes the stored ciphertext unreadable. Do not rotate without a re-encryption or staging reset plan.

**Vercel Deployment Protection:** Preview deployments on this project can require Vercel SSO. Use Vercel's **Protection Bypass for Automation** credential if the Android app cannot access the preview endpoint. Enter this bypass token into the optional encrypted Android credential field and do not put it in the URL or GitHub. Do not disable deployment protection simply to make the app work.

**Connector permissions:** If the Vercel integration does not permit editing project environment variables, the project owner must configure them directly in the Vercel dashboard, or use an authorized CLI session. Never ask anyone to paste a service-role key into chat.

## Android v0.5 steps (after staging is ready)

1. Download the successful APK artifact from the feature branch GitHub Actions build. Each private CI debug APK is signed with a fresh debug key; uninstall an older test build before installing. Exported SMS remains in Google Messages after uninstall, but the app's approved-contact list must be re-entered.
2. Re-add only authorized business contacts and all their aliases, then tap **Start monitoring**. Android READ_SMS permission is required.
3. Enter the **preview HTTPS host**, the unique **device sync token** (not its SHA256), and optional Vercel preview bypass token.
4. Check the explicit authorization checkbox and tap **Enable staging auto-sync**.
5. Android sends up to 50 approved SMS per HTTPS request and up to three batches per immediate background job; repeated runs progress through history. The cursor advances only when the server acknowledges each batch. Re-sending the same Android SMS ID is idempotent.
6. Background job timing is best effort; Android may delay it for battery/network constraints. Tap **Sync now** to test the connection and progress.
7. Open the staging review page `/sms-review/index.html` in the **same preview deployment**. Enter the device token and optional bypass token once to retrieve **redacted findings**, not raw SMS. Decisions are still manually approved and exported as a separate review file.

## Safety and product limitations

- No auto-reply, no payments or accounting mutations, no production Command Center changes.
- No Google Messages RCS, MMS, WhatsApp, group media or deleted SMS.
- Android READ_SMS is highly restricted for Google Play distribution; production distribution requires regulatory, Play policy, consent, encryption, multi-tenant design and access review.
- Only one pilot tenant is configured (`lvpt-owner-pilot`); this is NOT a SaaS account system.
- The 10-person allowance currently exists in the app UI only; **future pricing-tier quotas must be verified and enforced server-side**, with usage limits for AI and message processing.
- No AI services are used by ingestion or deterministic staging classification: no per-message AI API charge. Hosting/storage usage can still incur charges depending on plan and quotas.
- For future users, separate recipient permission/consent, ownership and retention policies must be designed before broad rollout.
