package com.lvpt.smsbridge;

import android.Manifest;
import android.content.ContentUris;
import android.content.Context;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.provider.Telephony;
import android.text.format.DateFormat;

/**
 * On-device, user-initiated SMS history browser.
 *
 * Phone allowlisting is applied to SMS metadata BEFORE any message body is read.
 * No SMS history is stored or uploaded. RCS and MMS are out of scope.
 */
public final class SmsHistory {
    public static final int PAGE_SIZE = 20;
    private SmsHistory() { }

    public static final class Counts {
        public final int incoming;
        public final int outgoing;
        public final String error;

        private Counts(int incoming, int outgoing, String error) {
            this.incoming = incoming;
            this.outgoing = outgoing;
            this.error = error;
        }

        public String display() {
            if (error != null) return error;
            return "Saved SMS history for approved contact: " +
                incoming + " incoming / " + outgoing + " outgoing.\n" +
                "These totals include older SMS, not RCS or WhatsApp.";
        }
    }

    public static final class Page {
        public final String text;
        public final long nextBeforeId;
        public final int shown;
        public final String error;

        private Page(String text, long nextBeforeId, int shown, String error) {
            this.text = text;
            this.nextBeforeId = nextBeforeId;
            this.shown = shown;
            this.error = error;
        }

        public boolean hasOlder() {
            return nextBeforeId > 0 && error == null;
        }
    }

    // US numbers in this private diagnostic only; don't use suffix matching.
    private static String normalize(String raw) {
        if (raw == null) return "";
        String digits = raw.replaceAll("[^0-9]", "");
        if (digits.length() == 11 && digits.startsWith("1")) digits = digits.substring(1);
        return digits.length() == 10 ? digits : "";
    }

    private static String approvedNumber(Context context) {
        if (context.checkSelfPermission(Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED)
            throw new SecurityException("SMS reading permission isn't granted.");
        if (!SmsMonitor.isActive(context))
            throw new IllegalStateException("Start monitoring your approved contact first.");
        String phone = normalize(SmsMonitor.savedPhone(context));
        if (phone.isEmpty()) throw new IllegalStateException("No approved contact selected.");
        return phone;
    }

    public static Counts count(Context context) {
        try {
            String allowed = approvedNumber(context);
            String[] fields = { Telephony.Sms.ADDRESS, Telephony.Sms.TYPE };
            int incoming = 0;
            int outgoing = 0;
            try (Cursor cursor = context.getContentResolver().query(
                    Telephony.Sms.CONTENT_URI, fields, null, null, null)) {
                if (cursor == null) return new Counts(0, 0, "SMS history isn't available.");
                while (cursor.moveToNext()) {
                    // Check allowlist locally before counting.
                    if (!allowed.equals(normalize(cursor.getString(0)))) continue;
                    int type = cursor.getInt(1);
                    if (type == Telephony.Sms.MESSAGE_TYPE_INBOX) incoming++;
                    if (type == Telephony.Sms.MESSAGE_TYPE_SENT) outgoing++;
                }
            }
            return new Counts(incoming, outgoing, null);
        } catch (SecurityException | IllegalStateException ex) {
            return new Counts(0, 0, ex.getMessage());
        } catch (RuntimeException ex) {
            return new Counts(0, 0, "Couldn't count SMS history (" +
                ex.getClass().getSimpleName() + ").");
        }
    }

    /**
     * Fetch any history page, oldest reachable by repeatedly following nextBeforeId.
     * Start with beforeId=0. Each page replaces the previous page in the UI.
     * Only the approved contact's SMS bodies are read, on explicit user request.
     */
    public static Page readPage(Context context, long beforeId) {
        try {
            String allowed = approvedNumber(context);
            if (beforeId < 0) return new Page("No older SMS messages.", -1L, 0, null);

            String[] fields = {
                Telephony.Sms._ID, Telephony.Sms.ADDRESS,
                Telephony.Sms.TYPE, Telephony.Sms.DATE
            };
            String selection = beforeId > 0 ? Telephony.Sms._ID + " < ?" : null;
            String[] args = beforeId > 0 ? new String[] { Long.toString(beforeId) } : null;

            StringBuilder result = new StringBuilder();
            int matches = 0;
            long lastId = -1L;
            boolean exhausted = true;
            try (Cursor cursor = context.getContentResolver().query(
                    Telephony.Sms.CONTENT_URI, fields, selection, args,
                    Telephony.Sms._ID + " DESC")) {
                if (cursor == null) return new Page("", -1L, 0, "SMS history isn't available.");
                while (cursor.moveToNext()) {
                    long id = cursor.getLong(0);
                    String number = cursor.getString(1);
                    int type = cursor.getInt(2);
                    long timestamp = cursor.getLong(3);
                    if (!allowed.equals(normalize(number))) continue;
                    if (type != Telephony.Sms.MESSAGE_TYPE_INBOX &&
                        type != Telephony.Sms.MESSAGE_TYPE_SENT) continue;

                    // A second, targeted provider lookup reads BODY only for matching rows.
                    String messageText = readMatchingBody(context, id);
                    if (messageText == null) continue;
                    if (matches > 0) result.append("\n\n");
                    result.append(type == Telephony.Sms.MESSAGE_TYPE_INBOX
                            ? "INCOMING" : "OUTGOING")
                        .append(" • ")
                        .append(DateFormat.format("MMM d, yyyy h:mm a", timestamp))
                        .append("\n")
                        .append(messageText);
                    matches++;
                    lastId = id;

                    if (matches >= PAGE_SIZE) {
                        exhausted = false;
                        break;
                    }
                }
            }
            if (matches == 0) return new Page("No SMS messages found for this contact.", -1L, 0, null);
            return new Page(result.toString(), exhausted ? -1L : lastId, matches, null);
        } catch (SecurityException | IllegalStateException ex) {
            return new Page("", -1L, 0, ex.getMessage());
        } catch (RuntimeException ex) {
            return new Page("", -1L, 0,
                "Couldn't load SMS history (" + ex.getClass().getSimpleName() + ").");
        }
    }

    private static String readMatchingBody(Context context, long id) {
        Uri messageUri = ContentUris.withAppendedId(Telephony.Sms.CONTENT_URI, id);
        try (Cursor cursor = context.getContentResolver().query(
                messageUri, new String[] { Telephony.Sms.BODY }, null, null, null)) {
            return cursor != null && cursor.moveToFirst() ? cursor.getString(0) : null;
        }
    }
}
