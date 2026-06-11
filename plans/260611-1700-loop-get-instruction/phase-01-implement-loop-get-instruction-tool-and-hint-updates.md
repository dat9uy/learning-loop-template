---
phase: 1
title: "Implement loop_get_instruction tool and hint updates"
status: completed
priority: P2
effort: "2h"
dependencies: []
---

# Phase 1: Implement loop_get_instruction tool and hint updates

## Overview

Ship the deferred `loop_get_instruction` MCP tool and update the discoverability surfaces so agents know it exists. The tool is intentionally minimal: one `key` input, one hint output, plus a one-line suggestion. We also add a 12th canonical hint that both advertises the tool and teaches the meta-vs-product surface split.

## Requirements

- Functional: `loop_get_instruction` accepts named slugs, numeric indices, and arrays of either; returns hint text + suggestion; registered in the server manifest and agent manifest.
- Functional: `DISCOVERABILITY_HINTS` grows from 11 to 12 entries; the new hint mentions `loop_get_instruction` and the three surfaces (meta-state self-model, product substrate, template rules).
- Functional: SessionStart hook mirror stays byte-for-byte consistent with the canonical array.
- Non-functional: TDD-first — write `loop-get-instruction.test.js` before or alongside the tool; update existing warm-tier tests to lock the new hint count and content; no schema changes.

## Architecture

A single new tool module `tools/learning-loop-mcp/tools/loop-get-instruction-tool.js` imports `buildDiscoverabilityHints()` from `core/loop-introspect.js` and a small slug→index map. The handler normalizes `key` to an array, resolves each slug/index to a hint, and returns `{ count, results }`. Named slugs are limited to the subset explicitly mentioned in the finding plus a few obvious aliases:

- `'internalization-rule'` → 0
- `'mechanism-check'` → 1
- `'source-refs'` → 2
- `'derive-refresh'` → 3
- `'designs-no-code'` → 4
- `'status-lifecycle'` → 5
- `'reopens'` → 6
- `'rule-lifecycle'` → 7
- `'canonical-tool'` → 8
- `'surface-split'` → 9
- `'reopens-script'` → 10
- `'meta-vs-product-split'` / `'loop-get-instruction'` → 11

Suggestions are hardcoded next to the map so each hint returns an actionable one-liner.

The 12th hint text:
> "On-demand hint lookup: use `loop_get_instruction({ key: '<slug>' | <index> })` when a hint has scrolled out of context or you need a cross-reference pattern. The meta-state registry (`meta-state.jsonl`) is the loop's self-model; `product/**` is the replaceable substrate that provokes learning; `tools/learning-loop-mcp/**` and `schemas/**` are the template rules. Cite the correct surface."

## Related Code Files

- Create: `tools/learning-loop-mcp/tools/loop-get-instruction-tool.js`
- Modify: `tools/learning-loop-mcp/tools/manifest.json`
- Modify: `tools/learning-loop-mcp/agent-manifest.json`
- Modify: `tools/learning-loop-mcp/core/loop-introspect.js#DISCOVERABILITY_HINTS`
- Modify: `.factory/hooks/loop-surface-inject.cjs#LOCAL_DISCOVERABILITY_HINTS`
- Modify: `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs`
- Modify: `tools/learning-loop-mcp/__tests__/loop-describe-warm-tier.test.js`
- Create: `tools/learning-loop-mcp/__tests__/loop-get-instruction.test.js`

## Implementation Steps

### Step 1.1: Create TDD test file

Create `tools/learning-loop-mcp/__tests__/loop-get-instruction.test.js` with the following test cases:

```javascript
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { loopGetInstructionTool } from "../tools/loop-get-instruction-tool.js";

describe("loop_get_instruction", () => {
  test("returns hint by named slug 'reopens-script'", async () => {
    const result = await loopGetInstructionTool.handler({ key: "reopens-script" });
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.count, 1);
    assert.strictEqual(parsed.results[0].key, "reopens-script");
    assert.strictEqual(parsed.results[0].index, 10);
    assert.ok(parsed.results[0].hint.includes("meta_state_relationship_validate"));
    assert.ok(parsed.results[0].suggestion.length > 0);
  });

  test("returns hint by numeric index", async () => {
    const result = await loopGetInstructionTool.handler({ key: 0 });
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.results[0].index, 0);
    assert.ok(parsed.results[0].hint.includes("evidence_code_ref"));
  });

  test("accepts an array of keys and returns multiple results", async () => {
    const result = await loopGetInstructionTool.handler({ key: ["internalization-rule", 10, "meta-vs-product-split"] });
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.count, 3);
    assert.ok(parsed.results.every((r) => r.hint && r.suggestion));
  });

  test("returns error entry for unknown slug", async () => {
    const result = await loopGetInstructionTool.handler({ key: "no-such-hint" });
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.count, 1);
    assert.ok(parsed.results[0].error);
    assert.ok(parsed.results[0].error.includes("no-such-hint"));
  });

  test("schema advertises key as string | number | array", () => {
    const keySchema = loopGetInstructionTool.schema.key;
    assert.ok(keySchema);
  });
});
```

