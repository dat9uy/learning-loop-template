# Red-Team Failure-Mode Review: Plan 260630-0536 (Fallow Action SARIF Patch)

**Reviewer:** code-reviewer (adversarial / Failure-Mode Analyst)
**Review tier:** Standard
**Date:** 2026-06-30
**Subject plans:**
- `plans/260630-0536-fallow-action-swap-with-sarif-split/plan.md`
- `phase-01-phase-1-correct-design-evidence.md`
- `phase-02-phase-2-patch-sarif-1-explicit-upload.md`
- `phase-03-phase-3-verify-in-ci.md`

## Scope & Method

Adversarial review focused on failure modes, recovery gaps, and cascading risks. Fact-checking performed via `grep`, `jq`, and direct file reads against the repository. No code or tests were run; the plan is the artifact under review.

**Repo evidence base:**
- `.github/workflows/test.yml` (verified: 132 lines; `sarif: true` at line 99; failure-upload at line 118-131; NO `id: analyze` step)
- `tools/learning-loop-mastra/reports/fallow/audit.sarif` (verified: 3 runs; run 0 missing `automationDetails` key entirely; run 1 has `automationDetails.id = "fallow/audit/dupes"`; run 2 missing `automationDetails` key)
- `tools/learning-loop-mastra/__tests__/legacy-mcp/workflow-shape.test.js` (verified: 9 existing tests)
- `plans/reports/researcher-260629-2011-fallow-tools-v2-action-deep-dive-report.md` (verified: deep-dive claims `steps.analyze.outputs.sarif`)
- `plans/reports/decision-260629-2011-fallow-action-swap-decisions.md` (verified: D2 already says "Drop (Migration A)" at line 17)
- `meta-state.jsonl` (verified: exists at repo root, 360KB)

---

## Findings

## Finding 1: `steps.analyze.outputs.sarif` is referenced by the workflow but the analyze step id is NOT declared in the workflow

