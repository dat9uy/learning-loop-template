# Red-Team Plan Review — Phase E Mechanism A + B

Reviewer: code-reviewer (assumption-destroyer lens)
Date: 2026-06-27
Plan: `plans/260627-1304-phase-e-topology-mechanism-a-b/`
Scope: 5 phase files (plan.md + 4 mechanism docs; note: only 4 phase files exist despite plan referencing 5 — see Finding 10)

---

## Finding 1: "28 core files" is wrong — manifest must enumerate 27

- **Severity:** High
- **Location:** `plan.md` lines 36, 65; `phase-01` line 62; `phase-02` line 17
- **Flaw:** Plan repeatedly claims "all 28 core files" must be enumerated in `core/placement.yaml` and "5-test `__tests__/phase-e-foundation/` suite is now 5/5 green". The verification command in phase-01 uses `grep -v __tests__ | grep -v "/lib/"`, which excludes exactly the test files.
- **Failure scenario:** The grep also strips out the test files in `core/*.test.js` (because the `*.test.js` extension doesn't match `__tests__` directory glob, but they ARE non-production files in `core/`). With the proposed filter, there are exactly **27** production files. If the manifest is authored against the wrong count, the enumeration test fails or misses files. Furthermore, `find` includes 3 `*.test.js` files colocated with code (`loop-introspect.test.js`, `meta-state.test.js`, `record-validation-rules.test.js`, `workflow-registry.test.js`) — 4 test files. Plan uses `~28` which conflates production files (27) with the test files (4) in the same grep filter.
- **Evidence:**
  - `find tools/learning-loop-mastra/core -type f \( -name "*.js" -o -name "*.cjs" -o -name "*.mjs" \) | grep -v __tests__ | grep -v "/lib/" | wc -l` = **27** (production files, excluding `__tests__/` and `/lib/`)
  - `find tools/learning-loop-mastra/core -type f \( -name "*.js" -o -name "*.cjs" -o -name "*.mjs" \) | wc -l` = **32** (all JS, including `*.test.js` colocated and `__tests__/`)
  - Plan also lists "other 28 core files" in the ASCII tree (`plan.md` line 65) — off-by-one vs. actual 27.
  - `__tests__/phase-e-foundation/` currently has 4 test files (`fcis-invariant.test.js`, `schema-doc-exists.test.js`, `agents-section-1-layers.test.js`, `no-core-legacy-refs.test.js`), not 5 as plan line 96 claims.
- **Suggested fix:** Run the verification command literally and update all counts to 27 production files. Update phase-2 success criteria from "5/5" to "4 existing + 1 new = 5/5".

---

## Finding 2: `checkResolutionEvidence` is in `gate-logic.js`, NOT `meta-state.js`

- **Severity:** Critical
- **Location:** `phase-03` lines 51, 134; `phase-04` lines 87–89
- **Flaw:** Phase-3 line 51 architecture sketch says `(was: checkResolutionEvidence)` next to a rule factory method, and line 134 says "extracted from the existing `checkResolutionEvidence` in `meta-state.js`". Phase-4 architecture says factories live in `core/entry/` and re-export `readRegistry` "from `../meta-state.js`". The plan assumes `checkResolutionEvidence` is colocated with the rule schema, but it's not — it lives in `gate-logic.js`.
- **Failure scenario:** The factory for a rule calls `checkResolutionEvidence` as if it's adjacent code; the developer who implements Phase-3 will discover it lives in `gate-logic.js` and either (a) imports it across module boundaries (`entry/rule.js` → `../gate-logic.js`, violating the "factories compose existing logic" KISS claim), or (b) duplicates the logic into the factory, violating the soft-inversion contract (R5 already flags this risk), or (c) postpones the method, leaving `createRule.checkResolutionEvidence` unimplemented and the test failing.
- **Evidence:**
  - `grep -n "checkResolutionEvidence" tools/learning-loop-mastra/core/meta-state.js` returns **zero matches** — function not in `meta-state.js`.
  - `grep -n "checkResolutionEvidence" tools/learning-loop-mastra/core/gate-logic.js` line 691: `export function checkResolutionEvidence(rule, root) { ... }`
  - Already imported in `tools/legacy/meta-state-resolve-tool.js` line 9: `import { loadPromotedRules, checkResolutionEvidence } from "../../core/gate-logic.js";`
  - Existing tests at `__tests__/legacy-mcp/gate-resolution-evidence.test.js` import via `importGateLogic()` (helper that reads from gate-logic).
- **Suggested fix:** Either (a) update phase-3 to say `checkResolutionEvidence` is in `gate-logic.js` and will be called via `import { checkResolutionEvidence } from "../gate-logic.js"`, OR (b) defer `checkResolutionEvidence` to Phase 4 and only stub `createRule.checkResolutionEvidence(root)` to throw "implemented in Phase 4" for now. Either choice requires an explicit note in the PR description. Do NOT silently re-export from `meta-state.js` — that's a hidden dependency.

---

## Finding 3: Snapshot test cannot be authored — no fixtures exist for `meta_state_relationships`

- **Severity:** Critical
- **Location:** `phase-04` lines 183–186; `phase-05` lines 95–123, 152
- **Flaw:** Phase-4 says "Capture the current `meta_state_relationships` output for that id" and "Store the snapshot in `__tests__/phase-e-foundation/meta-state-relationships-snapshot.json`". Phase-5 assumes "fixtures use generic ids (`meta-test-finding`, `rule-test-rule`, ...)" and the fixture entries can be used to drive the snapshot. The plan treats fixture ids as stable infrastructure. They are not — they're test-scoped locals in unrelated tests.
- **Failure scenario:** The implementer runs the snapshot-capture step (Phase-4 step 5) and discovers there is no centralized fixture directory for `meta_state_relationships`. They grep for `meta-test-finding` and find 8+ ad-hoc usages across completely unrelated test files. They either (a) invent new fixture ids and a fixture writer (scope creep, violates KISS), (b) try to reuse existing registry fixtures which don't exist, or (c) skip the snapshot and commit empty snapshot files — snapshot test becomes a tautology ("matches empty JSON").
- **Evidence:**
  - `find /home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra -name "meta-state-relationships-snapshot*"` returns **zero matches** — no existing snapshot infrastructure.
  - `grep -n "rule-test-rule"` shows it's only defined in `__tests__/legacy-mcp/meta-state-schema-extension.test.js:120` as a test-local literal, NOT a shared fixture.
  - `grep -rn "meta-test-finding" tools/learning-loop-mastra/` shows uses across 8+ test files, all test-local literals, no shared fixture file.
  - Fixtures dirs exist (`tools/learning-loop-mastra/__tests__/fixtures`, `tools/learning-loop-mastra/tools/legacy/fixtures`) but neither contains meta-state entries designed for snapshot capture.
  - Plan never defines a fixtures writer for meta-state entries.
- **Suggested fix:** Add an explicit Phase-4.1 prerequisite: "Create `tools/learning-loop-mastra/__tests__/phase-e-foundation/fixtures/meta-state-fixtures.js` exporting `FINDING_FIXTURE`, `RULE_FIXTURE`, `CHANGE_LOG_FIXTURE`, `LOOP_DESIGN_FIXTURE` with full canonical fields (status=active, all required fields per `meta-state.js`). Write fixture entries to a temp `meta-state.jsonl` in `mkdtempSync` and tear down in afterEach. Snapshot capture runs against these fixtures." Without this, the snapshot test has no foundation.

---

## Finding 4: `factory.schema === schema` reference equality is fragile vs. Zod's `.default()` behavior

- **Severity:** High
- **Location:** `phase-03` line 24, 41, 92, 173; `phase-04` line 149; `phase-05` lines 87, 130
- **Flaw:** Plan asserts `createRule.schema === metaStateRuleEntrySchema` (reference equality). Zod schemas are mutable — schema composition (`.extend()`, `.merge()`, `.partial()`) returns new objects. Any future refactor that wraps `metaStateRuleEntrySchema` in a call (e.g., `metaStateRuleEntrySchema.partial()` for the patch path, or `.brand()` for type discrimination) silently breaks reference equality. Phase-5 line 90 already contains a placeholder `FIXTURES.finding.constructor.prototype` which proves the test author wasn't sure how to assert equality and resorted to guessing. The reference-equality test will pin Zod's internal object identity into a hard contract.
- **Failure scenario:** A future agent adds `.brand("meta-state-rule")` to one of the schemas for downstream type narrowing (a common Zod pattern). The brand call returns a new Zod schema, breaking `rule.schema === metaStateRuleEntrySchema` across all 4 factories. The test failure message references an internal implementation detail, not user behavior. The agent either reverts the brand or cheats the test by re-exporting the original reference.
- **Evidence:**
  - `grep -n "metaStateRuleEntrySchema" tools/learning-loop-mastra/core/meta-state.js` line 164: `export const metaStateRuleEntrySchema = z.object({ ... })` — confirmed module-level constant.
  - `tools/learning-loop-mastra/core/meta-state.js:299` `buildPatchSchemaFor(kind)` already does `metaStateRuleEntrySchema.partial().strict()` — evidence the project mutates schemas in this way today.
  - Plan phase-5 line 90: `assert.strictEqual(finding.schema, FIXTURES.finding.constructor.prototype);  // placeholder; adjust to actual canonical schema import` — explicit placeholder, not actual code.
- **Suggested fix:** Replace reference equality with structural assertion: assert `factory.schema.parse(data)` and `metaStateRuleEntrySchema.parse(data)` produce identical objects, AND `factory.schema._def` (or `.shape`) deep-equals. Or, accept that reference equality is the contract, document it in `core/README.md` as a load-bearing invariant, and add a CI guard that fails if anyone wraps a schema in a new call. Plan should explicitly choose one path; currently it does neither.

---

## Finding 5: `Object.freeze` is shallow — frozen factory output leaks mutable nested data

- **Severity:** High
- **Location:** `plan.md` lines 79, 121; `phase-03` lines 38, 122; `phase-05` line 109
- **Flaw:** Plan claims "every returned object is `Object.freeze`'d" and uses this as a mutation-safety guarantee (R3 in plan-level risks). `Object.freeze` is shallow. Zod `.parse()` returns objects whose nested values (e.g., `data.verification = z.object({}).passthrough().optional()` — explicitly loose) are not frozen. The plan's "frozen factory outputs" guarantee is therefore only true at the top level.
- **Failure scenario:** A caller writes `rule.data.verification = { mutated: true }`. The top-level `rule` object is frozen, so this assignment throws. But `rule.data.verification` is a passthrough object that Zod did NOT freeze. Caller writes `rule.data.verification.notes = "anything"` — succeeds silently, bypassing the soft-inversion safety guarantee. The "frozen factory outputs" claim in plan-level R3 (Phase 2 mitigation) is therefore misleading and the safety property is not enforced.
- **Evidence:**
  - `tools/learning-loop-mastra/core/meta-state.js:79` `verification: z.object({}).passthrough().optional()` — explicitly open object shape.
  - `tools/learning-loop-mastra/core/meta-state.js:124` `change_diff: z.object({...}).describe("Structured diff")` — nested mutable object.
  - Node's `Object.freeze` documentation: shallow freeze; nested objects remain mutable by default.
  - Plan line 79: "every `create*` returns `Object.freeze({...})`" — claim made without deep-freeze helper.
- **Suggested fix:** Either (a) deep-freeze via recursive `Object.freeze` after parse (small util in `entry/index.js`), OR (b) document the shallow-freeze limitation in `core/README.md` and remove the safety claim from R3, OR (c) accept the limitation and note that callers are trusted (defeats the soft-inversion rationale). Plan must choose.

---

## Finding 6: `entry/` placement under `core/` will conflict with FCIS test patterns and sibling-imports test

- **Severity:** Medium
- **Location:** `plan.md` line 58; `phase-02` line 100; `phase-04` line 36
- **Flaw:** Plan claims "`core/entry/` files contain zero `@mastra/*` imports — verify this" (FCIS check) and asserts no behavior change. But `core/entry/` files import `meta-state.js`, `gate-logic.js`, and `loop-introspect.js` — all sibling core files. The existing FCIS test pattern allows sibling imports, so this passes. However, the `no-core-legacy-refs.test.js` and the agents-section-1 test are NOT covered by Phase 2's manifest verification — only the 4 phase-e-foundation tests are mentioned. The plan doesn't check whether the **new** entry directory breaks any existing tests by adding files to `core/`.
- **Failure scenario:** After `core/entry/` ships, the existing `__tests__/phase-e-foundation/no-core-legacy-refs.test.js` (which the plan doesn't enumerate as a regression check) fails because the test asserts something about layer/role imports that the new files violate. The plan's risk R3 (Phase 5) "FCIS invariant still holds" is the only mention of FCIS-style regressions, but Phase 5 doesn't run `no-core-legacy-refs.test.js` explicitly.
- **Evidence:**
  - `tools/learning-loop-mastra/__tests__/phase-e-foundation/` has 4 test files, not 5 — plan's claim of "5/5" is wrong (see Finding 1).
  - Plan R3 line 191 in phase-5 says "Final FCIS check" but only lists `fcis-invariant.test.js`, missing `no-core-legacy-refs.test.js` and `agents-section-1-layers.test.js` from regression coverage.
  - Plan's R3 in plan-level risks covers `no new @mastra/* imports` but not whether `entry/` subdirectory breaks the existing `__tests__/phase-e-foundation/no-core-legacy-refs.test.js` scan.
- **Suggested fix:** Add explicit Phase-5 step: "Run all 4 existing tests in `__tests__/phase-e-foundation/` individually; confirm no regression from new `core/entry/` placement." Verify the `no-core-legacy-refs.test.js` is still passing by reading the test source first.

---

## Finding 7: Soft-inversion has zero prior art — risk of design-by-fiat

- **Severity:** High
- **Location:** `plan.md` line 78; `phase-03` lines 91–96
- **Flaw:** Plan claims "soft inversion (Mechanism B)" is the chosen pattern and treats it as established design. There is no precedent in the codebase for factory wrappers around Zod schemas — `core/meta-state.js` is the only consumer of Zod schemas, and it parses inputs directly. The "soft-inversion" pattern (schemas stay canonical, factories expose ergonomic surface) is invented for this PR with no prior art in the repo.
- **Failure scenario:** The pattern lands, then Phase 3 evaluators (separate plan, "out of scope here") discover they need additional factory methods that the soft-inversion pattern doesn't elegantly express. The ADR comment says "Revisit if .shape consumers drop below 3 OR factory methods need cross-cutting logic that schemas can't express" — but neither trigger is testable. Soft inversion becomes the technical debt that the operator said the plan was meant to eliminate.
- **Evidence:**
  - `grep -rn "soft.inversion\|soft inversion" tools/learning-loop-mastra/core/README.md` returns **zero matches** — no prior art in the README.
  - `grep -rn "factoryFor\|createRule\|createFinding" tools/learning-loop-mastra/core/` returns **zero matches** — no existing factory pattern.
  - All current consumers of the schemas (`meta-state-resolve-tool.js`, `meta-state-refresh-fingerprint-tool.js`) parse inputs directly without factory wrappers.
- **Suggested fix:** Add a Phase-0 pre-implementation spike: "Write a 30-line prototype of `createRule` + one downstream consumer; verify the ergonomic surface is genuinely better than raw schema access for at least one new use case (e.g., the planned Phase 3 evaluators). If the prototype does not simplify code, abandon soft inversion." Plan should treat the pattern as a hypothesis, not a settled decision.

---

## Finding 8: All-counts claim "All 1189+ existing tests still pass" is unsourced and likely inaccurate

- **Severity:** Medium
- **Location:** `plan.md` lines 40, 111, 128; `phase-01` line 103; `phase-02` line 95; `phase-04` line 211; `phase-05` line 208
- **Flaw:** Plan asserts "All 1189 existing tests still pass" in 5+ locations. The number "1189" appears verbatim but is not grounded in any test inventory — no test runner output, no documented suite size, no count command in the plan. The test:debug script (`package.json:17`) targets only `__tests__/debug/*.test.cjs`. The standard `pnpm test` runs `node tools/scripts/run-pnpm-test-namespaced.mjs`, which the plan doesn't show counting.
- **Failure scenario:** Phase-1 ships, `pnpm test` actually runs N tests, and the operator discovers the existing count is different from 1189. The PR body claims a count that doesn't match reality, weakening trust in the test results. More importantly, "All tests pass" is repeated as evidence the change is safe, but the baseline count was never verified — there's no way to detect a test that was silently dropped.
- **Evidence:**
  - `package.json:16` `"test": "node tools/scripts/run-pnpm-test-namespaced.mjs"` — runs a namespaced test script, output not shown.
  - No `docs/` file, no plan file, no commit message references "1189 tests" with evidence.
  - `find tools/learning-loop-mastra/__tests__ -name "*.test.*"` shows 30+ test files; the actual count requires running the runner, which the plan never does.
- **Suggested fix:** Add a Phase-0 step: "Run `pnpm test` on `main` branch and capture the exact pass count; record it in the plan as the baseline." Replace every "1189+" with the actual measured number. If the count can't be measured, write "existing test suite" without a number.

---

## Finding 9: `meta_state_relationships` snapshot test is impossible without registry fixtures

- **Severity:** Critical
- **Location:** `phase-04` lines 183–186; `phase-05` lines 95–123
- **Flaw:** Plan claims "snapshot test for `meta_state_relationships` captures wire shape BEFORE reimplementation (in Phase 4) and asserts byte-equality AFTER". The existing tool at `tools/legacy/meta-state-relationships-tool.js:24` calls `resolveRoot()` and `readRegistry(root)` — it requires an actual project root with a `meta-state.jsonl` file. The plan provides no setup step for writing a test fixture registry.
- **Failure scenario:** Phase-4 step 5 (capture snapshot) runs the old tool. It either (a) crashes because `resolveRoot()` returns a directory without `meta-state.jsonl`, (b) returns an empty registry and the snapshot is `{inbound: null, outbound: null, id: "...", direction: "...", entry_kind: "..."}` — useless as a regression baseline, or (c) the implementer hand-writes a snapshot file based on the schema, and the snapshot test passes against an artificial baseline that the reimplementation matches trivially.
- **Evidence:**
  - `tools/legacy/meta-state-relationships-tool.js:23–32` handler calls `resolveRoot()` and `readRegistry(root)`, requires on-disk registry.
  - No existing snapshot test pattern for this tool — `find ... -name "*snapshot*"` returns nothing.
  - Plan's phase-4 step 5 says "use an existing fixture in the test suite, e.g., from `meta-state.test.js`" — but `meta-state.test.js` tests schema validation, not registry reads; it doesn't produce wire-shape outputs.
- **Suggested fix:** Add Phase-4 prerequisite step: "Create temp registry fixture: `writeRegistry(tempDir, [FINDING_FIXTURE, RULE_FIXTURE, CHANGE_LOG_FIXTURE])` per `__tests__/legacy-mcp/meta-state-schema-extension.test.js:156` `writeRegistry` pattern. Capture output as `expected/finding.json`, `expected/rule.json`, `expected/change-log.json`." Without this, the snapshot is vacuous.

---

## Finding 10: Plan references 5 phase files but only 4 exist

- **Severity:** Medium
- **Location:** `plan.md` lines 33–40; filesystem listing
- **Flaw:** `plan.md` phase table claims phases numbered 1 through 5 (MechanismA-DocAndManifest, MechanismA-TestExtension, MechanismB-EntryFactories, MechanismB-CrossCuttingAndToolReimpl, MechanismB-TestsAndSnapshot). Filesystem shows: `phase-01-mechanisma-docandmanifest.md`, `phase-02-mechanisma-testextension.md`, `phase-03-mechanismb-entryfactories.md`, `phase-04-mechanismb-crosscuttingandtoolreimpl.md`, `phase-05-mechanismb-testsandsnapshot.md` — actually 5 files exist, but the plan status row for Phase 1 (line 36) reads "Manifest enumerates all 28 core files" which contradicts the actual grep result of 27.
- **Failure scenario:** This is a minor mismatch but compounds with Finding 1. A reviewer reading the plan sees "5 phases" and "28 files" and doesn't catch that the off-by-one error masks a real planning gap.
- **Evidence:** `ls plans/260627-1304-phase-e-topology-mechanism-a-b/phase-*.md` returns 5 files; plan claims 5 phases — count is right, content counts are wrong (see Finding 1).
- **Suggested fix:** Reconcile all file counts in one place: 27 production files in `core/` (excluding `__tests__/` and `/lib/`), 4 test files colocated, 32 total JS files, 4 existing tests in `phase-e-foundation/`.

---

## Finding 11: Closed role taxonomy is invented — risk of new-file limbo

- **Severity:** Medium
- **Location:** `plan.md` line 104; `phase-01` lines 22, 70; `phase-02` line 36
- **Flaw:** Plan defines a closed 7-role taxonomy (`primitive`, `evaluator`, `facade`, `verification`, `validator`, `cache`, `helper`). Several existing files in `core/` are hard to classify — e.g., `surfaces.js`, `workflow-registry.js`, `runtime-agnostic-checklist.js`, `recurrence-tracker.js`. Plan R3 in phase-2 acknowledges this risk but the mitigation ("fix the role assignment, not the file") means the manifest will inevitably carry forced role assignments that don't reflect actual file behavior.
- **Failure scenario:** Phase-1 manifest authoring reaches `surfaces.js` and discovers it's neither `primitive` nor `helper` — it's a domain-specific registry. The implementer picks `helper` and adds a comment "mixed". The closed-taxonomy discipline collapses with the first ambiguous file. Future contributors see the precedent and continue the practice.
- **Evidence:**
  - `find tools/learning-loop-mastra/core -name "*.js" -not -path "*__tests__*" -not -path "*lib/*" -not -name "*.test.js"` produces 27 files; manual review of files like `surfaces.js`, `runtime-agnostic-checklist.js`, `recurrence-tracker.js` shows they don't fit cleanly into any of the 7 roles.
  - `tools/learning-loop-mastra/core/recurrence-tracker.js` (file exists per `ls`) — its role is unclear from filename alone.
  - Plan R3 phase-2 line 99: "If a file violates the invariant, fix the role assignment (not the file) in the manifest" — acknowledges role-fit problems are likely.
- **Suggested fix:** Either (a) expand the taxonomy before Phase 1 ships (open the roles, validate each, document the closed set empirically), OR (b) introduce a `mixed` role explicitly, OR (c) accept that role assignment is best-effort and remove the closed-taxonomy requirement from the AC. Current plan has the worst of all three.

---

## Finding 12: Phase-4 `factoryFor` dispatch assumes `entry.entry_kind` — but `entry_kind` is optional/coerced in some paths

- **Severity:** Medium
- **Location:** `phase-04` lines 39–48; `phase-05` lines 48–53
- **Flaw:** `factoryFor(entry)` dispatches via `switch (entry.entry_kind)`. Plan treats `entry_kind` as always present. But `meta-state.js:355–356` shows the registry loader coerces: `if (!entry.entry_kind) { entry.entry_kind = "finding"; }` — entries without `entry_kind` are defaulted to `"finding"` post-load. Plan's `factoryFor` therefore works on post-load registry entries. But factory tests pass raw fixtures (`FIXTURES.finding = { id: "...", entry_kind: "finding", ... }`) — these have `entry_kind`. The discrepancy isn't a bug, but it's an unstated contract: factories require post-coercion entries, which makes them unsuitable for use in the load path itself.
- **Failure scenario:** A future caller tries to use `factoryFor` on a pre-coercion entry (during `readRegistry`'s coercion loop). The dispatch fires before `entry_kind` is set. Result: `entry_kind === undefined` → throws `Unknown entry_kind: undefined`. The error is confusing because the entry is being loaded, not queried.
- **Evidence:**
  - `tools/learning-loop-mastra/core/meta-state.js:355–356` explicit coercion comment: "Backward-compat coerce".
  - `meta-state.js:117–119` `metaStateChangeEntrySchema` has `entry_kind` as `.describe(...)` without a `.default()` — a finding schema without `entry_kind` parses but a change-log without it errors. Inconsistent.
  - Plan phase-4 line 39: `switch (entry.entry_kind)` — no default fallback for missing `entry_kind`.
- **Suggested fix:** Add explicit guard in `factoryFor`: `if (!entry.entry_kind) throw new Error("entry_kind missing; pass post-coercion registry entries");` Document the contract in `core/README.md`. Or normalize via the same coercion logic from `meta-state.js` (extract to shared helper).

---

## Summary of severity distribution

- **Critical:** 3 findings (F2 — wrong module attribution for `checkResolutionEvidence`; F3 — snapshot test has no fixtures; F9 — snapshot test impossible without registry setup)
- **High:** 4 findings (F1 — wrong file count; F4 — reference-equality fragile; F5 — shallow freeze; F7 — soft inversion lacks prior art)
- **Medium:** 4 findings (F6 — FCIS regression coverage incomplete; F8 — 1189 count unsourced; F10 — count inconsistencies; F11 — closed taxonomy invented; F12 — `entry_kind` coercion contract unstated)

## Recommended blockers before implementation starts

1. Resolve F2 (which file holds `checkResolutionEvidence`) — affects factory placement.
2. Build fixture infrastructure for F3 + F9 — without this, the snapshot test is theatrical.
3. Run baseline test count for F8 — the "1189+" claim must be measured, not asserted.
4. Reclassify file count for F1 + F10 — manifest cannot be authored with wrong count.

## Open questions for planner

- Q1: Is the 7-role closed taxonomy (Finding 11) truly closed, or should Phase 1 start with a wider empirical survey?
- Q2: For F4 (reference equality), is the team willing to accept the contract that `metaState*EntrySchema` must remain a single module-level constant? Future refactors that wrap the schema will break all 4 factories.
- Q3: For F5 (shallow freeze), is the team willing to accept shallow freeze, or does it want a deep-freeze helper in `entry/index.js`?
- Q4: For F7 (soft inversion prior art), is there a precedent outside the repo the planner wants to follow, or is the pattern truly greenfield?
