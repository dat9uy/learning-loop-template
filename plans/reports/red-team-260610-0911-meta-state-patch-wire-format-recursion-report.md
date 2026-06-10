---
title: "Red-team review: plans/260610-meta-state-patch-wire-format-recursion/"
date: "2026-06-10T02:15:00Z"
tags: [red-team, meta, mcp-tools, wire-format, recursion, tdd]
status: review-required
plan: plans/260610-meta-state-patch-wire-format-recursion/
reviewer: ck:plan red-team
verdict: BLOCKED — 2 critical bugs + 5 high-severity issues; do not cook yet
---

# Red-team: meta_state_patch wire-format recursion hot fix + Bridge 5 deferral

## TL;DR

**Verdict: BLOCKED.** The plan's framing, scope split, and Bridge 5 deferral are sound. The implementation helper is well-designed. But **2 critical bugs and 5 high-severity issues** must be resolved before `/ck:cook` is safe. None are scope-expansive — all are 1–3 line fixes in the plan files themselves.

**Critical bugs (showstoppers):**
1. **Test file extension mismatch (`.cjs` vs `pnpm test` glob).** The plan creates `__tests__/wire-format-patch-recursion.test.cjs` but the `pnpm test` script globs `*.test.js` only (verified: `cat package.json | grep test` shows `node --test ... *.test.js` paths). The 3 new tests **will not run** with `pnpm test`. The plan's acceptance criterion "3 new tests pass" is unreachable. The precedent `wire-format-coercion-fix.test.js` is `.js` for exactly this reason. Phase 1 will succeed by `pnpm test` exiting 0 with the new file undetected.
2. **Test 1 patches a finding with the `addresses` field, but findings don't have `addresses`.** `addresses` is on the `metaStateLoopDesignSchema` (line 169 of `core/meta-state.js`), not on `metaStateFindingEntrySchema`. The patch is `z.object({}).passthrough()` (line 28 of `meta-state-patch-tool.js`), so the field will be stored — but the `coerceParamsToSchema` path will **skip** it because `shape[key]` is undefined for unknown fields (line 58 of `tool-registry.js`: `if (!fieldSchema) continue;`). The bug will not reproduce via Test 1's setup. Test 1 will pass for the wrong reason or fail confusingly.

**High-severity issues (fix before cook):**
3. **MAX_RECURSION_DEPTH 2→3 conflates with unwrap iterations.** The plan claims the bump is "a safety margin for the deeper {item: {item: {item: ...}}} shape." But that shape is the unwrap's concern (3-iter bound), not the recursion's (which walks nested ZodObject values, not {item: X} chains). The two bounds are orthogonal. The 2→3 bump is unjustified in the plan text and is a separate behavioral change. Either justify the bump independently or drop it.
4. **ZodObject recursion in the existing code uses `value`, not `coerced[key]`.** The plan's wire-in block calls `unwrapItemWrap(coerced[key], typeName)` after `coerceValue` and **before** the ZodObject recursion block. The recursion block then reads `value` (the original args value, line 81 of `tool-registry.js`), not `coerced[key]`. So if `coerceValue` produces a new value, OR if `unwrapItemWrap` produces a new value, the recursion operates on the pre-coercion, pre-unwrap data. The unwrap and the recursion are decoupled. Test for the integrated case is missing.
5. **"Documented data-integrity fix pattern" is not documented.** Phase 3 Step 2 fallback says "if `meta_state_propose_design` fails... use the documented data-integrity fix pattern (not the `meta-260606T2102Z` anti-pattern)." The only documented pattern in the codebase for the same situation is the one used for entry #510: "Filed the design + finding via direct writeEntry because meta_state_propose_design has the same wire-format bug." That *is* the meta-260606T2102Z-class action, and the entry's reason text explicitly justifies it as "the documented data-integrity fix pattern (operator-approved), not the meta-260606T2102Z anti-pattern." This is the same tautology. The plan cannot claim a non-existent distinction. Either define the distinction or document that the fallback *will* re-trigger the anti-pattern signal and require a follow-up `meta_state_log_change` to reclassify.
6. **`evidence_code_ref` on finding #509 is wrong; the plan silently corrects the file path but not the registry.** The plan's Step 1 change-log has `change_target: "tools/learning-loop-mcp/tool-registry.js#coerceParamsToSchema"` (correct). The earlier change-log #510 has `change_target: "tools/learning-loop-mcp/core/gate-logic.js#coerceParamsToSchema"` (wrong — `coerceParamsToSchema` is in `tool-registry.js`, not `core/gate-logic.js`). The plan does not address the stale change-log. Worse, finding #509's `evidence_code_ref: "tools/learning-loop-mcp/tools/meta-state-patch-tool.js#handler"` is also stale relative to the actual fix. The fingerprint in Step 4 will be computed against the patch tool's handler, but the fix is in `coerceParamsToSchema`. `meta_state_check_grounding` will then return `drifted` because the fingerprint is against the wrong file. The plan's Step 5 mitigation ("re-run Step 4") will not help — the wrong file is being hashed.
7. **Step 7 "recursive proof" patch has all scalars, not arrays.** The plan's Step 7 patches `loop-design-meta-state-patch-wire-format-recursion` with `{ status: "inactive", shipped_in_plan: "plans/...", shipped_at: "..." }` — all 3 fields are strings. The "recursive proof" claim is weak: it uses the very tool the design motivated, but it does not exercise the fix the design motivated. A real recursive proof would patch with a combined array + scalars, then assert the registry has a flat array. The current Step 7 is a smoke test, not a proof.

