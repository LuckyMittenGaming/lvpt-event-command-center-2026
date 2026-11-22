-- Applied to LVPT SMS Staging. Never stores email bodies, client names,
-- recipient addresses, thread IDs or message text in diagnostic logs.
alter table public.lvpt_staging_diagnostic_runs
  add column if not exists qualification_outcome text not null default 'not_checked';
alter table public.lvpt_staging_diagnostic_runs
  add constraint lvpt_staging_diagnostic_qualification_outcome_check
  check (qualification_outcome in
    ('not_checked','no_reply_suggested','possible_request','needs_review','vendor_only'));
alter table public.lvpt_staging_diagnostic_runs
  add column if not exists qualification_reason_code text not null default 'not_checked';
alter table public.lvpt_staging_diagnostic_runs
  add constraint lvpt_staging_diagnostic_qualification_reason_code_check
  check (qualification_reason_code in
    ('not_checked','acknowledgement','client_declined','client_reviewing',
     'explicit_request','history_incomplete','latest_message_incomplete',
     'vendor_operations','internal','lvpt_replied_last','unknown_sender',
     'empty_latest_body','chronology_unverified','ambiguous_latest_message'));
-- Read-only diagnostic classifications never create a draft or authorize
-- sending. They are advisory even if the outcome is 'possible_request'.
