---
phase: 7
title: "Verify + Runtime-Agnostic Audit"
status: pending
priority: P2
effort: "1h"
dependencies: [3, 4, 5, 6]
---

# Phase 7: Verify + Runtime-Agnostic Audit

## Overview

The whole-plan regression gate before cook handoff. Run the full suite, the runtime-agnostic audit (`check_runtime_agnostic` on the new module + the `__tests__/runtime-agnostic.test.js` regression), the CLI transport parity (both relationship tools ride `bin/loop.mjs`), and a final grep sweep confirming the decentralization is gone (no bespoke per-kind `outboundRefs`/`inboundRefs` duplication, no dual-field fallback, no `OUTBOUND_EXTRACTORS` standalone copy, no `meta-state.js` import in the graph). Verify the `reopens`/`cascade_from` public contract is preserved (the 2 hint slugs + 4 live edges + the cascade branch untouched). Confirm the three findings' disposition from Phase 6 is queryable. This phase writes no production code — it is the verification surface.

## Requirements

- Functional: `pnpm test` (full suite) green — including the Phase 1 characterization + Phase 2 module + Phase 3 migration + Phase 4 write-time RI suites, the 39 existing relationship/introspect tests, and the dual-field test update (1 ref).
- Functional: `check_runtime_agnostic` passes on `core/entry/relationship-graph.js` (the 6-item checklist: core-in-universal-location, shims-in-sync N/A for core, protocol-adapter-i/o N/A, manifest-registered N/A, cross-surface-iteration, parameterized-for-new-surfaces). The `__tests__/runtime-agnostic.test.js` regression passes.
- Functional: CLI transport parity — `node bin/loop.mjs meta_state_relationships '{...}'` and `meta_state_relationship_validate '{...}'` produce the same results as the MCP path would (the handlers are shared; verify no CLI-only divergence was introduced). Set `LOOP_SURFACE` before invoking.
- Functional: grep sweep confirms the centralization is complete and pure:
  - No bespoke per-kind `outboundRefs`/`inboundRefs` bodies in the factories (they delegate to the graph).
  - No `buildInverseIndexes` `indexX`/`indexOrigin`/`indexPromotedToRule` bodies in `loop-introspect.js` (delegated).
  - No `OUTBOUND_EXTRACTORS` standalone copy in `scripts/validate-registry-refs.js` (uses `forwardRefs`).
  - The dual-field fallback in `meta-state-relationships-tool.js` PERSISTS but its per-query `buildInverseIndexes` rebuild is gone (replaced with a targeted `inverseRefs` lookup — red-team R1); `groupOutbound`/`groupInbound`/`INBOUND_KEY_MAP`/`computeDanglingRefs` STAY in the tool (red-team R10).
  - No `from.*meta-state\|require.*meta-state` in `core/entry/relationship-graph.js` (pure — no import cycle).
  - `consolidates-refs.js` + `inbound-from-loop-design.js` kept as thin re-exports (rollback-safe — red-team R10); only the graph imports the bodies.
- Functional: `reopens`/`cascade_from` public contract preserved — the 2 hint slugs (`core/hint-registry.js:94,130`), the 4 live `reopens` edges (queryable, read fine), the `cascade_from` branch (`meta-state-resolve-tool.js:23,127-150,205-251`) untouched. No `related_to` field added.
- Functional: the three findings' disposition is queryable — `meta_state_list({ id: [...] })` shows #1/#2 `resolved`, #3 per Phase 6's choice; the change-log `active`.

## Architecture

```
Verification surface (no production writes):
  pnpm test                              (full suite)
  check_runtime_agnostic(relationship-graph.js)   (MCP tool or CLI equivalent)
  __tests__/runtime-agnostic.test.js     (regression)
  node bin/loop.mjs meta_state_relationships '{...}'      (CLI parity spot-check)
  grep -rn sweep                         (centralization complete + graph pure)
  registry-table.sh | tail -20           (findings + change-log queryable)
```

### Why a dedicated verification phase

This plan touches 5 consumers + adds write-time enforcement at the mutation boundary + changes a locked test's expectation. A per-phase gate (Phases 1-6) catches local regressions; this phase catches cross-phase interactions — e.g. a Phase 3 migration that passed its own gate but broke a Phase 4 RI assumption, or a stale reference left in a doc/test. The runtime-agnostic audit is the rule-hint-16 gate for any new feature (the new module is a core feature), and the grep sweep is the empirical proof the decentralization (the root defect) is actually gone, not just re-pointed.

## Related Code Files

- No file changes (verification only).
- Read/verify: `core/entry/relationship-graph.js`, the 4 factories, `core/loop-introspect.js`, `tools/handlers/meta-state-relationships-tool.js`, `scripts/validate-registry-refs.js`, `core/meta-state.js`, `core/hint-registry.js`, `tools/handlers/meta-state-resolve-tool.js` (cascade branch untouched).
- Invoke: `pnpm test`, `check_runtime_agnostic`, `bin/loop.mjs`, `tools/scripts/registry-table.sh`, `meta_state_list` via CLI.

## Implementation Steps

### Implementation (verification only)

