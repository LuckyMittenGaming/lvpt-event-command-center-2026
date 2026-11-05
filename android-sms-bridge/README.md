# LVPT SMS Bridge — Android diagnostic, v0.4.0

**Purpose:** Private prototype on the owner's Android phone. Keep the existing messaging app and number. This app requires user-granted SMS permission and explicit selection of business contacts. It does not upload SMS or send any messages.

## New in v0.4

- **+ Add monitored contact:** Up to 10 people in the prototype. Each person occupies one slot regardless of their number of approved phone numbers.
- **+ Number:** Associate up to 10 US phone numbers with one person. For example, add both Mark's old and new numbers to a single Mark record.
- **Select:** One chosen person is the target for historical browsing and file export.
- **Monitor:** New incoming and outgoing standard SMS from *all* explicitly added people are counted on the phone.
- **Browse all saved SMS history:** Read the selected person's historical SMS from all of that person's numbers, 20 messages per page.
- **Export selected contact's SMS to JSON:** After explicit confirmation, Android's document picker lets the owner write the full SMS history to a local file. This is **plain JSON (not password protected)**. Dates, sender/receiver direction, matched number, Android SMS row ID, and complete message text are included. The program reads message text only after confirming a match to an approved phone number. It processes the full available history without requiring hundreds of page clicks.

## Installation and test

1. Download the `lvpt-sms-bridge-debug-apk` artifact from the successful branch-specific GitHub Actions workflow. Debug signing is not stable between independent builds, so **uninstall older LVPT SMS Test versions before installing**.
2. Give SMS reading permission when Android requests it. We do not become the default SMS app.
3. Enter a person's name and one number; tap **+ Add monitored contact**. Use **+ Number** on that person's row to add their previous/secondary numbers. Repeat for additional people only when authorized.
4. Tap **Start monitoring** to count future standard SMS across the allowlist.
5. Select Mark and tap **Browse** to confirm old messages from both numbers can be displayed.
6. Tap **Export selected contact's SMS to JSON**. Read and accept the plaintext privacy warning. Save the file in a private device folder.
7. The app displays a local message count when export finishes; do not share the full message file or its contents casually.

## Privacy and security

- Nothing is automatically uploaded to the LVPT Event Command Center, GitHub, Sheets, or any backend.
- The app has no INTERNET permission and never sends SMS.
- App-specific contact settings are stored locally with app backup disabled.
- Files created through Android's document picker are **not encrypted**; anyone obtaining them can read them. If saved into a cloud-synced folder, the cloud provider might automatically upload them.
- Only people and aliases the phone owner explicitly authorizes are monitored. Other conversations' message *bodies* are not accessed by the history viewer/exporter.
- Removing a person stops matching their numbers, but does not delete the original messages from the default messaging app or any exported JSON files.
- RCS, MMS, WhatsApp, group-message extraction, contact sync, and deleted messages are **not** included.
- This is a diagnostic build, not production-grade permission/security handling or a public Play Store app.

## Product/tier design — not activated

The prototype caps the local screen at 10 monitored **people**, each with multiple known phone aliases. In a subscription product, server-verified entitlements must enforce both maximum people and usage quotas. Suggested starting tiers to price-test: Starter 2 people, Team 5, Business 10. **These numbers are hypothetical product packaging, not actual subscriptions.** Account/entitlement controls, team login, billing, secure synchronization, customer data retention, and consent auditing still need to be built.

**Cost model:** Reading SMS on-device has no per-message SMS-gateway charge. Actual operating cost in a hosted product comes from encrypted storage, cloud bandwidth, security/authentication, and especially AI analysis tokens. Limit AI processing by messages/tokens per month instead of assuming that the number of contacts predicts cost. Track per-account import volume and AI usage before publishing subscription prices.

## Next product milestones

1. Validate the v0.4 history/export totals against the Android phone.
2. Add secure customer accounts and a protected staging import (plaintext JSON only with deliberate upload and transport security).
3. Add review/approval for derived event tasks, expenses, payments, and client follow-ups. Text mentions are *not* evidence of settled payment.
4. Investigate official, permitted RCS integrations separately; the Android SMS provider is not a complete RCS access method.
5. Before customer distribution, obtain signing keys, Play Store policy review (SMS permissions are restricted), privacy/legal review, retention/data deletion mechanisms, and third-party participant consent requirements.

## References
- https://developer.android.com/reference/android/provider/Telephony.Sms
- https://developer.android.com/reference/android/app/job/JobScheduler
