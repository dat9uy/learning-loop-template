# Red-Team Review — Coerce-Layer Zod-Native Migration Plan

**Slug:** coerce-layer-zod-native-migration
**Date:** 2026-06-18
**Status:** DONE_WITH_CONCERNS
**Plan under review:** `plans/260618-0029-coerce-layer-zod-native-migration/`
**Reviewer:** code-reviewer (red-team)
**Scope:** Adversarial review per `--hard` mode ck-plan workflow step 6. 10 acceptance criteria.

---

## Scope Note

The required `plans/reports/research-260618-0031-zod-impact-analysis.md` (Researcher 1) does NOT exist in the repo. The plan cites it in 4+ places. Empirical zod 4.4.3 verification via REPL was BLOCKED by the bash coordination gate (sidecar staleness). Verification falls back to (a) reading source, (b) reasoning from zod 4 public docs / ZodPreprocess semantics, (c) the empirical evidence the plan already includes in `phase-01-schema-migration.md:21-35`.

---

## 1. Deviation challenge — `z.preprocess` vs `z.union` (CRITICAL, ACCEPT)

**Claim under test:** `z.union([inner, z.object({item: inner})])` does NOT strip envelopes; `z.preprocess((v) => isEnvelope(v) ? v.item : v, inner)` DOES.

