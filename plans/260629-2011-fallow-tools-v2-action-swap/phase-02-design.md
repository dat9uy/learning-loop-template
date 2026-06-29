---
phase: 2
title: "Design decisions"
status: pending
priority: P2
dependencies: [phase-01-research]
---

# Phase 2: Design decisions

## Overview
Resolve the 4 unresolved operator decisions surfaced in Phase 1 and write the Phase 4 implementation contract (the exact Action invocation shape, including inputs, permissions, and what survives from the current workflow).

## Requirements

- **Functional:**
  - Resolve D1-D4 with recommended defaults unless operator overrides
  - Produce a complete Phase 4 contract: Action invocation YAML + preserved steps + permissions block
  - Document the decision rationale in `plans/reports/decision-260629-2011-fallow-action-swap-decisions.md`
- **Non-functional:**
  - Each decision cites the source researcher's claim + the operator's verification path
  - Contract is verifiable (every input maps to a documented Action input from `action.yml`)

## Related Code Files

- Create: `plans/reports/decision-260629-2011-fallow-action-swap-decisions.md`
- Modify: nothing (decisions only; Phase 4 implements)

## Implementation Steps

1. **Resolve D1 — Pin strategy.** Decision: pin to commit SHA + `version:` input set dynamically from `package.json` `devDependencies.fallow` via a setup step.
   - Source: researcher #2 §5 (Pin model), §12 (bundled version), §12.2 (fall-through resolution from package.json).
   - **Operator override of original plan D1:** Original plan recommended hard-coding `version: "2.102.0"` in YAML; operator said consolidate to `package.json` so there's one bump site. The deep-dive §12.2 confirms the Action's install.sh already reads from `package.json` as a fallback — the setup step makes the implicit explicit.
   - Verification path: `git ls-remote https://github.com/fallow-rs/fallow refs/tags/v2` returns commit SHA; record in decision. `node -e 'console.log(require("./package.json").devDependencies.fallow)'` returns `2.102.0` on the current tree.
   - Rationale: floating tag + floating CLI = silent drift; SHA + exact version = deterministic supply chain. Operator's bias: single bump site.

2. **Resolve D2 — Per-analyzer Code Scanning categories.** Decision: DROP (Migration A).
   - Source: researcher #2 §6 ("Only `category: fallow`"; "Regression for us: we upload under 3 categories").
   - Rationale: user's predict session framed "reduce technical debt" as the goal; the Python heredoc IS the technical debt; per-analyzer categories are a nice-to-have not load-bearing.
   - Compensation: PR review findings include `command` field; the SARIF `run.tool.driver.name` distinguishes dead-code/health/dupes; operators navigate via finding description text, not category.

3. **Resolve D3 — Baseline path style.** Decision: **RELOCATE** to `tools/learning-loop-mastra/baselines/fallow/{dead-code,health,dupes}-baseline.json`.
   - Source: researcher #2 §11 (path handling — `..` paths allowed for baselines).
   - **Operator override of original plan D3:** Original plan recommended KEEPING at `plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/*.json` (rationale: "preserves audit trail in plan dir"). Operator said: "it's weird that github action yaml has to ref the plans folder ... The CI should be universal, not depending on plans folder, which is just a temporary file for planning."
   - **Why the operator is right:** Plans dirs ARE scratch artifacts; coupling a permanent CI workflow to one is a layering violation. The plan's "preserves audit trail" rationale confuses *where the artifact was first generated* with *where it should live for production CI consumption*. A CI workflow that hard-codes a path through a plans directory couples a permanent contract to a temporary artifact.
   - **Path resolution:** When `root: tools/learning-loop-mastra`, baseline paths are relative to root (not to the workflow file). New in-package paths: `baselines/fallow/{dead-code,health,dupes}-baseline.json` — no `..` traversal needed.
   - **Migration:** Phase 4 contract references the new paths. A separate follow-up commit (`git mv` 3 JSON files) physically moves the files. Out of scope for THIS plan's CI swap.
   - **Consult-checklist rule update (Phase 3):** Update `baseline-storage` rule's "where to store" item from `plans/<plan-dir>/reports/fallow/` to `<root>/baselines/fallow/`. The WHY (avoid `<root>/.fallow/.gitignore: *`) stays the same.

