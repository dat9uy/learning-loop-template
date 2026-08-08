---
phase: 4
title: "Resolve discovery-tax finding + file B finding"
status: complete
priority: P1
effort: "1h"
dependencies: [1, 2, 3]
---

# Phase 4: Resolve discovery-tax finding + file B finding

## Overview

After A+C+D ship and **merge to main** (post-merge, per Validation Session 1), the discovery tax the filed finding captures is addressed (the block self-remediates, the CLI hints on bare keys, the sentinel removes the finding-id grep). This phase closes the loop bookkeeping: resolve finding `meta-260808T1217Z-gate-verb-allowance-discovery-tax-...` and open a new finding for the remaining unaddressed gap — B, the missing `loop_get_instruction("gate-verb-allowance")` key — so the next session picks it up.

Per the user instruction and Validation Session 1, B is **not implemented in this plan**; it is captured as a finding here. Phase 4 runs only after Phases 1-3 are merged to main and green there.

## Requirements

- Functional: `meta_state_resolve` the discovery-tax finding `meta-260808T1217Z-gate-verb-allowance-discovery-tax-every-session-that-hits-an` with a resolution citing A+C+D (self-remediating block, JSON guardrail, sentinel source_ref).
- Functional: `meta_state_report` a new finding for B: `loop_get_instruction("gate-verb-allowance")` returns `Unknown hint key`, so the only gate-verb guidance is the dense CLAUDE.md paragraph + (after this plan) the block message. A dedicated instruction key would give on-demand access to the incantation.
- Functional: the new B finding cites `evidence_code_ref` to `tools/learning-loop-mastra/core/hint-registry.js` (where instruction keys are registered) and references this plan + the resolved finding as `source_ref` context.
- Non-functional: all writes go through loop tools (CLI or MCP); no direct `meta-state.jsonl` edits.

## Architecture

Two loop-tool calls, in order:

1. **Resolve** the discovery-tax finding:
   `meta_state_resolve({id:"meta-260808T1217Z-gate-verb-allowance-discovery-tax-every-session-that-hits-an", resolution:"Addressed by plan 260808-1222: A (self-remediating gate-verb block message emits the 2-call incantation), C (CLI bare-key JSON guardrail), D (sentinel source_ref local:meta-state:gate-verb-allowance). B (loop_get_instruction key) split into a separate finding.", resolved_by:"operator"})`
   - Per the rules, call `meta_state_derive_status` before resolving to confirm it is safe to close.

2. **Report** the B finding:
   `meta_state_report({category:"loop-anti-pattern", severity:"warning", affected_system:"workflow-registry", description:"...", evidence_code_ref:"tools/learning-loop-mastra/core/hint-registry.js", session_id:"<this session>"})`
   - `affected_system:"workflow-registry"` (the instruction/hint key registry) — confirm against the enum; fallback `"meta-state-tools"` if the enum rejects it.
   - Description: `loop_get_instruction("gate-verb-allowance")` returns `Unknown hint key`. After plan 260808-1222, the block message self-remediates so this is lower-urgency, but an on-demand instruction key would let the agent fetch the canonical gate-verb incantation without a block or a CLAUDE.md re-read. Register a `gate-verb-allowance` key in hint-registry containing the 2-call incantation + the id==affected_system rule + the sentinel source_ref.

## Related Code Files

- No code modified in this phase (loop bookkeeping only).
- Reference: `tools/learning-loop-mastra/core/hint-registry.js` (cited as `evidence_code_ref` in the new finding — where B will eventually be fixed).

## Implementation Steps

1. **Precondition:** Phases 1-3 merged to main and `pnpm test:one` green on main (post-merge, per Validation Session 1).
2. Run `meta_state_derive_status({id:"meta-260808T1217Z-..."})` to confirm the finding is safe to resolve.
3. `meta_state_resolve` the discovery-tax finding with the resolution text above.
4. Write the B-finding `meta_state_report` args to a temp file (large description → `--args-file`, avoiding the very bare-key/quote friction this plan fixes), then submit.
5. Confirm: `meta_state_list({id:[<discovery-tax-id>]})` shows `status:resolved`; `meta_state_list` for the new B finding shows `status:open`.
6. Clean up the temp args file.

## Success Criteria

- [x] Discovery-tax finding `meta-260808T1217Z-...` is `resolved`.
- [x] New B finding is `open`, `loop-anti-pattern`/`warning`, cites `hint-registry.js` as `evidence_code_ref`.
- [x] No direct `meta-state.jsonl` writes (all via loop tools).
- [x] Temp args file cleaned up.

## Risk Assessment

- **Risk:** `affected_system:"workflow-registry"` rejected by the enum. *Signal:* `meta_state_report` returns a validation error. *Response:* retry with `"meta-state-tools"` (the hint registry is part of the meta-state tool surface).
- **Risk:** Resolving the discovery-tax finding before A+C+D actually ship in the same PR. *Signal:* finding resolved but the code change is reverted/missing. *Response:* run Phase 4 only after Phases 1-3 tests are green on the PR branch; resolve is the last pre-merge step (or immediate post-merge).