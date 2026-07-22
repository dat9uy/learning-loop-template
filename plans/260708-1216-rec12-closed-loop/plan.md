---
title: "Rec 12 closed loop: change-log gap detection + session-start gap surfacing"
description: "Ship Rec 12 components (b)+(c): a derived change-log gap query (bound-artifact paths touched on the branch ∖ paths covered by meta_state_log_change entries) and its session-start surfacing via a new buildChangeLogGapHints builder wired into the existing SessionStart hook. Mirrors the buildStaleDispatchHints precedent (pure function over entries + caller-supplied set; read-only hook; additive session-context key). Does NOT ship the deferred SessionEnd/pre-commit hook or the consult-gate enforcement — those are downstream (the hook is the promotion of a recurring gap once (b)+(c) show a drift rate above threshold). Un-blocks UQ5 by landing the named un-block condition itself."
status: completed
priority: P2
branch: "rec12-closed-loop"
tags: [rec12, change-log, gap-detection, session-start, bound-artifacts, derived-view]
blockedBy: [260708-1135-rec12-l1-trigger-statement-and-symmetry]
blocks: []
created: "2026-07-08T05:20:50.994Z"
createdBy: "ck:plan"
source: skill
---

# Plan 4: Rec 12 closed loop — change-log gap detection + session-start gap surfacing

