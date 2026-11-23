create table if not exists public.lvpt_rcs_staging (
  tenant_id text not null,
  google_message_id text not null,
  conversation_id text not null,
  transport text not null check (transport in ('SMS', 'RCS')),
  direction text not null check (direction in ('incoming', 'outgoing')),
  timestamp_ms bigint not null,
  contact_hash text not null,
  body_ciphertext text not null,
  ingested_at timestamptz not null default now(),
  primary key (tenant_id, google_message_id)
);

alter table public.lvpt_rcs_staging enable row level security;
revoke all on table public.lvpt_rcs_staging from anon, authenticated;