4. **Resolve D4 — `sarif: true` on Action vs explicit upload step.** Decision: USE `sarif: true`.
   - Source: researcher #2 §6 ("`sarif: 'true'` enables both local SARIF file generation AND upload").
   - Rationale: one-liner; Action handles Code Scanning availability check (`check-code-scanning.sh`) and pin to commit SHA; explicit upload loses that availability probe.

5. **Write Phase 4 contract** — the exact YAML shape that Phase 4 will implement. Skeleton (full contract in decision record):

   **Note:** The contract below reflects the operator overrides (D1: setup step for version; D3: in-package baselines; D5: `analyze` step ID). The original draft in `phase-02-design.md` (pre-Phase-1 review) had `version: "2.102.0"` hard-coded, `../../plans/...` baseline paths, and `${{ steps.fallow.outputs.sarif }}` — all three are corrected here.

   ```yaml
   # Inserted after `timeout-minutes: 30` at test.yml:27:
   permissions:
     contents: read
     security-events: write

   # Replaces test.yml:62-237 (176 LoC) with the following ~40 LoC:

   - name: Resolve fallow version
     # D1: Read CLI version from package.json so there's one bump site.
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
     uses: fallow-rs/fallow@<commit-sha>
     with:
       root: tools/learning-loop-mastra
       command: audit
       gate: new-only
       format: sarif
       sarif: true
       version: ${{ steps.fallow-version.outputs.version }}
       # D3: Baselines moved to in-package baselines/fallow/.
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
     if: failure()
     uses: actions/upload-artifact@v7
     with:
       name: fallow-sarif
       path: ${{ steps.analyze.outputs.sarif }}
       if-no-files-found: ignore
       retention-days: 7
   ```

6. **Add `permissions:` block** — top of `test.yml` `jobs.test` block needs:
   ```yaml
   permissions:
     contents: read
     security-events: write
   ```
   Source: researcher #2 §6 ("Requires `permissions: security-events: write`").

## Success Criteria

- [x] Decision record file exists with 4 decisions resolved + rationale + verification path
- [x] Phase 4 YAML contract drafted verbatim in the decision record (no placeholders except `<commit-sha>`)
- [x] Operator has reviewed and accepted all 4 decisions (or overridden with rationale) — D1, D3, D5 overridden
- [ ] The `<commit-sha>` for `fallow-rs/fallow@v2` is recorded (from `git ls-remote`) — Phase 4 task

## Risk Assessment

- **Risk:** Operator overrides D2 (keep per-analyzer categories) — would force Migration B with -13 LoC delta and require keeping Python heredoc. **Mitigation:** the decision record flags this as the primary fork; if D2 is overridden, Phase 3 still applies but Phase 4 contract changes.
- **Risk:** `<commit-sha>` resolves to a tag that's later force-pushed. **Mitigation:** GitHub tags are immutable; commit-SHA pin survives tag deletion.
- **Risk (NEW):** The D1 setup step's `node -e` parse fails if `package.json` is malformed (e.g., `devDependencies` removed). **Mitigation:** setup step exits 1 with a clear `::error::` message before the Action runs.
- **Risk (NEW):** D3 baseline relocation requires `git mv` of 3 baseline JSON files in a separate commit; if a contributor implements Phase 4 contract without that follow-up, the Action fails to find baselines. **Mitigation:** Phase 4 contract test asserts the new path exists in the workflow; Phase 5 verification includes a precondition that the baseline files have been moved.

## TDD Note

This phase is design-only. The "test" is the contract YAML in the decision record — Phase 4 implementer reads it and produces the workflow file. If the contract is wrong, Phase 4 fails.