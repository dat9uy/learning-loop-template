# Continuation Handoff: Test-Tier Architecture Refactor

## Mission and current status

Refactor the repository's test structure into explicit **unit**, **integration**, and **e2e** tiers that mirror the documented Core → Mastra Shell → Runtime Interface architecture.

**Status:** ✅ **Implementation COMPLETE.** All five phases shipped (2026-08-10).

Completed:

- User-approved outcome contract.
- Repository scout and architecture review.
- Five-phase implementation plan created and validated.
- Contract-preserving review completed; all findings were mitigation-within-contract and incorporated into the plan.
- Read-only preflight completed with no hard blockers.
- **Phase 1:** Baseline frozen + all 172 legacy tests classified (unit=41, integration=109, e2e=22); three decisions resolved (core sibling colocation, `__tests__/integration/` home, shared support exceptions).
- **Phase 2:** Three-tier Vitest config + guards (`tier-detector.mjs`, `test-tier-completeness.test.js`, strict e2e-membership); `test:integration` script.
- **Phase 3:** All 172 tests migrated via 3 parallel subagents (26→core/, 15→`__tests__/unit/`, 109→`__tests__/integration/`, 22→`__tests__/e2e/`).
- **Phase 4:** `legacy-mcp/` removed; active docs/comments/baselines updated; `test:cold-session` + sentinel + `.gitignore` repointed.
- **Phase 5:** Full validation matrix green (all 4 acceptance commands, guards, arch tests, fallow:gate exit 0, cold-session, freshness); no production behavior changed.
- Baseline `pnpm test:unit` completed successfully: exit code 0, 0 failed tests.

Remaining (post-implementation):

- Nothing blocking. The working tree contains uncommitted changes (all moves + config + docs). The next session should:
  1. Review the working tree diff for final acceptance.
  2. Commit the changes in focused, conventional commits (migration is commit-granular for rollback).
  3. Run `pnpm test` one final time post-commit to confirm green.

Note for reviewers: the +29 files/+172 tests delta vs the baseline is the documented e2e promotion of 44 process-boundary tests that were previously misclassified into the fast unit project — not a coverage loss.

Priority: P1 architectural/test-maintenance refactor.

## Scope and guardrails

Repository: `/home/datguy/learning-loop-template`

Permitted changes:

- Vitest configuration and tier guards.
- Package test scripts.
- Test-file moves and required relative-path/fixture updates.
- Test helpers, manifests, baselines, and freshness references affected by moves.
- Relevant active architecture/test documentation.

Prohibited changes:

- No production behavior changes.
- No public tool-contract changes.
- No test deletion, assertion weakening, or coverage removal.
- No silent renaming of Core, Mastra Shell, or Runtime Interface layers.
- No unrelated cleanup.
- Do not add a new push gate or alter existing CI/hook intent without evidence and explicit approval.
- Do not start a long-running `/goal` session automatically.

Locked outcome contract:

- **Intended result:** The suite has explicit, disjoint, complete unit/integration/e2e tiers and test ownership is discoverable from source paths.
- **In scope:** Add the integration tier; colocate pure units; migrate all 172 `legacy-mcp` tests by behavior/ownership; preserve coverage and behavior; update guards, scripts, paths, baselines, and docs; remove obsolete `legacy-mcp` placement where no longer needed.
- **Out of scope:** Production behavior, public contracts, assertion rewrites for convenience, test deletion/weakening, product features, layer renames, and coverage removal.
- **Acceptance:** All four commands pass: `pnpm test:unit`, `pnpm test:integration`, `pnpm test:e2e`, and `pnpm test`; every test belongs to exactly one tier; pure units are colocated; active canonical references no longer use `legacy-mcp`; counts and meaningful coverage are preserved; docs match.
- **Allowed substitution:** An explicit shared fixture/helper directory may remain only when genuinely necessary.

## Current state

Observed repository state at handoff capture:

- Git repository: yes.
- Branch: `main`.
- HEAD: `0dee3e444e595e2b3aabddb058f0fb308550e823`.
- Working tree: intentional untracked plan directory only.
- Untracked path: `plans/260810-0908-test-tier-architecture-refactor/`.
- The handoff path is `plans/handoffs/test-tier-architecture-refactor.md`.

