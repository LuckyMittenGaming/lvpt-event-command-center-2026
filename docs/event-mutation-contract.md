# Event mutation contract (isolated)

Status: **Isolated development only** (R09)  
Production editing remains disabled. Activation is a separate owner decision (R28).

## Purpose

Define a granular, conflict-aware mutation contract for LVPT event records so future editing can proceed without bulk snapshot replacement (`saveAllEvents` / full `events[]` rewrite).

This package is a pure library plus a synthetic in-memory adapter. It does **not**:

- Call Apps Script, Sheets, Calendar, Gmail, or SMS providers
- Wire production API routes
- Enable UI save controls
- Deploy or propose live Apps Script changes

## Inspected baseline and POST gate

| Surface | Observation |
| --- | --- |
| `public/v2/js/core.js` | `saveEvents` is a read-only toast; no sheet write |
| `public/v2/js/wizard.js` | Local create/update shapes fields, then calls `saveEvents` (still non-writing in preview) |
| `public/v2/js/central-sync.js` | Cloud save path exists historically; document mutations gated off |
| `app/api/sync/events/route.ts` GET | Read-only (`writesPerformed: false`) after `denyPrivateRead` |
| `app/api/sync/events/route.ts` POST | Auth primitive unchanged (`authorizeAppRequest` → 401). After auth, bulk snapshot writes are hard-disabled: **403** `reason: bulk_event_mutation_disabled`, `writesPerformed: false`. Apps Script is **not** invoked. This contract is **not** wired into the route. |
| Apps Script backend | Legacy `saveAllEvents` can rewrite multiple tabs; financial ledgers already protected from bulk rewrite. The HTTP route no longer calls that action. |

### Authenticated bulk POST proof

Regression in `tests/event-mutation-contract.test.mjs` loads the route with a mocked provider. A request carrying a valid sync key and an `events[]` bulk body must:

1. Pass `authorizeAppRequest`
2. Return 403 `bulk_event_mutation_disabled`
3. Leave `appsScriptRequest` call count at zero

## Supported operations

Stable operation ids from `lib/event-mutation-contract.mjs`:

| Operation | Intent |
| --- | --- |
| `create_event` | Create one event with a caller-supplied stable `eventId` |
| `update_event_fields` | Patch allowlisted scalar event fields |
| `update_event_status` | Set status from the allowlisted LVPT status list |
| `upsert_quote_line` | Add or update one quote line by `quoteLineId` on one event |
| `complete_task` / `reopen_task` | Toggle one task by `taskId` on one event |
| `link_proposal` | Set validated `proposalUrl` / `proposalId` / `proposalStatus` |
| `record_follow_up` | Record follow-up metadata and append a follow-up audit row |
| `update_post_event` | Patch allowlisted post-event fields |

## Required request envelope

Every mutation must include:

- `operation` — one of the supported operations
- `auth.authorized === true` and non-empty `auth.actor`
- `idempotencyKey` — stable key; replays return the prior result without duplicating records
- `eventId` — required for all operations except create (create uses `payload.eventId`)
- `expectedRevision` — integer matching the current event revision (create starts at revision `1`)
- `payload` — only allowlisted fields for that operation

Rejected shapes:

- Unauthorized / missing actor
- Unknown fields
- Unknown or invalid status values
- Stale `expectedRevision`
- Cross-event task or quote line ownership
- Bulk keys: `events`, `snapshot`, `bulk`, `allEvents`, `replaceAll`
- `forceProductionWrite: true` while production editing is disabled

## Synthetic adapter guarantees

`createSyntheticMutationStore(seedEvents)` provides:

1. **Stable IDs** — events, quote lines, tasks, follow-ups, and audit rows keep explicit ids
2. **Revisions** — successful writes increment `revision` by one
3. **Idempotency** — identical `idempotencyKey` does not create duplicate entities
4. **Audit** — each successful write appends an audit record (actor, operation, event id, revisions, key)
5. **Atomic failure** — on failure (including armed synthetic faults), unrelated events/fields and prior audit history are restored; no partial write remains
6. **No bulk snapshot replacement** — `bulkSnapshotReplacementSupported` is always false

## Production controls

```text
PRODUCTION_MUTATIONS_ENABLED = false
```

Completion matrix row **Event writes | DISABLED** remains authoritative for the live UI and release posture. This contract does not change that row.

## Out of scope until R28 / owner approval

- Wiring this granular contract into `POST /api/sync/events`
- Re-enabling any sheet mutation from the Vercel route
- Calendar reminder writes (still only `runLVPTSafeTaskSync`)
- Automatic client Gmail/SMS send
- Live canary records or Apps Script deployment

## Verification

```powershell
node .\tests\event-mutation-contract.test.mjs
node .\tests\command-center-acceptance.test.mjs
```

Or the targeted verifier:

```powershell
powershell.exe -NoProfile -File .\scripts\verify-command-center.ps1 -Mode Targeted -TestFiles tests/event-mutation-contract.test.mjs,tests/command-center-acceptance.test.mjs
```
