# Red-Team Review — Phase E Dead-Code Sweep Plan

**Reviewer:** code-reviewer (adversarial)
**Date:** 2026-06-27
**Plan:** plans/260627-2042-phase-e-dead-code-sweep/
**Source plan dir:** plans/260627-2042-phase-e-dead-code-sweep/
**Reports dir for this plan:** plans/260627-2042-phase-e-dead-code-sweep/reports/

## Scope verification

- Files reviewed: `plan.md`, `phase-01..05-*.md`, `tasks.md`, `reports/researcher-260627-fallow-config.md`, `reports/researcher-260627-codebase-audit.md`, parent `plans/reports/brainstorm-260627-1246-phase-e-implicit-topology-refactor-report.md` §5 (Phase 2.5).
- Cross-checked against live tree: 4 deletion targets all exist (`core/list-probes.js`, `__tests__/legacy-mcp/list-probes.test.js`, `core/lib/source-ref-validator.js`, `core/lib/source-ref-validator.test.js`); placement.yaml:96-98 contains the `list-probes.js` row; docs/placement.md:37 lists `list-probes.js` in the `helper` row.
- CI workflow exists at `.github/workflows/test.yml` and `.github/workflows/meta-state-pr-body-advisory.yml` — Phase 4 step 0's "find the actual CI workflow file" is real work, not assumed.
- `.gitignore` has no `.fallow` entries — Phase 4 step 2's gitignore edits are confirmed necessary.

## Findings (12 max, sorted by severity)

### R-CRIT-1: Test discovery claim about `core/__tests__/` is unverifiable; may make Phase 5 acceptance gate unmeetable
- **Severity:** CRITICAL
- **Location:** phase-05-phase-05-verification.md:L46-49 (the "Step 1 — Run the full test suite" paragraph)
- **Issue:** Phase 5 asserts a test count delta of "0 (the 2 deletions removed 3 legacy-mcp test cases from `__tests__/legacy-mcp/list-probes.test.js`; 24 test cases from `core/lib/source-ref-validator.test.js` were never in the CI runner because the runner excludes `core/__tests__/` per the existing namespaced test discovery — verify by inspecting runner config)." This is an unverified claim embedded in an acceptance criterion. Phase 3's success criterion is "Full test suite passes" with no mention of a baseline; Phase 5 inherits that ambiguity. If `core/__tests__/` IS in the runner, removing `source-ref-validator.test.js` will drop 24 tests; the success criterion "compare against the baseline count" will fail not because of a regression but because the count drops.
- **Fix:** Make the test-discovery claim an explicit step in Phase 1 ("Inspect runner config; confirm whether `core/__tests__/*.test.js` is collected"). If it is, the deletion count includes 24 test removals; update Phase 5's "Net delta: 0" claim to "Net delta: −24" and add a fallback (keep `source-ref-validator.test.js` if test discovery was wrong). The parent phase-e plan's "1189+" baseline placeholder (`brainstorm-260627-1246...` §3 Mechanism B) is the actual measured count and should be cited by line number, not by parenthetical reference.
- **Disposition:** pending

### R-CRIT-2: `core/README.md` admission rule depends on Mechanism A already shipped — circular dependency risk
- **Severity:** CRITICAL
- **Location:** plan.md:L45, phase-05-phase-05-verification.md:L88-117
- **Issue:** Phase 5 step 4 writes the admission rule to `core/README.md` saying "the placement manifest (Mechanism A from the phase-E implicit-topology refactor) prevents *new* accumulation." The plan's Dependencies section declares `260627-1304-phase-e-topology-mechanism-a-b` as "(done — placement manifest exists)." But Phase 3 of THIS plan deletes `list-probes.js` — which IS in `core/placement.yaml:96-98` and IS in the `helper` role taxonomy (`docs/placement.md:37`). If the parent plan shipped Mechanism A with a test that asserts "every core file appears in manifest," the deletion here must be coordinated with that test update. The plan does not name the FCIS invariant test or the placement-manifest test as a Phase 3 step.
- **Fix:** Add an explicit Phase 3 step: "Run `__tests__/phase-e-foundation/fcis-invariant.test.js` (or whichever test asserts manifest<->file bijection); expect a failure on `list-probes.js`; delete the manifest row; re-run; expect green." Cite the test file path explicitly so the implementer can find it.
- **Disposition:** pending

