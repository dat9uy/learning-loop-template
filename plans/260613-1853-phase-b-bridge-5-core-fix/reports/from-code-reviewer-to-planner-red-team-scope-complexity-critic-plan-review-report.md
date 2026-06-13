# Red-Team Plan Review — Scope & Complexity Critic

**Plan:** `plans/260613-1853-phase-b-bridge-5-core-fix/`
**Reviewer role:** Scope & Complexity Critic (YAGNI enforcer)
**Review date:** 2026-06-13
**Method:** grep/glob evidence against actual codebase; no speculation from plan text
**Scope:** All 6 phase files + plan.md

## Verdict

The plan ships a real fix but is over-engineered in 3 distinct ways and under-engineers 2 critical safeguards. The 7-commit revert in Phase 5 + the 6-test TDD unit file + the precomputed `patchSchemaUnion` are not all justified. The plan also conflicts with a recent dead-code cleanup (commit `05bea00`) and proposes a migration step whose scope contradicts the deferred-B3 framing.

---

## Finding 1: `core/schema-to-zod.js` was just deleted; plan recreates it under the same name

- **Severity:** Critical
- **Location:** Phase 3 (B2-1), "Architecture" — "**Create:** `tools/learning-loop-mcp/core/schema-to-zod.js` (~60 lines; new file)"
- **Flaw:** The exact file path the plan proposes to create was deleted as DEAD CODE in commit `05bea00 chore(cleanup): delete 8 dead product-surface core modules` (verified via `git log --all --oneline -- "tools/learning-loop-mcp/core/schema-to-zod*"` → `05bea00`). The meta-state registry documents this: `meta-260613T1546Z-dead-code-cleanup-process-is-keyword-based-not-import-chain` lists `schema-to-zod` in the 8 deleted core writer modules.
- **Failure scenario:** A reviewer following the established process (import-chain analysis) sees "this file was just nuked; no live importer needs it" and rejects the recreation. Or worse, the file is recreated, but the prior deletion's "process fix" (use import-chain analysis, not keyword matching) hasn't been followed — the new file will be re-killed by the next dead-code sweep if the same audit runs.
- **Evidence:**
  - `git log -- "tools/learning-loop-mcp/core/schema-to-zod*"` shows `05bea00 chore(cleanup): delete 8 dead product-surface core modules` then `206eaa2 chore(cleanup): remove 48 dead files and unused exports`. Two cleanup waves already targeted this path.
  - `meta-state.jsonl` line 556 documents `core/schema-to-zod` as one of 8 deleted core modules.
  - `AGENTS.md:237` and `docs/trajectory.md:42,70` still reference the file's role for product-surface (experiment/risk/decision/observation) — that surface was deleted entirely; the file is now orphaned.
  - `grep -rn "import.*schema-to-zod" tools/ docs/` returns 0 results — no live importer.
