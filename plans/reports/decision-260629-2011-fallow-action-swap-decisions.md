# Phase 1 decision record: Migrate fallow audit gate to `fallow-rs/fallow@v2` Action

**Date:** 2026-06-29
**Plan:** `plans/260629-2011-fallow-tools-v2-action-swap/`
**Phase:** 1 (Research consolidation + operator decisions)
**Status:** COMPLETE — operator decisions 1-5 captured; Phase 2 unblocked

---

## Operator decisions (5)

The plan surfaced 4 unresolved decisions in `plan.md` §Open Questions + the journal's D1-D4 list. This phase records 5 decisions; the 5th (D5, "version source-of-truth") was raised by the operator during Phase 1 review when they noticed the plan's D1 would create a second source of truth for the fallow CLI version.

| # | Decision | Resolution | Operator override of plan recommendation? |
|---|----------|------------|---|
| D1 | Action pin strategy | **Pin to commit SHA + `version:` input is set dynamically from `package.json` `devDependencies.fallow` via a setup step** | **YES** — plan D1 said hard-code `version: "2.102.0"` in YAML; operator said consolidate to `package.json` so there's one bump site |
| D2 | Per-analyzer Code Scanning categories | **Drop (Migration A).** Single `category: fallow` from the Action's built-in upload. | No — plan recommendation stands |
| D3 | Baseline path style | **Relocate to `tools/learning-loop-mastra/baselines/fallow/`.** Path from `root: tools/learning-loop-mastra` becomes `baselines/fallow/{dead-code,health,dupes}-baseline.json`. | **YES** — plan D3 said keep `plans/260627-.../reports/fallow/*.json`; operator said CI must not depend on the plans folder |
| D4 | `sarif: true` on Action vs explicit upload | **Use `sarif: true`.** Action handles local SARIF generation + Code Scanning upload + availability probe in one input. | No — plan recommendation stands |
| D5 | Action step ID for `${{ steps.X.outputs.sarif }}` | **`steps.analyze.outputs.sarif`** (not `steps.fallow.outputs.sarif` as the plan's Phase 2 contract draft wrote). | **YES** — plan's draft was wrong; deep-dive §3 + §14.8 confirm the step id is `analyze` |

The plan's open question 2 (relocate baselines out of `plans/`) and open question 3 (`comments: true` on Action) are also answered:

- **Open Q 2 — relocate baselines.** **YES, relocate** (D3 above). Plan recommended NO; operator overrode.
- **Open Q 3 — `comments: true` on Action (PR-body summary).** **NO, leave as default `false` for this round.** Add in a follow-up if operators request. See §"Open question resolutions" below for the failure mode that justifies the deferral.

---

## D1 — Pin strategy + version source consolidation

**Decision:** Pin to commit SHA + set `version:` input dynamically from `package.json`.

**Operator's reasoning (verbatim from Phase 1 review):** "Could it be pinned into package.json, or vice versa? My reasoning: I don't want to manage two versions on 2 files."

**Implementation:**
1. Keep the project's `package.json:30` (`"fallow": "2.102.0"` in devDependencies) as the single source of truth for the CLI version.
2. Add a `Resolve fallow version` step BEFORE the Action invocation that reads `devDependencies.fallow` and exports the value as a step output.
3. Pass the output to the Action via `with: { version: ${{ steps.fallow-version.outputs.version }} }`.
4. The `fallow-rs/fallow@<commit-sha>` reference (the Action code pin) is a separate value and is hard-coded in YAML by design (see "Why two pins" below).

**Why two pins (and why `version:` cannot be elided):**
- `fallow-rs/fallow@<commit-sha>` pins the **Action's orchestration code** (`action.yml` + `action/scripts/*.sh`). SHA pin defends against Action code tampering / silent tag re-pushes. Source: deep-dive §5.1.
- `with.version` pins the **CLI binary** that the Action downloads at install time. The Action's `install.sh:50-79` falls through to `package.json` (if `version:` empty) → `latest`. With `version:` empty and `package.json` `fallow: "2.102.0"`, the Action installs 2.102.0 (no drift) — but this is implicit and survives only as long as the pin stays exact. Source: deep-dive §12.2, §12.5.
- Floating either pin is a different failure mode (Action code vs CLI binary). The deep-dive §5.4 enumerates the consequences.

**Why a setup step (vs hard-coding `"2.102.0"` in YAML):**
- Single bump site (operator's stated goal).
- Drift is visible in CI logs (if `package.json` is bumped and the Action's bundled version diverges, the `Resolve fallow version` step's output line shows the actual value).
- Reuses the Action's own §12.2 design (the Action already reads from `package.json` as a fallback) — we're making the implicit explicit, not introducing a new pattern.

**Verification path (D1):**
- `node -e 'console.log(require("./package.json").devDependencies.fallow)'` returns `2.102.0` on the current tree.
- Phase 4 test case (per deep-dive §3): assert `steps.fallow-version.outputs.version === package.json devDependencies.fallow`.
- Phase 5 end-to-end: confirm the first PR run on a no-change branch shows `version=2.102.0` in the workflow log.

**Trade-offs accepted:**
- +5 LoC for the setup step.
- A failure mode: if `package.json` `fallow` is moved to a non-standard location (e.g., nested under `tools/<pkg>/package.json` if the mastra package ever gets its own), the setup step's path must be updated. Mitigated by the test asserting the value is the package.json pin.

---

## D2 — Per-analyzer Code Scanning categories

**Decision:** Drop per-analyzer categories. Use the Action's built-in `sarif: true` upload which writes a single `category: fallow` entry to GitHub Code Scanning.

**Operator's reasoning:** "Drop categories; no comments (Migration A)" (Phase 1 review).

**Evidence (deep-dive §6.1, §6.3, §6.5):**
- The Action's `Upload SARIF` step at `action.yml:432-441` is hard-coded to `category: fallow`. There is no input that changes this.
- The Action collapses our current 3 categories (`fallow-deadcode`, `fallow-health`, `fallow-dupes`, per CI audit §1c) into 1. Migration A accepts this.
- `sarif: true` does both local SARIF generation AND Code Scanning upload in one input. Source: `analyze.sh:441-455` (fallback) + Upload step `if:` clause.
- The 3 current categories exist because the CodeQL Action v4 changelog (2025-07-21) enforces "one SARIF run per category per upload". The Action uses a different approach: `codeql-action/upload-sarif@v4` accepts multi-run SARIF when they share a category. Source: deep-dive §6.3.

**Trade-off accepted:**
- **Loss:** Code Scanning dashboard queries grouped by per-analyzer category (e.g., filter `category:fallow-deadcode`) break. Operators must navigate via SARIF `run.tool.driver.name` + finding `ruleId` instead.
- **Mitigation:** PR review findings still include the `command` field (deep-dive §3: outputs include `gate` and `verdict`); SARIF `run.tool.driver.name` distinguishes dead-code/health/dupes; finding description text names the analyzer.

**Verification path (D2):**
- Phase 4 test case: assert the `Upload SARIF` step in `test.yml` is the Action's (NOT a `github/codeql-action/upload-sarif@v4` direct invocation) — i.e., the explicit 3 `codeql-action/upload-sarif@v4` calls (current `test.yml:190-216`) are deleted.
- Phase 5 end-to-end: confirm first PR run shows SARIF in Code Scanning under a single `category: fallow` entry, and the SARIF file contains 3 runs (one per analyzer).

---

## D3 — Baseline path style

**Decision:** **Relocate baselines to `tools/learning-loop-mastra/baselines/fallow/`.** Phase 4 contract references the new paths; a separate follow-up commit physically moves the 3 baseline JSON files (out of scope for the CI swap).

**Operator's reasoning (verbatim):** "it's weird that github action yaml has to ref the plans folder like what plans/260629-2011-fallow-tools-v2-action-swap/phase-02-design.md design. The CI should be universal, not depending on plans folder, which is just a temporary file for planning"

**Why the operator's concern is correct (overrides plan D3):**
- The plan's "preserves audit trail" rationale for keeping baselines in `plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/` confuses **where the artifact was first generated** with **where it should live for production CI consumption**. The first is a planning concern; the second is an engineering concern.
- A CI workflow that hard-codes a path through a plans directory couples a permanent contract to a temporary artifact. Plans dirs get archived / deleted / reorganized; the CI must not.
- The natural home is **package-scoped**: each fallow-audited package gets its own `baselines/fallow/` directory beside `.fallowrc.json` and `reports/fallow/`. This is the universal pattern across fallow invocations.
- Adding a second fallow-audited package tomorrow (e.g., `tools/<another>/`) means another `<root>/baselines/fallow/` — not another plans-folder convention.

**Why the new location is technically safe (over the old plan dir):**
- **Outside fallow's auto-gitignored cache.** The plan-dir location was chosen specifically to avoid `<root>/.fallow/.gitignore: *` (consult-checklist `baseline-storage` rule, `meta-260628T1328Z`). The new location `tools/learning-loop-mastra/baselines/fallow/` is also outside `.fallow/` → unaffected by the auto-gitignore.
- **Tracked in git.** Verified via `git check-ignore` (CI audit §6 row 230: plan-dir baselines are tracked). The new in-package location will be tracked the same way.
- **Path resolution works.** The Action's `analyze.sh:194-196` passes baseline inputs verbatim to `fallow audit --<x>-baseline <path>`. Paths are relative to `root:` (which we set to `tools/learning-loop-mastra`), so the new in-package paths work as `baselines/fallow/{dead-code,health,dupes}-baseline.json` — no `..` traversal. Source: deep-dive §11.2, §11.5.

**Path-traversal constraint (D3 sub-evidence):**
- The Action's path-traversal check at `review.sh:39-42` applies ONLY to `inputs.root`, NOT to baseline inputs. `..` in baseline paths is permitted. Source: deep-dive §11.4.
- This is why the OLD `../../plans/...` paths were valid; they're not needed anymore under the new in-package convention.

**Migration plan (D3):**
- **Phase 4 (CI swap, in scope):** Update `test.yml` to reference the new paths: `baselines/fallow/{dead-code,health,dupes}-baseline.json` (relative to `root: tools/learning-loop-mastra`).
- **Follow-up commit (out of scope for this plan):** `git mv` the 3 baseline files from `plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/` to `tools/learning-loop-mastra/baselines/fallow/`. One commit, no other content.
- **Consult-checklist rule update (Phase 3, in scope):** Update the `baseline-storage` rule's "where to store" item from `plans/<plan-dir>/reports/fallow/` to `<root>/baselines/fallow/`. The rule's WHY (avoid fallow's auto-gitignore) stays the same; only the WHERE changes.

**Verification path (D3):**
- Phase 4 test cases (per `phase-04-implement-ci-swap.md`): the existing test cases (8 total) assert baseline paths in the workflow; updated to assert the new in-package paths.
- Phase 5 end-to-end: first PR run on a no-change branch reports `verdict=pass` and the Action loads baselines from the new location.

---

## D4 — `sarif: true` on Action vs explicit upload

**Decision:** Use `sarif: true`. Action handles local SARIF generation, the Code Scanning availability probe (`check-code-scanning.sh`), and the upload — all in one input.

**Operator's reasoning:** Implicit in the Migration A selection (Phase 1 review).

**Evidence (deep-dive §6.2, §6.4, §6.5):**
- `sarif: true` triggers both the local SARIF generation block in `analyze.sh:441-455` (fallback when `INPUT_FORMAT != "sarif"`) AND the Upload SARIF step's `if:` clause.
- The availability probe (`check-code-scanning.sh`) gracefully degrades on private/internal repos without GHAS: SARIF is still written to disk (consumable via `actions/upload-artifact` on failure); only the GitHub upload is skipped.
- No explicit `github/codeql-action/upload-sarif@v4` step is needed in the workflow.

**Trade-off accepted:**
- Loss of fine-grained control over the Upload step's `category:` value. Action hard-codes `category: fallow` (see D2).

**Verification path (D4):**
- Phase 4 test case: assert the workflow has no explicit `uses: github/codeql-action/upload-sarif@v4` step (current `test.yml:190-216` are deleted).
- Phase 5 end-to-end: confirm the first PR run on a public repo uploads SARIF to Code Scanning; on a private repo without GHAS, confirm `check-code-scanning.sh` outputs `available=false` and the SARIF file is still written to the artifacts dir for failure-upload.

---

## D5 — Action step ID for outputs

**Decision:** Use `steps.analyze.outputs.sarif` (NOT `steps.fallow.outputs.sarif`).

**Operator's reasoning (implicit):** Phase 1 review surfaced this as a contract correction. The plan's Phase 2 contract draft had it wrong.

**Evidence (deep-dive §3, §3.1, §14.8, §14.17):**
- `action.yml:357-360` declares the analyze step with `id: analyze`. The composite Action's step ID is the value of the `id:` field, not the Action's name.
- The Phase 2 contract draft (`phase-02-design.md:71`) wrote `path: ${{ steps.fallow.outputs.sarif }}`. This is wrong.
- Phase 4's risk section already flagged this as a known issue with a workaround: "if first run shows the path empty, change to `${{ steps.analyze.outputs.sarif }}`". The deep-dive confirms `analyze` is correct.
- Phase 4 test case (per `phase-04-implement-ci-swap.md` L100-103): assert `fail.path` matches `\$\{\{\s*steps\.analyze\.outputs\.sarif\s*\}\}` — the deep-dive's correction is already reflected in the existing test regex (which accepts both `fallow` and `analyze`; the contract is `analyze`).

**Verification path (D5):**
- Phase 4 test case: existing test at `phase-04-implement-ci-swap.md` L100-103 must be updated to assert `steps.analyze` (the regex currently uses `steps\.fallow` — see §"Phase 4 contract update" below).
- Phase 5 end-to-end: confirm the failure-upload step's path resolves to a real file on the first run.

---

## Cross-reference matrix (current hand-rolled → Action equivalent)

Reproduced from `phase-01-research.md` Implementation Step 3, with the D1-D5 decisions applied and the operator's override of D1 (setup step) and D3 (in-package baselines) reflected.

| Current (hand-rolled) | Action equivalent | Behavioral diff (after decisions) |
|---|---|---|
| `cd tools/learning-loop-mastra` + `pnpm exec fallow audit --root .` | `root: tools/learning-loop-mastra` | Same — explicit subdir instead of `cd` |
| `--gate new-only` | `gate: new-only` (explicit) | Same. Plan D stands. **Note:** `.fallowrc.json`'s `audit.gate` is NOT honored by Action (deep-dive §10.4); explicit input is required. |
| `--changed-since "${{ github.event.pull_request.base.sha }}"` | `auto-changed-since: true` (default) | Same — Action auto-uses PR base SHA |
| `--format sarif` | `format: sarif` | Same |
| `--output-file reports/fallow/audit.sarif` | (implicit via `artifacts-dir`) | Path changes from `tools/learning-loop-mastra/reports/fallow/audit.sarif` to `tools/learning-loop-mastra/fallow-results.sarif` (the Action's default `artifacts-dir` is `.`, joined to the `root` value). Failure-upload step points at `${{ steps.analyze.outputs.sarif }}` (D5). |
| `--{dead-code,health,dupes}-baseline ../../plans/.../reports/fallow/{...}.json` | `{dead-code,health,dupes}-baseline: baselines/fallow/{...}.json` (relative to `root`) | **Path changes** (D3). Old: plan-dir. New: in-package `baselines/fallow/`. Follow-up commit moves the JSON files. |
| (none) | `Resolve fallow version` setup step (D1) | **New step** — reads `package.json devDependencies.fallow` and outputs the value for the Action to consume. ~5 LoC. |
| (none) | `version: ${{ steps.fallow-version.outputs.version }}` | **New input** — pins CLI binary dynamically from package.json. Replaces the plan D1's hard-coded `version: "2.102.0"`. |
| (none) | `sarif: true` (D4) | **New input** — Action uploads SARIF to Code Scanning under `category: fallow`. |
| Python heredoc `classify()` + 3 split SARIF writes | Action handles SARIF generation (deep-dive §6.2) | **Python deleted.** 110 LoC removed. |
| 3× `github/codeql-action/upload-sarif@v4` | Action's built-in `Upload SARIF` step | **3 calls → 1 call.** Per-analyzer categories collapse to 1 `category: fallow` (D2). |
| `actions/upload-artifact@v7` for SARIF on failure | Same step, re-pointed at `${{ steps.analyze.outputs.sarif }}` (D5) | Preserved (12 LoC). Path changes. |
| `actions/upload-artifact@v7` for per-namespace logs on failure | Same step, unchanged | Preserved (8 LoC). |
| (no `permissions:` block) | `permissions: { contents: read, security-events: write }` | **New block.** `security-events: write` is the only new scope (deep-dive §7.4). |

---

## Open question resolutions (from `plan.md` §Open Questions)

### Q1 — Does the Action v2 track `latest` (2.103.0) regardless of project `fallow` spec?

**Resolved (no longer open).** Source: deep-dive §12.2, §12.3, §12.4.

The Action's `install.sh:50-79` resolution order is:
1. `inputs.version` (the `with.version` input) — wins.
2. `inputs.root/package.json` `fallow` dep — fallback.
3. `"latest"` — last resort.

With the D1 decision (`with.version` is set from `package.json devDependencies.fallow`), drift is impossible: the version is always exactly what `package.json` says. The deep-dive §12.4 risk of "what if the pin is removed?" is moot — the setup step reads the pin; if the pin is missing, the setup step fails fast with a clear error.

### Q2 — Should we relocate baselines from `plans/.../reports/fallow/` to `tools/learning-loop-mastra/.fallow-baselines/`?

**Resolved by D3.** Relocate, but to `tools/learning-loop-mastra/baselines/fallow/` (NOT `.fallow-baselines/`, which would fall under fallow's auto-gitignore at `<root>/.fallow/.gitignore: *`).

The plan's recommendation (NO) was based on "preserves audit trail in plan dir". This rationale conflated planning-time provenance with production-CI consumption. The operator's concern (CI must not depend on the plans folder) overrides.

### Q3 — Should we keep `comments: true` on the Action?

**Resolved: NO for this round.** Add in a follow-up if operators request.

**Why not now:**
- `comment: true` (sticky PR-body comment) requires `pull-requests: write`. Source: deep-dive §9.1. Fork PRs run with read-only tokens; the call returns 403 and the step emits a warning. Our workflow runs against external PRs from forks; this is a real (degraded, not broken) state.
- `review-comments: true` has the same fork-PR failure mode (deep-dive §9.2).
- `annotations: true` (the default) is the right knob for our use case — it uses workflow commands, NOT API calls, so it works on fork PRs without elevated permissions. Source: deep-dive §9.3, §9.5.
- The current workflow does NOT post comments; the Phase 4 contract preserves that behavior. Adding `comments: true` in this round is feature creep, not a swap-preserve.

**Trade-off accepted:** Operators reading PRs will see inline annotations (red squiggles on the Files view) but no PR-body summary. If operators request a PR-body summary, add `comment: true` in a follow-up — but also grant `pull-requests: write` to the workflow's GITHUB_TOKEN (separate decision, may affect repo security posture).

---

## Phase 4 contract (verbatim, for Phase 2 to ratify)

The full Phase 4 implementation contract — the exact YAML shape Phase 4 will write to `.github/workflows/test.yml` — follows. Differences from the plan's draft are marked `[CHANGED]`.

```yaml
# Inserted after `timeout-minutes: 30` at test.yml:27:
        permissions:
          contents: read
          security-events: write

# Replaces test.yml:62-237 (176 LoC) with the following ~40 LoC:
      - name: Resolve fallow version
        # D1: Read the CLI version from package.json so there's one bump site.
        # The fallow-rs/fallow Action's `version:` input pins the CLI binary;
        # floating this is the same drift class this plan closes (deep-dive §5.4,
        # §12.5). The package.json `fallow` dep is the source of truth.
        id: fallow-version
        run: |
          version=$(node -e 'console.log(require("./package.json").devDependencies.fallow)')
          if [ -z "$version" ]; then
            echo "::error::package.json devDependencies.fallow is missing or empty"
            exit 1
          fi
          echo "version=$version" >> "$GITHUB_OUTPUT"
          echo "Resolved fallow version: $version"

      - name: Fallow audit (PR gate)
        if: github.event_name == 'pull_request'
        uses: fallow-rs/fallow@<commit-sha-resolved-in-phase-2>
        with:
          root: tools/learning-loop-mastra
          command: audit
          gate: new-only
          format: sarif
          sarif: true
          version: ${{ steps.fallow-version.outputs.version }}
          # D3: Baselines moved from plans/<plan-dir>/reports/fallow/ to
          # in-package baselines/fallow/. Path is relative to `root`.
          # Follow-up commit moves the JSON files (out of scope for this plan).
          dead-code-baseline: baselines/fallow/dead-code-baseline.json
          health-baseline:    baselines/fallow/health-baseline.json
          dupes-baseline:     baselines/fallow/dupes-baseline.json

      - name: Upload per-namespace logs on failure
        if: failure()
        uses: actions/upload-artifact@v7
        with:
          name: test-logs
          path: .test-logs/
          if-no-files-found: ignore
          retention-days: 7

      - name: Upload fallow SARIF on failure
        # D5: Step ID is `analyze` (action.yml:357-360), NOT `fallow`.
        # The plan's draft wrote `steps.fallow.outputs.sarif`; deep-dive §14.8
        # + §14.17 confirm `analyze` is correct. Path is the Action's
        # `artifacts-dir` value joined to `root`.
        if: failure()
        uses: actions/upload-artifact@v7
        with:
          name: fallow-sarif
          path: ${{ steps.analyze.outputs.sarif }}
          if-no-files-found: ignore
          retention-days: 7
```

**Phase 4 contract update vs plan draft:**
- `phase-02-design.md:71` (and `phase-04-implement-ci-swap.md:153`) wrote `${{ steps.fallow.outputs.sarif }}` — **incorrect**. Phase 4 must use `${{ steps.analyze.outputs.sarif }}` (D5). The existing test at `phase-04-implement-ci-swap.md:100-103` already accepts either form but should be tightened to `analyze` only.
- `phase-02-design.md:62-64` (and `phase-04-implement-ci-swap.md:130-132`) wrote baseline paths as `../../plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/{...}.json` — **replaced** with `baselines/fallow/{...}.json` (D3).
- `phase-02-design.md:69` (and `phase-04-implement-ci-swap.md:129`) wrote `version: "2.102.0"` literally — **replaced** with the setup step's output (D1). The setup step is new.
- `phase-02-design.md:79-81` (and `phase-04-implement-ci-swap.md:114-116`) wrote `permissions: { contents: read, security-events: write }` — **unchanged** (deep-dive §7.4 confirms only this scope is new).

---

## Items flagged in deep-dive §14 that this decision record does NOT change

These are operational details that Phase 4 implementers must handle; no operator decision is needed.

- **§14.7 `cache-key-prefix` does not exist** — `action.yml:345-352` hard-codes the cache key prefix as `fallow-cache-`. There is no `cache-key-prefix` input. The plan's risk section (`plan.md:86`) mentioned it as a hypothetical override; that override is a no-op. Phase 4 contract does not set it.
- **§14.9 fallow 2.103.0 typed-output impact on baselines** — `CHANGELOG.md` notes "Typed output contracts now feed the CLI, LSP, NAPI, MCP, and programmatic callers through shared typed contracts". This may shift attribute paths (e.g., `.check.total_issues` → `.check.totalIssues`). The D1 setup step pins to whatever `package.json` says (currently 2.102.0); if `package.json` is bumped to 2.103.0, the baselines generated against 2.102.0 may need regeneration. **Out of scope for this plan.** If a follow-up bumps `package.json`, add a one-line task to regenerate the 3 baseline JSONs and commit them.
- **§14.8 step ID is `analyze`, not `fallow`** — addressed by D5; Phase 4 contract updated.

---

## Verification sources

| Source | Path / URL | Used for |
|---|---|---|
| Phase 1 spec | `plans/260629-2011-fallow-tools-v2-action-swap/phase-01-research.md` | TDD gate; cross-reference matrix; cross-reference of plan's open questions |
| Plan overview | `plans/260629-2011-fallow-tools-v2-action-swap/plan.md` | D1-D4 baseline recommendations, architecture, open questions |
| Phase 2 design draft | `plans/260629-2011-fallow-tools-v2-action-swap/phase-02-design.md` | Phase 4 contract skeleton (overridden by D1, D3, D5) |
| Phase 4 implement | `plans/260629-2011-fallow-tools-v2-action-swap/phase-04-implement-ci-swap.md` | Test cases (8 total); risk section; comment justifications |
| Sibling CI audit | `plans/reports/researcher-260629-2021-current-fallow-ci-audit-report.md` | Current behavior baseline; flag inventory; consult-checklist rule history |
| Sibling deep-dive | `plans/reports/researcher-260629-2011-fallow-tools-v2-action-deep-dive-report.md` | D1-D5 evidence; §5 (pin), §6 (SARIF), §7 (permissions), §10 (gate), §11 (baselines), §12 (version), §14 (unresolved) |
| Plan journal | `plans/reports/journal-260629-2011-fallow-tools-v2-action-swap-plan-shipped.md` | D1-D4 recommended defaults (overridden by operator) |
| Project fallow pin | `package.json:30` (`"fallow": "2.102.0"`) | D1 source-of-truth; deep-dive §12.4 cross-reference |
| Fallow config | `tools/learning-loop-mastra/.fallowrc.json` | `audit.gate: new-only` (NOT honored by Action; D2 needs explicit `gate: new-only` on input) |
| Baseline storage rule | `meta-260628T1328Z` (consult-checklist `baseline-storage` rule) | WHY baselines avoid `<root>/.fallow/` (D3) |
| Upstream `action.yml` | https://raw.githubusercontent.com/fallow-rs/fallow/main/action.yml (HTTP 200) | D1, D2, D5 — input/outputs, sarif category, step ID |

---

## Open questions at end of Phase 1

None unresolved. D1-D5 + the 3 plan open questions are all answered. Phase 2 may proceed.

**Unresolved questions deferred to follow-up (out of scope for this plan):**
- **F-1 (deferred):** When `package.json` is bumped from 2.102.0 to 2.103.0, regenerate the 3 baseline JSONs against the new typed-output contract. Source: deep-dive §14.9.
- **F-2 (deferred):** Physically move the 3 baseline files from `plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/` to `tools/learning-loop-mastra/baselines/fallow/`. One `git mv` commit. Source: D3.
- **F-3 (deferred):** Update the consult-checklist `baseline-storage` rule's "where to store" item from `plans/<plan-dir>/reports/fallow/` to `<root>/baselines/fallow/`. The WHY (avoid fallow's auto-gitignore) stays the same. Source: D3.
- **F-4 (deferred):** If operators want a PR-body summary, add `comment: true` to the Phase 4 contract and grant `pull-requests: write` to the workflow's GITHUB_TOKEN. Source: open question 3.

---

Status: DONE

Summary: All 5 operator decisions recorded; cross-reference matrix updated; Phase 4 contract drafted with operator overrides (D1: setup step for version; D3: in-package baselines; D5: `analyze` step ID). 3 follow-ups deferred. Phase 2 unblocked.