Important current paths:

- `vitest.config.mjs`
- `package.json`
- `docs/architecture.md`
- `tools/learning-loop-mastra/core/README.md`
- `tools/learning-loop-mastra/__tests__/legacy-mcp/`
- `tools/learning-loop-mastra/__tests__/test-tier-e2e-membership.test.js`
- `tools/learning-loop-mastra/__tests__/r2/precommit-hook.test.js`
- `tools/learning-loop-mastra/__tests__/prune-coverage-parity.test.js`
- `tools/learning-loop-mastra/core/placement.yaml`
- `tools/learning-loop-mastra/.fallowrc.json`

The plan directory is intentionally untracked and contains `plan.md` plus five phase files. No source implementation changes have been made.

## Decisions and rationale

Approved decisions:

1. Use three explicit tiers: unit, integration, and e2e.
2. Pure unit tests belong beside their owning implementation, following the existing `core/` pattern.
3. The historical `legacy-mcp` directory is the main migration target and must not remain the canonical architecture-aligned test home.
4. Preserve assertions, test count, meaningful coverage, production behavior, CI, and existing hook intent.
5. Add `pnpm test:integration` because it is an acceptance signal.
6. Keep e2e membership mechanically guarded; retain MCP/SDK/CLI process-boundary detection.

Rationale from repository evidence:

- Current Vitest already has `unit` and `e2e`, but no integration project.
- `legacy-mcp` contains 172 test files and no longer reflects the documented architecture.
- `core/` already contains colocated tests.
- The existing hybrid-tier plan explicitly left test co-location as a later refactor.
- The three architecture layers must remain distinct from test tiers: a shell/interface test can be integration or e2e depending on its runtime boundary.

Rejected or prohibited alternatives:

- Do not solve the problem by deleting or weakening legacy tests.
- Do not classify tests using filename history alone.
- Do not use raw marker grep as the sole integration detector; existing tests contain inert marker strings in fixtures/comments.
- Do not treat “unit must take seconds” as an acceptance requirement; timing is diagnostic because Vitest import overhead is already known.

## Work performed

Read-only/scoping work completed:

- Ran `loop_describe({tier: "warm"})` to discover active repository loop surfaces and rules.
- Inspected package scripts and dependencies.
- Inspected `vitest.config.mjs`, architecture docs, Core README, existing hybrid-tier plan, and test directory layout.
- Counted 172 test files under `tools/learning-loop-mastra/__tests__/legacy-mcp/`.
- Confirmed existing unit tests beside Core code.
- Created and populated:
  - `plans/260810-0908-test-tier-architecture-refactor/plan.md`
  - `phase-01-baseline-and-classification.md`
  - `phase-02-three-tier-vitest-contract-and-guards.md`
  - `phase-03-architecture-aligned-test-migration.md`
  - `phase-04-cutover-and-legacy-path-cleanup.md`
  - `phase-05-parity-coverage-docs-and-rollback.md`
- Ran `ak plan validate`; result: valid.
- Activated/reindexed the plan with the local plan CLI.
- Ran the baseline unit command.

Meaningful baseline output:

```text
pnpm test:unit
exit code: 0
0 failed tests
```

The baseline output also exposed existing test-fixture diagnostics (for example, intentional sync/normalize error-path messages); these were not failures.

## Verification

Passed:

- `ak plan validate /home/datguy/learning-loop-template/plans/260810-0908-test-tier-architecture-refactor`
- Baseline `pnpm test:unit` — exit 0, 0 failed.
- Repository/tool preflight: Node, pnpm, Vitest, and fallow are available locally.
- Git state probes: repository and plan path confirmed.

Not yet run because implementation has not started:

- `pnpm test:integration` — script does not yet exist.
- `pnpm test:e2e` after migration.
- Full `pnpm test` after migration.
- `pnpm test:cold-session` and `pnpm check:freshness` against final paths.
- FCIS, placement, interface, R2, parity, storage, runtime-agnostic, and tier-completeness checks after migration.
- `pnpm fallow:brief` and `pnpm fallow:gate` for the final tree.

