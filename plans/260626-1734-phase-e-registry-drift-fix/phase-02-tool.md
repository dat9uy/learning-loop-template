---
phase: 2
title: "MCP consistency-check tool (TDD)"
status: pending
priority: P2
dependencies: [1]
---

# Phase 2: MCP consistency-check tool (TDD)

## Overview

Expose `consistencyCheck` as a read-only MCP probe via `meta_state_consistency_check`. Mirrors `meta-state-query-drift-tool.js` (the SP3 pattern at `tools/learning-loop-mastra/tools/legacy/meta-state-query-drift-tool.js:17-64`): no inputs, calls `resolveRoot` + `readRegistry`, returns the core's output, appends one gate-log line per invocation. Register in `manifest.json`. TDD: 8 tests written first.

## Requirements

### Functional
- Tool name: `meta_state_consistency_check` (matches existing kebab-case tool naming)
- No input schema in v1 (probe); schema fallback is `z.object({})` if MCP server requires non-empty body (verify against `tools/learning-loop-mastra/interface/`)
- Handler shape: try `resolveRoot` → `readRegistry` → `consistencyCheck(registry)` → `appendGateLog` → return result
- On `resolveRoot` failure: return `{ error: "context_load_failed", reason }` (no gate-log on early-return, matches SP3 + SP1/SP2)
- Gate-log shape per invocation: `{ event: "meta_state_consistency_check", drift_count: N }`
- Manifest entry appended at end of `tools/learning-loop-mastra/tools/legacy/manifest.json`

### Non-functional
- Read-only: handler does NOT modify `meta-state.jsonl` (verified by T-5 mtime test)
- Tool description references the active finding being implemented
- No new dependencies
- Single source file (no helpers split out — YAGNI)

## Architecture

The tool follows the established read-only MCP probe pattern:

```
handler(args) {
  try { root = resolveRoot() }
  catch (err) { return { error: "context_load_failed", reason: err.message } }
  registry = readRegistry(root)
  result = consistencyCheck(registry)
  appendGateLog(root, { event: "meta_state_consistency_check", drift_count: result.drift_count })
  return result
}
```

Tool layer is responsible for root resolution and registry reading. Core layer (`consistencyCheck`) is pure.

Manifest insertion:
```json
{ "file": "./tools/meta-state-consistency-check-tool.js", "export": "metaStateConsistencyCheckTool" }
```

Appended at end of `manifest.json` (no explicit ordering convention; existing entries appear in registration order).

## Related Code Files

- **Create:** `tools/learning-loop-mastra/tools/legacy/meta-state-consistency-check-tool.js` (~40 lines)
- **Create:** `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-consistency-check-tool.test.js` (8 tests, ~150 lines)
- **Modify:** `tools/learning-loop-mastra/tools/legacy/manifest.json` (append 1 line)

## Implementation Steps

### Step 1 (TDD): Write failing test T-1
Create test file with empty-registry test:

```javascript
import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { metaStateConsistencyCheckTool } from "../../tools/legacy/meta-state-consistency-check-tool.js";

let tempDir;
const originalEnv = process.env.GATE_ROOT;

test("meta_state_consistency_check: empty registry returns 0 drift (T-1)", async () => {
  tempDir = mkdtempSync(join(tmpdir(), "consistency-check-test-"));
  process.env.GATE_ROOT = tempDir;
  writeFileSync(join(tempDir, "meta-state.jsonl"), "");
  const result = await metaStateConsistencyCheckTool.handler({});
  const parsed = JSON.parse(result.content[0].text);
  assert.strictEqual(parsed.drift_count, 0);
  assert.deepStrictEqual(parsed.drift_events, []);
  process.env.GATE_ROOT = originalEnv;
  rmSync(tempDir, { recursive: true, force: true });
});
```

Run: expect 1 failure with module-not-found.

### Step 2 (TDD): Write failing tests T-2 through T-8
Add tests incrementally per researcher's Section 4.2:

| Test | What it covers |
|------|---------------|
| T-1 | Empty registry → 0 drift |
| T-2 | Seeded registry with one F-1 breach → 1 drift event |
| T-3 | Every call appends exactly 1 gate-log entry with correct shape |
| T-4 | `context_load_failed` path when `GATE_ROOT` is cleared |
| T-5 | Read-only — handler does NOT modify `meta-state.jsonl` (mtime check) |
| T-6 | Mixed findings + change-logs with 3 breaches → 3 events in stable order |
| T-7 | Lean event shape — each event has exactly the documented fields |
| T-8 | `drift_count === drift_events.length` |

### Step 3: Implement the tool
Create `tools/learning-loop-mastra/tools/legacy/meta-state-consistency-check-tool.js`:

```javascript
import { readRegistry } from "../../core/meta-state.js";
import { consistencyCheck } from "../../core/consistency-check.js";
import { resolveRoot } from "#lib/resolve-root.js";
import { appendGateLog } from "#lib/gate-logging.js";

export const metaStateConsistencyCheckTool = {
  name: "meta_state_consistency_check",
  description: "Detect drift between entry `status` and audit fields. Implements the remediation from finding meta-260614T1236Z. Read-only: the agent decides what to do with the result.",
  schema: {}, // Probe — no inputs. Verify against manifest consumer.
  handler: async () => {
    let root;
    try {
      root = resolveRoot();
    } catch (err) {
      return {
        content: [{ type: "text", text: JSON.stringify({
          error: "context_load_failed",
          reason: err.message,
        }) }],
      };
    }
    const registry = readRegistry(root);
    const result = consistencyCheck(registry);
    appendGateLog(root, {
      event: "meta_state_consistency_check",
      drift_count: result.drift_count,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  },
};
```

### Step 4: Register in manifest
Edit `tools/learning-loop-mastra/tools/legacy/manifest.json`: append at end:

```json
{ "file": "./tools/meta-state-consistency-check-tool.js", "export": "metaStateConsistencyCheckTool" }
```

### Step 5: Run all 8 tests
`node --test tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-consistency-check-tool.test.js` — expect 8/8 GREEN.

## Success Criteria

- [ ] All 8 tool tests GREEN
- [ ] Tool registered in `manifest.json`
- [ ] Gate-log entries have shape `{ event: "meta_state_consistency_check", drift_count: N }`
- [ ] Tool is read-only (verified by T-5)
- [ ] `context_load_failed` returned when `resolveRoot` throws (T-4)
- [ ] Drift events sorted deterministically (T-6)
- [ ] Lean event shape per event (T-7)
- [ ] TDD discipline: tests written first, implementation satisfies tests

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| MCP server requires non-empty `schema` body | Step 3 uses `{}`; if consumer rejects, swap to `z.object({}).strict()`; verify against `tools/learning-loop-mastra/interface/` consumers |
| Gate-log writes on every call fill the log quickly | Acceptable — this is a diagnostic tool, not high-frequency; matches SP3 behavior |
| Tool description is too terse for operators | Description references the active finding + the read-only nature; matches SP3 description style |
| Manifest insertion breaks tool loading | Append at end (no reorder); existing tests verify the manifest shape |
| `readRegistry` returns stale data due to read cache | T-5 mtime test guards against accidental writes; read-side caching is acceptable |

## TDD Gate

`node --test tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-consistency-check-tool.test.js` shows 8/8 pass.

If any test fails, the implementation is incomplete — do not proceed to Phase 3.