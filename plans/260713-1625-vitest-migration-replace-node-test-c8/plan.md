---
title: "Vitest migration — replace node:test + c8 with vitest (Path B)"
description: "Migrate the 234-file node:test suite to vitest + @vitest/coverage-v8. Vitest's native --reporter=json gives the agent a trustworthy structured-failure document (numFailedTests + assertionResults) for free — dissolving the agent-context bleed that motivated the abandoned TAP-wrapper plan (260713-1503). Vitest's v8-provider json reporter emits Istanbul-format coverage-final.json (the shape fallow:gate requires), and fallow's vitest plugin registers *.test.* files as entry points, retiring the .fallowrc test-ignore workaround. Red-team corrected 3 critical defects (per-commit hook atomicity, 6 before(fn,{timeout}) call sites, 12 security-gate tests outside the include glob) and 2 high defects (gate should be fallow:gate not %-parity; 3 auxiliary node:test scripts)."
status: completed
priority: P2
branch: "main"
tags: ["vitest", "test-runner", "coverage", "fallow", "agent-context"]
blockedBy: []
blocks: []
created: "2026-07-13T09:26:48.279Z"
createdBy: "ck:plan"
source: skill
---

# Vitest migration — replace node:test + c8 with vitest (Path B)

## Overview

Replace the hand-rolled `node:test` per-namespace runner (`tools/scripts/run-pnpm-test-namespaced.mjs`, 199 LoC) and the `c8` coverage pipeline with **vitest** + `@vitest/coverage-v8`. Three confirmed pillars (all empirically grounded this session):

1. **Agent-context bleed (the root motivation).** The agent debug loop re-runs `pnpm test` and absorbs ~1115 `✖`/`✔` test-event lines per iteration — O(n) token waste across 1k+ tests. Vitest's `--reporter=json` emits a single end-of-run document with `numTotalTests`, `numFailedTests`, `testResults[].assertionResults[]`. The agent greps `numFailedTests>0` and reads only failing assertions — never re-reading passing tests. This trust is **free** (maintained parser), dissolving the abandoned hand-rolled TAP parser (Path A, plan 260713-1503).
2. **Coverage shape.** Vitest's v8-provider `json` reporter emits **Istanbul-format** `coverage-final.json` (AST-remapped since vitest **3.2.0** — "identical coverage reports to Istanbul"). Fallow's `--coverage` **requires Istanbul, not v8/c8 native** (`fallow/capabilities.json`). `sanitize-coverage.mjs` (41 LoC, `-1`-column clamp) **stays**. **`fallow:gate` exit 0 on vitest's output is the blocking gate** (not a %-parity proxy — red-team H1).
3. **Retires the `.fallowrc.json` workaround.** Under node:test, fallow has **no plugin** → test files aren't entries → 4 ignore lines (`**/*.test.{js,cjs}`, `**/*.spec.{js,cjs}`) are required (else 212 false-positive `unused-file`). Fallow's **vitest plugin registers `*.test.*` as entry points** (empirically confirmed via scratch probe: `foo.test.js` → entry `source:"vitest"`, `unused-file:0`). Post-cutover the 4 ignore lines are **droppable**; fallow's dead-code/dupes analysis extends to the test layer.

### Scope corrections from deep research + red-team

| Source claim | Research/red-team finding | Effect |
|---|---|---|
| Loop-design: "12 files use the removed 3-arg `test(name,opts,fn)`" | **FALSE.** `test(name,opts,fn)` is vitest 4.x's *supported* form; the *removed* `test(name,fn,opts)` has **0 matches** (node:test never supported it). | No signature edits. |
| Loop-design: "node:test interop / 22 .cjs dual-handling" | vitest doesn't run node:test-API tests natively, but `node:assert` (192 files) is untouched and the only change is the runner import (`node:test`→`vitest`), API-compatible. `.cjs` runs in vitest for the `tools/` subset. | One mechanical import swap per file. |
| Loop-design: "cold-session timing envelopes need re-derivation" | Only the default test/hook timeout differs; per-test `{timeout}` is preserved. | One config line (`testTimeout`/`hookTimeout`). |
| **Red-team C2: 6 `before(fn,{timeout:N})` call sites** | vitest's `beforeAll(fn, timeout)` takes a **number**, not an object → `NaN` → default 10s → slow MCP-bootstrap hooks flake. | Codemod rewrites `(fn,{timeout:N})`→`(fn,N)`; set `hookTimeout:120000`. |
| **Red-team C3: 12 security-gate tests outside `tools/`** | `.claude/coordination/__tests__` (8) + `.factory/hooks/__tests__` (4) — **script-style** (`process.exit`, 0 `test()` calls), invisible to the original `tools/`-only include. Real runner executes **234** files, not 222. | **Wrap each in vitest `test()`** (operator decision); widen include to `.claude/`+`.factory/`. |
| **Red-team C1: codemod commit breaks the pre-commit hook per-commit** | `node --test` sees 0 tests in vitest-imported files → hook red on the codemod commit; "tight push window" is hand-waving (hook fires per-commit). | **Collapse codemod + `pnpm test` script-swap into ONE atomic commit.** No dual-run window. |

