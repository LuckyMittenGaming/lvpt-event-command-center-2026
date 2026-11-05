package com.lvpt.smsbridge;

import android.content.ContentUris;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.provider.Telephony;

import org.json.JSONArray;
import org.json.JSONObject;
import java.io.OutputStream;
import java.io.InputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import javax.net.ssl.HttpsURLConnection;

/** On-demand and best-effort background sync; no SMS is transmitted unless enabled by owner. */
public final class StagingSync {
    private static final Object LOCK = new Object();
    private static final int BATCH_SIZE = 50;
    private static final int MAX_BODY_CHARS = 12_000;
    private static final int MAX_PAYLOAD_CHARS = 180_000;

    public static final class Result {
        public final int acknowledged;
        public final boolean hasMore;
        public final String status;
        Result(int acknowledged, boolean hasMore, String status) {
            this.acknowledged = acknowledged;
            this.hasMore = hasMore;
            this.status = status;
        }
    }

    private StagingSync() { }

    public static Result sync(Context context, int maxBatches) {
        synchronized (LOCK) {
            if (!SyncConfig.enabled(context))
                return new Result(0, false, "Auto-sync is OFF.");
            if (!SmsMonitor.hasReadPermission(context))
                return new Result(0, false, "SMS read permission is unavailable.");
            if (!SmsMonitor.isActive(context))
                return new Result(0, false, "Start monitoring before auto-sync.");
            Set<String> allowed = MonitoredContacts.allNumbers(context);
            if (allowed.isEmpty())
                return new Result(0, false, "No approved contacts selected.");
            int sent = 0;
            boolean more = false;
            try {
                for (int n = 0; n < Math.max(1, Math.min(4, maxBatches)); n++) {
                    Batch batch = collect(context, allowed, SyncConfig.cursor(context));
                    if (batch.messages.length() == 0) {
                        if (batch.lastId > SyncConfig.cursor(context))
                            SyncConfig.acknowledge(context, batch.lastId);
                        more = false;
                        break;
                    }
                    post(context, batch.messages);
                    // Advance only AFTER the server reports acceptance; on failure retry safely.
                    SyncConfig.acknowledge(context, batch.lastId);
                    sent += batch.messages.length();
                    more = batch.hitLimit;
                    if (!more) break;
                }
                String message = more ? "Synced " + sent + " SMS; additional batches queued."
                    : "Sync complete: " + sent + " new matching SMS.";
                SyncConfig.record(context, message);
                return new Result(sent, more, message);
            } catch (Exception e) {
                String reason = e instanceof java.net.SocketTimeoutException ? "Network timeout"
                    : e instanceof java.net.UnknownHostException ? "Preview host unavailable"
                    : e instanceof SecurityException ? "SMS permission denied"
                    : e instanceof IllegalStateException && e.getMessage() != null
                        ? e.getMessage() : "Sync failed (" + e.getClass().getSimpleName() + ")";
                // Never include message bodies, phone numbers, access tokens, or raw server replies.
                String status = "Sync paused: " + reason + ". No cursor advanced for the failed batch.";
                SyncConfig.record(context, status);
                return new Result(sent, false, status);
            }
        }
    }

    private static final class Batch {
        final JSONArray messages;
        final long lastId;
        final boolean hitLimit;
        Batch(JSONArray messages, long lastId, boolean hitLimit) {
            this.messages = messages; this.lastId = lastId; this.hitLimit = hitLimit;
        }
    }

