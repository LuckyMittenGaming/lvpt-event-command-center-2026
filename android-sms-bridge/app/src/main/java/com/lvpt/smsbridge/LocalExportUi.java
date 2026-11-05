package com.lvpt.smsbridge;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * Local plaintext JSON backup. The user explicitly confirms and chooses the destination.
 * No automatic uploads. Files chosen in cloud-sync folders may be synced by that provider.
 */
public final class LocalExportUi {
    public static final int REQUEST_CREATE = 840;
    private final Activity activity;
    private final TextView progress;
    private final Button exportButton;
    private MonitoredContacts.Contact pending;
    private boolean exporting = false;

    public LocalExportUi(Activity activity, LinearLayout parent) {
        this.activity = activity;
        TextView explanation = new TextView(activity);
        explanation.setText("\nEXPORT SAVED SMS\n" +
            "Save all historical SMS for your selected person, including all of their approved " +
            "numbers, into a single JSON file. No password needed. No app upload. " +
            "The file contains private messages in plain text; choose a private folder.");
        explanation.setTextSize(16);
        parent.addView(explanation);

        exportButton = new Button(activity);
        exportButton.setText("5. Export selected contact's SMS to JSON");
        exportButton.setOnClickListener(v -> confirm());
        parent.addView(exportButton);

        progress = new TextView(activity);
        progress.setTextSize(15);
        parent.addView(progress);
    }

    private void confirm() {
        if (exporting) return;
        MonitoredContacts.Contact selected = MonitoredContacts.selected(activity);
        if (selected == null) {
            progress.setText("Add and select one approved contact first.");
            return;
        }
        new AlertDialog.Builder(activity)
            .setTitle("Export saved SMS for " + selected.name + "?")
            .setMessage("This saves all available SMS message texts for this person's " +
                selected.numbers.size() + " approved phone number(s) in one UNENCRYPTED JSON file. " +
                "Only proceed if you're authorized to handle this business conversation. " +
                "Anyone with the file can read its contents. RCS and WhatsApp are not included. " +
                "Choose a private folder; cloud folders may automatically sync.")
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Export to file", (dialog, which) -> chooseFile(selected))
            .show();
    }

    private void chooseFile(MonitoredContacts.Contact selected) {
        if (exporting) return;
        pending = selected;
        String safeName = selected.name.replaceAll("[^A-Za-z0-9_-]", "_");
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        intent.putExtra(Intent.EXTRA_TITLE, "lvpt_sms_" + safeName + ".json");
        try {
            activity.startActivityForResult(intent, REQUEST_CREATE);
            progress.setText("Choose a private location for your export.");
        } catch (Exception ex) {
            pending = null;
            progress.setText("This device could not open the file picker.");
        }
    }

    public void onResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != REQUEST_CREATE) return;
        MonitoredContacts.Contact selected = pending;
        pending = null;
        if (resultCode != Activity.RESULT_OK || data == null || data.getData() == null) {
            progress.setText("Export canceled.");
            return;
        }
        if (selected == null || exporting) {
            progress.setText("Export state expired. Please start again.");
            return;
        }
        Uri destination = data.getData();
        exporting = true;
        exportButton.setEnabled(false);
        progress.setText("Exporting approved SMS history…");
        new Thread(() -> {
            try {
                int total = SmsPlainExport.write(activity.getApplicationContext(),
                    destination, selected, count -> activity.runOnUiThread(() -> {
                        if (!activity.isFinishing())
                            progress.setText("Exported " + count + " SMS messages…");
                    }));
                activity.runOnUiThread(() -> {
                    if (!activity.isFinishing())
                        progress.setText("Export finished: " + total +
                            " messages saved. No data was sent by this app. " +
                            "Keep your JSON file private.");
                });
            } catch (Exception ex) {
                activity.runOnUiThread(() -> {
                    if (!activity.isFinishing())
                        progress.setText("Export couldn't finish (" +
                            ex.getClass().getSimpleName() +
                            "). Delete the incomplete JSON file and try again.");
                });
            } finally {
                activity.runOnUiThread(() -> {
                    exporting = false;
                    exportButton.setEnabled(true);
                });
            }
        }, "lvpt-local-sms-export").start();
    }
}
