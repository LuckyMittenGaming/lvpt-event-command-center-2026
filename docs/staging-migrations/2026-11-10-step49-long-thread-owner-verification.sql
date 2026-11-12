-- Step 49: explicit owner attestation required before any client draft is
-- prepared or approved, including selected conversations with >10 emails.
-- Applied to LVPT SMS Staging. No recipient or email body stored.
alter table public.lvpt_reply_review_audit
  add column if not exists owner_reviewed_full_thread boolean not null default false;
comment on column public.lvpt_reply_review_audit.owner_reviewed_full_thread is
  'Owner confirms original complete business Gmail thread plus CRM/event history were reviewed before a draft is requested.';
create index if not exists lvpt_reply_review_recent_authorized on
  public.lvpt_reply_review_audit(tenant_id,thread_id,recorded_at desc)
  where owner_reviewed_full_thread=true;
-- Note that the send preflight rejects approvals without this true flag.
