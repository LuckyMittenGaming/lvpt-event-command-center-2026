-- Step 47: isolated, append-only owner reply review audit.
-- Applied to Supabase project "LVPT SMS Staging" on 2026-11-10.
-- Deliberately stores NO recipient, email body, subject, or draft text.
-- Keep this distinct from lvpt_owner_action_review_audit: its existing
-- constraints forbid inbox-wide drafting approvals and should not be loosened.
create table if not exists public.lvpt_reply_review_audit (
  request_id uuid primary key,
  tenant_id text not null default 'lvpt-owner-pilot'
    check (tenant_id='lvpt-owner-pilot'),
  thread_id text not null check (thread_id ~ '^[a-f0-9]{8,32}$'),
  last_message_at timestamptz not null,
  decision text not null
    check (decision in ('draft_prepared','approved_for_manual_copy','denied')),
  draft_digest text
    check (draft_digest is null or draft_digest ~ '^[a-f0-9]{64}$'),
  recorded_at timestamptz not null default now(),
  constraint lvpt_reply_digest_required
    check (decision <> 'approved_for_manual_copy' or draft_digest is not null)
);
create index if not exists lvpt_reply_review_tenant_thread_recent
  on public.lvpt_reply_review_audit(tenant_id,thread_id,recorded_at desc,request_id desc);
alter table public.lvpt_reply_review_audit enable row level security;
revoke all on table public.lvpt_reply_review_audit from public,anon,authenticated;
grant select,insert on table public.lvpt_reply_review_audit to service_role;
comment on table public.lvpt_reply_review_audit is
  'Append-only owner decisions for staged read-only Gmail review. Stores no client email bodies, recipients, or draft text. No sending capability.';
