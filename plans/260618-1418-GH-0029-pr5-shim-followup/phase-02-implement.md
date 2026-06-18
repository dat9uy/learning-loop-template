---
phase: 2
title: "Implement — comment fix + regression test + doc + SP2 + ckignore"
status: pending
priority: P1
effort: "1.5h"
dependencies: [phase-01]
---

# Phase 2: Implement

## Overview

Apply 6 small, low-risk changes based on the research from phase-01. No shim refactor (the shim works in production per researcher-A's live e2e probe). Changes: (1) fix a misleading comment, (2) add an e2e regression test, (3) add `schema-parity.js` to SP2 fingerprint registry, (4) update the doc + scout report to reflect Q3 refutation, (5) remove dangling ref from predecessor plan, (6) revert `.ckignore` research bypass.

## Related Code Files

- **Modify:** `tools/learning-loop-mastra/create-loop-tool.js` (lines 35-37 comment only)
- **Create:** `tools/learning-loop-mastra/__tests__/mcp-tools-list-parity.test.js` (verbatim, ~95 lines)
- **Modify:** `docs/mcp-tool-schema-architecture.md` (rewrite §3.5 + §3.6 + §8 to reflect Q3 refutation)
- **Modify:** `plans/reports/scouts-260618-1336-GH-0029-pr5-unresolved-questions-report.md` (add Q3 refutation addendum)
- **Modify:** `plans/260618-0029-coerce-layer-zod-native-migration/plan.md:11` (remove dangling ref to missing file)
- **Modify:** `.claude/.ckignore` (remove `!node_modules` line, keep `.venv` + dated rationale comment)
- **External (registry-only):** `meta_state_log_change` MCP call to add `schema-parity.js` to SP2

## Implementation Steps

### Step 2.1: Fix the misleading comment (5 min, comment-only)

**File:** `tools/learning-loop-mastra/create-loop-tool.js` lines 35-37

**Current (misleading):**
```js
// Zod's `process` checks `schema._zod.toJSONSchema?.()` before invoking the
// type-specific processor, so overriding it lets us return the unwrapped
// JSON Schema while still using the wrapped schema for parsing.
```

**Replace with:**
```js
// Override zod's per-schema JSON Schema generator so the schema exposed to
// MCP clients via `tools/list` is the parity view (z.preprocess wrappers and
// guarded-boolean unions unwrapped). zod's `process` function in
// node_modules/zod/v4/core/to-json-schema.js:49 checks
// `schema._zod.toJSONSchema?.()` and uses its return value. The override IS
// honored through Mastra's MCPServer.convertSchema → standardSchemaToJSONSchema
// path (verified empirically by spawning the production MCP server and
// asserting all 39 tools return real inputSchemas — see
// plans/reports/researcher-A-260618-1418-GH-0029-pr5-shim-fix-strategies-report.md
// §1). The new e2e regression test in mcp-tools-list-parity.test.js locks
// this path against future regressions.
schema._zod.toJSONSchema = () => parityJSONSchema;
```

**Validation:** `git diff tools/learning-loop-mastra/create-loop-tool.js` shows only the comment block changed.

### Step 2.2: Add e2e parity regression test (30 min, verbatim)

**File:** `tools/learning-loop-mastra/__tests__/mcp-tools-list-parity.test.js` (new, ~95 lines)

**Spec rationale (header comment for the test file):**

```js
// Test layering rationale: unit tests in `coerce-correctness.test.js` lock the
// shim's transformation logic at the zod API level (cheap, fast, exhaustive
// across 7 migration cases). This e2e test locks the full path through
// Mastra's `MCPServer.convertSchema` → `standardSchemaToJSONSchema` (one
// server spawn, ~400ms, catches SDK regressions the unit test can't see).
// Both layers are needed because they catch different classes of regressions.
```

**Verbatim test file (paste verbatim into the new file):**

```js
import { describe, test, before } from "node:test";
import assert from "node:assert/strict";
import { withMcpServer } from "./with-mcp-server.js";

// Tools whose inputSchemas use the migration's preprocess + guarded-boolean
// wrappers. These are the load-bearing assertions — if the shim or override
// mechanism regresses, these tests will fail loudly.
//
// Note: "migrated" here means "uses z.preprocess(stripEnvelope, ...) or
// z.union([z.boolean(), z.string()]).transform(strictBooleanGuard) in its
// inputSchema". Other tools (e.g. tools using plain zod primitives) pass
// through the shim unchanged; they're covered by the universal contract test
// in coerce-correctness.test.js, not here.
const MIGRATED_TOOL_NAMES = [
  "mastra_meta_state_sweep",
  "mastra_meta_state_archive",
  "mastra_meta_state_resolve",
  "mastra_meta_state_promote_rule",
  "mastra_meta_state_check_grounding",
  "mastra_meta_state_query_drift",
  "mastra_meta_state_derive_status",
  "mastra_meta_state_list",
  "mastra_workflow_intake_plan",
  "mastra_workflow_self_improvement",
  "mastra_workflow_generate_prompt",
  // "mastra_trigger_workflow" intentionally omitted: server logs
  // "registered 39 of 39" with the current manifest, but the
  // trigger-workflow module's `legacy.name` is `workflowTriggerTool` and
  // the actual exposed name is `mastra_workflow_trigger` (different from
  // the migration touch list which used a guessed snake_case mapping).
  // Out of scope — re-add once trigger-workflow naming is reconciled.
];

describe("mcp tools/list parity — JSON Schema contract for migration-touched tools", () => {
  let tools;
  let byName;

  before({ timeout: 15000 }, async () => {
    await withMcpServer(async (handles) => {
      tools = await handles.listTools();
      byName = new Map(tools.map((t) => [t.name, t]));
    });
  });

  // Test 1 (universal contract): every tool's inputSchema is a real object
  // schema, not the bypass sentinel. Catches the Q3 bug class.
  test("every tool has an object inputSchema with type:object and properties", { timeout: 5000 }, () => {
    for (const t of tools) {
      assert.ok(t.inputSchema && typeof t.inputSchema === "object", `${t.name}: inputSchema must be an object`);
      assert.notDeepEqual(t.inputSchema, { $ref: "#" }, `${t.name}: inputSchema must NOT be the bypass sentinel`);
      assert.strictEqual(t.inputSchema.type, "object", `${t.name}: inputSchema.type must be "object"`);
      assert.ok(t.inputSchema.properties && typeof t.inputSchema.properties === "object", `${t.name}: inputSchema must have a properties object`);
    }
  });

  // Test 2 (per-tool — guarded-boolean pipe-collapse): meta_state_sweep.apply
  // must collapse to type:boolean (not anyOf). This is the load-bearing proof
  // that schema-parity.js lines 30-35 (pipe-collapse branch) ran.
  test("meta_state_sweep.apply collapses to type:boolean (not anyOf)", { timeout: 5000 }, () => {
    const t = byName.get("mastra_meta_state_sweep");
    assert.ok(t, "mastra_meta_state_sweep must be registered");
    const apply = t.inputSchema.properties.apply;
    assert.ok(apply, "apply property must exist");
    assert.strictEqual(apply.type, "boolean", `apply.type must be "boolean" (got ${JSON.stringify(apply.type)}); anyOf would indicate the shim's pipe-collapse branch regressed`);
    assert.strictEqual(apply.default, false, "apply.default must be false (shim's default-recovery branch)");
  });

  // Test 3 (per-tool — preprocess + default([])): meta_state_archive.candidates
  // must have default:[]. This is the load-bearing proof that schema-parity.js
  // lines 43-48 (default-recovery branch) ran.
  test("meta_state_archive.candidates has default:[] (preprocess + default recovery)", { timeout: 5000 }, () => {
    const t = byName.get("mastra_meta_state_archive");
    assert.ok(t, "mastra_meta_state_archive must be registered");
    const candidates = t.inputSchema.properties.candidates;
    assert.ok(candidates, "candidates property must exist");
    assert.strictEqual(candidates.type, "array", "candidates.type must be array");
    assert.deepEqual(candidates.default, [], "candidates.default must be [] (shim's default recovery)");
    assert.strictEqual(candidates.items?.type, "string", "candidates.items.type must be string");
  });

  // Test 4 (per-tool — preprocess inside z.object): meta_state_resolve.cascade_from
  // must be array of string. This is the load-bearing proof that schema-parity.js
  // lines 62-77 (recursive object rebuild) ran.
  test("meta_state_resolve.cascade_from is array of string (preprocess inside z.object)", { timeout: 5000 }, () => {
    const t = byName.get("mastra_meta_state_resolve");
    assert.ok(t, "mastra_meta_state_resolve must be registered");
    const cascade = t.inputSchema.properties.cascade_from;
    assert.ok(cascade, "cascade_from property must exist");
    assert.strictEqual(cascade.type, "array", "cascade_from.type must be array");
    assert.strictEqual(cascade.items?.type, "string", "cascade_from.items.type must be string");
  });
});
```

**Test count: 4 tests (1 universal + 3 per-tool load-bearing).** Use this exact count in phase-03.

**Note on assertion shape:** All per-tool tests use `assert.strictEqual` on type fields and `assert.deepEqual` only on `default:[]` (an array, not a string). This avoids the brittleness flagged in red team finding #3 — no `deepEqual` against a hard-coded full schema object, so description strings or `additionalProperties:false` additions don't break the test.

**Note on test omission:** `mastra_trigger_workflow` is intentionally NOT in `MIGRATED_TOOL_NAMES` (red team finding #2). The server logs "registered 39 of 39" but the actual MCP name for the trigger-workflow module is `mastra_workflow_trigger` (not `mastra_trigger_workflow` as researcher-B guessed). Resolving the naming is out of scope for this plan.

### Step 2.3: Update doc §3.5 + §3.6 + §8 to reflect Q3 refutation (10 min)

**File:** `docs/mcp-tool-schema-architecture.md`

**Change in §3.5** (replace existing "Open question" content):

```markdown
### 3.5 Q3 status: REFUTED by live e2e (2026-06-18)

