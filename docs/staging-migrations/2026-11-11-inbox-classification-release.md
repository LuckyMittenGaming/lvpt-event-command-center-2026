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
  **Important: editing the GitHub copy does not deploy the existing GAS web app.**
  The GAS portion remains pending until the owner updates the existing
  Apps Script deployment.

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
