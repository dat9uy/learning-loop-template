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

1. **Resolve D1 — Pin strategy.** Decision: pin to commit SHA + `version: "2.102.0"`.
   - Source: researcher #2 §1 ("Action's bundled fallow is 2.103.0"; "Pin BOTH the action ref (commit SHA) AND the `version` input").
   - Verification path: `git ls-remote https://github.com/fallow-rs/fallow refs/tags/v2` returns commit SHA; record in decision.
   - Rationale: floating tag + floating CLI = silent drift; SHA + exact version = deterministic supply chain.

2. **Resolve D2 — Per-analyzer Code Scanning categories.** Decision: DROP (Migration A).
   - Source: researcher #2 §6 ("Only `category: fallow`"; "Regression for us: we upload under 3 categories").
   - Rationale: user's predict session framed "reduce technical debt" as the goal; the Python heredoc IS the technical debt; per-analyzer categories are a nice-to-have not load-bearing.
   - Compensation: PR review findings include `command` field; the SARIF `run.tool.driver.name` distinguishes dead-code/health/dupes; operators navigate via finding description text, not category.

3. **Resolve D3 — Baseline path style.** Decision: KEEP at `plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/*.json`.
   - Source: researcher #2 §11 ("path-traversal check exists for FALLOW_ROOT in review.sh:49-52 but NOT for baseline paths themselves — `..` in baselines is allowed").
   - Rationale: relocating baselines severs the audit trail (the plan that produced them is `260627-2042-phase-e-dead-code-sweep`); `..` traversal is permitted by the Action; no functional benefit.
   - Caveat: when `root: tools/learning-loop-mastra`, baseline paths must use `../../plans/...` (relative to root, not to the workflow file).

4. **Resolve D4 — `sarif: true` on Action vs explicit upload step.** Decision: USE `sarif: true`.
   - Source: researcher #2 §6 ("`sarif: 'true'` enables both local SARIF file generation AND upload").
   - Rationale: one-liner; Action handles Code Scanning availability check (`check-code-scanning.sh`) and pin to commit SHA; explicit upload loses that availability probe.

5. **Write Phase 4 contract** — the exact YAML shape that Phase 4 will implement. Skeleton (full contract in decision record):
   ```yaml
   - name: Fallow audit (PR gate)
     if: github.event_name == 'pull_request'
     uses: fallow-rs/fallow@<commit-sha>
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

   - name: Upload fallow SARIF on failure
     if: failure()
     uses: actions/upload-artifact@v7
     with:
       name: fallow-sarif
       path: ${{ steps.fallow.outputs.sarif }}
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

- [ ] Decision record file exists with 4 decisions resolved + rationale + verification path
- [ ] Phase 4 YAML contract drafted verbatim in the decision record (no placeholders except `<commit-sha>`)
- [ ] Operator has reviewed and accepted all 4 decisions (or overridden with rationale)
- [ ] The `<commit-sha>` for `fallow-rs/fallow@v2` is recorded (from `git ls-remote`)

## Risk Assessment

- **Risk:** Operator overrides D2 (keep per-analyzer categories) — would force Migration B with -13 LoC delta and require keeping Python heredoc. **Mitigation:** the decision record flags this as the primary fork; if D2 is overridden, Phase 3 still applies but Phase 4 contract changes.
- **Risk:** `<commit-sha>` resolves to a tag that's later force-pushed. **Mitigation:** GitHub tags are immutable; commit-SHA pin survives tag deletion.

## TDD Note

This phase is design-only. The "test" is the contract YAML in the decision record — Phase 4 implementer reads it and produces the workflow file. If the contract is wrong, Phase 4 fails.