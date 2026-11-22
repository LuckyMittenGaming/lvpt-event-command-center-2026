-- Step 48.4: owner-selected read-only diagnostic may sample up to three
-- distinct incoming conversations to avoid being stuck on an acknowledgement.
-- The audit stores COUNTS only, never Gmail IDs, senders, recipient addresses,
-- subjects, client names, or email text. Staging Supabase migration applied.
alter table public.lvpt_staging_diagnostic_runs
  add column if not exists sampled_threads integer not null default 0;
alter table public.lvpt_staging_diagnostic_runs
  add column if not exists possible_requests integer not null default 0;
alter table public.lvpt_staging_diagnostic_runs
  add column if not exists no_reply_suggested_count integer not null default 0;
alter table public.lvpt_staging_diagnostic_runs
  add column if not exists blocked_recipients integer not null default 0;
alter table public.lvpt_staging_diagnostic_runs
  add constraint lvpt_diag_bounded_samples check (
    sampled_threads between 0 and 3
    and possible_requests between 0 and sampled_threads
    and no_reply_suggested_count between 0 and sampled_threads
    and blocked_recipients between 0 and sampled_threads
  );
comment on column public.lvpt_staging_diagnostic_runs.sampled_threads is
  'Total read-only selected conversation previews, 0-3. No identifiers stored.';
-- No change to any sending switches, Gmail drafts, CRM, or financial records.
