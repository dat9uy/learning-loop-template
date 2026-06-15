---
phase: 3
title: "decision-log — cross-surface .gate-decision.log atomic append per gate call"
status: shipped
priority: P1
effort: "2h"
dependencies: ["phase-01-stderr-visibility", "phase-02-override-marker"]
---

# Phase 3: decision-log

## Overview

Add a per-call audit trail for the bash gate. Every gate call appends one JSON line to `.gate-decision.log` (in both surfaces). The log captures the decision shape from Phases 1-2 plus a few call-site fields (`ts`, `command_prefix`). The `skipped_via_override` field in the plan's "unified decision shape" is **aspirational** (per operator decision 2026-06-15; see `plans/reports/code-reviewer-260615-1630-bash-gate-step-2-spec-deviations.md` Q1) — the override audit trail lives in `runtime-state.jsonl` via the `gate_override` MCP tool, not the decision log. The decision log's `skipped_via_override` field is hard-coded to `false` everywhere; removing it from the schema is CLEANUP-batch work.

**Why not in `runtime-state.jsonl`:** the bash gate is high-frequency (every command). `runtime-state.jsonl` is the operator-writable surface (decisions, budgets, observations). Mixing per-call gate decisions in would bloat the operator surface and dilute the meta-state semantics. The decision log lives in `coordination/`, is read by the recurrence tracker (Phase 4), and is NOT in `runtime-state.jsonl`.

**Why not rotation:** ship first, rotate later. The log grows ~50-200 bytes per call; a heavy session (~10k calls) generates ~2MB. A separate plan handles rotation when the file actually grows. For now, write-temp + rename per call keeps the file consistent under concurrent appends.

## Requirements

Functional:
- New file: `tools/learning-loop-mcp/core/gate-decision-log.js` — exports `appendDecisionLog(root, entry)` and `readDecisionLog(root, options)`.
- `bash-gate.js#main` calls `appendDecisionLog` once per non-ok decision (block / escalate); the ok path is NOT logged (high frequency, low signal).
- Decision log schema:
  ```json
  {
    "ts": "2026-06-15T13:00:00.000Z",
    "command_prefix": "node -e \"console.log('do not cre...",   // first 80 chars
    "rule_id": "rule-no-new-artifact-types" | null,
    "decision": "ok" | "block" | "escalate",
    "reason": "...",
    "matched_pattern": "..." | null,
    "skipped_via_override": false  // ASPIRATIONAL — see plan.md § "unified decision shape"
  }
  ```
