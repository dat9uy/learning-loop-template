---
phase: 4
title: "MechanismB-CrossCuttingAndToolReimpl"
status: pending
priority: P2
dependencies: [3]
effort: "0.5d"
---

# Phase 4: Mechanism B — Cross-Cutting Helpers + meta_state_relationships Reimplementation

## Overview

Wires the cross-cutting helpers (`validateCrossRefs`, `findOrphans`, `outboundRefsAll`, `factoryFor`) in `core/entry/index.js`, updates `core/README.md` with the soft-inversion contract + ADR comment, and re-implements `meta_state_relationships` MCP tool on top of the new factories. After this phase, the canonical graph API is the factory methods, and `meta_state_relationships` becomes a thin MCP-protocol wrapper around them.

This is Phase 4 of two for Mechanism B. Phase 5 writes the integration tests and snapshot test.

## Requirements

- **Functional:** `core/entry/index.js` exports `factoryFor(entry)`, `validateCrossRefs(root)`, `findOrphans(root)`, `outboundRefsAll(root)`.
- **Functional:** `factoryFor(entry)` dispatches by `entry_kind` and returns the correct factory instance.
- **Functional:** `validateCrossRefs(root)` returns `{orphans: [{from, to, field}]}` for every outbound ref whose target doesn't exist.
- **Functional:** `meta_state_relationships` MCP tool returns byte-identical output to the current implementation for the same `id` + `direction` (verified by snapshot test in Phase 5).
- **Non-functional:** `core/README.md` documents the soft-inversion contract and references the ADR-style reversion clause.

## Architecture

**`core/entry/index.js`** — the canonical graph API:

```js
import { createFinding } from "./finding.js";
import { createRule } from "./rule.js";
import { createChangeLog } from "./change-log.js";
import { createLoopDesign } from "./loop-design.js";
import { readRegistry } from "../meta-state.js";

export { createFinding, createRule, createChangeLog, createLoopDesign };

// Deep-freeze helper: Object.freeze is shallow; nested objects in Zod-parsed
// data (e.g., data.verification = z.object({}).passthrough()) remain mutable.
// Recursively freeze to enforce the "frozen factory outputs" contract.
function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  Object.values(value).forEach((v) => deepFreeze(v, seen));
  return Object.freeze(value);
}

export function factoryFor(entry) {
  // Default entry_kind to "finding" for legacy registry rows missing it.
  // Mirrors the post-load coercion in core/meta-state.js:355-356.
  const kind = entry.entry_kind ?? "finding";
  switch (kind) {
    case "finding":     return createFinding(entry);
    case "rule":        return createRule(entry);
    case "change-log":  return createChangeLog(entry);
    case "loop-design": return createLoopDesign(entry);
    default:
      throw new Error(`Unknown entry_kind: ${kind}`);
  }
}

export function validateCrossRefs(root) {
  const registry = readRegistry(root);
  const orphans = [];
  for (const entry of registry) {
    const factory = factoryFor(entry);
    for (const ref of factory.outboundRefs()) {
      const target = registry.find(
        (e) => e.id === ref.id && e.entry_kind === ref.kind
      );
      if (!target) {
        orphans.push({ from: entry.id, to: ref.id, field: ref.field });
      }
    }
  }
  return { orphans };
}

export function findOrphans(root) {
  return validateCrossRefs(root).orphans;
}

export function outboundRefsAll(root) {
  const registry = readRegistry(root);
  const graph = new Map();
  for (const entry of registry) {
    const factory = factoryFor(entry);
    graph.set(entry.id, factory.outboundRefs());
  }
  return graph;
}
```

**`meta-state-relationships-tool.js` (re-implementation)** — same wire shape, new internal path. **Preserves the dual-field `promoted_to_rule` migration logic** from the current tool (lines 43-53): when a finding lacks `data.promoted_to_rule`, the reimplementation falls back to `origin_inverse.get(id)?.[0]` to recover the rule id.

