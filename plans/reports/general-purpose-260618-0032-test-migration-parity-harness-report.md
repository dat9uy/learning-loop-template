# Researcher 2 — Test Migration + Parity Harness

**Slug:** coerce-layer-zod-native-test-migration
**Date:** 2026-06-18
**Status:** DONE_WITH_CONCERNS
**Scope:** Test migration + parity-harness impact for the coerce layer zod-native migration (Q2 brainstorm).
**Predecessors:** `brainstorm-260617-0212-coerce-layer-zod-native-migration.md` (Option A locked), `260616-2200-phase-c-plan-2-parity` (parity gate closed 2026-06-17), `260617-1950-phase-c-plan-3-cut-over` (merged 2026-06-17).

---

## Critical Context (verified)

- **Plan 3 is merged** (`f9e4653 feat(mastra): Phase C Plan 3 operational cut-over`).
- **`tools/learning-loop-mcp/tool-registry.js` is DELETED** (per Plan 3 Group 12; `find` returns no result).
- **`tools/learning-loop-mcp/server.js` is DELETED** (per Plan 3 Group 12; `find` returns no result).
- **`tools/learning-loop-mcp/core/wire-format-coercion.js` exists** (183 lines; lifted from tool-registry.js per Plan 3 Group 6, C-4 fix).
- **Mastra factory is active** (`tools/learning-loop-mastra/create-loop-tool.js:144-146`; 1-line createTool re-export, with `coerceScalar`/`unwrapItem`/`coerceShape`/`wrapSchema` in lines 39-137 + `coerceParams` export at 139-142).
- **Mastra server uses `#mcp/*` re-exports** (`tools/learning-loop-mastra/server.js:2,17-20`); the legacy tool files in `tools/learning-loop-mcp/tools/*.js` are the single source of truth for `schema` + `handler`.
- **`schemas.js` re-exports 3 tools** from `#mcp/*` (`metaStateProposeDesignTool`, `metaStatePatchTool`, `metaStateReportTool`); only 3 of the 40 tools, so it's not the canonical source of all schemas.
- **`tools/learning-loop-mastra/__tests__/parity-zod-to-json-schema.test.js` already exists** (62 lines; uses `coerceParams` directly to test single-server coerce correctness — comment on line 8-9 says "Post-cut-over there is only one server, so this test verifies the coerce layer directly instead of comparing two servers"). The "coerce-correctness" name is internal to a `describe()` block inside this file, not a separate file.
- **The 4 wire-format tests are DUPLICATED in both `tools/learning-loop-mcp/__tests__/` and `tools/learning-loop-mastra/__tests__/`** (confirmed via `ls`). This is an immediate blast-radius amplifier: 8 test files, not 4.

---

## 1. Test Migration Mapping

For the 4 wire-format tests, the **proposed rename applies to BOTH copies** (mcp-side + mastra-side). The mcp-side `coerceParamsToSchema`/`installWireFormatCoercion` are imported from the legacy lifted helper; the mastra-side `coerceParams` is imported from `create-loop-tool.js`. After migration:

- mcp-side copy: `coerceParamsToSchema` → `z.coerce.boolean().parse(...)` direct calls (no helper, no zod schema; just verifies the zod API contract)
- mastra-side copy: `coerceParams` removed; tests become the same direct zod calls

| Old test name | New test name | New assertion (specific z.coerce.* call) |
|---|---|---|
| `wire-format-coercion-fix.test.js` | `zod-coerce-boolean-string.test.js` | `assert.equal(z.coerce.boolean().parse("true"), true); assert.equal(z.coerce.boolean().parse("false"), false); assert.equal(z.coerce.boolean().parse("1"), true);` (semantic widening) |
| `wire-format-top-level-coercion.test.js` | `zod-coerce-top-level.test.js` | `const schema = z.object({ flag: z.coerce.boolean() }); assert.deepEqual(schema.parse({ flag: "true" }), { flag: true });` |
| `wire-format-meta-state-optional-fields.test.js` | `zod-optional-coerce.test.js` | `const schema = z.object({ m: z.coerce.boolean().optional() }); assert.equal(schema.parse({}), {}); assert.equal(schema.parse({ m: "true" }).m, true);` |
| `wire-format-patch-recursion.test.js` | `zod-union-envelope.test.js` | `const schema = z.object({ tags: z.union([z.array(z.string()), z.object({ item: z.array(z.string()) })]) }); assert.deepEqual(schema.parse({ tags: { item: ["a","b"] } }), { tags: ["a","b"] }); assert.deepEqual(schema.parse({ tags: ["a","b"] }), { tags: ["a","b"] });` |

