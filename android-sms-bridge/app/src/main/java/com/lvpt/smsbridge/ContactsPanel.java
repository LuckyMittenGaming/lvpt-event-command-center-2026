package com.lvpt.smsbridge;

import android.app.Activity;
import android.app.AlertDialog;
import android.graphics.Typeface;
import android.text.InputType;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Explicitly approved contact management UI for the private Android diagnostic. */
public final class ContactsPanel {
    private final Activity activity;
    private final LinearLayout entries;
    private final TextView heading;
    private final EditText nameInput;
    private final EditText numberInput;
    private final Runnable onSelectionChange;
    private final int planLimit;

    public ContactsPanel(Activity activity, LinearLayout parent, int planLimit,
                         Runnable onSelectionChange) {
        this.activity = activity;
        this.onSelectionChange = onSelectionChange;
        this.planLimit = Math.max(1, Math.min(planLimit, MonitoredContacts.MAX_SUPPORTED_CONTACTS));

        heading = new TextView(activity);
        heading.setTextSize(18);
        heading.setTypeface(null, Typeface.BOLD);
        parent.addView(heading);

        TextView info = new TextView(activity);
        info.setText("Choose business contacts you are authorized to monitor. " +
            "A person counts as ONE slot even if they have several numbers. " +
            "Select a person before browsing or exporting their messages.");
        info.setTextSize(15);
        parent.addView(info);

        nameInput = new EditText(activity);
        nameInput.setHint("Contact name (e.g., Mark)");
        nameInput.setSingleLine(true);
        parent.addView(nameInput);

        numberInput = new EditText(activity);
        numberInput.setHint("Contact phone number");
        numberInput.setInputType(InputType.TYPE_CLASS_PHONE);
        numberInput.setSingleLine(true);
        parent.addView(numberInput);

        Button add = new Button(activity);
        add.setText("+ Add monitored contact");
        add.setOnClickListener(v -> {
            try {
                MonitoredContacts.add(activity, nameInput.getText().toString(),
                    numberInput.getText().toString(), this.planLimit);
                nameInput.setText("");
                numberInput.setText("");
                refresh();
                onSelectionChange.run();
            } catch (Exception ex) {
                showError(ex.getMessage());
            }
        });
        parent.addView(add);

        entries = new LinearLayout(activity);
        entries.setOrientation(LinearLayout.VERTICAL);
        parent.addView(entries);
        refresh();
    }

    private void showError(String message) {
        new AlertDialog.Builder(activity).setTitle("Contact settings")
            .setMessage(message).setPositiveButton("OK", null).show();
    }

    public void refresh() {
        entries.removeAllViews();
        java.util.List<MonitoredContacts.Contact> contacts = MonitoredContacts.list(activity);
        MonitoredContacts.Contact selected = MonitoredContacts.selected(activity);
        heading.setText("MONITORED CONTACTS (" + contacts.size() + " / " + planLimit + ")");

        for (MonitoredContacts.Contact contact : contacts) {
            LinearLayout row = new LinearLayout(activity);
            row.setOrientation(LinearLayout.VERTICAL);
            row.setPadding(0, 10, 0, 10);

            TextView label = new TextView(activity);
            label.setText((selected != null && selected.id.equals(contact.id) ? "● " : "○ ") +
                contact.name + " — " + contact.numbers.size() + " number(s)");
            label.setTextSize(17);
            row.addView(label);

            TextView numbers = new TextView(activity);
            numbers.setText(android.text.TextUtils.join(" · ", contact.numbers));
            numbers.setTextSize(13);
            row.addView(numbers);

            LinearLayout actions = new LinearLayout(activity);
            actions.setOrientation(LinearLayout.HORIZONTAL);

            Button select = new Button(activity);
            select.setText(selected != null && selected.id.equals(contact.id) ? "Selected" : "Select");
            select.setOnClickListener(v -> {
                MonitoredContacts.select(activity, contact.id);
                refresh();
                onSelectionChange.run();
            });
            actions.addView(select);

            Button addNumber = new Button(activity);
            addNumber.setText("+ Number");
            addNumber.setOnClickListener(v -> promptNumber(contact));
            actions.addView(addNumber);

            Button remove = new Button(activity);
            remove.setText("Remove");
            remove.setOnClickListener(v -> new AlertDialog.Builder(activity)
                .setTitle("Remove " + contact.name + "?")
                .setMessage("Stop monitoring every number assigned to this contact? Existing SMS on the phone will not be deleted.")
                .setNegativeButton("Cancel", null)
                .setPositiveButton("Remove", (dialog, which) -> {
                    MonitoredContacts.remove(activity, contact.id);
                    refresh();
                    onSelectionChange.run();
                }).show());
            actions.addView(remove);
            row.addView(actions);
            entries.addView(row);
        }
    }

    private void promptNumber(MonitoredContacts.Contact contact) {
        EditText newNumber = new EditText(activity);
        newNumber.setHint("Additional 10-digit phone number");
        newNumber.setInputType(InputType.TYPE_CLASS_PHONE);
        newNumber.setSingleLine(true);
        newNumber.setPadding(24, 8, 24, 8);
        new AlertDialog.Builder(activity)
            .setTitle("Add another number for " + contact.name)
            .setMessage("This number belongs to the same person and does not use another contact slot.")
            .setView(newNumber)
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Add number", (dialog, which) -> {
                try {
                    MonitoredContacts.addNumber(activity, contact.id,
                        newNumber.getText().toString());
                    refresh();
                    onSelectionChange.run();
                } catch (Exception ex) {
                    showError(ex.getMessage());
                }
            }).show();
    }
}
