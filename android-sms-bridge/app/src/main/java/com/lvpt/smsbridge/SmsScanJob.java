package com.lvpt.smsbridge;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.os.Build;

public class SmsScanJob extends JobService {
    private static final int PERIODIC_ID = 40981;
    private static final int IMMEDIATE_ID = 40982;

    static void schedule(Context context) {
        JobScheduler scheduler = context.getSystemService(JobScheduler.class);
        if (scheduler == null) return;
        ComponentName name = new ComponentName(context, SmsScanJob.class);
        JobInfo recurring = new JobInfo.Builder(PERIODIC_ID, name)
            .setPeriodic(15 * 60 * 1000L)
            .setPersisted(true)
            .build();
        scheduler.schedule(recurring);
        scheduleSoon(context);
    }

    static void scheduleSoon(Context context) {
        JobScheduler scheduler = context.getSystemService(JobScheduler.class);
        if (scheduler == null) return;
        JobInfo job = new JobInfo.Builder(IMMEDIATE_ID, new ComponentName(context, SmsScanJob.class))
            .setMinimumLatency(0)
            .setOverrideDeadline(10_000L)
            .build();
        scheduler.schedule(job);
    }

    static void cancel(Context context) {
        JobScheduler scheduler = context.getSystemService(JobScheduler.class);
        if (scheduler != null) {
            scheduler.cancel(PERIODIC_ID);
            scheduler.cancel(IMMEDIATE_ID);
        }
    }

    @Override
    public boolean onStartJob(JobParameters params) {
        new Thread(() -> {
            try {
                SmsMonitor.scan(getApplicationContext());
            } finally {
                jobFinished(params, false);
            }
        }, "lvpt-sms-scan").start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true;
    }
}