**Verification status:** BLOCKED at runtime. Reading zod 4.4.3 source semantics: `z.union` validates against each member and returns the first that matches. An input `{item: ['a','b']}` matches the SECOND member, so the parsed output is `{item: ['a','b']}` (the value as-is after the second member's validation, not "absorbed"). Consistent with zod's union semantics. Plan's claim **plausible**.

**Verdict:** ACCEPT the deviation.

**Concern (LOW):** The plan provides no runtime evidence in this artifact; it cites the missing researcher 1 report. Recommend re-running empirical REPL in commit message or as code-fenced block.

---

## 2. Boolean semantic guard challenge (CRITICAL prose bug)

**The plan's Template D (`phase-01-schema-migration.md:88-94`):**
```js
z.union([z.boolean(), z.string()])
 .transform((v) => v === true || v === "true").optional()
```

**Plan claim:** "Locks strict `true`/`false` semantics; rejects `0`/`no`/`yes` passthrough."

**This prose is WRONG.** Code trace:

| Input | Union parses to | Transform returns |
|---|---|---|
| `true` (boolean) | `true` | `true === true \|\| true === "true"` → **`true`** ✓ |
| `"true"` (string) | `"true"` | `"true" === true \|\| "true" === "true"` → **`true`** ✓ |
| `"false"` (string) | `"false"` | `"false" === true \|\| "false" === "true"` → **`false`** ✓ |
| `false` (boolean) | `false` | `false === true \|\| false === "true"` → **`false`** ✓ |
| `"yes"` (string) | `"yes"` | `"yes" === true \|\| "yes" === "true"` → **`false`** ✓ |
| `"1"` (string) | `"1"` | `"1" === true \|\| "1" === "true"` → **`false`** ✓ |
| `1` (number) | REJECTS (not in union) | — |

All 5 acceptance test cases pass. **Code is correct.**

**SEVERITY:** MEDIUM (prose error, not code error). Plan should clarify: "guard returns `false` for `"0"`, `"no"`, `"yes"`, `1` — preserving strict-true semantics" — NOT "rejects."

**Verdict:** REVISE prose.

---

## 3. Phase ordering challenge (ACCEPT)

**Trace the race window between Phase 1 and Phase 2:**

- **Phase 1 lands; Phase 2 not yet:** Mastra factory's `wrapSchema` (lines 128-137) still wraps with `z.preprocess((v) => coerceShape(shape, v ?? {}), zodSchema)`. Inner fields' `z.preprocess(stripEnvelope, ...)` runs first; outer `coerceShape` runs over already-stripped data — no-op. **Race window is functionally safe.**
- **Phase 1 + Phase 2 land; Phase 3 not yet:** The 4 mcp-side wire-format tests import from `../core/wire-format-coercion.js` (deleted). Test suite BREAKS. Phase 3 must be in the SAME commit.

**`unwrapTypeName` (create-loop-tool.js:12-37) compatibility check:**
- `z.coerce.boolean().optional().default(false)` → chain `ZodDefault → ZodOptional → ZodEffects → ZodBoolean`. Unwraps correctly. ✓
- `z.preprocess(stripEnvelope, z.array(z.string())).optional()` → chain `ZodOptional → ZodPreprocess → ZodArray`. Unwraps correctly. ✓
- **No race regression.**

**Verdict:** ACCEPT.

---

## 4. Test migration completeness (REVISE)

**Concerns:**

1. **Co-located test files NOT mentioned:** `tools/learning-loop-mcp/tools/check-runtime-agnostic-tool.test.js`, `runtime-state-read-tool.test.js`, `runtime-state-record-tool.test.js` exist (per `ls`). These do NOT import the wire-format-coercion module (per Researcher 2 §4). Plan should explicitly state these 3 co-located tests are NOT in scope.

2. **Plan 3 followup collision:** `parity-zod-to-json-schema.test.js` → `coerce-correctness.test.js` rename is in Plan 3 Group 11 C-8 but NOT done in current `ls`. Plan addresses this at `phase-03-test-migration-and-acceptance.md:24, 37, 146`. ACCEPT.

3. **Dead `installWireFormatCoercion` import in `wire-format-meta-state-optional-fields.test.js:4`:** Read confirms it imports `installWireFormatCoercion` from `../core/wire-format-coercion.js` BUT the test body (lines 11-59) does NOT use it. It's a dead import. Plan addresses implicitly by renaming the file. **But: the plan does NOT explicitly list this as a `installWireFormatCoercion` user that needs cleaning up. REVISE: add a line to Phase 3 step 1 saying "drop `installWireFormatCoercion` import."**

4. **Test count math discrepancy:** Plan claims 4 mcp-side tests = 5+5+4+5 = 19 test() blocks. Actual: 5+6+5+4 = 20. ACCEPT but flag.

5. **`create-loop-tool.js:139-142` `coerceParams` export callers:** 3 mastra-side test files (per Researcher 2 §6). Plan covers via rename+rewrite + 2 deletes. ACCEPT.

**Verdict:** REVISE — add explicit "drop dead `installWireFormatCoercion` import" to Phase 3 step 1.

---

## 5. `parity-harness.js` deletion (ACCEPT with revision)

**Verification:** File has 3 exports: `schemaJsonParity` (line 91), `toolsListParity` (line 119), `toolsCallParity` (line 166). All require 2 schema/list/call arguments. Post-Plan 3 (legacy deleted), no source for legacy input. YAGNI argument correct.

**Concern:** Plan does NOT verify via grep. Researcher 2 §3 ran `grep -rn "schemaJsonParity\|toolsListParity\|toolsCallParity"` and found no callers. **REVISE: add explicit grep step to Phase 2 step 5; embed (empty) result in PR description.**

**`parity-harness.test.js`:** Confirmed tests the harness exports. Deletable. ACCEPT.

**No dynamic import / fs.readFile:** Plan does not verify. Worth adding grep for `import.*parity-harness` and `readFile.*parity-harness`. Researcher 2 §3 confirms no callers.

**Verdict:** ACCEPT with one revision (grep verification).

---

## 6. Acceptance gate strictness (REVISE)

**Plan acceptance gate (`phase-03-test-migration-and-acceptance.md:161-169`):**
- All 10 test namespaces pass
- Parity gate preserved (sample)
- SP2 grounding on `create-loop-tool.js`
- Net test delta: -4 files; -15 to -11 test() blocks

**Missing verifications:**

1. **JSON Schema parity for ALL 40 tools, not 1 sample.** Plan's Phase 1 Implementation Step 7 says "verify for 1 sample tool." Too weak. **REVISE: add "run `z.toJSONSchema` for ALL 40 tool inputSchemas; diff against pre-migration baseline; assert byte-equal under `target: 'draft-7', io: 'input'`."**

2. **Boolean semantic guards on 5 fields — automated test.** Plan's `coerce-correctness.test.js` example does NOT exercise the 5 guarded boolean fields. **REVISE: add a `boolean-semantic-guards.test.js` that walks the 5 fields and asserts the guard fires for the 7 reject-cases (true, "true", false, "false", "yes", "1", "0").**

3. **SP2 grounding on `create-loop-tool.js`:** Plan covers. ACCEPT.

4. **Phase 1 → Phase 2 → Phase 3 in 1 PR:** Plan covers. ACCEPT.

5. **No JSON Schema divergence test for `.passthrough()` and `.strict()`:** Two tools (`trigger-workflow-tool.js:11`, `workflow-generate-prompt-tool.js:89`) use `z.object({}).passthrough()`. After Phase 1, unchanged. But if migration mistakenly touches them, `.passthrough()` semantics might interact with `z.preprocess`. **REVISE: add Phase 1 step "verify all `z.passthrough` and `z.strict` schemas are unchanged."**

**Verdict:** REVISE — strengthen acceptance gate to cover all 40 tools AND add boolean-semantic-guards regression test.

---

## 7. Missing risks (HIGH/MEDIUM)

### 7a. `meta_state_list.id` is a NESTED union: `z.union([z.string(), z.array(z.string())]).optional()` (meta-state-list-tool.js:66)

**CRITICAL BUG.** Trace the migrated field `z.preprocess(stripEnvelope, z.union([z.string(), z.array(z.string())]))`:
- Input `undefined` (optional field not set): `isEnvelope(undefined)` returns `false` (short-circuit on `v &&`); preprocess returns `undefined`. Inner union FAILS on `undefined`. The original `.optional()` would have skipped validation. **HANDLER BUG.**

**Fix:** Either (a) wrap the whole thing in `.optional()`: `z.preprocess(stripEnvelope, z.union([z.string(), z.array(z.string())]).optional())`, OR (b) make `stripEnvelope` undefined-safe: `stripEnvelope = (v) => v === undefined ? undefined : (isEnvelope(v) ? v.item : v)`.

**REVISE: Phase 1 must handle the optional-after-preprocess interaction. Recommend approach (b) — single point of fix in `envelope-stripper.js`.**

### 7b. `loop_get_instruction.key` is a TRIPLY-NESTED union (loop-get-instruction-tool.js:41-45)

This is **NOT envelope-bearing**. It arrives as plain string/number/array, never `{item: ...}`. Plan does NOT list it for migration — correct. But plan should explicitly state "non-envelope union fields are NOT wrapped; only fields that may arrive as `{item: X}` per wire-format probe are migrated."

**REVISE: add Phase 1 note clarifying non-envelope unions are left untouched.**

### 7c. `meta_state_patch.patch` is a DISCRIMINATED union (meta-state-patch-tool.js:32)

`patch: z.union(PATCH_KINDS.map((k) => buildPatchSchemaFor(k)))` — output of a programmatic builder. Plan does NOT list for migration. **Correct decision** (per legacy `unwrapItem` it only runs on Array/Object typeNames; `patch` is a discriminated union and never arrives as `{item: ...}` because the MCP SDK wraps array-shaped fields but not discriminated unions). But plan should document the decision.

**REVISE: clarify in Phase 1 that `meta_state_patch.patch` is NOT envelope-bearing (discriminated union; MCP SDK doesn't wrap these).**

### 7d. `meta_state_batch.entry` (meta-state-batch-tool.js:11)

Plan says OUT OF SCOPE at `phase-01-schema-migration.md:139` with reasoning "nested object validated by Zod" — **wrong reasoning**. The `entry` field is `z.record(z.string(), z.unknown())` and IS a top-level field that may be enveloped. The reasoning "nested object validated by Zod" is irrelevant to envelope stripping.

**REVISE: explicitly list `meta_state_batch.entry` as candidate for envelope stripping; document decision either way.**

### 7e. `.passthrough()` interaction (trigger-workflow-tool.js:11, workflow-generate-prompt-tool.js:89)

Two tools use `z.object({}).passthrough()`. The legacy `coerceShape` visits fields by `Object.entries(args)` and looks up the field schema. For passthrough fields, the schema is `z.object({}).passthrough()`. The `unwrapItem` would run on the value. After Phase 1 with NO migration, the handler receives `{context: {item: {foo: 'bar'}}}` for `{context: {foo: 'bar'}}` — broken.

**REVISE: trace the wire-format quirk for `.passthrough()` fields and decide. Likely: yes, wrap with `z.preprocess(stripEnvelope, z.object({}).passthrough())` if the field may be enveloped.**

### 7f. MCP SDK internals (`@mastra/mcp` 1.10.0, `@mastra/core/tools` 1.42.0)

`createTool({inputSchema})` accepts `ZodTypeAny`. `z.preprocess(stripEnvelope, ...)` returns `ZodEffects` — valid `ZodTypeAny`. No regression expected. ACCEPT.

### 7g. `z.preprocess` identity preservation gone

Legacy `coerceParams` returns the ORIGINAL args reference when no coercion happens (`create-loop-tool.js:125`). New `z.preprocess` always constructs a new object via `parse`. **Behavior change for tools that compare argument identity.** None of 40 tools appear to do this, but worth noting.

**REVISE: add Phase 1 risk note "post-migration, handler args are always new objects (no `===` reference preservation); verify no tool relies on identity."**

---

## 8. Operator decision marker audit

### Decision 1 — `z.preprocess` vs `z.union`: ACCEPT.
### Decision 2 — Boolean semantic guards: ACCEPT but add evidence grep for `"yes"`/`"no"`/`"1"`/`"0"` usage in codebase.
### Decision 3 — Skip `evidence_missing`: ACCEPT. Current schema is `z.boolean()` (strict); SKIP = no contract change.
### Decision 4 — `parity-harness.js` deletion: ACCEPT. YAGNI wins.
### Decision 5 — Keep 1 stdio smoke test: ACCEPT.

**Overall:** All 5 markers well-reasoned. Decision 2 has a contract-divergence concern worth flagging.

---

## 9. Effort estimate sanity check (REVISE)

**Phase 1 cost breakdown:**
- 13 boolean fields × ~2 min = 26 min
- 10 number fields × ~1 min = 10 min
- 17 envelope-bearing array fields × ~3 min = 51 min
- 3 envelope-bearing object fields × ~5 min = 15 min
- Create `envelope-stripper.js` = 5 min
- Run tests + iterate = 30 min
- Field-inventory verification = 30 min
- 5 boolean semantic-guard fields = 15 min
- **Total Phase 1: ~3h.** Plan's 2-3h is on the low end. **REVISE: bump to 3-4h.**

**Phase 2:** 30 min is generous. ACCEPT.
**Phase 3:** 4 mcp-side renames + rewrites (~5 min each = 20 min) + 4 mastra-side deletes (5 min) + 1 parity-rename-rewrite (~15 min) + 1 stdio smoke gate (~20 min) + 10-namespace pnpm test runs (~5 min × 2-3 iterations) = ~75 min minimum + debugging. Plan's 2-3h is realistic.

**Concern:** Phase 1 effort is tight. **Recommend bumping to 3-4h.** Total plan: 6-8h.

**Verdict:** REVISE Phase 1 estimate to 3-4h. Total plan: 6-8h.

---

## 10. Phase file size — Phase 3 is 207 lines (REVISE)

Phase 3 over 200 lines by 7 lines. **Trims possible:**
- Lines 50-93: code example for `zod-coerce-boolean-string.test.js` + `zod-union-envelope.test.js` — condense to 10 lines.
- Lines 95-127: `coerce-correctness.test.js` example — condense to 5 lines (just imports + first test).

**Verdict:** REVISE — trim 2 example code blocks to 5-line stubs.

---

## Summary of CRITICAL/HIGH findings

| # | Severity | Title | Action |
|---|---|---|---|
| 2 | MEDIUM | Template D prose "rejects" is wrong (returns false, doesn't error) | REVISE prose |
| 4 | HIGH | Dead `installWireFormatCoercion` import not in cleanup checklist | REVISE Phase 3 step 1 |
| 6 | MEDIUM | Parity gate verifies 1 sample, not all 40 tools | REVISE — add all-40 gate |
| 6 | MEDIUM | No automated test for 5 boolean semantic guards | REVISE — add `boolean-semantic-guards.test.js` |
| 7a | HIGH | `meta_state_list.id` (nested union) + preprocess + optional bug | REVISE — make `stripEnvelope` undefined-safe |
| 7b | LOW | Non-envelope unions (e.g., `loop_get_instruction.key`) need explicit exclusion note | REVISE — add Phase 1 note |
| 7c | MEDIUM | `meta_state_patch.patch` (discriminated union) wire-format consideration undocumented | REVISE — document decision |
| 7d | MEDIUM | `meta_state_batch.entry` plan says "OUT OF SCOPE" with wrong reasoning | REVISE — clarify decision |
| 7e | MEDIUM | `.passthrough()` fields may be enveloped; not addressed | REVISE — trace and decide |
| 7g | LOW | Identity preservation gone post-migration | REVISE — add risk note |
| 8.2 | MEDIUM | Boolean guard contract change (unknown → false vs legacy passthrough) | REVISE — add evidence grep |
| 9 | LOW | Phase 1 effort under-estimated | REVISE — bump to 3-4h |
| 10 | LOW | Phase 3 over 200 lines | REVISE — trim examples |

---

## Concrete revision proposal (for the planner)

### Phase 1 (`phase-01-schema-migration.md`):

1. **Add to `envelope-stripper.js` template (line 64):**
   ```js
   export const stripEnvelope = (v) => {
     if (v === undefined) return undefined;  // optional-after-preprocess
     return isEnvelope(v) ? v.item : v;
   };
   ```

2. **Add to Implementation Steps (after step 7):** "Run `z.toJSONSchema` for ALL 40 tool inputSchemas; diff against pre-migration baseline; assert byte-equal under `target: 'draft-7', io: 'input'`."

3. **Add to Implementation Steps:** "Verify all `z.passthrough` and `z.strict` schemas are unchanged."

4. **Add to Implementation Steps:** "Trace wire-format envelope behavior for `.passthrough()` fields (`trigger-workflow-tool.js:11`, `workflow-generate-prompt-tool.js:89`); wrap with `z.preprocess(stripEnvelope, z.object({}).passthrough())` if enveloped."

5. **Add explicit non-envelope union note:** "Non-envelope union fields (e.g., `loop_get_instruction.key`, `meta_state_patch.patch`) are NOT wrapped; only fields that may arrive as `{item: X}` per wire-format probe are migrated."

6. **Add `meta_state_batch.entry` decision:** Document whether to wrap with preprocess or skip.

7. **Add to Risks:** "Identity preservation: post-migration, handlers receive new objects (no `===` reference preservation). Verify no tool relies on identity."

8. **Add evidence grep step:** "Run `grep -rn "\"yes\"\|\"no\"\|\"1\"\|\"0\"" tools/learning-loop-mcp/tools/` to confirm no agent sends these as boolean wire values."

9. **Bump effort from 2-3h to 3-4h.**

### Phase 2 (`phase-02-coerce-layer-deletion.md`):

10. **Add to Implementation Steps step 5:** "Run `grep -rn "schemaJsonParity\|toolsListParity\|toolsCallParity\|from.*parity-harness\|readFile.*parity-harness" tools/ .claude/` and embed the (empty) result in the PR description."

### Phase 3 (`phase-03-test-migration-and-acceptance.md`):

11. **Add to Implementation Steps step 1:** "Drop the unused `installWireFormatCoercion` import in `wire-format-meta-state-optional-fields.test.js:4` (dead-code import)."

12. **Add to Architecture section:** "New test: `boolean-semantic-guards.test.js` — exercises the 5 guarded fields with inputs `true`, `"true"`, `false`, `"false"`, `"yes"`, `"1"`, `"0"`, `1`; asserts guard returns correct boolean per strict-true contract."

13. **Trim code examples to 5-line stubs to fit 200-line target.**

14. **Add explicit "non-migrated co-located tests" note:** "`tools/learning-loop-mcp/tools/{check-runtime-agnostic-tool,runtime-state-read-tool,runtime-state-record-tool}.test.js` are co-located and NOT in scope (do not import coerce layer per Researcher 2 §4)."

### Plan (`plan.md`):

15. **Update Decision 2 prose:** "Locks strict `true`/`false` semantics; non-`"true"` strings return `false` (not passthrough, not error)."

16. **Update risk table:** add 7a optional-after-preprocess risk + 7g identity-preservation risk.

### Documentation followup:

17. **Add operator-guide note (post-merge):** "Post-migration, the boolean contract for 5 HIGH/CRITICAL fields is `true | "true" → true`; everything else (including `"false"`, `"0"`, `"yes"`, `1`) returns `false`. Other boolean fields accept the full `z.coerce.boolean()` semantic widening."

---

## Unresolved questions

1. The required `plans/reports/research-260618-0031-zod-impact-analysis.md` (Researcher 1) does NOT exist in the repo. The plan cites it 4+ times. Is the file expected to be re-created, or is the empirical evidence supposed to be re-run from scratch?
2. Researcher 1's claim that `z.union` does NOT strip envelopes was not independently verifiable in this review (bash blocked). The reasoning from zod 4 semantics supports the claim, but empirical evidence would close the gap.
3. The 7a optional-after-preprocess bug is a real regression risk that needs operator confirmation of the fix approach (modify `stripEnvelope` to be undefined-safe vs wrap each field with `.optional()` after preprocess). Recommend the stripEnvelope fix (single point of change).
4. The 7e `.passthrough()` interaction needs a wire-format probe to determine if these fields are actually enveloped in practice.

---

**Status:** DONE_WITH_CONCERNS
**Summary:** Plan is technically sound; the `z.preprocess` deviation from brainstorm's `z.union` recommendation is well-reasoned and consistent with zod 4 semantics. The boolean semantic guards are correct in code but the prose is wrong about "rejection" (it returns `false`, not error). The 1-PR atomicity is correct. The biggest risks are: (1) the optional-after-preprocess bug for `meta_state_list.id` (HIGH), (2) the missed `.passthrough()` and `meta_state_batch.entry` wire-format cases (MEDIUM), (3) the too-shallow parity gate (1 sample, not all 40 tools).
**Concerns/Blockers:** 1 CRITICAL prose bug in Template D description; 1 HIGH bug from missing optional-after-preprocess handling; 2 MEDIUM missed wire-format cases (passthrough, meta_state_batch.entry); 1 MEDIUM shallow acceptance gate. None block implementation if revisions are applied before Phase 1 begins. No CRITICAL blockers.