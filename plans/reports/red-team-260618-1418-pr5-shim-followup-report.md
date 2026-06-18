# Red Team Review — PR#5 Schema-Parity Shim Followup

**Slug:** pr5-shim-followup-red-team
**Date:** 2026-06-18
**Plan under review:** `plans/260618-1418-GH-0029-pr5-shim-followup/plan.md`
**Scope:** Adversarial review of the plan addressing PR#5 unresolved Q1/Q2/Q3. Stress-test Q3 refutation, implementation completeness, test coverage, risk underestimation, and out-of-scope items.
**Method:** Static analysis + cross-reference against plan files, scout/researcher reports, source files, and existing tests. Read-only — no plan modifications.

---

## TL;DR

The plan is fundamentally sound and correctly downgrades the Q3 finding based on empirical evidence. Two researchers independently confirmed production correctness. However, the plan has **one BLOCKER-class factual inconsistency** between its own test-count claim and what is actually proposed, **one HIGH-severity implementation gap** in the e2e test (will fail on first run), and **several MEDIUM issues** ranging from a stale reference to weak assertion design.

| Severity | Count |
|----------|-------|
| BLOCKER  | 1 |
| HIGH     | 3 |
| MEDIUM   | 4 |
| LOW      | 2 |
| OK       | 2 |

**Recommendation:** Block ship until Finding #1 (BLOCKER) and Finding #2 (HIGH, MIGRATED_TOOL_NAMES gap) are resolved; address Findings #3-5 in the same pass; remaining items can be filed as follow-ups.

---

## Finding 1 — BLOCKER: Test-count claim is internally inconsistent (1070 vs actual delta)

**Severity:** BLOCKER

**Description:** Phase-03 step 3.1 (`plans/260618-1418-GH-0029-pr5-shim-followup/phase-03-test.md:36`) claims the new test file adds **7 new tests** ("1063 pass + 7 new = 1070 pass"). But phase-02 step 2.2 (`phase-02-implement.md:95-103`) enumerates only **7 tests in total** ("Test 1" through "Test 7"), and the researcher-B design (§2.3-2.6 of `researcher-B-260618-1418-e2e-parity-test-design-report.md`) contains **5 test bodies** (1 universal + 3 per-tool + 1 generic migrated-tool loop). Researcher-B's plan §6 acceptance-criteria mapping (`researcher-B-260618-1418-e2e-parity-test-design-report.md:439`) refers to "13 explicit + 9 derived via the generic migrated loop" — i.e., 2 top-level tests for the universal coverage assertions + 3 per-tool + 1 generic. Researcher-A's §3.2 (`researcher-A-260618-1418-GH-0029-pr5-shim-fix-strategies-report.md:224-257`) writes a single test body with 3 sub-assertions.

The test code never gets specified in phase-02 beyond the MIGRATED_TOOL_NAMES list (phase-02-implement.md:77-91) and a 1-line reference to researcher-B's test bodies. There is no concrete source code in phase-02 specifying 7 distinct `test(...)` calls. So the "1070 pass" figure in phase-03 is **invented** — it will not match what is actually written.

**Evidence:**
- `plans/260618-1418-GH-0029-pr5-shim-followup/phase-03-test.md:36` — claims "1070 pass / 0 fail / 1 skip"
- `plans/260618-1418-GH-0029-pr5-shim-followup/phase-02-implement.md:95-103` — enumerates "Test 1" through "Test 7" but never specifies them beyond a 1-line summary each
- `plans/reports/researcher-B-260618-1418-e2e-parity-test-design-report.md:441-449` — researcher-B's acceptance criteria are inconsistent with phase-03's claim
- `plans/reports/researcher-A-260618-1418-GH-0029-pr5-shim-fix-strategies-report.md:224-257` — researcher-A's design is 1 test with 3 sub-assertions

