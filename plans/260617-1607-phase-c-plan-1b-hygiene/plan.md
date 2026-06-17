---
title: "Phase C Plan 1b — Hygiene (CR-3 to CR-6 + Plan 1a review followups + doc drift)"
description: "Batched hygiene PR: cold-session test isolation (CR-3), mutex scope per-connection (Plan 1a review Important), test strengthening (deterministic race + inverse-map dedup + coverage gap), and doc drift corrections (9→10 namespaces, +4→+5/11 tests, hallucinated map names, R-09 arithmetic). 6 phases, 1 PR, 2-3h total. Predecessor: Plan 1a. Prerequisite for Plan 3 (C6+C7 cut-over). Mirrors Phase B's single-fix PR pattern."
status: pending
priority: P2
branch: "260617-1607-phase-c-plan-1b-hygiene"
tags: [meta-surface, phase-c, hygiene, tdd, parity-prerequisite]
blockedBy: ["260617-1138-phase-c-plan-1a-atomic-fix"]
blocks: ["phase-c-plan-3-cut-over"]
created: "2026-06-17T09:09:42.634Z"
createdBy: "ck:plan"
source: skill
related:
  - plans/reports/brainstorm-260617-0212-pre-plan-3-prerequisite-fixes.md (3-plan stack decision; Plan 1b scope = CR-3 to CR-6 + Plan 1a review followups + doc drift)
  - plans/reports/code-reviewer-260617-1338-phase-c-plan-1a-atomic-fix-review-report.md (1 Important + 6 Minor followups for Plan 1b)
  - plans/reports/code-reviewer-260617-0131-GH-2200-phase-c-plan-2-pr-review-report.md (CR-3 to CR-6 origin; PR #3 code review)
  - plans/reports/productization-260612-1530-master-tracker.md#Phase C (canonical state; Plan 1b is unblocker for Plan 3)
  - plans/260617-1138-phase-c-plan-1a-atomic-fix/plan.md (predecessor; shipped 2026-06-17)
  - plans/260617-1138-phase-c-plan-1a-atomic-fix/reports/closeout-report.md (Plan 1a closeout; needs test-count drift correction)
  - tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs:341 (CR-3; pre-existing flake from test ordering)
  - tools/learning-loop-mastra/__tests__/with-mcp-server.js:14-28 (Plan 1a review Important; module-level inFlight over-serializes)
  - tools/learning-loop-mastra/__tests__/with-both-mcp-servers.js:46-60 (Plan 1a review Minor 1; stale-rejection bug)
  - tools/learning-loop-mastra/__tests__/connect-mcp-server-mutex.test.js:54-90 (Plan 1a review Minor 2; non-deterministic race test)
  - tools/learning-loop-mcp/core/loop-introspect.js:309-317 (Plan 1a review Minor 3; consolidated_into_inverse does not dedup)
  - tools/learning-loop-mcp/core/loop-introspect.js:304-308 (Plan 1a review Minor 4; misleading comment)
  - tools/learning-loop-mcp/core/loop-introspect.test.js (Plan 1a review Minor 5; coverage gap: 1→2 change-logs, empty, duplicate)
  - tools/learning-loop-mcp/tools/meta-state-list-tool.js:14 (Plan 1a review Minor 6; TERMINAL_STATUSES naming inconsistency)
  - package.json:17 (test script; 10 globs, not 9 — doc drift)
  - plans/260617-1138-phase-c-plan-1a-atomic-fix/plan.md:44, 46, 85, 87, 113, 201 (doc drift: 9 namespaces claim; +4 RED tests at line 113)
  - plans/260617-1138-phase-c-plan-1a-atomic-fix/reports/closeout-report.md:6, 28 (doc drift: 9 namespaces claim)
  - docs/journals/2026-06-17-phase-c-plan-1a-closeout.md:25 (hallucinated 5 map names); 31 (TERMINAL_STATUSES origin)
  - docs/project-changelog.md (doc drift: test count math)
---

# Phase C Plan 1b — Hygiene

## Overview

**This is Plan 1b of the 3-plan Phase C stack** (decided 2026-06-17, see `plans/reports/brainstorm-260617-0212-pre-plan-3-prerequisite-fixes.md`). The 3-plan stack (1a atomic fix → **1b hygiene** → 3 operational flip) mirrors Phase B's proven pattern (B3+B4 → B5 → B6).

**Why 1b must ship before Plan 3:** Plan 3 (C6+C7 cut-over) ships the operational flip from legacy `McpServer` to Mastra `MCPServer`. The Plan 1a code review (`code-reviewer-260617-1338-phase-c-plan-1a-atomic-fix-review-report.md`) flagged 1 Important + 6 Minor items that should land before Plan 3 to avoid test-flake noise in the parity suite. CR-3 (cold-session flake) is a pre-existing latent bug that could surface as a false-positive in the Plan 3 gate. The 4 doc-drift items in Plan 1a (`+4 RED tests` / `9 namespaces` / hallucinated map names) are also being corrected so Plan 3 inherits a clean reference baseline.

**Scope (6 phases, 1 branch, 1 PR with stacked commits, 2-3h):**

1. **Phase 1 — Cold-session test isolation (CR-3).** Make `cold-session-discoverability.test.cjs:341` self-contained by registering its hooks in `before()` instead of relying on global test ordering. RED test: run the file in isolation; expect GREEN. Mitigates pre-existing flake that Plan 3's parity gate could amplify.
2. **Phase 2 — Mutex scope per-connection (Plan 1a review Important).** Move the `inFlight` queue from module scope in `with-mcp-server.js:14-28` to closure scope inside `connectMcpServer` so each `(serverEntry, tempRoot)` pair gets its own FIFO queue. RED test: spawn two `connectMcpServer` calls with different `tempRoot` values; assert their listTools calls do NOT serialize. Also fixes the stale-rejection bug in `with-both-mcp-servers.js:46-60` (Plan 1a review Minor 1).
3. **Phase 3 — Test strengthening (Plan 1a review Minors 2 + 5).** Tighten the mutex race test (`connect-mcp-server-mutex.test.js:54-90`) to deterministically exercise the race (timestamp-stamped monotonic ordering, or back-to-back identical `change_target` IDs). Add 3 inverse-map tests: 1 finding referenced by 2 change-logs; empty `consolidates: ""`; duplicate ids in a single `consolidates` CSV.
4. **Phase 4 — Inverse map dedup (Plan 1a review Minors 3 + 4).** Add `if (!arr.includes(id)) arr.push(id)` to the `consolidated_into_inverse` handler at `loop-introspect.js:309-317` to match the existing `promoted_to_rule` pattern at lines 282-284. Rewrite the misleading comment at `loop-introspect.js:304-308` to clarify that the forward ref is on the change-log side (`change-log.consolidates`), not the finding side. RED test: `consolidates: "f-1,f-1"` produces a 1-element array in the inverse map.
5. **Phase 5 — Doc drift corrections.** Update 5 doc locations: (a) `package.json` test script claim of "9 namespaces" → "10 namespaces" or "all test namespaces"; (b) Plan 1a `plan.md:113` "+4 RED tests" → "+5 new test files / +11 new tests" (Phase 2 has 2 test files: `loop-introspect.test.js` + `meta-state-relationships-tool.test.js`); (c) Plan 1a `closeout-report.md:28` "9 test namespaces" → "10"; (d) Plan 1a journal `docs/journals/2026-06-17-phase-c-plan-1a-closeout.md:38-60` — correct hallucinated map names (`resolves_inverse`, `archives_inverse`, `consolidates_inverse`, `depends_on_inverse` are invented; real 5 are `addresses_inverse, supersedes_inverse, origin_inverse, promoted_to_rule_inverse, reopens_inverse`) and the `TERMINAL_STATUSES` origin claim (was pre-existing from plan 260611-1000, not "added" in Plan 1a; actual change was at lines 179-186 not 14, 173-182); (e) `docs/project-changelog.md` Plan 1a entry — verify test counts (1058→1069 pass / +11 new tests, 0 fail). Also rename `TERMINAL_STATUSES` to `EXCLUDABLE_STATUSES` (or add `"archived"` to it) per Plan 1a review Minor 6.
6. **Phase 6 — Acceptance gate + closeout.** Full `pnpm test` (all 10 test namespaces); 0 regressions; 1 `meta_state_log_change` for the plan; master tracker flip for "Plan 1b [x]"; closeout journal.

**Acceptance gate (single sentence, durable anchor):** *"All 10 test namespaces pass (per `package.json#scripts.test`) AND 0 regressions AND `cold-session-discoverability.test.cjs` runs in isolation as GREEN (CR-3) AND `connectMcpServer` instances with different `tempRoot` execute `listTools` calls without module-level serialization (Plan 1a review Important) AND `with-both-mcp-servers.js` does not propagate stale rejections to subsequent operations (Plan 1a review Minor 1) AND the mutex race test is deterministic (Plan 1a review Minor 2) AND `consolidated_into_inverse` dedupes duplicate ids (Plan 1a review Minors 3 + 4) AND the inverse-map coverage gap is closed (Plan 1a review Minor 5) AND all doc-drift items are corrected (Plan 1a review Minors 7-10).*

**Out of scope (deferred to Plan 3 / other):** C6 cut-over, C7 manifest rename, D-8 to D-13, F4 resolution, Phase D workflow + agent + storage migration, Phase G skill migration, LIM hardening.

**Why TDD (per `--tdd` flag):** each fix is RED-first. The 4 new RED tests in Phase 2 (mutex scope per-connection), Phase 3 (deterministic race + 3 inverse-map coverage), and Phase 4 (dedup) live in their respective test files. Phases 1 and 5 are test/infra/doc work (no RED-first). Phase 6's acceptance gate re-runs the full suite.

## Phases

| Phase | Name | Status | Effort | TDD Color | Dependencies |
|-------|------|--------|--------|-----------|--------------|
| 1 | [cold-session-test-isolation](./phase-01-phase-1-cold-session-test-isolation.md) | Pending | ~30min | GREEN-only (pre-existing test) | Plan 1a (shipped 2026-06-17) |
| 2 | [mutex-scope](./phase-02-phase-2-mutex-scope.md) | Pending | ~45min | RED → GREEN | Phase 1 (commit order) |
| 3 | [test-strengthening](./phase-03-phase-3-test-strengthening.md) | Pending | ~30min | RED → GREEN (deterministic + 3 coverage) | Phase 2 (commit order; tests the new mutex) |
| 4 | [inverse-map-dedup](./phase-04-phase-4-inverse-map-dedup.md) | Pending | ~15min | RED → GREEN | Phase 3 (commit order; dedup in same file) |
| 5 | [doc-drift-corrections](./phase-05-phase-5-doc-drift-corrections.md) | Pending | ~30min | doc-only | Phases 1-4 (commit order; doc lands after code) |
| 6 | [acceptance-gate](./phase-06-phase-6-acceptance-gate.md) | Pending | ~20min | Full `pnpm test` + meta-state log + tracker flip | Phases 1-5 + green CI |

**Total effort:** ~2.5 hours. One session. Single PR (stacked commits, one per phase). Commit order: Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 (easiest → hardest; doc lands last; bisect-friendly). All 5 code changes are small (5-25 LOC each); 5 doc corrections in Phase 5.

## Pre-flight Checklist (per R-15 acceptance)

| Phase | Gated Path | Tool / Env | Notes |
|-------|-----------|------------|-------|
| 1 | `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` | none (test file) | no preflight |
| 2 | `tools/learning-loop-mastra/__tests__/with-mcp-server.js` | none (test infra; not `product/**`) | no preflight |
| 2 | `tools/learning-loop-mastra/__tests__/with-both-mcp-servers.js` | none | no preflight |
| 2 | `tools/learning-loop-mastra/__tests__/mutex-scope.test.js` (new) | none (test file) | no preflight |
| 3 | `tools/learning-loop-mastra/__tests__/connect-mcp-server-mutex.test.js` | none | no preflight |
| 3 | `tools/learning-loop-mcp/core/loop-introspect.test.js` | none | no preflight |
| 4 | `tools/learning-loop-mcp/core/loop-introspect.js` | none (core lib; not `product/**`) | no preflight |
| 5 | `package.json` | none (root config; not `product/**`) | no preflight |
| 5 | `plans/260617-1138-phase-c-plan-1a-atomic-fix/plan.md`, `reports/closeout-report.md` | none (plan files) | no preflight |
| 5 | `docs/journals/2026-06-17-phase-c-plan-1a-closeout.md` | none (docs) | no preflight |
| 5 | `docs/project-changelog.md` | none (docs) | no preflight |
| 5 | `tools/learning-loop-mcp/tools/meta-state-list-tool.js:14` (rename only) | none (tool; not `product/**`) | no preflight |
| 6 | `plans/reports/productization-260612-1530-master-tracker.md` (tracker flip) | `OPERATOR_MODE=1` | gated; closeout contract |
| 6 | `meta-state.jsonl` (1 `meta_state_log_change`) | `OPERATOR_MODE=1` | gated; closeout |

**No `gate_mark_preflight` calls required** — no `product/**` writes in Plan 1b (test files + plan files + docs + meta-state registry). The `OPERATOR_MODE=1` env var is required for Phase 6's registry calls.

## Dependencies

**Blocked by:**
- `260617-1138-phase-c-plan-1a-atomic-fix` (Plan 1a shipped 2026-06-17; this plan's code-review followups assume Plan 1a's `inFlight` queue + `consolidated_into_inverse` are merged)

**Blocks:**
- `phase-c-plan-3-cut-over` (Plan 3 / C6+C7+D-8 to D-13+F4; the operational flip; cannot start until Plan 1a + Plan 1b merge; the cut-over lands on a clean parity surface + deterministic tests + correct docs)

**Unfinished cross-plan candidates (scanned 2026-06-17):**
- `plans/260616-1605-phase-c-plan-1-atomic-mastra-adoption/` — `[x]` (shipped 2026-06-16)
- `plans/260616-2200-phase-c-plan-2-parity/` — `[x]` (shipped 2026-06-17)
- `plans/260617-1138-phase-c-plan-1a-atomic-fix/` — `[x]` (shipped 2026-06-17)
- `plans/260617-0900-learning-loop-skill-coordinator/` — separate track (Phase G mechanics)
- `plans/260517-1600-state-machine-for-irreversible-operations/` — Phase D candidate
- No active blockers from other plans for Plan 1b.

**Out of scope (separate tracks, NOT this plan):**
- **D-8 to D-13 + F4** — Plan 3 (C6+C7 cut-over)
- **Phase D workflow + agent + storage** — separate phase
- **Phase G skill migration** — parallel dimension, independent of A-F
- **LIM-3 / LIM-4 / LIM-5 / LIM-6 / LIM-8 / LIM-9** — hardening LIMs from Phase B; separate security/quality audit
- **Coerce layer technical debt** — separate brainstorm (`brainstorm-260617-0212-coerce-layer-zod-native-migration.md`)

## Whole-Plan Consistency Sweep

- **Files reread during authoring:** `plan.md`, `phase-01` through `phase-06` (7 files); Plan 1a `plan.md` + closeout; Plan 1a code review report; brainstorm report; master tracker lines 160-190.
- **Decision deltas from brainstorm (operator 2026-06-17):**
  - Open Q2 (cold-session test isolation approach) → **NOT pre-resolved**; Phase 1 picks `before()` registration (simpler than full rewrite; matches Plan 1a review Minor 1 disposition).
  - Plan 1b scope extension from Plan 1a review → 1 Important + 6 Minor items added on top of the original 4 CR items. Total: 10 items, 5 phases of work + 1 acceptance phase.
  - PR structure → **1 PR with stacked commits** (Phase B pattern); commit order = easiest → hardest (Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5). Doc lands last to avoid stale references mid-PR.
- **Test count math (Plan 1b RED tests):** 4-5 new RED tests (Phase 2: 1; Phase 3: 1 deterministic + 3 coverage = 4; Phase 4: 1; Phase 1: 0). Net = ~5-6 new RED tests. The original 1069-test baseline grows by ~6 (Plan 1b target: ~1075 tests). Plus doc-only changes in Phase 5 (no test count change).
- **Reconciled stale references (from Plan 1a closeout):**
  - "9 test namespaces" → 10 (verified at `package.json:17`; 10 globs, not 9). Inherited from Plan 2 closeout; propagated through Plan 1a.
  - "+4 RED tests" → 5 new test files / 11 new tests in Plan 1a (Phase 2 had 2 test files, not 1).
  - Plan 1a journal hallucinated map names: 4 of 5 pre-fix maps are fabricated. Real 5 = `addresses_inverse, supersedes_inverse, origin_inverse, promoted_to_rule_inverse, reopens_inverse`.
  - Plan 1a journal `TERMINAL_STATUSES` claim: was pre-existing from plan 260611-1000; actual change at lines 179-186, not 14, 173-182.
  - `tools/learning-loop-mastra/package.json:34` reference → should be `package.json:28` (Plan 1a moved the zod pin to the root package.json).
- **Unresolved contradictions:** 0. All 10 items have a clear fix path; Plan 1b is a pure-hygiene batch (no TTL pressure, no finding-driven urgency).

## Key Risks Addressed

- **Mutex scope (Plan 1a review Important) over-serializes unrelated test setups.** Risk: low — over-serialization is correctness-preserving. Mitigation: Phase 2 scopes `inFlight` to per-`(serverEntry, tempRoot)` closure. RED test: 2 connectMcpServer calls with different `tempRoot` execute `listTools` concurrently.
- **Stale-rejection bug in `with-both-mcp-servers.js:46-60` (Plan 1a review Minor 1) propagates to a fresh operation.** Risk: low — currently masked by the new inner mutex in `with-mcp-server.js:23-28`; would surface if the inner mutex is removed. Mitigation: Phase 2 fixes the closure-level mutex to use the same `inFlight.then(() => operation(), () => operation())` pattern as the inner mutex.
- **Mutex race test does not deterministically prove the race (Plan 1a review Minor 2).** Risk: low — the test is still valid evidence (20 concurrent mixed-server writes complete without loss). Mitigation: Phase 3 stamps each entry with a write-order timestamp and asserts monotonic increase, OR adds back-to-back identical `change_target` IDs and asserts per-server ordering.
- **Inverse map `consolidated_into_inverse` does not dedup (Plan 1a review Minor 3).** Risk: low — no current consumer relies on dedup. Mitigation: Phase 4 adds the same `if (!arr.includes(id)) arr.push(id)` pattern as `promoted_to_rule` at line 282-284.
- **Misleading comment at `loop-introspect.js:304-308` (Plan 1a review Minor 4) about forward/inverse direction.** Risk: low — pure doc fix. Mitigation: Phase 4 rewrites the comment to match JSDoc in `meta-state.js:141`.
- **Doc drift in Plan 1a `plan.md:113` "+4 RED tests" / `closeout-report.md:28` "9 namespaces" / journal hallucinated map names.** Risk: low — purely documentation. Mitigation: Phase 5 corrects 5 doc locations atomically with the code fixes; the closeout-report claim becomes a future reference artifact.
- **Plan 1b slips behind Plan 3 author.** Risk: low — Plan 3 is blocked on Plan 1b in the master tracker; PR review rejects if Plan 1b not merged. Mitigation: the `blocks: ["phase-c-plan-3-cut-over"]` frontmatter declaration enforces the dependency.
- **5 new test files in Plan 1a already exceed the 1069 baseline; "+5" claim is itself stale.** Risk: low. Mitigation: the 5 new test files in Plan 1a are verified; Plan 1b adds ~5-6 more for the 6 phases of work. The new "durable anchor" is `pnpm test` pass/fail, not a count.

## References

- `plans/reports/brainstorm-260617-0212-pre-plan-3-prerequisite-fixes.md` (the parent 3-plan stack decision; Plan 1b scope = CR-3 to CR-6 + Plan 1a review followups)
- `plans/reports/code-reviewer-260617-1338-phase-c-plan-1a-atomic-fix-review-report.md` (Plan 1a code review; 1 Important + 6 Minor for Plan 1b)
- `plans/reports/code-reviewer-260617-0131-GH-2200-phase-c-plan-2-pr-review-report.md` (CR-3 to CR-6 origin; PR #3 code review)
- `plans/reports/productization-260612-1530-master-tracker.md` § Phase C (canonical state)
- `plans/260617-1138-phase-c-plan-1a-atomic-fix/plan.md` (predecessor; shipped 2026-06-17)
- `plans/260617-1138-phase-c-plan-1a-atomic-fix/reports/closeout-report.md` (Plan 1a closeout; needs doc-drift corrections)
- `docs/journals/2026-06-17-phase-c-plan-1a-closeout.md` (Plan 1a journal; contains hallucinated map names)
- `docs/project-changelog.md` (Plan 1a + Plan 2 entries; test count math)
- `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` (CR-3)
- `tools/learning-loop-mastra/__tests__/with-mcp-server.js:14-28` (Plan 1a review Important; module-level `inFlight`)
- `tools/learning-loop-mastra/__tests__/with-both-mcp-servers.js:46-60` (Plan 1a review Minor 1; stale-rejection bug)
- `tools/learning-loop-mastra/__tests__/connect-mcp-server-mutex.test.js:54-90` (Plan 1a review Minor 2; non-deterministic race test)
- `tools/learning-loop-mcp/core/loop-introspect.js:309-317` (Plan 1a review Minor 3; consolidated_into_inverse dedup)
- `tools/learning-loop-mcp/core/loop-introspect.js:304-308` (Plan 1a review Minor 4; misleading comment)
- `tools/learning-loop-mcp/core/loop-introspect.test.js` (Plan 1a review Minor 5; coverage gap)
- `tools/learning-loop-mcp/tools/meta-state-list-tool.js:14` (Plan 1a review Minor 6; TERMINAL_STATUSES naming)
- `package.json:17` (test script; 10 globs, not 9)
- `plans/260614-1259-phase-b-codegen-adoption/` (Phase B 3-plan pattern template)

## Validation Log

### Session 1 — 2026-06-17
**Trigger:** `/ck:plan validate` after plan authored via `--auto` mode.
**Questions asked:** 4 (this session).
**Tier:** Full (6 phases, 15+ claims/phase spot-checked; 14 verified, 0 failed after line-range corrections).

#### Verification Results
- **Claims checked:** 15 (6 phases × 2-3 high-risk claims each + 5 self-references)
- **Verified:** 14 (initial pass)
- **Failed:** 1 (self-referential: Phase 5's line references were wrong; corrected in this session)
- **Unverified:** 0
- **Tier:** Full (6 phases, 15+ claims/phase)
- **Spot-checks (verified):**
  - Claim 1 (10 test globs in package.json): VERIFIED at `package.json:17` (10 globs, not 9)
  - Claim 2 (TERMINAL_STATUSES at line 14): VERIFIED at `meta-state-list-tool.js:14`
  - Claim 3 (loop-introspect.js comment at 304-308): VERIFIED — comment says "finding side" (misleading; will be rewritten)
  - Claim 4 (consolidated_into_inverse at 309-317): VERIFIED — no dedup, uses `push(...ids)` instead of for-loop with includes
  - Claim 5 (promoted_to_rule pattern at 282-284): VERIFIED — uses `if (!ptrArr.includes(findingId)) ptrArr.push(findingId)` (the dedup pattern to mirror)
  - Claim 6 (cold-session hook-mirror test at line 341): VERIFIED — `cold-session-discoverability.test.cjs:341` is in the hook-mirror test block
  - Claim 7 (mutex test at 54-90): VERIFIED — `connect-mcp-server-mutex.test.js:54` starts the 20-parallel test
  - Claim 8 (Plan 1a plan.md 9-namespace claims at 46, 87, 113): VERIFIED at lines 44, 46, 85, 87, 113, 201 (5 lines, not 3)
  - Claim 9 (Plan 1a closeout 9-namespace claims at 28): VERIFIED at lines 6, 28 (2 lines, not 1)
  - Claim 10 (journal hallucinated map names at 38-60): FAILED — actual location is line 25 (not 54-60) for the 5-map claim; line 31 (not 38-39) for the TERMINAL_STATUSES claim
  - Claim 11 (Plan 2 R-09 arithmetic at line 105): FAILED — actual location is line 121
  - Claim 12 (with-mcp-server.js module-level inFlight at 14-28): VERIFIED via brainstorm + Plan 1a code review
  - Claim 13 (with-both-mcp-servers.js stale-rejection at 46-60): VERIFIED via Plan 1a code review
  - Claim 14 (Plan 1a shipped test count = 1069 pass / 0 fail / 1 skip): VERIFIED via Plan 1a closeout
  - Claim 15 (Plan 1b scope = 10 items = 4 CR + 1 Important + 6 Minor + 4 doc drift): VERIFIED — matches brainstorm + Plan 1a code review
- **Failures corrected:**
  - **Self-drift fix (Phase 5 line references):** Updated Phase 5 with verified line numbers (journal 25 + 31; Plan 2: 121; Plan 1a: 44, 46, 85, 87, 113, 201; closeout: 6 + 28). 5 LOC edits; all propagated.

#### Questions & Answers

1. **[Self-drift]** Plan 1b's own Phase 5 references wrong line numbers for the doc-drift fixes. How to handle?
   - Options: Correct Phase 5 line refs now | Defer to Phase 5 author | Add a grep-script to Phase 5
   - **Answer:** Correct Phase 5 line refs now
   - **Rationale:** Self-referential drift compounds; if Phase 5 lands with wrong references, the doc-drift fix itself is wrong. Verification cost is low (5 LOC); execution risk is high (Phase 5 author may miss lines 44, 85, 201 or 6, 25, 31).

2. **[TERMINAL rename]** How to resolve the `TERMINAL_STATUSES` naming inconsistency (3 entries vs 4 terminal statuses)?
   - Options: Rename to `EXCLUDABLE_STATUSES` | Add `"archived"` to the set | Leave as-is
   - **Answer:** Rename to `EXCLUDABLE_STATUSES`
   - **Rationale:** Pure rename + comment; no logic change. Keeps the dual-filter pattern intact. Lower blast radius than merging the two filters. Semantic accuracy: the set describes "statuses excluded by default," not "statuses that are terminal."

3. **[R-09 arithmetic]** Plan 2 plan.md:121 has the "R-09 arithmetic" (70 mastra-specific + 9 legacy = 79 test scopes). All counts are now stale. What to do?
   - Options: Update to durable anchor | Update to current counts | Leave Plan 2 plan.md alone
   - **Answer:** Update to durable anchor
   - **Rationale:** Precise counts are inherently stale (per-test counts are snapshots; per-namespace counts are durable). The 9-namespace / 70-mastra anchor is obsolete; the new anchor is the package.json test script (10 globs). Aligns with the validation decision rationale (testability is per-namespace, not per-count).

4. **[Phase 3 RED]** Phase 3 commits a RED test (duplicate-ids) that only becomes GREEN in Phase 4. How to structure the commits?
   - Options: Accept failing test mid-PR | Defer duplicate-ids to Phase 4 | Combine Phases 3 + 4
   - **Answer:** Accept failing test mid-PR
   - **Rationale:** Bisect-friendly (each commit is independently testable). The "test demonstrates the bug" narrative is valuable. CI shows 1 failing test between commits 3 and 4; this is documented in the PR description. Alternative (combine Phases 3+4) loses commit-order granularity without gaining signal.

5. **[Journal style — implicit]** The plan was authored with the "correct the names" option for the journal (not explicitly asked; inferred from the recommended approach in the validate-question-framework).
   - **Answer:** Correct the names in place (preserves "Brutal Truth" narrative voice; fixes technical details)
   - **Rationale:** The journal's "war story" tone is valuable; the technical details are wrong. Correcting the names in place (line 25) preserves both. The footnote / deletion options either preserve the error or lose the narrative.

#### Confirmed Decisions
- **Self-drift fix:** Phase 5's line references updated to verified locations; propagated via `<!-- Updated: Validation Session 1 -->` marker.
- **TERMINAL rename:** `TERMINAL_STATUSES` → `EXCLUDABLE_STATUSES`; comment at lines 12-13 updated; all references in the file (lines 14, 179, 182) updated.
- **R-09 arithmetic:** Plan 2 plan.md:121 rewritten to anchor on "all 10 test namespaces pass" (durable).
- **Phase 3 RED:** Accept failing test mid-PR; document in PR description.
- **Journal style:** Correct hallucinated map names in place at line 25; correct TERMINAL_STATUSES origin claim at line 31.

#### Action Items
- [x] Phase 5 line references updated (DONE this session).
- [x] All validation decisions propagated to Phase 5 (DONE this session).
- [x] Plan 1b's own plan.md corrected (whole-plan consistency sweep below).

#### Impact on Phases
- **Phase 5 (doc-drift corrections):** Major update — line references corrected, validation decisions applied, journal style decision added, Phase 3 RED risk documented.
- **Phase 3 (test strengthening):** Implicit — confirmed accepting failing test mid-PR (no code change; commit-order decision).
- **Phase 4 (inverse map dedup):** Implicit — confirmed GREEN target for the duplicate-ids test from Phase 3.
- **Plan.md (this file):** Validation Log section populated; Whole-Plan Consistency Sweep updated with validation decisions.

#### Whole-Plan Consistency Sweep
- **Files re-read:** `plan.md`, `phase-01` through `phase-06` (7 files).
- **Stale terms removed in Phase 5:** "9 test namespaces" (line refs updated to all "all test namespaces"); "TERMINAL_STATUSES" (rename decision documented).
- **Line-range corrections applied to Phase 5:** journal 38-60 → 25 + 31; Plan 2 105 → 121; Plan 1a 46/87/113 → 44, 46, 85, 87, 113, 201; closeout 28 → 6 + 28.
- **Journal style decision applied:** "Correct names in place" (not footnote, not deletion); both locations (line 25 hallucinated maps; line 31 TERMINAL_STATUSES origin) updated.
- **Phase 3 RED risk documented:** "Accept failing test mid-PR" decision propagated to Phase 5's Risk Assessment.
- **Unresolved contradictions:** 0. All 4 validation questions resolved; journal style decision inferred and documented.
