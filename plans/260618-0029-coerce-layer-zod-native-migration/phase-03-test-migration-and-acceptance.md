---
phase: 03
title: Test Migration + Acceptance
status: completed
priority: high
effort: 2-3h
dependencies: [phase-02-coerce-layer-deletion]
predecessor: phase-02-coerce-layer-deletion
---

# Phase 03 — Test Migration + Acceptance

## Overview

Migrate 4 mcp-side wire-format tests to zod-native names; delete 4 mastra-side duplicates; rename `parity-zod-to-json-schema.test.js` → `coerce-correctness.test.js` per Plan 3 Group 11 C-8. Run acceptance gate across all 10 test namespaces.

**Priority:** high. Closes the migration loop; without it, the 4 mcp-side tests import the deleted `wire-format-coercion.js` (Phase 2) and fail.

## Key Insights

1. **8 wire-format test files, not 4.** Researcher 2 confirmed: 4 mcp-side + 4 mastra-side duplicates.
2. **Mcp-side tests are the canonical smoke gate.** After Phase 2, they must be rewritten as pure zod-API tests.
3. **Mastra-side duplicates are redundant** post-Plan 3 (one canonical server).
4. **Plan 3 followups collision.** `parity-zod-to-json-schema.test.js` → `coerce-correctness.test.js` rename is in Plan 3 Group 11 C-8 but NOT done in current `ls` (per Researcher 2 §8.3). Address here.
5. **Stdio spawn overhead drops.** 4 mcp-side tests with `withMcpServer` can drop the spawn pattern. Save ~1s per `pnpm test`. Keep 1 as smoke gate.

## Requirements

### Functional

- 4 mcp-side wire-format tests renamed + rewritten (direct zod calls):
  - `wire-format-coercion-fix.test.js` → `zod-coerce-boolean-string.test.js`
  - `wire-format-top-level-coercion.test.js` → `zod-coerce-top-level.test.js`
  - `wire-format-meta-state-optional-fields.test.js` → `zod-optional-coerce.test.js`
  - `wire-format-patch-recursion.test.js` → `zod-union-envelope.test.js`
- 4 mastra-side wire-format tests DELETED.
- `parity-zod-to-json-schema.test.js` renamed + rewritten to `coerce-correctness.test.js` (per Plan 3 Group 11 C-8).
- 1 stdio integration test retained as smoke gate.

### Non-Functional

- Net: -4 test files; -15 to -11 test() blocks.
- `pnpm test` runtime: ~1s faster.
- No new test namespaces; existing 10 preserved.

## Architecture

### New test contract

Pure zod-API tests. No `coerceParams`/`coerceParamsToSchema` import. No `installWireFormatCoercion` import. No `withMcpServer` spawn (except 1 retained smoke test).

**Example — `zod-coerce-boolean-string.test.js`:**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";

test("z.coerce.boolean() accepts 'true' / 'false' strings", () => {
  assert.equal(z.coerce.boolean().parse("true"), true);
  assert.equal(z.coerce.boolean().parse("false"), false);
});

test("z.coerce.boolean() semantic widening: any truthy string → true", () => {
  assert.equal(z.coerce.boolean().parse("1"), true);
  assert.equal(z.coerce.boolean().parse("false"), true);  // WIDENING
  assert.equal(z.coerce.boolean().parse("0"), true);      // WIDENING
  assert.equal(z.coerce.boolean().parse("no"), true);     // WIDENING
});
```

**Example — `zod-union-envelope.test.js`:**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { stripEnvelope } from "../core/envelope-stripper.js";

test("z.preprocess strips {item: [...]} envelope", () => {
  const schema = z.preprocess(stripEnvelope, z.array(z.string()));
  assert.deepEqual(schema.parse({ item: ["a", "b"] }), ["a", "b"]);
  assert.deepEqual(schema.parse(["a", "b"]), ["a", "b"]);
});

test("z.preprocess emits identical JSON Schema to non-preprocess", () => {
  const plain = z.array(z.string());
  const wrapped = z.preprocess(stripEnvelope, z.array(z.string()));
  const a = z.toJSONSchema(plain, { target: "draft-7", io: "input" });
  const b = z.toJSONSchema(wrapped, { target: "draft-7", io: "input" });
  assert.deepEqual(a, b);
});
```

### `coerce-correctness.test.js` (renamed from `parity-zod-to-json-schema.test.js`)

Single-server regression net, rewritten with direct zod calls (no `coerceParams` import):

```javascript
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { stripEnvelope } from "../../learning-loop-mcp/core/envelope-stripper.js";

describe("coerce-correctness — single-server wire-format regression net", () => {
  test("z.coerce.boolean() coerces 'true' / 'false'", () => {
    const schema = z.object({ flag: z.coerce.boolean() });
    assert.deepEqual(schema.parse({ flag: "true" }), { flag: true });
  });

  test("z.coerce.number() coerces numeric string; rejects empty / non-numeric", () => {
    const schema = z.object({ count: z.coerce.number() });
    assert.deepEqual(schema.parse({ count: "42" }), { count: 42 });
    assert.throws(() => schema.parse({ count: "" }));
  });

  test("z.preprocess strips {item: [...]} envelope", () => {
    const schema = z.object({
      tags: z.preprocess(stripEnvelope, z.array(z.string())),
    });
    assert.deepEqual(
      schema.parse({ tags: { item: ["x", "y"] } }),
      { tags: ["x", "y"] },
    );
  });
});
```

## Related Code Files

### Rename + rewrite (4 mcp-side)