- Write is atomic per call: write-temp + rename (Step 1's `writeToAllSurfaces` does this).
- Write is fail-open: if the write fails (disk full, permissions), the gate still works; the failure is logged to stderr (which the agent will see if the gate blocked).
- Read: `readDecisionLog(root, { since: ISO })` returns entries from all surfaces whose `ts >= since`, deduped by `ts + command_prefix + rule_id`.
- New test: `tools/learning-loop-mcp/__tests__/gate-decision-log.test.js` (4 tests).

Non-functional:
- The `command_prefix` is the first 80 chars of the command, with newlines/tabs replaced by spaces (one-line log entries).
- The decision log file is NOT in the write gate's path-write patterns (no `>` redirect of `echo ... > .gate-decision.log` is allowed). The bash gate writes it via `appendFileSync`; the write gate does NOT include the decision log in its allowlist. (The bash gate is the only writer.)
- The decision log is rotated in a future plan; not in this phase.

## Architecture

### Writer (in `core/gate-decision-log.js`)

```js
// tools/learning-loop-mcp/core/gate-decision-log.js
import { writeToAllSurfaces } from "./surfaces.js";

/**
 * Append one entry to the cross-surface decision log.
 * Write is atomic per call (write-temp + rename, via writeToAllSurfaces).
 * Fail-open: errors are swallowed; the gate's contract is preserved.
 */
export function appendDecisionLog(root, entry) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry });
  try {
    writeToAllSurfaces(root, ".gate-decision.log", `${line}\n`);
  } catch (err) {
    // Fail-open: do not throw; the gate's contract is the exit code, not the log.
    console.error(`gate-decision-log: append failed: ${err.message}`);
  }
}
```

The line is the FULL log file (not appended to existing content). This is intentional: `writeToAllSurfaces` writes the new content atomically; the OLD content is lost. **This is a bug** — see Risk Assessment. Decision: ship the bug as-is in Phase 3 and fix in a follow-up; the recurrence tracker is forward-looking (it only needs recent entries), and the per-call JSON is small. Rotation is a separate concern.

Wait — this is a critical bug. Let me re-design: the helper writes the WHOLE file content (not append). For an append-only log, this loses history on every call.

### Corrected architecture: per-call append, not writeToAllSurfaces

The decision log is **append-only** and **multi-call**. `writeToAllSurfaces` is a write-replace (not append). The decision log needs a different primitive: per-call `appendFileSync` to the surface path, with a fallback to read-merge-write if the file exists.

```js
// tools/learning-loop-mcp/core/gate-decision-log.js (revised)
import { appendFileSync, writeFileSync, renameSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { SURFACES } from "./surfaces.js";

/**
 * Append one entry to the cross-surface decision log.
 * Uses appendFileSync (per call) for atomicity within a single surface.
 * Cross-surface is sequential (best-effort: one surface failure does not abort the others).
 * Fail-open: errors are swallowed.
 */
export function appendDecisionLog(root, entry) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry });
  for (const surface of SURFACES) {
    const path = join(root, surface, "coordination", ".gate-decision.log");
    try {
      mkdirSync(dirname(path), { recursive: true });
      appendFileSync(path, `${line}\n`, "utf8");
    } catch (err) {
      console.error(`gate-decision-log: append to ${path} failed: ${err.message}`);
    }
  }
}
```

The reader in Phase 4 uses `readFromAllSurfaces(root, ".gate-decision.log")` (the default `[]` shape) and dedupes by `ts + command_prefix + rule_id`.

**Why not Step 1's helper directly:** `writeToAllSurfaces` is the WRONG primitive for an append-only log. The helper is for "write a complete file across all surfaces" (override marker, not decision log). The decision log's writer is a thin loop over `SURFACES` with `appendFileSync`. The helper's `SURFACES` constant is still the source of truth for the surface list.

## Related Code Files

- Create: `tools/learning-loop-mcp/core/gate-decision-log.js` (~50 lines, append + read).
- Modify: `tools/learning-loop-mcp/hooks/bash-gate.js` — add 1 import, call `appendDecisionLog` in the block/escalate paths (~6 lines).
- Create: `tools/learning-loop-mcp/__tests__/gate-decision-log.test.js` (~100 lines, 4 tests).
- No other files touched.

## Implementation Steps (TDD)

1. **Red — write the test file first.** Create `__tests__/gate-decision-log.test.js` with:
   - `test("appendDecisionLog appends one line per call to all surfaces")` — call 3 times; read the file; assert 3 lines, each valid JSON, all with the same schema.
   - `test("appendDecisionLog line schema: ts, command_prefix, rule_id, decision, reason, matched_pattern, skipped_via_override")` — assert each field is present and correctly typed.
   - `test("appendDecisionLog fails open on write error")` — stub `appendFileSync` to throw; assert the call does not throw; the gate's contract is preserved.
   - `test("appendDecisionLog concurrent calls do not corrupt the file")` — spawn 10 parallel calls; read the file; assert 10 well-formed JSON lines (no interleaved garbage, no truncated lines).
   - `test("readDecisionLog returns entries from all surfaces, deduped")` — write 2 entries to `.claude/`, 2 to `.factory/` (with one duplicate); call `readDecisionLog(root, { since: <before all> })`; assert the result has 3 unique entries (the duplicate is deduped).
2. **Run tests; confirm RED.** `pnpm test -- gate-decision-log` — all fail with "Cannot find module '../core/gate-decision-log.js'".
3. **Green — implement the writer + reader.** Create `core/gate-decision-log.js` per the corrected architecture. Re-run tests; all pass.
4. **Green — wire into `bash-gate.js`.** Edit `bash-gate.js` per the architecture. Re-run tests; all pass.
5. **Refactor.** JSDoc, naming, dead-code removal. Re-run tests.
6. **Whole-plan consistency check.** `grep -n "gate-decision-log\|appendDecisionLog\|readDecisionLog" tools/learning-loop-mcp/` — confirm 4-5 hits (the new file + 1 import + 2-3 uses); no unintended touch points.

## Success Criteria

- [x] `core/gate-decision-log.js` exists; exports `appendDecisionLog` and `readDecisionLog`.
- [x] `bash-gate.js` calls `appendDecisionLog` in the block/escalate paths.
- [x] `__tests__/gate-decision-log.test.js` exists with 5+ passing tests.
- [x] `pnpm test` shows 0 new failures; all 840+ existing tests still pass.
- [x] Manual smoke: a gate block produces a new line in `.claude/coordination/.gate-decision.log` and `.factory/coordination/.gate-decision.log`.

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Concurrent `appendFileSync` calls interleave bytes | The test pins atomicity (10 parallel calls produce 10 well-formed lines). `appendFileSync` is single-syscall on POSIX for small writes; Windows has different semantics but the project's coordination dirs are POSIX. |
| Decision log grows unbounded | **Validation Session 1 decision:** ship without rotation. Add a follow-up `plans/<date>-gate-decision-log-rotation/` plan when the file actually grows past 1MB. The log is in `coordination/`, not the project root, so it doesn't affect git or other tools. YAGNI. |
| `writeToAllSurfaces` looked like the right primitive but isn't | Caught during planning. The corrected design uses `appendFileSync` directly with `SURFACES` from the helper. The helper's `SURFACES` constant is the source of truth; the writer is a thin per-surface loop. |
| Phase 4 reads from `readFromAllSurfaces` (whole-file), not line-by-line | The default shape is `[{ surface, content, parsed }]`. For an append-only log, `parsed` would be a string of all lines; the reader in Phase 4 splits on `\n` and parses each line. |
| Fail-open hides log corruption | Acceptable per the report. The gate's contract is the exit code; the log is a forensic aid. If a future investigation finds the log is missing entries, the file size / line count is the diagnostic. |

## Security Considerations

- The decision log is in `coordination/`, not in the project root. The write gate already allows coordination writes via the bash gate's actor path. No new write path.
- The `command_prefix` is truncated to 80 chars and one-line (newlines/tabs replaced by spaces). The log is well-formed; downstream tools can parse it line-by-line.
- No secrets are written to the decision log. The `command` is a command the user/agent invoked; secrets passed via env vars are not in the command itself. Safe.
- The decision log is read by the recurrence tracker (Phase 4), which is operator-mediated. No untrusted reader.

## Next Steps

Phase 4: recurrence tracker. The tracker reads `.gate-decision.log` (from all surfaces, via `readFromAllSurfaces`), groups by `rule_id + command_prefix_normalized`, and auto-files `meta_state_report` findings when a group exceeds the threshold. The decision log is the data source; the tracker is the consumer.