- **Severity:** Critical
- **Location:** Phase 2, step 2.6 (patch step) and step 2.7 (upload step); also pre-existing on line 129 of `test.yml` (which the plan does not fix)
- **Flaw:** The plan's patch step uses `${{ steps.analyze.outputs.sarif }}` to read the SARIF path, and Phase 2 step 2.8 leaves the failure-upload's `${{ steps.analyze.outputs.sarif }}` reference untouched. Both assume an `id: analyze` step exists in the workflow. It does not.
- **Failure scenario:** On the recovery PR, the patch step reads an empty/undefined value into `SARIF_INPUT`. The `jq` invocation will receive an empty path argument and jq will read from stdin or fail. Even with `set -euo pipefail`, the resulting `fallow-results-patched.sarif` will not contain patched content. The subsequent upload step's `sarif_file:` literal (`fallow-results-patched.sarif`) may pass to codeql-action with an unreadable file. Either way, the upload fails — which is the exact failure mode the plan claims to fix.
- **Evidence:**
  - `grep -n "id:" .github/workflows/test.yml` returns only `id: fallow-version` (line 74). No `id: analyze` is declared anywhere.
  - `test.yml:129` already references `path: ${{ steps.analyze.outputs.sarif }}` (pre-existing bug from PR #22). The plan preserves this on line 264 but does not address why this works.
  - The deep-dive report (line 144) claims `steps.analyze` is the Action's internal step id, but GitHub Actions does NOT expose composite Action internal step ids to the calling workflow. The Action's outputs (`results`, `sarif`, etc. per `action.yml`) are accessed via the **caller's** step id, which the caller assigns with `id:`. Since the workflow does not assign `id: analyze` to the fallow Action invocation at `test.yml:93`, the `steps.analyze.outputs.sarif` reference resolves to empty string in GitHub Actions.
  - Phase 2 step 2.5 edits the Action's `with:` block but never adds `id: analyze`.
  - Phase 2 step 2.7 acknowledges the path expression issue mid-plan ("Wait — the `sarif_file:` expression above is wrong... Use a literal path") but does NOT apply the same scrutiny to `SARIF_INPUT` in step 2.6, which has the identical defect.
- **Suggested fix:** Add `id: analyze` to the fallow Action invocation (line 93). Alternatively, hard-code `SARIF_INPUT` to the path the Action writes to per `analyze.sh:468-470` (which is `<artifacts-dir>/fallow-results.sarif`, default `.`). The plan must verify one of these paths BEFORE the patch step can succeed. The pre-existing failure-upload reference must also be fixed.

---

## Finding 2: Idempotency claim is wrong — `automationDetails == null` does NOT match `automationDetails: {}` (empty object)

- **Severity:** High
- **Location:** Phase 2, "Architecture" section (lines 86-90 of plan); phase-02 step 2.6 (jq inline script)
- **Flaw:** The plan claims the patch is idempotent because of the `if .automationDetails == null then ... else . end` check. Verified: jq treats missing key and explicit null the same (both route to PATCH branch). But `automationDetails == null` is FALSE when `automationDetails` is an empty object `{}`. The plan never tests this edge case.
- **Failure scenario:** Fallow 2.104.x (or later) ships a partial fix: dead-code and health runs emit `automationDetails: {}` instead of leaving the key missing (a plausible next-step after F-6 ships the dupes fix). The patch's `if .automationDetails == null` check evaluates to `false`. The patch passes the run through unchanged. The run still has no `automationDetails.id`, so `createRunKey` collides with the dupes run's neighbor. The `areAllRunsUnique` validator rejects the SARIF with the exact same error message from PR #22's run 28395140914. The plan's "forward-compatible with F-6" risk claim is inverted — the patch is NOT forward-compatible with a `{}`-placeholder approach.
- **Evidence:**
  - `echo '{"a": {}}' | jq '.a == null'` returns `false` (verified via shell test)
  - `jq 'if {a: {}} | .a == null then "PATCH" else "SKIP" end'` returns `"SKIP"`
  - Phase 2's local smoke test (step 2.11) only validates the current 3-run state with `null` / set values; it does not exercise the `{}` edge case
- **Suggested fix:** Change the classifier to `if (.automationDetails | not) or (.automationDetails.id // null) == null then ...`. Add a fixture with `automationDetails: {}` to the test suite.

---

## Finding 3: The classifier's rules-prefix lookup misses fallow's actual rule ID taxonomy

- **Severity:** High
- **Location:** Phase 2, "Architecture" section (inline jq script); Phase 1 assertion B4
- **Flaw:** The classifier reads `runs[i].tool.driver.rules[0].id` and matches prefixes. The plan's prefix map assumes `fallow/unused-*`, `fallow/private-*`, `fallow/duplicate-export`, `fallow/unlisted-*` → dead-code and `fallow/high-*`, `fallow/low-*`, `fallow/long-*`, `fallow/duplicated-*` → health. But the plan's smoke test (step 2.11) only checks `rules[0]`, not the full rules array. If `rules[0]` happens to start with a fallback prefix but later rules don't, runs route to the wrong category.
- **Failure scenario:** On a future PR where fallow's taxonomy shifts (e.g., `fallow/unused-export` renamed to `fallow/dead-export`), the classifier still matches `^fallow/(unused|private|duplicate-export|unlisted)-` for SOME prefixes but renamed rules no longer match. Cosmetic mis-routing in Code Scanning UI (does NOT cause SARIF rejection because every run still gets a unique `automationDetails.id`), but the rule IDs visible under "fallow/audit/dead-code" no longer correspond to dead-code findings — operators triage findings against wrong-category labels.
- **Evidence:**
  - `jq '.runs[0].tool.driver.rules | length'` returns 45 — only `rules[0]` is checked by the classifier
  - `jq '.runs[0].tool.driver.rules[0].id'` returns `"fallow/unused-file"` — matches `^fallow/unused-`
  - `jq '.runs[2].tool.driver.rules[0].id'` returns `"fallow/high-cyclomatic-complexity"` — matches `^fallow/high-`
  - The plan's risk assessment says "pin `version: 2.102.0` (already done)" — verified at line 100 of test.yml. Drift is controlled for the current state but the prefix map was never validated against the FULL rules array.
- **Suggested fix:** Phase 2 step 2.11 must verify ALL rule IDs match the classifier prefixes (not just `rules[0]`). Add: `jq -r '[.[].tool.driver.rules[] | .id] | .[]' | sort -u | grep -Ev '^fallow/(unused|private|duplicate-export|unlisted|high|low|long|duplicated)-'` should return empty. Same for health.

---

## Finding 4: `pnpm test` baseline (1380+) is unverified — the plan assumes it but the assertion is implicit

- **Severity:** High
- **Location:** Phase 2, step 2.10; also plan acceptance criteria line 137
- **Flaw:** The plan claims "1380+/1380+ green" as the success criterion. The phase-02 step 2.10 says "Expect 1380+/1380+ green (per the prior plan's acceptance criteria; this phase doesn't add new tests in other namespaces, only updates workflow-shape.test.js, so the total count should be unchanged from the current baseline minus any tests removed during #7/#8 update)". This is an unverifiable claim — no shell command in the plan measures the current test count to establish the baseline BEFORE making changes. If the actual count is 1347 or 1402, the assertion is meaningless.
- **Failure scenario:** Phase 2 step 2.4 ("confirm RED") assumes T10-T14 fail and T1-T6, T9 pass. But Phase 2 step 2.2 plans to update test #7 from "exactly 0 occurrences of codeql-action/upload-sarif" to "exactly 1 occurrence" and test #8 from `${{ steps.analyze.outputs.sarif }}` to `fallow-results-patched.sarif`. If the implementer reads test #7's current assertion and confuses the planned update with the actual current state, the RED step may pass prematurely.
- **Evidence:**
  - `wc -l workflow-shape.test.js` = 161 lines, 9 test() blocks
  - The plan never runs a baseline test-count command before amendments
  - The plan's reference to "1380+" is from the prior plan's acceptance criteria — not from a measurement in this plan
- **Suggested fix:** Add step 2.0 (or fold into 2.1): `pnpm test 2>&1 | tee /tmp/test-baseline.log | grep -E "tests|pass" | tail -5` to capture the actual baseline count and store it in a file before any amendments. The success criterion should be "same count as baseline" not "1380+".

---

## Finding 5: Phase 3 step 3.1 force-push destroys the broken PR #22's commit chain without rollback path

- **Severity:** Critical
- **Location:** Phase 3, step 3.1
- **Flaw:** Phase 3 step 3.1 instructs: `git checkout <hash-before-44b8d03> && git checkout -b 260629-2011-fallow-tools-v2-action-swap && git push --force-with-lease origin 260629-2011-fallow-tools-v2-action-swap`. The plan assumes the only commits between `<hash-before-44b8d03>` and `44b8d03` are the broken workflow change. But the plan also states the branch contains "Phase 3 of the prior plan (rule extension) and F-2 (baseline relocation) commit intact" — these may have been applied AFTER the broken commit, not before.
- **Failure scenario:** A developer has been working on a feature branch based on the broken-PR state (e.g., rebased their work-in-progress on top of `44b8d03`). The force-push in step 3.1 silently rewrites their `origin/260629-2011-fallow-tools-v2-action-swap` reference. Their local branch is now "ahead" of origin by the broken PR's commit, with no recovery path documented in the plan. When they `git pull`, Git either (a) refuses (if their branch has diverged), or (b) silently fast-forwards — neither is good. Their WIP may have been on top of broken-PR's commit; if their work depended on the new workflow being present (unlikely but possible), they lose that. The plan mentions no git-reflog recovery, no `git push --force-with-lease` abort path, no coordination with other developers working on the branch.
- **Evidence:**
  - Phase 3 step 3.1: `git push --force-with-lease` — destructive operation with no documented abort path
  - Plan risk assessment (line 254-255): "Branch reset via force-push loses prior work" — but the mitigation is "verify with `git log --oneline -5`", which only verifies the LOCAL branch state, not that no remote collaborator is mid-work on the broken branch
- **Suggested fix:** Before force-push, run `git ls-remote origin 'refs/heads/260629-2011-*'` to enumerate ALL branches matching the prefix; require explicit confirmation that no WIP branches exist. Use `git push --force-with-lease --force-if-includes` (Git 2.30+) which checks the remote matches the expected local state. Document a `git reflog` recovery path.

---

## Finding 6: Phase 3 step 3.5 destructive test has no rollback branch protection

- **Severity:** Medium
- **Location:** Phase 3, step 3.5
- **Flaw:** Step 3.5 creates a new branch `260629-2011-fallow-tools-v2-action-swap-failure-test`, adds a deliberate fallow finding (`export const __test_orphan = 1;` to `tools/learning-loop-mastra/mastra/server.js`), pushes, opens a PR, then `gh pr close --delete-branch`. The plan does not specify what happens to `server.js` after the test PR is closed. If the cleanup script fails (network error, race condition with auto-merge), the orphan export remains in the repo on a stale branch.
- **Failure scenario:** The cleanup `gh pr close --delete-branch` succeeds for the GitHub PR but the local `git branch -D 260629-2011-fallow-tools-v2-action-swap-failure-test` is not part of the plan. The orphan export remains on the local clone. A subsequent `git pull` on `main` (after the recovery PR merges) does not touch the orphan branch. Eventually someone checks out the failure-test branch and the orphan export leaks back into their work via cherry-pick or merge.
- **Evidence:**
  - Phase 3 step 3.5: `echo "export const __test_orphan = 1;" >> tools/learning-loop-mastra/mastra/server.js` — modifies a tracked file with no documented revert step (other than `gh pr close --delete-branch`, which deletes the BRANCH but not the local file)
  - No `git checkout main` after the test PR
  - No `git branch -D 260629-2011-fallow-tools-v2-action-swap-failure-test` after the test PR
- **Suggested fix:** Wrap step 3.5 in a `git worktree add` so the failure-test branch lives in a separate directory and cannot leak back to the main checkout. Add an explicit `git checkout main && git branch -D ...` cleanup.

---

## Finding 7: The plan's "Code Scanning UI manual verification" (step 3.4) is unfalsifiable

- **Severity:** Medium
- **Location:** Phase 3, step 3.4
- **Flaw:** Step 3.4 says "Navigate to the new PR's Security tab → Code scanning alerts" and verify findings appear under `fallow` category. There is no automation to confirm this. If the implementer skips the manual check (or lies about doing it), the success criterion "Code Scanning UI shows category `fallow`" can be reported as PASS without any verification.
- **Failure scenario:** The recovery PR merges without anyone actually checking Code Scanning. If the upload step's `category: fallow` was silently lost (e.g., workflow parsing bug, indentation error in YAML), Code Scanning has no record at all. Operators discover the regression only when an actual finding needs triage.
- **Evidence:**
  - Phase 3 step 3.4: "Manual verification" — no grep/jq/script assertion
  - The plan's success criteria (line 243) accept "Code Scanning UI shows `category: fallow`" with no automated gate
- **Suggested fix:** Add a CLI checkable assertion using `gh api repos/{owner}/{repo}/code-scanning/alerts?state=open` to list alerts and assert at least one alert has `category: "fallow"`. Fail the gate if no alert exists or no alert has the expected category.

---

## Finding 8: The plan ignores Phase 1 → Phase 2 → Phase 3 abort semantics entirely

- **Severity:** High
- **Location:** Cross-phase (plan.md Dependencies section, phase-01/02/03 step ordering)
- **Flaw:** The plan declares `dependencies: ["phase-01..."]` and `dependencies: ["phase-02..."]` but does not specify what happens if Phase 1 partially completes (e.g., meta-state patch succeeds but the deep-dive §6.3 replacement fails). If Phase 1 fails midway, Phase 2 begins with stale evidence — the workflow change is still implemented but the documentation claim is half-updated.
- **Failure scenario:** Phase 1 step 1.2 (replace §6.3) succeeds but step 1.3 (replace §6.5) fails because the deep-dive report is mid-edit by another agent. Phase 2 begins, the workflow amendment ships, but the decision record still references the OLD §6.5 claim. Now the meta-state, the new workflow, and the half-updated deep-dive all disagree. A subsequent agent trying to audit the change finds inconsistent evidence.
- **Evidence:**
  - plan.md: `dependencies: ["phase-01..."]` — declarative, no abort semantics
  - Phase 1 step 1.5: meta-state patch with `mechanism_check: true` may fail if SP2 fingerprinting returns null (plan acknowledges this on line 173 but doesn't define what happens if other patches fail)
  - No `rollback:` field on any phase's frontmatter
- **Suggested fix:** Define explicit abort states per phase. For each step that mutates state, specify the inverse operation. Example: if Phase 1 step 1.2 succeeds but step 1.3 fails, the abort is "revert step 1.2 by restoring the original §6.3 text from git HEAD~1".

---

## Finding 9: The patch step's `set -euo pipefail` plus `jq` redirection can produce a silent partial-file write

- **Severity:** Medium
- **Location:** Phase 2, step 2.6 (jq patch step)
- **Flaw:** The script runs `jq '...' "$SARIF_INPUT" > "$SARIF_OUTPUT"`. With `set -euo pipefail`, jq's exit code propagates. BUT, if `$SARIF_INPUT` is empty string (the `steps.analyze.outputs.sarif` problem from Finding 1), the shell's behavior is to substitute the empty string into the command. jq receives no filename argument, reads from stdin (waits forever or reads empty), and `>` redirection still creates `$SARIF_OUTPUT` as an empty file. The `set -e` does NOT catch this because jq's exit code may be 0 (success on empty stdin). The patched file exists but is empty.
- **Failure scenario:** After Finding 1's `steps.analyze` issue, `SARIF_INPUT=""` and `SARIF_OUTPUT="fallow-results-patched.sarif"`. The patch step "succeeds" (exit 0). The upload step runs with `sarif_file: fallow-results-patched.sarif`. codeql-action/upload-sarif@v4 receives an empty file, fails with a different error message (e.g., "Invalid SARIF" or similar). The original PR #22 error about "multiple SARIF runs with the same category" does NOT reappear, so the recovery appears to fix a different problem — making diagnosis harder.
- **Evidence:**
  - Phase 2 step 2.6: `SARIF_INPUT="${{ steps.analyze.outputs.sarif }}"` — if the GitHub Actions expression evaluates to empty (Finding 1), the variable is empty
  - `set -euo pipefail` does not catch empty `$SARIF_INPUT`; jq with no args reads stdin
  - The plan's risk assessment (line 332) acknowledges "jq expression syntax error on the runner" but does NOT acknowledge the empty-input case
- **Suggested fix:** Add an explicit pre-check: `test -s "$SARIF_INPUT" || { echo "::error::SARIF_INPUT is empty or missing"; exit 1; }`. Use `jq ... > "$SARIF_OUTPUT.tmp" && mv "$SARIF_OUTPUT.tmp" "$SARIF_OUTPUT"` so a failed jq leaves no partial file at the final path.

---

## Finding 10: The plan's reported "Verification Results" in the validation log is a self-report, not an independent check

- **Severity:** Medium
- **Location:** plan.md, "Validation Log" section (lines 217-232)
- **Flaw:** The validation log claims "30 claims checked, 24 verified, 5 failed, 1 unverified". But this is the implementer's own self-report (from `/ck:plan validate`). The validation log lists corrections the implementer made (line 220-226) — all of which are path/line-number fixes. None of these are deep evidence checks. The plan's "Standard tier" verification claim is not backed by an independent reviewer.
- **Failure scenario:** The plan claims "codeql-action version was `@v4` assumption — confirmed via interview (Option 1: Pin `@v4`)". But the plan never opens `github/codeql-action/src/sarif/index.ts` to verify the `createRunKey` function exists at the claimed location. The deep-dive report (which the plan cites) is itself being corrected in Phase 1 step 1.2. If the deep-dive's source citations are wrong, the corrections propagate the wrong citation forward.
- **Evidence:**
  - plan.md line 218: "Tier: Standard (3 phases)" — Standard tier per the verifier role definitions should include fact-checking. The validation log doesn't show independent file:line evidence collection
  - The validation log lists corrections but no NEW citations
- **Suggested fix:** This is a meta-finding that doesn't block implementation, but the planner should be aware that the validation log provides false confidence. Each corrected citation (e.g., `crates/api/src/audit_output.rs::build_audit_sarif`) should have a grep-verified existence check before the plan ships.

---

## Summary

**Critical (must fix before implementation):** 2 — Findings 1, 5
**High (significant risk):** 4 — Findings 2, 3, 4, 8
**Medium (notable concern):** 4 — Findings 6, 7, 9, 10

**Top blockers:**
1. Finding 1: `steps.analyze.outputs.sarif` is referenced but no `id: analyze` exists. The patch step cannot read a SARIF file that doesn't exist as a variable. The pre-existing failure-upload reference also relies on this same broken reference.
2. Finding 5: Phase 3 force-push with no rollback coordination for in-flight WIP branches.

**Top design defects:**
1. Finding 2: The "idempotency" claim silently fails on `automationDetails: {}` (empty object).
2. Finding 3: The classifier's prefix map was never validated against ALL rules in `runs[].tool.driver.rules[]`, only `rules[0]`.

## Unresolved Questions

1. **Where does `steps.analyze.outputs.sarif` resolve to?** If the Action's composite does expose an internal `id: analyze`, this is non-standard GitHub Actions behavior. If it does not, every reference in the plan is broken.
2. **What happens if Phase 1's meta-state patch fails on SP2 fingerprinting?** The plan's mitigation is "fall back to `meta_state_report` with a new entry id and link the old one via `reopens`" — but this is the implementer's ad-hoc recovery, not a tested path.
3. **Is the live SARIF file representative of CI's SARIF?** The plan validates against `tools/learning-loop-mastra/reports/fallow/audit.sarif` (locally generated) but the CI runs against `fallow-rs/fallow@v2` Action with potentially different `artifacts-dir` and `--changed-since <base.sha>` semantics. If the Action emits a different SARIF structure (e.g., 2-run case without dupes), the smoke test does not exercise it.
4. **What is the test count baseline?** Plan asserts "1380+" but never measured.
