# LVPT SMS Bridge — Android diagnostic alpha

**Scope:** privately installed, business-only diagnostic for a single phone contact. Version 0.2 **can display the five most recent SMS message bodies from the approved contact only, after the user explicitly taps Preview**. This text is not cached, transmitted, logged, forwarded, or synced to the Command Center. It verifies whether Android's standard SMS content provider exposes both new incoming SMS and **SMS manually sent through the existing texting app**.

## Build
Open `android-sms-bridge/` in Android Studio (JDK 17 / Android SDK 35) and build the `app` debug variant. Alternatively, download the `lvpt-sms-bridge-debug-apk` artifact from the branch-specific GitHub Actions workflow if it completed successfully. Do not install an unsigned or unverified APK from unrelated sites.

## Phone test
1. Install the **LVPT SMS Test** debug APK on your own Android phone. This is intentionally *not* a default SMS app.
2. Enter **one approved business contact's US phone number**. Tap **Allow SMS reading**; Android permissions may be restricted on certain devices, OEMs, Android releases, or distribution methods.
3. Tap **Start monitoring new SMS**. The app takes an SMS database high-water snapshot; older messages are ignored.
4. Have the selected contact send a **regular SMS** (not RCS/WhatsApp). Tap **Check for new messages**, verify incoming counter increases.
5. Send a **regular SMS** using your *normal* Messages app. Tap **Check**; verify outgoing counter increases.
6. Try with phone screen locked and after restart. The app receives `SMS_RECEIVED` and schedules OS-managed scanning, plus a best-effort periodic job (approximately 15 minutes or later due to power restrictions).
7. In v0.2, tap **Preview last 5 SMS messages (local only)** to verify that Android provides the **actual text** of SMS messages from the approved contact. You can keep RCS on; the preview shows existing standard SMS, not RCS messages. It may include older SMS for the approved contact. Preview clears when hidden or the app loses focus; Android screenshots are disabled while preview is visible. **Do not send message text or screenshots to the chat.**\n8. Tap **Stop and erase test settings** to disable scheduled capture and remove the saved contact and counters.

## Privacy model
The Android app reads SMS provider **metadata** (_id/address/type/time) to locally filter the approved contact. Only after the user taps Preview does it read **message bodies from matching SMS rows**, displaying up to five messages in app memory, without permanent storage or network transfer. It never uploads anything. The monitored number and counts stay in app-private SharedPreferences. Non-allowed contacts aren't retained. No default SMS handler switch, no root, no notification listener, no hidden monitoring.

## Known limitations
- A passing SMS test **does not** establish access to RCS or WhatsApp.\n- v0.2 does not yet ingest anything to the Command Center, and does not automatically store SMS message bodies.
- Android READ_SMS permissions may be blocked by device settings, Play Store policy, or OEM-specific protections.
- The Android SMS provider may not record outgoing SMS from a particular app/device configuration. This is what we're testing.
- `_id` high-water capture is deliberately simple; SMS that switches from outbox to sent without a new ID may be missed. A production version needs state transition tracking, robust backfill, deduplication, encryption, and consent/retention controls.
- Periodic JobScheduler execution can be delayed; do not promise real-time capture or 100% reliability.
- Once the body-preview alpha proves both SMS directions and text contents, build the secured **authenticated, encrypted, staging-only** transport to the Command Center, and separate human-approved financial/task extraction. Never auto-send a reply or change an event balance based on a text alone.

## References
- https://developer.android.com/reference/android/provider/Telephony.Sms
- https://developer.android.com/reference/android/app/job/JobScheduler
- https://github.com/capcom6/android-sms-gateway (Apache 2.0; design reference, not bundled)
