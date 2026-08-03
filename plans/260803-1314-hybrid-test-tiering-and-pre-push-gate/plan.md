---
title: "Hybrid test tiering and pre-push gate"
description: "Split the vitest suite into `unit` (fast, no server/CLI subprocess) and `e2e` (MCP-server-spawning + CLI-subprocess) projects, then rewire git hooks: pre-commit runs the unit project only (seconds), pre-push runs the full `pnpm test && pnpm fallow:gate` gate. CI already runs the full gate on PRs and `push: main`, so the local pre-push is a backstop, not the authority. Goal: drop the ~2.5min per-commit pre-commit cost without losing the end-to-end gate."
status: pending
priority: P2
effort: "0.5d"
branch: "fix/write-gate-lineage-scan"
tags: [vitest, test-tiering, git-hooks, pre-push, pre-commit, simple-git-hooks, dev-velocity]
blockedBy: []
blocks: []
created: "2026-08-03"
createdBy: "ak:plan"
source: skill
related:
  - plans/260622-1249-GH-2246-pnpm-test-fix-design-B/plan.md  # completed; shipped run-pnpm-test-namespaced.mjs + claimed pnpm test ~12.87s — BUT that runner was DELETED 2026-07-13 (vitest-migration closeout); the 12.87s was the deleted parallel runner, today's plain `vitest run` is ~153s steady-state
  - docs/journals/2026-07-13-vitest-migration-closeout.md  # confirms run-pnpm-test-namespaced.mjs deleted, replaced by vitest native --reporter=json
  - vitest.config.mjs
  - package.json
  - .github/workflows/test.yml
---

# Hybrid test tiering and pre-push gate

## Overview

The pre-commit hook (`simple-git-hooks`: `pre-commit: pnpm test && pnpm fallow:gate`) runs the **entire** vitest suite on every commit. A measured cold run took ~153s wall-clock (`transform 18.8s`, `import 70.6s`, `tests 294.5s` summed across workers). The dominant cost is the ~25 test files that spawn a real Mastra MCP server child process (`connectMcpServer`) or `spawnSync` the `loop.mjs` CLI binary — each pays 1–4s of server/subprocess startup — plus istanbul coverage instrumentation (~18s transform tax) that `fallow:gate` consumes.

A 2.5min gate per commit incentivizes `--no-verify`, which defeats the gate entirely. This plan adopts the **hybrid** architecture from the prior consultation:

1. **Tier the suite** into vitest `projects`: `unit` (fast, no subprocess) and `e2e` (server/CLI-spawning).
2. **pre-commit** → `vitest run --project unit` (seconds).
3. **pre-push** → `pnpm test && pnpm fallow:gate` (full gate, once per push).
4. **CI unchanged** — `test.yml` already runs `pnpm test` + fallow on PRs and `push: main`, so it remains the authoritative gate; `git push --no-verify` only skips the *local* hook.

**Premise (verification-resolved):** a prior completed plan (`260622-1249-GH-2246-pnpm-test-fix-design-B`) measured `pnpm test` at **12.87s** via a hand-rolled parallel runner (`run-pnpm-test-namespaced.mjs`). The validate verification pass confirmed that runner was **deleted** in the 2026-07-13 vitest migration (`docs/journals/2026-07-13-vitest-migration-closeout.md:37`) and replaced by vitest's native `--reporter=json`. So the 12.87s was the deleted parallel runner; today's `pnpm test` is plain serial `vitest run` → the ~153s measured here is **steady-state, not a cold-start fluke**. The `test.yml` comment still naming the deleted runner is stale doc (CI actually runs `pnpm test`, line 85).

**What Phase 1 still gates:** cold vs warm (vite transform cache) and coverage-on vs coverage-off — to decide whether full tiering is needed or coverage-off-in-pre-commit alone suffices.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | pre-commit wall-clock drops from ~153s (cold) to seconds (unit-only) | P1 |
| 2 | Full `pnpm test` + `fallow:gate` still runs before any push reaches the remote | P1 |
| 3 | CI remains the authoritative gate; local hook changes create no correctness gap | P1 |
| 4 | No `--no-verify` incentive: per-commit gate is fast, per-push gate is bounded | P2 |
| 5 | Tier boundary is mechanical (auto-classified), not hand-maintained per file | P2 |

## Non-goals

- Do NOT change CI's `test.yml` gate (it already runs the full suite + fallow).
- Do NOT remove or weaken `fallow:gate` — only relocate its local execution to pre-push.
- Do NOT change the `commit-msg` stable-artifacts hook.
- Do NOT introduce a lint/typecheck step that doesn't already exist (YAGNI).
- Do NOT touch `hooks-lock.json` (that is the Claude Code hook registry, unrelated to git hooks).

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Measure and characterize the suite](./phase-01-start.md) | Pending |
| 2 | [Phase 2: Split vitest into unit and e2e projects](./phase-02-split-vitest-into-unit-and-e2e-projects.md) | Pending |
| 3 | [Phase 3: Rewire git hooks: fast pre-commit, full pre-push](./phase-03-rewire-git-hooks-fast-pre-commit-full-pre-push.md) | Pending |
| 4 | [Phase 4: Verify timings, parity, and CI independence](./phase-04-verify-timings-parity-and-ci-independence.md) | Pending |