```js
// Before (current): scan raw registry rows, build inverse indexes inline.
// After (this phase): dispatch via factoryFor, delegate to outboundRefs()/inboundRefs(root).

import { factoryFor } from "../../core/entry/index.js";
import { readRegistry } from "../../core/meta-state.js";
import { buildInverseIndexes } from "../../core/loop-introspect.js";  // still needed for dual-field fallback
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

export const metaStateRelationshipsTool = {
  name: "meta_state_relationships",
  description: "...",  // unchanged
  schema: { ... },    // unchanged
  handler: async ({ id, direction = "both" }) => {
    const root = resolveRoot();
    const entries = readRegistry(root);
    const entry = entries.find((e) => e.id === id);
    if (!entry) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "entry_not_found", id }) }],
      };
    }
    const factory = factoryFor(entry);

    const result = {
      id,
      direction,
      entry_kind: entry.entry_kind ?? "finding",
    };

    if (direction === "outbound" || direction === "both") {
      const refs = factory.outboundRefs();

      // Dual-field fallback for promoted_to_rule (legacy migration):
      // if the finding doesn't have promoted_to_rule declared, look up
      // origin_inverse to find the rule that originated from this finding.
      // Mirrors the current tool's lines 43-53.
      if (entry.entry_kind === "finding" || entry.entry_kind === undefined) {
        const hasPromoted = refs.some((r) => r.field === "promoted_to_rule");
        if (!hasPromoted) {
          const inverse = buildInverseIndexes(entries);
          const rulesFromOrigin = inverse.origin_inverse.get(id);
          if (rulesFromOrigin && rulesFromOrigin.length > 0) {
            refs.push({ kind: "rule", id: rulesFromOrigin[0], field: "promoted_to_rule" });
          }
        }
      }

      // Build outbound in legacy field order (origin, addresses, consolidated_into,
      // supersedes, promoted_to_rule, proposed_design_for) to preserve the snapshot.
      // Phase 5 uses deepStrictEqual on parsed JSON, not string compare, so key order
      // is irrelevant; preserve legacy order anyway for byte-identity with old wire shape.
      result.outbound = refs.length > 0
        ? Object.fromEntries(refs.map((r) => [r.field, r.id]))
        : null;
    }

    if (direction === "inbound" || direction === "both") {
      const refs = factory.inboundRefs(root);
      // Preserve the 6 inbound key names from the current tool:
      // consolidated_by, addressed_by, superseded_by, origin_of, promoted_from, reopened_by
      result.inbound = groupByField(refs);
    }

    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "meta_state_relationships",
      id,
      direction,
    });

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
};
```

The wire shape is preserved by the existing test (Phase 5 locks it via snapshot).

**`core/README.md` update** — add the soft-inversion contract section:

```markdown
## Soft inversion (Mechanism B)

- **Schemas = validation source.** `core/meta-state.js` exports the canonical Zod schemas. They are the runtime-checked layer.
- **Factories = ergonomic surface.** `core/entry/{finding,rule,change-log,loop-design}.js` wrap the schemas. Every factory returns a **deep-frozen** object with status helpers + relationship methods.
- **Schema reachable via `factoryInstance.schema`** (NOT `factory.schema` — the latter is the factory function, which has no `.schema` property). Reference equality (not copy). Any caller needing the raw Zod schema reads it off a factory instance.

> **ADR (2026-06-27):** Soft inversion by operator decision. Revisit if (a) `.shape` consumers drop below 3, OR (b) factory methods start needing cross-cutting logic that schemas can't express.
>
> **Load-bearing invariant:** `metaState*EntrySchema` must remain a single module-level constant. Any future wrapping of the schema (`.partial()`, `.brand()`, `.merge()`, etc.) breaks the `instance.schema === canonicalSchema` reference-equality contract that Phase 5's soft-inversion safeguard test enforces. Such wrapping requires an ADR (see `docs/decisions/` if it exists, or open a new one). The existing `buildPatchSchemaFor(kind)` call at `core/meta-state.js:299` already wraps the rule schema with `.partial().strict()` — that's the exception, not the rule.
```

## Related Code Files

- Create: `tools/learning-loop-mastra/core/entry/index.js`
- Modify: `tools/learning-loop-mastra/core/README.md` (add "Soft inversion" section)
- Modify: `tools/learning-loop-mastra/tools/legacy/meta-state-relationships-tool.js` (reimplement via `factoryFor`)

No other files modified.

## Implementation Steps

1. **Write the cross-cutting helper tests FIRST** (TDD red phase — inline a minimal stub here; Phase 5 expands the suite).
   - Inline a one-line stub test in `__tests__/phase-e-foundation/entry-index-stub.test.js`: assert `factoryFor({entry_kind: "unknown"})` throws. (Phase 5 will replace this with the full `core/entry/index.test.js` suite, per validation decision 2026-06-27 to use sibling pattern.)
   - This replaces the original plan's "run the unit test scaffold from Phase 5" reference, which was a chicken-and-egg ordering impossible (Phase 5 hadn't written the tests at Phase 4 time) — red-team Finding F4.

2. **Write `core/entry/index.js`.**
   - Implement `factoryFor(entry)`, `validateCrossRefs(root)`, `findOrphans(root)`, `outboundRefsAll(root)` per the architecture above.
   - Re-export the 4 factories.

3. **Update `core/README.md`.**
   - Append a new section after the existing "How to add a new core file" section.
   - Title: "## Soft inversion (Mechanism B)"
   - Body: the 3-point contract from the brainstorm §4.5 + the ADR-style comment.
   - Link to `core/entry/` directory.

