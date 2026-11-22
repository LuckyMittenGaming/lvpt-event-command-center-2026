-- Step 48: one permanently unique send reservation per verified incoming
-- client email revision, isolated from LVPT's existing owner-review audit.
-- Applied ONLY in Supabase staging project LVPT SMS Staging, not production.
-- Stores no recipient address, message subject, draft body, or client PII.
create table if not exists public.lvpt_reply_send_intents (
  intent_id uuid primary key,
  tenant_id text not null default 'lvpt-owner-pilot'
    check (tenant_id='lvpt-owner-pilot'),
  thread_id text not null check (thread_id ~ '^[a-f0-9]{8,32}$'),
  last_message_at timestamptz not null,
  approved_digest text not null check (approved_digest ~ '^[a-f0-9]{64}$'),
  recipient_hash text not null check (recipient_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'reserved'
    check (status in ('reserved','sent','uncertain')),
  gmail_message_id text
    check (gmail_message_id is null or gmail_message_id ~ '^[a-f0-9]{8,32}$'),
  reserved_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(tenant_id,thread_id,last_message_at)
);
create index if not exists lvpt_send_intents_recent
  on public.lvpt_reply_send_intents(tenant_id,reserved_at desc);
alter table public.lvpt_reply_send_intents enable row level security;
revoke all on table public.lvpt_reply_send_intents from public,anon,authenticated;
grant select,insert,update on table public.lvpt_reply_send_intents to service_role;
comment on table public.lvpt_reply_send_intents is
  'One unique reservation per incoming LVPT email revision. Failed/uncertain attempts never retry automatically. No PII or draft bodies stored.';

-- Safety: enable *neither* sending switch during staging validation.
-- Manual opt-ins required in two separate places, after owner approves:
--  Vercel env: LVPT_ENABLE_OWNER_APPROVED_GMAIL_SEND=true
--  Apps Script Properties: LVPT_ENABLE_OWNER_APPROVED_GMAIL_SEND=true
-- Both are absent/false by default. Do not enable or send during release test.