**Brainstorm rename accuracy:** CONFIRMED. The 4 new names match the brainstorm's table at `plans/reports/brainstorm-260617-0212-coerce-layer-zod-native-migration.md:113-116`.

**Caveat:** the new tests are simpler than the originals because they exercise zod directly, not the legacy `coerceValue` helper. This loses 2 things:
1. The `{item: []} → []` recursion test (mcp-side `wire-format-patch-recursion.test.js:203-218`); zod union handles it natively, but a regression test is still warranted.
2. The "returns original args reference when no coercion happened" test (mcp-side `wire-format-coercion-fix.test.js:48-58`); irrelevant after migration (zod's `parse` always returns a new object, identity-preservation is gone).

**Also:** the 4 mcp-side tests currently have `withMcpServer` spawn patterns (each test spawns a stdio server). The new zod-native tests can drop the spawn entirely. See section 7.

---

## 2. Test Co-Location Strategy

**Brainstorm proposal (line 118):** "co-locate with the schemas they test (per tool, not in global `__tests__/`). The 4 global tests become smoke tests for the contract; per-tool tests are the implementation."

**Existing test layout evidence:**

- `tools/learning-loop-mcp/tools/` contains 30 tool files. Of these, **only 3 have co-located `*.test.js` files**: `check-runtime-agnostic-tool.test.js`, `runtime-state-read-tool.test.js`, `runtime-state-record-tool.test.js` (per `ls`).
- `tools/learning-loop-mastra/tools/` contains **only `manifest.json`** (12 bytes per the `ls` listing). All tools are imported via `#mcp/*` re-exports; the per-tool source files live in `tools/learning-loop-mcp/tools/`.
- The vast majority of meta-state tests (107 files in `tools/learning-loop-mcp/__tests__/`) live in the global `__tests__/` directory, not co-located.

**Conclusion:** the existing layout **does not support** the brainstorm's co-location goal. Adding per-tool tests for 4 schemas would create 8 new files (4 mcp + 4 mastra) in 2 different `tools/*/schema-name.test.js` locations, breaking the established convention.

**Recommended split:**

| Test | Location | Why |
|---|---|---|
| `zod-coerce-boolean-string.test.js` | Global `tools/learning-loop-mcp/__tests__/` | Smoke test for the zod contract; no tool-specific assertion |
| `zod-coerce-top-level.test.js` | Global `tools/learning-loop-mcp/__tests__/` | Same |
| `zod-optional-coerce.test.js` | Global `tools/learning-loop-mcp/__tests__/` | Same |
| `zod-union-envelope.test.js` | Global `tools/learning-loop-mcp/__tests__/` | Same |
| Mastra-side duplicates (4 files) | **DELETE entirely** | Post-cut-over there is one canonical server; the mcp-side tests + `parity-zod-to-json-schema.test.js` (the renamed `coerce-correctness` test) cover the contract |

**Net test files after migration:** -4 (delete 4 mastra-side `wire-format-*.test.js`) + 4 (add 4 zod-native names) = 0 net change in mcp namespace. **Mastra namespace loses 5 files** (-4 wire-format + the existing `parity-zod-to-json-schema.test.js` is renamed to `coerce-correctness.test.js` per Plan 3 Group 11 C-8).

**Why not per-tool co-location:** the 4 zod-native tests are testing **zod's own behavior**, not the loop's. They are pure smoke tests of `z.coerce.*` + `z.union` against Zod 4.4.3. The loop's schema correctness is tested by the per-tool tests in `meta-state-propose-design-tool.test.js` and similar. Co-locating zod-API smoke tests with tools is upside-down: the test asserts what zod does, not what the tool does.

---

## 3. Parity-Harness Impact

**File:** `tools/learning-loop-mastra/__tests__/parity-harness.js` (191 lines)

**Exports used post-cut-over:**
- `schemaJsonParity(legacySchema, mastraSchema)` (lines 91-111): normalizes both schemas via `z.toJSONSchema({ target: "draft-7", io: "input" })` and compares.
- `toolsListParity(legacyList, mastraList, opts)` (lines 119-161): compares two `tools/list` responses.
- `toolsCallParity(legacyCall, mastraCall, opts)` (lines 166-190): compares two `tools/call` content payloads.

**Current state:** **the harness is DEAD CODE** post-Plan 3.
- `toolsListParity(legacy, mastra)` requires both `legacyList` and `mastraList`. The legacy server is deleted; there is no source for `legacyList` post-Plan 3.
- `toolsCallParity(legacy, mastra)` requires both. Same problem.
- `schemaJsonParity(legacy, mastra)` requires both. Same problem.

**The only call site is the (renamed) `coerce-correctness.test.js` test that imports `coerceParams` directly, NOT the parity harness.** `grep -rn "schemaJsonParity\|toolsListParity\|toolsCallParity"` returns no callers (all 3 exports are unused in production or tests).

**Per Plan 3 Group 11 (C-8 fix), `parity-zod-to-json-schema.test.js` was rewritten as the single-server `coerce-correctness` test** (already done in commit `f9e4653`).

**Recommendation:**
- `parity-harness.js` (191 lines) is unreferenced dead code. Options: (a) keep as scaffolding for future cross-server parity (e.g., Phase E HTTP transport parity), (b) delete. YAGNI/KISS says (b) — delete. But the export surface may have a plan-3-anchored fingerprint (need to check via `meta_state_check_grounding`; not done here).
- `parity-harness.test.js` (per `ls` — 3.6KB) is the harness's own self-test. Likely still passes (it's a unit test of the comparison functions). Can stay until harness is deleted.

