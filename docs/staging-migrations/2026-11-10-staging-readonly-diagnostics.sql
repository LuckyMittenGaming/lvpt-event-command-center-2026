-- LVPT staging only: owner-triggered privacy-safe diagnostics.
-- Applied to Supabase project "LVPT SMS Staging" on 2026-11-10.
-- No email recipient, sender, message, subject, Gmail thread ID or tokens.
create table if not exists public.lvpt_staging_diagnostic_runs (
  run_id uuid primary key,
  tenant_id text not null default 'lvpt-owner-pilot'
    check(tenant_id='lvpt-owner-pilot'),
  created_at timestamptz not null default now(),
  inbox_status text not null check(inbox_status in ('passed','failed')),
  page_zero_threads integer not null check(page_zero_threads between 0 and 20),
  thread_preview_status text not null
    check(thread_preview_status in ('not_selected','passed','blocked','failed')),
  recipient_status text not null
    check(recipient_status in ('not_selected','verified','blocked','failed')),
  vercel_send_switch_enabled boolean not null default false
);
create index if not exists lvpt_staging_diagnostics_recent
  on public.lvpt_staging_diagnostic_runs(tenant_id,created_at desc);
alter table public.lvpt_staging_diagnostic_runs enable row level security;
revoke all on public.lvpt_staging_diagnostic_runs from public,anon,authenticated;
grant select,insert on public.lvpt_staging_diagnostic_runs to service_role;
comment on table public.lvpt_staging_diagnostic_runs is
  'LVPT staging owner-triggered read-only diagnostic summaries. No Gmail thread identifiers, message bodies, recipient addresses, subjects, or tokens are stored. Never executes any Gmail write action.';
