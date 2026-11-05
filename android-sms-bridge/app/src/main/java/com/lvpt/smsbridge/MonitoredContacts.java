package com.lvpt.smsbridge;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/** Local, explicitly approved contact allowlist. No network or contacts permission. */
public final class MonitoredContacts {
    public static final int MAX_SUPPORTED_CONTACTS = 10;
    public static final int MAX_NUMBERS_PER_CONTACT = 10;
    private static final String PREFS = "lvpt_monitored_contacts";
    private static final String RECORDS = "contacts_json";
    private static final String SELECTED = "selected_id";

    private MonitoredContacts() {}

    public static final class Contact {
        public final String id;
        public final String name;
        public final List<String> numbers;

        Contact(String id, String name, List<String> numbers) {
            this.id = id;
            this.name = name;
            this.numbers = Collections.unmodifiableList(new ArrayList<>(numbers));
        }
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static String normalize(String raw) {
        if (raw == null) return "";
        String digits = raw.replaceAll("[^0-9]", "");
        if (digits.length() == 11 && digits.startsWith("1")) digits = digits.substring(1);
        return digits.length() == 10 ? digits : "";
    }

    public static List<Contact> list(Context context) {
        List<Contact> contacts = new ArrayList<>();
        try {
            JSONArray array = new JSONArray(prefs(context).getString(RECORDS, "[]"));
            for (int i = 0; i < array.length(); i++) {
                JSONObject record = array.getJSONObject(i);
                JSONArray storedNumbers = record.getJSONArray("numbers");
                LinkedHashSet<String> numbers = new LinkedHashSet<>();
                for (int j = 0; j < storedNumbers.length(); j++) {
                    String number = normalize(storedNumbers.getString(j));
                    if (!number.isEmpty()) numbers.add(number);
                }
                if (!numbers.isEmpty()) contacts.add(new Contact(
                    record.getString("id"), record.getString("name"),
                    new ArrayList<>(numbers)));
            }
        } catch (Exception ignored) {
            // Malformed local settings should never result in monitoring unapproved contacts.
            return new ArrayList<>();
        }
        return contacts;
    }

    private static synchronized void persist(Context context, List<Contact> contacts) {
        try {
            JSONArray array = new JSONArray();
            for (Contact contact : contacts) {
                JSONObject json = new JSONObject();
                json.put("id", contact.id);
                json.put("name", contact.name);
                json.put("numbers", new JSONArray(contact.numbers));
                array.put(json);
            }
            prefs(context).edit().putString(RECORDS, array.toString()).apply();
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to store the approved contacts.");
        }
    }

    /** Prototype has a 10-contact cap; paid-plan entitlements must be checked by the server later. */
    public static synchronized Contact add(Context context, String label, String number, int planLimit) {
        String name = label == null ? "" : label.trim();
        String normalized = normalize(number);
        if (name.isEmpty() || name.length() > 80) throw new IllegalArgumentException("Enter a contact name (up to 80 characters).");
        if (normalized.isEmpty()) throw new IllegalArgumentException("Enter a valid 10-digit US number.");
        List<Contact> current = list(context);
        int limit = Math.max(1, Math.min(MAX_SUPPORTED_CONTACTS, planLimit));
        if (current.size() >= limit) throw new IllegalStateException("Account contact limit reached (" + limit + ").");
        for (Contact existing : current) {
            if (existing.numbers.contains(normalized))
                throw new IllegalArgumentException("That number is already assigned to " + existing.name + ".");
        }
        Contact entry = new Contact(java.util.UUID.randomUUID().toString(), name,
            Collections.singletonList(normalized));
        current.add(entry);
        persist(context, current);
        if (SyncConfig.enabled(context)) SyncConfig.resetCursor(context);
        if (prefs(context).getString(SELECTED, "").isEmpty()) select(context, entry.id);
        return entry;
    }

    public static synchronized void addNumber(Context context, String contactId, String number) {
        String normalized = normalize(number);
        if (normalized.isEmpty()) throw new IllegalArgumentException("Enter a valid 10-digit US number.");
        List<Contact> entries = list(context);
        for (Contact c : entries) {
            if (c.numbers.contains(normalized))
                throw new IllegalArgumentException("That number is already assigned to " + c.name + ".");
        }
        boolean found = false;
        for (int i = 0; i < entries.size(); i++) {
            Contact old = entries.get(i);
            if (!old.id.equals(contactId)) continue;
            if (old.numbers.size() >= MAX_NUMBERS_PER_CONTACT)
                throw new IllegalStateException("Maximum numbers reached for this contact.");
            List<String> numbers = new ArrayList<>(old.numbers);
            numbers.add(normalized);
            entries.set(i, new Contact(old.id, old.name, numbers));
            found = true;
            break;
        }
        if (!found) throw new IllegalArgumentException("Select a valid contact first.");
        persist(context, entries);
        if (SyncConfig.enabled(context)) SyncConfig.resetCursor(context);
    }

    public static synchronized void remove(Context context, String id) {
        List<Contact> entries = list(context);
        entries.removeIf(c -> c.id.equals(id));
        persist(context, entries);
        if (id.equals(prefs(context).getString(SELECTED, ""))) {
            select(context, entries.isEmpty() ? "" : entries.get(0).id);
        }
    }

    public static void select(Context context, String id) {
        prefs(context).edit().putString(SELECTED, id).apply();
    }

    public static Contact selected(Context context) {
        String id = prefs(context).getString(SELECTED, "");
        List<Contact> contacts = list(context);
        for (Contact contact : contacts) if (contact.id.equals(id)) return contact;
        return contacts.isEmpty() ? null : contacts.get(0);
    }

    public static Set<String> allNumbers(Context context) {
        Set<String> numbers = new LinkedHashSet<>();
        for (Contact c : list(context)) numbers.addAll(c.numbers);
        return numbers;
    }
}