**The zod-native migration does NOT change the harness's relevance further** — it was already killed by Plan 3's cut-over.

---

## 4. Test Blast Radius

**Beyond the 4 wire-format tests, every file that imports from `core/wire-format-coercion.js` or tests the coerce layer:**

| File | path:line | What it tests | Migration impact |
|---|---|---|---|
| `tools/learning-loop-mcp/__tests__/wire-format-coercion-fix.test.js` | line 3 | `coerceParamsToSchema` array/boolean/number coercion + identity preservation | Migrate to `zod-coerce-boolean-string.test.js` (section 1) |
| `tools/learning-loop-mcp/__tests__/wire-format-top-level-coercion.test.js` | line 14 | `installWireFormatCoercion` patches `McpServer.validateToolInput`; stdio {item:[]} unwrap; tools/list schema preservation | Migrate to `zod-coerce-top-level.test.js`; `installWireFormatCoercion` test is moot (no McpServer post-cut-over) |
| `tools/learning-loop-mcp/__tests__/wire-format-meta-state-optional-fields.test.js` | line 4 | Optional-field safeParse on hand-rolled zod schemas | Migrate to `zod-optional-coerce.test.js`; `installWireFormatCoercion` import is unused in the test body (line 56 is a comment) |
| `tools/learning-loop-mcp/__tests__/wire-format-patch-recursion.test.js` | line 13 | `coerceParamsToSchema` recursion (max depth 2); stdio combined patch | Migrate to `zod-union-envelope.test.js` |
| `tools/learning-loop-mastra/__tests__/wire-format-coercion-fix.test.js` | line 3 | `coerceParams` from `create-loop-tool.js` | **DELETE** (covered by `parity-zod-to-json-schema.test.js`) |
| `tools/learning-loop-mastra/__tests__/wire-format-patch-recursion.test.js` | line 13 | `coerceParams` recursion; stdio combined patch | **DELETE** (covered by `parity-zod-to-json-schema.test.js`) |
| `tools/learning-loop-mastra/__tests__/wire-format-top-level-coercion.test.js` | line 14 | stdio {item:[]} + createLoopTool wraps with ZodPreprocess (line 257-262) | **DELETE** (the factory check is internal to the migration) |
| `tools/learning-loop-mastra/__tests__/parity-zod-to-json-schema.test.js` | line 4 | 7-test `describe("coerce-correctness")` block; tests `coerceParams` directly | Keep, but **rename** to `coerce-correctness.test.js` per Plan 3 Group 11 (C-8 fix) — not done yet? verify |
| `tools/learning-loop-mastra/__tests__/parity-harness.test.js` | (per `ls`, 3.6KB) | self-test of `parity-harness.js` exports | Unaffected by migration; may be delete-eligible with the harness |
| `tools/learning-loop-mastra/create-loop-tool.js` | line 139 | `export function coerceParams` | **DELETE** the export (per brainstorm line 123-124) |
| `tools/learning-loop-mcp/core/wire-format-coercion.js` | (183 lines total) | Lifted legacy helper | **DELETE the entire file** (per brainstorm line 128) once the 4 mcp-side wire-format tests are migrated. The 4 mcp-side test imports of this file will go away with the rename. |

