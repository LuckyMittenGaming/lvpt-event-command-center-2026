package com.lvpt.smsbridge;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.provider.Telephony;
import android.os.Build;

public final class SmsMonitor {
    private static final String PREFS = "lvpt_sms_test_settings";
    private static final String ACTIVE = "active";
    private static final String PHONE = "selected_phone";
    private static final String LAST_ID = "last_id";
    private static final String IN_COUNT = "incoming_count";
    private static final String OUT_COUNT = "outgoing_count";
    private static final String LAST_DIRECTION = "last_direction";
    private static final String LAST_TIMESTAMP = "last_timestamp";
    private static final Object LOCK = new Object();

    private SmsMonitor() { }

    private static SharedPreferences settings(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static boolean isActive(Context context) {
        return settings(context).getBoolean(ACTIVE, false);
    }

    public static boolean hasReadPermission(Context context) {
        return context.checkSelfPermission(Manifest.permission.READ_SMS)
            == PackageManager.PERMISSION_GRANTED;
    }

    private static String digits(String value) {
        return value == null ? "" : value.replaceAll("[^0-9]", "");
    }

    // LVPT prototype is US-only. Avoid substring matches on short numbers.
    private static String usLocalNumber(String value) {
        String numeric = digits(value);
        if (numeric.length() == 11 && numeric.startsWith("1"))
            numeric = numeric.substring(1);
        if (numeric.length() != 10) return "";
        return numeric;
    }

    public static void start(Context context, String phone) {
        synchronized (LOCK) {
            if (!hasReadPermission(context)) throw new SecurityException("READ_SMS permission not granted.");
            String normalized = usLocalNumber(phone);
            if (normalized.isEmpty()) throw new IllegalArgumentException("Enter a valid 10-digit US phone number.");
            long baselineId = maxSmsId(context);
            settings(context).edit()
                .putBoolean(ACTIVE, true)
                .putString(PHONE, normalized)
                .putLong(LAST_ID, baselineId)
                .putInt(IN_COUNT, 0)
                .putInt(OUT_COUNT, 0)
                .remove(LAST_DIRECTION)
                .remove(LAST_TIMESTAMP)
                .apply();
            SmsScanJob.schedule(context);
        }
    }

    public static void stopAndClear(Context context) {
        synchronized (LOCK) {
            settings(context).edit().clear().apply();
            SmsScanJob.cancel(context);
        }
    }

    private static long maxSmsId(Context context) {
        try (Cursor c = context.getContentResolver().query(
            Telephony.Sms.CONTENT_URI,
            new String[] { Telephony.Sms._ID },
            null, null, Telephony.Sms._ID + " DESC")) {
            if (c == null) throw new IllegalStateException("SMS database is unavailable.");
            return c.moveToFirst() ? c.getLong(0) : 0L;
        }
    }

    public static ScanResult scan(Context context) {
        synchronized (LOCK) {
            SharedPreferences s = settings(context);
            if (!s.getBoolean(ACTIVE, false)) return new ScanResult(0, 0, "Monitoring is stopped.");
            if (!hasReadPermission(context)) return new ScanResult(0, 0, "SMS read permission is unavailable.");
            String phone = s.getString(PHONE, "");
            long highWaterId = s.getLong(LAST_ID, 0);
            long newWatermark = highWaterId;
            int addedIn = 0;
            int addedOut = 0;
            String lastDirection = s.getString(LAST_DIRECTION, "");
            long lastTimestamp = s.getLong(LAST_TIMESTAMP, 0);
            String[] fields = { Telephony.Sms._ID, Telephony.Sms.ADDRESS, Telephony.Sms.TYPE, Telephony.Sms.DATE };
            try (Cursor c = context.getContentResolver().query(
                Telephony.Sms.CONTENT_URI,
                fields,
                Telephony.Sms._ID + " > ?",
                new String[] { Long.toString(highWaterId) },
                Telephony.Sms._ID + " ASC")) {
                if (c == null) return new ScanResult(0, 0, "Android returned no SMS database.");
                while (c.moveToNext()) {
                    long id = c.getLong(0);
                    String address = c.getString(1);
                    int type = c.getInt(2);
                    long when = c.getLong(3);
                    if (!usLocalNumber(address).isEmpty() && usLocalNumber(address).equals(phone)) {
                        if (type == Telephony.Sms.MESSAGE_TYPE_INBOX) {
                            addedIn++;
                            lastDirection = "Incoming SMS";
                            lastTimestamp = when;
                        } else if (type == Telephony.Sms.MESSAGE_TYPE_SENT) {
                            addedOut++;
                            lastDirection = "Outgoing SMS";
                            lastTimestamp = when;
                        }
                    }
                    if (id > newWatermark) newWatermark = id;
                }
                s.edit()
                    .putLong(LAST_ID, newWatermark)
                    .putInt(IN_COUNT, s.getInt(IN_COUNT, 0) + addedIn)
                    .putInt(OUT_COUNT, s.getInt(OUT_COUNT, 0) + addedOut)
                    .putString(LAST_DIRECTION, lastDirection)
                    .putLong(LAST_TIMESTAMP, lastTimestamp)
                    .apply();
                return new ScanResult(addedIn, addedOut, "Scan completed.");
            } catch (RuntimeException ex) {
                // Never include raw message text or phone numbers in errors.
                return new ScanResult(0, 0, "SMS database access failed: " + ex.getClass().getSimpleName());
            }
        }
    }

    public static String status(Context context) {
        SharedPreferences s = settings(context);
        StringBuilder b = new StringBuilder();
        b.append("Monitoring: ").append(s.getBoolean(ACTIVE, false) ? "ON" : "OFF");
        b.append("\nSMS read permission: ").append(hasReadPermission(context) ? "Granted" : "Not granted");
        b.append("\nIncoming SMS detected: ").append(s.getInt(IN_COUNT, 0));
        b.append("\nOutgoing SMS detected: ").append(s.getInt(OUT_COUNT, 0));
        String last = s.getString(LAST_DIRECTION, "");
        if (last != null && !last.isEmpty()) {
            b.append("\nLast match: ").append(last);
            long t = s.getLong(LAST_TIMESTAMP, 0);
            if (t > 0) b.append(" / ").append(android.text.format.DateFormat.format("MMM d, h:mm a", t));
        }
        b.append("\n\nRCS and WhatsApp are NOT covered by this test.");
        b.append("\nNo message bodies leave your phone or enter the Command Center.");
        return b.toString();
    }

    public static String savedPhone(Context context) {
        return settings(context).getString(PHONE, "");
    }

    public static final class ScanResult {
        public final int incoming;
        public final int outgoing;
        public final String status;
        ScanResult(int incoming, int outgoing, String status) {
            this.incoming = incoming;
            this.outgoing = outgoing;
            this.status = status;
        }
    }
}
