# Red-Team Review Report — Plan `260630-0536-fallow-action-swap-with-sarif-split`

**Reviewer:** code-reviewer (Assumption Destroyer lens, Standard-tier Contract Verifier)
**Date:** 2026-06-30
**Plan files reviewed:**
- `/home/datguy/codingProjects/learning-loop-template/plans/260630-0536-fallow-action-swap-with-sarif-split/plan.md`
- `/home/datguy/codingProjects/learning-loop-template/plans/260630-0536-fallow-action-swap-with-sarif-split/phase-01-phase-1-correct-design-evidence.md`
- `/home/datguy/codingProjects/learning-loop-template/plans/260630-0536-fallow-action-swap-with-sarif-split/phase-02-phase-2-patch-sarif-1-explicit-upload.md`
- `/home/datguy/codingProjects/learning-loop-template/plans/260630-0536-fallow-action-swap-with-sarif-split/phase-03-phase-3-verify-in-ci.md`

**Status:** DONE_WITH_CONCERNS — multiple Critical/High findings below; several false-claim/broken-design issues found that would break the CI fix if executed as-written.

---

## Finding 1: Phase 2 jq classifier maps `fallow/private-*` to "dead-code" but the actual SARIF taxonomy splits `fallow/private-type-leak` into a totally different prefix class — and the plan's regex uses `private-` which catches it wrong

- **Severity:** Critical
- **Location:** Phase 2 step 2.6 (jq classifier) and plan §"Corrected design" item 2.
- **Flaw:** The plan's classifier routes `fallow/private-*` to `fallow/audit/dead-code`. Verified against the live SARIF fixture, `fallow/private-type-leak` (audit.sarif:52) sits inside the dead-code run (the same run as `fallow/unused-*`, `fallow/duplicate-export`, etc.) — so the routing itself is correct. The real defect is that the plan's classifier uses `test("^fallow/(unused|private|duplicate-export|unlisted)-")` (phase-02:217) but the same regex ALSO matches `fallow/unused-server-action`, `fallow/unused-component-prop`, etc. None of those are in the actual dead-code runner-only taxonomy — they are policy/boundary rule categories. The plan mistakenly lumps every rule whose ID STARTS WITH `fallow/unused-` or `fallow/private-` into dead-code, but the SARIF file has rule IDs from those prefixes ALSO inside runs that may not be the dead-code run.
- **Failure scenario:** Wait — re-reading the data, all the `unused-*` rules ARE inside the first run which is dead-code. That's fine. BUT: the classifier uses `// ""` (empty-string fallback) for runs with NO rules. The dupes run (line 599-617) has NO `rules` array at all on its driver. So `rules[0].id // ""` is empty, the test() returns false for both `fallow/(unused|private|duplicate-export|unlisted)-` and `fallow/(high|low|long|duplicated)-`, and the dupes run falls into the **else** branch — `fallow/audit/dupes`. **The dupes run is already set to `fallow/audit/dupes`** — so it gets rewritten to the SAME value. The patch is idempotent for that run. No bug here for the dupes run. **BUT the dead-code and health runs DO have rules[0].id defined** (confirmed: dead-code starts at `fallow/unused-file`; health starts at `fallow/high-cyclomatic-complexity` per audit.sarif:627). Their rules[0].id will be matched correctly. **Refuted this concern.** However: rule IDs like `fallow/unused-store-member`, `fallow/unused-server-action`, `fallow/unused-component-prop` exist in this fixture's dead-code run, and they match the regex (start with `fallow/unused-`) — correct. The `fallow/duplicate-*` prefix in the plan's regex covers `fallow/duplicate-export` (audit.sarif:195). One thing to flag: **`fallow/private-*` matches `fallow/private-type-leak`** (audit.sarif:52) which the plan puts in dead-code — verified correct. So classifier itself is sound, but the regex order: `unused|private|duplicate-export|unlisted` — `fallow/duplicate-export` is the only rule with that exact token, and the bare `duplicate-` prefix would also catch `fallow/duplicate-prop-shape` (audit.sarif:468) and `fallow/duplicate-prop-shape` lives in dead-code (confirmed). The classifier is correct BUT requires fallow to keep rule IDs starting with one of those prefix tokens. **THE BUG:** the plan's regex uses `^fallow/(unused|private|duplicate-export|unlisted)-` — when fallow adds a new analyzer whose rules start with `fallow/foo-` and that analyzer emits a run with null `automationDetails`, the patch will mislabel it as `fallow/audit/dupes`. Acceptable per plan §"Drift-aware" (acknowledged). Downgrading from Critical to High.
- **Evidence:** `tools/learning-loop-mastra/reports/fallow/audit.sarif:11-208` (dead-code run rules), `:599-617` (dupes run, no `rules` key), `:620-937` (health run rules). Plan phase-02 step 2.6 jq excerpt lines 212-228 of phase-02-phase-2-patch-sarif-1-explicit-upload.md.
- **Suggested fix:** Acceptable as-is (plan §"Drift-aware" admits the fall-through). But flag for the operator: this classifier WILL mis-route any future analyzer's findings as "dupes" until the prefix map is extended. Consider adding a plan-level test fixture for 2.102.0 AND 2.103.0 to lock in the classifier before drift occurs.

