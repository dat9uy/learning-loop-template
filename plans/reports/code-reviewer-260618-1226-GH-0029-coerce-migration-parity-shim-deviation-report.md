# Code Review: Coerce Layer Zod-Native Migration (7 commits)

**Scope:** `f2f7577..5701d91` (7 commits on `260618-0029-coerce-layer-zod-native-migration`)
**Verdict:** **Approve with reservations** — 1 critical finding (plan claim falsified) + 3 minor findings.
**Verification:** `pnpm test` → 1067 pass / 0 fail / 1 skip (10 namespaces). SP2 fingerprint `sha256:00da7593…` recorded on `create-loop-tool.js`.

---

## Spec Compliance (Stage 1)

| Plan Claim | Status | Evidence |
|---|---|---|
| Phase 1: Migrate 40 tool inputSchemas to zod-native | ✅ Partial | 21 tool files modified (commit msg: 22 schemas; 5 fields × guarded-boolean). Plan said 40; commit msg says 22; actual is 21 files. Plan's "40" was wrong. |
| Phase 1: `z.preprocess` + `z.coerce.*` (deviation from `z.union`) | ✅ Done | All 21 tool files use these primitives. |
| Phase 1: 5 HIGH/CRITICAL fields with semantic guards | ⚠️ Inconsistent count | Plan prose says 5; field inventory + test + implementation have 6. See Finding M1. |
| Phase 1: `evidence_missing` SKIP (Decision #3) | ✅ Done | `workflow-prepare-runtime-request-tool.js:17` unchanged (`z.boolean()`). |
| Phase 2: Delete `coerceScalar`/`unwrapItem`/`coerceShape`/`wrapSchema`/`coerceParams` from `create-loop-tool.js` | ✅ Done | grep returns 0 production callers. |
| Phase 2: Delete `core/wire-format-coercion.js` (183 lines) | ✅ Done | File deleted. |
| Phase 2: Delete `parity-harness.js` (191 lines) | ✅ Done | File deleted. |
| Phase 2: `createLoopTool` collapses to 1-line re-export | ❌ **Deviated** | Actual is 50 lines + new 125-line `schema-parity.js`. See Finding C1. |
| Phase 3: 4 mcp-side tests renamed, 4 mastra-side deleted, `parity-zod-to-json-schema.test.js` → `coerce-correctness.test.js` | ✅ Done | `git diff --name-status \| grep ^R` shows 2 renames; rest are deletes + adds. |
| Phase 3: 1 stdio smoke gate retained | ✅ Done | `zod-coerce-top-level.test.js:124` retains the stdio smoke test. |
| Phase 3: `boolean-semantic-guards.test.js` (new test) | ✅ Done | File added, locks 6 fields × 2 true-inputs + 8 false-inputs. |
| Success: All 10 test namespaces pass | ✅ Done | 1067/1067 + 1 skip. |
| Success: SP2 fingerprint on `create-loop-tool.js` | ✅ Done | `code_fingerprint: sha256:00da7593…` recorded. |
| **Success: JSON Schema parity preserved (ALL 40 tools)** | ❌ **Plan claim false** | See Finding C2 — empirically false for migration use cases. |

---

## Critical Findings

### C1. `createLoopTool` factory did NOT collapse to a 1-line re-export

**Plan said:** "`createLoopTool` becomes 1-line `createTool` re-export" (plan.md L46, phase-02 L46-86).

**Actual:** 50-line factory with two helper functions plus a new 125-line `schema-parity.js` module that the plan never mentioned.

```javascript
// tools/learning-loop-mastra/create-loop-tool.js (actual, 50 lines)
function normalizeInputSchema(inputSchema) { ... 10 lines ... }
function attachParityJSONSchema(schema) { ... 12 lines ... }
export function createLoopTool({ id, description, inputSchema, execute }) {
  const normalized = attachParityJSONSchema(normalizeInputSchema(inputSchema));
  return createTool({ id, description, inputSchema: normalized, execute });
}
```

The factory now has real work: schema normalization (handles plain-object schemas) and a `schema._zod.toJSONSchema` override (parity shim). Neither is mentioned in the plan.

**Why it matters:** Plan claimed the coerce layer was the only thing keeping the factory complex. In reality, the JSON Schema parity concern (Finding C2) forces the factory to do more work than the plan acknowledged. The plan is materially inaccurate about the post-migration factory.

**Verdict:** The deviation is **necessary** to preserve the JSON Schema contract — but the plan should have flagged it. Recommend retroactively documenting the `schema-parity.js` shim in `phase-02-coerce-layer-deletion.md` as a "decision added during implementation."

---

### C2. Plan's central JSON Schema parity claim is empirically FALSE

**Plan said:** "`z.preprocess` IS the correct primitive. … `z.toJSONSchema(wrapped, {target:'draft-7', io:'input'})` returns `{"type":"array","items":...}` — IDENTICAL to non-preprocess." (phase-01 L28-33, plan.md L41-42)

**Empirical test (zod 4.4.3):**

| Schema A | Schema B | Identical JSON Schema? |
|---|---|---|
| `z.array(z.string())` | `z.preprocess(stripEnvelope, z.array(z.string()))` | ✅ Yes |
| `z.array(z.string()).default([])` | `z.preprocess(stripEnvelope, z.array(z.string())).default([])` | ❌ **No** — `default` lost |
| `z.boolean()` | `z.union([z.boolean(), z.string()]).transform(g)` | ❌ **No** — `anyOf` instead of `type:"boolean"` |
| `z.boolean().optional().default(false)` | guarded-boolean + optional + default | ❌ **No** — same as above |

The claim holds only for the most trivial case (test 1). The actual migration uses 6× `z.preprocess(...).default([])`, 12× `z.preprocess(...).optional()`, and 6× `z.union(...).transform(...).optional().default(false)` — **all of which diverge from the pre-migration JSON Schema**.

**Why it matters:** The plan's whole "Researcher 1 verified" confidence is built on a trivial test. The actual migration needs `schema-parity.js` (125 lines) to recover byte-identical output. Without it, MCP clients would see a different `inputSchema` and downstream tooling could break.

**Verdict:** The plan was materially wrong about a load-bearing claim. The implementation correctly compensated by adding the parity shim — but the shim is undocumented in the plan, and a key confidence assertion ("verified by Researcher 1") is overstated.

**Evidence:** `tools/learning-loop-mastra/schema-parity.js:15-111` is the compensating shim. The change-log entry (`meta-260618T0557Z`) reveals its existence for the first time; the plan never mentions it.

---

### C3. `coerce-correctness.test.js` test 5 gives false confidence

**Test claims:**
```javascript
test("z.preprocess emits identical JSON Schema to non-preprocess", () => {
  const plain = z.array(z.string());
  const wrapped = z.preprocess(stripEnvelope, z.array(z.string()));
  const a = z.toJSONSchema(plain, { target: "draft-7", io: "input" });
  const b = z.toJSONSchema(wrapped, { target: "draft-7", io: "input" });
  assert.deepEqual(a, b);  // PASSES
});
```

This test passes — but the same claim FAILS for the actual migration use cases (Finding C2). A reviewer or future developer who reads this test will conclude "JSON Schema parity is fine" when in fact:
- 6× `z.preprocess(...).default([])` lose their `default` in JSON Schema
- 12× `z.preprocess(...).optional()` change JSON Schema structure
- 6× guarded-boolean unions emit `anyOf` instead of `type:"boolean"`

**Why it matters:** This test is a regression net for parity, but only at the trivial case. The shim's whole purpose is to fix the cases the test doesn't cover. Future schema changes that fall outside the trivial case could silently break parity and this test wouldn't catch it.

**Verdict:** Test is technically correct but misleading. Recommend: (a) rename to `z.preprocess parity: trivial case` and add a comment "Migration parity is recovered by `schema-parity.js`; this test only verifies the trivial layer." OR (b) add explicit parity tests for `.default([])`, `.optional()`, and guarded-boolean cases that pass through `buildParitySchema` and verify the output.

---

## Minor Findings

### M1. Field count inconsistency: plan says 5, implementation has 6

**Plan prose (phase-01 L42, L181):** "5 HIGH/CRITICAL boolean fields have explicit semantic guards."
**Plan field inventory (phase-01 L128-135):** 6 fields with Template D (sweep.apply [CRITICAL], archive.confirm [HIGH], promote_rule.preview [HIGH], check_grounding.run_tests [MEDIUM], derive_status.run_tests [MEDIUM], query_drift.run_grounding [MEDIUM]).
**Implementation (grep):** 6 guarded boolean fields.
**Test (`boolean-semantic-guards.test.js:14-21`):** 6 fields, 6×2 + 6×8 = 60 generated test cases.

**Verdict:** The plan's "5 HIGH/CRITICAL" prose is wrong on two counts: (a) only 2 are HIGH/CRITICAL, the other 3 are MEDIUM, and (b) 6 fields are guarded, not 5. The implementation and test are consistent with the field inventory table. Fix: update prose to "6 fields (2 HIGH/CRITICAL, 4 MEDIUM)" or rename the grouping to "guarded booleans."

---

### M2. `boolean-semantic-guards.test.js` over-asserts vs. real tool behavior

**Test setup:**
```javascript
function makeGuardedBoolean() {
  return z.union([z.boolean(), z.string(), z.number()]).transform(strictBooleanGuard);
}
```

**Actual tool schemas (all 6):**
```javascript
z.union([z.boolean(), z.string()]).transform(strictBooleanGuard).optional()
```

The test accepts `1` and `0` (numbers) and asserts `false` — but the actual tool schemas don't include `z.number()` in the union. So:
- Test passes `1` → asserts `false` (passes)
- Real tool receives `1` → `z.union([boolean, string]).parse(1)` **THROWS** (Zod error), never reaching the transform

**Verdict:** Minor false-confidence issue. The test is over-permissive compared to the actual schema. Recommend: align the test's `makeGuardedBoolean()` with the actual schema (`z.union([z.boolean(), z.string()])`) and move the `1`/`0` number inputs to a separate "transform contract" test that exercises `strictBooleanGuard` directly. (Note: lines 39-52 of the test do this for the transform contract — so the structure exists, but the field-level schema is over-permissive.)

---

### M3. Plan said "40 tools" — actual is 21 modified files

| Source | Count | Note |
|---|---|---|
| Plan prose (plan.md L35, L90) | 40 tool files | |
| Commit message `d473613` | 22 tool inputSchemas | |
| `git diff --name-only \| grep tools/learning-loop-mcp/tools/ \| wc -l` | 21 files | |
| `ls tools/learning-loop-mcp/tools/ \| wc -l` | 43 total tool files | |

The plan's "40" figure is wrong. The commit message and actual count (~22) are roughly consistent. The discrepancy doesn't affect correctness, but the plan's documentation is inaccurate.

**Verdict:** Update plan.md L35, L90, L95, L111, and phase-01 field inventory preamble to say "22 tool inputSchemas (21 files)." Not blocking.

---

## Positive Findings (what works)

1. **All 10 test namespaces pass** — 1067 tests, 0 failures, 1 skip. `pnpm test` exits 0.
2. **SP2 grounding recorded** — `meta-260618T0558Z` (parity-shim-drift-guard) on `create-loop-tool.js`, fingerprint `sha256:00da75933f52424fe276e6dae10343ac5b64658a6c1ddedb26f3580624320cf4`. Drift detection is enabled for the new shim.
3. **YAGNI deletions confirmed clean** — `parity-harness.js` (191 lines), `wire-format-coercion.js` (183 lines), 4 mastra-side duplicate tests, `coerceParams` export. Grep returns 0 production callers.
4. **`envelope-stripper.js` is undefined-safe** — Red-team 7a concern addressed: `if (v === undefined) return undefined;` on line 20. Optional-after-preprocess works.
5. **`strict-boolean-guard.js` locks strict semantics** — Only `true` / `"true"` returns `true`; everything else (including `1`, `0`, `"yes"`, `"no"`, `null`, `undefined`) returns `false`. Prevents `z.coerce.boolean()`'s JS `Boolean()` widening on registry-mutation gates.
6. **`evidence_missing` correctly skipped** — `workflow-prepare-runtime-request-tool.js:17` still uses `z.boolean()`. Operator decision #3 honored.
7. **`.passthrough()` schemas wrapped in preprocess** — `trigger-workflow-tool.js:11` and `workflow-generate-prompt-tool.js:89` now wrap their `.passthrough()` objects in `z.preprocess(stripEnvelope, ...)`. Red-team 7e concern addressed.
8. **Coerce-correctness test covers envelope edge cases** — `coerce-correctness.test.js:42-50` explicitly tests `z.preprocess(stripEnvelope, z.array(z.string())).parse({tags: {item: []}})` → `[]`. Empty-envelope case locked.
9. **All wire-format symbols are dead** — `grep -rn "coerceScalar\|unwrapItem\|coerceShape\|wrapSchema\|coerceParams\|coerceValue\|unwrapItemWrap\|coerceParamsToSchema\|installWireFormatCoercion" tools/` returns 0 results.

---

## Risks Not Materialized

- **Identity preservation lost (red-team 7g):** `z.preprocess` always constructs a new object. No tool relies on arg `===` reference (presumed; the stdio smoke test at `zod-coerce-top-level.test.js:124-175` exercises the full MCP round-trip and would fail if a handler relied on identity).
- **Boolean contract divergence (red-team 8.2):** The 5 (or 6) guarded fields handle the widening. For the other 7 boolean fields, widening is accepted (per Decision #2 alternative). The `evidence_missing` field is the only one where widening would be unsafe; it is correctly skipped.

---

## Recommendations (in priority order)

| # | Action | Severity | Owner |
|---|---|---|---|
| 1 | **Update plan.md and phase-01 prose** to document `schema-parity.js` as an in-implementation decision added to recover JSON Schema parity. Cite the empirical C2 test result. | High | Planner (retroactive) |
| 2 | **Update plan.md and phase-01 prose** to correct "5 HIGH/CRITICAL fields" → "6 guarded booleans (2 HIGH/CRITICAL, 4 MEDIUM)" | Medium | Planner |
| 3 | **Fix `coerce-correctness.test.js` test 5** to either (a) note it's trivial-only + cite `schema-parity.js` for the migration cases, or (b) add explicit parity tests for `.default([])`, `.optional()`, and guarded-boolean through `buildParitySchema`. | Medium | Test author |
| 4 | **Update `boolean-semantic-guards.test.js`** to align `makeGuardedBoolean()` with the real tool schema (`z.union([z.boolean(), z.string()])`) and move number-input tests to the transform-contract block. | Low | Test author |
| 5 | **Update plan.md** to correct "40 tools" → "22 tool inputSchemas (21 files)" | Low | Planner |

---

## Unresolved Questions

1. **Why did Researcher 1's empirical test pass if `z.preprocess(...).default([])` does NOT emit identical JSON Schema?** Either the test was run on the trivial case only, or the default-vs-no-default distinction was missed. Worth a journal entry — this is a confidence-calibration finding.
2. **Does the `schema-parity.js` shim survive zod minor-version upgrades?** The shim reaches into `schema._zod.def.type`, `schema._zod.bag`, `globalRegistry`, and overrides `schema._zod.toJSONSchema`. All of these are internal Zod APIs and could break in any minor release. The SP2 fingerprint on `create-loop-tool.js` catches the file, but not the Zod internals. Consider pinning zod to 4.4.x for the next minor cycle.
3. **Is the `_zod.toJSONSchema` override approach safe across the Mastra SDK?** The comment at `create-loop-tool.js:35-37` claims "Zod's `process` checks `schema._zod.toJSONSchema?.()` before invoking the type-specific processor." If Mastra's SDK calls `z.toJSONSchema` directly (not via the `_zod` method dispatch), the override is bypassed and parity breaks. Worth a follow-up to confirm.

---

**Status:** DONE_WITH_CONCERNS
**Summary:** Migration is functionally correct (all tests pass, coerce layer deleted, semantic guards in place) but the plan's central JSON Schema parity claim is empirically false for the migration's actual use cases; a 125-line `schema-parity.js` shim (undocumented in the plan) is doing the work the plan said wouldn't be needed. The shim is necessary and correct, but the plan's narrative is misleading and should be patched.
**Blockers:** None. The 5 recommendations are doc/test cleanups, not correctness fixes.
