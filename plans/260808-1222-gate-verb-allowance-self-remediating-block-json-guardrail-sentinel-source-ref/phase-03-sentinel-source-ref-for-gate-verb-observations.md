---
phase: 3
title: "Sentinel source_ref for gate-verb observations (D)"
status: pending
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 3: Sentinel source_ref for gate-verb observations (D)

## Overview

Establish `local:meta-state:gate-verb-allowance` as the sanctioned sentinel `source_ref` for gate-verb budget-state rows, so the agent never greps `meta-state.jsonl` for a finding id. The `runtime_state_record` source_ref regex already accepts any `local:meta-state:.+` value — no schema change is needed. This phase names the sentinel in the docs/hints the agent reads and pins its acceptance with a test.

## Requirements

- Functional: `runtime_state_record({..., source_ref:"local:meta-state:gate-verb-allowance"})` is accepted (passes the existing `/^local:meta-state:.+$/` regex at `runtime-state-record-tool.js:65`; no `canonical_id_required` as long as `id==affected_system`).
- Functional: the sentinel is documented as the canonical source_ref for gate-verb observations in `field-glossary.js`, `hint-registry.js`, and the CLAUDE.md gate-verb allowance paragraph.
- Functional: the block message from Phase 1 uses this exact sentinel (already specified in Phase 1 — this phase makes it the documented contract, not an ad-hoc string).
- Non-functional: the sentinel is **intentionally non-resolving** — it does not point to a real meta-state entry, and no current code grounds runtime-state `source_ref` against meta-state existence (verified: `appendLedgerEvent` only fingerprints; `checkObservationExists` checks `affected_system`, not `source_ref`). Document this so a future grounding check does not silently break it.
- Non-functional: no schema change to `runtime-state-record-tool.js` or `schemas/runtime-state.schema.json`.

## Architecture

Three doc surfaces + one test:
1. `core/field-glossary.js` `source_ref` entry (~line 51-57): add a note that `local:meta-state:gate-verb-allowance` is the sanctioned sentinel for gate-verb observations (non-resolving).
2. `core/hint-registry.js` source-ref hints (~line 40, 56, 58): add/adjust to name the sentinel for gate-verb observations so warm hints steer the agent to it.
3. `CLAUDE.md` "Gate-verb allowance (bounded 30 min)" paragraph: replace the example `source_ref:"local:meta-state:<id>"` with the sentinel `source_ref:"local:meta-state:gate-verb-allowance"` and note the block message now emits the full incantation.
4. Test: assert the sentinel passes the tool's source_ref validation and a row records successfully (handler-level integration test, mirroring `runtime-tracking.test.js`).

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/field-glossary.js` (source_ref entry)
- Modify: `tools/learning-loop-mastra/core/hint-registry.js` (source-ref hints)
- Modify: `CLAUDE.md` (gate-verb allowance paragraph)
- No schema change: `tools/learning-loop-mastra/tools/handlers/runtime-state-record-tool.js` (confirm regex; do not widen)
- Test: `tools/learning-loop-mastra/__tests__/runtime-tracking.test.js` (add sentinel acceptance case)

## Implementation Steps (TDD — tests first)

1. **Write failing test** in `runtime-tracking.test.js`: with an active `.loop-preflight-runtime-state` marker, `runtime_state_record({affected_system:"gate-verb:bash", kind:"budget-state", id:"gate-verb:bash", source_ref:"local:meta-state:gate-verb-allowance", timestamp:"<ISO>"})` returns `{ok:true,...}` (mirror the existing `canonical_id_required` test at line ~372 for setup).
2. Run test → it should **already pass** (regex accepts the sentinel). If it passes, the test pins the contract — keep it. If it fails, investigate before changing the schema (the finding's premise was that the regex already accepts it).
3. Update `field-glossary.js` source_ref entry: name the sentinel + "non-resolving" note.
4. Update `hint-registry.js`: steer gate-verb observations to the sentinel.
5. Update `CLAUDE.md` gate-verb paragraph: sentinel in the example + note the self-remediating block message (cross-ref Phase 1).
6. Run `pnpm test:one -- runtime-tracking` + `runtime-state-metadata-validation` → green. `check_runtime_agnostic` against the changed core files.

## Success Criteria

- [ ] Sentinel acceptance test passes and is committed.
- [ ] Sentinel named in field-glossary, hint-registry, and CLAUDE.md.
- [ ] No schema file changed (regex unchanged).
- [ ] `pnpm test:one` green; `check_runtime_agnostic` passes.

## Risk Assessment

- **Risk:** A future grounding check validates runtime-state `source_ref` against meta-state existence and rejects the non-resolving sentinel. *Signal:* new grounding test fails on rows using the sentinel. *Response:* the Phase 3 test + field-glossary note make the sentinel an explicit contract; a future grounding check must whitelist `gate-verb-allowance` or the test will fail loudly (intended).
- **Risk:** Soft dependency on Phase 1 — if Phase 1 lands with the sentinel string but Phase 3 docs lag, the agent reading docs still sees the old `<id>` example. *Signal:* Phase 1 test passes but CLAUDE.md still shows `local:meta-state:<id>`. *Response:* ship Phase 3 docs in the same PR as Phase 1 (Phase 3 is small; no reason to split).