### R-HIGH-1: `fallow audit` will reject the `--gate new-only` + `--changed-since origin/main` shape on fork PRs and the fallback is gated on detection, not failure
- **Severity:** HIGH
- **Location:** phase-04-phase-04-ci-guard.md:L117-141, R3 mitigation
- **Issue:** The plan uses `--changed-since origin/main` explicitly, which is the documented fork-PR failure mode (`reports/researcher-260627-fallow-config.md` §6.12). R3 mitigation says "fallow docs note this; the action auto-detects in PR context. If fork PRs break, switch to `--changed-since ${{ github.event.pull_request.base.sha }}`." But "the action auto-detects in PR context" is not a documented behavior — it's a guess from `fallow audit --help`. Passing BOTH `--changed-since origin/main` AND relying on auto-detection means a fork PR with `origin/main` permission issues will fail unpredictably. Worse, Phase 4 has no synthetic fork-PR negative test (Step 5 only tests first-party PRs).
- **Fix:** Pin `--changed-since ${{ github.event.pull_request.base.sha }}` from the start (works for both first-party and fork PRs when secrets are present; fall back to `origin/main` only on `push`). Alternatively, use `FALLOW_AUDIT_BASE` env var and let the audit default handle it. Drop the R3 "if fork PRs break" hedge — make the correct call now.
- **Disposition:** pending

### R-HIGH-2: Baseline reconciliation is structurally impossible if fallow's `dynamicallyLoaded` glob fails — and the plan silently promotes the explicit-list fallback to a CI invariant
- **Severity:** HIGH
- **Location:** phase-01-phase-01-foundation.md:L147-148 (Step 4 fallback), plan.md:L100-103 (key decision 1)
- **Issue:** R1 mitigation in Phase 1 says "if globs in `dynamicallyLoaded` fail, replace the glob with an explicit per-file list generated from `jq`." If this fallback fires, the explicit list must be kept in sync with `tools/manifest.json` rows forever. The plan's CI guard does NOT include a check that "manifest rows == dynamicallyLoaded rows." So: manifest grows → new wrapper is un-credited → fallow flags it as dead → CI guard blocks the PR. The "fix" forces the contributor to hand-edit `.fallowrc.json`. This is a regression of the placement manifest's whole point (machine-consultable topology).
- **Fix:** Add a Phase 4 step (or Phase 1 acceptance test): write a small test in `__tests__/phase-e-foundation/` that asserts "every row of `tools/manifest.json` corresponds to a `dynamicallyLoaded` entry in `.fallowrc.json`." Use the same YAML-parsing pattern as `fcis-invariant.test.js`. Then the fallback list is testable, not hand-maintained.
- **Disposition:** pending

### R-HIGH-3: `tasks.md` rows 5 and 6 will likely trigger Phase 5 fail-loud — but Phase 5 has no concrete remediation path
- **Severity:** HIGH
- **Location:** tasks.md:L18-19 (rows 5, 6), phase-03-phase-03-apply-triage.md:L91-96
- **Issue:** Rows 5 (`core/surfaces.js` SURFACES export) and 6 (`core/read-registry-cache.js` exports) are marked LIVE-with-verification. Phase 3 step 5 runs a grep. If the grep shows "only `core/meta-state.js` callers," they're marked LIVE. But the static audit (`researcher-260627-codebase-audit.md` §7 limitations) admits "Did not trace every indirect consumer transitively (e.g., `core/surfaces.js` callers were not exhaustively grepped)." So this verification is incomplete by the auditor's own admission. If fallow disagrees (fallow DOES catch transitive-only-as-unused — see `fallow-config.md` §6.6), the row becomes `⚠ disputed` and Phase 3 "STOP" instructions fire. Phase 5 then expects "every row ☑ or archived" but has no path to archive rows 5/6 if they're genuinely LIVE-by-fallow-bug.
- **Fix:** Either (a) pre-emptively add a Phase 3 sub-step that adds a `// fallow: ignore-exports [reason]` suppression to the two files with a one-line test asserting the suppression is justified, OR (b) explicitly define the ⚠ disputed outcome for rows 5/6: "these stay ⚠ in tasks.md; Phase 5 closes with two ⚠ rows documented and the admission rule softened for transitive-only modules." Option (b) is more honest given fallow's known limitation.
- **Disposition:** pending

