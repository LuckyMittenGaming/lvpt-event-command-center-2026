# Live source acceptance — R23 authoritative completeness comparison

Decision: **Hold production.** This file prepares the owner read-only comparison of authoritative Google Sheet tabs against the Command Center operating picture. It is **not** a live provider read and **not** LIVE_VERIFIED.

T38 / R23 preparation date: 2026-11-26. No Apps Script, Sheet, Gmail, Calendar, SMS, or Documents provider call was made for this update. No live writes were performed.

Dependencies: R22 authenticated staging on a verified preview host should pass before treating any live observation row below as current. Procedure prep does not require that R22 already passed; live fill-in does.

Authoritative workbook (identity only; do not paste cell values here):

- Google Sheet ID recorded in `AGENTS.md` / handoff: `1oHoVdD5CDcEreyRnB7cEvYfp6wWEgAmf04BwrktkMYs`
- Business mailbox: `book@pokertraininglasvegas.com`

---

## Status words for this file

| Status | Meaning |
| --- | --- |
| PROCEDURE_READY | Comparison method and exception classes are defined. Not a live pass. |
| PENDING_AUTHORIZED_READ | Live observation cells stay empty until the owner authorizes a current read-only session. |
| LOCAL_SYNTHETIC_PASS | Offline fixture / acceptance tests only. Never promotes to LIVE_VERIFIED. |
| LIVE_OBSERVED | Owner recorded a sanitized aggregate from an authorized current read. |
| LIVE_VERIFIED | Reserved. Not used until unexplained gaps are resolved and owner confirms. |
| BLOCKED_OWNER | Requires owner authorization or live evidence. |
| UNKNOWN | Coverage or mapping not established on this read. |

Live observation rows in this document remain **PENDING_AUTHORIZED_READ**. Do not invent counts from fixtures, CI, or historical Part A numbers.

---

## Historical counts are observations only

`remaining-spec.md` Part A recorded earlier authenticated-browser observations (for example: 45 events, 54 open tasks, 35 payments, 11 payouts, 886 stored Gmail Activity rows). Those figures are **historical observations**.

Rules:

1. Do not hardcode them as expected permanent values.
2. Do not fail acceptance because current live counts differ.
3. Do not rebaseline the sheet to make application totals match a past observation.
4. Acceptance compares **stable ID sets and coverage qualifications** on a dated read, not equality to Part A.

---

## Authorized sources and stable IDs

Read-only only. Prefer the owner-signed Command Center snapshot / operating picture on a verified host, or an owner-authorized Sheets values read of the same tabs. Never write the sheet, Calendar, Gmail, or Documents from this comparison.

| Sheet tab | Stable ID field(s) | Command Center surface | Notes |
| --- | --- | --- | --- |
| Events | `event_id` | Pipeline / Active / Past / workspace / operating picture events | One open record ↔ one validated `event_id`. No first-event fallback. |
| Tasks | `task_id` | Action Required / overview tasks / task lists | Sheet Tasks is authoritative. Open + completed copies of one `task_id` = conflict. |
| Payments | `payment_id` | Event Finance client/vendor rows | Same amounts with different `payment_id` stay distinct. Missing `payment_id` → exclude from totals / Incomplete. |
| Event Payouts | `payout_id` | Event Finance payout / owner-distribution rows | Vendor payouts link to vendor expenses only with an explicit validated same-event payment link. |
| Gmail Activity | Gmail `message_id` and/or `thread_id` as stored | Communications stored-activity vs unique-thread counts | Stored activity count ≠ unique thread count ≠ bounded header-scan count. |
| Documents | `document_id` (where the tab/index provides one) | Event workspace document count / Documents index | Missing IDs and private-access gaps stay UNKNOWN / Incomplete, not zero. |

Do not merge records by fuzzy company, contact, amount, title, date, or phone. Ambiguous associations require REVIEW, not automatic join.

---

## Comparison procedure (owner, read-only)

Perform after R22 on a verified signed-in host when possible, so the UI and sheet read share one authorized session. Stop at the first unexplained gap that cannot be classified below.

### 0. Preconditions

1. Record `observation_at` (ISO-8601 with timezone), host URL, candidate revision served, and reader identity role (owner). Do not record credentials or tokens.
2. Confirm the read is **read-only**. Abort if any write path would run.
3. Confirm R22 host mapping/protection if using the preview UI; otherwise note Sheets-direct read and keep UI reconciliation PENDING.