**Side effects to confirm before deletion:**
- `installWireFormatCoercion` (legacy helper, lines 151-182) is imported by 2 mcp-side tests. Both tests become obsolete (no `McpServer` post-cut-over). Helper delete is safe.
- `coerceValue` / `unwrapItemWrap` (legacy helper, lines 27-49, 61-78) are internal — not exported, not imported. Delete is safe.
- `unwrapTypeName` (legacy helper, lines 9-25) is internal — same.

**Co-located `*.test.js` files in mcp `tools/`:**
- `check-runtime-agnostic-tool.test.js`, `runtime-state-read-tool.test.js`, `runtime-state-record-tool.test.js` (per `ls`).
- These do NOT import the wire-format-coercion module. They test runtime state. No migration impact.

**No test in `tools/learning-loop-mcp/core/__tests__/`, `tools/learning-loop-mcp/scout/__tests__/`, `tools/learning-loop-mcp/lib/__tests__/`, `tools/learning-loop-mcp/evals/__tests__/`, `tools/learning-loop-mcp/tools/__tests__/` tests the coerce layer** (per grep scope; no `coerceParams`/`coerceValue`/`unwrapItem`/`installWireFormatCoercion` references in those directories).

---

## 5. Test Namespace Impact

**`package.json#scripts.test` (line 22-25):**
```
"test": "node --test 'tools/learning-loop-mcp/__tests__/*.test.js' 'tools/learning-loop-mcp/core/__tests__/*.test.js' 'tools/learning-loop-mcp/core/*.test.js' 'tools/learning-loop-mcp/scout/*.test.js' 'tools/learning-loop-mcp/lib/*.test.js' 'tools/learning-loop-mcp/evals/*.test.js' 'tools/learning-loop-mcp/tools/*.test.js' 'tools/learning-loop-mastra/__tests__/*.test.js' '.claude/coordination/__tests__/*.test.cjs' '.factory/hooks/__tests__/*.test.cjs'"
```

**Per-namespace impact:**

| Namespace (glob) | Pre-migration file count | Post-migration file count | Notes |
|---|---|---|---|
| `tools/learning-loop-mcp/__tests__/*.test.js` | 107 | 107 (4 renamed: `wire-format-*` → `zod-coerce-*`/`zod-union-*`) | No net change; old name is fully replaced by new name in same dir |
| `tools/learning-loop-mcp/core/__tests__/*.test.js` | 0 | 0 | Unaffected |
| `tools/learning-loop-mcp/core/*.test.js` | 2 (`loop-introspect.test.js`, `meta-state.test.js`, `record-validation-rules.test.js`, `workflow-registry.test.js`) | Same | Unaffected (none test coerce layer) |
| `tools/learning-loop-mcp/scout/*.test.js` | 0 | 0 | Unaffected |
| `tools/learning-loop-mcp/lib/*.test.js` | 0 | 0 | Unaffected |
| `tools/learning-loop-mcp/evals/*.test.js` | 0 | 0 | Unaffected |
| `tools/learning-loop-mcp/tools/*.test.js` | 3 (co-located) | 3 | Unaffected (do not import coerce) |
| `tools/learning-loop-mastra/__tests__/*.test.js` | 12 | **8** (-4 wire-format deleted) | Rename `parity-zod-to-json-schema.test.js` → `coerce-correctness.test.js` per Plan 3 Group 11 C-8 |
| `.claude/coordination/__tests__/*.test.cjs` | 1 (`claude-code-mcp-loading.test.cjs`) | 1 | Unaffected |
| `.factory/hooks/__tests__/*.test.cjs` | 1+ | Same | Unaffected |
| **TOTAL** | ~123 | ~119 | -4 net |

