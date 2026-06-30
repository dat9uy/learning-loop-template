---
phase: 4
title: "Implement CI swap: replace hand-rolled fallow audit with fallow-rs/fallow@v2 Action"
status: pending
priority: P2
dependencies: [phase-03-implement-rule-extension]
---

# Phase 4: Implement CI swap

## Overview
Replace the 176 LoC hand-rolled fallow audit step + Python SARIF-split heredoc + 3 separate SARIF uploads at `.github/workflows/test.yml:62-237` with the official `fallow-rs/fallow@v2` composite Action, per the contract resolved in Phase 2. TDD: write a workflow-shape snapshot test FIRST, then mutate test.yml.

## Requirements

- **Functional:**
  - Replace lines 62-237 of `.github/workflows/test.yml` with the Phase 2 contract (~30 LoC)
  - Add `permissions:` block to `jobs.test` (researcher #2 §6: requires `security-events: write`)
  - Preserve the failure-upload step (`Upload fallow SARIF on failure`), re-pointed at `${{ steps.fallow.outputs.sarif }}`
  - Preserve `Upload per-namespace logs on failure` step (lines 217-224) — out of scope
- **Non-functional:**
  - Tests-first per `--tdd` flag
  - All 1369 existing tests pass
  - No new files (modify in place)

## Related Code Files

- Modify: `.github/workflows/test.yml` (lines 24-27 for `permissions:` block; lines 62-237 for fallow steps)
- Modify: `tools/learning-loop-mastra/__tests__/workflow-shape.test.js` (NEW — but per YAGNI, add tests inline to a new file only if no existing test file covers workflow shape)
- No other production files

## Implementation Steps

### TDD: Write failing tests first

1. **Check for existing workflow-shape tests.** Search for any test file that parses `.github/workflows/*.yml`:
   ```bash
   grep -rln "yaml.loadFile\|parse.*test.yml\|test\\.yml" tools/learning-loop-mastra/__tests__ 2>/dev/null
   ```
   If none exists, create `tools/learning-loop-mastra/__tests__/workflow-shape.test.js`.

2. **Write the new test file** with the following cases (all initially RED):
   ```js
   import { test } from "node:test";
   import assert from "node:assert";
   import { readFileSync } from "node:fs";
   import { parse as parseYaml } from "yaml";

   const WORKFLOW_PATH = ".github/workflows/test.yml";
   const wf = parseYaml(readFileSync(WORKFLOW_PATH, "utf8"));

   test("jobs.test has permissions block including security-events: write", () => {
     const perms = wf.jobs.test.permissions ?? {};
     assert.strictEqual(perms["security-events"], "write", "fallow SARIF upload requires security-events: write");
   });

   test("jobs.test does not contain pnpm exec fallow audit (hand-rolled invocation removed)", () => {
     const serialized = JSON.stringify(wf);
     assert.ok(
       !/pnpm exec fallow audit/.test(serialized),
       "hand-rolled `pnpm exec fallow audit` must be replaced with the Action"
     );
   });

   test("jobs.test uses fallow-rs/fallow@v2 action pinned to 40-char hex SHA", () => {
     const usesSteps = Object.values(wf.jobs.test.steps)
       .filter((s) => typeof s.uses === "string");
     const fallowUses = usesSteps.find((s) => /fallow-rs\/fallow@/.test(s.uses ?? ""));
     assert.ok(fallowUses, "fallow-rs/fallow@<sha> Action must be present");
     assert.match(fallowUses.uses, /fallow-rs\/fallow@[a-f0-9]{40}$/, "must pin to commit SHA, not tag");
   });

   test("fallow Action step sets gate: new-only explicitly", () => {
     const step = wf.jobs.test.steps.find((s) => /fallow-rs\/fallow@/.test(s.uses ?? ""));
     assert.strictEqual(step.with.gate, "new-only", "audit gate must be set explicitly on Action; .fallowrc.json's audit.gate is not honored by Action");
   });

   test("fallow Action step sets version: 2.102.0 (locks CLI binary)", () => {
     const step = wf.jobs.test.steps.find((s) => /fallow-rs\/fallow@/.test(s.uses ?? ""));
     assert.strictEqual(step.with.version, "2.102.0", "CLI version must be pinned to current tested version; Action's default would float to 2.103.0");
   });

   test("fallow Action step preserves all 3 baseline paths", () => {
     const step = wf.jobs.test.steps.find((s) => /fallow-rs\/fallow@/.test(s.uses ?? ""));
     const serialized = JSON.stringify(step.with);
     assert.match(serialized, /dead-code-baseline.*plans\/260627-2042-phase-e-dead-code-sweep/);
     assert.match(serialized, /health-baseline.*plans\/260627-2042-phase-e-dead-code-sweep/);
     assert.match(serialized, /dupes-baseline.*plans\/260627-2042-phase-e-dead-code-sweep/);
   });

   test("no Python heredoc remains in test.yml (SARIF split is no longer needed)", () => {
     const raw = readFileSync(WORKFLOW_PATH, "utf8");
     assert.ok(!/python3 - <<'PY'/.test(raw), "Python SARIF-split heredoc must be deleted");
     assert.ok(!/codeql-action\/upload-sarif/.test(raw), "Explicit codeql-action/upload-sarif@v4 steps must be removed (Action handles upload)");
   });

   test("failure upload step is preserved and re-pointed at Action output", () => {
     const fail = wf.jobs.test.steps.find(
       (s) => /Upload fallow SARIF on failure/.test(s.name ?? "")
     );
     assert.ok(fail, "Failure upload step must be preserved");
     assert.match(fail.path, /\$\{\{\s*steps\.fallow\.outputs\.sarif\s*\}\}/, "Failure upload must point at Action's SARIF output");
   });
   ```

3. **Run the test file** — confirm all 8 cases FAIL (red phase).

### Mutate the workflow

4. **Add `permissions:` block** to `.github/workflows/test.yml` `jobs.test` (insert after `timeout-minutes: 30` at line 27):
   ```yaml
         timeout-minutes: 30
         permissions:
           contents: read
           security-events: write
   ```

5. **Replace lines 62-237 with the Phase 2 contract** — 5-step block:
   ```yaml
         - name: Fallow audit (PR gate)
           if: github.event_name == 'pull_request'
           uses: fallow-rs/fallow@<commit-sha-from-phase-2>
           with:
             root: tools/learning-loop-mastra
             command: audit
             gate: new-only
             format: sarif
             sarif: true
             version: "2.102.0"
             dead-code-baseline: ../../plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/dead-code-baseline.json
             health-baseline:    ../../plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/health-baseline.json
             dupes-baseline:     ../../plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/dupes-baseline.json

         - name: Upload per-namespace logs on failure
           if: failure()
           uses: actions/upload-artifact@v7
           with:
             name: test-logs
             path: .test-logs/
             if-no-files-found: ignore
             retention-days: 7

         - name: Upload fallow SARIF on failure
           # Preserves the SARIF on failure so the next session can read the actual
           # CI output (rule IDs + locations) instead of the truncated public log.
           # Re-pointed at the Action's outputs.sarif (Action writes to its own
           # artifacts-dir under root; research recommended ${{ steps.fallow.outputs.sarif }}
           # but Action may emit a different path — verify with first run).
           if: failure()
           uses: actions/upload-artifact@v7
           with:
             name: fallow-sarif
             path: ${{ steps.fallow.outputs.sarif }}
             if-no-files-found: ignore
             retention-days: 7
   ```

   **CRITICAL:** The `<commit-sha-from-phase-2>` placeholder MUST be replaced with the actual SHA resolved in Phase 2 (decision record). Use `git ls-remote https://github.com/fallow-rs/fallow refs/tags/v2 | awk '{print $1}'` to get the current SHA.

6. **Re-run the test file** — confirm all 8 cases PASS (green phase).

### Verify no other steps regressed

7. **Diff against the old workflow** — confirm only the expected lines changed:
   ```bash
   git diff .github/workflows/test.yml | head -200
   ```
   Expected changes: `permissions:` block added; lines 62-237 replaced with ~30 LoC; no other changes.

## Success Criteria

- [ ] All 8 new test cases PASS
- [ ] All existing tests pass (1369+ count unchanged or +8)
- [ ] `pnpm test` exits 0 locally
- [ ] `node -e "yaml.loadFile('.github/workflows/test.yml')"` parses without error
- [ ] Workflow file LoC count drops from ~240 to ~140 (estimated -100 LoC)
- [ ] No hand-rolled `pnpm exec fallow audit`, Python heredoc, or explicit `codeql-action/upload-sarif` steps remain

## Risk Assessment

- **Risk:** The `<commit-sha-from-phase-2>` placeholder is forgotten, leaving the literal string in the workflow. **Mitigation:** the SHA-pin test (case 3) regex-match will FAIL loudly if the placeholder is still present; CI cannot merge.
- **Risk:** `steps.fallow.outputs.sarif` does not exist as a step id (Action uses `analyze` as the step id). **Mitigation:** if first run shows the path empty, change to `${{ steps.analyze.outputs.sarif }}`; verify with the failure-upload artifact on a test PR.
- **Risk:** `.fallowrc.json`'s `entry:` paths are relative to `root: tools/learning-loop-mastra` — verify the Action resolves them correctly. **Mitigation:** researcher #2 §13c confirmed auto-detection works; if first run fails, add explicit `config: tools/learning-loop-mastra/.fallowrc.json` input.
- **Risk:** A future upstream `fallow` 2.103.x release deprecates 2.102.0 binaries. **Mitigation:** monitor upstream; if 2.102.0 becomes unavailable, regenerate baselines in a follow-up plan and bump `version:` input.

## TDD Note

The `--tdd` flag is enforced in this phase: red tests (step 3) → mutation (steps 4-5) → green tests (step 6). The test file is the specification — if any case fails, the workflow is wrong.