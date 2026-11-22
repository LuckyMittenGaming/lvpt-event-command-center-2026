-- LVPT SMS staging project only (ogfrcwmsjbtiydlvqoyj). DO NOT deploy to production.
-- Applied to isolated Supabase SMS Staging on 2026-11-05.
-- Records user-approved decision save submissions; NO SMS plaintext or reviewer note plaintext.

create table if not exists public.lvpt_sms_review_audit (
  audit_id bigint generated always as identity primary key,
  tenant_id text not null check (tenant_id='lvpt-owner-pilot'),
  case_key text not null,
  submitted_status text not null check (submitted_status in (
    'Needs verification','Investigating','Reviewed — no action','Candidate for reconciliation'
  )),
  source_count integer not null check (source_count between 0 and 100000),
  note_mac text not null check (note_mac ~ '^[0-9a-f]{64}$'),
  recorded_at timestamptz not null default now()
);
create index if not exists lvpt_sms_review_audit_tenant_time
  on public.lvpt_sms_review_audit(tenant_id,recorded_at desc);
alter table public.lvpt_sms_review_audit enable row level security;
revoke all on public.lvpt_sms_review_audit from public,anon,authenticated;
revoke all on sequence public.lvpt_sms_review_audit_audit_id_seq from public,anon,authenticated;
grant select,insert on public.lvpt_sms_review_audit to service_role;
grant usage,select on sequence public.lvpt_sms_review_audit_audit_id_seq to service_role;

create or replace function public.lvpt_save_sms_decisions_with_audit(p_rows jsonb)
returns integer language plpgsql security definer set search_path=''
as $fn$
declare
  entry jsonb;
  record_count integer := 0;
  v_tenant text;
  v_key text;
  v_status text;
  v_count integer;
  v_nonce text;
  v_ciphertext text;
  v_mac text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>40 then
    raise exception 'Invalid review batch';
  end if;
  for entry in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(entry) is distinct from 'object' then raise exception 'Invalid review entry'; end if;
    v_tenant := entry->>'tenant_id';
    v_key := entry->>'case_key';
    v_status := entry->>'case_status';
    v_nonce := entry->>'note_nonce';
    v_ciphertext := entry->>'note_ciphertext';
    v_mac := entry->>'note_mac';
    if v_tenant is distinct from 'lvpt-owner-pilot'
      or v_key is null or length(v_key)<1 or length(v_key)>160
      or v_status not in ('Needs verification','Investigating','Reviewed — no action','Candidate for reconciliation')
      or v_nonce is null or length(v_nonce)<10 or length(v_nonce)>80
      or v_ciphertext is null or length(v_ciphertext)<20 or length(v_ciphertext)>4000
      or v_mac is null or v_mac !~ '^[0-9a-f]{64}$'
      or entry->>'source_count' is null
      or (entry->>'source_count') !~ '^[0-9]{1,6}$'
    then raise exception 'Invalid review entry'; end if;
    v_count := (entry->>'source_count')::integer;
    if v_count<0 or v_count>100000 then raise exception 'Invalid review source count'; end if;

    insert into public.lvpt_sms_case_decisions
      (tenant_id,case_key,case_status,source_count,note_nonce,note_ciphertext,updated_at)
    values (v_tenant,v_key,v_status,v_count,v_nonce,v_ciphertext,now())
    on conflict (tenant_id,case_key) do update
    set case_status=excluded.case_status,
        source_count=excluded.source_count,
        note_nonce=excluded.note_nonce,
        note_ciphertext=excluded.note_ciphertext,
        updated_at=excluded.updated_at;

    insert into public.lvpt_sms_review_audit
      (tenant_id,case_key,submitted_status,source_count,note_mac)
    values (v_tenant,v_key,v_status,v_count,v_mac);
    record_count := record_count+1;
  end loop;
  return record_count;
end
$fn$;

revoke all on function public.lvpt_save_sms_decisions_with_audit(jsonb)
  from public,anon,authenticated;
grant execute on function public.lvpt_save_sms_decisions_with_audit(jsonb)
  to service_role;
