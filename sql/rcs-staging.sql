-- Apply ONLY to the existing LVPT SMS staging project.
-- This creates a separate RCS table. It does not alter lvpt_sms_staging.
create table if not exists public.lvpt_rcs_staging (
  tenant_id text not null check (tenant_id = 'lvpt-owner-pilot'),
  google_message_id text not null check (google_message_id ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  conversation_id text not null check (conversation_id ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  schema_version smallint not null check (schema_version = 1),
  source text not null check (source in ('google-messages', 'synthetic-test')),
  transport text not null check (transport in ('SMS', 'RCS')),
  direction text not null check (direction in ('incoming', 'outgoing')),
  timestamp_ms bigint not null check (timestamp_ms > 946684800000),
  contact_hash char(64) not null check (contact_hash ~ '^[a-f0-9]{64}$'),
  body_nonce text not null check (char_length(body_nonce) between 16 and 32),
  body_ciphertext text not null check (char_length(body_ciphertext) between 24 and 20000),
  ingested_at timestamptz not null default now(),
  primary key (tenant_id, google_message_id)
);

alter table public.lvpt_rcs_staging enable row level security;
revoke all on table public.lvpt_rcs_staging from public, anon, authenticated;
grant select, insert, update, delete on table public.lvpt_rcs_staging to service_role;

comment on table public.lvpt_rcs_staging is
  'Isolated LVPT RCS staging. AES-256-GCM ciphertext only. No plaintext, phone numbers, or decryption keys. Duplicate Google message IDs are ignored. Existing SMS rows are a different table.';
