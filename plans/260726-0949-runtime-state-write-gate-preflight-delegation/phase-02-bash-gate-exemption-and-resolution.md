---
phase: 2
title: "Bash-gate exemption, tool description, finding resolution"
status: completed
priority: P1
effort: "2h"
dependencies: [1]
completed: 2026-07-26
---

# Phase 2: Bash-gate exemption, tool description, finding resolution

## Overview

Close the shell half of the escape path: the bash gate hard-blocks redirects/tee to
`runtime-state.jsonl` (`core/evaluate-bash-gate.js:50-51`), and a corrupt-row strike is a
shell operation (`grep -v`, `sed -i`). Exempt runtime-state path-writes when the
`.loop-preflight-runtime-state` marker is active, fix the mislabeled block reason (it
currently returns the *records* reason for runtime-state hits), update the
`gate_mark_preflight` tool description, then resolve the finding with the audit trail.
TDD: bash-gate behavior tests first (red), then the exemption (green).

## Requirements

- **Functional**
  - `evaluateBashGate({command: "echo x > runtime-state.jsonl"})` (and `tee`, and
    `sed -i`/`grep -v` redirect forms already matched by the patterns) WITHOUT marker →
    `decision: "block"`, `hard_block: true`, whose `reason` names
    `gate_mark_preflight(surface:'runtime-state')` — NOT the records reason.
  - Same commands WITH an active `.loop-preflight-runtime-state` marker → `decision: "ok"`.
  - `records/**`, `meta-state.jsonl`, and `.loop/runtime-tracking.json` path-writes remain
    hard-blocked regardless of the runtime-state marker (no exemption bleed).
- **Non-functional**
  - Marker check reuses `hasSurfacePreflightMarker(root, ".loop-preflight-runtime-state")`
    from `core/runtime-tracking.js:51` (same helper `runtime_state_record` uses) — no new
    marker-reading code.
  - `gate_mark_preflight` tool description updated: surface `"runtime-state"` now unlocks
    BOTH `runtime_state_record` AND direct `runtime-state.jsonl` writes (write gate + bash gate).

## Architecture

- `core/evaluate-bash-gate.js`:
  - Split the two runtime-state patterns out of the shared `PATH_WRITE_PATTERNS` records
    block into a named `RUNTIME_STATE_WRITE_PATTERNS` pair (redirect + tee), keeping
    `PATH_WRITE_PATTERNS` as the union so the pattern-count test stays truthful (update
    its expected count comment, not the behavior).
  - In `evaluateBashGate`, when a runtime-state path-write matches AND
    `hasSurfacePreflightMarker(resolvedRoot, ".loop-preflight-runtime-state")` is true →
    skip the path block for runtime-state only. Other path-write matches still produce
    the hard block.
  - Give the runtime-state block its own reason text:
    `"Direct shell writes to runtime-state.jsonl are gated. Use gate_mark_preflight(surface:'runtime-state') to unlock row maintenance for 30 minutes, then log the change with meta_state_log_change. New rows still go through runtime_state_record (append-only)."`
    This also fixes the pre-existing wart where runtime-state hits returned the records reason.
  - Decision-combination order is unchanged: constraint hard_block → path hard_block →
    constraint non-ok → path → ok. The exemption only suppresses the runtime-state
    pathResult, never the constraint or promoted-rule checks.
- `tools/handlers/mark-preflight-complete-tool.js`: update the `description` and the
  `surface` schema `.describe(...)` so `"runtime-state"` reads as unlocking
  `runtime_state_record` **and** gated direct writes to `runtime-state.jsonl`. No validator
  change (`"runtime-state"` already in the enum).
