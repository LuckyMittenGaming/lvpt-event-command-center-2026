package com.lvpt.smsbridge;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Arrays;
import java.util.UUID;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** User-enabled, fail-closed staging sync configuration, with tokens in AndroidKeyStore. */
public final class SyncConfig {
    private static final String PREFS = "lvpt_sms_sync_private";
    private static final String KEY_ALIAS = "LVPT_STAGING_SMS_SYNC_KEY_V1";
    private static final String ENDPOINT = "endpoint";
    private static final String TOKEN = "token";
    private static final String BYPASS = "bypass";
    private static final String ACTIVE = "active";
    private static final String CURSOR = "last_acknowledged_sms_id";
    private static final String DEVICE = "device_id";
    private static final String LAST_RESULT = "last_sync_result";

    private SyncConfig() { }

    static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static SecretKey keystoreKey() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        java.security.Key existing = store.getKey(KEY_ALIAS, null);
        if (existing instanceof SecretKey) return (SecretKey) existing;
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build());
        return generator.generateKey();
    }

    private static String encryptSecret(String plaintext) throws Exception {
        if (plaintext == null || plaintext.isEmpty()) return "";
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, keystoreKey());
        byte[] encrypted = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
        return Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":" +
            Base64.encodeToString(encrypted, Base64.NO_WRAP);
    }

    private static String decryptSecret(String encoded) throws Exception {
        if (encoded == null || encoded.isEmpty()) return "";
        String[] parts = encoded.split(":", 2);
        if (parts.length != 2) throw new IllegalStateException("Stored credential is invalid.");
        byte[] iv = Base64.decode(parts[0], Base64.NO_WRAP);
        byte[] data = Base64.decode(parts[1], Base64.NO_WRAP);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, keystoreKey(), new GCMParameterSpec(128, iv));
        return new String(cipher.doFinal(data), StandardCharsets.UTF_8);
    }

    public static void configure(Context context, String enteredUrl, String token,
                                 String bypass) throws Exception {
        URI uri = new URI(enteredUrl.trim());
        if (!"https".equalsIgnoreCase(uri.getScheme()) ||
            uri.getHost() == null || !uri.getHost().endsWith(".vercel.app") ||
            uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null ||
            uri.getPort() != -1)
            throw new IllegalArgumentException("For this pilot, use the HTTPS *.vercel.app preview host.");
        if (token == null || token.trim().length() < 32 || token.trim().length() > 256)
            throw new IllegalArgumentException("Sync token must be a unique 32–256 character secret.");
        if (bypass != null && bypass.length() > 256)
            throw new IllegalArgumentException("Preview bypass credential is too long.");
        if (!SmsMonitor.hasReadPermission(context))
            throw new IllegalStateException("Allow SMS access before enabling sync.");
        if (MonitoredContacts.list(context).isEmpty())
            throw new IllegalStateException("Add at least one approved contact first.");
        String host = "https://" + uri.getHost().toLowerCase(java.util.Locale.US);
        String encryptedToken = encryptSecret(token.trim());
        String encryptedBypass = encryptSecret(bypass == null ? "" : bypass.trim());
        SharedPreferences s = prefs(context);
        String previousHost = s.getString(ENDPOINT, "");
        s.edit().putString(ENDPOINT, host)
            .putString(TOKEN, encryptedToken)
            .putString(BYPASS, encryptedBypass)
            .putString(DEVICE, s.getString(DEVICE, UUID.randomUUID().toString()))
            .putLong(CURSOR, 0L)
            .putBoolean(ACTIVE, true)
            .putString(LAST_RESULT, "Enabled — waiting for first authenticated connection")
            .apply();
    }

    public static boolean enabled(Context context) {
        return prefs(context).getBoolean(ACTIVE, false);
    }

    public static String host(Context context) {
        return prefs(context).getString(ENDPOINT, "");
    }

    public static String deviceId(Context context) {
        return prefs(context).getString(DEVICE, "");
    }

    public static String token(Context context) throws Exception {
        return decryptSecret(prefs(context).getString(TOKEN, ""));
    }

    public static String bypass(Context context) throws Exception {
        return decryptSecret(prefs(context).getString(BYPASS, ""));
    }

    public static long cursor(Context context) {
        return prefs(context).getLong(CURSOR, 0L);
    }

    public static void acknowledge(Context context, long id) {
        SharedPreferences s = prefs(context);
        s.edit().putLong(CURSOR, Math.max(id, s.getLong(CURSOR, 0L))).commit();
    }

    public static void resetCursor(Context context) {
        prefs(context).edit().putLong(CURSOR, 0L).commit();
    }

    public static String status(Context context) {
        SharedPreferences s = prefs(context);
        return "Auto-sync: " + (enabled(context) ? "ON" : "OFF") +
            "\nLast synced SMS row: " + s.getLong(CURSOR, 0L) +
            "\n" + s.getString(LAST_RESULT, "No sync attempted");
    }

    public static void record(Context context, String safeResult) {
        prefs(context).edit().putString(LAST_RESULT, safeResult).apply();
    }

    public static void disable(Context context) {
        // Clear both encrypted credentials and any old cursor; leave local contacts intact.
        prefs(context).edit().clear().commit();
    }
}
