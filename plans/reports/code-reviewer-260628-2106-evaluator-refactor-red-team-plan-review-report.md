# Red-Team Plan Review — Phase E Evaluator Refactor

**Plan under review:** `plans/260628-2008-phase-e-evaluator-refactor/plan.md` + 4 phase files
**Review date:** 2026-06-28
**Reviewer posture:** Hostile / assume bugs / assume scope drift / verify every claim against source.

---

## Code Review Summary

### Scope

- Files reviewed: `plan.md`, `phase-01-evaluators.md`, `phase-02-tddtests.md`, `phase-03-hookadaptersandmcptool.md`, `phase-04-manifestandverification.md`.
- Cross-referenced source:
  - `tools/learning-loop-mastra/hooks/legacy/{write-gate,bash-gate,inbound-gate}.js`
  - `tools/learning-loop-mastra/core/gate-logic.js`
  - `tools/learning-loop-mastra/core/inbound-state.js`
  - `tools/learning-loop-mastra/tools/legacy/gate-tool.js`
  - `tools/learning-loop-mastra/hooks/legacy/lib/protocol-adapter.js`
  - `tools/learning-loop-mastra/core/placement.yaml`
  - `tools/learning-loop-mastra/docs/placement.md`
  - `tools/learning-loop-mastra/__tests__/phase-e-foundation/{placement-manifest,fcis-invariant}.test.js`
  - `tools/learning-loop-mastra/__tests__/legacy-mcp/bash-gate-decision-visibility.test.js`
  - `tools/learning-loop-mastra/.fallowrc.json`
- Scout findings (independent verification):
  - `gate-logic.js:26` does a synchronous `readFileSync(join(__dirname, "patterns.json"))` at module load. Any evaluator importing `gate-logic.js` will trigger a synchronous file read at import time.
  - `bash-gate.js:118,143` use `formatHookDecision(decision, { channel: "hookSpecificOutput" })` (envelope shape), but `write-gate.js` uses `formatOutput(decision)` (raw JSON). The plan's Phase 3 template (lines 52-55) shows `formatOutput` for **all** hooks — wrong for bash-gate.
  - `__tests__/legacy-mcp/` directory exists (confirmed via listing) — the snapshot test path is correct.
  - `gate-tool.js:64` writes a `console.error("gate: ...")` line and an `appendGateLog(...)` call AFTER the decision is computed — both I/O side effects the refactor must replicate or risk snapshot drift on stdout/error capture.
  - `entry/rule.js:2` already imports from `gate-logic.js` (the helper role already does this); not a layering violation today because `helper` is `null` (unrestricted).
  - `inbound-state.js` (the file imported by bash-gate for `checkObservationStaleness`) is itself `role: facade` (placement.yaml:17) and calls `readFileSync` on the sidecar. A v1 evaluator that imports `checkObservationStaleness` would be importing a facade — Path B's loosened invariant would also need to cover `inbound-state.js`, not just `gate-logic.js`. The plan only mentions `gate-logic.js`.

### Overall Assessment