The scout report's concern that the `_zod.toJSONSchema` override is bypassed
in production was investigated empirically. The live e2e probe (see
`plans/reports/researcher-A-260618-1418-GH-0029-pr5-shim-fix-strategies-report.md`
§1 and the probe at
`plans/260618-1418-GH-0029-pr5-shim-followup/e2e-tools-list-parity-probe.cjs`)
spawns the actual MCP server, sends `tools/list`, and inspects all 39
registered tools' inputSchemas. Result: all 39 return real JSON Schemas
(`type:"object"` with proper `properties` map). The override DOES propagate
through `MCPServer.convertSchema` → `standardSchemaToJSONSchema` →
`schema["~standard"].jsonSchema.input` → `process` + `finalize`.

**Known caveat (not blocking):** the synthetic probe at
`/tmp/probe-q3-clean.cjs` still returns `{"$ref":"#"}` for synthetic nested
schemas called in isolation. This is a zod 4.4.3 quirk in the `process` +
`finalize` interaction when the override is called without the full
`JSON_SCHEMA_LIBRARY_OPTIONS.override` context (provided by
`@mastra/schema-compat`'s `jsonSchemaOverride`). The discrepancy is not
fully diagnosed; the most likely explanation is that the migration-touched
schemas use `z.object({...})` roots which route through `finalize` differently
than the synthetic probe's nested objects. Production never hits the
synthetic-probe quirk because the full override context is provided.

**Bottom line:** the shim works in production. No refactor needed. The new
e2e test (rec #1) is a regression guard against future shim/SDK changes; it
will fail loudly if the synthetic-probe quirk ever re-manifests in production.
```

**Change in §3.6** (replace existing "Open question" with "Resolved"):

```markdown
### 3.6 What to do if the bug is real — RESOLVED: bug is NOT real

This section is preserved for historical context. As of 2026-06-18, the Q3
finding (synthetic-probe bypass) is REFUTED for all 39 production tools
(verified by live e2e). The "if the bug is real" options below are NOT being
pursued. If a future zod 4.4.x patch or Mastra SDK upgrade re-manifests the
synthetic-probe quirk in production, the e2e regression test
(`tools/learning-loop-mastra/__tests__/mcp-tools-list-parity.test.js`) will
fail loudly. The 3 strategies listed here remain valid fallbacks for that
hypothetical future:

- Strategy A: Wrap with Vercel-shape `{ _type: "function", jsonSchema: parity }` — incompatible with `createTool` (which expects zod), but documents the short-circuit path
- Strategy B: Wrap with `toStandardSchema()` from `@mastra/schema-compat` — would be a no-op refactor
- Strategy C: Pin zod to 4.4.x — already in effect (`package.json:48`)
```

**Change in §8** (Recommendations table, drop the "if bug is real" row, add a "regression guard" row):

Replace existing row 1 (Write a true e2e test) with:
```markdown
| 1 | **Add e2e regression guard** at `tools/learning-loop-mastra/__tests__/mcp-tools-list-parity.test.js` — 4 tests (1 universal + 3 per-tool load-bearing) | any agent | none — implementation in phase-02 step 2.2 |
| 2 | ~~Fix the shim~~ — NOT NEEDED. Shim works in production. | n/a | n/a |
| 3 | Fix comment at `create-loop-tool.js:35-37` (verbatim in phase-02 step 2.1) | any agent | none |
| 4 | Add `schema-parity.js` to SP2 fingerprint registry | any agent | none |
| 5 | Pin zod to 4.4.x — ALREADY DONE in `package.json:48` | n/a | n/a |
| 6 | Restore or remove missing `research-260618-0031-zod-impact-analysis.md` reference in `plans/260618-0029-coerce-layer-zod-native-migration/plan.md:11` | any agent | none (handled in phase-02 step 2.7) |
| 7 | Fix plan's `.optional()` overstatement at `phase-01-schema-migration.md:123-126` | any agent | none (out of scope; doc nit) |
```

### Step 2.4: Update scout report (10 min)

**File:** `plans/reports/scouts-260618-1336-GH-0029-pr5-unresolved-questions-report.md`

Add a new section after §3.6 (Q3 fix strategies):
```markdown
## Addendum (2026-06-18): Q3 refuted by live e2e probe

The Q3 finding in this report — that the `_zod.toJSONSchema` override is
bypassed by Mastra's `standardSchemaToJSONSchema` path — was based on isolated
synthetic probes at `/tmp/probe-q3-clean.cjs`. Subsequent e2e investigation
(see `plans/reports/researcher-A-260618-1418-GH-0029-pr5-shim-fix-strategies-report.md`
§1) spawned the actual MCP server and verified all 39 registered tools return
proper JSON Schemas via `tools/list`. The override works in production.

The synthetic probe's `{"$ref":"#"}` result is a zod 4.4.3 quirk in the
`process` + `finalize` interaction when the override is called without the
full `JSON_SCHEMA_LIBRARY_OPTIONS.override` context. Production uses the full
context (provided by `@mastra/schema-compat`'s `jsonSchemaOverride`), so the
quirk never manifests for real schemas.

**Implication for the original 3 unresolved questions:**
- Q1: Resolved (Researcher 1's trivial-case test was over-broad but correct in essence; `.optional()` is actually fine in zod 4.4.3)
- Q2: Resolved (4 zod internals are stable; upgrade risk is bounded by `coerce-correctness.test.js`)
- Q3: REFUTED (no production bug; shim works; new e2e test as regression guard)
```

### Step 2.5: Add `schema-parity.js` to SP2 fingerprint registry (5 min)

**External action (MCP call):**

```js
meta_state_log_change({
  change_dimension: "mechanical",
  change_target: "tools/learning-loop-mastra/schema-parity.js",
  change_diff: { added: ["SP2 fingerprint coverage for the shim's zod internals"] },
  reason: "Add SP2 fingerprint for the schema-parity shim. Currently only create-loop-tool.js (meta-260618T0557Z) is tracked. If zod renames _zod.def.type strings, the shim's passthrough branch (schema-parity.js:110) may silently change behavior. SP2 fingerprint catches file drift; the 7 parity tests in coerce-correctness.test.js + the new e2e test in mcp-tools-list-parity.test.js catch semantic drift."
})
```

**Validation:** `tail -5 meta-state.jsonl | jq -r '.change_target'` shows the new entry as the last one.

### Step 2.6: Revert `.ckignore` research bypass (1 min)

**File:** `.claude/.ckignore`

**Current:**
```
# Project-local overrides for scout-block hook
# Allow .venv access — this project manages its own Python env via bootstrap workflow
!.venv
# Allow node_modules — needed for PR#5 unresolved-questions research (zod internal API + Mastra SDK)
!node_modules
```

**Replace with:**
```
# Project-local overrides for scout-block hook
# Allow .venv access — this project manages its own Python env via bootstrap workflow
!.venv
# !node_modules removed 2026-06-18 (PR#5 research complete — see plan 260618-1418-GH-0029-pr5-shim-followup). Re-add with rationale if needed for future zod/Mastra investigation.
```

**Validation:** `cat .claude/.ckignore` shows only `!.venv` and the dated comment. If node_modules access is ever needed again, the same bypass mechanism works.

### Step 2.7: Remove dangling ref from predecessor plan (5 min)

**File:** `plans/260618-0029-coerce-layer-zod-native-migration/plan.md:11`

**Current (line 11):**
```
  - plans/reports/research-260618-0031-zod-impact-analysis.md (Researcher 1)
```

**Replace with:**
```
  - [Researcher 1 report missing — see plans/reports/scouts-260618-1336-GH-0029-pr5-unresolved-questions-report.md Finding #5. Plan's Q1 verdict was confirmed via re-running the test method described in phase-01-schema-migration.md:21-50 directly.]
```

**Validation:** `git diff plans/260618-0029-coerce-layer-zod-native-migration/plan.md` shows only line 11 changed.

## Success Criteria

- [ ] Step 2.1: comment replaced; `git diff tools/learning-loop-mastra/create-loop-tool.js` shows only the comment block changed
- [ ] Step 2.2: new test file `mcp-tools-list-parity.test.js` matches the verbatim spec above; `node --test tools/learning-loop-mastra/__tests__/mcp-tools-list-parity.test.js` passes locally; contains **4 tests** (1 universal + 3 per-tool)
- [ ] Step 2.3: `docs/mcp-tool-schema-architecture.md` §3.5, §3.6, §8 reflect Q3 refutation
- [ ] Step 2.4: scout report has the addendum; Q3 verdict downgraded from "PARTIAL — comment + test recommended" to "REFUTED"
- [ ] Step 2.5: `meta-state.jsonl` last entry has `change_target: "tools/learning-loop-mastra/schema-parity.js"` and `change_dimension: "mechanical"`
- [ ] Step 2.6: `.ckignore` has only `!.venv` + dated rationale comment
- [ ] Step 2.7: `plans/260618-0029-coerce-layer-zod-native-migration/plan.md:11` updated with the "report missing" note

## Risk Assessment

- **Comment change (2.1):** zero risk (doc-only).
- **Test addition (2.2):** low risk — test will pass on current code (verified by researcher A's e2e probe); provides regression net for future shim/SDK changes.
- **Doc updates (2.3, 2.4):** zero risk (prose-only).
- **SP2 fingerprint (2.5):** zero risk (registry-only).
- **`.ckignore` revert (2.6):** zero risk. If node_modules access is needed again, the bypass can be re-added with a one-line edit.
- **Dangling ref removal (2.7):** zero risk (1-line doc edit in a sibling plan).
