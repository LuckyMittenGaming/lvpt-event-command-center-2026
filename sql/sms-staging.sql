-- Apply ONLY to a separate LVPT SMS staging Supabase project.
-- No data is seeded by this migration. Messages are encrypted before insertion.
create table if not exists public.lvpt_sms_staging (
  tenant_id text not null,
  device_id uuid not null,
  sms_id bigint not null check (sms_id > 0),
  contact_hash char(64) not null,
  direction text not null check (direction in ('incoming', 'outgoing')),
  timestamp_ms bigint not null check (timestamp_ms > 0),
  body_nonce text not null,
  body_ciphertext text not null,
  received_at timestamptz not null default now(),
  primary key (tenant_id, device_id, sms_id)
);

create index if not exists lvpt_sms_staging_received_idx
  on public.lvpt_sms_staging (tenant_id, received_at desc);

alter table public.lvpt_sms_staging enable row level security;

-- Deny client roles even if someone discovers a project anon key.
revoke all on public.lvpt_sms_staging from anon, authenticated;
-- Service-role access is server-only; never distribute that credential to Android.

comment on table public.lvpt_sms_staging is
  'Isolated LVPT pilot: AES-256-GCM ciphertext only. No plaintext SMS or phone numbers stored. No browser direct access.';
