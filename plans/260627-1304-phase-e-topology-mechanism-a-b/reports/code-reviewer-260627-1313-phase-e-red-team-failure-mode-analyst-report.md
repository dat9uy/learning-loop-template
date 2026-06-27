# Red-Team Plan Review - Failure Mode Analyst

**Scope:** Phase E Mechanism A + B plan (5 phases), 2026-06-27
**Reviewer posture:** Failure Mode Analyst / Murphy Law
**Verification method:** Plan text vs. actual codebase
**Acceptance bar:** Findings backed by file:line citations from the plan or the codebase

---

## Finding 1: Snapshot capture is chicken-and-egg with no concrete capture script

- **Severity:** Critical
- **Location:** Phase 5 step 1 + Phase 4 step 5; plan.md R3
- **Flaw:** Phase 5 step 1 says capture snapshots BEFORE Phase 4 reimplementation. Phase 4 step 5 says capture the current wire output BEFORE running tests. Neither phase contains a runnable script, exact node snippet, MCP CLI command, nor a fixture id guaranteed to exist.
- **Failure scenario:** Executor opens Phase 4, fires up MCP server, calls meta_state_relationships against a real entry. Entry gets deleted by concurrent hook (real registry is meta-state.jsonl). Snapshot encodes half-state. Reimplementation passes against snapshot but real production diverged. Or executor skips capture because Phase 4 is about code, and Phase 5 compares new tool output to itself (vacuously green).
- **Evidence:**
  - plans/260627-1304-phase-e-topology-mechanism-a-b/phase-05-mechanismb-testsandsnapshot.md:159-162
  - plans/260627-1304-phase-e-topology-mechanism-a-b/phase-04-mechanismb-crosscuttingandtoolreimpl.md:184-187
- **Suggested fix:** Make snapshot capture a Phase 4 deliverable with a runnable command using mkdtempSync + seeded meta-state.jsonl, not the live registry.

---

## Finding 2: 28-file claim is wrong; 27 actual files including 3 test files at top level

- **Severity:** High
- **Location:** plan.md Phase 1; phase-01 step 1
- **Flaw:** Plan says ~28 files; actual count is 27. Four *.test.js files (loop-introspect.test.js, meta-state.test.js, record-validation-rules.test.js, workflow-registry.test.js) live at top level of core/, NOT inside __tests__/. The exclusion rule for __tests__/ directories does not skip them.
- **Failure scenario:** Phase 1 ships a placement.yaml with 27 rows including 4 test files. Each test file imports node:test + fixtures. None match the 7 closed roles. Phase 2 closed-taxonomy sub-test fails CI. Operator scrambles to add a tests role, violating the ADR-required role expansion in same commit.
- **Evidence:**
  - /home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/core/loop-introspect.test.js
  - /home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/core/meta-state.test.js
  - /home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/core/record-validation-rules.test.js
  - /home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/core/workflow-registry.test.js
- **Suggested fix:** Update Phase 1 acceptance criteria to exclude *.test.js filename pattern at any depth, not just __tests__/ directories.

---

## Finding 3: pnpm test runs namespaced runner; new core/entry/__tests__/ may be silently skipped

