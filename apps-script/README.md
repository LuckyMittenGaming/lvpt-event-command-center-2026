# LVPT Google Apps Script backend

This project connects the Vercel Command Center to the private LVPT Google Sheet, Google Drive event folders, and a daily Gmail reminder trigger.

## Bound spreadsheet

- Spreadsheet ID: `1oHoVdD5CDcEreyRnB7cEvYfp6wWEgAmf04BwrktkMYs`
- Event documents folder ID: `1VXJzvC1gxWtVVL8f8oI64G9uDH1yrp8g`
- Backup folder ID: `1bUqZcKaTj1wPXMelHoMllk_LXf9ZYz8S`

## Apps Script properties

Add these under **Project Settings → Script Properties**:

- `LVPT_SHARED_SECRET` — long random secret, also added to Vercel as `APPS_SCRIPT_SHARED_SECRET`
- `LVPT_SPREADSHEET_ID` — `1oHoVdD5CDcEreyRnB7cEvYfp6wWEgAmf04BwrktkMYs`
- `LVPT_DOCUMENTS_FOLDER_ID` — `1VXJzvC1gxWtVVL8f8oI64G9uDH1yrp8g`
- `LVPT_BACKUP_FOLDER_ID` — `1bUqZcKaTj1wPXMelHoMllk_LXf9ZYz8S`

## Web app deployment

Deploy as a web app that executes as `book@pokertraininglasvegas.com` and allows access to anyone. The endpoint is protected by the shared secret and is only called by the Vercel server-side bridge.

Copy the `/exec` deployment URL into Vercel as `APPS_SCRIPT_WEB_APP_URL`.

## Vercel variables

- `APPS_SCRIPT_WEB_APP_URL`
- `APPS_SCRIPT_SHARED_SECRET`
- `LVPT_APP_SYNC_KEY` — separate random key typed into the Command Center on Matt and Mark's devices

## Optional reminder trigger

Run `installLvptDailyReminderTrigger` once from the Apps Script editor. It sends a daily summary to `book@pokertraininglasvegas.com` when tasks are overdue or due within three days.

Run `createLvptBackupNow` to create an immediate JSON backup in the database folder.
