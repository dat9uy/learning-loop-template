---
phase: 1
title: "Track-A-Warm-Tier-Audit"
status: completed
priority: P2
effort: 45m
dependencies: []
---

# Phase 1: Track A: Warm-Tier `discoverability_hints` Audit

## Overview

Extend the `loop_describe` warm tier `discoverability_hints` surface (shipped in change-log `meta-260606T1433Z-discoverability-meta-evidence-migration`) with 2 new hints that close the on-demand instruction gap: (A4) the canonical-tool-preference + 4-question framework, and (A5) the AGENTS.md-vs-tool-manifest-vs-warm-tier role split. Add TDD coverage in the existing `cold-session-discoverability.test.cjs` to lock the new hints + the warm tier size budget.

## Requirements

- Functional: 2 new hints present in `DISCOVERABILITY_HINTS` (8 total); `loop_describe({ tier: "warm" })` returns them in the `discoverability_hints` array; warm tier size budget is not exceeded.
- Non-functional: 4-6 new test assertions in `cold-session-discoverability.test.cjs`; existing tests still pass; GATE_ROOT isolation preserved.

## Architecture

Single-file edit: `tools/learning-loop-mcp/core/loop-introspect.js` — append 2 string entries to the `DISCOVERABILITY_HINTS` frozen array. The function `buildDiscoverabilityHints()` returns the array as-is (pure function, no I/O), so the change is structural only.

The test file `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` is the canonical cold-session test surface (per the `rule-cold-session-test-must-pass-before-resolution` consult-gate). New assertions extend the existing test 2 ("discoverability surface works via direct MCP server spawn") which already drives `loop_describe` warm tier via stdio JSON-RPC.

## Related Code Files

- Modify: `tools/learning-loop-mcp/core/loop-introspect.js` (the `DISCOVERABILITY_HINTS` constant; ~250 bytes added)
- Modify: `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` (4-6 new assertions in test 2)

## Implementation Steps

### Step 1.1: Read current `DISCOVERABILITY_HINTS`

Read `tools/learning-loop-mcp/core/loop-introspect.js` to capture:
- The current 6 hints (verbatim, including any trailing newlines or escapes)
- The `Object.freeze` invocation that locks the array
- The exact array declaration syntax (template literal vs string concatenation)

### Step 1.2: Add 2 new hints

Append 2 new entries to the `DISCOVERABILITY_HINTS` array:

```javascript
// A4: Tool selection — prefer canonical MCP tools, not escape hatches
"To pick a tool, prefer the canonical MCP tool over `node -e` escape hatches or direct file I/O. The 4-question framework: what (what does it do), when (when to use vs alternatives), inputs (what it accepts), returns (what shape comes back). See `tools/learning-loop-mcp/references/tool-selection-guide.md` for the intent → tool mapping.",

// A5: 4-layer role split — the priority-1 prompt vs the deterministic surfaces
"AGENTS.md is the priority-1 prompt (the steering layer: shape of the loop, rules, canonical paths). The tool manifest is the deterministic tool-selection surface. `loop_describe` warm tier `discoverability_hints` is the at-start-up injection. The `learning-loop` skill is the prompt-author docs. Each surface has a distinct role; do not duplicate content across them.",
```

Total: 8 hints (was 6). New hints are ~280 bytes and ~360 bytes respectively; well under the warm tier size budget (~5KB).

### Step 1.3: Add TDD coverage in `cold-session-discoverability.test.cjs`

In the existing test 2 ("discoverability surface works via direct MCP server spawn"), first update the existing length assertion from `=== 6` to `=== 8`, then add 4 new assertions after the existing `discoverability_hints` read assertion:

```javascript
// Update existing length assertion (was === 6, now === 8 after adding A4 + A5)
assert.strictEqual(warm.discoverability_hints.length, 8);

// Track A — new hints A4 + A5
assert.ok(
  hints.some((h) => h.includes("canonical MCP tool") && h.includes("4-question framework")),
  "Hint A4 (tool selection — 4-question framework) must be present",
);
assert.ok(
  hints.some((h) => h.includes("priority-1 prompt") && h.includes("AGENTS.md")),
  "Hint A5 (4-layer role split) must be present",
);
assert.ok(
  hints.length === 8,
  `Expected 8 hints (6 original + 2 new), got ${hints.length}`,
);
assert.ok(
  totalHintsByteLength < 5000,
  `Warm tier hints must be <5KB; got ${totalHintsByteLength} bytes`,
);
```

