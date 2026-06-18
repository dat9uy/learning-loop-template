---
phase: 3
title: "Test + verify"
status: pending
priority: P1
effort: "30min"
dependencies: [phase-02]
---

# Phase 3: Test + Verify

## Overview

Run the full test suite to confirm the new e2e regression test passes and no other tests regress. Verify the `.ckignore` revert didn't break anything (the scout-block hook should still block `node_modules` access — the bypass line is gone, so the hook behavior reverts to default). Verify the SP2 fingerprint entry landed. Final commit + handoff.

## Related Code Files

- Read-only verification of:
  - `tools/learning-loop-mastra/__tests__/mcp-tools-list-parity.test.js` (new test, 4 tests)
  - `tools/learning-loop-mastra/__tests__/coerce-correctness.test.js` (existing parity net)
  - `tools/learning-loop-mastra/create-loop-tool.js` (comment fix)
  - `docs/mcp-tool-schema-architecture.md` (doc update)
  - `plans/reports/scouts-260618-1336-GH-0029-pr5-unresolved-questions-report.md` (scout addendum)
  - `plans/260618-0029-coerce-layer-zod-native-migration/plan.md:11` (dangling ref replacement)
  - `.claude/.ckignore` (revert)
  - `meta-state.jsonl` (SP2 change-log)

## Implementation Steps

### Step 3.1: Run the new e2e test in isolation (5 min)

```bash
cd /home/datguy/codingProjects/learning-loop-template
node --test tools/learning-loop-mastra/__tests__/mcp-tools-list-parity.test.js 2>&1 | tail -30
```

**Expected:** 4 tests pass (1 universal + 3 per-tool). Total runtime ~500ms-1s.

**If the new test fails:**
- If the universal test fails: investigate. Most likely cause is a tool's inputSchema legitimately being a bypass sentinel (impossible per `docs/mcp-tool-schema-architecture.md:386-388`) or a missing `properties` object (regression in `normalizeInputSchema`).
- If a per-tool test fails: the shim has regressed. Cross-check `coerce-correctness.test.js` — if it also fails, the shim broke; if it passes, the MCP server path is broken.

### Step 3.2: Run full test suite (10 min)

```bash
cd /home/datguy/codingProjects/learning-loop-template
pnpm test 2>&1 | tail -50
```