**Date:** 2026-07-08
**Status:** pending (deep mode; red-team + validation pending).
**Tracker row:** `plans/reports/from-problem-solving-to-plan-split-260707-0812-rec12-lifecycle-pr-tracker-report.md` → "Plan 4 — Rec 12 closed loop (b)+(c) merged".
**Depends on:** Plan 3 (`260708-1135-rec12-l1-trigger-statement-and-symmetry`, shipped PR #40 squash `e0294b2`) — needs the (a) trigger definition in `docs/loop-engine.md` to know what a change-log *should* be.
**Off main @:** `a7da7fb` (post-PR-#40).

## Why

Plan 3 shipped the Rec 12 *concept* — the change-log trigger rule + Q11 operator/agent symmetry in `docs/loop-engine.md`. But the loop still cannot **detect** when that trigger was missed: a bound-artifact edit (a `tools/**`/`core/**`/`docs/**`/schema/skill change) that landed with no `meta_state_log_change` entry. That is `loop-engine.md` open Q1's "missing half" — the detection that closes the change-log loop. Without it, the trigger is an aspiration the loop cannot self-verify.

This plan ships the missing half as a **derived view surfaced at session start**, paralleling the Rec 10 stale-dispatch surfacing shipped by Plan 1 (`buildStaleDispatchHints` in `core/loop-introspect.js`, injected by `session-start-inject-discoverability.cjs`). At each SessionStart, the loop queries the branch's touched bound-artifact paths (git) that no change-log covers, and injects the gap set into `.claude/session-context.json`. The operator/agent sees "N bound edits on this branch have no change-log" and can backfill.

The deferred SessionEnd/pre-commit hook (skill-layer prerequisite UQ5) is the *promotion* of a *recurring* gap into enforcement — downstream of (b)+(c). Plan 4 ships (b)+(c) and *documents* the un-block condition; it does not ship the hook.

## Decisions locked (this planning session)

1. **Gap = derived view, NOT persisted finding.** The session-start hook is read-only (exit 0, no registry writes — the `buildStaleDispatchHints` contract). So (b) is a pure query and (c) surfaces its output. Persistence + recurrence→promotion is the deferred SessionEnd hook's job. This matches the Rec 10 precedent and the YAGNI/KISS read of the tracker exit criteria ("gap-detection query produces correct gap set ... session-start output surfaces the gap"). The tracker's "gap finding" language = a gap *signal*, not a `meta_state_report` entry.
2. **Touched-path source = git diff of branch vs `git merge-base main HEAD`** + uncommitted working-tree (`git diff --name-only HEAD`). The only viable source: file-index.jsonl holds only *cited* paths (wrong semantics — a bound edit with no finding and no change-log is exactly the case absent from the index); runtime-state.jsonl carries ledger events, not path edits. `git` is read-only and side-effect-free — the relevant invariant is "deterministic core does no external side effects" (a read-only git call honors it), NOT the bash-gate verify-cmd-allowlist (that governs operator shell commands, not `core/` `spawnSync` calls — red-team M1).
3. **Session bound = branch, not session_id or time.** Change-log entries carry NO `session_id` (only `created_at`); `session_id` is findings-only. A branch is the natural unit of work and is deterministic. **On main** (the operator's primary path — recent commits are on main), `merge-base main HEAD` = HEAD → committed diff empty, BUT uncommitted working-tree edits (`git diff --name-only HEAD`) still surface — so the signal on main = "uncommitted bound edits have no change-log." Committed-on-main edits that were never logged are OUT of reach of the branch-bound detector (the deferred pre-commit hook catches those at commit time) — accepted limitation, documented in phase 2 + phase 5. (Red-team H1 reconciled: main is NOT a no-op; it surfaces working-tree gaps only.)
4. **Join key = coarse prefix-descendant match over a robust canonicalizer.** A touched path `p` is *covered* if some change-log entry's canonicalized path set contains a path equal to `p` OR a parent directory of `p`. The canonicalizer MUST handle three real-registry patterns (red-team C1/C2/C3, verified against 167 entries): (a) strip `#anchor` suffixes (`tools/.../gate-logic.js#applyPromotedRules` → `tools/.../gate-logic.js`); (b) normalize the `learning-loop-mcp` → `learning-loop-mastra` rename (104 legacy entries use the old name; git reports the new name — a file logged under its old name WAS logged); (c) repo-relativeize bare loop-internal paths (`core/meta-state.js` → `tools/learning-loop-mastra/core/meta-state.js`) for `applies_to.schemas` tokens that start with a loop-internal subdir (`core/`/`tools/`/`hooks/`/`mastra/`) without the package prefix. For a *signal* (not enforcement), false-negative-safe (coarse over-coverage) beats false-positive-noisy. The deferred hook tightens this if drift shows false negatives.
5. **Detection set + canonicalizer = a new `core/change-log-bound-paths.js` sibling module**, DISTINCT from `core/bound-artifacts.js` (the write-gate constant). The Rec 12 detection surface (`docs/**`, `tools/learning-loop-mastra/{core,tools,hooks}/**`, `schemas/**`, skills mirrors, `AGENTS.md`, `CONTRACT.md`) is a superset of the gate surface. Co-locating in `bound-artifacts.js` was rejected (red-team M2/UQ3): `bound-artifacts.js` is gate-only in spirit (its FCIS test enforces no-`@mastra/*`-imports, not "data-only" — it already imports `globMatch`); adding detection logic + a Rec 12 concept there blurs the gate/detection boundary. Extending `BOUND_ARTIFACTS` would silently change write-gate behavior — a separate scope this plan does NOT take on.
6. **git read in a new `core/git-diff.js` helper** (`spawnSync('git', [...], {shell:false})`, read-only), called by the hook; the `buildChangeLogGapHints(entries, touchedPaths)` builder stays pure (caller-supplied set, mirroring `dispatchIds`).
7. **Scope = (b)+(c) + document the SessionEnd un-block condition + record the enforcement followup as a loop-design.** The consult-gate/skill *enforcement* and the SessionEnd/pre-commit hook are downstream. Plan 3's exit-criteria note "Enforcement (consult-gate/skill + detection) lands in Plan 4" groups enforcement WITH detection; the tracker row for Plan 4 scopes to (b)+(c)+document (red-team H2). **Validation Q1 resolved:** ship (b)+(c)+document only; observe the drift rate before designing the gate; AND record the deferred enforcement as a `loop-design` entry via `meta_state_propose_design` (phase 5) so it is a tracked, discoverable artifact the cold tier surfaces — not a lost deferral. The "closed loop" closes at the deferred hook, not here.

## Scope boundary (explicit)

- **In scope:** `CHANGE_LOG_BOUND_PATHS` detection constant + `canonicalizeChangeTarget` (strip `#anchor`, normalize `mcp`→`mastra`, repo-relativeize bare schemas) in a new `core/change-log-bound-paths.js`; `core/git-diff.js` read-only branch-diff reader; `buildChangeLogGapHints(entries, touchedPaths)` pure builder in `core/loop-introspect.js`; session-start hook wiring (additive `change_log_gap_hints` key in both write sites); tests (pure-fn + fixture git repo + smoke, with real-registry `change_target` fixtures); `meta_state_log_change` recording the `loop-engine.md` un-block statement; `meta_state_propose_design` recording the deferred consult-gate enforcement as a `loop-design` (Validation Q1); document the SessionEnd un-block condition (the hook owns its own recurrence persistence — red-team H3).
- **Out of scope (downstream):** the SessionEnd/pre-commit hook itself (the promotion); consult-gate/skill enforcement of the change-log trigger; write-gating `docs/**`/`tools/**`/`core/**` direct writes; persisting gap findings; a `change_target` schema tightening (canonicalization is a *reader* rule, not a schema change).
- **Threat-model boundary:** the gap detector is advisory (a session-start signal), not a gate. It cannot block edits or writes. False negatives (missed gaps from coarse prefix matching or uncanonicalized `change_target`) do not corrupt state — they only suppress a signal. False positives (noise) cost operator attention, not correctness.

## Phases (smallest-first, lowest-risk-first)

| Phase | Name | Risk | Depends on | Status |
|---|---|---|---|---|
| 1 | [Bound-artifact detection set + change_target canonicalizer](./phase-01-bound-artifact-detection-set-change-target-parser.md) | Low (new data-only sibling module + pure canonicalizer, TDD against real-registry fixtures) | — | Pending |
| 2 | [git-diff touched-paths reader](./phase-02-git-diff-touched-paths-reader.md) | Medium (new mechanism class: `child_process` in core; fixture-repo tests) | 1 | Pending |
| 3 | [buildChangeLogGapHints pure builder](./phase-03-buildchangeloggaphints-pure-builder.md) | Low-medium (pure function; mirrors `buildStaleDispatchHints`) | 1, 2 | Pending |
| 4 | [Session-start hook wiring](./phase-04-session-start-hook-wiring.md) | Medium (hot path; both write sites; exit-0 invariant) | 3 | Pending |
| 5 | [SessionEnd un-block documentation](./phase-05-sessionend-un-block-documentation.md) | Low (docs-only + one `meta_state_log_change`) | 4 | Pending |

Phases 1 + 3 are pure-logic (TDD-fast). Phase 2 introduces the only new mechanism class (git in core). Phase 4 is the integration on the session-start hot path. Phase 5 closes the docs loop and records the change-log.

## Dependencies

**Cross-plan:**
- `blockedBy: [260708-1135-rec12-l1-trigger-statement-and-symmetry]` — Plan 3, shipped PR #40. Provides the Rec 12 trigger definition in `docs/loop-engine.md:88-91` this plan's detection encodes. Complete (verified: `meta-260708T1204Z-docs-loop-engine-md` change-log present; trigger section + Q11 symmetry in `loop-engine.md`).

**Forward (not yet cut):**
- The SessionEnd/pre-commit hook (UQ5) un-blocks when this plan ships (b)+(c). The hook is the *promotion* of a recurring gap into enforcement. This plan documents that condition in `docs/loop-engine.md` (phase 5) but does not ship the hook.
- The consult-gate/skill enforcement of the change-log trigger sits on this plan's detection. Downstream plan (TBD).

## Acceptance criteria

- `core/change-log-bound-paths.js` exports `CHANGE_LOG_BOUND_PATHS` (the Rec 12 detection set: `docs/**`, `tools/learning-loop-mastra/{core,tools,hooks}/**`, `schemas/**`, `<surface>/skills/**`, `AGENTS.md`, `CONTRACT.md`) + `canonicalizeChangeTarget(entry)`; `core/bound-artifacts.js` and its pinned-order test are unchanged (gate-only).
- `canonicalizeChangeTarget(entry)` returns a `Set<string>` of repo-relative paths/dirs from `change_target` (split on ` + `, strip `#anchor`, normalize `learning-loop-mcp`→`learning-loop-mastra`, repo-relativeize bare loop-internal tokens, drop non-path tokens without `/` unless an exact top-level file) merged with `applies_to.schemas` (same normalization). Pinned fixtures drawn from REAL registry entries: anchor-suffixed (`tools/learning-loop-mastra/core/gate-logic.js#applyPromotedRules`), pre-rename (`tools/learning-loop-mcp/...`), bare schemas (`["core/meta-state.js"]`), compound, directory, non-path.
- `core/git-diff.js` exports `readBranchTouchedPaths(root, { baseBranch = "main" } = {})` returning repo-relative paths via `spawnSync('git', [...], {shell:false, timeout})` — committed-on-branch (`<merge-base>..HEAD`) ∪ uncommitted (`HEAD`); returns `[]` when not a git repo / git unavailable / any git error (never throws). On main: committed diff empty, uncommitted working-tree edits still surface. Fixture-repo test + not-a-repo + on-main + git-missing + timeout cases.
- `buildChangeLogGapHints(entries, touchedPaths = new Set())` in `core/loop-introspect.js` is a pure function returning `{ gap_candidates, gap_protocol_prompt }`; `gap_candidates` = touched paths that are (a) under a `CHANGE_LOG_BOUND_PATHS` prefix AND (b) not covered by any change-log entry's canonicalized path set (prefix-descendant match), top-5, deterministic order. Reuses `top5OldestFirst` is NOT applicable (paths, not entries) — sort by path string for determinism.
- `session-start-inject-discoverability.cjs` writes a new top-level `change_log_gap_hints` key to `.claude/session-context.json` in BOTH the happy-path write (`:63-68`) and the fatal-catch write (`:82`); the hook reads `readBranchTouchedPaths` + `readRegistry` and calls `buildChangeLogGapHints`; exit-0 invariant preserved; stderr log line includes the gap count.
- `__tests__/legacy-mcp/build-change-log-gap-hints.test.js` covers every filter predicate + cap-at-5 + determinism + the prefix-descendant coverage rule (covered-by-directory, covered-by-exact, uncovered-gap); `session-start-inject-discoverability.test.cjs` gets one additive assertion (`Array.isArray(context.change_log_gap_hints?.gap_candidates)`).
- `docs/loop-engine.md` carries the SessionEnd un-block statement (the (b)+(c) closed loop is the named un-block; the hook is the promotion downstream; the hook owns recurrence persistence); `meta_state_log_change` records the `loop-engine.md` edit; `meta_state_propose_design` records the deferred consult-gate enforcement as a `loop-design` (tracked, discoverable in the cold tier).
- Each phase is tests-first (TDD); all `pnpm test` touched suites green; the new `core/git-diff.js` is audited against `rule-runtime-agnostic-features` (item 1 only applies — already satisfied; document the audit result in phase 2).
- **Validation locked (2026-07-08):** scope = (b)+(c)+document + enforcement-followup loop-design (not the consult-gate itself); smoke test asserts the key + fatal-catch shape; gap_candidates ordered by path string; canonicalizer normalizes `mcp`→`mastra`.

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| `change_target` free-text → join-key mismatch (anchor suffixes, `mcp`→`mastra` rename, bare `applies_to.schemas`) → false gaps on 62%+ of real entries | High → fixed | Canonicalizer strips `#anchor`, normalizes `learning-loop-mcp`→`learning-loop-mastra`, repo-relativeizes bare loop-internal schemas (decision 4, red-team C1/C2/C3). Phase 1 fixtures drawn from REAL registry entries, not synthetic shapes. Residual: uncanonicalized caller free-text — accepted (advisory signal). |
| Coarse prefix matching over-covers (one `"docs/"` log silences all docs gaps) | Medium | Accepted for a signal (false-negative-safe). Phase 5 documents that the deferred hook tightens this if drift shows false negatives. |
| Main-branch contradiction (decision 3 vs phase 2 step 3) | High → fixed | Reconciled (decision 3): on main, committed diff empty, uncommitted working-tree edits surface. Committed-on-main un-logged edits out of reach — deferred pre-commit hook's job. Phase 2 fixture covers on-main working-tree. |
| `child_process.spawnSync('git', …)` in core is a new mechanism class (no git precedent in core/) | Medium | Read-only, `shell:false`, args-as-array (no shell injection), `timeout` bound, failure → `[]` (never throws). Justified on side-effect-free grounds, NOT the bash-gate allowlist (red-team M1). Phase 2 fixture-repo + not-a-repo + on-main + git-missing + timeout tests. |
| Session-start hot-path latency (spawnSync git on EVERY session start; WSL2 cold 200-500ms) | Medium | `timeout` bounds the worst case (degraded to empty, not fatal). Phase 2 measures on WSL2 before shipping; if >200ms cold, add a `(HEAD, merge-base)`-keyed cache file with a mtime check. Cost is paid once per session (red-team M4). |
| Recurrence-tracking gap: (b)+(c) derive, never persist → the deferred SessionEnd hook has no recurrence signal to promote | Medium → fixed | Phase 5 documents that the SessionEnd hook owns its own recurrence persistence (re-runs detection each session-end, keeps a counter in `runtime-state.jsonl`). (b)+(c) are the detection the hook calls; they intentionally leave no state. The "closed loop" closes at the hook, not here (red-team H3). |
| git-in-tests: no precedent for `git init` + `spawnSync('git')` in the test suite; CI git availability unverified | Medium | Phase 2 adds a skip-when-git-absent guard (`which git` check) so the suite degrades cleanly on a git-less CI image. node:test has no sandbox; `git init` in `mkdtempSync` should work — verify on the actual CI image (red-team M3). |
| `change_log_gap_hints` key missing from the fatal-catch write → downstream reader sees missing key on a failure path | High | Phase 4 adds the key to BOTH write sites (happy `:63-68` + fatal-catch `:82`) — the stale-dispatch precedent's invariant. Smoke test + a fatal-catch-shape test pin it. |
| Scope creep into the SessionEnd hook or consult-gate enforcement | Medium | Decisions 1 + 7 + the Scope boundary pin this to (b)+(c) + document. Validation Q1 confirms. |
| git diff on a worktree / detached HEAD / shallow clone behaves unexpectedly | Low | Phase 2 tests `--no-git` + on-main paths; `readBranchTouchedPaths` returns `[]` on any git failure. Red-team edge-case sweep: detached HEAD + shallow clone handled (merge-base failure → `[]`); worktrees OK; no submodules in this repo. |

## Validation log

### Validation Session 1 — 2026-07-08 (deep mode step 7)

Interview (4 questions):

- **Q1 Enforcement scope → (b)+(c)+document only + record enforcement followup as a loop-design.** Ship detection + surfacing + document the un-block; do NOT ship consult-gate enforcement this plan. Observe the drift rate before designing the gate. The deferred enforcement is recorded as a `loop-design` via `meta_state_propose_design` (phase 5) so it is a tracked, discoverable artifact, not a lost deferral. (Red-team H2 resolved.)
- **Q2 Smoke test → assert the key + a fatal-catch-shape test.** Pins the load-bearing both-write-sites invariant (red-team C-series severity). (Already in phase 4; confirmed.)
- **Q3 Gap ordering → by path string, deterministic.** Paths carry no `created_at`; the `top5OldestFirst` oldest-first rationale does not transfer. `localeCompare` + `slice(0,5)`. (Already in phase 3; confirmed.)
- **Q4 Pre-rename `mcp` entries → normalize `learning-loop-mcp`→`learning-loop-mastra`.** A file logged under its old name WAS logged; normalization makes 104 legacy entries count as coverage instead of surfacing false gaps until they age out. (Already in phase 1; confirmed.)

### Verification Results

- Tier: Full (5 phases) — verification covered by the red-team reviewer (data-driven against 167 registry entries) + the whole-plan consistency sweep; 13 findings applied (3 Critical, 3 High, 5 Medium, 3 Low).
- Claims checked: ~45 across plan + 5 phases | Verified: 45 | Failed: 0 (after red-team corrections + validation propagation).
- Failures: none remaining.

### Whole-Plan Consistency Sweep (post-validation, 2026-07-08)

Re-read `plan.md` + all 5 phase files after the 4 validation decisions. Checks:
- "Enforcement lands in Plan 4" → resolved: (b)+(c)+document only + enforcement-followup loop-design (decision 7, phase 5).
- Smoke-test assertion → confirmed assert + fatal-catch (phase 4).
- Gap ordering → confirmed by-path-string (phase 3).
- `mcp`→`mastra` normalization → confirmed in canonicalizer (phase 1).
- Red-team consistency sweep (prior) findings still resolved (canonicalizer robustness; main-branch surfacing; sibling module; allowlist justification; recurrence ownership).
- **Unresolved contradictions: 0.** Plan is eligible for implementation.

## Red Team Review

### Session — 2026-07-08
**Reviewer:** code-reviewer (adversarial, data-driven against 167 registry entries).
**Findings:** 13 raw → 3 Critical, 3 High, 5 Medium, 3 Low.
**Verdict applied:** C1/C2/C3 (canonicalizer vs real registry data) + H1 (main-branch contradiction) corrected before validation — plan now eligible.

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| C1 | `change_target` `#anchor` suffix breaks coverage join (~135 entries) | Critical | Accept | Decision 4 + phase 1 (strip `#anchor` + real fixture) |
| C2 | `mcp`→`mastra` rename: 104 legacy entries invisible to the join | Critical | Accept | Decision 4 + phase 1 (normalize `learning-loop-mcp`→`learning-loop-mastra`) |
| C3 | `applies_to.schemas` bare (not repo-relative) — never matches | Critical | Accept | Decision 4 + phase 1 (repo-relativeize bare loop-internal schemas) |
| H1 | Main-branch surfacing contradiction (decision 3 vs phase 2 step 3) | High | Accept | Decision 3 (on main: working-tree edits surface; committed-main out of reach) + phase 2 fixture |
| H2 | Plan 3 "enforcement lands in Plan 4" vs Plan 4 (b)+(c)-only scope | High | Accept → Validation Q1 | Decision 7 (deferred to validation) |
| H3 | Recurrence-tracking gap (derived, never persist → hook can't count recurrence) | High | Accept | Phase 5 (SessionEnd hook owns its own recurrence persistence) |
| M1 | `git` allowlist justification is a non-sequitur | Medium | Accept | Decision 2 (justify on side-effect-free grounds) |
| M2 | `bound-artifacts.js` FCIS is `@mastra/*`-only, not "data-only" | Medium | Accept | Decision 5 + phase 1 (new sibling `core/change-log-bound-paths.js`) |
| M3 | No test precedent for `git init`/`spawnSync('git')`; CI git unverified | Medium | Accept | Phase 2 (skip-when-git-absent guard) + risk row |
| M4 | WSL2 hot-path latency (200-500ms cold), no caching | Medium | Accept | Phase 2 (measure on WSL2; cache if >200ms) + risk row |
| M5 | Bare filename tokens (`*.js` without `/`) survive canonicalizer | Medium | Accept | Phase 1 keep-rule (require `/` OR exact top-level allowlist) |
| L1 | `gap_protocol_prompt` static, cannot name which path | Low | Accept | Phase 3 (include first gap path in the prompt) |
| L2 | Phase 5 `change_diff` arrays left as placeholders | Low | Accept | Phase 5 (fill at cook time) |
| L3 | Rename/delete/mode-only in `git diff --name-only` undocumented | Low | Accept | Phase 2 (one-line note) |

### Whole-Plan Consistency Sweep (post-red-team, 2026-07-08)

Re-read `plan.md` + all 5 phase files after applying the 13 findings. Checks:
- "data-only FCIS" framing → **absent**; replaced by "no-`@mastra/*`-imports" + sibling module (decision 5, phase 1).
- "session-start on main is a no-op" → **absent**; replaced by "on main, working-tree edits surface" (decision 3, phase 2).
- "co-locate in `bound-artifacts.js`" → **absent**; replaced by new `core/change-log-bound-paths.js` (decision 5, phase 1, phase 3 import).
- Synthetic `applies_to.schemas` fixtures → **absent**; replaced by real-registry fixtures (phase 1).
- Allowlist justification → **absent**; replaced by side-effect-free justification (decision 2).
- Recurrence gap → documented (phase 5, risk row).
- **Unresolved contradictions: 0** (after H1/H2/H3 dispositions; H2 carries to validation as Q1). Plan eligible for the validation interview.

## Unresolved questions

None remaining. Q1–Q4 resolved in the validation interview (2026-07-08):
- Q1 → (b)+(c)+document only + enforcement-followup `loop-design` (decision 7, phase 5).
- Q2 → assert `change_log_gap_hints` + fatal-catch-shape test (phase 4).
- Q3 → gap_candidates ordered by path string, deterministic (phase 3).
- Q4 → normalize `learning-loop-mcp`→`learning-loop-mastra` in the canonicalizer (phase 1).

The SessionEnd/pre-commit hook (UQ5) remains deferred with the named un-block = (b)+(c) themselves; phase 5 documents the un-block condition + the hook's recurrence ownership.