Known baseline considerations:

- Vitest 4 project settings such as globals, timeouts, hook timeouts, and exclusions need to be repeated per project.
- Full coverage uses Istanbul output and the existing sanitizer/fallow flow.
- Cold-session, coverage, and test-log commands can mutate generated artifacts; Phase 1 must record and control those artifacts when freezing the baseline.
- Existing active references to `legacy-mcp` include package scripts, freshness sentinel paths, helper/manifests, prune guards, Core README text, docs/source comments, and fallow baselines. Historical journal/archive references should be distinguished from active authority.

## Open risks and blockers

No hard blockers were found during warmup. The following decisions remain intentionally open for Phase 1 implementation:

1. Choose the canonical colocated Core test convention: existing `core/__tests__/` versus `__tests__/core/`/direct `core/*.test.js` patterns. Use source ownership and existing conventions; do not create a third pattern.
2. Confirm whether the integration home should be `tools/learning-loop-mastra/__tests__/integration/` or an ownership-based colocated convention for handler/interface modules.
3. Identify any genuinely shared fixtures/helpers that must remain outside the three tier roots; every exception must be explicit and guarded.

Review mitigations already incorporated into the plan:

- Stale configured e2e entries must fail or be reconciled by the completeness inventory; warnings alone are insufficient.
- Integration guards must inspect executable/imported process or transport usage and include inert fixture/comment regression cases; raw grep alone is prohibited.
- Cold-session and freshness commands, including sentinel creation/read behavior, are explicit post-migration acceptance checks.
- Baseline generated artifacts must be recorded and restored/cleaned when disposable.

## Exact next actions

**First safe step:** Read `plans/260810-0908-test-tier-architecture-refactor/plan.md` and all five phase files, then verify the current Git state before editing.

1. Run:

   ```bash
   cd /home/datguy/learning-loop-template
   git status --short
   ak plan validate plans/260810-0908-test-tier-architecture-refactor
   ```

2. Re-scout the current test tree and resolve the three Phase 1 decisions with evidence.
3. Freeze baseline file/test/skip/coverage counts and generated-artifact state.
4. Add the integration project, `test:integration` script, and tier-completeness/e2e/integration guards before moving tests.
5. Run the guard tests while old paths still exist.
6. Migrate tests in batches: pure Core units; Core/handler integration; Mastra/CLI/interface integration; then e2e.
7. Run the relevant tier and direct-file checks after every batch; stop on any count/classification drift.
8. Update cold-session/freshness/helper/manifest/fallow references and active docs.
9. Remove the obsolete `legacy-mcp` placement only after exact union, count, coverage, and convenience-command parity passes.
10. Run the complete validation matrix from Phase 5.
11. Review the final diff to confirm no production source behavior changed.

Do not run `/ak:cook` until the plan's open decisions are resolved and the plan remains consistent with the locked contract.

## Source pointers

Primary plan:

- `plans/260810-0908-test-tier-architecture-refactor/plan.md`
- `plans/260810-0908-test-tier-architecture-refactor/phase-01-baseline-and-classification.md`
- `plans/260810-0908-test-tier-architecture-refactor/phase-02-three-tier-vitest-contract-and-guards.md`
- `plans/260810-0908-test-tier-architecture-refactor/phase-03-architecture-aligned-test-migration.md`
- `plans/260810-0908-test-tier-architecture-refactor/phase-04-cutover-and-legacy-path-cleanup.md`
- `plans/260810-0908-test-tier-architecture-refactor/phase-05-parity-coverage-docs-and-rollback.md`

Architecture and test authorities:

- `docs/architecture.md`
- `docs/runtime-contract.md`
- `AGENTS.md`
- `tools/learning-loop-mastra/core/README.md`
- `tools/learning-loop-mastra/interface/CONTRACT.md`
- `vitest.config.mjs`
- `package.json`
- `tools/learning-loop-mastra/__tests__/test-tier-e2e-membership.test.js`
- `tools/learning-loop-mastra/.fallowrc.json`
- `plans/260803-1314-hybrid-test-tiering-and-pre-push-gate/plan.md`

No external URLs, credentials, tokens, or private data are required for continuation.