The plan is **broadly well-structured** but contains **wire-protocol bugs** (all in Phase 3's hook template + Phase 3's gate-tool refactor), **a correctness regression** in how `evaluateWriteGate` will handle the `product/**` preflight check (the current hook combines surface inference + marker read + checklist rendering into one inline cascade — the plan's evaluator signature `evaluatePreflight({ filePath, root })` does not make this easier, it makes it harder), and **one undisclosed layering cost** in Path B (Path B does not address `inbound-state.js`, which the bash-gate evaluator must also import).

The layering-tension question is real, and the plan's framing is fair: both Path A and Path B have non-trivial risks. **The default (Path B) is acceptable** for this refactor's scope, but the plan understates one of its costs.

---

### Critical Issues

#### C1 — Phase 3 hook template loses bash-gate `hookSpecificOutput` envelope (wire-protocol break)

**Plan location:** `phase-03-hookadaptersandmcptool.md` lines 23-59 (universal hook template) + `phase-03-...md` line 53: `console.log(formatOutput(decision))`.

**Evidence:** `tools/learning-loop-mastra/hooks/legacy/bash-gate.js:118,143` uses `formatHookDecision(decision, { channel: "hookSpecificOutput" })` — which wraps the decision as `{ hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: JSON.stringify(decision) } }`. The existing test `__tests__/legacy-mcp/bash-gate-decision-visibility.test.js:51-55` asserts `parsed.hookSpecificOutput.hookEventName === "PreToolUse"` and parses `additionalContext` for the decision.

**Impact:** If the refactor replaces this with `formatOutput(decision)` (raw JSON), the bash-gate-decision-visibility test will fail on the first block/escalate decision. This breaks **2 of the 1308 baseline tests** and breaks the runtime contract for PreToolUse visibility (the runtime expects the `hookSpecificOutput` envelope to surface the decision back to the model). The snapshot test described in Phase 3 Step 1 will catch this — but only after the test is written. Better to fix the template up front.

**Fix:** The hook template must be parameterized by `formatter` per hook, OR each hook selects its own formatter inside `main()`. Concrete:

```js
// bash-gate.js main()
if (decision.decision !== "ok") {
  console.log(formatHookDecision(decision, { channel: "hookSpecificOutput" }));
}
// write-gate.js main() (unchanged)
console.log(formatOutput(decision));
```

#### C2 — Phase 3 `gate_check` snapshot cannot capture stdout/error parity without specifying capture scope

**Plan location:** `phase-03-hookadaptersandmcptool.md` Step 1 (capture pre-refactor snapshot) + Step 6 (run snapshot test). Also: `plan.md` R3 "snapshot must capture only the `return` value, not the log."

**Evidence:** `tools/legacy/gate-tool.js:64` calls `console.error("gate: <log>")` and lines 66-74 call `appendGateLog(...)` (writing to `.gate-decision.log`). Neither is part of the MCP `return` value (which is `JSON.stringify(decision)` inside `{ content: [{ type: "text", text }] }`). If the snapshot test re-reads `.gate-decision.log` or stderr after each invocation, the refactor would need to either (a) preserve those calls bit-for-bit, or (b) re-test with a different fixture. The plan does not say which it is.

**Impact:** Ambiguity about what the snapshot test compares against. A literal reading of the plan ("byte-identical JSON") implies only the `return` value — but a strict reading of the existing gate-tool means the log lines and stderr would also need matching timestamps or count semantics, which is fragile.

**Fix:** Lock the snapshot to `JSON.stringify(result)` only (the `return` value). Add a separate assertion in the snapshot test: "stderr and `.gate-decision.log` are non-empty for non-ok decisions" (without asserting exact bytes). Document in Phase 3 Step 1 that the snapshot artifact is `{fixture_id, input, expected_return_json_string}` — three fields only.

#### C3 — `gate-logic.js` is NOT pure at module level — the plan's "zero I/O at module level" claim contradicts reality

**Plan location:** `plan.md` R2.1 + `phase-02-...md` Decision table: "Module-level I/O policy: I/O OK inside composed primitives ... no I/O at evaluator module level."

**Evidence:** `core/gate-logic.js:26` — `const PATTERNS_RAW = JSON.parse(readFileSync(join(__dirname, "patterns.json"), "utf8"));`. This is a synchronous file read at **module-load time**. Any module that imports anything from `gate-logic.js` (including the new evaluators under Path B) will trigger this read.

**Impact:**
- Phase 1's evaluator tests (`evaluate-write-gate.test.js`, `evaluate-bash-gate.test.js`, `evaluate-inbound-gate.test.js`) cannot be "pure" if they import from `gate-logic.js` — they will execute a file read on `import`. Phase 1 Step 3-5 explicitly forbids "no `node:fs`" in tests but the transitive import violates that. Tests that pass `tmpdir()`-based fixtures for `meta-state.jsonl` will still hit the real `patterns.json` from `core/`. This is OK (the patterns file is read-only and small), but it means the claim "tests are pure" is technically false.
- More importantly: any future change to `gate-logic.js` (e.g., adding `readRegistry(...)` at module level for some reason) silently changes evaluator import-time behavior.

**Fix:** Either (a) explicitly document the I/O at module load (and accept that "pure" means "no I/O in the function body but I/O at import"), or (b) move the `patterns.json` read into a lazy initializer inside the functions that need it (e.g., `getPatterns()`), so evaluators that don't touch constraint patterns don't pay the cost. Option (b) is the architecturally cleaner choice and is consistent with how `promotedRulesCache` is already lazily populated (gate-logic.js:590).

#### C4 — `evaluateWriteGate` Phase 1 signature cannot express the `product/**` preflight cascade cleanly

**Plan location:** `plan.md` lines 84-99 + `phase-01-evaluators.md` Step 3 (case c-e: preflight marker reads).

**Evidence:** Current hook (write-gate.js:142-172) iterates `[".claude", ".factory"]` and reads `.loop-preflight-<surface>` from each. The plan's signature `evaluateWriteGate({ filePath, root })` hides this iteration inside the function — which is fine — but the plan's **separate** `evaluatePreflight({ filePath, root })` seam is a named export intended to be the entry point for the preflight check, not a sub-helper.

**Issue:** If `evaluateWriteGate` calls `evaluatePreflight` for `product/**` paths, the test suite must test both via the outer entry point AND the inner seam, with the seam returning either `{ decision: "ok" }` or `{ decision: "block", surface, preflight_checklist }`. The current `phase-01-evaluators.md` Step 3 lists both (d) "product/** with no marker → block + checklist" via `evaluateWriteGate` AND (h) "evaluatePreflight seam direct test" — these are tests of the same code path. The duplication is harmless but indicates the seam exists for **future** relaxation, not current logic.

**Impact:** Low risk of bugs; medium risk of test duplication and seam misuse. The plan's "no I/O at evaluator module level" rule (R2.1) means `evaluatePreflight` will need to call `readPreflightMarker` (which does `readFileSync`) — so the function-body purity is broken. This is consistent with the rest of the design but means the seam is not as clean as advertised.

**Fix:** Either (a) accept that `evaluatePreflight` does I/O inside the function body (already implied by R2.2's decision) and remove the "pure at function level" wording from Phase 1 / Phase 2 success criteria, or (b) parameterize `evaluatePreflight` to take a `markerReader` injected fn. Option (a) matches existing pattern; option (b) is over-engineering for v1.

#### C5 — Phase 3 leaves `inbound-gate`'s `writeOperatorMessageMarker` I/O in the hook, but the seam is undocumented

**Plan location:** `phase-03-hookadaptersandmcptool.md` Step 4: "The `writeOperatorMessageMarker` I/O stays in the hook (it's an I/O side effect)."

**Issue:** The function writes to BOTH `.claude/coordination/.last-operator-message` AND `.factory/coordination/.last-operator-message`. This is a cross-surface write. If the hook is the orchestrator (it is — it calls `evaluateInboundGate` and then `writeOperatorMessageMarker` based on the decision), the hook needs the stale observations list to pass back to `writeOperatorMessageMarker`. But the current `writeOperatorMessageMarker` signature is `(root, prompt)` — it doesn't take the observation list. So the function is fine, but the **ordering** matters: the hook must call `evaluateInboundGate` BEFORE writing the marker.

**Risk:** If a refactor author reads `writeOperatorMessageMarker` and assumes it does its own observation reading, they may move the marker write before the evaluator call. Tests should pin the ordering.

**Fix:** Add a Phase 3 explicit ordering comment in the inbound-gate hook template: `evaluateInboundGate → if (decision.decision === "warn") writeOperatorMessageMarker(root, prompt)`. Add a snapshot test that captures the order: run a stale-observation scenario, then assert `.last-operator-message` exists and the marker has the right timestamp.

---

### High Priority

#### H1 — Path B's "loosen invariant" only fixes `gate-logic.js`; bash-gate evaluator also imports `inbound-state.js`

**Plan location:** R1 (Path B option) — `"change placement-manifest.test.js:101 from 'evaluator: [\"primitive\"]' to 'evaluator: [\"primitive\", \"facade\"]'"`.

**Evidence:** `tools/learning-loop-mastra/core/inbound-state.js` is `role: facade` (placement.yaml:17) and is what `bash-gate.js:28` imports for `checkObservationStaleness`. The plan's `evaluateBashGate` would need to call this to preserve current behavior.

**Issue:** If Path B only adds `facade` to the evaluator allowed-roles list, that single test edit covers `gate-logic.js` AND `inbound-state.js` (since both are facade). So Path B actually works — **but** the ADR comment in `docs/placement.md` only mentions `gate-logic.js`. The reader will think "this is just about gate-logic" when it's actually about the broader fact that evaluators compose facade functions for state-reading.

**Fix:** Update the Path B ADR comment to mention both: "evaluators compose primitives + facade functions (`gate-logic.js`, `inbound-state.js`) for state-reading; the split into pure-primitive modules is deferred until evaluator count exceeds 5."

#### H2 — Missing test for the `console.log` ordering in write-gate hook (regression risk)

**Plan location:** Phase 3 success criteria + R4 ("if any drift, the existing tests surface it").

**Evidence:** `write-gate.js:62-180` has 7 different `console.log(formatOutput(...))` calls, each followed by `process.exit(2)`. Refactoring this to `if (decision.decision !== "ok") { console.log(formatOutput(decision)); } process.exit(exitCode(decision));` requires the decision to carry the **exact** reason/rule_id/surface/preflight_checklist from the original cascade.

**Risk:** If the evaluator merges multiple block reasons into a single decision (e.g., "matched both records/** and a promoted rule"), the `decision.matched_rule` field becomes lossy. Existing test `__tests__/phase-e-foundation/` likely asserts specific reason strings.

**Fix:** Phase 1 tests should pin the EXACT reason strings for each of the 7 block cases (not just assert `decision === "block"`). Phase 3 must capture the 7 distinct reason strings into the snapshot before refactoring.

#### H3 — `meta-state.jsonl` audit-gap closure must be preserved in `evaluateWriteGate`

**Plan location:** `plan.md` line 88 (write-gate cascade rule #3: `meta-state.jsonl → block`) is referenced via hook `write-gate.js:83-100` (rule 1.6 with full audit context).

**Evidence:** `write-gate.js:83-100` carries a detailed audit-trail comment explaining why `meta-state.jsonl` blocks Write/Edit (the bash-gate regex catches `> meta-state.jsonl` in shell but Write/Edit bypass it). This rationale lives in the code, not in docs.

**Risk:** If the refactor moves the rule into `evaluateWriteGate` as a generic `globMatch("meta-state.jsonl", relPath) → block` check, the audit-context comment is lost. New contributors won't know why the rule exists.

**Fix:** Preserve the audit comment in `evaluate-write-gate.js` (as JSDoc on the `meta-state.jsonl` rule or a comment block referencing `plans/reports/debugger-260626-1535-phase-e-plan-7-audit-gap-mechanism-investigation.md`). Phase 2 Step 2 should explicitly call this out.

#### H4 — `placement-manifest.test.js:101` already has `evaluator: ["primitive"]`; loosening is a manifest-test edit

**Plan location:** Plan R1 Path B.

**Evidence:** `placement-manifest.test.js:101` — confirmed. Changing it to `["primitive", "facade"]` is a one-line edit. But the **doc sync** at `docs/placement.md:32` says "`evaluator` | No | `primitive` only | Future thin composers (Phase 3)". After the edit, the doc must also say "`primitive` + facade (state-reading functions)". The plan mentions the doc edit in passing (R1) but doesn't pin it as a Phase 2 Step 0 deliverable. If Path B is approved, Phase 2 must do both edits in the same commit.

**Fix:** Add to Phase 2 Step 0 deliverables: (a) test line 101, (b) docs/placement.md row for `evaluator`. Add to Phase 4 Step 2: verify both edits landed.

#### H5 — Snapshot artifact location: `plans/260628-2008-.../reports/` vs. repo root

**Plan location:** `plan.md` Related Code Files (Create): `plans/260628-2008-phase-e-evaluator-refactor/reports/gate-check-snapshot-captured.json`.

**Issue:** `plans/**` is in `.fallowrc.json` `ignorePatterns` line 19 — good, no dead-code concerns. But the snapshot file's path is inside the plan directory, not next to the test. If the plan dir is renamed or archived, the snapshot test breaks. Also, the snapshot is `gate_check` output, not a hook output — putting it in `plans/` instead of `__tests__/legacy-mcp/fixtures/` is non-conventional.

**Fix:** Move snapshot to `__tests__/legacy-mcp/fixtures/gate-check-snapshot.json` (matches `__tests__/phase-e-foundation/snapshots/` convention). Keep a tiny `.gitignore`-friendly pointer in `plans/.../reports/` if the artifact is meant to be plan-specific.

---

### Medium Priority

#### M1 — Test fixture style mismatch: plans/tests use object literals, but `evaluate-bash-gate` inputs need stdin envelopes

Phase 1 Step 3-5 says "fixtures use plain object literals." But `evaluateBashGate({ command, root })` takes a raw command string, while the bash hook takes a `{tool_name: "Bash", tool_input: {command}}` envelope. The plan needs to clarify: do unit tests pass raw strings, or full envelopes? The latter is what the snapshot test should use; the former is what unit tests should use. Pin this in Phase 1 Step 4.

#### M2 — `R2.2` contradicts `R2.1`

`R2.1` says "no I/O at evaluator module level" but `R2.2` says "I/O inside composed primitives (e.g., `readRuntimeObservations`) is OK." These are consistent at the module-vs-function-body distinction, but a future maintainer reading R2.2 might miss the module-level rule. Clarify in a single sentence: "no I/O at evaluator module top level; I/O inside called primitives is fine."

#### M3 — `phase-02-...md` R2.3 says "findStaleObservations stays local" but `findStaleObservations` reads `updated_at` from observations (no I/O) — the function is genuinely pure. Moving it to `gate-logic.js` would be a small, low-risk refactor. The decision "KISS — 7 lines, 1 caller" is defensible but leaves a tiny dead-code risk: if `evaluateBashGate` ever needs the same staleness check (it does — for `constraintMatch + stale observations`), the function would have to be re-implemented.

**Fix:** Move `findStaleObservations` to `gate-logic.js` (primitive) so both inbound and bash evaluators can use it. Costs ~5 min, reduces future drift.

#### M4 — Phase 3 Step 1 capture timing is ambiguous

Step 1 says "capture pre-refactor snapshot." But Step 5 (refactor `gate_check`) happens later. If the refactor changes the gate-tool internals (e.g., uses `evaluateBashGate` instead of inline `matchConstraintPattern`), the snapshot must be of the EXTERNAL behavior (the `return` value), not the internal flow. This is what the plan intends (R3.2 acknowledges it), but Step 1 should explicitly say "capture external behavior only — the `return.content[0].text` JSON string — not internal state."

#### M5 — Plan R3 says snapshot is "before Phase 3 starts"; if capture fails, the refactor can't proceed

There's no rollback plan if the snapshot capture step fails. The `gate_check` MCP tool requires a `resolveRoot()` (gate-tool.js:22) — capturing in a tmpdir may not work. Pin the capture environment (GATE_ROOT env var, tmpdir setup) explicitly in Step 1.

---

### Low Priority

#### L1 — Plan `status` and `priority` metadata

`plan.md` status is `pending` (correct for pre-implementation), priority `P2`. Given this plan is the locked third step of a 3-phase refactor and Phase E has been the active stream, `P1` may be more accurate. Not a blocker.

#### L2 — Plan tags include `mechanism-a` and `mechanism-b` but the plan explicitly says these are out of scope

Tag clutter; remove `mechanism-a`, `mechanism-b` from `plan.md:7`.

#### L3 — Phase 1 Step 3-5 test count math: "~30 total" → 10-12 + 10-12 + 6-8 = 26-32

The range is OK; "30 total" is imprecise. Pin to "27 tests" or similar after Phase 1 implementation.

#### L4 — `phase-04-...md` Step 9 verification log captures "baseline 1308" but Phase 1 may add tests that increase the count

The verification log should record "before Phase 1 baseline = 1308" and "after Phase 4 = 1308 + ~30" separately. Otherwise the "test count regression" check (R4.4) has no anchor.

#### L5 — Plan "Out of scope" says "Mechanism A/B shipped in #20" — recommend re-linking to PR #20 in `## References` of `plan.md` so future maintainers can grep for the PR.

---

### Path A Specific Findings (split `gate-logic.js`)

#### A1 — Re-export shim pattern in `gate-logic.js` is a recurring source of drift

If Path A takes `core/gate-logic-primitives.js` and re-exports everything from `gate-logic.js` for backward compat, then `entry/rule.js:2` (which imports `checkResolutionEvidence, projectHasLearningLoopMcp` from `gate-logic.js`) continues to work. **But** if `gate-logic.js` re-exports the FACADE functions too (e.g., `loadPromotedRules`, `applyPromotedRules`, `readPreflightMarker`, `writePreflightMarker`, `findProjectRoot`), then "facade" symbols are still importable from `gate-logic.js`, which makes the layering invariant test pass for evaluators that import primitives from `gate-logic-primitives.js` but ALSO incidentally trigger the read-at-import-time effect (see C3 above). The split reduces the *eager* module-load I/O (patterns.json still loads from gate-logic.js when imported via re-exports, unless primitives don't re-export CONSTRAINT_PATTERNS — which they shouldn't).

**Risk:** If the re-exports include `CONSTRAINT_PATTERNS` (the parsed regex map derived from `patterns.json`), the file read still happens. If re-exports only include the pure functions, the file read does NOT happen for primitive-only callers. The plan must specify which re-exports are included.

#### A2 — Split boundary choice is non-trivial — pure vs. impure split may not match the manifest's facade/primitive boundary

The plan (R1 Path A) lists the split:
- **primitives:** `globMatch, splitSegments, stripMessageFlags, stripNodeEvalBody, matchConstraintPattern, checkObservationExists, makeGateDecision, inferSurface, isSafeRegexPattern, isGlobScopeWhitelisted`
- **facade (stays):** `findProjectRoot, loadPromotedRules, applyPromotedRules, checkResolutionEvidence, readPreflightMarker, writePreflightMarker, projectHasLearningLoopMcp`

**Issue:** `matchConstraintPattern` (listed as primitive) uses `CONSTRAINT_PATTERNS`, which is module-load-initialized from `patterns.json`. So `matchConstraintPattern` is NOT pure — it depends on the file being readable at import time. If the evaluators import `matchConstraintPattern` from `gate-logic-primitives.js`, the file read still happens. **Either move the pattern loading into a lazy getter (preferred) or re-categorize `matchConstraintPattern` as facade.**

`inferSurface` (also listed as primitive) is genuinely pure. `checkObservationExists`, `makeGateDecision`, `isSafeRegexPattern`, `isGlobScopeWhitelisted` are all pure. `globMatch`, `splitSegments`, `stripMessageFlags`, `stripNodeEvalBody` are pure.

**Fix:** The split as listed has at least one mis-categorized function (`matchConstraintPattern`). Add lazy pattern loading OR re-categorize.

#### A3 — The +0.5d estimate understates the work: each re-export needs a separate line, and tests of `gate-logic.js` direct callers may fail if symbol names shift

`gate-logic.js` has callers in `entry/rule.js`, `bash-gate.js`, `gate-tool.js`, `write-gate.js`, `inbound-gate.js`, plus possibly tests. Re-exporting is one line each, but verifying each caller still resolves (no broken imports) is what the +0.5d estimate seems to cover. **But** if any test mocks `gate-logic.js` (e.g., via dynamic `import()` for a stub), the re-export shim could break the mock. Need to grep for test-side mocks of gate-logic before approving the split.

**Risk:** Medium. Mitigation: Phase 2 Step 0 should include a `grep -rn "from.*gate-logic" __tests__/` check.

---

### Path B Specific Findings (loosen invariant)

#### B1 — Loosening is one test-line edit, but the closed-taxonomy rule is a project-wide convention

`placement-manifest.test.js:101` says `evaluator: ["primitive"]`. Changing it to `["primitive", "facade"]` is a **one-character diff in one test file**. But the closed-taxonomy is documented in `docs/placement.md:25-27` ("Adding a role requires an ADR (see §4).") and in `AGENTS.md` (referenced by the plan R4). Loosening the layering restriction without an ADR is **inconsistent with the project's documented change-control pattern**.

**Fix:** Either (a) write a small ADR in `docs/decisions/` (per placement.md §4) before the test edit, OR (b) accept the test edit as an "invariant refinement, not a new role" (justifiable since `evaluator` role is unchanged, only its allowed imports expand). Option (b) requires a one-line ADR-comment in the test file citing the brainstorm §5 Phase 3 + the convergence addendum as the rationale.

#### B2 — Future "evaluator files > 5" trigger is undefined

R1 Path B says "can revisit if evaluators grow past 5 files." Three evaluators ship in this plan. The trigger (5) is arbitrary. A future maintainer adding a 4th evaluator (e.g., `evaluate-decision-gate` for a new hook) won't know to revisit Path A — the ADR comment doesn't say "revisit when N > 5" with N defined.

**Fix:** Either (a) set a numeric trigger (e.g., "revisit when N > 5 evaluators OR when an evaluator imports > 2 facade files") and document in the ADR comment, OR (b) accept that Path B is the permanent answer and remove the "revisit later" wording (simplifies the story).

#### B3 — Path B doesn't address the FCIS invariant interaction with `gate-logic.js`

`gate-logic.js` is `role: facade` (placement.yaml:11) but **does I/O at module load** (line 26, `readFileSync patterns.json`). The FCIS invariant (`fcis-invariant.test.js`) checks for `@mastra/*` imports only — not for facade role. So FCIS is unaffected. **However**, a future contributor might add `@mastra/*` to `gate-logic.js` because it's a "facade" (the FCIS invariant only checks `@mastra/*`, not `facade`). This is a pre-existing risk not introduced by this plan, but Path B's ADR comment should note "evaluators do not relax the FCIS invariant for facade dependencies — `gate-logic.js` must remain `@mastra/*`-free even though it does I/O."

---

### Verdict on the Layering-Tension Question

**Recommend Path B (loosen invariant), with two reservations:**

1. **Update the Path B ADR comment to cover BOTH `gate-logic.js` AND `inbound-state.js`** (see H1). Path B as documented understates its scope.
2. **Add an ADR-style comment in the test file itself** (placement-manifest.test.js line 101 area) citing the brainstorm §5 Phase 3 + the convergence addendum as the rationale (see B1). One-character test edits without ADR comments erode the closed-taxonomy convention.

**Why Path B is safer than Path A:**

- **Blast radius:** Path A splits a 460+ line file into two modules with re-export shims, which is exactly the kind of "infrastructure refactor alongside the feature refactor" the predecessor plans deliberately avoided. The Phase E Dead-Code Sweep's "fallow rule" exists to prevent scope creep; a re-export shim is textbook scope creep.
- **Test risk:** Path A has a higher chance of breaking the 1308 baseline tests (re-export drift, mock breakage) than Path B. The plan claims "+0.5 day" for Path A — realistically it could be 0.75-1.0 day given A1-A3.
- **Reversibility:** Path B is a one-line test edit + one ADR line. Reversing it is trivial. Path A's split is harder to reverse (two modules with re-exports means `git revert` would leave orphan re-exports dangling).

**Why Path B is acceptable despite B1-B3:**

- The closed-taxonomy rule is about **adding new roles** (`docs/placement.md` §4). Refining the **import-allow-list for an existing role** is a different operation; the project pattern doesn't strictly require an ADR for this (the closed-roles set in the test is the canonical authority, and an ADR-comment in the test + an ADR-line in the doc is sufficient).
- B2's "5-evaluator trigger" can be sharpened to a clear heuristic OR dropped; either way, it's a documentation tweak, not a correctness issue.

**Operator-facing recommendation:** Approve Path B; require Phase 2 Step 0 to produce:
1. The test-line edit (placement-manifest.test.js:101).
2. The ADR-style comment IN the test file (above the `evaluator` row in `ALLOWED`).
3. The `docs/placement.md` row update (mention `primitive` + facade-with-state-reading).
4. A grep-verified list of every facade symbol imported by the 3 evaluators (proves the ADR scope matches reality).

---

### Edge Cases Found by Scout

- **`gate-logic.js` line 26 module-load `readFileSync` of `patterns.json`** — contradicts the plan's "no I/O at evaluator module level" claim. Affects Path B but not Path A (Path A's primitives can lazy-load patterns).
- **`entry/rule.js:2` already imports `gate-logic.js`** as a helper (role unrestricted). Not a violation today; confirms that the `helper` and `facade` roles already mix freely.
- **`__tests__/legacy-mcp/` exists** (verified path); the snapshot test placement is conventional.
- **`gate-tool.js:64` `console.error("gate: ...")` is a stderr side effect**, not part of the snapshot's `return` value. Snapshot must capture only `content[0].text`.
- **bash-gate uses `formatHookDecision` with `hookSpecificOutput` envelope** (write-gate uses raw `formatOutput`). Phase 3 template must parameterize the formatter per hook.
- **`inbound-state.js` is facade** and is the second facade import bash-gate evaluator needs — Path B's ADR comment must cover it (not just `gate-logic.js`).
- **`matchConstraintPattern` is not pure** (depends on module-load file read). If Path A splits it as a primitive, the pattern loading must be lazy or it stays mis-categorized.
- **`.fallowrc.json` `dynamicallyLoaded` covers `hooks/legacy/**` and `tools/legacy/**`** — R4.3's concern about fallow audit flagging evaluators is unfounded (the consumers are already registered as dynamically loaded; the new evaluators will be too once they're imported by hooks/tools).
- **`constraints pattern file` (`core/patterns.json`) is read by `verification-runner.js:4` via JSON import attribute AND by `gate-logic.js:26` via `readFileSync`** — the two readers should agree (test it). Not a refactor-blocker but worth a sanity check.

---

### Positive Observations

1. **The plan correctly identifies the layering tension as the single open architectural question.** Everything else (Phase 1-4 ordering, signature lock-in, snapshot test design, FCIS invariant preservation, sibling test pattern, no `entry/` coupling in v1) is sound and follows the locked predecessor plans. The plan does not pad with speculative work.

2. **The "snapshot test locks wire shape" approach is well-designed.** Capturing the pre-refactor `gate_check` output as JSON and asserting byte-equality post-refactor is the cheapest way to prove wire-protocol stability. The plan acknowledges the limitation (snapshot must capture only the `return` value, not logs) — only needs minor tightening (C2).

3. **The "evaluators are pure, hooks are thin adapters, MCP tool is a thin dispatcher" narrative is the right architecture.** It matches the 3-layer architecture in `AGENTS.md` §1.1, the FCIS invariant, and the Phase E Dead-Code Sweep's CI guard. The 187 → 30 lines shrinkage for `write-gate.js` is a meaningful testability + maintainability win. The plan's framing is consistent with the project's YAGNI/KISS/DRY hierarchy.

---

### Recommended Actions

**Block PR-merge until:**

1. **C1 fix:** Phase 3 template (phase-03-hookadaptersandmcptool.md lines 23-59) is parameterized per-hook for the formatter. `bash-gate.js` keeps `formatHookDecision(..., { channel: "hookSpecificOutput" })`; write-gate and inbound-gate use their existing formatters.
2. **C2 fix:** Phase 3 Step 1 specifies snapshot scope: `JSON.stringify(result)` only (i.e., `content[0].text`), three fields per fixture (`{fixture_id, input, expected_return_json_string}`).
3. **C3 acknowledgment:** Plan either (a) accepts "evaluator module level I/O via transitive gate-logic import" as defined behavior, or (b) moves `patterns.json` loading into a lazy `getPatterns()` getter. Recommend (b) for future testability.
4. **H1 fix:** Path B ADR comment in `docs/placement.md` mentions `inbound-state.js` AND `gate-logic.js` (both facades the evaluators import for state-reading).
5. **B1 fix:** Path B ADR-style comment added in `placement-manifest.test.js` above line 101 (one-line citation of brainstorm §5 Phase 3 + convergence addendum).

**Pre-merge verifications:**

- Grep `__tests__/` for `from.*gate-logic` and `mock.*gate-logic` to detect re-export-impacted tests (relevant if Path A is chosen).
- Confirm `gate-tool.js:64` `console.error` and `appendGateLog` are out-of-scope for snapshot capture.
- Read `core/patterns.json` size and check `verification-runner.js:4` import-attribute parser agrees with `gate-logic.js:26` `readFileSync` parser (sanity, not a blocker).
- Verify `__tests__/legacy-mcp/` directory exists (it does — confirmed).

**Optional but recommended:**

- Move `findStaleObservations` to `gate-logic.js` (M3) — 5-min refactor, reduces duplication risk.
- Preserve the `meta-state.jsonl` audit-gap rationale as JSDoc in `evaluate-write-gate.js` (H3).
- Sharpen Path B's "5-evaluator trigger" or remove it (B2).

---

### Unresolved Questions

1. **For the operator:** Path A vs. Path B — recommendation is Path B with the ADR-comment + inbound-state.js-scope fixes (see Verdict). If Path A is preferred, the `matchConstraintPattern` mis-categorization (A2) and re-export scope (A1) must be resolved before approving.
2. **Phase 3 hook template fidelity:** Will the bash-gate hook use `formatHookDecision` with envelope (current behavior) or `formatOutput` raw (template's literal text)? Plan must decide before Phase 3 implementation. Recommend preserving current behavior.
3. **Snapshot artifact location:** Inside `plans/260628-2008-.../reports/` (per plan) vs. `__tests__/legacy-mcp/fixtures/` (convention)? Recommend fixtures dir.

---

### Metrics

- Plan file LOC: ~245 + 60 + 90 + 90 + 90 = ~575 (within expected for a 4-phase refactor plan).
- New code expected: 3 evaluator files (~360 lines total, ~120 each) + 3 test files (~30 tests, ~500 lines).
- Test count delta: +30 (1308 → 1338), per R4.4 acceptance criterion.
- Test files modified: 1 (`placement-manifest.test.js` if Path B).
- Hook LOC delta: 187+148+128 = 463 → 3×30 = ~90 (saves ~370 lines from hooks; moves to evaluators).
- Risk surface: low-medium; 5 critical + 5 high + 5 medium + 5 low findings. None of the critical findings require a design pivot; all are fixable in Phase 2-3 implementation.

---

## Status

**Status: DONE_WITH_CONCERNS**
**Summary:** Plan is well-structured and architecturally sound. Five critical findings, all fixable in implementation; Path B is the recommended layering-tension resolution but the ADR scope must be widened to cover `inbound-state.js` and the test edit must include an ADR-comment inline.
**Concerns/Blockers:**
- C1 (bash-gate formatter) is the most likely regression to the 1308 baseline tests.
- C3 (gate-logic.js module-load I/O) is a hidden behavior the plan doesn't acknowledge.
- B1 (Path B without ADR comment) erodes the closed-taxonomy convention.
