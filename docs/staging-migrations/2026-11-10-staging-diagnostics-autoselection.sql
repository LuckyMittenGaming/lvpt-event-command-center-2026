-- Step 48.2: record which type of read-only diagnostic selection was made.
-- No Gmail thread ID, sender, recipient, subject, or message text is stored.
-- Applied to LVPT SMS Staging Supabase, not production.
alter table public.lvpt_staging_diagnostic_runs
  add column if not exists selection_mode text not null default 'none';
alter table public.lvpt_staging_diagnostic_runs
  add constraint lvpt_staging_diagnostic_selection_mode_check
  check(selection_mode in ('none','manual','automatic_client','automatic_vendor'));

-- All Gmail write/sending flags remain unchanged.
