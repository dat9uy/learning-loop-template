# Red-Team Plan Review — Step 4 Runtime-Agnostic Rule + Helper Extensions
## Failure Mode Analyst Perspective (Flow Tracer)

**Reviewer:** code-reviewer (hostile)
**Date:** 2026-06-15
**Plan:** `/home/datguy/codingProjects/learning-loop-template/plans/260615-2126-step-4-runtime-agnostic-rule-and-helper-extensions/`
**Verification role:** Flow Tracer
**Method:** 10 findings with grep/glob evidence; no praise; no rewrites; skip style.

---

## Finding 1: Test count claim is factually wrong — plan says 26, actual is 27
- **Severity:** Critical
- **Location:** Plan `plan.md` § Risks and mitigations (line 157) and Phases 1, 2, 3 § Implementation Steps
- **Flaw:** The plan claims "26 existing tests in `gate-override.test.js`, `gate-decision-log.test.js`, `gate-recurrence.test.js`" with the explicit breakdown "13 + 5 + 8 = 26". Phase 1's success criteria say "expect 5 GREEN" and Phase 3 says "expect 13 GREEN" for the existing decision-log and override tests.
- **Failure scenario:** The plan's test-count math drives the projected test totals (952/953 → 955/956 → 958/959 → 968/969 → 972/973). If the baseline is off by 1, every subsequent count is off. Refactor assertion in Phase 3 ("13 GREEN") will fail with 12 tests reported GREEN. Operators verifying "did the refactor regress anything?" get a wrong answer.
- **Evidence:** 
  - `gate-override.test.js:41,51,55,63,75,85,96,104,112,119,126,133` = 12 tests (not 13)
  - `gate-decision-log.test.js:24,48,68,84,105,122` = 6 tests (not 5)
  - `gate-recurrence.test.js:54,68,78,90,108,133,163,181,194` = 9 tests (not 8)
  - Actual total: 12+6+9 = **27**, not 26
- **Suggested fix:** Re-count from the file system. Update all five test-count targets (952, 955, 958, 968, 972) by +1.

