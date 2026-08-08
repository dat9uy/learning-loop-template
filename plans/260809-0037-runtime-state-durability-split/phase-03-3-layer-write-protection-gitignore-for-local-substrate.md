---
phase: 3
title: "3-layer write protection + gitignore for local substrate"
status: complete
priority: P1
effort: "1d"
dependencies: [2]
---

# Phase 3: 3-layer write protection + gitignore for local substrate

## Overview
Apply the 3-layer write-protection model to the new local substrate and gitignore it. **Red-team #3 corrected the layer locations:** the Write-tool layer lives in `evaluate-write-gate.js` (a preflight-delegating rule), NOT `bound-artifacts.js` — the `runtime-state.jsonl` rule was migrated out of `BOUND_ARTIFACTS` (whose array at `bound-artifacts.js:139-145` has no runtime-state entry). **Red-team #16** requires enumerating all three markers that govern the local file, not just the shell one. The 260722-1623 lesson stands: each layer's short-circuits are non-overlapping; a new protected artifact needs all three. Tests-first.

## Requirements
- Functional: direct shell writes (`echo/tee > .loop/runtime-state-local.jsonl`) are blocked unless `.loop-preflight-runtime-state-edit` is active; the Write-tool is blocked by a preflight-delegating rule in `evaluate-write-gate.js` (delegating to `runtime-state-edit`); `withR2Gate` direct path-writes are blocked by the R2 ownership denylist. `git check-ignore .loop/runtime-state-local.jsonl` confirms it is ignored. The change-log binding layer can attribute the path (red-team #12).
- Non-functional: reuse the existing preflight markers — no new marker surface. The three markers governing the local file (red-team #16):
  - `.loop-preflight-runtime-state-edit` — direct shell/Write-tool row maintenance (the migration script's *shell-invoked* path; see Phase 4 note on the `node script` internal-write path).
  - `.loop-preflight-runtime-state` — `runtime_state_record` appends.
  - `.loop-preflight-runtime-tracking` — `runtime_state_pause`/`resume`/`stop` lifecycle transitions.
  The loop-tool write paths (`runtime_state_record`, `runtime_state_stop`, the migration script's internal `appendFileSync`) are NOT blocked by these layers (they are the authorized writers); the markers gate the *operator's direct-write* and *tool* surfaces respectively.

## Architecture
- **Bash gate** (`core/evaluate-bash-gate.js`): extend the runtime-state path-write detection so a redirect/tee to `.loop/runtime-state-local.jsonl` is detected and gated on `.loop-preflight-runtime-state-edit` — same marker, same 30-min TTL, same block reason as the committed file. Keep the two checks independent (compound command writing both files must still block for the records-class half when the runtime-state half is marker-exempted — the existing independence invariant).
- **Write-tool layer (red-team #3) — `core/evaluate-write-gate.js`:** add a second preflight-delegating rule mirroring `RUNTIME_STATE_GLOB` (`evaluate-write-gate.js:118-131`), e.g. `RUNTIME_STATE_LOCAL_GLOB = ".loop/runtime-state-local.jsonl"`, delegating to the same `runtime-state-edit` marker with `reason: null` (preflight-delegating, not a dead-end block). This preserves the "non-overlapping short-circuits" invariant: the committed file is protected by a preflight-delegating rule (operator mints the marker to edit); the local file gets the *same* rule class, so sanctioned maintenance works identically. **Do NOT** add a simple-glob block to `bound-artifacts.js` (that would be a dead-end with no preflight escape and would diverge in precedence from the committed-file rule).
- **R2 ownership** (`core/r2/ownership.js`): add `.loop/runtime-state-local.jsonl` and `**/runtime-state-local.jsonl` to the runtime-state denylist alongside `runtime-state.jsonl`. Update the denylist help text to name both substrates and the durability split.
- **change-log binding (red-team #12) — `core/change-log-bound-paths.js`:** add `.loop/runtime-state-local.jsonl` to `TOP_LEVEL_FILES` (the set at `:65-72` that binds change-log entries to loop-internal paths), so `meta_state_log_change` can attribute the local file in Phase 4.
- **gitignore** (`.gitignore`): add `.loop/runtime-state-local.jsonl` (specific path — NOT a broad `.loop/` ignore, since `.loop/r2-allowlist.json` is tracked) with a comment: "session-local ephemeral allowance substrate (L1 durability axis; not committed)."

## Related Code Files
- Modify: `tools/learning-loop-mastra/core/evaluate-bash-gate.js`, `tools/learning-loop-mastra/core/evaluate-write-gate.js` (red-team #3 — NOT `bound-artifacts.js`), `tools/learning-loop-mastra/core/r2/ownership.js`, `tools/learning-loop-mastra/core/change-log-bound-paths.js` (red-team #12), `.gitignore`.
- Create/extend: `tools/learning-loop-mastra/__tests__/runtime-state-local-substrate-protection.test.js` (or extend `runtime-state-write-gate.test.js` + `evaluate-bash-gate.test.js`).

## Implementation Steps (TDD — tests first)
1. **Write the failing tests**:
   - `evaluateBashGate({ command: "echo x > .loop/runtime-state-local.jsonl", root })` without marker → block, reason names `gate_mark_preflight(surface:'runtime-state-edit')`.
   - Same command WITH an active `.loop-preflight-runtime-state-edit` marker → ok.
   - Compound `echo a > runtime-state.jsonl && echo b > .loop/runtime-state-local.jsonl` → both halves gated; the records-class half blocks even when the runtime-state half is marker-exempted (independence invariant holds for the new file).
   - Write-tool: a Write-tool call to `.loop/runtime-state-local.jsonl` without the marker → blocked by the `evaluate-write-gate.js` preflight-delegating rule; WITH the marker → ok (red-team #3 — verify the rule delegates, not dead-end blocks).
   - R2 ownership: `withR2Gate` write to `.loop/runtime-state-local.jsonl` → denied.
   - `git check-ignore -v .loop/runtime-state-local.jsonl` → matches the new `.gitignore` line.
   - change-log binding: `meta_state_log_change` with the local path → binds (red-team #12).
   - Loop-tool writes (`runtime_state_record` ephemeral, `runtime_state_stop` ephemeral) are NOT blocked by any layer (authorized writers).
2. Run `pnpm test --changed` → red.
3. Add the bash-gate detection for the local file; reuse `runtime-state-edit`.
4. Add the `RUNTIME_STATE_LOCAL_GLOB` preflight-delegating rule in `evaluate-write-gate.js` (red-team #3).
5. Add the R2 denylist entries + help text.
6. Add `.loop/runtime-state-local.jsonl` to `change-log-bound-paths.js` `TOP_LEVEL_FILES` (red-team #12).
7. Add the `.gitignore` line.
8. Run `pnpm test --changed` → green; run the full gate suites → green.

## Success Criteria
- [ ] All 3 layers block direct/Write-tool/R2 writes to the local substrate; the authorized loop-tool write paths are unaffected.
- [ ] The Write-tool rule is in `evaluate-write-gate.js` as a preflight-delegating rule (not a dead-end `bound-artifacts.js` block) — red-team #3.
- [ ] `git check-ignore .loop/runtime-state-local.jsonl` succeeds.
- [ ] `meta_state_log_change` can bind the local path — red-team #12.
- [ ] No regression in `evaluate-bash-gate.test.js`, `evaluate-write-gate` tests, `runtime-state-write-gate.test.js`, `r2/ownership` tests.

## Risk Assessment
- **Marker reuse widens the edit gate's blast radius** (Low-Medium). Reusing `runtime-state-edit` means a marker minted to maintain the committed file also unlocks maintenance of the local file. Pre-decided response: acceptable — both files are the "runtime-state row maintenance" class, the marker is operator-intentional (30-min TTL), and every maintenance is logged via `meta_state_log_change`. If red-team judges it too wide, add a dedicated `.loop-preflight-runtime-state-local-edit` marker (small, contained fallback).
- **`.loop/` is partially tracked** (Low). `.loop/r2-allowlist.json` is committed. The gitignore entry is specific to the new file (verified — no broad `.loop/` ignore).