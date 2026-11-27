# Event editing release plan — R28 capability-specific activation

Decision: **Hold production writes.** This file prepares the owner-approved activation plan for controlled, granular event editing after the isolated mutation contract (R09). It is **not** LIVE_VERIFIED, **not** permission to enable UI save controls, **not** permission to clasp push / deploy Apps Script, and **not** permission to mutate Sheets, Drive, or Calendar.

T43 / R28 preparation date: 2026-11-26. No production write path was wired, no Apps Script deployment was performed, and no live canary record was created for this update.

Dependencies: R09 (isolated contract), R22 (authenticated staging), R23 (authoritative completeness). Live activation additionally requires explicit owner approval per capability below.

Companion contract: `docs/event-mutation-contract.md`  
Isolated library: `lib/event-mutation-contract.mjs`  
Regression: `tests/event-mutation-contract.test.mjs`

---

## Status words for this file

| Status | Meaning |
| --- | --- |
| PROCEDURE_READY | Activation plan and gates are defined. Not a live pass. |
| LOCAL_SYNTHETIC_PASS | Isolated contract / route gate tests only. Never promotes to LIVE_VERIFIED. |
| CONTRACT_PRESENT | Operation exists in `lib/event-mutation-contract.mjs` with synthetic coverage. |
| CONTRACT_MISSING | No granular isolated operation yet; must remain DISABLED until a proposed contract exists and is tested. |
| BACKEND_GAP | Live Apps Script / HTTP surface does not yet implement a matching single-record writer. |
| PENDING_OWNER_APPROVAL | Capability stays off until written owner approval for that capability alone. |
| DISABLED | Production write remains off. |
| LIVE_VERIFIED | Reserved. Not used until owner approval, isolated canary proof, audit proof, and rollback rehearsal succeed for that capability. |

Production Event writes remain **DISABLED** in `docs/command-center-completion-matrix.md` until each capability below clears its own approval and rollback gates.

---

## Hard boundaries (do not cross during prep or activation)

1. **No bulk overwrite.** Do not re-enable `saveAllEvents` / full `events[]` snapshot replacement from `POST /api/sync/events`. Authenticated bulk POST already returns 403 `bulk_event_mutation_disabled` with `writesPerformed: false` and zero Apps Script calls.
2. **No implicit schema deployment.** Do not add or rewrite Sheets columns, tabs, or Apps Script deployables as a side effect of enabling a UI control. Any sheet/schema change is a separate owner-approved proposed change under `apps-script/proposed/` (create only when an actual remaining task requires it). Never edit `apps-script/live/**` in place.
3. **Capability isolation.** Approving one write capability does **not** approve another. Each capability has its own approval reference, canary record, audit check, and rollback.
4. **Stable IDs only.** Mutations must target `event_id`, `task_id`, `quote_item_id` / `quoteLineId`, `document_id`, and explicit follow-up ids. Never fuzzy-merge by company, contact, amount, title, date, or phone.
5. **Conflict handling.** Every live writer must honor `expectedRevision` (mapped from sheet `record_version` / `_serverVersion`). Stale revision → reject with no write. Traceable to synthetic `STALE_REVISION` coverage in `tests/event-mutation-contract.test.mjs`.
6. **Audit required.** Every successful write appends actor, operation, stable id, before/after revision, and idempotency key (Change Log append and/or dedicated audit row). Traceable to synthetic audit assertions in the same test.
7. **Financial ledgers stay separate.** Payments and Event Payouts must never be rewritten by event editing. Legacy `lvptSaveAllEvents_` already refuses Payment/Event Payout bulk rewrite; granular writers must preserve that separation.
8. **Calendar remains sole-writer.** Completing or reopening a sheet task must **not** create/update/delete Calendar reminders. Only `runLVPTSafeTaskSync` may write internal reminders (R27).
9. **No automatic client Gmail/SMS.** Editing activation is unrelated to approval send (R24/R29).
10. **Read-only production preserved until approval.** UI save / mark-complete / upload / delete controls stay off (`saveEvents` read-only toast; lifecycle workspace has no Save/Delete/Mark Complete; `documentMutationsEnabled()` returns `false`).