### 1. Extract ID sets (sanitized)

For each tab, build:

- `sheet_ids` — set of non-empty stable IDs from the authoritative tab
- `app_ids` — set of stable IDs present in the Command Center payload for that domain
- `blank_id_rows` — count of data rows with empty/missing stable ID (aggregate only)
- `duplicate_id_groups` — IDs appearing more than once (list **IDs only**, never titles/bodies/amounts)

Safe documentation may store:

- Aggregate counts (`|sheet_ids|`, `|app_ids|`, blank-row counts)
- Exception **identifiers** (`event_id` / `task_id` / `payment_id` / `payout_id` / `document_id` / Gmail message or thread id)
- Classification codes from the tables below

Never store: client names, emails, phones, message bodies, invoice line text, proposal tokens, or monetary amounts in this baseline.

### 2. Set comparison operators

For each domain:

| Check | Definition | Pass when |
| --- | --- | --- |
| Missing in app | `sheet_ids − app_ids` | Empty, or every ID has an explicit coverage qualification (below) |
| Extra in app | `app_ids − sheet_ids` | Empty, or every ID explained (stale cache / wrong source → fail) |
| Duplicate IDs | Same stable ID more than once with identical business fingerprint | Counted once; duplicates labeled `duplicate_copy` |
| Conflicting IDs | Same stable ID with conflicting fingerprint (status, event link, role, totals) | Excluded from totals; listed as `conflict_excluded`; totals Incomplete |
| Blank IDs | Data rows without stable ID | `missing_id_excluded`; never invent an ID; coverage UNKNOWN for those rows |

Fingerprint fields (read-only compare; do not paste values into docs):

- Events: `event_id` + status lane membership
- Tasks: `task_id` + open/completed/cancelled treatment
- Payments: `payment_id` + `event_id` + role + settlement + status/amount fields used by `event-finance.js`
- Event Payouts: `payout_id` + `event_id` + role + status + linked payment id
- Gmail Activity: message id and thread id presence; unique thread set size
- Documents: `document_id` + linked `event_id` when present

### 3. Coverage qualifications (allowed explanations)

An ID may be absent from one side only when the owner records one of:

| Code | Meaning |
| --- | --- |
| `FILTERED_VIEW` | Present in sheet; intentionally outside current UI filter (document the filter). |
| `HISTORICAL_ARCHIVE` | Explicit archive / closed lane; still must appear when that lane is queried. |
| `UNAUTHORIZED_DOCUMENT` | Documents tab/index exists but private file access was not authorized this session. |
| `PARTIAL_PROVIDER` | Bounded Gmail header scan or timed-out read; stored activity still compared separately. |
| `REVIEW_BACKLOG` | Tasks without valid due dates belong in review backlog, not dropped. |
| `UNEXPLAINED` | **Fail.** Must be resolved or escalated before LIVE_VERIFIED. |

Failed or timed-out reads must be labeled UNAVAILABLE / PARTIAL / TIMED OUT. Never convert a failed read into an empty successful set.

### 4. Finance-specific rules (Payments + Event Payouts)

1. Distinct invoices remain distinct when `payment_id` differs, even if amounts match.
2. Client receivables, vendor expenses, fees, tax, refunds, and owner distributions stay separate roles.
3. Payment Initiated is not owner-confirmed receipt; owner-confirmed receipt is not independent bank settlement.
4. Vendor payout may dedupe against a vendor expense only with an explicit validated same-event `linkedPaymentId` (or equivalent). Unlinked payouts stay visible.
5. Missing monetary fields are not zero. Totals with missing/conflict IDs are Incomplete.
6. Drawable cash stays unavailable from ledger-only evidence.
7. Do not adjust NIUM/NEO or other ledger exceptions automatically.

### 5. Gmail Activity rules

1. Compare stored Gmail Activity row IDs / message IDs separately from unique `thread_id` counts.
2. Do not treat unique thread count as equal to stored row count.
3. Do not treat a bounded header scan as a full mailbox.
4. Do not assign threads to events from the Communications page alone during this comparison unless an explicit stable event link exists.
5. Record `gmail_activity_read_at` separately from any header-scan timestamp.

### 6. Documents rules