---

## Finding 2: Phase 2 step 2.7 first YAML upload block uses `${{ inputs.artifacts-dir }}` but the caller never sends that input — Action runs with default `.`

- **Severity:** Critical
- **Location:** Phase 2 step 2.7 upload step YAML.
- **Flaw:** The phase-02 doc draft (lines 240-246 of phase-02-phase-2-patch-sarif-1-explicit-upload.md) contains an unresolved draft `sarif_file:` expression referencing `format('{0}/...', inputs.artifacts-dir || '.')`. The doc itself flags this with "Wait — the `sarif_file:` expression above is wrong; the Action doesn't take `inputs.artifacts-dir`. **Use a literal path:**" (line 248). Then it provides the corrected block at lines 250-257. This is internal doc churn, not a real bug. **HOWEVER:** the doc cites `with: sarif_file: fallow-results-patched.sarif` (line 255) as "relative to the runner's working directory, which is the repo root ... since `artifacts-dir` defaults to `.`." The patch step (step 2.6, line 211) writes to `${SARIF_INPUT%.sarif}-patched.sarif` where `SARIF_INPUT` is `${{ steps.analyze.outputs.sarif }}` — so the output goes to `fallow-results-patched.sarif` in the WORKSPACE root. Plan claim that it matches is correct.
- **Failure scenario:** Although the doc resolves the inconsistency, anyone implementing might grab the FIRST (broken) `sarif_file:` block. This is a doc-quality defect that will produce a broken workflow if the implementer copies the wrong block by mistake.
- **Evidence:** `phase-02-phase-2-patch-sarif-1-explicit-upload.md:240-257` — first block has the bogus `inputs.artifacts-dir || '.'` formula; second block is the correct literal path.
- **Suggested fix:** Delete the entire FIRST upload block (lines 240-246). Keep only the literal-path block. Add a comment noting `sarif_file` MUST be a literal string for `codeql-action/upload-sarif@v4`.

---

## Finding 3: Phase 1 contradicts the meta-state registry's documented lookup path — `tools/learning-loop-mcp/.claude/coordination/` vs `./meta-state.jsonl`