**Expected:** 1067 pass / 0 fail / 1 skip (the pre-existing skip; counts don't change with this plan). The 4 new tests add to the mastra namespace.

**Pre-plan total:** 1063 pass / 0 fail / 1 skip (per PR#5 description).
**Post-plan total:** 1067 pass / 0 fail / 1 skip (+4 new tests in `mcp-tools-list-parity.test.js`).

**Note:** the red team flagged the original "1070" claim as invented. The corrected count is 1067 (= 1063 + 4), matching the 4 tests verbatim specified in phase-02 step 2.2.

**If other tests fail:**
- If a `coerce-correctness.test.js` test fails: the shim regressed; investigate before continuing.
- If an unrelated test fails: may be a pre-existing flake or unrelated to this plan; re-run to confirm.

### Step 3.3: Verify the shim still works end-to-end (3 min)

```bash
cd /home/datguy/codingProjects/learning-loop-template
NODE_PATH=./node_modules node plans/260618-1418-GH-0029-pr5-shim-followup/e2e-tools-list-parity-probe.cjs 2>&1 | tail -20
```

**Expected:** `# tools/list returned 39 tools` + `## OK: 39 | BROKEN: 0`.

This re-runs the empirical probe from researcher A as a sanity check after the comment change (which is doc-only but worth confirming).

### Step 3.4: Verify the `.ckignore` revert works (2 min)

```bash
# Should now be BLOCKED again
cd /home/datguy/codingProjects/learning-loop-template
ls node_modules/zod/ 2>&1 | head -3
# Expected: BLOCKED via scout-block hook (was: works, with bypass during research)
```

**If blocked:** the revert is correct.

**If not blocked:** the scout-block hook isn't enforcing the rule, or `.ckignore` syntax is wrong. Re-check the file content (should be `!.venv` + dated comment only).

### Step 3.5: Verify SP2 change-log entry (2 min)

```bash
cd /home/datguy/codingProjects/learning-loop-template
tail -5 meta-state.jsonl | jq -r '"\(.id) \(.change_dimension) \(.change_target)"' 2>&1
# Expected: last entry has change_target: "tools/learning-loop-mastra/schema-parity.js" and change_dimension: "mechanical"
```

### Step 3.6: Run `git diff --stat` to summarize the change (2 min)

```bash
cd /home/datguy/codingProjects/learning-loop-template
git diff --stat
# Expected:
#   .claude/.ckignore                                          | 1 -  (remove 1 line, add dated comment)
#   docs/mcp-tool-schema-architecture.md                       | ~30 lines changed
#   meta-state.jsonl                                           | +1 line (new change-log)
#   plans/260618-0029-coerce-layer-zod-native-migration/plan.md | 1 line replaced
#   plans/reports/scouts-260618-1336-...                       | ~15 lines added (addendum)
#   tools/learning-loop-mastra/__tests__/mcp-tools-list-parity.test.js | +95 lines (new)
#   tools/learning-loop-mastra/create-loop-tool.js             | ~3 lines changed (comment)
```

**Expected NO changes** to: `schema-parity.js`, `coerce-correctness.test.js`, `with-mcp-server.js`, any of the 22 migrated tool files, `package.json`, `pnpm-lock.yaml`, `server.js`.

### Step 3.7: Commit (5 min, local only — no push)

Suggested commit message (conventional commit format):
```
docs(test): address PR#5 shim followup — comment fix, e2e regression test, doc correction

- Fix misleading comment at create-loop-tool.js:35-37 (override path is verified working)
- Add mcp-tools-list-parity.test.js — 4 e2e tests for tools/list inputSchema parity
  (1 universal + 3 per-tool load-bearing for shim pipe-collapse, default-recovery,
  and recursive object-rebuild branches)
- Update docs/mcp-tool-schema-architecture.md §3.5, §3.6, §8 to reflect Q3 refutation
  (live e2e probe found all 39 tools return correct schemas — synthetic-probe
  $ref:"#" is a zod 4.4.3 quirk, not a production bug)
- Add scout report addendum: Q3 verdict downgraded from PARTIAL to REFUTED
- Add SP2 fingerprint for schema-parity.js (mechanical change, registry-only)
- Remove dangling ref to missing research-260618-0031-zod-impact-analysis.md
  from plans/260618-0029-coerce-layer-zod-native-migration/plan.md:11
- Revert .ckignore research bypass (no longer needed; dated rationale comment kept)

No production code touched (only the comment + new test + doc updates + registry
entry + dangling ref cleanup). Shim works correctly per e2e verification
(researcher-A report: 39 of 39 tools return real inputSchemas).
```

**Don't push yet** — user decides the merge timing.

## Success Criteria

- [ ] `node --test tools/learning-loop-mastra/__tests__/mcp-tools-list-parity.test.js` passes with 4 tests
- [ ] `pnpm test` final run is green; 1067 pass / 0 fail / 1 skip (was 1063 + 4 new)
- [ ] e2e probe at `plans/260618-1418-.../e2e-tools-list-parity-probe.cjs` still shows `OK: 39 | BROKEN: 0`
- [ ] `.ckignore` no longer contains `!node_modules`; the scout-block hook re-blocks `node_modules` access
- [ ] `meta-state.jsonl` last entry references `tools/learning-loop-mastra/schema-parity.js` with `change_dimension: "mechanical"`
- [ ] `git diff --stat` shows the expected files; no production code touched (only comment + docs + test + registry)
- [ ] Commit message follows conventional commit format; no AI references

## Risk Assessment

- **Test suite failure (3.1, 3.2):** low risk. The shim is verified working, the new test was designed to pass on current code. If it fails, the failure mode is likely a per-tool name mismatch (a tool renamed or skipped) — easy to fix.
- **`.ckignore` revert (3.4):** zero risk. If the revert breaks some workflow, the bypass can be re-added with a one-line edit.
- **Commit (3.7):** zero risk (local commit only; user decides when to push).

## Out of Scope

- Push to remote (user decides)
- Open a PR (user decides; PR#5 is still open per `gh pr list`; this followup could be a separate PR or comment on PR#5)
- Run code-reviewer on the diff (user decides)
- Investigate `mastra_trigger_workflow` naming discrepancy (out of scope; flagged in test file as a follow-up)
