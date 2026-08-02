---
title: "meta-state-lifecycle-migration — Phase 1 progress report"
plan: plans/260802-0237-meta-state-lifecycle-migration/
date: 2026-08-02
phases_complete: [1]
phases_remaining: [2, 3, 4, 5, 6]
status: in-progress
---

# meta-state-lifecycle-migration — Phase 1 progress report

## Summary

**Phase 1 (`accepted` status + terminal-set harmonization) shipped.** All 6
terminal-set copies updated; `meta_state_accept` lifecycle tool landed with
`acceptEntry` core op; finding schema + manifests + sketches + wire budget
updated; broadened test suite green (2531 tests passing, 0 failed).

| Phase | Status | Notes |
|---|---|---|
| 1 — `accepted` status | Completed | TDD-driven; 13-test characterization suite + manifest arithmetic + wire budget + cold-tier + cli-set updates |
| 2 — `citation` substrate | Pending | Independent of Phase 1; touches registry substrate (read cache, RI, generic inverse map) |
| 3 — `superseded` collapse | Pending | Depends on 2; rewrites supersede handler + 6-finding migration |
| 4 — `origin` + `supersedes` migration | Pending | Depends on 2; sub-flip A (origin/promoted_to_rule) then sub-flip B (supersedes) |
| 5 — reopens writer drop | Pending | Depends on 4; field + read path retained, writers removed |
| 6 — docs + plumbing | Pending | Depends on 1–5; L2 doc rewrite + AGENTS + .gitattributes + registry-table.sh + runtime-agnostic audit |

## Phase 1 deliverables (verified)

- **6 terminal-set copies** all include `accepted` (characterization test green):
  - `core/constants.js` TERMINAL_STATUSES (with `archived`)
  - `core/meta-state.js` exported `TERMINAL_STATUSES` (no `archived`)
  - `core/derive-status.js` `TERMINAL_RAW_STATUSES`
  - `core/loop-introspect.js` `TERMINAL_STATUSES_FOR_DISPATCH` (now exported) + `CLOSED_STATUSES`
  - `core/operation-envelope.js` `CANONICAL_STATUS_KEYS` (5-key by_status)
  - `tools/handlers/meta-state-resolve-tool.js` local `TERMINAL_STATUSES`
- **Finding schema** accepts `status:"accepted"`; new `accepted_at`/`accepted_by`/`accepted_reason` stamps
- **`acceptEntry`** core op: true-append v+1, `assertinvariant`-wrapped, joins `MUTATION_OPS` for boundary-coverage regression guard
- **`meta_state_accept`** handler at `tools/handlers/meta-state-accept-tool.js`
- **Migration script** `tools/handlers/scripts/migrate-accepted-limitations.mjs` (dry-run default; scans `subtype` ending in `-accepted`)

## Test results

```
Test Files  272 passed | 1 skipped (273)
Tests  2531 passed | 1 skipped (2532)
```

Key new / updated tests:
- `core/__tests__/meta-state-accepted-status.test.js` (13 new) — six-way terminal-set agreement + acceptEntry contract
- `core/operation-envelope.test.js` — 5-key by_status fixture
- `core/__tests__/consistency-check.test.js` — green
- `__tests__/cli-mcp-subset-registration.test.js` — default surface 45 (44 + 1 for `meta_state_accept`)
- `__tests__/workflow-parity.test.cjs` — 45 mastra + 2 run + 3 ask = 50
- `__tests__/legacy-mcp/change-log-operation-envelope.test.js` — fixtures include `accepted:0`
- `__tests__/legacy-mcp/cold-tier-regression.test.js` — `terminalStatuses` includes `accepted`
- `__tests__/legacy-mcp/tool-deletion-coverage.test.js` — manifest 44
- `__tests__/cli-context-savings-script.test.js` — snapshot regen
- `__tests__/mcp-wire-budget.test.js` — ceiling raised to 53 KB

## Operator actions required before Phase 2

The migration of existing open accepted-limitation findings is operator-gated
(the plan explicitly defers the dry-run + apply to operator review). Run from
the repo root:

```bash
node tools/learning-loop-mastra/tools/handlers/scripts/migrate-accepted-limitations.mjs --dry-run
# review the candidate set, then:
node tools/learning-loop-mastra/tools/handlers/scripts/migrate-accepted-limitations.mjs --apply
```

If no open candidate surfaces (or after `--apply`), the lifecycle terminal
flips are complete. The new `meta_state_accept` tool is also available for
going-forward operator decisions (`meta_state_accept {id, accepted_reason}`).

## File-index baseline refresh

Phase 1 edits to `meta-state.js` invalidated 4 mechanism_check drift-stale
findings (`meta-260717T1004Z-…` + 3× `meta-260801T2348Z-…`). Re-running the
seed step regenerated the file-index baseline; cold-tier regression is green.

Going forward, anyone editing `meta-state.js` should re-run
`pnpm test` (the seed step is in the npm test script) so the file-index
baseline stays consistent with current bytes.

## Unblocked / deferred

Unblocked: the `recurrence-trigger-window` plan's P1–P3+P5 will revive
unchanged once Phases 2–5 land; its P4 (reopens linkage) dissolves with
Phase 5.

Deferred (out of scope, consistent with the plan): co-citation / emergent-
relationship layer on `evidence_code_ref`; cosmetic vocabulary unification
(open/accepted/resolved vs active/inactive); a free `meta_state_cite` tool.

## Unresolved questions

None for Phase 1. Phases 2–6 each have their own characterization + open
questions to address in their respective passes.