---

## Inspected production posture (read-only)

| Surface | Inspected observation | Activation impact |
| --- | --- | --- |
| `POST /api/sync/events` | After `authorizeAppRequest`, returns 403 `bulk_event_mutation_disabled`; does **not** call `appsScriptRequest` / `saveAllEvents`; granular contract **not** imported | Keep bulk gate. Future granular wiring is a separate proposed route change per capability flag. |
| `GET /api/sync/events` | Read-only `listEvents` after `denyPrivateRead`; `writesPerformed: false` | Unchanged. |
| `lib/event-mutation-contract.mjs` | Synthetic ops: create, field/status update, quote upsert, task complete/reopen, proposal link, follow-up, post-event. `PRODUCTION_MUTATIONS_ENABLED = false` | Source of truth for envelope until live adapters exist. |
| `public/v2/js/core.js` | `saveEvents` is a read-only toast | Must stay non-writing until capability flags are explicitly approved. |
| `public/v2/js/documents.js` | `documentMutationsEnabled()` hard-false; association display uses `validateDocumentSourceUrl` / `resolveDocumentSourceUrl` | Document **association** mutation contract is **missing**; upload/delete UI stays off. |
| `POST`/`DELETE` `/api/sync/documents` | Still authorize via sync key and can call Apps Script `uploadDocument` / `deleteDocument` | **Risk surface.** UI is gated off, but route is not hard-disabled like events POST. Document activation must either hard-disable the route until approved **or** require an owner-approved route gate before any canary. |
| Apps Script `lvptSaveAllEvents_` (live export, read-only inspect) | Full-sheet rewrite of Events, Quote Items, Tasks, Staff, Compliance, Documents, Gmail Activity, Post Event; appends Change Log; protects Payments / Event Payouts | **Must not be re-enabled** as the Command Center write path. Granular single-row / single-id writers are required. |
| Apps Script `record_version` | Events sheet uses `record_version`; list maps to `_serverVersion` | Live adapter must map contract `expectedRevision` ↔ `record_version`. Synthetic field name `revision` is the contract alias. |
| Proposal metadata | `proposal_url` is a first-class Events column; `proposalId` / `proposalStatus` currently survive mainly via `event_json` blob | Linking activation must document how proposalId/status persist without bulk `event_json` rewrite of unrelated fields. |
| Document associations | Documents tab uses `document_id` + `event_id`; no isolated `associate_document` / `disassociate_document` op in the mutation library | Explicit **CONTRACT_MISSING** — stay DISABLED. |

Auth primitive for app sync mutations: `x-lvpt-sync-key` via `authorizeAppRequest` (`app/api/sync/_lib.ts`). Private reads additionally require the signed HttpOnly owner-review session (`denyPrivateRead`). Activation must not weaken either gate.

---

## Shared activation prerequisites (all capabilities)

Before **any** capability can leave DISABLED:

| Gate | Requirement | Evidence |
| --- | --- | --- |
| R09 contract | Isolated ops + bulk rejection + revision/idempotency/audit/atomic rollback | `tests/event-mutation-contract.test.mjs` → LOCAL_SYNTHETIC_PASS |
| Bulk POST gate | Authenticated `events[]` body → 403, zero Apps Script calls | Same test route harness |
| R22 | Owner signed-in staging acceptance on a verified host | `docs/command-center-staging-acceptance.md` |
| R23 | Authoritative completeness comparison (stable ID sets) | `docs/baselines/live-source-acceptance.md` |
| Per-capability owner approval | Written approval naming the capability id below | Owner decision record (not this prep) |
| Proposed backend | Granular Apps Script action (not `saveAllEvents`) prepared under proposed/, reviewed, and separately authorized for clasp/deploy | BACKEND_GAP until exists |
| Canary record | One owner-designated synthetic/test `event_id` (or child id) that is not a live client booking | Owner-supplied canary id |
| Rollback rehearsal | Documented reverse mutation or restore step for that capability, proven on canary before broader use | Owner-filled evidence |
| Matrix update | Capability row moves only after canary + audit + rollback proof | `docs/command-center-completion-matrix.md` |