**Net:** the migration is one atomic commit (codemod + 6 hook-call-site fixes + 12 gate-test wraps + script swap + runner/c8 deletion + 4-line fallow-ignore retirement + 3 aux-script rewrites + r2 guard), preceded by a shadow verification phase on a copy, and followed by a verification + registry-closeout phase.

## Closes / Supersedes

- **Closes:** `meta-260712T0730Z-test-runner-pollutes-agent-context` — vitest `--reporter=json` is the structured-failure endpoint the finding asked for.
- **Implements:** `loop-design-vitest-migration-replace-node-test-and-c8` (shipped via `meta_state_ship_loop_design` in Phase 4).
- **Supersedes:** `plans/260713-1503-test-runner-summary/` (Path A, the TAP-wrapper plan). Marked `status: cancelled` + `supersededBy` pointer in Phase 4. The TAP parser, NDJSON schema, 7 fixtures, 4-file PROCESS_HINTS lockstep, and `test-globs.mjs` extraction are all **dropped**.

## Out of Scope

- **Optional trustworthy stopgap (Path A').** A ~30-LoC `grep '✖'+exit-code+stderr-tail` wrapper to bridge the bleed during migration. **Not recommended** given the corrected scope (the cutover is one commit after a shadow phase — short calendar). Escape hatch only: ship *iff* Phase 1 shadow drags across sessions and the bleed is intolerable.
- **Test co-location reorg** (~170 files → beside `core/`/`tools/handlers/`). Large, orthogonal; separate later pass.
- **Coverage thresholding.** `fallow:gate` stays the quality gate.
- **`node:assert` → vitest `expect`.** 192 files keep `node:assert`; vitest doesn't break it.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 0 | [Test-tree hygiene prune](./phase-01-phase-0-test-tree-hygiene-prune.md) | Pending |
| 1 | [Shadow install + codemod + verification](./phase-02-phase-1-shadow-install-codemod-verification.md) | Pending |
| 2 | [Atomic cutover](./phase-03-phase-2-dual-run-coverage-parity.md) | Pending |
| 3 | [Post-cutover verification](./phase-04-phase-3-cutover-fallow-ignore-retirement.md) | Pending |
| 4 | [Registry closeout](./phase-05-phase-4-registry-closeout.md) | Pending |

*(Phase file names are ck-scaffolded slugs; the file `phase-03-*` now holds the **Atomic cutover** content, `phase-04-*` holds **Post-cutover verification**.)*

## Dependencies

- **Blocked by:** none.
- **Blocks:** none directly.
- **Supersedes:** `plans/260713-1503-test-runner-summary/` (Path A) — mark cancelled in Phase 4.
- **Touches registry entries:** `meta-260712T0730Z-test-runner-pollutes-agent-context` (resolve in Phase 4), `loop-design-vitest-migration-replace-node-test-and-c8` (ship in Phase 4).

## Acceptance Criteria (whole plan)

- [ ] `pnpm test` runs the full suite under **vitest**, exits 0 on full-pass / 1 on any failure, emits a **test-results JSON** (`numFailedTests`, `assertionResults[]`).
- [ ] **All 234** test files run under vitest: 222 `tools/` files + 8 `.claude/coordination` + 4 `.factory/hooks` (the 12 wrapped in `test()` with `process.exit(1)`→`throw`).
- [ ] The 6 `before|after|beforeEach|afterEach(fn, {timeout:N})` call sites rewritten to `(fn, N)`; `test.hookTimeout:120000` set.
- [ ] `coverage/coverage-final.json` produced by vitest v8-provider `json` reporter in **Istanbul format**; `sanitize-coverage.mjs` runs on it; **`fallow:gate` exits 0** (the blocking gate).
- [ ] `tools/scripts/run-pnpm-test-namespaced.mjs` deleted; `c8` dropped from devDeps; `vitest>=3.2.0` + `@vitest/coverage-v8` added.
- [ ] The **4** `.fallowrc.json` ignore lines (`**/*.test.{js,cjs}`, `**/*.spec.{js,cjs}`) deleted; `r2/fallow-test-tree-clean.test.js` asserts fallow reports **0 `unused-file`** on the test tree AND `list --entry-points` shows `*.test.*` with `source:"vitest"`.
- [ ] `test:debug` / `test:cold-session` / `check:freshness` rewritten to `vitest run <glob>` (verify `check:freshness` dependents first).
- [ ] `storage-parity.test.cjs:162` `t.skip(REASON)`→`t.skip(true, REASON)` (lifecycle-migration-finalize's 3 sites are pruned in Phase 0).
- [ ] All 7 `r2/` security tests pass under vitest and are **re-audited** (Phase 3 sign-off).
- [ ] Cold-session / slow tests pass with `testTimeout:120000` + `hookTimeout:120000`.
- [ ] `meta-260712T0730Z-test-runner-pollutes-agent-context` resolved; loop-design shipped; `meta_state_log_change` recorded; Path A `status: cancelled`.

## Risk Summary

| # | Risk | Sev | Mitigation |
|---|---|---|---|
| R1 | Codemod misses a `node:test` binding | High | Phase 1 enumerates the binding set `{after,afterEach,before,beforeEach,describe,it,test}` (red-team-verified complete); codemod swaps exactly that set. |
| R2 | Vitest coverage shape differs → `fallow:gate` fails | High | **`fallow:gate` exit 0 on vitest output IS the Phase 1 gate** (red-team H1). %-parity is diagnostic-only. Keep `sanitize-coverage.mjs`. |
| R3 | `t.test()` programmatic subtests | Low | **Red-team verified 0 usage** — non-issue. |
| R4 | Slow tests flake (default timeouts) | Med | `testTimeout:120000` + `hookTimeout:120000`; per-test `{timeout}` preserved; **6 hook call sites fixed** (red-team C2). |
| R5 | `r2/` security tests regress under vitest | High | Phase 3 re-audits all 7; sign-off before closeout. |
| R6 | **Codemod commit breaks pre-commit hook per-commit** | Crit | **Collapse codemod + `pnpm test` script-swap into ONE atomic commit** (red-team C1). No dual-run window. Parity/fallow verified in Phase 1 shadow (copy) + pre-commit local run. |
| R7 | Phase 0 prune drops load-bearing test | Med | Phase 0 TDD gate (prune-coverage-parity); scout-confirmed list only. |
| R8 | `meta_state_resolve` blocked by orphaned-evidence (package.json SHA) | High | Phase 4: `refresh_file_index` **before** `resolve`. |
| R9 | **6 `before(fn,{timeout:N})` sites flake** (vitest wants number, not object) | Crit | Codemod rewrites to `(fn,N)` (red-team C2); `hookTimeout:120000`. |
| R10 | **12 security-gate tests silently dropped** (outside include, script-style) | Crit | Wrap each in vitest `test()`, widen include to `.claude/`+`.factory/` (red-team C3, operator-approved). Preserve exact gate semantics (`process.exit(1)`→`throw`). |
| R11 | **3 aux `node:test` scripts silently dead** (test:debug/cold-session/check:freshness) | High | Rewrite to `vitest run <glob>` in the atomic commit (red-team H2). |
| R12 | Vitest pin <3.2.0 → no AST-remap → coverage shape drift | Med | Pin `vitest>=3.2.0`; Phase 1 asserts installed version (red-team M2). |
| R13 | 12-wrap rewrites alter security-gate semantics | High | Phase 1 shadow verifies each wrapped gate asserts identically to the script-version (same spawnSync+exit-code logic, now in `test()` + `throw`). Per-file review. |

## Implementation Strategy

1. **Phase 0 (hygiene)** — prune 23 + fold 5 + consolidate 9; drop over-broad `legacy-mcp/**` ignore. TDD gate proves no coverage loss.
2. **Phase 1 (shadow)** — install vitest+coverage devDeps + non-gating `test:vitest`; write the codemod (import swap + 6 hook-call-site fixes + t.skip fix) + the 12-gate-test wrap transforms; run ALL on a **copy**; verify vitest green, coverage Istanbul-shaped, **`fallow:gate` green** (the real gate), r2 green, version ≥3.2.0. Produce the cutover checklist. No production mutation.
3. **Phase 2 (atomic cutover)** — ONE commit: apply codemod + 12 wraps to the real tree; swap `pnpm test`→`vitest run && sanitize`; delete namespaced runner; drop c8; retire 4 fallow ignore lines; add `r2/fallow-test-tree-clean` guard; rewrite 3 aux scripts; set hookTimeout. Locally verify green before commit (pre-commit hook is now self-consistent on vitest).
4. **Phase 3 (verification)** — r2 re-audit sign-off; cold-session timing confirm; full-suite + `fallow:gate` green; agent-context smoke test (grep `numFailedTests` without passing-test flood).
5. **Phase 4 (closeout)** — refresh package.json fingerprint → resolve predecessor finding → ship loop-design → log change → mark Path A cancelled.

## Red Team Review

Session 2026-07-13. 1 reviewer (code-reviewer, hostile). 9 findings (3 Critical, 2 High, 2 Medium, 2 Low). All repo-verified. Dispositions: all 9 applied inline.

| # | Finding | Sev | Disposition | Applied to |
|---|---|---|---|---|
| C1 | Codemod commit breaks pre-commit hook per-commit; "tight window" hand-waving | Crit | Collapse codemod + script-swap into ONE atomic commit | plan.md R6, Strategy; Phase 2 |
| C2 | 6 `before(fn,{timeout})` call sites flake (vitest wants number) | Crit | Codemod `(fn,{timeout:N})`→`(fn,N)` + `hookTimeout:120000` | plan.md R9; Phase 1 checklist, Phase 2 |
| C3 | 12 security-gate tests outside include + script-style → silently dropped | Crit | Wrap in vitest `test()` + widen include (operator-approved) | plan.md R10, AC; Phase 1, Phase 2 |
| H1 | %-parity is a proxy; `fallow:gate` was only post-cutover confirmation | High | `fallow:gate` exit 0 = the gate; parity demoted to diagnostic | plan.md R2; Phase 1 |
| H2 | test:debug/cold-session/check:freshness silently dead | High | Rewrite to `vitest run <glob>` in atomic commit | plan.md R11, AC; Phase 2 |
| M1 | `t.skip(REASON)` drops reason text | Med | `t.skip(true, REASON)`; 3 sites pruned in Phase 0, 1 fixed in Phase 2 | plan.md AC; Phase 0, Phase 2 |
| M2 | "vitest 3.x" too loose (3.0/3.1 pre-date AST-remap) | Med | Pin `>=3.2.0`; Phase 1 asserts version | plan.md R12, AC; Phase 1 |
| L1 | `.fallowrc` ignore is 4 lines, not 2 globs | Low | Delete the 4 actual lines | plan.md AC; Phase 2 |
| L2 | `sanitize-coverage.mjs` path contract depends on cwd=repo root | Low | Recorded; no change | Phase 2 note |

Positive red-team confirmations: `t.test()`=0 usage (R3 dead); removed `test(name,fn,opts)`=0 (scope correction holds); binding set complete; `.cjs` runs in vitest for `tools/`.

## Open Questions

1. ~~Codemod mechanism (explicit imports vs globals)~~ — defaulted to **explicit imports**; reversible, not blocking.
2. ~~C3 disposition~~ — **RESOLVED (operator): wrap the 12 in vitest `test()`**.
3. ~~C1 atomic strategy~~ — **RESOLVED (engineering): collapse codemod + script-swap into one commit**.
4. **`check:freshness` dependents** — verify CI/gates invoking it before rewriting to `vitest run` (Phase 2 Step). Bounded.
5. **12-wrap semantic preservation** — each wrapped gate must assert identically to its script version; per-file review in Phase 1 shadow.