- **Severity:** High
- **Location:** Phase 3 step 7; Phase 4 step 7; Phase 5 step 5
- **Flaw:** package.json:16 defines test as run-pnpm-test-namespaced.mjs, NOT a flat node --test. New tests under core/entry/__tests__/ are in a directory pattern the runner may not know about. Existing core tests live next to source files, not under __tests__/.
- **Failure scenario:** Pre-commit hook fires pnpm test. New core/entry/__tests__/*.test.js files silently skipped. Developer assumes all green and merges. Factory bug reaches production. The 1189+ test count is unchanged because new tests never counted.
- **Evidence:**
  - /home/datguy/codingProjects/learning-loop-template/package.json:16 (namespaced runner)
  - /home/datguy/codingProjects/learning-loop-template/package.json:36 (pre-commit: pnpm test)
- **Suggested fix:** Move new tests to core/entry/*.test.js (sibling pattern) OR register core/entry/__tests__/ in the namespaced runner.

---

## Finding 4: TDD ordering impossible; Phase 4 step 1 references Phase 5 tests that do not yet exist

- **Severity:** High
- **Location:** Phase 3 step 1 vs Phase 4 step 1
- **Flaw:** Phase 3 creates factory tests. Phase 4 step 1 says to run the unit test scaffold from Phase 5 to prove failures. But Phase 5 is when index.test.js is actually written. Phase 4 cannot run a test that has not been written yet.
- **Failure scenario:** Phase 4 stub-then-test ritual references Phase 5 tests that do not exist at Phase 4 time. Executor either skips the red-phase proof or fabricates a stand-in test that does not match Phase 5 actual scaffolding.
- **Evidence:**
  - plans/260627-1304-phase-e-topology-mechanism-a-b/phase-03-mechanismb-entryfactories.md:108-114 (Phase 3 writes factory tests)
  - plans/260627-1304-phase-e-topology-mechanism-a-b/phase-04-mechanismb-crosscuttingandtoolreimpl.md:163-167 (references Phase 5 scaffold)
  - plans/260627-1304-phase-e-topology-mechanism-a-b/phase-05-mechanismb-testsandsnapshot.md:163-167 (Phase 5 writes index.test.js)
- **Suggested fix:** Merge Phase 4 step 1 with Phase 5 step 2 (write index.test.js before index.js), or write a one-line stub test inline in Phase 4.

---

## Finding 5: factoryFor reads entry.entry_kind but readRegistry does not run Zod preprocess; legacy entries throw

- **Severity:** High
- **Location:** Phase 4 factoryFor; plan.md R2
- **Flaw:** metaStateEntrySchema wraps union with z.preprocess that defaults entry_kind to finding for legacy entries. readRegistry returns raw parsed JSONL without running Zod. factoryFor reads entry.entry_kind raw; legacy entries without it cause throw.
- **Failure scenario:** Production registry has legacy entries from before entry_kind migration. meta_state_relationships invokes factoryFor on legacy id. entry.entry_kind missing. Switch throws. Tool returns unhandled rejection / stack trace to MCP client. Snapshot test does not catch this because fixtures have entry_kind populated.
- **Evidence:**
  - /home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/core/meta-state.js:38-46 (z.preprocess withDefaults)
  - /home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/core/meta-state.js:368-374 (readRegistry raw)
  - plans/260627-1304-phase-e-topology-mechanism-a-b/phase-04-mechanismb-crosscuttingandtoolreimpl.md:39-48 (factoryFor switch)
- **Suggested fix:** factoryFor should default entry_kind to finding when missing, mirroring withDefaults legacy compat path. Add Phase 4 unit test for legacy entry without entry_kind.

---

## Finding 6: Snapshot test will fail on key-order drift; current outbound if/else if chain order does not match reimplementation

- **Severity:** High
- **Location:** Phase 4 reimplementation + Phase 5 snapshot test; plan.md R3
- **Flaw:** Current tool builds outbound in order: origin, addresses, consolidated_into, supersedes, promoted_to_rule, proposed_design_for. Phase 4 reimplementation uses Object.fromEntries(refs.map(...)) where refs order comes from factory.outboundRefs() (consolidated_into, reopens, promoted_to_rule). Different field order in same entry yields different JSON.stringify output.
- **Failure scenario:** Snapshot test fails because of key-ordering drift, not a real bug. Phase 5 Risk R1 says accept cosmetic diff. Silently weakened snapshot test = wire shape changed without ADR.
- **Evidence:**
  - /home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/tools/legacy/meta-state-relationships-tool.js:38-54 (outbound field order)
  - plans/260627-1304-phase-e-topology-mechanism-a-b/phase-04-mechanismb-crosscuttingandtoolreimpl.md:113-119 (Object.fromEntries)
  - plans/260627-1304-phase-e-topology-mechanism-a-b/phase-05-mechanismb-testsandsnapshot.md:215-217 (Risk R4)
- **Suggested fix:** Sort keys in snapshot comparison via replacer, OR construct outbound using legacy field order, OR use deepStrictEqual on parsed objects not string comparison.

---

## Finding 7: Phase 1 promises manifest matches current code; cache role ambiguity for layering test

- **Severity:** Medium
- **Location:** Phase 1 + Phase 2 sub-test 3; plan.md R1
- **Flaw:** Phase 2 layering test asserts cache wraps one sibling (exactly one non-stdlib local module). Two cache files exist: loop-introspect-cache.js and read-registry-cache.js. The cache rule does not say whether multiple caches are allowed.
- **Failure scenario:** Phase 1 assigns cache role to both files. Phase 2 layering test may pass or fail depending on strictness of exactly-one-sibling assertion. Plan Risk R2 softens wraps but provides no resolution.
- **Evidence:**
  - /home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/core/loop-introspect-cache.js
  - /home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/core/read-registry-cache.js
  - plans/260627-1304-phase-e-topology-mechanism-a-b/phase-02-mechanisma-testextension.md:42-44 (cache rule)
- **Suggested fix:** Phase 1 audit step listing each core files non-stdlib imports. If file has multiple cache targets, it is not cache; add ADR or reassign role.

---

## Finding 8: Phase 4 reimplementation removes buildInverseIndexes usage but cold-tier sidecar cache divergence is unaddressed

- **Severity:** Medium
- **Location:** Phase 4 reimplementation; plan.md R3
- **Flaw:** Cold-tier cache built via buildInverseIndexes; meta_state_relationships now reads live registry. Two consumers see different freshness guarantees.
- **Failure scenario:** Post-Phase 4, meta_state_relationships returns live inbound refs; loop_describe cold-tier returns possibly stale sidecar cache. Operator debugging missing relationship sees it in one tool, not the other.
- **Evidence:**
  - /home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/core/loop-introspect.js:271-281 (buildColdTierCache)
  - /home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/core/loop-introspect.js:296-378 (buildInverseIndexes)
  - plans/260627-1304-phase-e-topology-mechanism-a-b/phase-04-mechanismb-crosscuttingandtoolreimpl.md:84-92 (live readRegistry)
- **Suggested fix:** inboundRefs reads from sidecar cache when available, OR ADR documents divergent freshness guarantees.

---

## Finding 9: Phase ordering has a partial-ship rollback hole for Phase 4 vs Phase 5

- **Severity:** Medium
- **Location:** Cross-phase; plan.md R3
- **Flaw:** Plan does not specify PR boundaries or rollback if Phase 4 ships alone with a broken reimplementation that fails Phase 5 snapshot lock.
- **Failure scenario:** Phase 4 ships alone. Snapshot test in Phase 5 catches wire-shape diff. Phase 5 not yet shipped. Production agents call meta_state_relationships mid-flight with new shape. Operators see console warnings. No rollback procedure defined.
- **Evidence:**
  - plans/260627-1304-phase-e-topology-mechanism-a-b/plan.md:38-40 (no PR boundaries)
  - plans/260627-1304-phase-e-topology-mechanism-a-b/phase-04-mechanismb-crosscuttingandtoolreimpl.md:178-180 (single commit reimpl)
  - plans/260627-1304-phase-e-topology-mechanism-a-b/phase-05-mechanismb-testsandsnapshot.md:209-213 (snapshot after reimpl)
- **Suggested fix:** Atomic PR for Phase 4 + Phase 5, or explicit revert-Phase-4-if-snapshot-fails clause.

---

## Finding 10: Inbound wire key naming ambiguity; relationship table does not preserve consolidated_by key

- **Severity:** Medium
- **Location:** Phase 3 relationship table + Phase 4 reimplementation
- **Flaw:** Current tool uses inbound.consolidated_by (not consolidated_into) for Finding->ChangeLog reverse. Phase 3 table says inbound is consolidated_into reverse (naming ambiguity). Phase 4 reimplementation does not preserve the consolidated_by key name explicitly.
- **Failure scenario:** Phase 4 produces inbound.consolidated_into array under wrong key; snapshot has inbound.consolidated_by. Snapshot fails structurally.
- **Evidence:**
  - /home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/tools/legacy/meta-state-relationships-tool.js:68-69 (consolidated_by)
  - /home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/core/meta-state.js:140-141 (consolidates on change-log)
  - /home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/core/meta-state.js:75-76 (consolidated_into on finding)
  - plans/260627-1304-phase-e-topology-mechanism-a-b/phase-03-mechanismb-entryfactories.md:84-87
  - plans/260627-1304-phase-e-topology-mechanism-a-b/phase-04-mechanismb-crosscuttingandtoolreimpl.md:113-125
- **Suggested fix:** Make Phase 3 table explicit: inbound[consolidated_by] = [finding-ids]. Add comment in Phase 4 preserving all six inbound key names: consolidated_by, addressed_by, superseded_by, origin_of, promoted_from, reopened_by.

---

## Summary

| Severity | Count | Findings |
|----------|-------|----------|
| Critical | 1 | F1 |
| High | 5 | F2, F3, F4, F5, F6 |
| Medium | 4 | F7, F8, F9, F10 |

**DO NOT MERGE** until F1, F3, F4, F5, F6 are resolved with concrete code/scripts. F2 and F7 need Phase 1 amendments. F8, F9, F10 are spec gaps that compound during execution.

The plan reads well as intent but contains multiple phase-ordering impossibilities and unverified codebase claims that will surface as CI failures or silent test-skip bugs.