Failure of any shared gate keeps **all** capabilities DISABLED.

---

## Capability catalog

Each capability below is independently scoped. Status today: all **DISABLED** / **PENDING_OWNER_APPROVAL**.

### CAP-01 — Event creation

| Field | Plan |
| --- | --- |
| Contract op | `create_event` — **CONTRACT_PRESENT** |
| Intent | Create one event with caller-supplied stable `eventId` |
| Inspected backend today | No granular create action. Legacy path only via full `saveAllEvents` rewrite of Events (+ dependent tabs). HTTP POST bulk disabled. |
| Permissions | Authorized owner sync key + authenticated private session for UI; actor identity required |
| Required proposed changes | (1) Apps Script single-row Events insert keyed by `event_id` without rewriting other events/tabs. (2) Route wiring for one granular POST body (not `events[]`). (3) Map revision start = `record_version` 1. (4) Change Log append for create only. (5) UI create control behind CAP-01 flag only. |
| Canary | Create canary `event_id` (prefix `canary-` or owner-chosen). Verify one Events row; Quote/Tasks/Documents/Gmail/Post Event sheets unchanged except empty/default rows explicitly owned by that id. |
| Revisions / conflicts | Duplicate `event_id` rejected (`DUPLICATE_EVENT_ID`). Idempotent replay of same `idempotencyKey` must not create a second row. |
| Audit | Actor, operation `create_event`, event id, beforeRevision 0 → afterRevision 1, idempotency key |
| Rollback | Delete or archive **only** the canary `event_id` row(s) via an owner-approved reverse procedure; never wipe Events sheet |
| Approval gate | Separate owner approval for CAP-01 |
| Trace to tests | Create + idempotent replay + unauthorized reject in `tests/event-mutation-contract.test.mjs` |

### CAP-02 — Event field / status editing

| Field | Plan |
| --- | --- |
| Contract ops | `update_event_fields`, `update_event_status` — **CONTRACT_PRESENT** |
| Intent | Patch allowlisted scalar fields or set allowlisted LVPT status on one `event_id` |
| Inspected backend today | Events columns exist; status allowlist mirrored in contract. No single-row patch writer. Bulk `lvptWriteEventsSheet_` rewrites entire Events tab — forbidden. |
| Permissions | Same as CAP-01; unknown fields rejected |
| Required proposed changes | Single-event Events row patch (allowlisted columns only). Status allowlist enforced server-side. `expectedRevision` must equal current `record_version`; success increments `record_version`. Do not rewrite Quote Items / Tasks / Documents / Gmail / Post Event as a side effect. |
| Canary | Patch one non-client-critical field on canary event (e.g. `knownRisks` note), then status transition within allowlist. Confirm unrelated events’ `record_version` unchanged. |
| Revisions / conflicts | Stale `expectedRevision` → no write (`STALE_REVISION`). Cross-event contamination forbidden. |
| Audit | Changed field names or new status; before/after revision |
| Rollback | Re-apply prior allowlisted values with new revision, or restore canary row from pre-canary backup of **that row only** |
| Approval gate | Separate owner approval for CAP-02 (may approve fields and status together or as CAP-02a/CAP-02b) |
| Trace to tests | Field update, status update, unknown field, invalid status, stale revision, unrelated event preserved |

### CAP-03 — Task complete / reopen