    private static Batch collect(Context context, Set<String> approved, long afterId) throws Exception {
        JSONArray messages = new JSONArray();
        long high = afterId;
        boolean filled = false;
        int estimatedChars = 0;
        String[] projection = { Telephony.Sms._ID, Telephony.Sms.ADDRESS,
            Telephony.Sms.TYPE, Telephony.Sms.DATE };
        try (Cursor cursor = context.getContentResolver().query(
                Telephony.Sms.CONTENT_URI, projection, Telephony.Sms._ID + " > ?",
                new String[] { Long.toString(afterId) }, Telephony.Sms._ID + " ASC")) {
            if (cursor == null) throw new IllegalStateException("Android SMS database is unavailable.");
            while (cursor.moveToNext()) {
                long id = cursor.getLong(0);
                String phone = MonitoredContacts.normalize(cursor.getString(1));
                int type = cursor.getInt(2);
                long date = cursor.getLong(3);
                if (!approved.contains(phone) ||
                    (type != Telephony.Sms.MESSAGE_TYPE_INBOX &&
                     type != Telephony.Sms.MESSAGE_TYPE_SENT)) {
                    high = id;
                    continue;
                }
                // Read the body only after the contact's number and SMS direction match.
                String body = bodyForId(context, id);
                if (body == null) { high = id; continue; }
                if (body.length() > MAX_BODY_CHARS)
                    throw new IllegalStateException("An unusually long SMS needs manual review.");

                int messageCost = body.length() + 200;
                if (messages.length() >= BATCH_SIZE ||
                    (messages.length() > 0 && estimatedChars + messageCost > MAX_PAYLOAD_CHARS)) {
                    filled = true;
                    break;
                }
                JSONObject m = new JSONObject();
                m.put("sms_id", id);
                m.put("phone", phone);
                m.put("direction", type == Telephony.Sms.MESSAGE_TYPE_INBOX ? "incoming" : "outgoing");
                m.put("timestamp_ms", date);
                m.put("body", body);
                messages.put(m);
                high = id;
                estimatedChars += messageCost;
            }
        }
        return new Batch(messages, high, filled);
    }

    private static String bodyForId(Context context, long id) {
        Uri uri = ContentUris.withAppendedId(Telephony.Sms.CONTENT_URI, id);
        try (Cursor c = context.getContentResolver().query(
                uri, new String[] { Telephony.Sms.BODY }, null, null, null)) {
            return c != null && c.moveToFirst() ? c.getString(0) : null;
        }
    }

    private static void post(Context context, JSONArray messages) throws Exception {
        String endpoint = SyncConfig.host(context);
        String token = SyncConfig.token(context);
        String bypass = SyncConfig.bypass(context);
        if (!endpoint.startsWith("https://") || token.length() < 32)
            throw new IllegalStateException("Secure staging connection not configured.");
        JSONObject packet = new JSONObject();
        packet.put("device_id", SyncConfig.deviceId(context));
        packet.put("messages", messages);
        byte[] bytes = packet.toString().getBytes(StandardCharsets.UTF_8);
        if (bytes.length > 256000)
            throw new IllegalStateException("SMS batch exceeds safe upload size.");
        HttpsURLConnection conn = (HttpsURLConnection) new URL(
            endpoint + "/api/sms/staging/ingest").openConnection();
        try {
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(12_000);
            conn.setReadTimeout(25_000);
            conn.setDoOutput(true);
            conn.setInstanceFollowRedirects(false);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("x-lvpt-sms-sync-token", token);
            if (!bypass.isEmpty())
                conn.setRequestProperty("x-vercel-protection-bypass", bypass);
            conn.setFixedLengthStreamingMode(bytes.length);
            try (OutputStream out = conn.getOutputStream()) {
                out.write(bytes);
            }
            int code = conn.getResponseCode();
            if (code != 200)
                throw new IllegalStateException("Staging endpoint returned HTTP " + code);
            byte[] responseBytes;
            try (InputStream input = conn.getInputStream()) {
                java.io.ByteArrayOutputStream buffer = new java.io.ByteArrayOutputStream();
                byte[] chunk = new byte[512];
                int n;
                while ((n = input.read(chunk)) != -1 && buffer.size() < 4096)
                    buffer.write(chunk, 0, n);
                responseBytes = buffer.toByteArray();
            }
            JSONObject response = new JSONObject(new String(responseBytes, StandardCharsets.UTF_8));
            if (!response.optBoolean("ok") || response.optInt("accepted", -1) != messages.length() ||
                !response.optBoolean("staging"))
                throw new IllegalStateException("Staging acknowledgment did not match batch.");
        } finally {
            conn.disconnect();
        }
    }
}