1. `pnpm test` — full suite. Record any failure; a failure here is a cross-phase interaction (the per-phase gates passed). Triage: is it a fixture that intentionally modeled a dangling ref as accepted (Phase 4 step 9 audit)? A characterization assertion that needs the intended-change update? A cache round-trip in `loop-introspect-cache`? Fix at the source (not by weakening the test), per the quality gates.
2. `check_runtime_agnostic` on `core/entry/relationship-graph.js` — pass the 6-item checklist. The module is core + universal-location by construction; the relevant items are cross-surface-iteration (it's consumed by CLI + MCP via the shared handlers, not per-surface) and parameterized-for-new-surfaces (a new runtime gets it for free via the shared handlers — no per-runtime wiring). If the tool flags a shim/manifest item, confirm it's N/A for a core module (not a hook).
3. `__tests__/runtime-agnostic.test.js` — the regression passes.
4. CLI parity: `LOOP_SURFACE=<surface> node bin/loop.mjs meta_state_relationships '{ "id": "<child-with-reopens>", "direction": "outbound" }'` → `outbound.reopens` populated. Same for `direction:"inbound"` → `reopened_by` populated. `meta_state_relationship_validate` → description-lint result. Confirm identical shape to the handler (shared module).
5. Grep sweep (the centralization-complete proof):
   - `grep -rn "outboundRefs\|inboundRefs" core/entry/{finding,rule,change-log,loop-design}.js` → factories delegate (thin), no bespoke bodies.
   - `grep -rn "indexOrigin\|indexPromotedToRule\|indexReopens" core/loop-introspect.js` → deleted (delegated to the graph).
   - `grep -rn "OUTBOUND_EXTRACTORS" scripts/validate-registry-refs.js` → removed (uses `forwardRefs`).
   - `grep -rn "origin_inverse" tools/handlers/meta-state-relationships-tool.js` → the targeted `inverseRefs` lookup replaces the per-query rebuild (red-team R1); the fallback PERSISTS. `grep -rn "buildInverseIndexes" tools/handlers/meta-state-relationships-tool.js` → no per-query rebuild (the graph supplies it); the wire-shape functions stay here (red-team R10).
   - `grep -rn "from.*meta-state\|require.*meta-state" core/entry/relationship-graph.js` → zero (pure, no cycle).
   - `ls core/entry/consolidates-refs.js core/entry/inbound-from-loop-design.js` → present as thin re-exports (rollback-safe — red-team R10); only the graph imports the bodies.
   - `grep -rn "related_to" core/ docs/` → none added (the only match is the pre-existing test-description string in `__tests__/legacy-mcp/meta-state-loop-design-schema.test.js:14`, which is not a field).
6. `reopens`/`cascade_from` contract preserved: `grep -n "cascade_from" tools/handlers/meta-state-resolve-tool.js` → still accepted (`:23`); `grep -n "reopens\|reopens-script" core/hint-registry.js` → 2 slugs at `:94,130`; the 4 live `reopens` edges queryable via `meta_state_list`/`meta_state_relationships` and read fine (Phase 4 RI is new-appends-only; none re-appended).
7. `tools/scripts/registry-table.sh | tail -20` → the three findings' disposition + the change-log queryable (#1/#2 resolved, #3 per Phase 6, change-log active).

### Verification

8. Re-run `pnpm test` after any step-1 triage fix → green.
9. Confirm the plan's Success Criteria checklist (plan.md) is satisfiable from this phase's evidence — each box maps to a verification here.
10. Hand off: the plan is ready for `/ak:cook` (with `--tdd`).

## Success Criteria

- [ ] `pnpm test` full suite green (Phase 1-6 suites + 39 existing + dual-field 1-ref update)
- [ ] `check_runtime_agnostic` passes on `core/entry/relationship-graph.js`; `__tests__/runtime-agnostic.test.js` regression green
- [ ] CLI parity: `bin/loop.mjs meta_state_relationships` outbound `reopens` + inbound `reopened_by` populated; `meta_state_relationship_validate` description-lint; identical to the shared handler
- [ ] Grep sweep: factories delegate (no bespoke bodies); `loop-introspect` `indexX` deleted; validator `OUTBOUND_EXTRACTORS` removed; relationships-tool fallback PERSISTS (targeted `inverseRefs`, no per-query rebuild — red-team R1) + wire-shape/`computeDanglingRefs` stay in the tool (red-team R10); `relationship-graph.js` has zero `meta-state.js` imports; the two leaf helpers kept as thin re-exports (red-team R10)
- [ ] `reopens`/`cascade_from` contract preserved: `cascade_from` still accepted at `meta-state-resolve-tool.js:23`; 2 hint slugs at `hint-registry.js:94,130`; 4 live `reopens` edges read fine; no `related_to` field added
- [ ] Three findings queryable (#1/#2 resolved, #3 per Phase 6) + change-log active via `registry-table.sh`
- [ ] Every plan.md Success Criteria box maps to verification evidence here

## Risk Assessment

**Low** (verification surface, no production writes). The residual risk is a cross-phase interaction the per-phase gates missed — most likely a fixture that intentionally modeled a now-rejected dangling ref, or a cache round-trip in `loop-introspect-cache` if the graph's `buildInverseIndexes` map values differ in identity (not shape) from the old `indexX` output. Mitigation: the grep sweep is the empirical proof; a missed decentralization site (e.g. a fourth forward-ref copy found by the red-team) would surface as a grep hit. If `check_runtime_agnostic` flags a shim/manifest item on the core module, confirm it's N/A (core modules are not hooks) rather than adding spurious shims — the audit's intent is shim-not-fork, and a pure core module needs no shim. The `reopens`/`cascade_from` contract-preservation check is the guard against scope creep into the deferred drop — if a hint slug or the cascade branch was accidentally removed, this step catches it before handoff.
