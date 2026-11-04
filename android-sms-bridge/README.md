# LVPT SMS Bridge — Android diagnostic alpha

**Scope:** privately installed, business-only diagnostic for a single phone contact. This first alpha **does not upload, transmit, forward, retain, or analyze message bodies**. It verifies whether Android's standard SMS content provider exposes both new incoming SMS and **SMS manually sent through the existing texting app**.

## Build
Open `android-sms-bridge/` in Android Studio (JDK 17 / Android SDK 35) and build the `app` debug variant. Alternatively, download the `lvpt-sms-bridge-debug-apk` artifact from the branch-specific GitHub Actions workflow if it completed successfully. Do not install an unsigned or unverified APK from unrelated sites.

## Phone test
1. Install the **LVPT SMS Test** debug APK on your own Android phone. This is intentionally *not* a default SMS app.
2. Enter **one approved business contact's US phone number**. Tap **Allow SMS reading**; Android permissions may be restricted on certain devices, OEMs, Android releases, or distribution methods.
3. Tap **Start monitoring new SMS**. The app takes an SMS database high-water snapshot; older messages are ignored.
4. Have the selected contact send a **regular SMS** (not RCS/WhatsApp). Tap **Check for new messages**, verify incoming counter increases.
5. Send a **regular SMS** using your *normal* Messages app. Tap **Check**; verify outgoing counter increases.
6. Try with phone screen locked and after restart. The app receives `SMS_RECEIVED` and schedules OS-managed scanning, plus a best-effort periodic job (approximately 15 minutes or later due to power restrictions).
7. Tap **Stop and erase test settings** to disable scheduled capture and remove the saved contact and counters.

## Privacy model
The Android app reads SMS provider **metadata** (_id/address/type/time) to locally filter the approved contact; **it does not request SMS body content** and never uploads anything. The monitored number and counts stay in app-private SharedPreferences. Non-allowed contacts aren't retained. No default SMS handler switch, no root, no notification listener, no hidden monitoring.

## Known limitations
- A passing SMS test **does not** establish access to RCS or WhatsApp.
- Android READ_SMS permissions may be blocked by device settings, Play Store policy, or OEM-specific protections.
- The Android SMS provider may not record outgoing SMS from a particular app/device configuration. This is what we're testing.
- `_id` high-water capture is deliberately simple; SMS that switches from outbox to sent without a new ID may be missed. A production version needs state transition tracking, robust backfill, deduplication, encryption, and consent/retention controls.
- Periodic JobScheduler execution can be delayed; do not promise real-time capture or 100% reliability.
- Once this alpha proves both SMS directions, build the secured **authenticated, encrypted, staging-only** transport to the Command Center, and separate human-approved financial/task extraction. Never auto-send a reply or change an event balance based on a text alone.

## References
- https://developer.android.com/reference/android/provider/Telephony.Sms
- https://developer.android.com/reference/android/app/job/JobScheduler
- https://github.com/capcom6/android-sms-gateway (Apache 2.0; design reference, not bundled)
