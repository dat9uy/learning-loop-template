---
phase: 5
title: "Reconcile L3 docs + resolve finding"
status: pending
priority: P2
effort: "0.5d"
dependencies: [4]
---

# Phase 5: Reconcile L3 docs + resolve finding

## Overview
Close the loop: replace the L3 "Durability drift (planned reconciliation)" note with the reconciled mechanism, document the `runtime_state_read` behavior change, and resolve the Phase-1 finding with evidence. **Red-team #8 moved the gate-verb-allowance incantation `durability:"ephemeral"` edit to Phase 2** (it must ship with the symmetric guard), so this phase no longer touches the hint/block message — only docs + finding resolution + change-log.

## Requirements
- Functional: `docs/architecture.md` § Runtime-State Sidecar describes the committed + local substrates and the merge read, with no remaining "drift" note; `docs/runtime-contract.md` § row kinds points to the reconciled mechanism (not a drift); the docs state that `runtime_state_read` returns both substrates (red-team #13); the Phase-1 finding is `resolved` with evidence (migration + tests green).
- Non-functional: a `change-log` entry records the durability-split design change; docs stay free of dates/PR numbers/phase labels (evergreen).

## Architecture
- **L3 docs** (`docs/architecture.md`): replace the "Durability drift (planned reconciliation)" paragraph (added this session) with a "Durability split" paragraph naming the two substrates, the write-split (by `durability`, namespace-guarded), the destination-scoped version scan, the read-merge (`readRuntimeObservations`), the per-substrate malformed handling, the 3-layer protection, and the gitignore. Keep it mechanism-level (L3), pointing to L1/L2 for the contract.
- **L2 docs** (`docs/runtime-contract.md`): update the "Durability contract" paragraph's tail (currently "the known drift where the current wiring commits all rows to one file — is in `docs/architecture.md` § Runtime-State Sidecar") to "the mechanism realizing this is in `docs/architecture.md` § Runtime-State Sidecar" — drop the drift framing now that it is reconciled. Add the namespace↔durability guard as a contract consequence (`gate-verb:*` ⟺ ephemeral).
- **`runtime_state_read` behavior change (red-team #13):** document (in `docs/architecture.md` and/or the tool description) that `runtime_state_read` returns the union of both substrates — an operator inspecting committed durable history will also see session-local ephemeral `gate-verb:*` rows that vanish on fresh clone. No new `durability` filter is added (KISS — the merge is the point); the behavior is documented, not hidden behind a "transparent" claim.
- **Finding resolution**: `meta_state_resolve({id: <phase-1 id>, resolution: "...", resolved_by: "operator"})` citing the migration (committed file has 0 `gate-verb:*` rows), the durability-split tests green, the symmetric guard, and the reconciled docs. `meta_state_log_change` the design change (semantic: the runtime-state substrate split by durability, namespace-guarded; mechanical: schema `durability` field + destination-scoped write-split + read-merge + 3-layer protection + gitignore + stop-tool namespace derivation).

## Related Code Files
- Modify: `docs/architecture.md`, `docs/runtime-contract.md`.
- Read: the Phase-1 finding id; `runtime-state.jsonl` + `.loop/runtime-state-local.jsonl` (evidence for resolution).

## Implementation Steps
1. Rewrite the `docs/architecture.md` drift note into the reconciled "Durability split" paragraph; document `runtime_state_read` returns both substrates (red-team #13).
2. Trim the `docs/runtime-contract.md` drift tail; add the namespace↔durability guard as a contract consequence.
3. Run a whole-plan consistency sweep: re-read `plan.md` + every phase; confirm no stale "drift" / "will be reconciled" framing remains; reconcile any contradiction.
4. `meta_state_resolve` the Phase-1 finding with evidence; `meta_state_log_change` the design change.
5. Run `pnpm test` (full) → green.

## Success Criteria
- [ ] `docs/architecture.md` has no "Durability drift (planned reconciliation)" note; a "Durability split" paragraph names the two substrates + merge + protection + `runtime_state_read` behavior.
- [ ] `docs/runtime-contract.md` "Durability contract" points to the reconciled mechanism (not a drift) + names the namespace guard.
- [ ] The Phase-1 finding is `resolved` in the registry (verify via `meta_state_list` / `registry-table.sh`).
- [ ] A `change-log` entry records the durability-split design change.
- [ ] Whole-plan consistency sweep: zero unresolved contradictions across `plan.md` + 5 phases.
- [ ] `pnpm test` green.

## Risk Assessment
- **Docs drift re-introduced** (Low). If a future PR edits the L3 mechanism without updating the L1/L2 durability clauses, the layers drift again. Pre-decided response: the cross-surface dedup-invariant test added in PR #122 pins CLAUDE.md/AGENTS.md against hint text; a lighter assertion that architecture.md's "Durability split" paragraph and the runtime-contract.md clause stay consistent is optional (YAGNI unless red-team judges the drift risk worth the test cost).
- **`runtime_state_read` output surprises operators** (Low, red-team #13). Pre-decided response: documented, not filtered. If operators later need a committed-only view, add an optional `durability` filter then — not preemptively.