| Field | Plan |
| --- | --- |
| Contract ops | `complete_task`, `reopen_task` — **CONTRACT_PRESENT** |
| Intent | Toggle one Tasks-sheet row by stable `task_id` on one `event_id` |
| Inspected backend today | Tasks tab authoritative by `task_id`. Legacy `lvptWriteTasksSheet_` rewrites entire Tasks sheet from embedded event arrays — forbidden. Calendar reminder writer is separate (`runLVPTSafeTaskSync`). |
| Permissions | Owner sync + actor; task must belong to the request `event_id` |
| Required proposed changes | Single-row Tasks status/`completed_at` patch by `task_id` + `event_id`. Reject cross-event task ownership. **Do not** call Calendar APIs. Completing a task does not close payments, payouts, or post-event obligations. |
| Canary | Complete then reopen one canary `task_id`. Confirm Reminder History / Calendar unchanged during CAP-03 canary (Calendar cycles remain R27). |
| Revisions / conflicts | Event revision bump on parent event **or** explicit task-row versioning documented before activation; stale parent revision rejected if parent-revision model is chosen. Cross-event task id → `CROSS_EVENT`. |
| Audit | task id, new status, actor, revisions |
| Rollback | Reopen completed canary task (or restore prior status) with audit |
| Approval gate | Separate owner approval for CAP-03 |
| Trace to tests | complete/reopen happy path + cross-event task rejection |

### CAP-04 — Follow-up updates

| Field | Plan |
| --- | --- |
| Contract op | `record_follow_up` — **CONTRACT_PRESENT** |
| Intent | Record next action / due / follow-up date / notes; append follow-up audit row with stable `followUpId` |
| Inspected backend today | `next_action` / `next_action_due` live on Events columns. Follow-up history array is not a first-class sheet tab (synthetic `followUps[]` only). Post Event `follow_up_date` / `notes` exist. |
| Permissions | Owner sync + actor |
| Required proposed changes | Patch Events next-action columns for one `event_id`; optionally patch Post Event follow-up fields for that id only. If follow-up history must persist, propose an explicit Follow-Ups tab or Change Log detail — **do not** silently expand schema without owner approval. Missing history store remains explicit. |
| Canary | Set next action on canary event; confirm only that `event_id` changes |
| Revisions / conflicts | `expectedRevision` on event; idempotent `followUpId` + key |
| Audit | followUpId + summary |
| Rollback | Clear/restore canary next-action fields via reverse patch |
| Approval gate | Separate owner approval for CAP-04 |
| Trace to tests | `record_follow_up` updates nextAction + followUps entry without touching unrelated event |

### CAP-05 — Quote updates

| Field | Plan |
| --- | --- |
| Contract op | `upsert_quote_line` — **CONTRACT_PRESENT** |
| Intent | Add or update one quote line by `quoteLineId` / `quote_item_id` on one event |
| Inspected backend today | Quote Items tab keyed by `quote_item_id` + `event_id`. Legacy writer rebuilds entire Quote Items sheet — forbidden. Target quote on setup is **not** a quote line and must not be summed into priced lines. |
| Permissions | Owner sync + actor; monetary nulls stay null (missing ≠ zero) |
| Required proposed changes | Single-row Quote Items upsert by `quote_item_id` constrained to `event_id`. Reject moving a line owned by another event. Do not touch Payments / Event Payouts. Do not invent internal cost = 0 when missing. |
| Canary | Upsert one canary quote line amount; confirm other events’ quote rows unchanged; payment ledger unchanged |
| Revisions / conflicts | Parent event revision; cross-event quote ownership → `CROSS_EVENT` |
| Audit | quoteLineId + before/after revision |
| Rollback | Delete canary line or restore prior unit price/cost for that `quote_item_id` only |
| Approval gate | Separate owner approval for CAP-05 |
| Trace to tests | upsert existing + add line + cross-event reject + idempotent replay |

### CAP-06 — Proposal linking

| Field | Plan |
| --- | --- |
| Contract op | `link_proposal` — **CONTRACT_PRESENT** |
| Intent | Set validated https `proposalUrl` / `proposalId` / `proposalStatus` on one event |
| Inspected backend today | `proposal_url` column on Events. `proposalId` / `proposalStatus` currently rehydrated from `event_json` blob on list. UI historically wrote proposal URL through `saveEvents` (now read-only toast). |
| Permissions | Owner sync + actor; URL must be https without credentials (same rules as `validateProposalUrl`) |
| Required proposed changes | Patch `proposal_url` (and, if approved, dedicated columns or a narrowly scoped JSON merge for proposalId/status **without** replacing unrelated `event_json` state). Reject http / credentialed URLs. |
| Canary | Link a non-customer https canary URL on canary event; confirm open-link behavior; invalid URL rejected |
| Revisions / conflicts | `expectedRevision`; invalid URL → no write |
| Audit | proposal fields changed |
| Rollback | Clear canary proposal fields |
| Approval gate | Separate owner approval for CAP-06 |
| Trace to tests | valid https link + http reject |

