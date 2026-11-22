-- Deployed to LVPT SMS Staging Supabase on 2026-11-05.
-- Separate from legacy SMS review decisions; only owner action decisions live here.
-- Append-only decisions are audit records, not permission to send or alter books.
-- Database RLS prevents anon/authenticated access. Service-role API access is
-- available only through same-origin, authenticated Next.js server routes.
create table if not exists public.lvpt_owner_action_review_audit (
  request_id uuid primary key,
  tenant_id text not null,
  action_key text not null,
  decision text not null check (decision in ('draft_requested','verify_requested','hold','dismissed')),
  source_fingerprint text not null check (source_fingerprint ~ '^[a-f0-9]{16}$'),
  recorded_at timestamptz not null default now(),
  constraint lvpt_action_key_format check (action_key ~ '^(gmail|payment|payout):[A-Za-z0-9_.:-]{1,140}$'),
  constraint lvpt_action_tenant check (tenant_id = 'lvpt-owner-pilot'),
  constraint lvpt_action_draft_only_email check (
    (decision = 'draft_requested' and action_key like 'gmail:%') or
    (decision = 'verify_requested' and action_key not like 'gmail:%') or
    decision in ('hold','dismissed')
  )
);
create index if not exists lvpt_owner_action_history_idx
  on public.lvpt_owner_action_review_audit (tenant_id,action_key,recorded_at desc,request_id desc);
alter table public.lvpt_owner_action_review_audit enable row level security;
revoke all on public.lvpt_owner_action_review_audit from public,anon,authenticated;
grant select,insert on public.lvpt_owner_action_review_audit to service_role;
-- No anon or authenticated RLS policy is intentionally defined.