- Resolution (CLI, per loop steering — writes ride `bin/loop.mjs`, no MCP surface):
  1. `loop.mjs meta_state_log_change` — change_dimension `"gate-logic"`, change_target
     `core/bound-artifacts.js + core/evaluate-write-gate.js + core/evaluate-bash-gate.js`,
     diff summary, reason citing this plan.
  2. `loop.mjs meta_state_resolve '{"id":"meta-260720T1447Z-the-runtime-state-jsonl-write-gate-at-tools-learning-loop-ma","resolution":"..."}'`
     citing the change-log id and the test files as evidence.

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/evaluate-bash-gate.js` (named runtime-state pattern pair, marker exemption, dedicated reason, comments).
- Modify (test): `tools/learning-loop-mastra/core/evaluate-bash-gate.test.js` — new block/ok cases for runtime-state with/without marker; no-bleed cases (records/meta-state/runtime-tracking still blocked with the runtime-state marker active); update the `PATH_WRITE_PATTERNS` count comment/test if the split changes exports.
- Modify: `tools/learning-loop-mastra/tools/handlers/mark-preflight-complete-tool.js` (description strings only).
- Audit: any test asserting the old records-reason text for runtime-state bash hits (grep for the reason substring in `__tests__/` and `core/`).

## Implementation Steps

1. **Red — bash-gate tests:** in `evaluate-bash-gate.test.js` add:
   - redirect + tee to `runtime-state.jsonl` without marker → block, reason names
     `gate_mark_preflight(surface:'runtime-state')`, reason does NOT contain the records text.
   - with an active marker (use the test's existing temp-root fixture that writes
     `runtime-state.jsonl`; write the marker into a surface coordination dir via the
     helper used by runtime-tracking tests) → `decision: "ok"`.
   - no-bleed: with the runtime-state marker active, `> records/x.md`, `> meta-state.jsonl`,
     `> .loop/runtime-tracking.json` still hard-block.
   Confirm red (current code: unconditional block with the records reason).
2. **Green — exemption:** split the runtime-state patterns, add the marker check and the
   dedicated reason in `evaluateBashGate`. Run the test file → green.
3. **Tool description:** update `mark-preflight-complete-tool.js` description strings.
4. **Grep audit:** `grep -rn "Direct writes to records" tools/learning-loop-mastra/__tests__ tools/learning-loop-mastra/core` — confirm no remaining test asserts the records reason for a runtime-state command.
5. **Verify:** `pnpm test` green; `pnpm gate:self-verify` green.
6. **Resolve finding:** run the `meta_state_log_change` then `meta_state_resolve` CLI calls
   (see Architecture). Confirm via `meta_state_list({id})` → `status: "resolved"`.

## Success Criteria

- [x] Bash gate blocks runtime-state shell writes without marker (dedicated canonical-workflow reason, not the records reason) and returns `ok` with an active marker.
- [x] No exemption bleed: records/**, meta-state.jsonl, .loop/runtime-tracking.json still hard-block with the runtime-state marker active.
- [x] `gate_mark_preflight` description covers direct `runtime-state.jsonl` writes.
- [x] `pnpm test` + `pnpm gate:self-verify` green.
- [x] Change-log entry written; finding `meta-260720T1447Z...` resolved citing it.

## Risk Assessment

- **R1 — exemption bleed (medium):** a sloppy `if (marker) skip path block` would also
  unblock records/meta-state. Mitigation: exempt only the runtime-state pattern match;
  pinned by the no-bleed tests.
- **R2 — pattern-count test drift (low):** `evaluate-bash-gate.test.js:252` asserts
  PATH_WRITE_PATTERNS composition ("3 records + 2×SURFACES preflight + 6 state files").
  Splitting the pair into a named export keeps the union identical; update the comment/test
  only if the exported shape changes.
- **R3 — GATE_COORD_DIR / temp-root fixture mismatch (low):** marker lookup scans SURFACES'
  coordination dirs under the test root; the test fixture must create the marker under the
  same root passed to `evaluateBashGate`. Follow the existing temp-root pattern in the test
  file (line 28) and the runtime-tracking marker tests.
- **R4 — operator workflow change (low):** operators who hit the old dead-end block now get
  a gated path. Mitigation: reason text + tool description are the source of truth; finding
  resolution records the change.