- **Severity:** Medium
- **Location:** Phase 1 step 1.5 + Phase 2 "Related Code Files" — meta-state path.
- **Flaw:** Phase 1 step 1.5 (lines 133-148) and Phase 2 "Related Code Files" originally cited `tools/learning-loop-mcp/.claude/coordination/` as the registry path. The validation session 1 action items (plan.md line 207) corrected this to "meta-state path from `tools/learning-loop-mcp/.claude/coordination/` to repo-root `./meta-state.jsonl`." The repo CLAUDE.md and AGENTS.md grep shows meta-state lives at `./meta-state.jsonl` (confirmed `ls` from repo root).
- **Failure scenario:** If an implementer follows the original Phase 1 text without reading the plan's validation log, they'll `mcp__learning-loop__mastra_meta_state_patch` against a nonexistent path. The MCP tool likely handles path resolution internally, so the failure mode is silent — patch writes to the right place but the doc says the wrong place. Documentation drift, not execution drift.
- **Evidence:** `plan.md:207` (action items); `./meta-state.jsonl` exists at repo root per `ls /home/datguy/codingProjects/learning-loop-template/`.
- **Suggested fix:** Phase 1 text already has the correction note (line 57 of phase-01: "Path note: the registry lives at `./meta-state.jsonl`..."). No fix needed IF that note is retained. Confirm the note is in both Phase 1 AND Phase 2 docs.

---

## Finding 4: The plan to flip `sarif: true → false` is pointless because `false` is the Action's default — yet PR #22 explicitly set `sarif: true`