**Recommendation:** Either (a) collapse the test list to a single body with multiple sub-assertions (matching researcher-A's pattern) and revise phase-03's "1070" figure to "+1 test", or (b) write out the 7 distinct test bodies verbatim in phase-02 step 2.2 (currently a 1-line summary each). Without this, the success criterion in phase-03 will be a moving target and `pnpm test` verification cannot be deterministic.

---

## Finding 2 — HIGH: `MIGRATED_TOOL_NAMES` contains a tool that doesn't register (`mastra_trigger_workflow`)

**Severity:** HIGH

**Description:** The plan's MIGRATED_TOOL_NAMES list (`phase-02-implement.md:77-91`) includes `"mastra_trigger_workflow"` as a migrated tool. But researcher-B's empirical probe **already found this tool missing** from the registered set — the report explicitly notes (researcher-B §4.4: "Server startup failures ... `mastra_trigger_workflow` is currently skipped — the server logs 'registered 39 of 39' but my probe found 39 tools registered, not 41; some manifest entries may have empty `legacy.name` and get skipped"). The trigger-workflow tool manifest entry exists (`tools/learning-loop-mcp/tools/manifest.json:6`) and the legacy module exists, but it likely fails the `if (!legacy)` check in `server.js:19-22` (either missing export or empty `legacy.name`).

The plan acknowledges this gap at phase-02-implement.md:108 ("Tolerate `MIGRATED_TOOL_NAMES.length` as the minimum (not exact — `mastra_trigger_workflow` may not register)") but the test file is not specified with this tolerance — phase-02 only shows the names array, not the assertion logic. If the test writer follows the universal-coverage test in researcher-B §2.4 ("all 22 migrated tools" assertion that iterates `MIGRATED_TOOL_NAMES` and fails on missing entries), the suite will fail on first run.

**Evidence:**
- `plans/260618-1418-GH-0029-pr5-shim-followup/phase-02-implement.md:90` — lists `"mastra_trigger_workflow"`
- `plans/260618-1418-GH-0029-pr5-shim-followup/phase-02-implement.md:108` — acknowledges may-not-register but does NOT specify test tolerance
- `plans/reports/researcher-B-260618-1418-e2e-parity-test-design-report.md:397,504` — explicitly identifies this tool as missing
- `tools/learning-loop-mastra/server.js:19-22` — the `if (!legacy)` skip path
- `tools/learning-loop-mcp/tools/manifest.json:6` — manifest entry exists

**Recommendation:** Either (a) explicitly omit `mastra_trigger_workflow` from MIGRATED_TOOL_NAMES since it's known not to register (and note the omission in plan.md as intentional), or (b) write the test file with a documented "missing migrated tool" tolerance that warns but does not fail. The current plan leaves the test-writer to guess. Bonus: the underlying bug (trigger-workflow-tool not loading) deserves a follow-up finding of its own.

---

## Finding 3 — HIGH: e2e test `assert.deepEqual` on the per-tool parity test is over-specified and brittle

**Severity:** HIGH

**Description:** Phase-02 step 2.2 calls out only 7 test bodies by name but does not specify their assertion logic. If the implementer follows researcher-B's §2.5-2.6 design verbatim, the load-bearing test for `meta_state_sweep.apply` (researcher-B §3.1) would assert that `t.inputSchema.properties.apply` equals `{type:"boolean", default:false, description:"..."}` — but the live probe output (`plans/260618-1418-GH-0029-pr5-shim-followup/e2e-tools-list-output.json:30-46`) shows the actual schema includes `$schema`, `additionalProperties:false` and a description string. A `assert.deepEqual` would fail because the description text is non-deterministic (changes when code is edited) and `additionalProperties:false` is added by `JSON_SCHEMA_LIBRARY_OPTIONS.override` post-processing — not by the shim.

The plan should specify which assertions are "shape-only" (type + items + default) vs "byte-equal". Researcher-B's design (`researcher-B §2.4:166-188`) does this correctly for the universal coverage test (uses `assert.notDeepEqual` for the bypass sentinel + `assert.strictEqual` for type + `assert.ok` for properties map), but the per-tool tests (§2.5) use `assert.strictEqual` on the type field only — that's correct. However, neither researcher-B nor phase-02 explicitly forbids a `deepEqual` test that would fail on any description-string change.

**Evidence:**
- `plans/260618-1418-GH-0029-pr5-shim-followup/phase-02-implement.md:95-103` — only test names listed, assertion logic absent
- `plans/reports/researcher-B-260618-1418-e2e-parity-test-design-report.md:196-247` — example assertions use `strictEqual` on type/default (correct)
- `plans/260618-1418-GH-0029-pr5-shim-followup/e2e-tools-list-output.json:36-46` — actual `apply` schema has `description` and `additionalProperties:false`
- `docs/mcp-tool-schema-architecture.md:18,218-220` — doc states "the override DOES propagate" but acknowledges MCP clients see additional processing

**Recommendation:** Specify in phase-02 step 2.2 that the per-tool tests assert **shape only** (type, items, enum, default) — never `deepEqual` against a hard-coded object. The implementer should follow researcher-B §2.5's pattern (single-field `strictEqual` per assertion). The `additionalProperties:false` and `$schema` keys come from `@mastra/schema-compat`'s post-processing and are not the shim's responsibility.

---

## Finding 4 — HIGH: Q3 refutation rests on 95% confidence but plan downgrades to "REFUTED" without preserving the uncertainty

**Severity:** HIGH

**Description:** Researcher-A reports the e2e probe found all 39 tools return correct schemas with 95% confidence (`researcher-A-260618-1418-GH-0029-pr5-shim-fix-strategies-report.md:296`). The reconciliation between the synthetic probe (which DOES return `{"$ref":"#"}`) and the production e2e probe (which returns real schemas) is **not fully diagnosed** — researcher-A §1.3 and §4 list 2 plausible hypotheses (`ctx` shape differences / `seen` state in finalize) but explicitly state "I do not need to explain why the isolated test failed — only confirm production is correct, which it is" (`researcher-A §1.3:63`).

The plan correctly downgrades Q3 from "PARTIAL" to "REFUTED" but the proposed doc update at phase-02 step 2.3 (`phase-02-implement.md:118-144`) **removes** the "synthetic probe result is a zod 4.4.3 quirk" explanation that was in researcher-A §1.3 — instead replacing it with a confident explanation that "Real migration schemas use `z.object` as their root, not `z.preprocess` directly — the override propagates correctly when the root is a simple object that happens to have preprocess-wrapped fields" (researcher-A §4:294). This is a **plausible but unproven hypothesis** being promoted to a confident explanation.

The synthetic probe's `{"$ref":"#"}` result is reproducible (`scouts-260618-1336-GH-0029-pr5-unresolved-questions-report.md:182-188`). If a future zod 4.4.x patch causes the production e2e probe to also return `{"$ref":"#"}` for nested objects, the plan's doc will be wrong (it claims the path always works).

**Evidence:**
- `plans/260618-1418-GH-0029-pr5-shim-followup/phase-02-implement.md:118-144` — proposed doc replacement text
- `plans/reports/researcher-A-260618-1418-GH-0029-pr5-shim-fix-strategies-report.md:296,314-315` — 95% confidence + unresolved synthetic-probe question
- `plans/reports/researcher-B-260618-1418-e2e-parity-test-design-report.md:51` — also says "the path may differ from the synthetic probe's direct-call pattern" without resolving
- `docs/mcp-tool-schema-architecture.md:18,210-220` — current doc's honest framing of the open question

**Recommendation:** Either (a) keep the "unresolved" framing in the doc replacement text — describe the empirical refutation AND preserve the "synthetic probe still returns `{"$ref":"#"}` for synthetic schemas" caveat as a known zod 4.4.3 quirk that does not affect production but is not fully diagnosed, or (b) ship the new e2e test first and let it run for a few weeks to accumulate evidence before downgrading the doc's confidence language. The current plan overclaims certainty.

---

## Finding 5 — HIGH: `tools/list returns N tools` test conflicts with existing `mcp-protocol-e2e.test.cjs` (count claim "39 of 41" vs existing test expecting `MANIFEST.length`)

**Severity:** HIGH

**Description:** Researcher-B's design (`researcher-B §4.4:391-397`) reports that 39 of 41 manifest tools register (2 intentionally skipped including `mastra_trigger_workflow`). Phase-02 step 2.2 test #1 (`phase-02-implement.md:96`) says: "Test 1: 'tools/list returns one tool per manifest entry' — count check". But the existing `tools/learning-loop-mastra/__tests__/mcp-protocol-e2e.test.cjs:47,65-69` already asserts `result.tools.length === TOOL_COUNT` where `TOOL_COUNT = MANIFEST.length` (= 41). The existing test must currently pass (otherwise PR#5 would have CI failures), which means `MANIFEST.length` tools DO register — the "39 of 41" claim from researcher-B is **contradicted by the existing test**.

The plan does not reconcile this contradiction. If the new test follows researcher-B's pattern (`assert.ok(tools.length >= MIGRATED_TOOL_NAMES.length)`), it will pass and match the existing test. If it follows phase-02's summary ("one tool per manifest entry"), it will assert `tools.length === MANIFEST.length` and pass — also fine. But the plan doesn't specify which.

**Evidence:**
- `plans/260618-1418-GH-0029-pr5-shim-followup/phase-02-implement.md:96-98` — vague "count check" description
- `plans/reports/researcher-B-260618-1418-e2e-parity-test-design-report.md:391-397,439` — "39 registered of 41 manifest entries" claim
- `tools/learning-loop-mastra/__tests__/mcp-protocol-e2e.test.cjs:47,61-69` — existing `TOOL_COUNT === MANIFEST.length` assertion (passes in CI)
- `tools/learning-loop-mastra/server.js:32` — logs `registered N of M tools`

**Recommendation:** The plan must specify which count the new test asserts. Recommended: drop Test 1 entirely (the existing `mcp-protocol-e2e.test.cjs:61-93` already covers count + names + descriptions + inputSchema-is-object). The new file's purpose is **parity shape verification** for the migration-touched tools, not count verification. Adding a duplicate count test is YAGNI.

---

## Finding 6 — MEDIUM: Phase-02 references `__tests__/with-mcp-server.js` helper but uses ESM import in a `.test.js` file (consistency check missing)

**Severity:** MEDIUM

**Description:** Phase-02 step 2.2 (`phase-02-implement.md:62-67`) writes the test file in ESM with `import { withMcpServer } from "./with-mcp-server.js"`. The existing `with-mcp-server.js` (lines 1, 56-68) IS ESM (uses `import.meta.url` and dynamic imports of `@modelcontextprotocol/sdk/client/index.js`). The `pnpm test` glob (`package.json:17`) matches both `*.test.js` and `*.test.cjs`. So the new `.test.js` file is consistent with the helper.

However, the existing `mcp-protocol-e2e.test.cjs` is CJS (uses `require("node:test")`) and inlines its own server-spawn logic — it does NOT use `withMcpServer()`. The plan says the new test "uses `with-mcp-server.js` helper" (researcher-B §2.1-2.3 and phase-02:67) but the existing e2e test inlined the spawn logic. The plan should explicitly choose: use the helper (cleaner) or inline the spawn (matches existing pattern). Either is fine but the choice has consequences:
- Using the helper: cleaner test code, but spawns a 2nd server per test run (slower)
- Inlining: matches existing pattern, allows shared server across tests, but more boilerplate

**Evidence:**
- `plans/260618-1418-GH-0029-pr5-shim-followup/phase-02-implement.md:62-67` — uses ESM `import { withMcpServer }`
- `tools/learning-loop-mastra/__tests__/with-mcp-server.js:1-128` — IS ESM, helper exists
- `tools/learning-loop-mastra/__tests__/mcp-protocol-e2e.test.cjs:18-43` — CJS inlines its own `spawnServer()`
- `tools/learning-loop-mastra/__tests__/connect-mcp-server-mutex.test.js:8` — uses `connectMcpServer` (not `withMcpServer`)
- `package.json:17` — glob matches both `.test.js` and `.test.cjs`

**Recommendation:** Use the helper (`withMcpServer`) as planned, but cache the `tools` array in `before()` (researcher-B §2.3 already does this). Total spawn cost: ~400ms for 1 server. Note this in phase-02 step 2.2 explicitly.

---

## Finding 7 — MEDIUM: Plan.md:11 (referenced by plan.md:62) and `plans/260618-0029-coerce-layer-zod-native-migration/plan.md:11` reference missing file — but plan files this as "out of scope"

**Severity:** MEDIUM

**Description:** The scout report (`scouts-260618-1336-GH-0029-pr5-unresolved-questions-report.md:239-245`) flagged that `research-260618-0031-zod-impact-analysis.md` is missing — confirmed by `ls /home/datguy/codingProjects/learning-loop-template/plans/reports/` (the file does not exist; only the sibling `general-purpose-260618-0032-test-migration-parity-harness-report.md` exists). The reference lives at `plans/260618-0029-coerce-layer-zod-native-migration/plan.md:11` ("plans/reports/research-260618-0031-zod-impact-analysis.md (Researcher 1)").

Plan.md:79 of the new plan explicitly excludes this as "out of scope; separate doc-cleanup." But this reference is **load-bearing for Q1's verdict** — researcher-A and the new plan both cite Researcher 1's trivial-case test as the foundation for the Q1 conclusion. If the file is missing because it was never written (vs. deleted), the Q1 verdict has weaker evidence than claimed. The scout report's Finding #5 (`scouts-260618-1336-GH-0029-pr5-unresolved-questions-report.md:239-245`) explicitly says: "If the file is missing intentionally, the plan should remove the reference. If accidentally, the team should restore it or rewrite the question."

The new plan sidesteps this by listing it as out of scope. That's defensible but the doc cleanup needs to happen **before** the new plan's doc update lands — otherwise the future agent reading both docs will see a dangling reference.

**Evidence:**
- `plans/reports/` — file `research-260618-0031-zod-impact-analysis.md` does NOT exist (only the sibling `general-purpose-260618-0032-...` does)
- `plans/260618-0029-coerce-layer-zod-native-migration/plan.md:11` — references the missing file as "Researcher 1"
- `plans/260618-1418-GH-0029-pr5-shim-followup/plan.md:79` — explicitly out of scope
- `plans/reports/scouts-260618-1336-GH-0029-pr5-unresolved-questions-report.md:239-245` — scout flagged this

**Recommendation:** Either (a) file a separate plan to remove the dangling reference from `plans/260618-0029-coerce-layer-zod-native-migration/plan.md:11` (cheap, 1 line), or (b) include that as Step 2.7 in phase-02 (recommended — it's a 1-line edit and removes a doc inconsistency that confuses future agents). Should be done in the same plan since the new plan updates the surrounding doc context.

---

## Finding 8 — MEDIUM: `coerce-correctness.test.js` already covers the parity contract at zod-API level — plan should justify why both tests are needed (DRY)

**Severity:** MEDIUM

**Description:** The existing `tools/learning-loop-mastra/__tests__/coerce-correctness.test.js:89-189` has 7 tests that lock the shim's behavior using `z.toJSONSchema` directly. The new e2e test would assert the same parity via the MCP `tools/list` path. Plan.md:77 (Out of Scope) says "Replacing `coerce-correctness.test.js` (YAGNI — both tests serve different surfaces)" — but the DRY principle demands justification: what does the e2e test catch that the unit test doesn't, and vice versa?

The distinction is real (e2e tests the Mastra SDK path; unit tests the shim directly), but plan.md doesn't articulate it. A future maintainer reading both files may consolidate or delete one, breaking the regression net.

**Evidence:**
- `tools/learning-loop-mastra/__tests__/coerce-correctness.test.js:89-189` — 7 parity tests at zod-API level
- `plans/260618-1418-GH-0029-pr5-shim-followup/plan.md:77` — "Replacing coerce-correctness.test.js (YAGNI)" out-of-scope justification
- `plans/260618-1418-GH-0029-pr5-shim-followup/plan.md:96` — risk section calls the new test a "regression net"

**Recommendation:** Add a 1-paragraph "test layering rationale" to the new test file's header comment: "Unit tests in `coerce-correctness.test.js` lock the shim's transformation logic at the zod API level (cheap, fast, exhaustive across 7 migration cases). This e2e test locks the full path through Mastra's `MCPServer.convertSchema` → `standardSchemaToJSONSchema` (expensive, slow, catches SDK regressions the unit test can't see). Both layers are needed because they catch different classes of regressions."

---

## Finding 9 — MEDIUM: The proposed e2e test (`MIGRATED_TOOL_NAMES`) includes tools that don't use migration wrappers — false positive on regression detection

**Severity:** MEDIUM

**Description:** `MIGRATED_TOOL_NAMES` (`phase-02-implement.md:77-91`) includes 13 tools. Of those, **only some** use the migration's `z.preprocess` / `z.union([bool,string]).transform` wrappers. The others (e.g., `mastra_meta_state_log_change`, `mastra_meta_state_resolve` for non-cascade_from fields) use plain zod primitives and pass through the shim unchanged (`schema-parity.js:110` passthrough branch).

Per `docs/mcp-tool-schema-architecture.md:386-388`: "Tools that use plain zod primitives... still go through `createLoopTool` and `attachParityJSONSchema`. The shim is a no-op for them (passthrough). Their inputSchemas should still be real JSON Schema objects." So testing them in MIGRATED_TOOL_NAMES adds no signal — they'd pass even if the shim were completely broken (as long as `MCPServer.convertSchema` returns real JSON Schema for plain zod).

A regression in the shim's pipe-collapse branch (line 26-37) would only fail the load-bearing assertions for tools that **actually use** the migration wrappers. Listing tools in MIGRATED_TOOL_NAMES without identifying which fields use the wrappers dilutes the regression signal.

**Evidence:**
- `plans/260618-1418-GH-0029-pr5-shim-followup/phase-02-implement.md:77-91` — 13 tools listed as "migrated"
- `docs/mcp-tool-schema-architecture.md:386-388` — passthrough behavior for plain zod
- `tools/learning-loop-mastra/schema-parity.js:110` — passthrough branch
- `tools/learning-loop-mastra/__tests__/coerce-correctness.test.js:105-189` — only 7 cases actually exercise the shim

**Recommendation:** Either (a) rename the list from `MIGRATED_TOOL_NAMES` to `REGISTERED_TOOL_NAMES` (honest about coverage) and add comments noting which fields use wrappers, or (b) trim the list to only tools whose fields actually exercise the shim (per the doc's §2.3 case coverage table). The current 13-item list mixes the two purposes and will give a false sense of comprehensive coverage.

---

## Finding 10 — LOW: `.ckignore` revert comment doesn't explain WHY `!node_modules` is safe to remove

**Severity:** LOW

**Description:** Phase-02 step 2.6 (`phase-02-implement.md:197-217`) removes `!node_modules` from `.ckignore` after "research bypass, no longer needed after plan ships." The reasoning is correct (research is done; no future research needs it) but the replacement file content loses the rationale comment. If a future agent needs to re-enable the bypass, they have no documented reason for why it existed or when to re-add it.

The original `.ckignore` (lines 7-8, as observed via cat) has a comment explaining "needed for PR#5 unresolved-questions research (zod internal API + Mastra SDK)". That comment is dropped.

**Evidence:**
- `plans/260618-1418-GH-0029-pr5-shim-followup/phase-02-implement.md:197-217` — proposed `.ckignore` content
- `cat /home/datguy/codingProjects/learning-loop-template/.claude/.ckignore` (current) — has rationale comment

**Recommendation:** Keep the rationale comment in the post-revert `.ckignore`. e.g., `# !node_modules removed 2026-06-18 (PR#5 research complete — see plan 260618-1418-GH-0029-pr5-shim-followup)`. Zero-cost, prevents future re-invention.

---

## Finding 11 — LOW: Phase-02 step 2.5 SP2 change-log entry's `change_dimension` is "surface" — but this is mechanical (adding a registry entry), not a surface change

**Severity:** LOW

**Description:** Phase-02 step 2.5 (`phase-02-implement.md:182-193`) calls `meta_state_log_change` with `change_dimension: "surface"`. The schema enum per the tool's description is `semantic | mechanical | surface`. Adding a SP2 fingerprint entry is closer to a **registry** (mechanical) change than a surface change. Surface changes imply new interfaces/contracts; this is just adding tracking coverage to an existing file.

Minor inconsistency; the change-log will still be valid but a future reader will have to re-derive intent.

**Evidence:**
- `plans/260618-1418-GH-0029-pr5-shim-followup/phase-02-implement.md:188-191` — `change_dimension: "surface"`
- Meta-state schema description (from tool def): `change_dimension: semantic | mechanical | surface`

**Recommendation:** Change to `change_dimension: "mechanical"`. Or drop the field and let the system apply its default.

---

## Finding 12 — OK: Q3 refutation is well-supported by independent verification

**Severity:** OK

**Description:** Both researchers independently confirm Q3 is refuted: researcher-A's e2e probe (`researcher-A §1.2:34-54`) and researcher-B's aggregate probe (`researcher-B §1:26-49`) both show 39 of 39 (or 39 of 41) tools return real JSON Schemas via `tools/list`. The reconciliation between synthetic probe (`{"$ref":"#"}`) and production e2e (real schemas) is plausible (`researcher-A §4:289-294`: different `ctx` shapes, different `seen` state, real schemas use `z.object` root). The plan correctly downgrades Q3 from "PARTIAL" to "REFUTED".

**Evidence:**
- `plans/reports/researcher-A-260618-1418-GH-0029-pr5-shim-fix-strategies-report.md:34-54` — empirical confirmation
- `plans/reports/researcher-B-260618-1418-e2e-parity-test-design-report.md:23-49` — independent confirmation
- `plans/260618-1418-GH-0029-pr5-shim-followup/plan.md:19,43-44` — plan verdict

**Recommendation:** No action — this is the correct call. The plan handles the empirical evidence well.

---

## Finding 13 — OK: 3 fix strategies correctly evaluated and dismissed

**Severity:** OK

**Description:** The plan correctly evaluates and dismisses the 3 fix strategies from the scout report:
- Strategy A (`jsonSchema()` helper from `@mastra/core/utils`) — researcher-A verified the helper does NOT exist (`researcher-A §2.1:81-119`, full `utils.d.ts` read). Correctly dismissed.
- Strategy B (`toStandardSchema` wrap) — researcher-A verified it's a no-op refactor (`researcher-A §2.2:121-164`). Correctly dismissed.
- Strategy C (pin zod 4.4.x) — researcher-A verified zod 4.5.0 doesn't exist and the project already pins 4.4.3 (`researcher-A §2.3:166-188`, `package.json:48` = `"zod": "4.4.3"`). Correctly dismissed as already-done.

**Evidence:**
- `plans/reports/researcher-A-260618-1418-GH-0029-pr5-shim-fix-strategies-report.md:74-188`
- `plans/260618-1418-GH-0029-pr5-shim-followup/plan.md:52-55`
- `package.json:48`

**Recommendation:** No action — the evaluation is rigorous and the dismissal is well-justified.

---

## Cross-cutting concerns

### Risks not addressed by the plan

1. **Re-test on every zod minor upgrade is documented in the doc but not in the plan's acceptance criteria.** `docs/mcp-tool-schema-architecture.md:251-254` recommends "Re-run `pnpm test` on every zod minor upgrade" but the plan does not include this in its success criteria. The e2e test is exactly the regression net that would catch this, but if it's only run as part of `pnpm test`, a zod upgrade that breaks both unit and e2e tests would surface — so this is implicitly covered.

2. **The plan does not address what happens if the synthetic-probe `{"$ref":"#"}` quirk re-manifests in production.** If a future zod 4.4.x patch breaks the e2e probe (returns `{"$ref":"#"}` for nested objects), the new test will catch it — that's its job. But the plan's doc update (`phase-02-implement.md:118-144`) replaces the cautious "we don't know" framing with a confident "this works" framing, leaving no escape hatch.

3. **No CI integration check.** Phase-03 step 3.1 runs `pnpm test` locally but doesn't verify CI will pick up the new test file. The glob matches `*.test.js` so it should be fine, but the existing `mcp-protocol-e2e.test.cjs` uses `*.test.cjs` (different extension). If a CI runner's glob differs from `package.json:17`, the new file could be silently skipped.

### Documentation churn risk

The plan updates 4 docs (`docs/mcp-tool-schema-architecture.md`, scout report, plan.md addendum, commit message). The changes are correct in spirit but the over-confidence in the doc replacement (Finding #4) is a real risk for future readers.

---

## Summary table

| # | Severity | Finding | Recommendation |
|---|----------|---------|----------------|
| 1 | BLOCKER | "1070 tests" count claim is invented; not grounded in specified test bodies | Either specify 7 distinct tests in phase-02 or collapse to 1 body and update count |
| 2 | HIGH | `mastra_trigger_workflow` in MIGRATED_TOOL_NAMES but doesn't register | Drop from list OR specify test tolerance |
| 3 | HIGH | Per-tool assertions not specified — risk of `deepEqual` brittleness | Specify shape-only assertions in phase-02 step 2.2 |
| 4 | HIGH | Doc replacement over-claims Q3 refutation certainty | Keep "known zod quirk, not fully diagnosed" caveat |
| 5 | HIGH | Count-test conflicts with existing `mcp-protocol-e2e.test.cjs` | Drop Test 1 (already covered) |
| 6 | MEDIUM | ESM vs CJS test convention not explicit | Use helper, note in phase-02 |
| 7 | MEDIUM | Missing `research-260618-0031-zod-impact-analysis.md` reference left dangling | Add Step 2.7 to remove 1-line dangling ref |
| 8 | MEDIUM | No justification for keeping both unit and e2e parity tests | Add 1-paragraph layering rationale to test header |
| 9 | MEDIUM | MIGRATED_TOOL_NAMES mixes wrapper-using and passthrough tools | Rename list or trim to wrapper-using tools |
| 10 | LOW | `.ckignore` rationale comment dropped | Keep dated removal comment |
| 11 | LOW | `change_dimension: "surface"` should be "mechanical" | Update field |
| 12 | OK | Q3 refutation is well-supported | No action |
| 13 | OK | 3 fix strategies correctly evaluated | No action |

---

## Recommendations to planner

**Must fix before ship (BLOCKER + HIGH):**
1. Reconcile test-count claim in phase-03 with actual phase-02 specification (Finding #1)
2. Remove `mastra_trigger_workflow` from MIGRATED_TOOL_NAMES or document tolerance (Finding #2)
3. Specify assertion shape in phase-02 step 2.2 (Finding #3)
4. Soften doc replacement confidence language (Finding #4)
5. Drop redundant count test (Finding #5)

**Should fix in same pass (MEDIUM):**
6. Add 1-line ref removal to plan.md:11 of predecessor plan (Finding #7)
7. Add layering rationale comment to new test file (Finding #8)
8. Rename or trim MIGRATED_TOOL_NAMES (Finding #9)

**Optional polish (LOW):**
9. Keep `.ckignore` rationale comment (Finding #10)
10. Fix `change_dimension` to "mechanical" (Finding #11)

---

## File:line index

| File | Purpose |
|------|---------|
| `plans/260618-1418-GH-0029-pr5-shim-followup/plan.md` | Plan under review |
| `plans/260618-1418-GH-0029-pr5-shim-followup/phase-01-research.md` | Phase 1 (research) |
| `plans/260618-1418-GH-0029-pr5-shim-followup/phase-02-implement.md` | Phase 2 (implement) — 6 steps |
| `plans/260618-1418-GH-0029-pr5-shim-followup/phase-03-test.md` | Phase 3 (test + verify) — 6 steps |
| `plans/reports/scouts-260618-1336-GH-0029-pr5-unresolved-questions-report.md` | Original scout (Q1/Q2/Q3) |
| `plans/reports/researcher-A-260618-1418-GH-0029-pr5-shim-fix-strategies-report.md` | Q3 refutation + 3-strategy analysis |
| `plans/reports/researcher-B-260618-1418-e2e-parity-test-design-report.md` | E2E test design |
| `tools/learning-loop-mastra/create-loop-tool.js:35-37` | Misleading comment (target of fix) |
| `tools/learning-loop-mastra/schema-parity.js:15-125` | Shim source |
| `tools/learning-loop-mastra/__tests__/coerce-correctness.test.js:89-189` | Existing 7 parity tests |
| `tools/learning-loop-mastra/__tests__/with-mcp-server.js:117-128` | Test helper |
| `tools/learning-loop-mastra/__tests__/mcp-protocol-e2e.test.cjs:47,61-93` | Existing count test (conflicts w/ Finding #5) |
| `tools/learning-loop-mastra/tools/manifest.json:1-41` | Tool manifest (41 entries) |
| `tools/learning-loop-mastra/server.js:13-43` | Server entry, registration loop |
| `tools/learning-loop-mcp/tools/manifest.json:6` | trigger-workflow entry (may not register) |
| `docs/mcp-tool-schema-architecture.md:18,210-220` | Current doc's Q3 framing |
| `plans/260618-0029-coerce-layer-zod-native-migration/plan.md:11` | Missing-file reference |
| `.claude/.ckignore` | Current file (has rationale comment) |
| `package.json:17` | Test glob |
| `package.json:48` | zod pin (4.4.3) |

---

## Status: DONE_WITH_CONCERNS

**Summary:** The plan is fundamentally sound (Q3 refutation is well-supported; fix-strategy dismissal is rigorous; overall approach is conservative). However, **one BLOCKER (invented test-count claim) and three HIGH findings (test tolerance for `mastra_trigger_workflow`, unspecified assertion shape, over-confident doc rewrite, redundant count test) need resolution before ship**. The remaining MEDIUM/LOW items are polish. Recommend: planner addresses BLOCKER + 3 HIGHs in a revised phase-02/phase-03 before implementation begins.

**Concerns:** The test specification gap (phase-02 step 2.2 enumerates 7 tests by name but provides no assertion logic) is the root cause of multiple findings (#1, #3, #5, #9). A single targeted edit specifying the test bodies verbatim would resolve 4 of the 13 findings at once.

**Unresolved questions:**
- None blocking ship — the Q3 refutation is empirically grounded and the dismissal of fix strategies is rigorous. The 13 findings above are about plan/process quality, not about whether the underlying shim works correctly.