| Old | New |
|---|---|
| `tools/learning-loop-mcp/__tests__/wire-format-coercion-fix.test.js` | `zod-coerce-boolean-string.test.js` |
| `tools/learning-loop-mcp/__tests__/wire-format-top-level-coercion.test.js` | `zod-coerce-top-level.test.js` |
| `tools/learning-loop-mcp/__tests__/wire-format-meta-state-optional-fields.test.js` | `zod-optional-coerce.test.js` |
| `tools/learning-loop-mcp/__tests__/wire-format-patch-recursion.test.js` | `zod-union-envelope.test.js` |

### Delete (4 mastra-side)

`tools/learning-loop-mastra/__tests__/wire-format-{coercion-fix,top-level-coercion,meta-state-optional-fields,patch-recursion}.test.js`

### Rename + rewrite (1 mastra-side)

`tools/learning-loop-mastra/__tests__/parity-zod-to-json-schema.test.js` → `coerce-correctness.test.js`

### Retain (1 stdio smoke gate)

In `zod-coerce-top-level.test.js`: 1 `withMcpServer` test calling `meta_state_report` via stdio with `mechanism_check: "true"`; assert handler receives `true`.

## Implementation Steps

1. mcp-side renames + rewrites (4): for each, write zod-direct body, save under new name, delete old. **Drop the unused `installWireFormatCoercion` import in `wire-format-meta-state-optional-fields.test.js:4`** (dead-code import; test body does not use it per red-team finding 4.3).
2. mastra-side deletes (4): `rm tools/learning-loop-mastra/__tests__/wire-format-*.test.js`.
3. Mastra-side rename + rewrite (1): `mv parity-zod-to-json-schema.test.js coerce-correctness.test.js` + rewrite.
4. Retain 1 stdio smoke test in `zod-coerce-top-level.test.js`.
5. **New test (red-team finding 6.2):** `boolean-semantic-guards.test.js` — walks the 5 guarded boolean fields (`meta_state_sweep.apply`, `meta_state_archive.confirm`, `meta_state_promote_rule.preview`, `meta_state_check_grounding.run_tests`, `meta_state_derive_status.run_tests`, `meta_state_query_drift.run_grounding`) and asserts the guard transforms `true`/`"true"` → `true`, `false`/`"false"`/`"yes"`/`"1"`/`"0"`/`1` → `false`. Lock the strict-true contract.
6. Run `pnpm test` — all 10 namespaces pass.
7. Run `meta_state_check_grounding` on `tools/learning-loop-mastra/create-loop-tool.js` — record fingerprint.

**Non-migrated co-located tests (out of scope):** `tools/learning-loop-mcp/tools/{check-runtime-agnostic-tool,runtime-state-read-tool,runtime-state-record-tool}.test.js` are co-located per-tool tests. They do NOT import the wire-format-coercion module (per Researcher 2 §4); no migration impact. Listed here so the implementer does not mistakenly touch them.

## Acceptance Gate

| Gate | Pass condition |
|---|---|
| All 10 test namespaces pass | `pnpm test` exit 0 |
| JSON Schema parity preserved (ALL 40 tools, not 1 sample — red-team finding 6.1) | `z.toJSONSchema(migratedSchema, {target:'draft-7', io:'input'})` byte-equal to pre-migration baseline for all 40 tools |
| Boolean semantic guards fire correctly (red-team finding 6.2) | `boolean-semantic-guards.test.js` passes; 7 inputs × 5 fields all return expected boolean |
| `.passthrough` / `.strict` schemas unchanged (red-team finding 6.5) | Phase 1 step 7 verification passes |
| SP2 grounding on `create-loop-tool.js` | `meta_state_check_grounding` succeeds; fingerprint recorded |
| Net test delta | -4 test files; +1 (`boolean-semantic-guards.test.js`); net -3 |
| No new test namespaces | `package.json#scripts.test` glob unchanged |

## Success Criteria

- 4 mcp-side wire-format tests renamed with zod-direct assertions.
- 4 mastra-side wire-format tests deleted.
- `parity-zod-to-json-schema.test.js` renamed to `coerce-correctness.test.js` AND rewritten.
- 1 stdio smoke gate retained.
- `pnpm test` exits 0.
- SP2 fingerprint recorded.
- Single PR; no transport changes.

## Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Double-nested `{item: {item: [...]}}` fails | Low | Researcher 1 confirmed wire format never produces double envelopes; document |
| Stdio smoke test flake | Low | Retain 1; cold-session tests cover transport separately |
| Rename collides with Plan 3 followups | Low | Researcher 2 §8.3 confirmed not in current `ls` |
| `withMcpServer` removed too aggressively | Low | 1 retained; documented |

## Operator Decisions Needed

### Decision 5 — Stdio smoke test retention

**Option A (RECOMMENDED):** Retain 1 stdio integration test as smoke gate (in `zod-coerce-top-level.test.js`).
- Rationale: Dropping all 4 stdio-spawn tests loses transport-layer coverage beyond cold-session. Retaining 1 catches wire-format regressions at the integration boundary.
- Cost: ~500ms per `pnpm test` run.

**Option B:** Drop all 4 stdio-spawn tests; rely on cold-session tests (`mcp-protocol-e2e.test.cjs`, `connect-mcp-server-mutex.test.js`, `cold-session-discoverability.test.cjs`).
- Cost: ~500ms saved; less granular transport signal.

**Plan recommendation:** Option A. Cold-session tests are coarse-grained; focused stdio smoke catches `createLoopTool` ↔ `@mastra/core/tools` integration regressions.

## Next Steps

- Post-PR: SP2 grounding on `create-loop-tool.js` (10-line factory) records post-migration fingerprint.
- Operator-guide: document the new `z.coerce.boolean()` contract + the 5 HIGH/CRITICAL fields with semantic guards.
- Phase D productization can proceed (coerce-layer debt cleared).
