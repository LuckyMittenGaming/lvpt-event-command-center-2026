# LVPT SMS Bridge — prototype decision (2026-11-04)

## Purpose
Private, LVPT-only Android companion feeding **authorized future conversations** to the existing Vercel Event Command Center. No paid SMS gateway and no requirement to send messages using GoHighLevel. **Do not alter production event records during the test.**

## Open-source evaluation
- **capcom6/android-sms-gateway** — **Apache-2.0**; maintained in November 2026; Kotlin application with incoming SMS/MMS receivers, optional `READ_SMS`, webhook delivery, local and private server modes, persistent queue, and an *inbox-only* `SmsContentObserver`. Best architectural reference / permissible code base with license attribution; its existing receiver does **not** establish automatic capture of outbound texts typed in Google Messages.
- **pppscn/SmsForwarder** — BSD-2-Clause metadata but README says commercial use prohibited, so **do not incorporate source** without resolving inconsistent terms; Android notifications/webhooks useful as a high-level idea, not proof of reliable outgoing SMS/RCS coverage.
- **juancresc/SMSHub** — Kotlin incoming SMS webhook + gateway-initiated outgoing SMS; last code push 2021; no declared license. **Do not copy code** without obtaining license permission. Does not solve capture of messages manually sent from existing app.
- **Android framework `Telephony.Sms.Sent.CONTENT_URI`** — candidate for a permission-gated sent-SMS observer. Need real-device validation that Google Messages inserts manually sent **SMS** into the accessible provider on this device/version. **Never infer this works for RCS.**

## LVPT MVP scope
1. **Android side**: explicit opt-in, chosen phone-number allowlist, permission explanations, local filtering **before transfer**, bounded encrypted queue and retry, signed/authenticated HTTPS upload, disable/revoke/erase controls. Start with one approved business contact. No OTP or other unrelated personal conversations uploaded.
2. **Incoming**: listen for `SMS_RECEIVED` and/or authorized inbox-provider changes; deduplicate; retain message ID, direction, timestamp, sender/recipient and text only for opted-in contacts.
3. **Outgoing**: test `ContentObserver` / polling `Telephony.Sms.Sent.CONTENT_URI` with `READ_SMS` and high-water mark; verify messages manually sent with existing SMS app, including device restarts and batching; clearly surface any permission/provider limitation. Do not force replacement of default app for the first experiment.
4. **RCS & WhatsApp**: separate scope; **not automatically accessible via Android SMS providers**. No promise of full coverage or silent interception. Optional notification-based capture requires separate explicit consent, may be incomplete and must not be presented as reliable two-sided chat synchronization.
5. **Server side**: staging-only authenticated endpoint; replay protection/idempotent message keys; secure server-side storage with access controls and retention limits; keep SMS content out of public URLs, logs, unencrypted browser storage and existing event Google Sheets by default.
6. **Processing**: initially show unmodified incoming/outgoing conversation timeline + candidate event association; classify obligations, expenses and owner payouts as **suggestions** with source provenance and human approval. Never treat a text as proof money has cleared; never auto-send, withdraw funds or change books.
7. **Validation**: test SMS incoming & outgoing from one opted-in contact, opt-out, non-allowlisted number ignored, duplicate retry, offline recovery, delivery ordering, permission denial, and redaction. Compare device message to received payload before permitting any accounting change.

## Compatibility and product restrictions
- A privately installed LVPT prototype is different from a Google Play-distributed app. **Google Play restricts `READ_SMS`, `RECEIVE_SMS`, and other SMS permissions to approved default handlers or exceptions.** Passing a private test does not prove future commercial eligibility.
- RCS in Google Messages is a separate encrypted channel; it is not equivalent to SMS/MMS database access.
- If Android blocks outgoing access without changing the default SMS app, report it as a real constraint rather than asking the user to hand-forward every message.
- Review source attribution, dependency/security audit and fork maintenance before bringing Apache code into LVPT.

## Next implementation step
Build an isolated `feature/lvpt-sms-bridge-prototype` trial: one device uploads a test incoming SMS to staging; independently prove a manually sent SMS is visible in `Telephony.Sms.Sent`; then combine into an ordered, deduplicated timeline. Do **not** deploy to production until both paths are verified and data handling approved.
