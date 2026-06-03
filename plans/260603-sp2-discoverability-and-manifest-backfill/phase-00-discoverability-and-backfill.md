---
phase: 0
title: "Discoverability Test + agent-manifest.json Backfill (TDD, 1 new test + 1 JSON patch)"
status: completed
priority: P3
effort: "0.25h"
dependencies: []
---

# Phase 0: Discoverability Test + `agent-manifest.json` Backfill

## Overview

The only phase in this plan. Closes 2 gaps from the SP2 review in a single TDD cycle:

1. **Discoverability test (Patch A):** add a unit test in `__tests__/loop-describe.test.js` asserting the 2 SP2 tool names appear in `loop_describe({ tier: "warm" })`. Locked design says: extend the existing `describe("loop_describe new behavior")` block, reuse the temp-dir pattern, assert by name (not count).

2. **`agent-manifest.json` backfill (Patch B):** append 3 missing tool names to the `meta_state.tools` array (`meta_state_sweep`, `meta_state_log_change`, `meta_state_derive_status`) preserving chronological insertion order from `tools/manifest.json`.

## Requirements

- Functional:
  - The new test passes
  - `agent-manifest.json` validates as JSON
  - `agent-manifest.json` `meta_state.tools` array has 10 entries (was 7)
  - All 10 `meta_state_*` tool names appear in `loop_describe({ tier: "warm" }).tools` (verifiable manually)
- Non-functional:
  - 556 existing tests still pass
  - 1 new test added (total: 557)
  - Insertion order preserved: `report, list, ack, resolve, promote_rule, sweep, log_change, derive_status, check_grounding, refresh_fingerprint`
  - No new files
  - No schema changes

## Architecture

### Patch A: `__tests__/loop-describe.test.js`

Insert a new test inside the existing `describe("loop_describe new behavior")` block, right after the warm-tier test at line 137. The new test:

```js
test("SP2: warm tier surfaces check_grounding + refresh_fingerprint", async () => {
  tempDir = mkdtempSync(join(tmpdir(), "loop-describe-sp2-"));
  process.env.GATE_ROOT = tempDir;
  try {
    const result = await loopDescribeTool.handler({ tier: "warm" });
    const text = JSON.parse(result.content[0].text);
    const names = text.tools.map((t) => t.name);
    assert.ok(names.includes("meta_state_check_grounding"),
      "SP2 check tool must appear in warm response");
    assert.ok(names.includes("meta_state_refresh_fingerprint"),
      "SP2 refresh tool must appear in warm response");
  } finally {
    process.env.GATE_ROOT = originalEnv;
  }
});
```

