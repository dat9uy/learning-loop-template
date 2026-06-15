---
phase: 2
title: "override-marker — writeToAllSurfaces .gate-override + gate_override MCP tool"
status: shipped
priority: P1
effort: "3h"
dependencies: ["phase-01-stderr-visibility"]
---

# Phase 2: override-marker

## Overview

Add the in-session override mechanism. Two pieces:

1. **`.gate-override` marker file** in `coordination/` (both surfaces), written via Step 1's `writeToAllSurfaces` helper. Schema: `{ rule_ids: string[], ttl_seconds: number, operator_note: string, created_at: ISO }`. TTL checked at read time; expired markers are ignored.
2. **`gate_override` MCP tool** at `tools/learning-loop-mcp/tools/gate-override-tool.js` (new file). Inputs: `{ rule_id, ttl_seconds, operator_note }`. Validates rule_id exists, ttl_seconds > 0, operator_note non-empty. Writes the marker. Appends an audit entry to `runtime-state.jsonl` via `runtimeStateRecordTool` or a direct `appendFileSync` (the gate's actor path is itself auditable).

The reader in `core/gate-logic.js#applyPromotedRules` checks the marker once per call (cached for 1s per root), builds a `Set<string>` of rule_ids to skip, and short-circuits the rule loop for those ids.

**Why this position:** Phase 1 made the rule_id visible on stderr. The agent/operator can now read the rule_id and call `gate_override` to skip it. Without Phase 1, the agent couldn't know what to override.

## Requirements

Functional:
- New file: `tools/learning-loop-mcp/core/gate-override.js` — exports `readGateOverride(root)` (returns active override or `null`) and `writeGateOverride(root, { rule_id, ttl_seconds, operator_note })`.
- New MCP tool: `tools/learning-loop-mcp/tools/gate-override-tool.js` with `gate_override` name.
- New test: `tools/learning-loop-mcp/__tests__/gate-override.test.js` (5 tests).
- `core/gate-logic.js#applyPromotedRules` consults the override set before each rule check. If `rule.id` is in the set, the rule is skipped (with a `console.warn` for audit visibility).
- Marker is written to all surfaces via `writeToAllSurfaces` (uses Step 1's helper).
- Marker is read from all surfaces via `readFromAllSurfaces(root, ".gate-override", { first: true })` (first valid wins; mirrors `readLastOperatorMessage` priority).
- Manifest update: add `{ "file": "./tools/gate-override-tool.js", "export": "gateOverrideTool" }` to `tools/manifest.json`.
- Agent-manifest update: add `"gate_override"` to the `gate` group in `agent-manifest.json`.

Non-functional:
- Marker write is best-effort per surface (Step 1's helper behavior; failures swallowed).
- Marker read is fail-quiet (missing file / malformed JSON → no override).
- Override is TTL'd: `ttl_seconds: 3600` (1h) is the default; `> 86400` rejected.
- Unknown `rule_id` (not in `loadPromotedRules(root)`) is rejected by the tool with a clear error.
- Empty `operator_note` is rejected.
- Cached reads: `readGateOverride(root)` is memoized for 1 second per root (mtime-based invalidation), matching the `loadPromotedRules` pattern.

## Architecture

### Marker schema

```json
{
  "rule_ids": ["rule-no-new-artifact-types"],
  "ttl_seconds": 3600,
  "operator_note": "False positive on node -e body — see meta-260614T2141Z",
  "created_at": "2026-06-15T13:00:00.000Z"
}
```

The marker is a single JSON object (not a list). Multiple `gate_override` calls on the SAME surface merge into one marker: each call appends to the existing `rule_ids` set, refreshing `ttl_seconds` and `operator_note` to the latest call's values.

**Cross-surface read semantics (decided in Validation Session 1):** **first valid wins** (priority `.claude` → `.factory`). When `readGateOverride` runs, it consults `.claude/coordination/.gate-override` first; if that marker is missing or expired, it falls through to `.factory/coordination/.gate-override`. The two surfaces' markers are NOT merged. This mirrors `readLastOperatorMessage`'s existing pattern and keeps surface-specific overrides isolated.

### Reader (in `core/gate-logic.js`)

```js
// tools/learning-loop-mcp/core/gate-logic.js (inside applyPromotedRules, before the rule loop)
import { readGateOverride } from "./gate-override.js";

const override = readGateOverride(root);
const overrideSet = override ? new Set(override.rule_ids) : new Set();

for (const rule of rules) {
  if (rule.status !== "active") continue;
  if (rule.enforcement !== "gate") continue;
  if (overrideSet.has(rule.id)) {
    console.warn(`Rule ${rule.id}: skipped via gate override (${override.operator_note})`);
    continue;
  }
  // ... existing pattern match logic ...
}
```

The override applies ONLY to the `for (const rule of rules)` loop. It does not affect `matchConstraintPattern` (constraint patterns) or `evaluateWritePath` (path writes). Those have their own debounce mechanisms (observations for constraint patterns, hard_block for path writes).

### MCP tool

```js
// tools/learning-loop-mcp/tools/gate-override-tool.js
import { z } from "zod";
import { writeGateOverride } from "#mcp/core/gate-override.js";
import { loadPromotedRules } from "#mcp/core/gate-logic.js";
import { resolveRoot } from "#lib/resolve-root.js";

export const gateOverrideTool = {
  name: "gate_override",
  description: "Override a promoted rule for the current session...",
  schema: {
    rule_id: z.string().describe("Rule id to skip (must be an active promoted rule)"),
    ttl_seconds: z.number().int().positive().max(86400).default(3600),
    operator_note: z.string().min(1).describe("Why the override is needed (audit trail)"),
  },
  handler: async ({ rule_id, ttl_seconds, operator_note }) => {
    const root = resolveRoot();
    const rules = loadPromotedRules(root);
    if (!rules.find((r) => r.id === rule_id)) {
      return { content: [{ type: "text", text: JSON.stringify({ error: `unknown rule_id: ${rule_id}` }) }], isError: true };
    }
    writeGateOverride(root, { rule_id, ttl_seconds, operator_note });
    return { content: [{ type: "text", text: JSON.stringify({ marked: true, rule_id, ttl_seconds, operator_note }) }] };
  },
};
```

The audit entry is written to `runtime-state.jsonl` via the existing `runtimeStateRecordTool` (or a direct call to its handler; the tool's `appendGateLog` helper or the `runtime-state-record` MCP tool's logic). Phase 2 keeps the audit simple: `appendFileSync` on `runtime-state.jsonl` with the override entry. Phase 4 (recurrence tracker) can read these entries for analysis.

## Related Code Files

- Create: `tools/learning-loop-mcp/core/gate-override.js` (~60 lines, read+write+cache).
- Create: `tools/learning-loop-mcp/tools/gate-override-tool.js` (~40 lines, MCP tool).
- Create: `tools/learning-loop-mcp/__tests__/gate-override.test.js` (~100 lines, 5 tests).
- Modify: `tools/learning-loop-mcp/core/gate-logic.js` — add 1 import, insert 4 lines before the rule loop in `applyPromotedRules` (~5 lines total).
- Modify: `tools/learning-loop-mcp/tools/manifest.json` — add 1 entry.
- Modify: `tools/learning-loop-mcp/agent-manifest.json` — add `"gate_override"` to the `gate` group.
- No other files touched.

## Implementation Steps (TDD)

1. **Red — write the test file first.** Create `__tests__/gate-override.test.js` with:
   - `test("writeGateOverride creates marker on all surfaces")` — calls write; reads both `.claude/coordination/.gate-override` and `.factory/coordination/.gate-override`; asserts both exist with the same content.
   - `test("readGateOverride returns null when no marker")` — fresh root, no marker; returns `null`.
   - `test("readGateOverride returns marker when valid")` — writes a marker with `ttl_seconds: 3600`; reads it; asserts the rule_ids and operator_note round-trip.
   - `test("readGateOverride returns null when expired")` — writes a marker with `created_at = (now - 7200s)` and `ttl_seconds: 3600`; reads; asserts `null` (TTL exceeded).
   - `test("applyPromotedRules skips rule in override set")` — loads rules containing `rule-foo`; writes an override for `rule-foo`; calls `applyPromotedRules("command matching rule-foo", null, rules)`; asserts the result is `{ decision: "ok" }` (no escalation).
   - `test("applyPromotedRules does NOT skip rule not in override set")` — same setup but override is for `rule-bar`; asserts escalation happens for `rule-foo`.
   - `test("gate_override tool rejects unknown rule_id")` — call the tool handler with a non-existent rule_id; asserts the response has `isError: true` and a clear message.
   - `test("gate_override tool rejects empty operator_note")` — zod schema rejects `operator_note: ""`.
   - `test("gate_override tool rejects ttl_seconds > 86400")` — zod schema rejects.
2. **Run tests; confirm RED.** `pnpm test -- gate-override` — all fail with "Cannot find module '../core/gate-override.js'".
3. **Green — implement the reader + writer.** Create `core/gate-override.js` with `readGateOverride` (uses `readFromAllSurfaces`, TTL filter, cache) and `writeGateOverride` (uses `writeToAllSurfaces`). Re-run tests; all pass.
4. **Green — implement the MCP tool.** Create `tools/gate-override-tool.js`. Re-run tests; all pass.
5. **Green — wire the override into `applyPromotedRules`.** Edit `core/gate-logic.js` per the architecture. Re-run tests; all pass.
6. **Green — update manifests.** Add to `tools/manifest.json` and `agent-manifest.json`. Restart the MCP server to pick up the new tool. Manual smoke: call `gate_override` from the agent and verify the rule is skipped.
7. **Refactor.** JSDoc, naming, dead-code removal. Re-run tests.
8. **Whole-plan consistency check.** `grep -n "gate-override\|gateOverride\|readGateOverride" tools/learning-loop-mcp/` — confirm 4-5 hits (the 2 new files + 1 import + 1-2 uses); no unintended touch points.

## Success Criteria

- [x] `core/gate-override.js` exists; exports `readGateOverride` and `writeGateOverride`.
- [x] `tools/gate-override-tool.js` exists; exports `gateOverrideTool` with name `"gate_override"`.
- [x] `applyPromotedRules` consults the override set; rules in the set are skipped with a `console.warn`.
- [x] `__tests__/gate-override.test.js` exists with 7+ passing tests.
- [x] `tools/manifest.json` and `agent-manifest.json` include the new tool.
- [x] `pnpm test` shows 0 new failures; all 840+ existing tests still pass.
- [x] Manual smoke: `gate_override({ rule_id: "rule-foo", operator_note: "test" })` writes the marker; the next bash call matching `rule-foo` is not escalated.

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Override marker TTL race — write happens between read and use | The 1-second cache accepts a 1s window of staleness; this is the same pattern as `loadPromotedRules`. Acceptable for a debugging tool. |
| Operator overrides a real rule (abuse) | TTL caps blast radius (1h default, 24h max). Override requires `operator_note` (audit trail). Override is logged to `runtime-state.jsonl` for the operator to review. |
| Tool actor path bypasses meta-state | Phase 2 does NOT call `meta_state_report` for the override; it calls `appendFileSync` on `runtime-state.jsonl` directly. This is acceptable per the report (Position 1C analysis) because the override is operator-mediated, not a loop-self-diagnostic. Future: a `gate_override_audit` loop-design could route through `meta_state_log_change`. |
| Multi-surface write race (override on `.claude` succeeds, `.factory` fails) | Best-effort per surface (Step 1's helper behavior). The override still takes effect on the surface that succeeded. Operator's session may be on either surface; the marker is checked on the relevant surface. |

## Security Considerations

- The override is operator-mediated (via the MCP tool). The MCP tool is exposed to the agent, not to untrusted input. Safe.
- `operator_note` is required for the audit trail; empty notes rejected. Safe.
- The marker file is in `coordination/` (not the project root); the write gate already allows coordination writes. No new write path.
- `gate_override` does NOT cross the side-effect-import or hard-block rules. Those are unconditional; only `applyPromotedRules`'s regex/glob rules can be overridden. The constraint-pattern layer (constraintMatch) and write-path layer (evaluateWritePath) are not affected.

## Next Steps

Phase 3: decision log. The decision log is the per-call audit trail that feeds the recurrence tracker in Phase 4. With Phases 1 (decision visibility) and 2 (override) in place, the override is fully auditable: the `gate_override` tool writes an entry to `runtime-state.jsonl` (`appendOverrideAudit` in `gate-override.js:74-92`), so the operator can answer "who overrode what, when, why" without consulting the decision log. The `skipped_via_override` field in the plan's "unified decision shape" is aspirational (per operator decision 2026-06-15; see `plans/reports/code-reviewer-260615-1630-bash-gate-step-2-spec-deviations.md` Q1); the audit trail lives in `runtime-state.jsonl`, not the decision log.