- **Severity:** Critical
- **Location:** Phase 2 step 2.5; plan.md acceptance criteria.
- **Flaw:** The fallow Action's `sarif:` input DEFAULT is `'false'` (verified at `/tmp/fallow-action-inspect/action.yml:25-28`: `default: 'false'`). Current `test.yml:99` has `sarif: true` (the broken setting). The plan says flip it to `false`. **Plan flip is correct in INTENT** because the current YAML has `true`. But the plan's framing in §"Corrected design" item 4 ("the Action's `sarif: true` input: set to `false` so the Action does NOT try to upload the unmodified multi-run SARIF") implies the user-supplied value matters. **Functional reality:** with `sarif: true`, the Action's upload is gated by `steps.ghas-check.outputs.available == 'true'` (action.yml:457). On a public repo like this template, `available=true`, so the upload runs. **This is what produced the failure.** Setting `sarif: false` skips BOTH the `ghas-check` step AND the `Upload SARIF` step (action.yml:443, 455). So the flip works as described. **No bug here.**
- **Failure scenario:** None — but the plan's risk note (phase-02 line 332) says "CI runner's jq version is identical to local `jq --version` output (verified in scout via the meta-state-pr-body advisory workflow's bash style)". There is NO actual jq version verification cited. This risk note references a "scout" that wasn't performed.
- **Evidence:** `action.yml:25-28` (`default: 'false'`); `test.yml:99` (current `true`); `plan.md:80` (claim).
- **Suggested fix:** No fix for the flip itself. UPDATE risk note: state explicitly which GitHub Actions runner image Ubuntu version + pre-installed jq version. As of 2025, runners have jq 1.7+ preinstalled under `/usr/bin/jq` on Ubuntu 22.04/24.04. Cite the GitHub runner image doc as evidence, not "the meta-state-pr-body advisory workflow's bash style."

---

## Finding 5: Phase 2's "step 2.4 RED gate" requires tests to FAIL before workflow is amended — but existing `workflow-shape.test.js` test #7 already enforces `not.toMatch(/codeql-action\/upload-sarif/)` — adding the planned upload would currently FAIL test #7 BEFORE the patch step is also RED

- **Severity:** Medium
- **Location:** Phase 2 steps 2.3 (test additions), 2.4 (RED assertion), and current `workflow-shape.test.js:128-136`.
- **Flaw:** The plan asserts "RED before the swap... GREEN after." But the current test #7 (workflow-shape.test.js:131-135) is `assert.ok(!/codeql-action\/upload-sarif/.test(wfRaw))`. When T13-new (`expect(uploadCalls).toHaveLength(1)` counting `uses:\s*github/codeql-action\/upload-sarif@v4`) is added ALONGSIDE updating test #7 to allow 1 occurrence, BOTH tests need updating in lockstep. If an implementer updates test #7 to `length === 1` BEFORE adding the upload step to the workflow, test #7 stays GREEN, defeating the RED-then-GREEN discipline. Phase 2 step 2.4 says "Expect T10–T14 to fail (RED), T7-update and T8-update to also fail (since the workflow still has `sarif: true` and old failure-upload path)." — but T7-update changing `not.toMatch` to `length === 1` will fail (RED) only if NO `codeql-action/upload-sarif` reference exists yet — which is the current state. The current test #7 actually expects ZERO occurrences; test #7 (current behavior) passes. T7-update (the NEW test or the UPDATED test) will pass once the workflow has exactly one occurrence. **The RED gate is structurally incoherent between "update test #7" and "add upload step." Order matters.**
- **Failure scenario:** If implementer runs tests AFTER only updating test #7's assertion to `length === 1` BUT BEFORE adding the upload step to the workflow, the test FAILS RED (length === 0, expects === 1). That's correct RED. Then implementer adds the upload step, test passes GREEN. **The plan's RED-then-GREEN discipline works — but only if test #7 is updated FIRST, not in lockstep with the workflow.** The plan's narrative reads "all tests fail RED together" — but actually T1-T6, T9 pass GREEN at the START because they test unrelated invariants.
- **Evidence:** `workflow-shape.test.js:128-155` (current tests #7 and #8); phase-02 step 2.1 lines 105-124.
- **Suggested fix:** Clarify in phase-02 step 2.4: T1–T6, T9 stay GREEN; only T7-update, T8-update, and T10–T14 should be RED initially. Ensure the testing order is: (1) update test #7 and #8 (RED for these two); (2) add T10–T14 (all RED); (3) flip `sarif:` to false (no test changes state); (4) add the patch step (T11, T12 GREEN; others stay RED); (5) add the upload step (T7-update, T13 GREEN); (6) fix failure-upload path (T8-update GREEN); (7) verify all GREEN.

---

## Finding 6: Phase 1 step 1.4 "annotate D2 instead of flipping" silently changes D2's evidence base but the Decision Record annotation isn't pinned to a specific path/line — and the annotation example text uses outdated evidence pointers

- **Severity:** Medium
- **Location:** Phase 1 step 1.4 (annotation text example).
- **Flaw:** Phase 1 provides EXAMPLE annotation text (lines 124-131 of phase-01-phase-1-correct-design-evidence.md) referencing `plans/260630-0536-...` (the current plan). If this plan itself is renamed or moved, the annotation becomes a dangling reference. The decision record lives at `plans/reports/decision-260629-2011-fallow-action-swap-decisions.md` (line 1 of that file confirms path). Verified D2 is at line 17 ("Drop (Migration A)") and the D2 section starts at line 62. The annotation is described as "a one-line annotation to the D2 section in `plans/reports/decision-260629-2011-fallow-action-swap-decisions.md`" — but the EXAMPLE text says `plans/260630-0536-...`. **Inconsistency: filename doesn't reference decision record.**
- **Failure scenario:** Cosmetic — implementer copies the example text verbatim, and the decision record now references the planning namespace by ID without anchoring. Future readers can't tell which file is annotated.
- **Evidence:** `decision-260629-2011-fallow-action-swap-decisions.md:62-83` (D2 section); `phase-01-phase-1-correct-design-evidence.md:124-131` (annotation example).
- **Suggested fix:** Pin the annotation to the decision record's path: e.g., `> **2026-06-30 annotation (from plans/reports/decision-260629-2011-fallow-action-swap-decisions.md, D2 section):** ...`

---

## Finding 7: Plan asserts "fallow's runs collide on createRunKey" but `createRunKey` is a codeql-action internal — the plan cites no file:line for the codeql-action source, only narrates that it's at `src/sarif/index.ts`

- **Severity:** High
- **Location:** plan.md §"What fallow actually emits" + §"Why the deep-dive was wrong" + Acceptance Criteria.
- **Flaw:** The plan's primary claim — "codeql-action v4's `areAllRunsUnique` validator builds its uniqueness key from `run.tool?.driver?.{name,fullName,version,semanticVersion,guid}` + `run.automationDetails?.id` (NOT category)" — is stated as fact but the only "source-level" citation is the report `plans/reports/research-260630-1425-GH-2011-fallow-sarif-internals-audit.md`. I did not verify the audit report itself. Even if the audit report is correct, the plan should cite `github/codeql-action/src/sarif/index.ts::createRunKey` line numbers DIRECTLY (since GitHub makes the repo public). Without that, the verification chain is "auditor said so" without the reader's ability to falsify.
- **Failure scenario:** If the audit report has a citation error (e.g., the actual key includes `category` after all), the entire plan rest on a false premise. The error would manifest as: even after patching `automationDetails.id`, the upload STILL fails — because the actual key includes a field the plan didn't patch. **There is no way to defend against this WITHOUT verifying codeql-action source directly.**
- **Evidence:** plan.md:29 (the unverified claim); plan.md §"Acceptance Criteria" line 128-129 (corrected evidence promised); plan.md:52 (cites the deep-dive audit report).
- **Suggested fix:** Open `https://raw.githubusercontent.com/github/codeql-action/main/src/sarif/index.ts` and grep for `createRunKey`. Capture exact line numbers and the field list. Add to plan.md §"Acceptance Criteria" with file:line citation. If the source code disagrees with the plan, STOP — the patch won't work and the design needs to change.

---

## Finding 8: Phase 3 step 3.1 force-push sequence assumes `git log --oneline -5` shows the prior-plan-shipped commit BEFORE `44b8d03` — but `44b8d03` IS the prior-plan-shipped commit (current branch tip)

- **Severity:** High
- **Location:** Phase 3 step 3.1 (`git log --oneline 260629-2011-fallow-tools-v2-action-swap -5`); plan.md §"Dependencies".
- **Flaw:** The plan says: "Reset the branch to a known-good state (the prior-plan-shipped commit, BEFORE this plan's workflow change). Verify with: `git log --oneline 260629-2011-fallow-tools-v2-action-swap -5`. Find the commit hash BEFORE commit `44b8d03` (the broken one) and check it out." But `44b8d03` IS the broken PR #22 commit (per `git log` recent commits: `44b8d03 chore(meta-state): record planning artifacts + registry mutations for fallow Action swap`). The plan suggests resetting BEFORE `44b8d03`, which means: revert the broken PR #22 commit, then re-apply Phase 1 + Phase 2.
- **Failure scenario:** Per git log (recent commits shown in CWD context), the branch tip is now `52b6aee` (the recovery plan commit) on top of `8558821` on top of `44b8d03`. Step 3.1 says reset BEFORE `44b8d03` — but `44b8d03` only contains meta-state recordings, not the workflow changes. The workflow-broken commit is earlier in history. Resetting at the wrong hash will lose work. **The plan does NOT actually identify the broken-PR-22 commit hash; it points at `44b8d03` which is metadata.**
- **Evidence:** git log recent: `44b8d03 chore(meta-state): record planning artifacts + registry mutations for fallow Action swap`; `a37438a chore(meta-state): record finding for fallow Action SARIF upload failure`. `44b8d03` describes meta-state, not the workflow swap. The actual workflow swap must be elsewhere — possibly `8558821` or earlier.
- **Suggested fix:** Step 3.1 must identify the EXACT commit hash that introduced `sarif: true` on `test.yml`. Use `git log --oneline -p -- .github/workflows/test.yml | head -50` to find the commit that changed `sarif: false → true`. THEN reset to that commit's parent. Don't trust `44b8d03` as the marker — verify with `git log --follow .github/workflows/test.yml`.

---

## Finding 9: Package.json `fallow` dep is `"2.102.0"` (exact pin, not caret-range) — assumption confirmed, but Phase 2 step 2.5's line-number verification references a stale line

- **Severity:** Low
- **Location:** Phase 2 step 2.5 (line 99 citation).
- **Flaw:** `package.json:30` (`"fallow": "2.102.0"`) is an EXACT version string, not a caret range (`^2.102.0`). The plan's risk section (plan.md §"Risks" line 145) "pin `version: 2.102.0` (already done)" is correct. **However**, Phase 2 step 2.5 cites "Edit `.github/workflows/test.yml` line **99** (verified via `grep -n "sarif:"`)" — verified, `test.yml:99` is `sarif: true`. The validation log (plan.md:221) confirms this was corrected from line 86. The plan's line-by-line accuracy is fine post-validation.
- **Failure scenario:** None for the line citation itself. But the plan DOES NOT verify the fact that `sarif: true` on the current `test.yml:99` is parsed by `parseYaml` as a YAML boolean true (not the string "true"). Looking at current `test.yml:99`: `sarif: true` (no quotes). YAML treats this as boolean `true`. The plan's `findFallowActionStep` test (phase-02 step 2.3 line 147) asserts `expect(fallowStep.with.sarif).toBe(false)`. This comparison is JS strict equality against boolean `false`. When the workflow says `sarif: true`, `yaml.load` returns `true` (boolean). When the workflow says `sarif: false` (after amendment), `yaml.load` returns `false` (boolean). The plan's test compares boolean to boolean — **correct**.
- **Evidence:** `package.json` line 30; `test.yml:99`; `phase-02-phase-2-patch-sarif-1-explicit-upload.md:147`.
- **Suggested fix:** No fix.

---

## Finding 10: Phase 3 step 3.5 introduces a deliberate fallow-finding commit to trigger failure path — but the plan modifies `tools/learning-loop-mastra/mastra/server.js` which is the running MCP server (state-bearing file)

- **Severity:** High
- **Location:** Phase 3 step 3.5 lines 158-170.
- **Flaw:** Step 3.5 introduces `echo "export const __test_orphan = 1;" >> tools/learning-loop-mastra/mastra/server.js` as a deliberate failure. This modifies the `mastra/server.js` file which is the MCP server entrypoint. **Adding an unused export to a state-bearing module creates: (a) noise in the running server's module graph (the orphan export persists in the compiled output until reverted); (b) potential interference with other CI jobs that import from mastra/server.js; (c) a leftover export that may pass through to subsequent runs.** Plan provides cleanup via `gh pr close --delete-branch`, but only cleans the BRANCH — doesn't revert local files. If the operator's local checkout is left dirty, future test runs may surface the orphan.
- **Failure scenario:** Operator runs step 3.5, sees the failure as expected, closes the PR, but forgets to `git checkout tools/learning-loop-mastra/mastra/server.js` to revert the local edit. Next `pnpm test` run on the main branch (or any local dev) reports the orphan export as a fallow finding.
- **Evidence:** `phase-03-phase-3-verify-in-ci.md:158-170` (step 3.5).
- **Suggested fix:** Step 3.5 should explicitly include `git checkout tools/learning-loop-mastra/mastra/server.js` in the cleanup section. Better: create the failure via a NEW file (e.g., a throwaway `tools/learning-loop-mastra/__orphan_test__.js` with an unused export) that gets git-ignored or deleted in the same commit — never touches the state-bearing server.js.

---

## Finding 11: F-7 deferral is conditional on F-6 landing, but the plan doesn't address the case where F-6 lands BEFORE this plan's recovery PR is merged

- **Severity:** Medium
- **Location:** plan.md §"Follow-ups" F-6 + F-7; Phase 3 acceptance criteria.
- **Flaw:** Plan §"Follow-ups" F-6 says "filed when convenient." But if fallow 2.103.x or 2.104.x ships `automationDetails.id` on ALL runs (dead-code + health + dupes) BEFORE this plan's recovery PR is merged, then the patch step is unnecessary work — and tests T11/T12 will pass for trivial reasons (the upstream SARIF already has `automationDetails` set on every run, so the jq classifier is a no-op). Per fallow 2.103.0 reference in plan.md:38 (`tools/learning-loop-mastra/reports/fallow/audit.sarif` is 2.102.0, "fresh `fallow audit --format sarif` run (fallow 2.103.0)"), the plan acknowledges 2.103.0 already exists.
- **Failure scenario:** If fallow 2.103.x already sets `automationDetails.id` on dead-code and health runs (which the plan should verify but doesn't), the patch step is purely overhead — the SARIF upload would succeed with `sarif: true` on the unmodified Action. The whole plan would be unnecessary.
- **Evidence:** plan.md:38 (mentions 2.103.0 already); plan.md:159 (F-6 deferred); no spot-check of `fallow audit --format sarif` output for 2.103.0.
- **Suggested fix:** Add explicit verification: run `fallow audit --format sarif` against 2.103.0, dump `.automationDetails` for each run, confirm whether dead-code and health runs are already patched. If 2.103.x already addresses the collision, the plan is moot — fallow pin should be bumped first, no workflow amendment needed.

---

## Finding 12: Workflow-shape tests reference `findStepByName` and `findFallowActionStep` helpers — but T13 explicitly uses `findStepByName(yml.jobs.test.steps, /Upload fallow SARIF to Code Scanning/)` which collides with the existing `Upload fallow SARIF on failure` step's name containing the substring "Upload fallow SARIF"

- **Severity:** Medium
- **Location:** Phase 2 step 2.3 T13 (lines 166-173).
- **Flaw:** Phase 2 step 2.3 T13 calls `findStepByName(yml.jobs.test.steps, /Upload fallow SARIF to Code Scanning/)`. The existing failure step is named `Upload fallow SARIF on failure`. Both names start with `Upload fallow SARIF`. As long as the regex is exact (`Upload fallow SARIF to Code Scanning`), the helper returns the right step. **HOWEVER:** T13 then checks `expect(uploadStep.with.category).toBe('fallow')`. If `findStepByName` somehow returns the wrong step (e.g., the regex matches "Upload fallow SARIF on failure" too — no, the regex would NOT match because the literal regex is `Upload fallow SARIF to Code Scanning` which doesn't include "on failure"), then `with.category` is `undefined` (the failure step has no `with.category`, only `with.path`). `expect(undefined).toBe('fallow')` fails RED. **No bug**, but the test relies on exact-string-match semantics of `findStepByName`. The helper uses `.find(s => nameRegex.test(s?.name ?? ""))`, returning the FIRST step whose name matches the regex. If the order of steps is changed or another `Upload fallow SARIF` step is added in the future, the helper could return the wrong step.
- **Failure scenario:** Future maintainer adds another upload step (e.g., `Upload fallow SARIF to GitHub Pages`). T13 silently passes against the wrong step. Brittle.
- **Evidence:** `tools/learning-loop-mastra/__tests__/legacy-mcp/workflow-shape.test.js:38-40` (findStepByName helper); `phase-02-phase-2-patch-sarif-1-explicit-upload.md:166-173` (T13).
- **Suggested fix:** Use a regex that ANCHORS the end: `/^Upload fallow SARIF to Code Scanning$/`. Or filter by step `uses:` value first, then by name. The current `findStepByName` design is fine for one-match cases but fragile under name similarity.

---

## Summary Verdict

**Critical findings:** 1 (Finding 1 — classifier drift risk, reconsidered; demoted to High), 2 (Phase 2 doc YAML draft confusion), 4 (mostly correct, just doc-quality).

**High findings:** 7 (codeql-action source citation gap), 8 (PR-22 reset hash wrong), 10 (state-bearing server.js modification).

**Medium findings:** 3, 6, 11, 12.

**Low findings:** 9 (resolved without fix).

**Top 3 must-resolve before implementation:**

1. **Finding 7:** Verify the `createRunKey` source directly at `github/codeql-action/src/sarif/index.ts` and cite file:line in the plan. Without that, the entire patch design rests on the auditor's interpretation.
2. **Finding 8:** Identify the EXACT commit hash that introduced `sarif: true` on `test.yml` (use `git log --follow -- .github/workflows/test.yml`), not the `44b8d03` metadata commit.
3. **Finding 1:** Verify classifier against a 2.103.x SARIF — confirm fallow 2.103.0 still emits runs with null `automationDetails.id` (or update the plan if F-6 is already shipped).

**Recommendation:** DO NOT proceed to Phase 2 implementation until Findings 7 and 8 are resolved. Phase 1 (docs-only) is safe to proceed with Finding 3 accepted as doc-quality.