### R-HIGH-4: CI guard is bypassable — `ignorePatterns` excludes paths contributors can write to, allowing silent dead-code reintroduction
- **Severity:** HIGH
- **Location:** phase-01-phase-01-foundation.md:L99-112 (ignorePatterns list), plan.md:L142 (admission rule)
- **Issue:** The admission rule says "a module belongs in `core/` only if a non-test, non-fixture import site uses it." But `ignorePatterns` excludes `__tests__/legacy-mcp/**`, `tools/legacy/evals/**`, `tools/legacy/references/**`, `tools/legacy/fixtures/**`, `scout/legacy/**`, `plans/**`, `docs/**`, and all `*.test.*`. A contributor wanting to land dead code can add it under any of these paths and the CI guard is blind. Worse, `tools/legacy/evals/**` and `tools/legacy/references/**` are paths where legitimate code can live — the static audit (`codebase-audit.md` §6.1) shows `scout/legacy/` fixtures are referenced by string metadata, but the audit did not confirm `evals/` or `references/` are doc-only.
- **Fix:** Audit every ignored path before this plan ships: for each, classify "doc-only" (safe to ignore) vs "code-bearing" (must NOT be ignored). Drop `tools/legacy/evals/**` and `tools/legacy/references/**` from `ignorePatterns` unless verified empty of real code. Add `ignoreExports` (fallow's narrower exclusion) where the file should still be analyzed but not flagged.
- **Disposition:** pending

### R-HIGH-5: Effort estimate for Phase 4 (0.25 day) is unrealistic — it undercounts the negative-test loop and SARIF wiring
- **Severity:** HIGH
- **Location:** phase-04-phase-04-ci-guard.md:L7 (effort), Phase 4 Steps 1-7
- **Issue:** Phase 4 has 7 steps including: regenerate 4 baselines (cold cache, no parallelism), edit .gitignore, edit workflow YAML, push a synthetic dead-file branch, watch CI run, push a positive-test branch, watch CI run, delete branches. Each CI run is ≥ 2-5 min for this repo's matrix (verify by reading `.github/workflows/test.yml`). Total wall time alone for steps 5-7 is ~15-20 min, plus iteration if the negative test unexpectedly passes (e.g., if `_fallow-test-tmp.js` is mis-spelled and ignored, or if `--gate new-only` lets the file slip through). The plan has no "budget for re-run" in the estimate.
- **Fix:** Bump Phase 4 to 0.5 day. Document the iteration loop explicitly: "if the negative test passes (CI green on dead file), debug; do not close phase until green-on-positive AND red-on-negative are both observed."
- **Disposition:** pending

### R-MED-1: Manifest path comment explains WHAT but not WHY — leaves the future reader one Google search away
- **Severity:** MEDIUM
- **Location:** phase-01-phase-01-foundation.md:L55-64 (Step 1 comment block)
- **Issue:** The proposed comment says "// NOTE: paths here are the CANONICAL names; the loader at mastra/server.js:26-27 rewrites 'tools/X-tool.js' → '../tools/legacy/X-tool.js' at import time." This explains the rewrite but not the historical reason. A future contributor seeing `tools/X-tool.js` in the manifest and `tools/legacy/X-tool.js` on disk will still wonder: "Why not move the files to match? Why this indirection?" The answer (legacy MCP substrate stability — see `codebase-audit.md` §6.5) is not in the comment.
- **Fix:** Extend the comment by 2 lines: "// The tools/ → tools/legacy/ split preserves the original MCP substrate filenames as the canonical tool IDs (gate-tool, meta-state-list, etc.) while letting the legacy wrappers live in a subdirectory. The loader at mastra/server.js:26-27 does the rewrite." This is the kind of "explains the invariant or behavior directly" comment that survives session boundaries (per `review-audit-self-decision.md`).
- **Disposition:** pending

### R-MED-2: `tasks.md` does not include an explicit row for the placement-manifest test update — risks orphaning the Mechanism A invariant
- **Severity:** MEDIUM
- **Location:** tasks.md (no row found for the FCIS/placement-manifest test)
- **Issue:** Related to R-CRIT-2 but at the tasks.md granularity. If Phase 3 deletes `list-probes.js` without updating the test that asserts "every core file appears in manifest," CI fails for a reason that looks like a Phase E Mechanism A regression but is actually expected Phase 3 work. There is no row that says "Update `__tests__/phase-e-foundation/fcis-invariant.test.js` (or sibling) to reflect the deletion." The plan hides the cross-cutting test update inside the unnamed "Phase 3 step" that R-CRIT-2 calls out.
- **Fix:** Add tasks.md row: `| 16 | __tests__/phase-e-foundation/fcis-invariant.test.js (placement-manifest section) | LIVE | n/a | Drop list-probes assertion (or update fixture to expect 27 not 28 files) | n/a | ☐ (Phase 3) |`.
- **Disposition:** pending

### R-MED-3: Fallow version drift between local (2.102.0) and CI is unaddressed — the plan commits a `.fallowrc.json` with no version pin
- **Severity:** MEDIUM
- **Location:** phase-01-phase-01-foundation.md:L78-138 (config), plan.md:R6 (CI slowness, not version)
- **Issue:** `fallow-config.md` §1 header verifies `fallow 2.102.0` locally but the plan never pins the CI version. The `$schema` URL points at `fallow-rs/fallow/main/schema.json` — meaning "latest main" in CI. A fallow minor release that renames `dynamicallyLoaded` to `dynamicEntries` would silently break the CI guard with no local warning (because local `2.102.0` is older). There is no mention of `package.json#devDependencies.fallow` or a CI step that prints `fallow --version` for diagnosis.
- **Fix:** Add to the `.fallowrc.json` block (or the CI workflow): `fallow --version` as the first step. Pin `pnpm install` to install fallow via the `engines` field or a `packageManager` constraint. The `cache` action referenced in R1 should also include fallow's resolved version, not just `pnpm` cache.
- **Disposition:** pending

### R-LOW-1: Naming hygiene — `phase-XX-phase-XX-<slug>.md` doubles the word "phase"
- **Severity:** LOW
- **Location:** phase-01-phase-01-foundation.md:filename, all 5 phase files
- **Issue:** The plan files are named `phase-01-phase-01-foundation.md` (and similar). The "phase-01" prefix is duplicated — once from the convention `phase-XX-` and once from the YAML frontmatter `phase: 1` rendering as `phase-01`. The plan.md refers to them as `./phase-01-phase-01-foundation.md` etc. This violates the KISS rule and the project's own kebab-case convention from `development-rules.md`.
- **Fix:** Rename to `phase-01-foundation.md` etc. Update all internal links in `plan.md` and `tasks.md` (no external references use the doubled form yet). Alternative: drop the YAML `phase:` field rendering and keep only the filename prefix. Either is fine; the current doubled form is the worst of both worlds.
- **Disposition:** pending

### R-LOW-2: tasks.md status legend mentions "archived" but no archive directory is committed or described
- **Severity:** LOW
- **Location:** tasks.md:L8 (status legend), phase-03-phase-03-apply-triage.md:L30 ("operator decided ... no file moves to `_archive/`")
- **Issue:** The legend includes ❌ archived but Phase 3 explicitly says NO files will move to an archive. The "Archive log" section at tasks.md:L76-78 is dead code by the plan's own admission. The status legend misleads future readers ("can I archive this?") and invites scope drift.
- **Fix:** Either (a) drop ❌ from the legend and remove the Archive log section, OR (b) commit a `__tests__/_archive/legacy-cli-shims/README.md` placeholder as the brainstorm §5 Phase 2.5 sub-step 2 originally proposed. Pick one; do not leave both states implicit.
- **Disposition:** pending

## Quick-fix items (not in 12-cap)

- plan.md L138 acceptance criterion "Full test suite passes (baseline measured at Phase-0 of the parent phase-e plan; reference `260627-1304-phase-e-topology-mechanism-a-b/plan.md` for the captured count)" is an inter-plan reference. If the parent plan is renamed or restructured, this reference breaks silently. Use a numbered footnote or grep-anchored text.
- phase-02-phase-02-baseline-scan.md L162 uses `cp` to mirror `regression-baseline.json` into `.fallow/baselines/`. The Phase 4 step 1 then regenerates it. The cp is wasted work; either drop it (Phase 4 generates both copies in one step) or document that it's a Phase 2 artifact that gets overwritten in Phase 4 (currently ambiguous).
- phase-04-phase-04-ci-guard.md R5 hedges on `codeql-action/upload-sarif@v3` deprecation. `v3` is current as of 2026-01 but `v4` is in beta per GitHub docs (verify before merge). Either pin `@v3` with a calendar reminder, or move to `github/codeql-action/upload-sarif@v4` now to avoid the churn.
- plan.md L156 "**R6 (Phase 4) — `fallow audit` is slow on first run.**" is mislabeled: R6 is listed as Phase 4 but the risk in the description (cache amortization) applies equally to Phase 2. Either relabel R6 as a Phase 2+4 risk or split it.
- phase-01-phase-01-foundation.md Step 2 `pnpm install` does not specify `--frozen-lockfile`. The CI step uses `--frozen-lockfile` (phase-04 step 3); the local install should match to avoid local-vs-CI drift. Add the flag.

## Rejected findings (over-reach / KISS / already covered)

- **"Plan should also sweep `tools/legacy/scripts/`"** — out of scope per brainstorm §5 Phase 2.5 sub-step 2 which limits the sweep to `core/`. Reject.
- **"Add a fallow pre-commit hook"** — out of scope. The plan explicitly chose a PR-time guard per brainstorm §5 sub-step 3; pre-commit would be a different decision (and `.fallow-config.md` §4.4 says `dead-code --ci` is for lint-staged, `audit` is for PR — the plan is consistent).
- **"The plan should also delete `core/entry/*.js` files which are transitive-only"** — out of scope AND wrong. Per `codebase-audit.md` §8 step 6, the 4 entry/ factory files are Mechanism B's canonical API; the parent plan explicitly forbids touching them.
- **"effort estimates should use hours not days"** — bikeshed. The 0.5/0.5/0.25/0.25/0.25 day granularity is fine for a P2 plan.
- **"The plan should validate fallow's config-schema in CI as well as locally"** — already in Phase 4 step 3 (`fallow audit` validates implicitly) and `fallow-config.md` §6.13 confirms `fallow config-schema` is the local source of truth.
- **"`pnpm install --frozen-lockfile` is missing from Phase 1"** — promoted to quick-fix, not a numbered finding.

---

Status: DONE_WITH_CONCERNS
Summary: Plan is structurally sound (file-output discipline, deletion targets verified, parent dependencies correct) but has two CRITICAL gaps around test-discovery assumptions and the implicit cross-cutting test update for Mechanism A, plus four HIGH risks around fork-PR detection, dynamicallyLoaded sync, the ⚠ disputed path, and bypassable ignore patterns. Plan needs another revision pass before execution.
Concerns/Blockers: R-CRIT-1 (test discovery claim about `core/__tests__/`) must be resolved by reading the test runner config before Phase 1 ships — currently the implementer is asked to "verify by inspecting runner config" at Phase 5, which is too late. R-CRIT-2 must be resolved by either naming the Mechanism A test explicitly in Phase 3 steps or by deferring Phase 3 deletions until the parent plan's test is updated.