**No new namespaces needed.** The 4 new zod-native tests fit cleanly in `tools/learning-loop-mcp/__tests__/` (existing pattern).

**Test count math (informational):**
- 4 mcp-side wire-format tests: 5+5+4+5 = 19 test() blocks (per ls `-l` line counts and review).
- 4 mastra-side wire-format tests: 5+4+4+5 = 18 test() blocks.
- 4 new zod-native tests: estimate 4-8 test() blocks (less stdio, more focused).
- `parity-zod-to-json-schema.test.js`: 7 test() blocks.
- Net: 19 - 19 (mcp) + 4-8 (mcp new) + 18 - 18 (mastra deleted) = -15 to -11 test() blocks. Cleaner suite.

**Cold-session test impact:** `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` does not import coerce helpers (per scope). Unaffected.

---

## 6. coerceParams Callers

**`coerceParams` (active export, mastra `create-loop-tool.js:139-142`) is called by:**

| Caller | path:line | Purpose |
|---|---|---|
| `tools/learning-loop-mastra/__tests__/parity-zod-to-json-schema.test.js` | line 4 (import); lines 13, 14, 19, 20, 21, 22, 27, 33, 41, 51, 59 (11 calls) | Single-server `coerce-correctness` regression net |
| `tools/learning-loop-mastra/__tests__/wire-format-coercion-fix.test.js` | line 3 (import); lines 12, 22, 25, 35, 38, 41, 52, 58 (8 calls) | Unit + real-schema regression |
| `tools/learning-loop-mastra/__tests__/wire-format-patch-recursion.test.js` | line 13 (import); lines 175, 187, 205 (3 calls) | Recursion + real-schema |

**After migration:**
- `parity-zod-to-json-schema.test.js` is renamed to `coerce-correctness.test.js` AND rewritten to use direct zod calls (no `coerceParams`). The 11 calls go away.
- `wire-format-coercion-fix.test.js` is **deleted** (per section 4). The 8 calls go away.
- `wire-format-patch-recursion.test.js` is **deleted**. The 3 calls go away.

**`coerceParams` is NEVER called from production code** (only tests). Confirmed via grep: the only non-test call site would be `create-loop-tool.js` self-usage, and there is none (the function is exported but not invoked internally — `wrapSchema` at line 128-137 uses `coerceShape` directly, not `coerceParams`).

**`coerceParams` (active) and `coerceParamsToSchema` (legacy) are independent exports** (different files, different signatures). The legacy `coerceParamsToSchema` has 4 mcp-side test callers (sections 4 + 5); the active `coerceParams` has 3 mastra-side test callers + the 11 calls in `parity-zod-to-json-schema.test.js`. All 18 active-side calls are test-only.

**Net:** the `coerceParams` export at `create-loop-tool.js:139-142` is safe to delete after the migration lands. The 3 mastra-side wire-format tests are deleted; `parity-zod-to-json-schema.test.js` is rewritten to use direct zod.

---

## 7. Wire-Format Spawn Overhead

**The 4 mcp-side wire-format tests use a `withMcpServer` helper that spawns `tools/learning-loop-mastra/server.js` via stdio** (4 test files × `withMcpServer` patterns):
- `wire-format-top-level-coercion.test.js:32-122` (~90 lines per file).
- `wire-format-patch-recursion.test.js:32-122` (~90 lines per file).

The mcp-side `wire-format-coercion-fix.test.js` and `wire-format-meta-state-optional-fields.test.js` do NOT spawn a server (they use direct function calls). Only 2 of 4 use the spawn pattern.

