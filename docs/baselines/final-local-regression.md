# Final local regression — R21 / T35

Updated: 2026-11-26 21:22 -05:00  
Status: **IMPLEMENTED_TESTED** (local synthetic only — not LIVE_VERIFIED)

Companion: `docs/baselines/local-completion-progress.md`  
Policy: `AGENTS.md`, `remaining-spec.md` R21

---

## Scope

One consolidated synthetic operational lifecycle was added to the existing
acceptance and browser harnesses. All prior assertions were retained.

No production credentials, provider mutations, customer sends, Calendar
writes, clasp push, git commit/push, or live Sheet writes were used.

---

## Lifecycle path covered

1. Form / Gmail / authorized SMS lead evidence  
2. Stable event association  
3. Source attribution  
4. Qualification  
5. Task  
6. One isolated internal reminder (Free / 15 minutes / no Meet / no guests)  
7. Proposal  
8. Approval workflow  
9. Controlled mock provider result  
10. Multiple client invoices  
11. Vendor obligations  
12. Payout  
13. Event outcome  
14. Post-event obligations  
15. Report and reconciliation  

---

## Failure contracts (deterministic)

| Condition | Where asserted |
| --- | --- |
| Duplicate / conflicting source event | acceptance + browser action conflicts |
| Conflicting event ID | acceptance inbox exclusions |
| Conflicting payment ID | acceptance ledger incomplete coverage |
| Expired session | acceptance `privateReadDecision` + browser unauthorized clear |
| Delayed network response | acceptance null/loading money + browser delay-ledger |
| Provider timeout | acceptance mock timeout + browser AbortSignal-bounded settle |
| Unknown send result | acceptance uncertain send (not treated as success) |
| Incorrect / unverified recipient | acceptance recipient mismatch + browser action evidence |
| Invalid task ID | acceptance reminder REVIEW + browser `lvptOpenTask` |
| Missing quote cost | acceptance `quoteCoverage` + browser pipeline |
| Missing heartbeat | acceptance bridge/stored classifiers + browser health badges |

Mock success is asserted separately and cannot substitute for any failure
contract above.

---

## Ten views + selected-record

Desktop (1280) and mobile (375) both cycle:

`overview`, `action`, `pipeline`, `active`, `archive`, `proposals`,
`followup`, `finance`, `communications`, `health`

Selected-record open/close for `evt-lead` and `evt-active` proves
cross-event isolation (`$111` vs `$222`).

---

## Verification commands run for T35

```powershell
node .\tests\command-center-acceptance.test.mjs
# exit 0

node .\tests\command-center-browser.test.mjs
# exit 0

powershell.exe -NoProfile -File .\scripts\verify-command-center.ps1 `
  -Mode Targeted `
  -TestFiles tests/command-center-acceptance.test.mjs,tests/command-center-browser.test.mjs
```

R21 Full-suite gate (syntax, CI regressions, local-phase, staging-safety,
tsc, build) remains available via:

```powershell
powershell.exe -NoProfile -File .\scripts\verify-command-center.ps1 -Mode Full
```

---

## Explicit non-claims

- Not LIVE_VERIFIED  
- Not authenticated staging browser acceptance (R22)  
- Not live Gmail / SMS / RCS / Calendar execution proof  
- Production remains HOLD  

---

## Files changed for this task

- `tests/command-center-acceptance.test.mjs`  
- `tests/command-center-browser.test.mjs`  
- `scripts/verify-command-center.ps1`  
- `docs/baselines/final-local-regression.md` (this file)  
- `docs/baselines/local-completion-progress.md`  