4. **Reimplement `meta-state-relationships-tool.js`.**
   - Replace the inline `buildInverseIndexes` + manual ref-walking with `factoryFor(entry).outboundRefs()` and `factoryFor(entry).inboundRefs(root)`.
   - Add a small `groupByField(refs)` helper inside the tool file (or inline) that turns `[{field: "origin", id: "X"}]` into `{origin: "X"}` to match the existing wire shape.
   - Verify the wire shape by reading the existing tool test (if any) or by running the tool manually with the project's test fixture.

5. **Build the snapshot fixture infrastructure BEFORE running tests** (red-team Finding C3 — without this, the snapshot test is theatrical).
   - Create `__tests__/phase-e-foundation/fixtures/meta-state-fixtures.js` exporting `FINDING_FIXTURE`, `RULE_FIXTURE`, `CHANGE_LOG_FIXTURE`, `LOOP_DESIGN_FIXTURE` with full canonical fields per `meta-state.js` schemas. **One fixture MUST be a legacy finding without `promoted_to_rule`** — this exercises the dual-field migration logic that the reimplementation must preserve.
   - Create a `writeRegistry(tempDir, fixtures)` helper that writes `meta-state.jsonl` to a `mkdtempSync` directory using the canonical `writeEntry` from `core/meta-state.js`.
   - Capture the current wire output: for each fixture, call the OLD `meta_state_relationships` handler against the temp registry (using `resolveRoot` shimmed to the temp dir), serialize the response, save to `__tests__/phase-e-foundation/snapshots/{finding,rule,change-log,loop-design}.json`.
   - The snapshot files become the red baseline — the reimplementation must produce byte-identical (or deepStrictEqual-equal) output.

6. **Run the unit tests** (Phase 5's tests, written but probably failing).
   - `node --test tools/learning-loop-mastra/core/entry/*.test.js`
   - Expected: green for factory tests; cross-cutting tests green; snapshot test green.

7. **Run the full test suite.**
   - `pnpm test`
   - Expected: all baseline tests pass; 4 new factory test files; 1 new cross-cutting test; 1 new snapshot test; 1 new fixture file.

8. **Commit.**
   - One commit: `feat(core): add entry/index.js cross-cutting helpers + reimplement meta_state_relationships (Mechanism B)`
   - Body: `factoryFor dispatches by entry_kind; validateCrossRefs/findOrphans/outboundRefsAll cover the graph API. meta_state_relationships reimplemented on factories with snapshot-locked wire shape. All tests green.`

## Success Criteria

- [ ] `core/entry/index.js` exists and exports the 4 factories + 4 helpers
- [ ] `factoryFor(entry)` returns the correct factory for each of the 4 entry kinds
- [ ] `validateCrossRefs(root)` returns empty orphans for the current registry (snapshot)
- [ ] `findOrphans(root)` is an alias for `validateCrossRefs(root).orphans`
- [ ] `outboundRefsAll(root)` returns a Map of id → outbound refs for every entry
- [ ] `meta_state_relationships` MCP tool returns identical output to the snapshot, including a legacy-finding fixture (no `promoted_to_rule`) that exercises the dual-field migration logic
- [ ] `core/README.md` has a "Soft inversion (Mechanism B)" section with the ADR-style comment naming the load-bearing invariant
- [ ] All existing tests still pass (baseline measured at Phase-0)

## Risk Assessment

- **R1 (factoryFor's switch falls through for unknown kinds):** the existing registry has 4 kinds; future kinds would silently produce `undefined`. Mitigation: explicit `throw new Error(...)` in the default branch; covered by a unit test.
- **R2 (snapshot drift due to incidental whitespace / key-order change):** JSON.stringify preserves key order in modern Node; the existing tool uses `JSON.stringify(result, null, 2)`. Mitigation: capture the snapshot BEFORE the reimplementation, compare exactly. If the diff is whitespace, normalize the snapshot. If the diff is structural, revert and investigate.
- **R3 (`buildInverseIndexes` is still imported elsewhere):** the existing `loop-introspect.js` exports `buildInverseIndexes` for other call-sites. Mitigation: leave `loop-introspect.js` untouched; the tool just stops importing it. Add a comment in `loop-introspect.js` noting that the relationship tool no longer uses it (other call-sites may).
- **R4 (soft-inversion ADR comment becomes stale):** if (a) `.shape` consumers drop below 3 or (b) factory methods need cross-cutting logic, the reversion clause triggers. Mitigation: the comment names the triggers; future agents reading `core/README.md` see them. No automated check.
- **R5 (reimplemented tool's wire shape diverges for edge cases):** the current tool has dual-field handling for `promoted_to_rule` (legacy + new). **Mitigation: Phase 4's reimplementation preserves the dual-field logic via `buildInverseIndexes` + `origin_inverse.get(id)?.[0]` fallback**, AND Phase 5's snapshot test includes a legacy-finding fixture (no `promoted_to_rule`, has matching origin rule) so the regression is caught at test time, not in production.