**The 4 mastra-side wire-format tests** (now to be deleted per section 2):
- `wire-format-top-level-coercion.test.js:32-122` (identical pattern).
- `wire-format-patch-recursion.test.js:32-122` (identical pattern).
- `wire-format-coercion-fix.test.js`: no spawn.
- `wire-format-meta-state-optional-fields.test.js`: no spawn.

**Post-migration simplification (CONFIRMED):** the 4 new zod-native tests do NOT need a spawn harness. `z.coerce.boolean().parse("true")` is a single function call. The new tests are pure unit tests of the zod API, not integration tests of the stdio transport.

**Test runtime impact (estimate):**
- Current 2 spawn-using tests: ~500ms each (mkdtemp + spawn + 300ms sleep + initialize handshake). ~1s total.
- New zod-native tests: <1ms each. Negligible.
- Savings: ~1s per `pnpm test` run. Minor but real.

**Caveat:** the spawn tests caught **transport-layer bugs** (the `withMcpServer` pattern verifies the stdio framing, GATE_ROOT, MCP initialize handshake, JSON-RPC response shape). Dropping the spawn loses that coverage. The cold-session tests (`mcp-protocol-e2e.test.cjs`, `connect-mcp-server-mutex.test.js`, `cold-session-discoverability.test.cjs`) cover transport separately, so the loss is bounded.

**Recommendation:** keep ONE stdio integration test as a smoke gate (e.g., `mastra_meta_state_report` with `mechanism_check: "true"` over stdio), drop the other 3 spawn tests. The cold-session tests provide transport coverage.

---

## 8. Unresolved Questions

1. **`z.coerce.boolean()` semantic widening** is accepted per the brainstorm (line 76) and the operator approval 2026-06-17. But the **active factory's `coerceValue` returns the original string for non-"true"/non-"false"** (legacy helper line 38-40: `if (value === "true") return true; if (value === "false") return false; return value;`). After migration, `z.coerce.boolean().parse("yes")` returns `true` (semantic widening), where the current code returns `"yes"` (passthrough). **Is this a behavior change for any agent?** No grep for "mechanism_check" found in any prompt/agent file. Likely safe. But not verified by a test. Recommend adding a regression test: `z.coerce.boolean().parse("yes")` → `true` (lock the new contract).

2. **`parity-harness.js` (191 lines) is dead code post-cut-over.** Delete or keep as scaffolding for Phase E HTTP transport parity? The brainstorm doesn't mention it. The Plan 3 plan doesn't mention it. **Operator decision needed.**

3. **The mastra `parity-zod-to-json-schema.test.js` rename to `coerce-correctness.test.js`** is in Plan 3 Group 11 (C-8 fix) but is NOT done in the current `ls` (the file is still `parity-zod-to-json-schema.test.js`). Is the rename pending? It will collide with the 4 zod-native smoke tests if not done first. **Verify post-merge followups plan** (`plans/260617-2352-GH-1607-plan-3-post-merge-followups/plan.md` does not list this rename in phases 1-4).

4. **`tools/learning-loop-mcp/core/wire-format-coercion.js` (183 lines) deletion depends on the mcp-side rename landing first.** If the migration lands in 1 PR (per brainstorm line 73), the 4 mcp-side tests rename + the helper delete + the 4 mastra-side test deletes + the `coerceParams` delete are all atomic. If the migration is split, the helper hangs around as dead code temporarily.

5. **The 4 mcp-side test files do NOT have an `installWireFormatCoercion` user in their test bodies** (only `wire-format-top-level-coercion.test.js:225-242` actually calls it; the other 3 import it as a comment-only reference). So the `installWireFormatCoercion` test (top-level line 225) is the only one that tests the `McpServer.validateToolInput` patch. This test is **moot post-cut-over** (no `McpServer` in production). Should it be deleted, or kept as documentation of the legacy patch's behavior? YAGNI: delete.