The `totalHintsByteLength` is a new local variable computed once before the assertions: `hints.reduce((sum, h) => sum + Buffer.byteLength(h, "utf8"), 0)`.

### Step 1.4: Run the test file

```bash
cd /home/datguy/codingProjects/learning-loop-template
node --test tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs 2>&1 | tail -50
```

Expected: all tests pass (including the 4 new assertions). The existing 5 tests (per the file header comment) must still pass — the 4 new assertions are additive.

### Step 1.5: Refresh the next-up finding's fingerprint (Phase 3 prep)

The next-up finding `meta-260609T2102Z-next-up-adopt-loop-design-instruction-layer-...` has `evidence_code_ref: "tools/learning-loop-mcp/core/loop-introspect.js#buildDiscoverabilityHints"`. Since Step 1.2 modifies `loop-introspect.js`, the fingerprint will drift. Proactively refresh it now so Phase 3's `meta_state_check_grounding` passes cleanly:

```
meta_state_refresh_fingerprint({
  id: "meta-260609T2102Z-next-up-adopt-loop-design-instruction-layer-status-active-si"
})
```

Expected response: `{ refreshed: true, ... }`.

### Step 1.6: Run the full check

```bash
cd /home/datguy/codingProjects/learning-loop-template
pnpm check 2>&1 | tail -20
```

Expected: exit 0; all 898 + 4 = 902 tests pass (Track A's 4 new assertions; Track B's ~30 assertions are added in Phase 2).

## Success Criteria

- [ ] Step 1.1 read captured the 6 current hints + the `Object.freeze` invocation.
- [ ] Step 1.2 `DISCOVERABILITY_HINTS` now has 8 entries (6 original + A4 + A5).
- [ ] Step 1.3 4 new assertions added in test 2; the `totalHintsByteLength` local is computed once.
- [ ] Step 1.4 `node --test` on the test file: all 5 existing tests + 4 new assertions pass.
- [ ] Step 1.5 `meta_state_refresh_fingerprint` returns `refreshed: true`.
- [ ] Step 1.6 `pnpm check` exit 0; test count is 902 (898 + 4).
- [ ] Warm tier size budget assertion passes (total <5KB).
- [ ] No edits to individual tool files (those are Phase 2), no new MCP tools, no new schema changes.

## Risk Assessment

- **Risk**: New hints exceed the warm tier size budget. **Mitigation**: Step 1.3's `totalHintsByteLength < 5000` assertion locks the budget; new hints are <700 bytes combined.
- **Risk**: Test 2's stdio JSON-RPC driver times out (the `meta-260608T1522Z` hang pattern). **Mitigation**: the existing test 2 already uses a generous timeout; the new assertions are synchronous reads on the already-fetched `hints` array, no new I/O.
- **Risk**: GATE_ROOT isolation breaks. **Mitigation**: the existing test 2 sets `GATE_ROOT` for the spawned MCP server; the new assertions read the response payload, not the filesystem.
- **Risk**: Hint text introduces a wrong claim (e.g., wrong tool count "52" when it should be "53" after a future tool is added). **Mitigation**: hint A4 references the tool-selection guide by path, not by count; A5 references roles, not counts. Future-proofed.

## Hand-off to Phase 2

Phase 2 (Track B) reads the same `agent-manifest.json` and `references/` directory. The hint A4 explicitly references `tools/learning-loop-mcp/references/tool-selection-guide.md` which Phase 2 creates. If Phase 2 runs before Phase 1's hint A4 is added, the test will fail (guide not referenced by any hint). If Phase 1 runs first, the test for Phase 2's guide creation is the new test file `tool-description-audit.test.cjs` which checks the guide independently.
