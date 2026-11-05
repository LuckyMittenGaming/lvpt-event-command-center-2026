package com.lvpt.smsbridge;

import android.Manifest;
import android.content.ContentUris;
import android.content.Context;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.provider.Telephony;
import android.util.JsonWriter;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;

/**
 * User-initiated plaintext export to an Android Documents-provider file.
 * No network permissions or background uploads. This is intentionally NOT encrypted:
 * users must choose an appropriate private storage location and manage access themselves.
 */
public final class SmsPlainExport {
    private SmsPlainExport() {}

    public interface Progress { void update(int count); }

    public static int write(Context context, Uri file, MonitoredContacts.Contact selected,
                            Progress progress) throws Exception {
        if (context.checkSelfPermission(Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED)
            throw new SecurityException("SMS read permission has not been granted.");
        if (selected == null || selected.numbers.isEmpty())
            throw new IllegalArgumentException("Select an approved contact to export.");
        Set<String> allowed = new HashSet<>(selected.numbers);
        int written = 0;
        try (OutputStream stream = context.getContentResolver().openOutputStream(file, "w")) {
            if (stream == null) throw new IllegalStateException("Cannot open selected file.");
            try (JsonWriter json = new JsonWriter(new OutputStreamWriter(stream, StandardCharsets.UTF_8))) {
                json.beginObject();
                json.name("format").value("lvpt_sms_history_v1");
                json.name("contact_name").value(selected.name);
                json.name("exported_at_utc").value(utcNow());
                json.name("scope").value("SMS only; RCS, MMS and WhatsApp not included");
                json.name("approved_numbers").beginArray();
                for (String number : selected.numbers) json.value(number);
                json.endArray();
                json.name("messages").beginArray();

                // First query only metadata. Do not access body text for any unapproved number.
                String[] projection = {
                    Telephony.Sms._ID, Telephony.Sms.ADDRESS,
                    Telephony.Sms.TYPE, Telephony.Sms.DATE
                };
                try (Cursor rows = context.getContentResolver().query(
                        Telephony.Sms.CONTENT_URI, projection, null, null,
                        Telephony.Sms.DATE + " ASC")) {
                    if (rows == null) throw new IllegalStateException("SMS database unavailable.");
                    while (rows.moveToNext()) {
                        if (Thread.currentThread().isInterrupted()) throw new InterruptedException("Export stopped.");
                        String phone = MonitoredContacts.normalize(rows.getString(1));
                        int type = rows.getInt(2);
                        if (!allowed.contains(phone)) continue;
                        if (type != Telephony.Sms.MESSAGE_TYPE_INBOX &&
                            type != Telephony.Sms.MESSAGE_TYPE_SENT) continue;
                        long smsId = rows.getLong(0);
                        String body = approvedBody(context, smsId);
                        if (body == null) continue;
                        json.beginObject();
                        json.name("sms_id").value(smsId);
                        json.name("number").value(phone);
                        json.name("direction").value(type == Telephony.Sms.MESSAGE_TYPE_INBOX
                            ? "incoming" : "outgoing");
                        json.name("timestamp_ms").value(rows.getLong(3));
                        json.name("body").value(body);
                        json.endObject();
                        written++;
                        if (progress != null && written % 100 == 0) progress.update(written);
                    }
                }
                json.endArray();
                json.name("total_messages").value(written);
                json.endObject();
            }
        }
        if (progress != null) progress.update(written);
        return written;
    }

    private static String approvedBody(Context context, long id) {
        Uri message = ContentUris.withAppendedId(Telephony.Sms.CONTENT_URI, id);
        try (Cursor c = context.getContentResolver().query(
                message, new String[] { Telephony.Sms.BODY }, null, null, null)) {
            return c != null && c.moveToFirst() ? c.getString(0) : null;
        }
    }

    private static String utcNow() {
        SimpleDateFormat formatter = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US);
        formatter.setTimeZone(TimeZone.getTimeZone("UTC"));
        return formatter.format(new Date());
    }
}
