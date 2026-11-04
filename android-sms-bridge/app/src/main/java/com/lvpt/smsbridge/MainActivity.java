package com.lvpt.smsbridge;

import android.Manifest;
import android.app.Activity;
import android.os.Bundle;
import android.content.pm.PackageManager;
import android.graphics.Typeface;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

public class MainActivity extends Activity {
    private static final int SMS_PERMISSION_REQUEST = 801;
    private EditText number;
    private TextView status;
    private TextView lastAction;

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
            "them in its SMS database. Nothing is forwarded or uploaded.\n" +
            "\nThis does not include Google Messages RCS or WhatsApp.\n");
        explanation.setTextSize(16);
        box.addView(explanation);

        number = new EditText(this);
        number.setHint("Approved contact's 10-digit number");
        number.setInputType(android.text.InputType.TYPE_CLASS_PHONE);
        number.setSingleLine(true);
        number.setText(SmsMonitor.savedPhone(this));
        box.addView(number);

        Button permission = button("1. Allow SMS reading (Android permission)", box);
        permission.setOnClickListener(v -> requestPermissions(
            new String[] { Manifest.permission.READ_SMS, Manifest.permission.RECEIVE_SMS },
            SMS_PERMISSION_REQUEST));

        Button start = button("2. Start monitoring new SMS", box);
        start.setOnClickListener(v -> {
            try {
                SmsMonitor.start(this, number.getText().toString());
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

        Button stop = button("Stop and erase test settings", box);
        stop.setOnClickListener(v -> {
            SmsMonitor.stopAndClear(this);
            number.setText("");
            lastAction.setText("Stopped. Contact selection and counters erased.");
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

    private void refresh() {
        status.setText("\n" + SmsMonitor.status(this));
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
