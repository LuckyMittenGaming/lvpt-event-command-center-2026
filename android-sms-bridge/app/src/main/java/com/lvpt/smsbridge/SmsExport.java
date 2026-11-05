package com.lvpt.smsbridge;

import android.Manifest;
import android.content.ContentUris;
import android.content.Context;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.provider.Telephony;
import android.util.JsonWriter;

import java.io.DataOutputStream;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.Date;
import java.text.SimpleDateFormat;
import java.util.Locale;
import java.util.TimeZone;

import javax.crypto.Cipher;
import javax.crypto.CipherOutputStream;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.PBEKeySpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * Explicitly initiated, on-device encrypted export of approved SMS conversations.
 * Does not require INTERNET permission and never writes plaintext to storage.
 *
 * Binary format, version 1:
 *   ASCII "LVPTSMS1" (8 bytes)
 *   PBKDF2 salt (16 bytes)
 *   AES-GCM IV (12 bytes)
 *   AES-256-GCM encrypted UTF-8 JSON including authentication tag (16 bytes)
 * PBKDF2-HMAC-SHA256, 210000 iterations.
 */
public final class SmsExport {
    private static final int ITERATIONS = 210_000;
    private static final int KEY_BITS = 256;
    private static final byte[] MAGIC = "LVPTSMS1".getBytes(StandardCharsets.US_ASCII);

    private SmsExport() { }

    public interface Progress {
        void onProgress(int exported);
    }

    public static String normalizeNumber(String raw) {
        if (raw == null) return "";
        String digits = raw.replaceAll("[^0-9]", "");
        if (digits.length() == 11 && digits.startsWith("1")) digits = digits.substring(1);
        return digits.length() == 10 ? digits : "";
    }

    public static String[] allowlist(String selectedNumber, String optionalOtherNumber) {
        String primary = normalizeNumber(selectedNumber);
        if (primary.isEmpty()) throw new IllegalArgumentException("Start monitoring an approved US phone number.");
        if (optionalOtherNumber == null || optionalOtherNumber.trim().isEmpty())
            return new String[] { primary };
        String secondary = normalizeNumber(optionalOtherNumber);
        if (secondary.isEmpty())
            throw new IllegalArgumentException("Second number must be a valid 10-digit US number.");
        if (primary.equals(secondary)) return new String[] { primary };
        return new String[] { primary, secondary };
    }

    public static int writeEncrypted(Context context, Uri destination,
                                     String[] phoneNumbers, char[] password,
                                     Progress progress) throws Exception {
        if (context.checkSelfPermission(Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED)
            throw new SecurityException("SMS access has not been granted.");
        if (phoneNumbers == null || phoneNumbers.length == 0 || phoneNumbers.length > 2)
            throw new IllegalArgumentException("Only one or two explicitly approved numbers are allowed.");
        if (password == null || password.length < 12)
            throw new IllegalArgumentException("Use an encryption password of at least 12 characters.");

        Set<String> allowed = new HashSet<>();
        for (String phone : phoneNumbers) {
            String normalized = normalizeNumber(phone);
            if (normalized.isEmpty()) throw new IllegalArgumentException("Invalid approved phone number.");
            allowed.add(normalized);
        }

        byte[] salt = new byte[16];
        byte[] iv = new byte[12];
        SecureRandom random = new SecureRandom();
        random.nextBytes(salt);
        random.nextBytes(iv);

        PBEKeySpec kdfSpec = new PBEKeySpec(password, salt, ITERATIONS, KEY_BITS);
        byte[] keyBytes = null;
        try {
            SecretKeyFactory factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256");
            keyBytes = factory.generateSecret(kdfSpec).getEncoded();
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(keyBytes, "AES"),
                new GCMParameterSpec(128, iv));

            int exported = 0;
            try (OutputStream output = context.getContentResolver().openOutputStream(destination, "w")) {
                if (output == null) throw new IllegalStateException("Android couldn't open the selected file.");
                DataOutputStream header = new DataOutputStream(output);
                header.write(MAGIC);
                header.write(salt);
                header.write(iv);
                header.flush();

                try (CipherOutputStream encrypted = new CipherOutputStream(output, cipher);
                     JsonWriter json = new JsonWriter(new OutputStreamWriter(encrypted, StandardCharsets.UTF_8))) {
                    json.beginObject();
                    json.name("format").value("lvpt_sms_history_v1");
                    json.name("created_utc").value(utcNow());
                    json.name("content_type").value("sms_only_no_rcs_or_mms");
                    json.name("source").value("lvpt_android_consent_export");
                    json.name("approved_numbers");
                    json.beginArray();
                    for (String number : allowed) json.value(number);
                    json.endArray();
                    json.name("messages").beginArray();

                    // This query contains metadata only, deliberately not BODY.
                    String[] metadata = {
                        Telephony.Sms._ID, Telephony.Sms.ADDRESS,
                        Telephony.Sms.TYPE, Telephony.Sms.DATE
                    };
                    try (Cursor cursor = context.getContentResolver().query(
                            Telephony.Sms.CONTENT_URI, metadata, null, null,
                            Telephony.Sms.DATE + " ASC, " + Telephony.Sms._ID + " ASC")) {
                        if (cursor == null) throw new IllegalStateException("SMS database isn't available.");
                        while (cursor.moveToNext()) {
                            if (Thread.currentThread().isInterrupted())
                                throw new InterruptedException("Export interrupted.");
                            long id = cursor.getLong(0);
                            String phone = normalizeNumber(cursor.getString(1));
                            int direction = cursor.getInt(2);
                            long when = cursor.getLong(3);
                            if (!allowed.contains(phone)) continue;
                            if (direction != Telephony.Sms.MESSAGE_TYPE_INBOX &&
                                direction != Telephony.Sms.MESSAGE_TYPE_SENT) continue;

                            // Only after contact allowlist check: fetch the exact SMS body.
                            String body = readApprovedSmsBody(context, id);
                            if (body == null) continue;

                            json.beginObject();
                            json.name("android_sms_id").value(id);
                            json.name("phone").value(phone);
                            json.name("timestamp_ms").value(when);
                            json.name("direction").value(direction == Telephony.Sms.MESSAGE_TYPE_INBOX
                                ? "incoming" : "outgoing");
                            json.name("body").value(body);
                            json.endObject();

                            exported++;
                            if (progress != null && exported % 100 == 0)
                                progress.onProgress(exported);
                        }
                    }
                    json.endArray();
                    json.endObject();
                }
            } catch (Exception failure) {
                // A partial GCM stream is not usable; attempt to remove the partial file.
                try { context.getContentResolver().delete(destination, null, null); }
                catch (Exception ignored) { }
                throw failure;
            }
            if (progress != null) progress.onProgress(exported);
            return exported;
        } finally {
            kdfSpec.clearPassword();
            if (keyBytes != null) Arrays.fill(keyBytes, (byte) 0);
            Arrays.fill(salt, (byte) 0);
            Arrays.fill(iv, (byte) 0);
        }
    }

    private static String readApprovedSmsBody(Context context, long id) {
        Uri uri = ContentUris.withAppendedId(Telephony.Sms.CONTENT_URI, id);
        try (Cursor cursor = context.getContentResolver().query(
                uri, new String[] { Telephony.Sms.BODY }, null, null, null)) {
            return cursor != null && cursor.moveToFirst() ? cursor.getString(0) : null;
        }
    }

    private static String utcNow() {
        SimpleDateFormat formatter = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US);
        formatter.setTimeZone(TimeZone.getTimeZone("UTC"));
        return formatter.format(new Date());
    }
}