1. Prefer `document_id` set comparison when the Documents tab/index exposes IDs.
2. If only per-event document counts exist, record count-level coverage as PARTIAL and list events whose counts disagree — using `event_id` only.
3. Missing private file bytes are not “zero documents.”

### 7. Observation timestamp block (fill only after authorized read)

| Field | Value |
| --- | --- |
| `observation_at` | PENDING_AUTHORIZED_READ |
| Reader | PENDING_AUTHORIZED_READ |
| Host / revision | PENDING_AUTHORIZED_READ |
| Sheet read method | PENDING_AUTHORIZED_READ |
| Writes performed | **none** (required) |

---

## Per-domain live observation log

All cells below stay pending until an authorized current evidence pass. Historical Part A numbers are shown only as non-binding prior observations.

| Domain | Stable ID | Prior observation (Part A, non-binding) | Live `\|sheet_ids\|` | Live `\|app_ids\|` | Missing / extra / duplicates | Coverage | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Events | `event_id` | 45 event records observed historically | — | — | — | — | PENDING_AUTHORIZED_READ |
| Tasks | `task_id` | 54 open tasks observed historically | — | — | — | — | PENDING_AUTHORIZED_READ |
| Payments | `payment_id` | 35 payment records observed historically | — | — | — | — | PENDING_AUTHORIZED_READ |
| Event Payouts | `payout_id` | 11 payout records observed historically | — | — | — | — | PENDING_AUTHORIZED_READ |
| Gmail Activity | message / thread id | 886 stored rows observed historically | — | — | — | — | PENDING_AUTHORIZED_READ |
| Documents | `document_id` | not fixed in Part A | — | — | — | — | PENDING_AUTHORIZED_READ |

Lane observations (also non-binding historically; live fill-in only): pipeline / active booked-or-payment-processing / past — compare by `event_id` membership, not by matching Part A lane counts (26 / 2 / 17).

---

## Exception register (IDs only)

When live evidence exists, append rows here. Until then the register is empty by design.

| Observed at | Domain | Exception ID | Class | Notes (no customer content) |
| --- | --- | --- | --- | --- |
| — | — | — | — | No live exceptions recorded this session |

Exception classes: `missing_in_app`, `extra_in_app`, `duplicate_copy`, `conflict_excluded`, `missing_id_excluded`, `unlinked_vendor_payout`, `partial_gmail_coverage`, `unauthorized_document`, `unexplained_gap`.

---

## Detection requirements (acceptance of this procedure)

This preparation is PROCEDURE_READY when all of the following are true:

1. **Missing IDs** — `sheet_ids − app_ids` and blank-ID rows are explicitly detected and classified.
2. **Duplicates / conflicts** — duplicate vs conflicting stable IDs are separated (`duplicate_copy` vs `conflict_excluded`).
3. **Unexplained coverage gaps** — anything not matching a coverage qualification code is `UNEXPLAINED` / fail.
4. **Distinct finance rows** — invoices and vendor expenses remain distinct by `payment_id`; payouts by `payout_id`.
5. **Timestamps** — live fills require `observation_at` (and Gmail read time when applicable).
6. **No live writes / no raw customer data** in this document.

Local prerequisite commands (synthetic only; not live completeness):

```powershell
node .\tests\command-center-acceptance.test.mjs
node .\tests\event-finance.test.cjs
Test-Path .\docs\baselines\live-source-acceptance.md
```

A green local run is **LOCAL_SYNTHETIC_PASS** only. It does **not** establish live data completeness.

---

## What was not done in T38

- No live Sheet, Apps Script, Gmail, Calendar, SMS, RCS, or Documents access.
- No clasp push, no Calendar writer, no customer send, no production deploy.
- No LIVE_VERIFIED claim.
- No rebaseline of business data.
- Alias mapping / deployment protection remain as recorded for R22 (UNKNOWN until owner confirms).

---

## Remaining blockers

- R22 authenticated staging remains BLOCKED_OWNER until owner signed-in preview evidence exists.
- R23 live fill-in remains BLOCKED_OWNER / PENDING_AUTHORIZED_READ until an authorized current read records sanitized aggregates and resolves `UNEXPLAINED` gaps.
- Forecast margin and drawable cash stay unavailable from ledger-only evidence.

Completion matrix: `docs/command-center-completion-matrix.md`.

COMMAND_CENTER_R23_LIVE_COMPARISON_PROCEDURE_READY
