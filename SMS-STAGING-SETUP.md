# LVPT SMS Staging — secure owner-only sync pilot (not production)

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