The test reuses the existing `tempDir` + `process.env.GATE_ROOT` pattern (declared in the `describe` block's outer scope, restored in the `finally` block).

### Patch B: `tools/learning-loop-mcp/agent-manifest.json`

Find the `meta_state` group (line 48-52 in the current file). Append 3 lines to the `tools` array, between `"meta_state_promote_rule"` and `"meta_state_check_grounding"`:

```diff
   "meta_state": {
     "description": "Meta-state registry for loop self-awareness findings",
     "tools": [
       "meta_state_report",
       "meta_state_list",
       "meta_state_ack",
       "meta_state_resolve",
       "meta_state_promote_rule",
+      "meta_state_sweep",
+      "meta_state_log_change",
+      "meta_state_derive_status",
       "meta_state_check_grounding",
       "meta_state_refresh_fingerprint"
     ],
     "ordering": "any"
   }
```

## TDD Workflow

1. **Write the test first (RED step).** Add the new test to `__tests__/loop-describe.test.js`. The test should already pass because the flat `manifest.json` is correct and `listAllTools` reads it. This is intentional — the test locks the contract for future regressions, not for the current state.
2. **Run the new test alone:** `pnpm test -- __tests__/loop-describe.test.js`. Verify it passes.
3. **Patch the JSON.** Edit `tools/learning-loop-mcp/agent-manifest.json` to add the 3 missing tool names.
4. **Verify JSON syntax:** `node -e "JSON.parse(require('fs').readFileSync('tools/learning-loop-mcp/agent-manifest.json'))"`. Confirm it returns without throwing.
5. **Run the new test again.** Still passes (the test reads from `manifest.json` directly, so the agent-manifest patch is verification-only).
6. **Manual verification:** in a fresh shell, run `node -e "const t = require('./tools/learning-loop-mcp/tools/loop-describe-tool.js'); t.loopDescribeTool.handler({tier: 'warm'}).then(r => { const text = JSON.parse(r.content[0].text); console.log(text.tools.filter(x => x.name.startsWith('meta_state_')).map(x => x.name)); })"`. Confirm all 10 names appear.
7. **Run full suite:** `pnpm test`. Confirm 557 pass, 0 fail.
8. **Run validators:** `pnpm validate:records` and `pnpm validate:plan-loop`. Confirm both pass.

## Implementation Steps

1. Read `tools/learning-loop-mcp/__tests__/loop-describe.test.js` to find the `describe("loop_describe new behavior")` block and the warm-tier test at line 137.
2. Add the new test (Patch A) right after the warm-tier test.
3. Run `pnpm test -- __tests__/loop-describe.test.js` — confirm 1 new test passes.
4. Read `tools/learning-loop-mcp/agent-manifest.json` to find the `meta_state` group.
5. Add the 3 missing tool names (Patch B) preserving chronological order.
6. Verify JSON syntax with the node one-liner.
7. Run the new test alone — still passes.
8. Run `pnpm test` (full suite) — confirm 557 pass.
9. Run `pnpm validate:records` — confirm passes.
10. Run `pnpm validate:plan-loop` — confirm passes.

## Related Code Files

- Create: none
- Modify:
  - `tools/learning-loop-mcp/__tests__/loop-describe.test.js` (add 1 test, +18 lines)
  - `tools/learning-loop-mcp/agent-manifest.json` (add 3 lines)
- Delete: none

## Success Criteria

- [ ] New test `SP2: warm tier surfaces check_grounding + refresh_fingerprint` passes
- [ ] `agent-manifest.json` validates as JSON
- [ ] `agent-manifest.json` `meta_state.tools` array has 10 entries (was 7)
- [ ] Insertion order preserved: `report, list, ack, resolve, promote_rule, sweep, log_change, derive_status, check_grounding, refresh_fingerprint`
- [ ] 556 existing tests still pass
- [ ] `pnpm test` shows 557 pass
- [ ] `pnpm validate:records` passes
- [ ] `pnpm validate:plan-loop` passes
- [ ] All 10 `meta_state_*` tool names appear in `loop_describe({ tier: "warm" }).tools` (verifiable manually)

## Risk Assessment

- **Risk: the new test could false-pass if `listAllTools` has a `degraded: true` mode that silently drops missing tools.** Mitigation: the test asserts `names.includes(...)` regardless of count. If a tool is missing for any reason, the test fails.
- **Risk: JSON syntax error in `agent-manifest.json` (trailing comma, missing comma).** Mitigation: run `node -e "JSON.parse(...)"` after the edit. Hand-written JSON; pre-existing `manifest.json` is also hand-written and uses the same convention.
- **Risk: the test ties itself to the SP2 tool names (not just a count).** Mitigation: acceptable coupling; those names are locked in `brainstorm-260602-sp2-check-grounding.md`. If a future SP renames them, the test will need updating — but the rename would itself require a brainstorm, so the coupling is intentional.
- **Risk: the test doesn't cover the `quickstart` chains in `agent-manifest.json` (e.g., `record_verification` referencing `index_validate`).** Mitigation: out of scope. The drift in other groups is a separate audit. The new test specifically covers the `meta_state` group's discoverability.
- **Risk: the test reads from the real `MCP_ROOT/tools/manifest.json` (not a test fixture).** Mitigation: intentional; it exercises the full manifest registration path. The temp-dir is only used to scope `process.env.GATE_ROOT` for the registry read (the manifest itself is read from a hardcoded path).