## Success Criteria

- [ ] Phase 1 measures cold/warm × coverage on/off and confirms or narrows the tiering scope (the 153s-vs-12.87s discrepancy is already resolved by verification — deleted parallel runner).
- [ ] `vitest run --project unit` completes in seconds and includes no `connectMcpServer`/CLI-spawn test.
- [ ] `vitest run --project e2e` includes all ~25 server/CLI-spawning tests and passes.
- [ ] `pnpm test` (no project filter) still runs the full suite — CI behavior unchanged.
- [ ] pre-commit hook runs the unit project only; pre-push runs `pnpm test && pnpm fallow:gate`.
- [ ] A commit fires the fast gate; a `git push` fires the full gate; both verified end-to-end.
- [ ] Stale `.git/hooks/pre-commit` (old full-suite command) is replaced, not duplicated.
- [ ] `git push --no-verify` is still backstopped by CI on PRs and `push: main` (documented, not weakened).

## Open Questions

- ~~Is the 153s a cold-start artifact or steady-state?~~ — RESOLVED (validation verification): steady-state; the 12.87s was the deleted parallel runner.
- Is coverage-off-in-pre-commit alone enough, or is full unit/e2e tiering required? (Phase 1 answers — the remaining scope gate.)
- ~~Should `fallow:gate` stay in pre-push, or move to CI-only?~~ — RESOLVED (validation): keep in pre-push (defense-in-depth, redundant with CI).
- Workflow shape: does the operator stack-then-push or push-after-every-commit? (Determines whether pre-push is a net win; hybrid mitigates either way via the fast pre-commit.)

## Validation Log

### Verification Results
- Claims checked: 11
- Verified: 10 | Failed: 1 | Unverified: 0
- Tier: Standard (4 phases → Fact Checker + Contract Verifier)
- **Failed claim:** `tools/scripts/run-pnpm-test-namespaced.mjs` does not exist. Referenced in `test.yml:4-5` comment AND in Phase 1 step 5 / Phase 2 risk-mitigation as a fallback. Resolution: the file was DELETED in the 2026-07-13 vitest migration (`docs/journals/2026-07-13-vitest-migration-closeout.md:37`), replaced by vitest native `--reporter=json`. The `test.yml` comment is stale doc; CI runs plain `pnpm test` (line 85). Propagated: removed the namespaced-runner alternative from Phase 1 + Phase 2; reframed the 153s as steady-state.
- Verified: simple-git-hooks v2.13.1 supports `pre-push` (source line 18); pre-commit = `pnpm test && pnpm fallow:gate`; `pnpm test` = `seed && vitest run && sanitize-coverage`; no vitest projects split; `coverage.enabled: true`; `fallow:gate --changed-since origin/main`; `prepare: simple-git-hooks`; `commit-msg-stable-artifacts.js` + `with-mcp-server.js` exist; e2e count = 19 connectMcpServer + 6 spawnSync = 25 (~26 ✓); CI runs `pnpm test` + fallow on PRs + `push: main`.

### Interview Answers (6 questions)
1. Stale runner → **Remove the dead alternative** (153s is steady-state; parallel runner deliberately deleted).
2. fallow in pre-push → **Keep fallow in pre-push** (defense-in-depth, redundant with CI).
3. e2e classification → **Explicit list + guard test** (KISS; drift caught loud).
4. Coverage tier → **unit coverage-off, e2e+full on** (fallow consumes unfiltered coverage).
5. Phase 1 measurement gate → **Keep Phase 1** (cold/warm + coverage-off still gates tiering-vs-coverage-off-only scope).
6. Branch → **Stay on current branch** `fix/write-gate-lineage-scan` (alongside the two committed CLI round-trip fixes).

### Propagation
- plan.md: branch frontmatter → `fix/write-gate-lineage-scan`; Overview premise reframed (12.87s = deleted runner, 153s = steady-state); `related` adds the vitest-migration closeout journal; Open Questions #1 resolved, #2 narrowed.
- Phase 1: step 5 (read/time namespaced runner) replaced with "confirm no parallel runner exists (deleted 2026-07-13)"; risk "namespaced runner is the real fix" removed.
- Phase 2: classification fixed to Strategy A (explicit list + guard); risk-mitigation "pivot to namespaced runner" removed.
- Phase 3/4: unchanged (already match answers 2/4).

### Whole-Plan Consistency Sweep
- Re-read plan.md + all 4 phase files after propagation.
- No stale "namespaced runner" references remain in any phase.
- "12.87s" appears only in plan.md with the deletion context; no phase treats it as a live target.
- Branch is `fix/write-gate-lineage-scan` consistently (plan.md frontmatter).
- Coverage split (unit off / e2e+full on) consistent across plan.md, Phase 2, Phase 4.
- Zero unresolved contradictions.

<!-- slug: hybrid-test-tiering-and-pre-push-gate -->