### CAP-07 — Document associations

| Field | Plan |
| --- | --- |
| Contract op | **CONTRACT_MISSING** — no `associate_document` / `disassociate_document` / metadata-only link op in `lib/event-mutation-contract.mjs` |
| Intent (future) | Associate an existing `document_id` to an `event_id`, or update association metadata, without bulk Documents sheet rewrite and without implying byte upload |
| Inspected backend today | Read path: event-scoped associations via Documents tab + URL validation. Write UI: `documentMutationsEnabled()` false. Drive upload/delete: Apps Script `uploadDocument` / `deleteDocument` reachable from `/api/sync/documents` if sync key present — **not** a granular association contract. Legacy `lvptWriteDocumentsSheet_` rewrites entire Documents tab — forbidden. |
| Permissions | N/A until contract exists; then owner sync + actor; private bytes remain non-public |
| Required proposed changes | (1) Define isolated document association operation + synthetic tests (stable `document_id`, `event_id`, revision/audit/idempotency). (2) Hard-disable or capability-flag `POST`/`DELETE` `/api/sync/documents` until CAP-07/CAP-07-upload explicitly approved. (3) Single-row Documents upsert/patch — never full-sheet rewrite. (4) Upload and trash remain separate sub-capabilities with their own approvals if ever enabled. |
| Canary | Only after CONTRACT_PRESENT: associate metadata for a canary `document_id` to canary `event_id`; no client file bytes in fixtures |
| Revisions / conflicts | Cross-event document move rejected; missing document_id rejected |
| Audit | document_id + event_id + actor |
| Rollback | Remove canary association row only; never trash unrelated Drive files |
| Approval gate | Blocked until contract + tests exist; then separate owner approval |
| Trace to tests | Today: acceptance asserts `documentMutationsEnabled` false and browser asserts no documents POST. Association mutation tests **do not exist yet** — remain explicit. |

### CAP-08 — Post-event updates

| Field | Plan |
| --- | --- |
| Contract op | `update_post_event` — **CONTRACT_PRESENT** |
| Intent | Patch allowlisted Post Event fields for one `event_id` |
| Inspected backend today | Post Event sheet keyed by `event_id`. Legacy `lvptWritePostEventSheet_` rewrites entire Post Event sheet — forbidden. Past event date does not imply completion of tasks/payments. |
| Permissions | Owner sync + actor |
| Required proposed changes | Single-row Post Event upsert/patch by `event_id` for allowlisted fields only. Do not auto-close tasks or mark payments received. |
| Canary | Set one post-event note / thankYouSent on canary; confirm other events’ post-event rows unchanged |
| Revisions / conflicts | `expectedRevision` on parent event |
| Audit | changed post-event fields |
| Rollback | Restore prior post-event field values for canary `event_id` |
| Approval gate | Separate owner approval for CAP-08 |
| Trace to tests | `update_post_event` changes thankYouSent/rebookingLikelihood while preserving unrelated event notes |

---

## Isolated canary strategy (shared pattern)

1. Owner designates a **canary `event_id`** that is not an active client booking and is labeled clearly in the sheet (or a dedicated canary company name).
2. Activate **one** capability flag only.
3. Perform the minimum successful mutation for that capability.
4. Verify:
   - Exactly the intended stable id changed
   - Unrelated events / quote lines / tasks / documents / post-event rows unchanged
   - Payments and Event Payouts row counts and ids unchanged
   - Audit / Change Log contains one matching row
   - Idempotent replay of the same key does not duplicate
   - Stale revision probe still rejects
