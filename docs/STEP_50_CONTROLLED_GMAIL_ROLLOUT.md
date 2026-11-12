# LVPT Command Center — Controlled Gmail Reply Rollout

**Status:** Staging safety tests only; live Gmail sending is **not enabled**.

## Source of truth

- Authoritative email account: `book@pokertraininglasvegas.com` only.
- Approve one prospective reply at a time; never infer permission from a diagnostic classification.
- Verify the full original Gmail conversation, including Sent mail, draft state, CRM and event notes.
- The four-times-daily ChatGPT Gmail approval automation is an **independent workflow**. Before any send, confirm that it hasn't created a newer reply or pending Gmail draft. Never silently merge queues or send one reply from both systems.

## Tested controls

- Vercel staging access check, same-origin mutation guard, approval audit.
- Staging-only POST guard: cannot send from a production deployment.
- Explicit `SEND THIS EMAIL` owner confirmation and a second checkbox.
- Fresh recipient verification against the current LVPT Gmail thread.
- **Cross-thread Sent guard:** check up to 25 recent matching Sent messages to the same verified client address; a newer message blocks the send, including when sent under another subject/thread. An incomplete/paginated check fails closed.
- Unmodified approved subject/body SHA-256 digest, and full-thread owner review attestation.
- Permanent per-incoming-revision database send reservation, including uncertain outcomes.
- Exactly one Gmail send API attempt; no retry after ambiguous responses.
- A confirmed Gmail send without confirmed ledger reconciliation is reported as **unconfirmed audit** and cannot be retried.
- Current staging Vercel build includes isolated Node/TypeScript mocked Gmail and Supabase tests with **no external email calls**.

## Before first permitted real send

1. Owner deploys the **complete** reviewed `apps-script/release/LVPT_Event_Command_Center_v1_2_COMPLETE_Code.gs` file as a new Apps Script web-app version, without changing existing other script files.
2. Keep both independent `LVPT_ENABLE_OWNER_APPROVED_GMAIL_SEND` switches **OFF** during read-only tests.
3. Verify the staging diagnostic reports business-account identity, inbox access and read-only recipient behavior. A blocked result on an answered or vendor thread is correct.
4. Run owner-selected, isolated test with a genuinely new **external** inbound inquiry. Neither owner's personal mailbox nor LVPT-to-LVPT form notifications count as external leads.
5. Verify reply text, original recipient, latest Sent items, CRM status, approved SHA digest, one owner decision and no existing unsent Gmail draft in the independent approval automation.
6. Only after the owner expressly authorizes a **controlled sending pilot**, enable both staging-specific opt-in switches. Do not enable production sending. A single, explicitly authorized test reply is the only permitted first action.
7. Confirm provider-side Sent message ID and database status `sent`. An `uncertain` or `reserved` record means **STOP, INSPECT SENT, NO RETRY**.
8. Recheck the Gmail history and owner audit before approving any wider rollout. Production remains blocked until a separate, explicit release decision and redesign of its guard.

## Release boundaries

- Never merge Draft PR #6 or promote to production as an implicit part of testing.
- No automatic email sending, no auto-follow-up, no CRM writes from diagnostic scans.
- Diagnostics store fixed result codes and bounded counts only, not email content, recipients or Gmail thread IDs.
- Prefer manually copying an approved response over activating sending when the recipient verification or previous Sent history remains ambiguous.

## Safety rollback

Keep `LVPT_ENABLE_OWNER_APPROVED_GMAIL_SEND` absent/false at both Vercel and Apps Script. This disables the sending path, while read-only scans and manual-copy approvals remain available. Treat a failed database write after a Gmail API call as a possible sent email; **do not try again**.
