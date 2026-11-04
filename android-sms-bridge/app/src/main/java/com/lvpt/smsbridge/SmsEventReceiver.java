package com.lvpt.smsbridge;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.provider.Telephony;

public class SmsEventReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        // Do not read or forward broadcast contents. The job reads the SMS
        // provider, applies the local allowlist, and records metadata only.
        if (Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction())
            && SmsMonitor.isActive(context)) {
            SmsScanJob.scheduleSoon(context);
        }
    }
}