Run the test file first to confirm it fails (tool does not exist):

```bash
cd /home/datguy/codingProjects/learning-loop-template
node --test tools/learning-loop-mcp/__tests__/loop-get-instruction.test.js 2>&1 | tail -20
```

Expected: import error or assertion failure (red).

### Step 1.2: Implement the tool

Create `tools/learning-loop-mcp/tools/loop-get-instruction-tool.js`:

```javascript
import { z } from "zod";
import { buildDiscoverabilityHints } from "#mcp/core/loop-introspect.js";

export const HINT_KEY_MAP = {
  "internalization-rule": 0,
  "mechanism-check": 1,
  "source-refs": 2,
  "derive-refresh": 3,
  "designs-no-code": 4,
  "status-lifecycle": 5,
  reopens: 6,
  "rule-lifecycle": 7,
  "canonical-tool": 8,
  "surface-split": 9,
  "reopens-script": 10,
  "meta-vs-product-split": 11,
  "loop-get-instruction": 11,
};

const HINT_SUGGESTIONS = [
  "Prefer `local:meta-state:<id>` source_refs and set `evidence_code_ref` to a code path so the loop can re-check it.",
  "When you provide `evidence_code_ref`, `mechanism_check` defaults to true; pass `false` only if you intentionally want to opt out.",
  "Use `local:meta-state:<id>` for citations; reserve `local:plans/...` markdown refs for the escape hatch.",
  "Call `meta_state_derive_status` before resolving; call `meta_state_refresh_fingerprint` after refactoring the cited code.",
  "For design-only choices, log a change-log entry and cite its id in `source_refs`.",
  "Use `stale` for past-TTL findings and `meta_state_re_verify` to re-validate; do not use the legacy `expired` status.",
  "Set `reopens: ['<stale_id>']` on the new finding, then cascade-resolve the stale parent.",
  "Query loop-design/rule lifecycle via `meta_state_list({ entry_kind: 'rule' | 'loop-design' })` or `loop_describe({ tier: 'cold' })`.",
  "Use the tool manifest + the tool-selection guide to pick tools; avoid `node -e` and direct file I/O to `meta-state.jsonl`.",
  "AGENTS.md is the steering prompt; the tool manifest is deterministic; warm hints are at-start; the skill is prompt-author docs.",
  "For cross-references, run `meta_state_relationship_validate`, report with `reopens`, then `meta_state_resolve({ cascade_from: [child] })`.",
  "Use `loop_get_instruction` for on-demand lookup. Keep `meta-state.jsonl` (self-model), `product/**` (substrate), and template code separate when citing evidence.",
];

export const loopGetInstructionTool = {
  name: "loop_get_instruction",
  description: "On-demand lookup for a single loop discoverability hint. Use when you need a hint that was surfaced at session start but has scrolled out of context, or when cross-referencing and you are unsure which canonical pattern applies. Pass `key` as a hint slug, a 0-based index, or an array of slugs/indices. Returns the hint text plus a one-line suggestion.",
  schema: {
    key: z.union([
      z.string(),
      z.number().int().nonnegative(),
      z.array(z.union([z.string(), z.number().int().nonnegative()])),
    ]).describe("Hint identifier: named slug, 0-based index, or array of slugs/indices."),
  },
  handler: async ({ key }) => {
    const hints = buildDiscoverabilityHints();
    const keys = Array.isArray(key) ? key : [key];
    const results = [];

    for (const k of keys) {
      const index = typeof k === "number" ? k : HINT_KEY_MAP[k];
      if (index === undefined || index < 0 || index >= hints.length) {
        results.push({ key: k, error: `Unknown hint key: ${k}` });
      } else {
        results.push({
          key: k,
          index,
          hint: hints[index],
          suggestion: HINT_SUGGESTIONS[index],
        });
      }
    }

    return {
      content: [{ type: "text", text: JSON.stringify({ count: results.length, results }, null, 2) }],
    };
  },
};
```

### Step 1.3: Register the tool

Add to `tools/learning-loop-mcp/tools/manifest.json`:

```json
{ "file": "./tools/loop-get-instruction-tool.js", "export": "loopGetInstructionTool" }
```

Update `tools/learning-loop-mcp/agent-manifest.json` introspection group:

```json
"introspection": {
  "description": "Discover the loop's operational surface, active rules, and curated instructions",
  "tools": ["loop_describe", "loop_get_instruction"],
  "ordering": "any",
  "typical_chain": ["loop_describe", "loop_get_instruction"]
}
```

### Step 1.4: Add the 12th discoverability hint

In `tools/learning-loop-mcp/core/loop-introspect.js`, append one string to `DISCOVERABILITY_HINTS`:

```javascript
"On-demand hint lookup: use `loop_get_instruction({ key: '<slug>' | <index> })` when a hint has scrolled out of context or you need a cross-reference pattern. The meta-state registry (`meta-state.jsonl`) is the loop's self-model; `product/**` is the replaceable substrate that provokes learning; `tools/learning-loop-mcp/**` and `schemas/**` are the template rules. Cite the correct surface.",
```

Mirror the same string in `.factory/hooks/loop-surface-inject.cjs#LOCAL_DISCOVERABILITY_HINTS`.

### Step 1.5: Update existing warm-tier tests

In `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` test 2:
- Update `assert.strictEqual(warm.discoverability_hints.length, 11);` to `12`.
- Add an assertion after the existing hint checks:

```javascript
assert.ok(
  hints.some((h) => h.includes("loop_get_instruction") && h.includes("meta-state registry")),
  "Hint H12 (loop_get_instruction + meta-vs-product split) must be present",
);
```

In `tools/learning-loop-mcp/__tests__/loop-describe-warm-tier.test.js`:
- Update all `11` length assertions to `12`.
- In the "each hint contains the documented substrings" test, destructure a 12th element and assert it mentions `loop_get_instruction` and `product/**`.

### Step 1.6: Add stdio transport regression test for top-level array

Extend `tools/learning-loop-mcp/__tests__/loop-get-instruction.test.js` with a test that spawns the MCP server over stdio and calls `loop_get_instruction` with `{ key: ["reopens-script", "internalization-rule"] }`. Assert the returned count is 2 and both hints are present. This proves the wire-format coercion fix handles top-level arrays for the new tool.

Use the same `withMcpServer` helper pattern as `wire-format-top-level-coercion.test.js`.

### Step 1.7: Run tests

```bash
cd /home/datguy/codingProjects/learning-loop-template
node --test tools/learning-loop-mcp/__tests__/loop-get-instruction.test.js 2>&1 | tail -30
node --test tools/learning-loop-mcp/__tests__/loop-describe-warm-tier.test.js 2>&1 | tail -20
node --test tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs 2>&1 | tail -20
```

Expected: all targeted tests pass.

### Step 1.8: Run full check

```bash
cd /home/datguy/codingProjects/learning-loop-template
pnpm check 2>&1 | tail -20
```

Expected: exit 0. Test count baseline + new tests (the exact number is recorded in the closeout journal).

## Success Criteria

- [ ] Step 1.1 test file created and initially fails (red).
- [ ] Step 1.2 `loop_get_instruction` tool exists and handler passes direct unit tests.
- [ ] Step 1.3 tool is registered in both `tools/manifest.json` and `agent-manifest.json`.
- [ ] Step 1.4 `DISCOVERABILITY_HINTS` has 12 entries and the new hint mentions `loop_get_instruction` + meta-vs-product split.
- [ ] Step 1.4 hook mirror `LOCAL_DISCOVERABILITY_HINTS` matches canonical count and content.
- [ ] Step 1.5 existing warm-tier tests updated to `12` and assert the new hint.
- [ ] Step 1.6 stdio array-input regression test passes.
- [ ] Step 1.7 targeted test files pass.
- [ ] Step 1.8 `pnpm check` exits 0.
- [ ] No schema changes, no `node -e` escape hatches.

## Risk Assessment

- **Risk**: Top-level array input still coerces to `{item: [...]}` for the new tool. **Mitigation**: the stdio regression test in Step 1.6 catches this; the wire-format coercion helper in `tool-registry.js` is registry-wide.
- **Risk**: Named slug set is incomplete. **Mitigation**: the finding only requires the three named keys (`reopens-script`, `internalization-rule`, `meta-vs-product-split`) plus numeric indices; the alias map can grow later without breaking callers.
- **Risk**: Hook mirror drift is introduced. **Mitigation**: the cold-session parity test catches any mismatch; update both files in the same commit.
- **Risk**: Existing tests outside the two warm-tier files also assert hint count. **Mitigation**: grep for `discoverability_hints.length` and `hints.length` across the repo in Step 1.5.

## Hand-off to Phase 2

Phase 2 performs the registry mutations. It assumes Phase 1 has modified `loop-introspect.js`, so `meta_state_check_grounding` on `meta-260611T1253Z-...` should be called after the edit (it will record the new fingerprint and return grounded).
