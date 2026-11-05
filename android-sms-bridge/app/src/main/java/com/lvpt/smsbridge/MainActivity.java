package com.lvpt.smsbridge;

import android.Manifest;
import android.app.Activity;
import android.os.Bundle;
import android.content.pm.PackageManager;
import android.graphics.Typeface;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

public class MainActivity extends Activity {
    private static final int SMS_PERMISSION_REQUEST = 801;
    private ContactsPanel contactsPanel;
    private TextView status;
    private TextView lastAction;
    private TextView messagePreview;
    private Button previewToggle;
    private volatile boolean previewShown = false;
    private volatile int previewGeneration = 0;
    private long nextHistoryBeforeId = -1L;
    private TextView historyTotals;
    private Button olderHistory;
    private int historyPage = 0;

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        ScrollView scroll = new ScrollView(this);
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        int pad = (int) (20 * getResources().getDisplayMetrics().density);
        box.setPadding(pad, pad, pad, pad);
        scroll.addView(box);

        TextView heading = new TextView(this);
        heading.setText("LVPT | SMS Capture Test");
        heading.setTextSize(23);
        heading.setTypeface(null, Typeface.BOLD);
        box.addView(heading);

        TextView explanation = new TextView(this);
        explanation.setText("\nPrivate, read-only test. Choose ONE business contact. " +
            "New incoming and manually sent SMS messages will be counted when Android exposes " +
            "them in its SMS database. You can browse older saved SMS. Nothing is forwarded or uploaded.\n" +
            "\nThis does not include Google Messages RCS or WhatsApp.\n");
        explanation.setTextSize(16);
        box.addView(explanation);

        contactsPanel = new ContactsPanel(this, box, 10, () -> {
            hidePreview();
            refresh();
        });

        Button permission = button("1. Allow SMS reading (Android permission)", box);
        permission.setOnClickListener(v -> requestPermissions(
            new String[] { Manifest.permission.READ_SMS, Manifest.permission.RECEIVE_SMS },
            SMS_PERMISSION_REQUEST));

        Button start = button("2. Start monitoring new SMS", box);
        start.setOnClickListener(v -> {
            try {
                SmsMonitor.startWithContacts(this);
                lastAction.setText("Monitoring started. Only NEW SMS after this moment can count.");
            } catch (Exception e) {
                lastAction.setText("Couldn't start: " + e.getMessage());
            }
            refresh();
        });

        Button scan = button("3. Check for new messages", box);
        scan.setOnClickListener(v -> {
            new Thread(() -> {
                SmsMonitor.ScanResult result = SmsMonitor.scan(getApplicationContext());
                runOnUiThread(() -> {
                    lastAction.setText(result.status + " New incoming: " + result.incoming +
                        " | New outgoing: " + result.outgoing);
                    refresh();
                });
            }, "lvpt-manual-check").start();
        });

        previewToggle = button("4. Browse all saved SMS history (local only)", box);
        previewToggle.setOnClickListener(v -> {
            if (previewShown) {
                hidePreview();
                return;
            }
            previewShown = true;
            int generation = ++previewGeneration;
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
            previewToggle.setText("Hide SMS history");
            messagePreview.setVisibility(View.VISIBLE);
            historyTotals.setVisibility(View.VISIBLE);
            historyTotals.setText("Counting saved SMS history for approved contact…");
            loadHistoryPage(0L, 1, generation);
            new Thread(() -> {
                SmsHistory.Counts totals = SmsHistory.count(getApplicationContext());
                runOnUiThread(() -> {
                    if (previewShown && generation == previewGeneration && !isFinishing())
                        historyTotals.setText(totals.display() + "\nBrowse 20 messages at a time below.");
                });
            }, "lvpt-history-count").start();
        });

        historyTotals = new TextView(this);
        historyTotals.setTextSize(16);
        historyTotals.setVisibility(View.GONE);
        box.addView(historyTotals);

        messagePreview = new TextView(this);
        messagePreview.setTextSize(16);
        messagePreview.setTextIsSelectable(false);
        messagePreview.setVisibility(View.GONE);
        box.addView(messagePreview);

        olderHistory = button("Show 20 older SMS messages", box);
        olderHistory.setVisibility(View.GONE);
        olderHistory.setOnClickListener(v -> {
            if (!previewShown || nextHistoryBeforeId <= 0L) return;
            loadHistoryPage(nextHistoryBeforeId, historyPage + 1, previewGeneration);
        });

        Button stop = button("Stop monitoring (keep contacts)", box);
        stop.setOnClickListener(v -> {
            hidePreview();
            SmsMonitor.stopMonitoring(this);
            lastAction.setText("Monitoring stopped. Your approved contacts remain saved.");
            refresh();
        });

        lastAction = new TextView(this);
        lastAction.setText("\nReady for your test.");
        lastAction.setTextSize(15);
        box.addView(lastAction);

        status = new TextView(this);
        status.setTextSize(17);
        box.addView(status);

        setContentView(scroll);
        refresh();
    }

    private Button button(String title, LinearLayout parent) {
        Button result = new Button(this);
        result.setText(title);
        parent.addView(result);
        return result;
    }

    private void loadHistoryPage(long beforeId, int pageNumber, int generation) {
        olderHistory.setEnabled(false);
        olderHistory.setVisibility(View.GONE);
        messagePreview.setText("Loading stored SMS messages…");
        new Thread(() -> {
            SmsHistory.Page page = SmsHistory.readPage(getApplicationContext(), beforeId);
            runOnUiThread(() -> {
                if (!previewShown || generation != previewGeneration || isFinishing()) return;
                nextHistoryBeforeId = page.nextBeforeId;
                historyPage = pageNumber;
                if (page.error != null) messagePreview.setText(page.error);
                else messagePreview.setText("Page " + pageNumber + " • " +
                    page.shown + " SMS messages\n\n" + page.text);
                olderHistory.setVisibility(page.hasOlder() ? View.VISIBLE : View.GONE);
                olderHistory.setEnabled(true);
            });
        }, "lvpt-history-page").start();
    }

    private void hidePreview() {
        previewShown = false;
        ++previewGeneration;
        nextHistoryBeforeId = -1L;
        historyPage = 0;
        if (olderHistory != null) olderHistory.setVisibility(View.GONE);
        if (historyTotals != null) {
            historyTotals.setText("");
            historyTotals.setVisibility(View.GONE);
        }
        if (messagePreview != null) {
            messagePreview.setText("");
            messagePreview.setVisibility(View.GONE);
        }
        if (previewToggle != null)
            previewToggle.setText("4. Browse all saved SMS history (local only)");
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
    }

    private void refresh() {
        status.setText("\n" + SmsMonitor.status(this));
    }

    @Override
    protected void onPause() {
        hidePreview();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (status != null) refresh();
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        if (code == SMS_PERMISSION_REQUEST) {
            boolean allowed = checkSelfPermission(Manifest.permission.READ_SMS) ==
                PackageManager.PERMISSION_GRANTED;
            lastAction.setText(allowed ? "Permission granted. Now tap Start monitoring."
                : "Permission denied. Android may require special app access or a default SMS handler.");
            refresh();
        }
    }
}
