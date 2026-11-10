-- Step 50: owner-triggered read-only negative-control canary.
-- Test that GAS refuses an ALREADY-ANSWERED outgoing email. This is not
-- permission to draft or send. Only a fixed pass/fail code is recorded.
-- Applied ONLY in LVPT SMS Staging Supabase, not production.
alter table public.lvpt_staging_diagnostic_runs
  add column if not exists negative_control_status text not null default 'not_checked';
alter table public.lvpt_staging_diagnostic_runs
  add constraint lvpt_staging_negative_control_status_check
  check (negative_control_status in ('not_checked','passed','failed'));
alter table public.lvpt_staging_diagnostic_runs
  drop constraint if exists lvpt_staging_diagnostic_selection_mode_check;
alter table public.lvpt_staging_diagnostic_runs
  add constraint lvpt_staging_diagnostic_selection_mode_check
  check (selection_mode in ('none','manual','automatic_client','automatic_vendor','negative_outbound'));
comment on column public.lvpt_staging_diagnostic_runs.negative_control_status is
  'Read-only, owner-triggered check that GAS rejects an already-answered conversation. Only pass/fail codes; never client data.';