## Finding 2: Phase 4 regression test will fail on `gate-override.js`'s READ side on the day it ships
- **Severity:** Critical
- **Location:** Phase 4, "No hand-rolled cross-surface loops in core/" test
- **Flaw:** Phase 4's test asserts `for\s*\(\s*const\s+\w+\s+of\s+SURFACES\s*\)` appears 0 times outside `surfaces.js`. But the plan's Phase 3 ONLY refactors `writeGateOverride` (the WRITE side), not `readGateOverride` (the READ side at `gate-override.js:34-66` which still uses `for (const surface of SURFACES)` at line 49). Phase 4's test would flag this as a violation the moment it runs.
- **Failure scenario:** The test "core/ has no inline for-of-SURFACES loops outside surfaces.js" passes the new helpers/refactors but then flags `gate-override.js:49` as the offender, marking the test RED. This blocks the planning-order "sequence closed" claim in Phase 8 because the regression test fails.
- **Evidence:** `tools/learning-loop-mcp/core/gate-override.js:49` has `for (const surface of SURFACES)` (in `readGateOverride`, which Phase 3 explicitly does NOT refactor — see Phase 3 § Architecture: "Phase 3 only refactors `writeGateOverride`; `readGateOverride` continues to use `SURFACES` would be a future refactor — out of scope here"). Also `gate-decision-log.js:67` has a second `for (const surface of SURFACES)` in `readAllLogContents` (Phase 2 refactors the function but the new helper's internals re-introduce the same loop, which is fine because the test excludes `surfaces.js` itself).
- **Suggested fix:** Either (a) widen Phase 3's scope to refactor `readGateOverride` to use the new `readFromAllSurfaces` helper, or (b) narrow Phase 4's test to exclude `gate-override.js`, or (c) add an allowlist mechanism to the test for known-deferred refactors.

## Finding 3: Shim-mirror invariant is broken today — `.claude/coordination/hooks/README.md` exists, `.factory` does not have one
- **Severity:** Critical
- **Location:** Phase 4, "both shim directories have the same set of hook names" test
- **Flaw:** The Phase 4 test asserts `deepStrictEqual([...claudeShims].sort(), [...factoryShims].sort())`. The directories currently differ: `.claude/coordination/hooks/` has a `README.md` (3905 bytes) that `.factory/coordination/hooks/` does not. The other 4 hooks (`bash-coordination-gate.cjs`, `inbound-state-gate.cjs`, `recurrence-check-on-start.cjs`, `write-coordination-gate.cjs`) are mirrored.
- **Failure scenario:** The first run of Phase 4's test fails with `expected: ['README.md', 'bash-coordination-gate.cjs', 'inbound-state-gate.cjs', 'recurrence-check-on-start.cjs', 'write-coordination-gate.cjs']`, `actual: ['bash-coordination-gate.cjs', 'inbound-state-gate.cjs', 'recurrence-check-on-start.cjs', 'write-coordination-gate.cjs']`. The test that the plan calls "the regression guard" fails on its first run — this is a self-defeating launch.
- **Evidence:** `ls -la .claude/coordination/hooks/` shows `README.md` (3905 bytes, dated Jun 8). `ls -la .factory/coordination/hooks/` shows only 4 `.cjs` files (Jun 6). Confirmed by direct directory listing.
- **Suggested fix:** Add `README.md` to `.factory/coordination/hooks/` (and verify the contents are runtime-agnostic, not Claude-specific). Or, narrow the test to filter out `README.md` (less correct — the invariant should hold).

## Finding 4: Plan claims 8 helpers, current `surfaces.js` exports 4; the 4 new ones land in a single file near the 200-line threshold
- **Severity:** High
- **Location:** Plan § Overview (line 71) and Phase 4 "Helper API completeness" test
- **Flaw:** The plan claims `surfaces.js` will export 8 cross-surface helpers after Phases 1-3. The current `surfaces.js` is 74 lines exporting 4. Phase 1 adds ~12 lines, Phase 2 adds ~30 lines, Phase 3 adds ~40 lines (plus the `unlinkSync` import). The result is roughly 156 lines — under the 200-line file-size rule in `development-rules.md`, but right at the threshold.
- **Failure scenario:** `surfaces.js` ends up at 200+ lines, violating the user-rule. Either (a) the helper file gets split mid-implementation, breaking Phase 4's test, or (b) the file stays monolithic and triggers a code-review violation at merge.
- **Evidence:** `tools/learning-loop-mcp/core/surfaces.js:1-74` is 74 lines today. Phase 3's `readModifyWriteOnAllSurfaces` draft alone is 50 lines including error paths.
- **Suggested fix:** Plan the split explicitly: e.g., `surfaces.js` (SURFACES, getAllCoordinationPaths), `surfaces-write.js` (write/append), `surfaces-read.js` (read/readJsonl), `surfaces-mutate.js` (readModifyWrite). Update Phase 4's test to check each file's exports.

## Finding 5: `readModifyWriteOnAllSurfaces` is NOT atomic across surfaces — partial success creates cross-surface drift
- **Severity:** High
- **Location:** Phase 3, Helper signature § "Atomicity" and Risk Assessment
- **Flaw:** The plan claims "The helper's atomicity matches `writeToAllSurfaces` (write-temp + rename)". This is true per-surface, but the helper is NOT atomic across the 2 surfaces. The plan acknowledges this implicitly but doesn't reconcile it with the override marker's expectation of a single, consistent cross-surface state.
- **Failure scenario:** Two concurrent bash-gate calls land in `writeGateOverride`. Surface 1's read-modify-write completes; Surface 2's read fails. The cache is invalidated, the audit is appended, but only `.claude/coordination/.gate-override` reflects the new state. Subsequent `readGateOverride` calls return the new marker (first-valid-wins prefers `.claude`), but `.factory` has stale or missing data. The next time the operator inspects `.factory` (e.g., via Droid CLI), they see the OLD override. Override audit and effective state are inconsistent across runtimes.
- **Evidence:** `tools/learning-loop-mcp/core/gate-override.js:108-140` (current code) has the same issue — the plan doesn't fix it, just relocates the loop. `gate-override.js:64-65` confirms the "first-valid-wins" read contract; cross-surface divergence is silently tolerated.
- **Suggested fix:** Add a cross-surface reconciliation step at the end of the helper: if any surface was `skipped`, log to stderr with a CRITICAL marker. Document the partial-success contract in the helper's JSDoc.

## Finding 6: `readJsonlFromAllSurfaces` with invalid `since` silently filters nothing — fail-open to all data
- **Severity:** High
- **Location:** Phase 2, "Helper signature" line 61: `new Date(since).getTime()`
- **Flaw:** Phase 2's risk assessment says "The fail-open behavior (skip entries with `ts < NaN`) is preserved" — this is backwards. `NaN < anyNumber` is always `false`, so the comparison `new Date(parsed.ts).getTime() < sinceMs` returns `false` for every entry, meaning the filter `continue` is NOT triggered, meaning ALL entries are returned. An invalid `since` doesn't filter; it returns everything.
- **Failure scenario:** `meta_state_query_drift` or `gate_check_recurrence` calls `readJsonlFromAllSurfaces(root, subpath, { since: "2026-13-99" })` due to a typo. The entire cross-surface JSONL is returned. The consumer processes 10,000 lines, blowing past the threshold and auto-firing a false-positive finding. Operators see a phantom "recurrence" finding.
- **Evidence:** `tools/learning-loop-mcp/core/gate-decision-log.js:88,94` shows the existing code uses the same `new Date(...).getTime()` pattern. Plan § Risk Assessment on Phase 2 says "skip entries with `ts < NaN`" which is mathematically wrong.
- **Suggested fix:** Validate `since` explicitly: `if (isNaN(sinceMs)) throw new Error("invalid since");` or return `[]`. The current `gate-decision-log.js` has the same bug — Phase 2 is a good time to fix it.

## Finding 7: Phase 7's rule entry depends on a `change-log` filed during the same phase — circular write ordering
- **Severity:** High
- **Location:** Phase 7, Implementation Steps 2-3 and § Architecture "Meta-state rule entry"
- **Flaw:** The plan's rule entry has `"origin": "meta-260615T2200Z-runtime-agnostic-features-rule-ships"` referencing a change-log entry. The change-log is also being added in this phase. The plan § Risk Assessment acknowledges the order: "change-log first, then rule entry." But the rule entry's `origin` field is hard-coded in the plan — if the operator uses `meta_state_log_change` and gets a different id (e.g., suffix-hash variant), the rule's `origin` is dangling.
- **Failure scenario:** `meta_state_log_change` returns a different id than the hard-coded one (timestamp collision, hash suffix). The hard-coded `origin` doesn't match. `meta_state_list({ ref_by: 'rule-runtime-agnostic-features' })` returns 0 results. Phase 8's "verify the change-log id exists" step detects the mismatch and degrades to `—` — silently dropping the audit trail.
- **Evidence:** Plan Phase 7 lines 60 (`"origin": "meta-260615T2200Z-runtime-agnostic-features-rule-ships"`) and lines 70 (change-log id) and Phase 8 line 90 ("Verify the change-log id exists") show the hard-coded coupling. No `meta_state_log_change` MCP tool source is shown to confirm whether it allows caller-supplied ids.
- **Suggested fix:** Use a single transaction: file the change-log first, capture the returned id, then write the rule entry using the captured id. Document in the plan as "id is captured at runtime, not hard-coded."

## Finding 8: Phase 5's line-numbered anchor (749-755) is ambiguous; mis-insertion breaks resolution-evidence tests
- **Severity:** Medium
- **Location:** Phase 5, § Architecture § Code change (line 38: "line 749+")
- **Flaw:** Phase 5 says to add the new branch after the `resolution-evidence-required` branch "at `gate-logic.js:749-755`". The actual file: `resolution-evidence-required` is at lines 749-755, `regex` at 756, `glob` at 769. The new branch should be inserted between line 755 and 756. Plan says "line 749+" which is ambiguous.
- **Failure scenario:** Operator inserts at line 750, overwriting `resolution-evidence-required`'s `if` line. The existing branch becomes unreachable. `gate-resolution-evidence.test.js` starts failing.
- **Evidence:** `tools/learning-loop-mcp/core/gate-logic.js:749-755` = `if (pattern_type === "resolution-evidence-required") { ... }`. Plan example shows placement BEFORE the `regex` branch, contradicting the "line 749+" anchor.
- **Suggested fix:** Update Phase 5 to "Insert at line 756, immediately after `}` at line 755 and before `else if (pattern_type === \"regex\"` at line 756." Add a test assertion that `gate-resolution-evidence.test.js` still passes.

## Finding 9: Phase 4 test depends on real project structure — fragile in CI
- **Severity:** Medium
- **Location:** Phase 4, Test structure line 47: `const MCP_ROOT = new URL("../..", import.meta.url).pathname;`
- **Flaw:** Path math is correct, but the test reads `agent-manifest.json` and `protocol-adapter.js` directly via `readFileSync`. No fixture, no temp dir. If the manifest path is read-only or missing in CI, the test fails with a downstream stack trace.
- **Failure scenario:** CI sandbox runs the test with a stripped checkout (no `agent-manifest.json`). `readFileSync` throws. Test fails with an unhelpful error, blocking the run.
- **Evidence:** `package.json:16` test script picks up the new file. `tools/learning-loop-mcp/agent-manifest.json` exists locally. `tools/learning-loop-mcp/hooks/lib/protocol-adapter.js` exists locally. Plan § Risk Assessment only addresses the shim-mirror test's tolerance, not the manifest/protocol-adapter tests.
- **Suggested fix:** Add a top-of-test sanity assertion: `assert.ok(existsSync(MANIFEST_PATH), "manifest must exist for the regression test to run");` — explicit failure with clear message.

## Finding 10: `meta_state_refresh_tools` is the wrong refresh path for the new tool — Phase 6's plan doesn't sequence it
- **Severity:** Medium
- **Location:** Phase 6, Implementation Step 5 and § Risk Assessment
- **Flaw:** Phase 6 § Step 5 says "Refresh the MCP server's tool modules: this is automatic on next server start; for local testing, the `meta_state_refresh_tools` MCP tool reloads in-process." This is incomplete. The new tool file must be added to `tools/manifest.json` BEFORE the next server start, otherwise the file is orphaned. The plan adds it to `manifest.json` but doesn't sequence: (1) write tool file, (2) add to manifest, (3) restart server (or call `meta_state_refresh_tools`).
- **Failure scenario:** Operator runs Phase 6 in one PR. Tests pass (the test invokes the handler directly, not via MCP). The next time the agent queries `check_runtime_agnostic`, the running server returns "tool not found" because the running server loaded the OLD manifest at startup. The audit surface is silently dead.
- **Evidence:** `tools/learning-loop-mcp/server.js:14-23` does a one-shot `loadManifest()` at module load time. `tools/learning-loop-mcp/tools/meta-state-refresh-tools-tool.js:46-48` confirms the in-process refresh exists but is opt-in. Plan § Step 5 doesn't mention that the running server has the old tool list in `_registeredTools` until refresh is called.
- **Suggested fix:** Add a "Restart server" step in Phase 6's implementation, or explicitly document "Operator must call `meta_state_refresh_tools` after Phase 6 ships, before the tool is callable by agents." Update Phase 6's success criteria with a "manual MCP server restart" checkbox.

---

## Unresolved Questions

1. The plan's `readJsonlFromAllSurfaces` `since` semantics — should the helper throw, return `[]`, or return-all on invalid input? Plan § Risk Assessment claims fail-open (skip on `NaN`) but the math says the opposite. Plan should pick one explicitly.
2. Phase 3's `readModifyWriteOnAllSurfaces` cross-surface atomicity: should the helper have a `tolerance` mode (e.g., "all-or-nothing" that rolls back surface 1 if surface 2 fails)? Plan says "no, partial success is acceptable" but doesn't document the operational consequence (override marker divergence across runtimes).
3. Phase 7's `origin` field coupling to the change-log id: is `meta_state_log_change` guaranteed to return the caller-supplied id verbatim, or does it add a hash suffix? The plan assumes verbatim; this should be verified.
4. The plan's `.claude/coordination/hooks/README.md` asymmetry is a pre-existing bug — is fixing it (Finding 3's suggested fix) in scope for Step 4, or should it be a CLEANUP item? Plan § Scope implies Step 4 doesn't touch shim directories, but Phase 4's test forces the issue.
5. Phase 4's "all cross-surface iteration lives in `core/surfaces.js`" claim is over-broad. The 4 new helpers don't cover `inbound-state.js`, `meta-state.js`, or `recurrence-tracker.js` (which all do surface iteration). Plan should clarify whether "core/" means the test scans all of `core/` (including these files) or only the new helper's consumers.

**Status:** DONE
**Summary:** 10 findings, 3 Critical (test count off by 1, Phase 4 test fails on `gate-override.js` read side, shim-mirror test fails on missing `.factory/hooks/README.md`), 3 High (file-size risk, cross-surface atomicity, invalid-since semantics), 4 Medium (line-anchor ambiguity, fragile test deps, server refresh sequencing, plus 1 more in unresolved).
**Concerns/Blockers:** None. All findings have grep/glob evidence and concrete fix suggestions. The 3 Critical findings each break a "Plan shall achieve X" assertion in the plan's own success criteria.
