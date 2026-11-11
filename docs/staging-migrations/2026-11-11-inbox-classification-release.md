# LVPT staging inbox classification release — 2026-11-11

## Purpose
Separate legitimate customer replies, third-party website-form leads, professional
talent coordination, vendor logistics, contract-signature notices and no-reply
acknowledgements. Preserve each event's operational status independently of
whether its latest email needs a reply.

## Shipping status
- Vercel staging source: implemented on `feature/lvpt-sms-intelligence-review`.
  Deployment is automatically built/tested; verify current deployment is READY.
- Apps Script source: updated complete Code.gs file in
  `apps-script/release/LVPT_Event_Command_Center_v1_2_COMPLETE_Code.gs`.
  **Deployment status:** the owner deployed the updated existing Apps Script
  web app on Nov 10, 2026 ET. The ensuing Nov 10 11:43 PM ET read-only
  diagnostic showed inbox=passed, preview=passed, request=possible_request,
  recipient=verified, send_switch_enabled=false. The actual private deployment
  source cannot be inspected through this repository; avoid claiming its
  revision is independently attested beyond the owner confirmation and
  diagnostic evidence.

## Fixes
1. Wrapped multi-line forwarded Gmail `On Wed ... wrote:` lines and
   abbreviated-initial signatures no longer turn a courtesy reply into a new
   customer request. Only strict courtesy language before a visible quote
   boundary can override a *quoted-history-only* truncation. A genuine request,
   missing quote boundary or real attachment remains in manual review.
2. The signed source of Kenna James's known LVPT talent correspondence is
   classified as `talent` after GAS redeploy and `talent_operations` in the
   dashboard. It is excluded from the sales queue. Vercel also blocks replies
   to his verified mailbox before a Gmail send intent can be reserved.
3. `New Contact Form Submission from ...` sent by the *exact* trusted
   `team@b.bizlyapp.com` form service is exempt from GAS's generic
   List-Unsubscribe/Auto-Submitted suppression. Such mail is a **real lead**,
   but not an email directly from the customer. Vercel routes it as
   `form_notification` for human CRM intake and blocks all drafting/direct
   sends to the Bizly platform sender.
4. Previously fixed negative controls remain in place: denied revisions stay
   excluded; exact Gmail timestamps are normalized; DocuSign notices are
   operational; verified sender/subject and one-time send reservations are
   required; live sending is not enabled by these changes.
5. The GAS inbox metadata cache key is bumped to v4 to invalidate the old
   scan once the new web-app version is deployed.

## One necessary owner action, when ready
1. Open the existing **LVPT Event Command Center Backend** Google Apps Script
   project and the complete Code.gs file at the release path above.
2. Replace the entire Code.gs with the complete current source, then save.
   Do **not** alter existing Script Properties, secrets, Gmail scopes or
   sending opt-in values.
3. Update the **existing** Web App deployment using **Deploy > Manage
   deployments > Edit > New version > Deploy**. Preserve the same deployment
   URL and executing business mailbox. Do not create a new Web App URL.
4. After the updated code is active, refresh the Vercel staging dashboard and
   use the **read-only** inbox scan. An authorized owner session is required.
   A Bizly lead-form submission should now appear as a CRM intake lead and
   known talent correspondence should be categorized as operations.
   Sending should remain disabled.

## Automated verification
`npm run test:staging-safety` runs local deterministic regressions before
every Vercel build, including:
- Complete/partial quoted message and owner-signature parsing
- Real questions after a courtesy or before quoted history
- Strict refusal to classify truncated authored content as answered
- Bizly form notification with List-Unsubscribe and Auto-Submitted headers
- Exact-form-sender check; spoof/lookalike domain rejection
- Known talent relationship and operational intake classification
- Third-party platform/known talent send rejection before reservations
- DocuSign exclusion, one-email queue wrap, denied-revision exclusion
- 15 simulated send safety scenarios and negative-control checks

No regression test sends Gmail, changes CRM records or opens documents.
The application cannot test privileged, browser-session-specific behavior
without an owner session; all such claims should remain explicitly unverified
until observed. The connected Vercel environment-variable listing endpoint
may be access-restricted; do not claim an unobserved live opt-in value.


## November 11 final owner-approval / calendar repair

- Dashboard approval queue: after the explicit owner **Copy approved text and continue**
  action successfully verifies the live revision and copies an approved locked
  message, the dashboard releases the one-email lock and advances. Mere
  approval without copying remains on the current draft; clipboard failure
  remains fail-closed. A positive Gmail send acknowledgement also advances,
  but uncertain/failed sends never do. Browser-session-only completed markers
  distinguish `copied_not_sent` from `sent`; neither is a claim of actual
  delivery without a Gmail provider receipt.
- All updated simulated workflow tests passed during the Vercel preview build,
  including copied-versus-sent state, read-only queue wrap, denial persistence,
  failed-copy no-advance, human attestation, send deduplication and 15
  synthetic security scenarios.
- Google Calendar repair: the FOUR business-owned LVPT calendars contained 28
  legacy weekday-recurring `OVERDUE —` internal owner-reminder masters, causing
  84 occurrences over Nov 11–13. Each was checked for exact
  `RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR`, internal description,
  confirmed owner-only status, and corresponding Open Tasks row before
  deletion. **28 legacy masters deleted, no client meetings or attendees touched.**
- Calendar continuity: 24 tasks already had separate confirmed one-time owner
  reminders on one of the business calendars. Four Open tasks had no confirmed
  single reminder, so four one-time 9 AM ET reminders were created before
  removing the masters. Their verified event IDs:
  - Defending Education: `3bmfe1neop6pmtn34o930qfo8g` (Proposals)
  - WFM Restoration: `v9va6is139kf94etji0g11q738` (Proposals)
  - NEO Reunion / Kenna settlement: `bp5d74sjt3pv7govu6uirt1vp4` (Operations)
  - Lithic Venetian inclusions: `8vtaa67vov9c204ri5nejbm6ek` (Sales)
- Exactly four corresponding `Tasks!I` notes updated without changing the
  Task ID, owner, due_date, status, formulas or validation:
  `I34`, `I39`, `I90`, `I104`. Canonical calendar/event IDs read back
  successfully. All four underlying tasks remain Open.
- Independent four-calendar scan across Nov 11–16 after cleanup: **zero active
  recurring event instances**, four new one-time reminders found, no client
  invitations modified.
- The existing Morning and Evening Client Review automations were both updated
  with strict recurrence-guard instructions: search future business dates,
  verify true `recurring_event_id`, never create recurring task reminders,
  reconcile only exact legacy `OVERDUE` masters when a one-time task
  replacement is verified, and report any reappearance. The automation update
  does not prove an independent Apps Script trigger is permanently disabled.
- Gmail/Supabase send intents remained zero during the non-sending audit.

## Acceptance gates still requiring capabilities or explicit user consent

- Device-side mobile push notification appearance, navigation, and interaction
  cannot be observed from connected server-side tools; no mobile acceptance
  is claimed.
- Direct GoHighLevel conversation and SMS deduplication cannot be fully checked
  without GHL connector access. Gmail, Command Center spreadsheet and
  business calendar evidence were checked independently.
- One real test Gmail send to a controlled address is deliberately NOT
  performed without explicit owner authorization and the two opt-in gates.
  Staging remains in non-sending mode.
- Continued absence of recurrence is verified only as of the current
  calendar query. The new automation guards are designed to detect recurrence
  if another legacy producer recreates a master; they do not substitute for
  proof that all external triggers are disabled.