5. Execute the capability’s rollback step on the same canary.
6. Only then consider expanding beyond canary — still under that capability’s approval scope.
7. Never run parallel canaries that obscure which capability caused a write.

Synthetic fixtures in `tests/event-mutation-contract.test.mjs` (`evt-a` / `evt-b`) are **LOCAL_SYNTHETIC_PASS** only and are not live canaries.

---

## Rollback matrix (per capability)

| Capability | Immediate disable | Data rollback | Forbidden rollback actions |
| --- | --- | --- | --- |
| CAP-01 Create | Turn off CAP-01 flag / route allowlist | Remove only canary `event_id` (+ owned child rows) | Truncate Events; restore from full browser snapshot |
| CAP-02 Edit | Disable field/status writers | Reverse patch canary fields | `saveAllEvents` full rewrite |
| CAP-03 Task | Disable complete/reopen | Reopen or restore canary `task_id` | Calendar deletes; TaskSync from Cursor |
| CAP-04 Follow-up | Disable follow-up writer | Restore next-action fields | Creating Calendar follow-up events |
| CAP-05 Quote | Disable quote upsert | Restore/delete canary `quote_item_id` | Payment ledger edits |
| CAP-06 Proposal | Disable link_proposal | Clear canary proposal fields | Inventing URLs |
| CAP-07 Documents | Keep mutations off; hard-disable upload/delete routes if needed | Remove canary association only | Drive trash of non-canary files; full Documents rewrite |
| CAP-08 Post-event | Disable post-event writer | Restore canary Post Event row fields | Auto-closing tasks/payments |

Global emergency rollback: keep `PRODUCTION_MUTATIONS_ENABLED = false`, keep events POST bulk 403, keep UI controls off, and do not deploy Apps Script writers. Production remains on its current release (no merge required to stay read-only).

---

## Missing contracts (explicit)

| Gap | Why it matters | Until resolved |
| --- | --- | --- |
| Document association granular op | CAP-07 cannot activate safely | DISABLED / CONTRACT_MISSING |
| Live single-row Apps Script writers for CAP-01–06, CAP-08 | Synthetic contract is not a provider adapter | BACKEND_GAP; no clasp push |
| Route hard-disable for `/api/sync/documents` | Sync-key holders could still hit upload/delete if UI gate bypassed | Treat as activation prerequisite for any document write |
| Dedicated Follow-Ups persistence tab | Synthetic `followUps[]` has no inspected first-class sheet | CAP-04 may limit to Events next-action columns unless owner approves schema |
| `proposalId` / `proposalStatus` first-class columns | Survive via `event_json` today | CAP-06 must define non-bulk persistence |
| Staff / Compliance / Gmail Activity granular edits | Not in R28 capability list | Remain out of scope; legacy full-sheet writers stay unused by Command Center |
| Financial payment/payout edits | Separate approved financial workflow only | Never part of event-editing activation |

---

## Owner approval checklist (activation — not this prep)

Do **not** treat this preparation document as approval. For each capability the owner intends to enable:

- [ ] Shared prerequisites (R09/R22/R23 + bulk gate) confirmed
- [ ] Capability id named (CAP-01 … CAP-08)
- [ ] Proposed backend reviewed (no `saveAllEvents`)
- [ ] Canary `event_id` / child id designated
- [ ] Success mutation observed and audited
- [ ] Rollback rehearsed on canary
- [ ] Payments / Event Payouts unchanged
- [ ] Calendar untouched (especially CAP-03)
- [ ] Matrix row updated only for that capability
- [ ] Written approval reference recorded

Until those boxes are filled by the owner, production editing remains **DISABLED**.

---

## Verification (preparation only)

```powershell
node .\tests\event-mutation-contract.test.mjs
if ($LASTEXITCODE -ne 0) { throw 'Mutation contract regression failed' }
npm.cmd run test:staging-safety
Test-Path .\docs\event-editing-release-plan.md
```

A green run proves LOCAL_SYNTHETIC_PASS + documentation presence. It does **not** enable writes.

Marker: `COMMAND_CENTER_R28_EDITING_ACTIVATION_PLAN_READY`
