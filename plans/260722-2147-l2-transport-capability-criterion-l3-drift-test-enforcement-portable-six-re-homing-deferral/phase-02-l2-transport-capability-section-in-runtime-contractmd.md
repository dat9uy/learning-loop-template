---
phase: 2
title: "L2 transport-capability section in runtime-contract.md"
status: pending
priority: P1
effort: "3h"
dependencies: [1]
---

# Phase 2: L2 transport-capability section in runtime-contract.md

## Overview

Add the per-function transport-capability axis to `docs/runtime-contract.md` as a **layer-ownership rule** — the missing L2 statement that lets "is function F on transport X?" be read as a capability question about F, separate from the wiring question about runtime R. This is the criterion Phase 3 enforces and Phase 4 cites. Bound-artifact edit → change-log.

## Requirements

- Functional: a new "Transport capability (per function)" section stating: stateless-by-default = transport-capable; stateful behavior owned by the runtime-state layer (whose file-based tools are themselves stateless handlers — "stateful" means *process*/warm state, not *file* state); MCP-only = one of two explicit overrides (process-scoped server state | operator-only policy), never silent; **capability ≠ wiring**.
- Non-functional: the section gives no per-runtime prescription (wiring stays L3); it cross-references the L1 3-homes clarification in `loop-engine.md`; ≤ ~25 lines (contract doc, keep tight).

## Architecture

The contract already names *transports* (per-runtime, § Transport mapping) and states L9 "no correctness-critical state." What it lacks is the per-**function** property. The new section sits alongside Transport mapping as the orthogonal axis:

- **Axis A — capability** (property of the function, stable, lives at L2): can F ride a one-shot transport at all?
- **Axis B — wiring** (property of the runtime, configurable, lives at L3): does runtime R surface F on X?

The M6 red-team confusion (plan `260722-1623`) wrote a B-fact as an A-fact. Stating A at L2 lets B be read as pure runtime config on top of it.

Insertion anchor (content-based, not line numbers — red-team found "Three concerns" is at file line 31, not 39): after the last bullet of "Three concerns previously conflated as the interface", before "## Current transports". The section's last sentence is the direct M6 fix: "Is F on my MCP surface? is a wiring question about the runtime, not a capability question about F."

**Also fix the stale "16 tools" count** (red-team AD-F7): `docs/runtime-contract.md` lines 26 and 40 both say "the 16 tools in `core/cli-tools.js#CLI_WRITE_TOOLS`" but the actual count is 19 (and becomes 21 after Phase 3). Either update the number to the actual count or replace it with a dereferenced phrase ("the `CLI_WRITE_TOOLS` set in `core/cli-tools.js`") so the contract doc does not lie about the residue surface size.

## Related Code Files

- Create: none.
- Modify: `docs/runtime-contract.md` (add one section; plus correct the stale "16 tools" count at lines 26 + 40 to the actual count or a dereferenced phrase; optional one-line forward-pointer from § Transport mapping).
- Delete: none.

## Implementation Steps

1. Read the current `docs/runtime-contract.md` (Phase 1 anchor) and the sibling report §4 sketch (`plans/reports/ak-problem-solving-260722-2050-l2-transport-capability-criterion.md` lines 77–86).
2. Draft the section (≤25 lines) covering: (a) the stateless-by-default rule; (b) runtime-state-layer ownership of stateful behavior + the "process vs file state" clarification; (c) the two MCP-only overrides (server-state | operator-policy); (d) capability ≠ wiring, with the A/B axis table; (e) cross-ref to `loop-engine.md` § Workflow: definition vs execution for the 3 execution homes; (f) the M6-fix closing sentence.
3. Insert at the Phase 1 anchor (content-based — after "Three concerns previously conflated", before "## Current transports"). Re-read the surrounding sections to confirm no vocabulary clash with the existing transport list.
4. Fix the stale "16 tools" count at lines 26 + 40 → actual count or dereferenced "`CLI_WRITE_TOOLS` set in `core/cli-tools.js`" (red-team AD-F7). (Phase 3 will touch the count again if it hardcodes a number — prefer the dereferenced form so it does not re-stale.)
5. Log a change-log entry via `bin/loop.mjs meta_state_log_change` (runtime pin `.claude`): `change_dimension: semantic`, `change_target: docs/runtime-contract.md`, `applies_to: {surfaces: ["meta"]}`, `evidence_code_ref: docs/runtime-contract.md`, reason ≥20 chars naming the per-function capability axis + capability≠wiring. (Entry lands in `change-log.jsonl`, not `meta-state.jsonl`.)
6. Re-verify finding `meta-260721T0809Z` (transport-diversification, closed by W) now has an L2 basis to cite — confirm its `evidence_code_ref` can point at this section. If it was closed by W, record a note; do not reopen.
7. Red-team check (self): does the section prescribe any per-runtime wiring? If yes, cut it — wiring is L3.

## Success Criteria

- [ ] `docs/runtime-contract.md` has "Transport capability (per function)" with the layer-ownership rule + capability≠wiring + the two overrides + 3-homes cross-ref.
- [ ] No per-runtime prescription in the section (capability only).
- [ ] Change-log entry logged with the correct runtime pin + `applies_to.surfaces: ["meta"]`.
- [ ] `meta-260721T0809Z` L2-basis noted (not reopened).

## Risk Assessment

- **Over-specification into wiring.** The section could drift to "F rides CLI" (a wiring claim). Mitigation: the section states capability only; the closing sentence explicitly redirects "is F on my surface?" to wiring. Self red-team in step 6.
- **Vocabulary clash with Transport mapping.** Both sections talk about transports. Mitigation: the new section is explicitly the *per-function* axis; Transport mapping stays *per-runtime*. Insertion anchor keeps them adjacent but titled distinctly.