- **Suggested fix:** Either (a) explicitly justify why the new file is NOT dead code by listing the live importers it will have in this plan (the plan's own reasoning: `meta-state-patch-tool.js` will import it), and update the AGENTS.md note that the file is now re-bound to the meta-surface; or (b) put `buildPatchSchemaFor` directly in `core/meta-state.js` as a ~5-line `switch` (it IS a 4-case dispatch on the 4 per-kind schemas that already live there). The "core writers, derived readers" split cited as justification is invented — no other derived reader exists in this codebase.

---

## Finding 2: `patchSchemaUnion` precomputed export is premature optimization / dead at ship time

- **Severity:** High
- **Location:** Phase 3 (B2-1), Step 1 line 50 — "Export `const patchSchemaUnion = z.union([...PATCH_KINDS.map(buildPatchSchemaFor)])` (precomputed union for the tool schema; avoids re-deriving per call)"
- **Flaw:** The precomputed `patchSchemaUnion` is consumed in exactly ONE place: `meta-state-patch-tool.js:28`. That tool's schema is built ONCE at module load (the `metaStatePatchTool.schema` is a static const on the module). Even if the union were re-derived per call, the cost is 4 `z.object({...}).partial()` invocations on top-level schemas with ~10 fields each — sub-microsecond. The "precomputed to avoid re-deriving per call" justification is wrong on two counts: (a) `schema` is built once, not per call; (b) `.partial()` is cheap.
- **Failure scenario:** The precomputed export sits in the module's surface area permanently. Future readers of `schema-to-zod.js` see two exports (`buildPatchSchemaFor` and `patchSchemaUnion`) and have to reason about why both exist. If `buildPatchSchemaFor` is the abstraction, the union is an implementation detail. If the union is what the tool uses, `buildPatchSchemaFor` is the implementation detail. Shipping both is dead-code-against-abstraction.
- **Evidence:**
  - `tools/learning-loop-mcp/tools/meta-state-patch-tool.js:13-29` — `schema` is a static object on a module-level export; it is built once at import.
  - `grep -rn "patchSchemaUnion" tools/ docs/` (post-plan) will return exactly 1 import + 1 export.
  - Zod's `.partial()` returns the same instance (it patches `shape` in place, not deep-clone). The "cost" of re-deriving is nil.
- **Suggested fix:** Drop the `patchSchemaUnion` export. Either have `meta-state-patch-tool.js` import `PATCH_KINDS` and call `buildPatchSchemaFor` per-kind to build the union at module load, or inline the 4-line union definition in the tool file (which is the only consumer). The 4 extra lines in the tool file are clearer than the indirection.

---

## Finding 3: 6 unit tests for a function that returns `schema.partial()` is overkill

- **Severity:** High
- **Location:** Phase 3 (B2-1), Step 3 lines 58-66 — "Test 1 ... Test 2 ... Test 3 ... Test 4 ... Test 5 ... Test 6 — 6 new unit tests"
- **Flaw:** The function body is literally `return SCHEMA.partial()` — a 1-line passthrough to a Zod library call. Tests 1-4 assert `Object.keys(shape)` parity for each of 4 kinds; this is testing Zod's `.partial()`, not the plan's code. Test 5 (throws on unknown kind) is the only test that exercises the plan's code, and even that is 1 line of `default: throw`. Test 6 (`patchSchemaUnion.safeParse({proposed_design_for: ['a','b']}).success === true`) is an integration test of `z.union` semantics, not of `buildPatchSchemaFor`.
- **Failure scenario:** Future maintenance on the test file (e.g., adding a 5th kind) requires editing 2 test sites (per-kind array + Test N) instead of one. The 4 per-kind tests create false confidence — if `metaStateFindingEntrySchema.shape` is renamed, ALL 4 tests fail with the same error, which doesn't help a debugger any more than a single `Object.keys(buildPatchSchemaFor('finding'))` check would.
- **Evidence:**
  - Plan Phase 3 Step 1 line 45-48: function body is 4 lines, each just `return X.partial()`.
  - 6 unit tests for ~6 lines of code (test:impl ratio 1:1) violates the "test contracts, not implementations" principle; testing that `.partial()` works is testing Zod.
  - Test 6 is a union membership test, not a `buildPatchSchemaFor` test.
- **Suggested fix:** Collapse to 2 tests: (1) `buildPatchSchemaFor('finding').shape` deep-equals `metaStateFindingEntrySchema.shape` wrapped in `ZodOptional` for one sample field; (2) `buildPatchSchemaFor('unknown')` throws. The per-kind key parity is already exercised by the 4 stdio tests in `meta-state-patch-derived-schema.test.js` (Phase 2), which actually round-trip real data. Or skip the unit test file entirely — the 4 stdio tests are the contract.

---

## Finding 4: 7-commit revert in Phase 5 is over-engineered; 1 commit is sufficient

- **Severity:** High
- **Location:** Phase 5 (B2-3), Step 1-7 — "7 commits land in this phase (1 helper delete + 6 patch reverts)"
- **Flaw:** The bisect-justification ("partial reverts possible if a reader has hidden dependents") is theoretical. The 6 revert sites all have the same root cause (wire-format wrap tolerance) and the same fix (drop the wrap, use the field directly). The 862-test suite catches regressions on ALL 6 sites simultaneously, so per-commit isolation provides zero bisect signal that the suite doesn't already provide. Additionally, the plan claims "each commit passes `pnpm test` independently" — but if a reader DOES have a hidden dependent, the bisect will land on the FIRST revert that breaks, and the operator will have to keep reverts 2-6 disabled while fixing; this is the SAME diagnostic flow as one mega-commit (the operator just looks at the test that fails, not the commit).
- **Failure scenario:** During the 7-commit run, the operator has to type `git add -A && git commit -m "..."` seven times, run `pnpm test` seven times, and review seven diffs that all say the same thing. The commit log grows by 7 entries that future archaeology readers will see as "noise" — every `git log --grep="drop wire-format tolerance"` returns 4 nearly-identical entries. The precedent plan `260610-meta-state-patch-wire-format-recursion/` shipped `unwrapItemWrap` in a single commit; matching that precedent keeps the log clean.
- **Evidence:**
  - Plan Phase 5 Steps 1-7 each contain "Run `pnpm test` — must stay green" — the suite is the only bisect tool being used.
  - Sites #3-6 (loop-introspect, fix-loop-design-refs, cold-tier-regression, meta-state-list-ref-by-filter) are all `Array.isArray(v) ? v : (v.item ?? [])` ternaries with identical logic; collapsing them into 1 commit is the same diff.
  - The "1 commit per revert" pattern only makes sense when the reverts are RISKY (unknown dependents) or LOGICALLY DISTINCT. These are neither.
- **Suggested fix:** 2 commits max: (1) delete `unwrapItemWrap` from `tool-registry.js` + delete local copy in `meta-state-list-tool.js`; (2) revert the 5 reader-side tolerance sites. Or 1 commit: "refactor(meta-state): drop wire-format wrap tolerance post-Phase-B" touching all 7 sites. The 862-test suite is the bisect boundary, not the commit boundary.

---

## Finding 5: 11-file touch list has 5 files where 1 file would do

- **Severity:** Medium
- **Location:** plan.md, "Critical Files" → Modify list — 8 files; plus 3 creates; total 11 files
- **Flaw:** The 5 reader-side reverts in `loop-introspect.js`, `fix-loop-design-refs.mjs`, `fix-loop-design-refs.test.js`, `cold-tier-regression.test.js`, `meta-state-list-ref-by-filter.test.js` all revert the same `Array.isArray(v) ? v : v.item` pattern. They could be a single line in each file if the function were centralized (e.g., a `flatProposedDesignFor(entry)` helper in `core/meta-state.js`). Adding the helper would also serve the 4 stdio tests in Phase 2 that need to read flat values.
- **Failure scenario:** Future schema additions (a 5th kind with array fields) require touching 5+ files to add the same wrap-tolerance. The pattern is the same problem the plan claims to fix.
- **Evidence:**
  - 5 sites of the same `Array.isArray(v) ? v : (v && Array.isArray(v.item) ? v.item : [])` pattern:
    - `core/loop-introspect.js:353-355`
    - `scripts/fix-loop-design-refs.mjs:35-39`
    - `__tests__/fix-loop-design-refs.test.js:42-44, 52-54, 100`
    - `__tests__/cold-tier-regression.test.js:28`
    - `tools/meta-state-list-tool.js:147` (via local `unwrapItemWrap`)
  - No abstraction exists for "read a flat array field that was historically wrapped" — each consumer re-implements the ternary.
- **Suggested fix:** Either accept the 5-file revert and document the pattern as a temporary wart, or extract a `flattenArrayField(value)` helper to `core/meta-state.js` and replace the ternaries. The plan should pick one explicitly.

---

## Finding 6: Migration step is "10-line inline node command" — defends the wrong axis

- **Severity:** Medium
- **Location:** Phase 6 (B2-4), Step 2 — "The script is a 10-line inline node command (no permanent file); the diff is the audit trail"
- **Flaw:** The "no permanent file" justification is correct (one-shot script), but the "10-line inline node command" framing hides the risk: the live `meta-state.jsonl` has 7+ entries with `proposed_design_for: {item: [...]}` and 5+ entries with `addresses: {item: [...]}` (verified by `grep -c`). The migration must (a) walk all entries, (b) flatten both fields, (c) preserve the CAS version, (d) write back via `updateEntry` (not direct write, to keep the audit trail consistent). That's not 10 lines — it's a stateful CAS-aware operation that, done wrong, corrupts the registry.
- **Failure scenario:** An inline `node -e` with `fs.writeFileSync(registryPath, JSON.stringify(...))` overwrites the file without preserving CAS, breaking every subsequent `meta_state_patch` call (CAS check fails because version didn't bump through the proper channel). The plan's own success criteria ("0 wraps remain") would pass, but the registry would be silently broken. The fix would surface as "all subsequent patches fail with version_mismatch" — debug time: 30+ min.
- **Evidence:**
  - `meta-state.jsonl` actually contains 7 `proposed_design_for.*item` matches and 5 `addresses.*item` matches (verified via `grep -c`).
  - `core/meta-state.js:331-400` shows `updateEntry` is the only safe write path (it bumps version, logs to gate, etc.).
  - The 7+ wrap sites are NOT addressed by Phase 5's reader-side reverts (which only stop READING wrap data; they don't normalize the data).
  - Plan ordering: Phase 5 lands first, then Phase 6 migrates. If any tool runs between Phase 5 commit and Phase 6 migration, the data is read with the strict reader and the wrap is invisible (filter `.filter(ref => ref.startsWith("meta-") ...)` returns 0 matches on a wrapped object, so `brokenRefs.length === 0` passes, but the real data is still wrapped and may surface in a different test).
- **Suggested fix:** Either (a) move the migration to its own phase BEFORE Phase 5 (so readers see consistent flat data the whole time); or (b) make the migration a real `scripts/flatten-meta-state-wraps.mjs` file in `tools/learning-loop-mcp/scripts/` with its own test, so the CAS-safe write path is exercised and audit-trailed; or (c) keep the inline command but explicitly require it to use `updateEntry` (no direct fs.write), and add a 1-line post-check that reads the registry back and asserts versions bumped.

---

## Finding 7: `metaStateEntryPatchSchema` as passthrough "safety net" is YAGNI with a side effect

- **Severity:** High
- **Location:** Phase 4 (B2-2), Step 5 "Secondary concern" — "Decision: do NOT change `metaStateEntryPatchSchema` in this phase ... The passthrough at the `updateEntry` boundary is a load-bearing safety net for non-tool callers (scripts, gate hooks)"
- **Flaw:** The "safety net" claim is post-hoc. The actual purpose of `metaStateEntryPatchSchema` is to validate patches INSIDE `updateEntry` (called at `core/meta-state.js:347`). It currently catches 0 type errors (it's passthrough). Keeping it passthrough means: (a) the tool's strict schema is the only line of defense; (b) any non-tool caller (e.g., `scripts/fix-loop-design-refs.mjs` calling `updateEntry` directly) bypasses the strict check. The plan labels this "load-bearing" but doesn't define what it's load-bearing FOR. The "non-tool callers" claim is unsubstantiated — `grep "updateEntry"` shows it's called from exactly 2 sites: `meta-state-patch-tool.js:81` and `scripts/fix-loop-design-refs.mjs`. Both go through the tool layer first (the script is invoked manually after human review).
- **Failure scenario:** A future script (e.g., a new migration tool) calls `updateEntry(root, id, { proposed_design_for: "not-an-array" })` — the passthrough accepts it, the registry stores a string instead of an array, the new `proposed_design_for: v` reader (post-Phase 5) throws `TypeError: v.includes is not a function`. The "safety net" prevents the strict schema from catching this; the strict reader is now stricter than the strict schema. This is a regression, not a safety net.
- **Evidence:**
  - `grep -rn "updateEntry(" tools/learning-loop-mcp/` → 2 call sites: `tools/meta-state-patch-tool.js:81`, `scripts/fix-loop-design-refs.mjs:N` (uses `updateEntry` for the fix loop).
  - `core/meta-state.js:246` — `export const metaStateEntryPatchSchema = z.object({}).passthrough();` — currently accepts ANY shape.
  - `core/meta-state.js:347` — `metaStateEntryPatchSchema.safeParse(patch)` is the only validation in `updateEntry`.
  - The plan's Phase 6 journal task "record this as a known follow-up" defers the bug fix to B3.
- **Suggested fix:** Phase 4 should also replace `metaStateEntryPatchSchema` with `patchSchemaUnion` (the same export). This is a 1-line change in `core/meta-state.js:246` + 1 import line. The "load-bearing safety net" is a YAGNI artifact — there are no non-tool callers that need looser validation than the tool.

---

## Finding 8: Test 3 (stringified array) assertion is not actually a regression test for the bug

- **Severity:** Medium
- **Location:** Phase 2 (B2-0), Step 4 "Write Test 3 — stdio client passes array as JSON string, gets flat array back"
- **Flaw:** Test 3 sends `patch: { addresses: JSON.stringify(["x", "y"]) }` and asserts the registry stores `["x", "y"]`. This is the behavior of `coerceValue` (the `ZodArray` branch at `tool-registry.js:24-32`), not the bug fix. The test will pass BEFORE Phase 3 (RED→GREEN via `coerceValue` + `unwrapItemWrap`, not via the derived schema). Per the plan's own Phase 2 risk: "Test 3 is intentionally written to exercise the outer coercion (it sends a string, expects the outer coercion to parse it). It passes both before and after the fix." A test that passes both before and after is not a TDD red test — it's a passing acceptance test.
- **Failure scenario:** The 4-new-test count includes 1 test that does not actually fail RED in Phase 2 (it's a no-op for the bug). The plan's success criteria claim "4 new tests FAIL before Phase 3" but Test 3 cannot fail under the current code path (string → `coerceValue` → array → `unwrapItemWrap` doesn't fire because it's already flat → store flat). The count is off-by-one in the RED phase.
- **Evidence:**
  - `tool-registry.js:24-32` shows `coerceValue` for `ZodArray` already parses JSON strings.
  - `tool-registry.js:108-122` shows `unwrapItemWrap` is only invoked AFTER `coerceValue`. If `coerceValue` already converted the string to an array, the `unwrapItemWrap` sees an array and short-circuits (line 65-67: `Array.isArray(value)` returns early).
  - The plan's own Phase 2 risk assessment (line 88-90) admits: "It passes both before and after the fix."
- **Suggested fix:** Either (a) drop Test 3 — the stdio coercion is a separate concern tested by `__tests__/wire-format-coercion-fix.test.js`; or (b) reformulate Test 3 to assert what the bug actually is: `proposed_design_for: ["a", "b"]` (a real array, not a string) round-trips flat — this is Test 1's contract. Test 3 is a duplicate.

---

## Finding 9: B3-B6 deferral is scope-creep avoidance, not scope control

- **Severity:** Medium
- **Location:** plan.md, "Out of Scope (deferred to B3-B6)" — all 4 deferred items
- **Flaw:** The deferral framing ("B2 fixes the blocker; broader adoption is incremental") is technically correct but hides a real risk: B3 (apply derived schema to all `meta_state_*` tools) is what makes the fix structural. As long as B3 is deferred, the other `meta_state_*` tools (propose-design already uses `metaStateLoopDesignSchema`; others use various passthrough or hand-typed schemas) continue to be sources of the SAME bug class. The plan ships a fix for `meta_state_patch` only, and the master tracker still has B3 as the actual gate. A future patch against any other `meta_state_*` tool will reproduce the bug.
- **Failure scenario:** Between this session and B3, an operator uses `meta_state_propose_design` with a complex `applies_to` object. The fix doesn't apply. The operator files a new finding. The next session does B3 to apply the derived schema, but the new finding is already in the registry.
- **Evidence:**
  - Plan B3 deferral: "Apply derived schema to all `meta_state_*` tools" — this is the generalization, not an extension.
  - `tools/learning-loop-mcp/tools/` directory has 18 meta-state tools; only 1 (`meta_state_patch`) is being fixed.
  - `metaStateLoopDesignSchema` (used by `propose_design`) is already strict-typed per the plan's own architecture section, but the OTHER fields it patches (e.g., `applies_to` on change-log) are not.
  - `propose_design-tool.js:5` imports `metaStateLoopDesignSchema` directly — proving the pattern works for 1 of 18 tools, and is being held back for the other 17.
- **Suggested fix:** Either (a) expand B2 scope to all 4 meta_state tools (propose_design, list, patch, log_change — the ones that write to the registry); or (b) document the deferral as a TRADE-OFF (not just "out of scope") in the plan's risk section, with the explicit acceptance that the bug class will recur.

---

## Finding 10: 2 wire-format test updates flip the contract test to a "no longer needed" test

- **Severity:** Medium
- **Location:** Phase 2 (B2-0), Step 6-7 — "Update `__tests__/wire-format-top-level-coercion.test.js` ... `__tests__/wire-format-patch-recursion.test.js`"
- **Flaw:** The plan changes `patch: { item: { addresses: [...] } }` to `patch: { addresses: [...] }` in `wire-format-patch-recursion.test.js:149-167`, then in Phase 5 deletes the `unwrapItemWrap` helper that the OLD test was exercising. After Phase 5, the new test asserts flat-in, flat-out — but the test's NAME is no longer accurate. The original test name "Test 1: meta_state_patch recursion unwraps {item: {...}} patch object" was a wire-format recursion test. The new test "patch with flat object" is a happy-path test. The plan in Phase 5 step 7 acknowledges this for one test ("wire-format wrap test no longer needed") but not for the 2 wire-format tests in Phase 2.
- **Failure scenario:** Future reader sees "Test 1: meta_state_patch recursion" in the test file and looks for recursion handling. There is none — the test asserts the OPPOSITE: that recursion is no longer needed. The test name lies.
- **Evidence:**
  - `__tests__/wire-format-patch-recursion.test.js:149-167` (per plan's reference) currently tests `patch: { item: { addresses: [...] } }`. Post-plan, it will test `patch: { addresses: [...] }`.
  - The file's filename contains "recursion" — implying recursion is still a concern. The plan's Phase 2 update makes the filename's premise false.
  - Phase 5 step 7 explicitly renames one test to drop "wire-format wrap" framing. The 2 Phase 2 updates do not.
- **Suggested fix:** Rename `__tests__/wire-format-patch-recursion.test.js` to `__tests__/wire-format-patch-flat.test.js` (or similar) as part of Phase 5. Or move the recursion-specific tests to `__tests__/wire-format-coercion-fix.test.js` (which is the coercion home) and delete the recursion file.

---

## Summary

- **Critical:** 1 (Finding 1 — dead file recreation)
- **High:** 4 (Findings 2, 3, 4, 7)
- **Medium:** 5 (Findings 5, 6, 8, 9, 10)
- **Total findings:** 10

### Top 3 to fix before cook

1. **Finding 1 (Critical):** Justify `core/schema-to-zod.js` recreation against the `05bea00` dead-code cleanup, OR inline `buildPatchSchemaFor` in `core/meta-state.js` (5 lines).
2. **Finding 7 (High):** Phase 4 should also update `metaStateEntryPatchSchema` to use the strict union — the "safety net" framing is wrong; the strict reader + passthrough validator is a future-bug factory.
3. **Finding 4 (High):** Collapse the 7-commit revert to 1-2 commits; the per-commit bisect benefit is theoretical, and the precedent (`260610-...-wire-format-recursion`) shipped `unwrapItemWrap` in a single commit.

### Unresolved questions

- Does the 7-site wire-format wrap data in the live `meta-state.jsonl` (verified: 7+ `proposed_design_for.item` sites, 5+ `addresses.item` sites) get migrated BEFORE or AFTER Phase 5 lands? Plan order says Phase 5 first, then Phase 6 migration — but Phase 5 strict readers will silently filter out the wrap data. Should the plan explicitly call this out as a "data is invisible between Phase 5 commit and Phase 6 migration" window?
- The plan's test count arithmetic: "862 baseline + 4 from Phase 2 + 6 from Phase 3 - 6 obsolete assertions = ~866". 862 + 4 + 6 = 872, not 866. The "-6 obsolete" is unclear — no test is being deleted in the plan. Real expected count is 872.
- Is `pnpm test:cold-session` actually gated on the same `pnpm test` suite, or does it run independently? Plan says "green (8/8)" but the cold-session test file contains 5 tests (per `cold-session-discoverability.test.cjs` header), one of which is droid-exec and may skip. "8/8" is a count that may not exist in the actual test file.

### Positive observations (not findings)

- The plan correctly identifies that `metaStateEntrySchema` has 4 per-kind branches with `.shape` (verified at `core/meta-state.js:56-225`).
- The 2 wire-format test updates correctly identify which assertions are symptom vs. contract.
- The TDD red-green-refactor sequencing is sound; only the per-phase granularity is off.
- The use of `coerceValue` for stdio string-to-array coercion is a clean separation of concerns (and pre-existing in the codebase, so no new deps).

---

**Status:** DONE
**Summary:** Plan has 1 critical conflict (recreates dead file), 4 high-severity YAGNI/coupling issues, and 5 medium-scope concerns. The fix is real; the implementation is heavier than necessary.
**Concerns/Blockers:** Finding 1 must be resolved before cook (file path conflict with `05bea00` dead-code cleanup). Findings 4 and 7 should be resolved for plan quality. The rest are non-blocking.