**Medium-severity issues (recommend fix, not blocking):**
8. **Test framework extension (.cjs vs .js) inconsistency not addressed.** The new test file is `.cjs` (mirroring `cold-session-discoverability.test.cjs`), but `cold-session-discoverability` is excluded from the `pnpm test` glob (intentional — see #1). The 19 assertions in the cold-session file are **not counted in the 898 baseline**; the journal explicitly says "New `.cjs` test file adds 19 assertions (not counted in pnpm test glob)." The plan's claim of "3 new tests pass" is therefore an integration assumption, not a `pnpm test` claim — but the plan's Phase 1 step 5 says "Run `pnpm test`. Confirm 3 new tests fail." This is impossible. Pick a runner and commit.
9. **Step 2 fallback re-triggers the meta-260606T2102Z anti-pattern signal.** The plan acknowledges this but says "if the fallback is needed, file a `meta_state_log_change` IMMEDIATELY after." This is 2 mutations for what should be 1. The signal will fire. The mitigation in the plan is reactive, not preventive. Better: pre-test the loop-design entry shape (e.g., dry-run a writeEntry with empty `proposed_design_for=[]` and `addresses=[]` to confirm the array is preserved) and document the path.
10. **Test 1's setup uses `addresses` (a loop-design field) on a finding entry — semantic mismatch.** Even ignoring the schema-skip bug (#2), patching a finding with `addresses: ["finding-A", "finding-B", "finding-C"]` is semantically odd. The test should patch a **loop-design** (which has `addresses` in its schema) or use a finding field that's actually an array. Looking at the finding schema, **no field is an array** — all fields are scalars or enums. So Test 1 cannot exercise the array-wrap bug against a finding at all. The proper fix is to patch a loop-design entry with `addresses` + `proposed_design_for` scalars, OR to use Test 3's pattern (propose_design) for the stdio test.
11. **Test 2 identity check is fragile.** Test 2 asserts "result is NOT === args (didCoerce = true)." After the fix, `coerceValue` returns undefined for `{item: {item: [...]}}` (not a string), then `unwrapItemWrap` unwraps to depth 2 and returns `{ value: ["x", "y"], unwrapped: 2 }`. `coerced[key] = ["x", "y"]`. `didCoerce = true`. Returns `coerced`. So `result !== args`. Good. But the assertion is brittle: if a future refactor adds a coercion that mutates `args` in-place, the test breaks for the wrong reason. Prefer asserting on value shape, not identity.
12. **Cold-session test impact under-analyzed.** The plan says "the change-log mutation does not affect tool availability." True, but the plan does not address: (a) the 7 mutations in sequence spawn 7 stdio MCP server processes in some test environments, (b) the registry file size growth (898 entries → 905 entries), (c) the `index_extract` invalidation. None are blockers but the success criterion "Cold-session test passes" is asserted without analysis.

**YAGNI / KISS violations:**
13. **`MAX_UNWRAP_ITERATIONS` as a separate constant is YAGNI.** The constant is used in 1 place. Inline `3` would be just as readable. The plan's "1 helper + 1 constant + 1 wire-in line" line item becomes "1 helper + 1 magic number + 1 wire-in block." The constant adds zero value at this point. Drop it.
14. **`applies_to.tools` in Step 1 change-log lists `registerTool`.** `registerTool` is an internal API, not a meta-state tool. The list should be only meta-state tools that benefit from the fix: `meta_state_patch`, `meta_state_propose_design`, `meta_state_report`. The 260608-1015 precedent has the same over-listing; not a regression, but the plan should be tighter.
15. **Step 1 change-log `applies_to.schemas` lists `["tools/learning-loop-mcp/tool-registry.js"]`.** Schemas are the file path, not a list of files. The precedent change-log #510 has `schemas: ["tools/learning-loop-mcp/core/gate-logic.js", "tools/learning-loop-mcp/tools/meta-state-patch-tool.js"]` — a list of file paths. The plan's value matches the precedent in shape but is a single file (correct). Just flagging the field is being used as "files changed" not "schemas affected" — semantic drift, not a bug.

**Contradictions / drift:**
16. **Plan says `core/gate-logic.js` is UNCHANGED; existing change-log #510 says it was the fix site.** This is the drift in #6. The plan's claim is correct (per `cat tools/learning-loop-mcp/tool-registry.js | grep coerceParamsToSchema` — confirmed in `tool-registry.js`). The drift is in the registry, not the code. The plan should add a Step 1.5: "Acknowledge that change-log #510 has the wrong `change_target`; either (a) supersede #510 with a new change-log, or (b) leave as a known stale and document in the closeout journal."
17. **The plan's "1 helper + 1 depth bump" framing conflates two changes.** The unwrap is the new behavior; the depth bump is an unrelated change. The plan should separate them in the success criteria: "1 helper added; 1 depth bump" should be "1 helper added (new behavior); 1 depth bump (orthogonal safety margin, justify or drop)."

**Unanswered questions (require operator judgment):**
18. **The "data-integrity fix pattern" is a category error.** Either the fallback is OK (in which case meta-260606T2102Z is not an anti-pattern), or it is not (in which case the previous entry #510 was an anti-pattern). The plan needs operator ruling: "Is direct registry write for Bridge 5 deferral acceptable, or must it go through the canonical tool?" The "documented" claim is not grounded.
19. **Why not `.js` for the new test file?** The precedent `wire-format-coercion-fix.test.js` is `.js`. The cold-session test is `.cjs` and is excluded from `pnpm test`. The new test file should be `.js` to be picked up by `pnpm test` (and to match the original wire-format-fix precedent). If the `.cjs` extension is for stdio-spawn reasons, that's a different problem (Node's ESM/CJS interop).
20. **The plan's `addresses` test field choice on a finding — was it copied from a precedent or invented?** The plan references `meta-state-patch-tool.test.js` (in-process pattern) and `cold-session-discoverability.test.cjs` (stdio pattern), but no precedent for patching a finding with `addresses`. Likely a copy-paste from the unit test (Test 2) that uses `addresses` on a mock ZodArray schema — which IS correct, because the mock schema is hand-rolled, not the real meta-state finding schema. The cross-file copy lost the schema context. Test 1 needs to be regrounded.

## Findings, in detail

### CRITICAL 1: `.cjs` test file will not run with `pnpm test`

**Plan reference:** Phase 1 Architecture, "Test file location: `tools/learning-loop-mcp/__tests__/wire-format-patch-recursion.test.cjs`"

**Verified by:**
- `package.json` test script: `node --test 'tools/learning-loop-mcp/__tests__/*.test.js' ...` (no `*.test.cjs` paths)
- `pnpm test` baseline output: `tests 898, pass 898, fail 0` (the cold-session test's 6 tests are NOT counted)
- Journal 260609-adopt-instruction-layer-closeout: "New `.cjs` test file adds 19 assertions (not counted in pnpm test glob). All baseline 898 tests preserved."

**Why it matters:** Phase 1's success criteria includes "Test 1 fails" and "Test 2 fails" and "Test 3 fails." The plan's Step 5 says "Run `pnpm test`. Confirm 3 new tests fail with the expected symptoms." With a `.cjs` file, `pnpm test` will not see the 3 new tests, exit 0, and Phase 1 will be considered "red phase complete" vacuously.

**Fix:** rename to `wire-format-patch-recursion.test.js`. The file uses CommonJS-style test functions per `wire-format-coercion-fix.test.js`; the `.test.js` glob picks it up. ESM imports will still work because Node `--test` supports both. (Verify by running `node --test tools/learning-loop-mcp/__tests__/wire-format-coercion-fix.test.js` — works because the file uses `import` statements with `.test.js` extension; the runner's behavior is the same.)

### CRITICAL 2: Test 1 patches a finding with `addresses`; finding has no `addresses` field

**Plan reference:** Phase 1 Architecture, Test 1 setup "Call meta_state_patch with patch: { evidence_journal: ..., addresses: [...] }"

**Verified by:**
- `core/meta-state.js` line 169: `addresses: z.array(z.string()).default([])` is in `metaStateLoopDesignSchema`, not `metaStateFindingEntrySchema`.
- `core/meta-state.js` `metaStateFindingEntrySchema` (lines 18–...): no `addresses` field, no other array fields.
- `tool-registry.js` line 58: `if (!fieldSchema) continue;` — unknown fields are skipped, not coerced.
- `meta-state-patch-tool.js` line 28: `patch: z.object({}).passthrough()` — unknown fields are stored, not rejected.

**Why it matters:** the bug is in `coerceParamsToSchema`, which only runs for fields in the schema's `shape`. With `addresses` absent from the finding schema, the `shape[key]` lookup fails, the loop `continue`s, and the bug is never exercised. The test's assertion ("registry shows addresses: [...] (flat array)") will pass because the **passthrough** stores the array as-is, no `{item: ...}` wrap applied. The test passes for the wrong reason — the bug is invisible to it.

**Fix options:**
- A. Patch a **loop-design** entry (has `addresses` and `proposed_design_for` in schema) with `addresses: [...]` + a scalar like `severity_hint: "low"`. This is the real-world reproduction.
- B. Add `addresses` to the finding schema. Out of scope (not the bug we're fixing).
- C. Drop Test 1 and rely on Test 2 (unit test on `coerceParamsToSchema`) and Test 3 (stdio propose_design). The unit test exercises the helper directly; the propose_design test exercises the wire-format path. Test 1 is redundant.

**Recommendation:** A. The real bug is the combined-patch stdio case, and only a loop-design patch exercises it.

### HIGH 3: MAX_RECURSION_DEPTH 2→3 conflates with unwrap iterations

**Plan reference:** Phase 2 Architecture, "Bump existing constant: `const MAX_RECURSION_DEPTH = 3;  // was 2`"; Risk Assessment "Why depth 3: the observed nesting is `{item: {item: [a, b, c]}}` (depth 2) for the symptom; 3 is a safety margin for the deeper `{item: {item: {item: ...}}}` shape observed over 12 retries."

**Verified by:** reading `tool-registry.js` line 4 (`const MAX_RECURSION_DEPTH = 2;`) and lines 78–88 (the ZodObject recursion block uses `depth < MAX_RECURSION_DEPTH` to bound recursion into nested ZodObject **values**, not `{item: X}` chains).

**Why it matters:** the two bounds are orthogonal:
- `MAX_RECURSION_DEPTH` bounds recursion into nested `ZodObject` values (e.g., `metadata: { foo: { bar: { ... } } }` recurses 2 levels deep).
- `MAX_UNWRAP_ITERATIONS` bounds the `{item: X}` chain unwrap (3 iterations).

The 2→3 bump is justified only if (a) the existing recursion depth-2 bound is hit in production for nested ZodObject values, OR (b) future schema nesting will exceed 2 levels. Neither is asserted. The plan's justification ("3 is a safety margin for the deeper `{item: ...}` shape") is the unwrap's concern.

**Fix options:**
- A. Justify the bump independently. Cite a real workload that hits depth 2 currently.
- B. Drop the bump. Keep `MAX_RECURSION_DEPTH = 2`. The unwrap is the primary fix; the depth bump is a separate, unjustified change.
- C. Move the bump to a follow-up "deep nesting safety margin" plan. Defer it.

**Recommendation:** B. YAGNI. The unwrap handles the documented symptom; the recursion depth is unrelated.

### HIGH 4: ZodObject recursion uses `value`, not `coerced[key]`

**Plan reference:** Phase 2 Architecture, "Wire into `coerceParamsToSchema` (after the existing `coerceValue` call, BEFORE the `ZodObject` recursion block)."

**Verified by:** reading `tool-registry.js` lines 78–88:
```js
if (
  depth < MAX_RECURSION_DEPTH &&
  typeName === "ZodObject" &&
  value && typeof value === "object" && !Array.isArray(value)  // <-- uses `value`, not `coerced[key]`
) {
  const nested = coerceParamsToSchema(value, fieldSchema, root, depth + 1);
  if (nested !== value) {
    coerced[key] = nested;
    didCoerce = true;
  }
}
```

**Why it matters:** the plan's wire-in block updates `coerced[key]` to the unwrapped value, but the recursion block then reads `value` (the pre-coercion, pre-unwrap original). So if `coerceValue` produced a new value (e.g., `JSON.parse` of a string to a parsed object), the recursion operates on the **string**, not the parsed object. Same for `unwrapItemWrap`. The recursion is decoupled from both the coercion and the unwrap.

This is a pre-existing bug, not a new one — but the plan claims to be a hot fix and inherits the issue. The current plan's Test 2 (unit test on `coerceParamsToSchema`) does not exercise the combined case (coerce-then-unwrap-then-recurse). Test 3 (propose_design stdio) may exercise it incidentally if `description` is a ZodObject that contains an array field — but `description` is `z.string().min(20)`, not an object. So the combined case is untested.

**Fix options:**
- A. Change the recursion block to use `coerced[key]` instead of `value`. This is a 1-line change. Risk: subtle behavior change for tests that rely on the pre-existing behavior.
- B. Document the decoupling as a known limitation. The Bridge 5 entry already says "passthrough goes away" — the fix is in Bridge 5, not here.
- C. Add a Test 4 that exercises the combined case (nested ZodObject with an array field wrapped in `{item: ...}`).

**Recommendation:** B + C. The fix is in Bridge 5 (where `passthrough` is replaced with schema-derived schemas). Document the limitation; add a test for the limitation.

### HIGH 5: "Documented data-integrity fix pattern" is not documented

**Plan reference:** Phase 3 Step 2, "Fallback: if meta_state_propose_design fails (wire-format bug on the empty array fields), use the documented data-integrity fix pattern (not the meta-260606T2102Z anti-pattern)."

**Verified by:** `meta-state.jsonl` line 510 reason field: "Filed the design + finding via direct writeEntry because meta_state_propose_design has the same wire-format bug... This is the documented data-integrity fix pattern (operator-approved), not the meta-260606T2102Z anti-pattern." Same tautology. The pattern is the anti-pattern; the entry just calls itself not-the-anti-pattern.

**Why it matters:** the plan cannot claim a distinction that does not exist in the codebase. If the fallback is needed, the registry will gain a second entry that uses `writeEntry` (a direct file write). The `meta-260606T2102Z-agent-used-direct-file-i-o-...` finding monitors this signal and will (correctly) re-fire. The plan's mitigation ("file a `meta_state_log_change` IMMEDIATELY after") is reactive and adds 1 more registry line.

**Fix options:**
- A. Operator ruling: "Is direct registry write for Bridge 5 deferral acceptable, or must it go through the canonical tool?" — get a yes/no from the operator before the plan ships.
- B. Pre-validate the empty-array case. Add a Test 3.5 that calls `meta_state_propose_design` with `proposed_design_for: []` and `addresses: []` and confirms the registry has a flat empty array, not a wrapped one. If it fails, use a different proposal shape (e.g., omit the empty arrays, since `propose_design` may have defaults).
- C. Drop the loop-design-with-empty-arrays deferral. Use a regular `meta_state_log_change` (which doesn't have the `proposed_design_for` + `addresses` array fields) to record the deferral.

**Recommendation:** A + B. Get operator ruling + pre-validate the proposed shape.

### HIGH 6: `evidence_code_ref` on finding #509 is stale relative to the fix

**Plan reference:** Phase 3 Step 4 (refresh_fingerprint) and Step 5 (check_grounding) assume the fingerprint will be computed against the fix site.

**Verified by:**
- `meta-state.jsonl` line 509 (finding #509): `evidence_code_ref: "tools/learning-loop-mcp/tools/meta-state-patch-tool.js#handler"` — points to the **patch tool's handler**, not the fix site.
- Actual fix site: `tools/learning-loop-mcp/tool-registry.js#coerceParamsToSchema`.
- `meta_state_check_grounding` (per MCP tool description): "computes its SHA-256 fingerprint and comparing to the stored value." The fingerprint is computed against the file at `evidence_code_ref` (per the `evidence_code_ref: "path/to/file.js:line"` pattern in the schema).
- The fix is in a **different file** from `evidence_code_ref`.

**Why it matters:** Step 4's `meta_state_refresh_fingerprint` will compute the hash of `meta-state-patch-tool.js#handler`. But the fix is in `tool-registry.js#coerceParamsToSchema`. Step 5's `meta_state_check_grounding` will compare the stored fingerprint (computed against the patch tool's handler, possibly hashed during initial finding report) against the current state of the same file. The patch tool's handler file may or may not have changed in Phase 2 (the plan says it doesn't change, which is correct). So the fingerprint will be "fresh" by coincidence, not by correctness. The `evidence_code_ref` is the wrong file. The `code_fingerprint` stored will track the wrong file forever.

**Fix options:**
- A. Update finding #509's `evidence_code_ref` via `meta_state_patch` before Step 4. The patch would be: `evidence_code_ref: "tools/learning-loop-mcp/tool-registry.js#coerceParamsToSchema"`. But `evidence_code_ref` is not in the IMMUTABLE_PATCH_FIELDS deny-list (lines 6–19 of `meta-state-patch-tool.js`), so this is allowed.
- B. Use `meta_state_refresh_fingerprint` after updating `evidence_code_ref`. The tool reads the new ref, computes a fresh hash, stores it.
- C. Add a `meta_state_log_change` noting the `evidence_code_ref` correction (audit trail).

**Recommendation:** A + B + C. The `evidence_code_ref` is a contract — if the fix is in `tool-registry.js`, the ref should point there. Document the correction.

### HIGH 7: Step 7 "recursive proof" is a smoke test, not a proof

**Plan reference:** Phase 3 Step 7, "This is the recursive proof: the design that motivated the fix is now closed out via the very tool the design motivated."

**Verified by:** the patch payload is `{ status: "inactive", shipped_in_plan: "plans/...", shipped_at: "..." }` — all strings, no arrays. The "recursive proof" claim requires exercising the bug fix (combined array + scalars). The current Step 7 only exercises the round-trip path with scalars, which always worked.

**Why it matters:** the "recursive proof" is the plan's strongest narrative anchor. If the proof is weak, the plan's framing weakens. The proof should be: patch `loop-design-meta-state-patch-wire-format-recursion` with `addresses: []` + `shipped_in_plan: "..."` + `shipped_at: "..."` (combined array + scalars) and assert the registry has `addresses: []` (flat empty array, not wrapped). The empty array exercises the unwrap path because `{item: []}` is the natural edge case.

**Fix options:**
- A. Change Step 7 payload to include `addresses: []` (or `proposed_design_for: []`) alongside the strings. This is the real recursive proof.
- B. Drop the "recursive proof" framing. Replace with "closeout via the same tool surface, exercising the scalar-only path." (Honest but less satisfying.)
- C. Add a Step 7.5: a separate assertion call that uses the combined array + scalars pattern, mirroring the Test 1 setup (after fixing #2).

**Recommendation:** A. The empty array exercises the unwrap without adding a real new entry to the registry.

### MEDIUM 8: `.cjs` vs `.js` test framework inconsistency

**Plan reference:** Phase 1 Related Code Files, the new test file extension.

**Verified by:** existing test files include both `.test.js` and `.test.cjs`. The `.cjs` files (cold-session) are not in the test glob. The `.js` files (all others) are.

**Fix:** rename to `.test.js` (see Critical 1). This is the same fix.

### MEDIUM 9: Step 2 fallback re-triggers the meta-260606T2102Z signal

**Plan reference:** Phase 3 Risk Assessment, "Step 2 fallback creates a meta-260606T2102Z anti-pattern signal."

**Verified by:** the plan's own risk analysis acknowledges the signal will fire. The mitigation is reactive.

**Fix:** see High 5 recommendation (A + B).

### MEDIUM 10: Test 1's `addresses` on a finding is semantically wrong

**Plan reference:** Phase 1 Architecture, Test 1 setup.

**Verified by:** see Critical 2.

**Fix:** see Critical 2 recommendation (A). Use a loop-design entry, not a finding.

### MEDIUM 11: Test 2 identity assertion is brittle

**Plan reference:** Phase 1 Architecture, Test 2 assert "Identity check: result is NOT === args (didCoerce = true)."

**Why it matters:** the test asserts on identity, not on value shape. If a future refactor mutates `args` in-place, the test breaks for the wrong reason.

**Fix:** replace identity check with value-shape check. Assert `result.addresses` deep-equals `["x", "y"]` and leave the identity question to a separate test.

### MEDIUM 12: Cold-session test impact under-analyzed

**Plan reference:** Phase 3 Risk Assessment, "Cold-session test fails after the change-log mutation."

**Why it matters:** the plan asserts "the change-log mutation does not affect tool availability" without analyzing: (a) 7 mutations in sequence = 7 stdio MCP server processes in some test environments, (b) registry file size growth, (c) `index_extract` invalidation cascades.

**Fix:** add a Step 8.5 that runs the cold-session test in isolation (not the full `pnpm test`) and reports the actual outcome. If the test passes, log it; if it fails, analyze.

### YAGNI 13: `MAX_UNWRAP_ITERATIONS` as a separate constant is YAGNI

**Plan reference:** Phase 2 Architecture, "New constant (top of file): `const MAX_UNWRAP_ITERATIONS = 3;`"

**Why it matters:** the constant is used in 1 place (the `while (depth < MAX_UNWRAP_ITERATIONS)` in `unwrapItemWrap`). The 1-place usage means the named constant adds 0 value over the magic number `3`. YAGNI.

**Fix:** inline `3` in the helper. Drop the constant. Reduces plan's "1 helper + 1 constant + 1 wire-in line" to "1 helper + 1 wire-in block + 1 inline number."

### YAGNI 14: `applies_to.tools` lists `registerTool`

**Plan reference:** Phase 3 Step 1 change-log payload, `applies_to.tools: ["meta_state_patch", "meta_state_propose_design", "meta_state_report", "registerTool"]`.

**Why it matters:** `registerTool` is an internal API, not a meta-state tool. The MCP tools that benefit from the fix are `meta_state_patch`, `meta_state_propose_design`, `meta_state_report`. Including `registerTool` is over-listing.

**Fix:** drop `registerTool` from `applies_to.tools`.

### YAGNI 15: `applies_to.schemas` is a file path, not a schema list

**Plan reference:** Phase 3 Step 1 change-log payload, `applies_to.schemas: ["tools/learning-loop-mcp/tool-registry.js"]`.

**Why it matters:** the field is being used as "files changed" not "schemas affected." Semantic drift.

**Fix:** rename the field in the schema, or document the usage. Not a blocker, but the precedent (entry #510) has the same drift.

### DRIFT 16: Change-log #510 has wrong `change_target`; plan does not address

**Plan reference:** none — the plan's Step 1 change-log has the correct `change_target` (`tool-registry.js`) but does not address that the existing change-log #510 has the wrong `change_target` (`core/gate-logic.js`).

**Verified by:** `meta-state.jsonl` line 510 `change_target: "tools/learning-loop-mcp/core/gate-logic.js#coerceParamsToSchema + tools/learning-loop-mcp/tools/meta-state-patch-tool.js#schema"` — `coerceParamsToSchema` is in `tool-registry.js`, not `core/gate-logic.js`.

**Fix:** add a Step 1.5 to the plan: "Note the stale `change_target` in change-log #510. Either (a) supersede #510 with a new change-log in Step 1, or (b) leave as-is and document in the closeout journal."

### DRIFT 17: Plan conflates unwrap and depth bump in success criteria

**Plan reference:** Phase 2 Success Criteria, "MAX_RECURSION_DEPTH is bumped from 2 → 3."

**Why it matters:** see High 3. The two changes are orthogonal. The success criteria should separate them.

**Fix:** split the success criteria item: "(a) 1 helper added (unwrap); (b) 1 depth bump (orthogonal — justify or drop)."

### UNANSWERED 18: Is the "data-integrity fix pattern" acceptable?

See High 5. The plan needs operator ruling.

### UNANSWERED 19: Why `.cjs` for the new test file?

See Critical 1 + Medium 8. The plan needs an explicit decision on test runner.

### UNANSWERED 20: Why `addresses` on a finding in Test 1?

See Critical 2 + Medium 10. Likely a copy-paste from Test 2 (mock schema). The plan needs a regrounded test design.

## Recommendation

**Do not cook until the following are resolved (in order):**

1. **Critical 1 + Medium 8:** rename the new test file to `.test.js` (or document the deliberate `.cjs` choice with a separate test runner).
2. **Critical 2 + Medium 10:** reground Test 1 to patch a loop-design entry (or drop Test 1 and rely on Test 2 + Test 3).
3. **High 3 + YAGNI 13 + Drift 17:** drop the `MAX_RECURSION_DEPTH` 2→3 bump and the `MAX_UNWRAP_ITERATIONS` constant. Justify or drop.
4. **High 5 + Medium 9 + Unanswered 18:** operator ruling on the "data-integrity fix pattern" fallback. Add a Step 2 pre-validation.
5. **High 6:** update finding #509's `evidence_code_ref` to point to the fix site before Step 4.
6. **High 7:** make Step 7 the real recursive proof (combined array + scalars).
7. **High 4 + Medium 11:** document the ZodObject-recursion-uses-`value` decoupling as a known limitation; add a test for the limitation.
8. **Drift 16:** add a Step 1.5 to address change-log #510's stale `change_target`.

**After fixes, re-run red-team on the 3 new files (plan.md, phase-01, phase-02, phase-03).**

## Estimated effort to resolve

- Critical fixes: ~30 min (1-line changes in 3 files)
- High fixes: ~1.5h (reground Test 1, add Step 1.5, update Step 7, etc.)
- Documentation/clarification: ~30 min
- Re-red-team: ~30 min

**Total: ~3h of plan refinement before `/ck:cook` is safe.**

## Open Questions

1. Is the `.cjs` extension for the new test file intentional (separate test runner) or a copy-paste from the cold-session precedent? If intentional, the test runner must be reconfigured.
2. Is the `MAX_RECURSION_DEPTH` 2→3 bump justified by a real workload, or is it conflated with the unwrap? If the former, cite the workload. If the latter, drop.
3. Is direct registry write for the Bridge 5 deferral entry acceptable, or must it go through `meta_state_propose_design`? Operator ruling required.
4. Should change-log #510's stale `change_target` be superseded (8th registry mutation) or left as-is (audit trail)? Operator preference.
5. The plan's "recursive proof" framing — is the empty-array + scalars pattern (proposed) acceptable as proof, or is a stronger assertion required?
6. The plan claims "898+ existing tests" — verified: 898. The plan also claims "3 new tests pass" — impossible with `.cjs` extension per Critical 1. Which number is wrong?
