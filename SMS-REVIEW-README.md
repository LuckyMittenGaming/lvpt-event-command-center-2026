# SMS Intelligence Review — isolated local-only pilot

Preview page: `/sms-review/` on the deployment for branch `feature/lvpt-sms-intelligence-review`.

The publicly served **code** includes no customer data, SMS messages, names, account numbers, or private financial details.

## Privacy / handling

The owner explicitly selects the JSON file created by LVPT SMS Test Android v0.4.
The export is read with the browser File API into page memory. No file upload, no server API calls, no storage to localStorage/IndexedDB, no analytics. The page has a restrictive Content Security Policy (`connect-src 'none'`). It is a **temporary, single-user local pilot**; it is NOT a secure hosted archive, CRM, financial ledger, or mobile SMS ingestion backend.

After analysis, reviewers see a redacted 230-character excerpt, SMS source row ID, timestamp, direction, event hint, and a suggested verification step. Individual decisions (Approve for export / Needs verification / Dismiss) can be downloaded to a separate JSON file. This decision file deliberately excludes original SMS message bodies; it still includes review notes and event hints and should remain private.

Review decisions are NOT automatically posted to events or accounting and are cleared if the browser tab/session is reloaded or closed. Do not use browser Back to try to recover previous unsaved decisions. Do not consider historical text 'paid' a bank settlement. No RCS, MMS, or WhatsApp.

## First test

1. Navigate to this branch's preview at `/sms-review/`.
2. Choose `lvpt_sms_Streeter.json` (exported earlier and stored locally).
3. Leave the initial date at 2026-01-01. Check the source message count and candidate count.
4. Review only a few findings, mark two as **Needs verification** and **Dismissed**.
5. Download the `lvpt-sms-reviewed-decisions.json` file. Check that the file has the two decisions and no message bodies.
6. Nothing in the production dashboard is changed. After testing, close the browser tab to discard the in-memory archive.

## What it isn't yet

- Cannot safely synchronize across multiple devices/users: authentication, private tenant-scoped storage, consent, retention, encryption at rest, audit trails and deletion tooling are pending.
- No automated AI classification/API charges in this pilot: deterministic regex screening only. False positives/negatives are expected.
- Do NOT merge or deploy as an active customer-facing feature before a privacy review and replacing the browser-only approach with a proper authenticated backend.
- Do not add private SMS datasets to GitHub, pull requests, issues, build artifacts, or public deployment content.