6. **The brainstorm's "delete `coerceParams` from `create-loop-tool.js`" recommendation** (line 123-124) is at risk of breaking the `parity-zod-to-json-schema.test.js` (line 4) and 2 mastra-side wire-format tests. The migration MUST update those tests in the same commit, or the test suite breaks. The Plan 3 plan does not mention this — Plan 3 only deletes the legacy `coerceValue`/`unwrapItemWrap` helpers from `create-loop-tool.js`. **The coerceParams delete is Q2 migration scope, NOT Plan 3 scope.** Confirmed by `git log` (no commit between `f9e4653` and HEAD that touches `create-loop-tool.js:139`).

7. **The `z.union` recursion case (`{item: {item: ["a", "b"]}}`)** is currently handled by the active `unwrapItem` function which iterates 3 times. The `z.union` alternative accepts the outer `{item: ...}` but does NOT recursively unwrap — the second `{item: ...}` becomes a validation error. **The `z.union([z.array(...), z.object({item: z.array(...)})])` does NOT solve the double-nested case** that `wire-format-patch-recursion.test.js:169-180` and `wire-format-patch-recursion.test.js:185-198` test. The new `zod-union-envelope.test.js` will FAIL on those inputs unless the union is extended to `z.union([z.array(...), z.object({item: z.array(...)}), z.object({item: z.object({item: z.array(...)})})])` — but that's exponentially verbose. The brainstorm's table (line 116) doesn't address this. **The semantic test coverage loses the double-nested case.** Likely acceptable per the brainstorm's lock (line 79-80: "Do NOT pursue custom stdio parser. SDK coupling risk is too high."), but the test should be updated to reflect the new contract.

8. **`createLoopTool` at `create-loop-tool.js:144-146` returns `createTool({ ..., inputSchema: wrapSchema(inputSchema), ... })`.** Per the brainstorm (line 124), post-migration the wrapper is a 1-line re-export. The `createLoopTool` factory function itself survives (it's the seam for `server.js:21`). But the file's `wrapSchema` (line 128-137) uses `coerceShape` which uses `coerceScalar` + `unwrapItem`. All of `coerceScalar`, `unwrapItem`, `extractShape`, `coerceShape`, `wrapSchema` (lines 39-137) are deleted. Net: the file becomes a 5-line `createLoopTool` re-export + maybe a `coerceParams` shim if kept for back-compat.

---

## Status: DONE_WITH_CONCERNS

**Summary:** Test migration is straightforward (4 renames + 4 deletes) but the blast radius is wider than the brainstorm implies (8 test files affected, not 4; 1 dead-code `parity-harness.js`; 1 cross-cutting `coerceParams` export). The parity-harness is already dead post-Plan 3 and the migration doesn't change that. The 4 new zod-native tests can drop stdio spawn overhead (saving ~1s per `pnpm test` run). Test namespace impact: 0 net change in mcp `__tests__/`, -4 in mastra `__tests__/`. No new namespaces needed.

**Concerns:**
- The `z.union` envelope contract doesn't cover the double-nested `{item: {item: ...}}` case (concern #7). The new `zod-union-envelope.test.js` should be tightened to assert the new contract, or the union should be extended (verbose).
- The 4 mcp-side test files contain 2 stdio-spawn-based tests that the new zod-native tests can drop. But the stdio spawn tests are the only integration coverage of the stdio transport beyond cold-session. Recommend keeping 1 as a smoke gate.
- `parity-harness.js` (191 lines) is dead code post-Plan 3. Operator decision needed: delete or keep as Phase E scaffolding.
- The Plan 3 followups plan does not list the `parity-zod-to-json-schema.test.js` → `coerce-correctness.test.js` rename. The migration plan must address this collision.

**Key files for the migration plan author:**
- `/home/datguy/codingProjects/learning-loop-template/plans/reports/brainstorm-260617-0212-coerce-layer-zod-native-migration.md` (the locked-in decisions)
- `/home/datguy/codingProjects/learning-loop-template/plans/260617-1950-phase-c-plan-3-cut-over/plan.md` (the cut-over plan; source of the lifted helper)
- `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mcp/core/wire-format-coercion.js` (the legacy lifted helper to delete)
- `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/create-loop-tool.js:39-142` (the active coerce layer + `coerceParams` export to delete)
- `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/__tests__/parity-harness.js` (dead code; consider deletion)
