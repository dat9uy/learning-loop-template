---
title: "meta-state refresh: cache-key fix + pretest seed + hint"
description: "Close the N-trial-and-error loop that the meta-state refresh workflow forces on every code-touching fix. Three additive changes — include file-index.jsonl SHA in cold-tier cache key; wire the existing seed-file-index.mjs into the pretest step; add a mirrored PROCESS_HINTS row about pretest seeding and the per-path refresh escape hatch. No new MCP tools, no new scripts. Resolves meta-260714T1704Z."
status: pending
priority: P2
branch: "main"
tags: [loop, meta-state-refresh, pretest, cache, process-hints, runtime-agnostic]
blockedBy: []
blocks: []
created: "2026-07-14T13:13:37.481Z"
createdBy: "ck:plan"
source: skill
---

## Red Team Review

### Session — 2026-07-14
**Reviewers:** Security Adversary (Fact Checker), Failure Mode Analyst (Flow Tracer), Assumption Destroyer (Scope Auditor)
**Findings:** 15 raw → 15 deduped (capped at 15). **Disposition: 14 Accept, 1 Reject.**

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | PROCESS_HINTS array is 8 rows today, not 7 — plan off-by-one; sibling length-8 test `gate-logic-consult-checklist-fallow-brief.test.js:74` will hard-fail | Critical | Accept | Phase 3 + plan AC#4 |
| 2 | Phase 1 test isolation: shared `GATE_ROOT`; plan's new test would pollute later tests in the same file | Critical | Accept | Phase 1 + Phase 4 verification |
| 3 | `HINT_KEY_MAP_PROCESS` (3 keys) and `HINT_SUGGESTIONS_PROCESS` (3 entries) silently lag `PROCESS_HINTS` (8 entries) — new 9th row unreachable via `loop_get_instruction({key})` | High | Accept | Phase 3 related-code-files + implementation steps |
| 4 | Drafted PROCESS_HINTS row text references `pnpm test:cold-session` as seeded — contradicts Phase 2 (which excludes that script) | High | Accept | Phase 3 drafted row text |
| 5 | Pretest seed becomes hard pre-commit gate with no documented escape for legitimate file-rename / uncommitted-mv scenarios | High | Accept | Phase 2 + seed-file-index.mjs (add SKIP_PRESEED) |
| 6 | Cold-tier-regression test does not exercise the new cache key — verify step's "all green" claim is uninformative for cache correctness | High | Accept | Phase 1 acceptance criteria (rely on new unit test, not regression) |
| 7 | Test count claim is 6 existing (not 5); 6+1=7 not 6 | High | Accept | Phase 1 step 5, Phase 4 verification |
| 8 | TOCTOU race: two separate readFileSync calls for `registry_sha256` and `file_index_sha256`; concurrent writer between reads → stale-cache hit | Medium | Accept | Phase 1 architecture + implementation |
| 9 | `seed-file-index.mjs` lacks path-containment check; hashes any relative path under root (including `tools/learning-loop-mastra/data/`, `.git/`) | Medium | Reject | Out of scope for this plan (seed is already an existing primitive); revisit in follow-up |
| 10 | Live file-index size: 47 entries / 19 `mechanism_check:true` paths (plan said ~44 in two places) | Medium | Accept | Phase 1 + Phase 2 risk assessments |
| 11 | Drafted PROCESS_HINTS row conflates `seed-file-index.mjs` (no gate-log) with `meta_state_refresh_file_index` (audited) | Medium | Accept | Phase 3 drafted row text (audit distinction explicit) |
| 12 | Auto-seed suppresses at-commit drift signal with no opt-out for "cold" runs | Medium | Accept (merged with #5) | Phase 2 (SKIP_PRESEED escape) |
| 13 | Plan claims `meta_state_resolve` and `meta_state_ship_loop_design` are idempotent — `meta_state_resolve` errors on already-terminal; ship is documented idempotent | Medium | Accept | Phase 4 verification steps (check status first; handle already_shipped) |
| 14 | Cross-platform shell-quoting claim ("pnpm normalizes") is unverified for Windows | Medium | Accept | Phase 2 risk (remove claim; note as future work) |
| 15 | Pretest seed cost estimate "tens of milliseconds" unsubstantiated; sequential for-await with enqueue serialization closer to 500-1500ms | Medium | Accept | Phase 2 (add measurement step before claiming negligible) |

### Whole-Plan Consistency Sweep (post-apply)

After applying the 14 edits, this sweep re-reads `plan.md` + every `phase-*.md` and reconciles:
- **Renumbering:** `PROCESS_HINTS` 7→9 propagated to plan AC#4, phase 3 step 1, step 6, step 7, success criteria.
- **Sibling test:** `gate-logic-consult-checklist-fallow-brief.test.js:74` length-8 assertion updated to 9 in the same commit as the row append (Phase 3 step 4b — new sub-step).
- **Mirror contract:** 4-file PROCESS_HINTS mirror updated (was 2 in original plan): `loop-introspect.js` + `.factory/hooks/loop-surface-inject.cjs` + `loop-get-instruction-tool.js` (`HINT_KEY_MAP_PROCESS` + `HINT_SUGGESTIONS_PROCESS`).
- **Count claims:** all size/count claims updated to live `wc -l` (47 file-index entries, 19 mechanism_check:true paths).
- **Drafted row text:** rewritten in Phase 3 step 2 to (a) drop `pnpm test:cold-session` reference, (b) make the audit-log distinction between seed (no gate log) and refresh (audited) explicit.
- **SKIP_PRESEED:** Phase 2 adds the env-var escape hatch in `seed-file-index.mjs` (small scope addition) + documents the recovery procedure in the Risk Assessment.
- **Test count:** Phase 1 + Phase 4 reflect 6 existing + 1 new = 7 tests in `loop-describe-cold-cache.test.js`.
- **TOCTOU:** Phase 1 architecture + implementation now describe atomic paired SHA: read both files into memory, hash both, compare both, then write/persist both.
- **Cold-tier-regression claim:** Phase 1 acceptance reframed — the new unit test proves cache invalidation; cold-tier-regression is a no-regression check, not a cache-correctness check.
- **Cross-platform note:** Phase 2 drops the unverified shell-quoting claim.
- **Seed cost:** Phase 2 step 4b adds a measurement step (timed run before claiming negligible).
- **Unresolved contradictions:** zero — sweep clean.

# meta-state refresh: cache-key fix + pretest seed + hint

## Overview

Closing file-edit drift currently burns 30–90s per code-touching fix: (a) N sequential `meta_state_refresh_file_index` MCP round-trips, (b) cold-tier-regression test failures against pre-existing drift not discoverable up-front, (c) manual `rm records/meta/.cache/loop-describe-cold.json` because the cold-tier cache is keyed on registry SHA only. The brainstorming report (`plans/reports/brainstorm-260714-1955-meta-state-refresh-trial-and-error-report.md`, APPROVED) analyzed 4 tiers and selected **Approach A**: reuse the already-committed `seed-file-index.mjs` primitive, fix the cache-key bug, add a deterministically-injected hint. Tier 2/3 (batch MCP) explicitly YAGNI.

**This plan ships 3 additive changes — no new MCP tool, no new CLI script:**

1. `core/loop-introspect-cache.js` cache-key includes `file-index.jsonl` SHA, so pre-existing drift can no longer hide behind stale cold-tier cache.
2. `package.json test` script prepends `seed-file-index.mjs` before `vitest run`, so `pnpm test` and the simple-git-hooks pre-commit hook absorb the O(n) fingerprint drift without operator action.
3. Canonical PROCESS_HINTS row in `core/loop-introspect.js` (mirrored byte-for-byte to `.factory/hooks/loop-surface-inject.cjs LOCAL_PROCESS_HINTS`) teaches the agent the pretest-seed convention + the single-path refresh escape hatch.

Brainstorm report: `plans/reports/brainstorm-260714-1955-meta-state-refresh-trial-and-error-report.md`
Resolves: `meta-260714T1704Z-the-meta-state-refresh-workflow-forces-n-trial-and-error-mcp`

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Cache-key Fix (TDD)](./phase-01-cache-key-fix-tdd.md) | Pending |
| 2 | [Pretest Seed Wiring](./phase-02-pretest-seed-wiring.md) | Pending |
| 3 | [PROCESS_HINTS Row + Parity Mirror](./phase-03-process-hints-row-parity-mirror.md) | Pending |
| 4 | [Resolve Finding + Ship](./phase-04-resolve-finding-ship.md) | Pending |

## Dependencies

No cross-plan blocking. Tangential (not blocking, no file overlap):
- `260714-1827-vitest-jq-parse-procedure` (completed) — vitest half of the same UX gap. Different PROCESS_HINTS row position and different code area. Coordinate only if concurrently editing `core/loop-introspect.js` PROCESS_HINTS.
- `260710-0104-drift-driven-registry-closeout` (completed) — codified the prior-art circuit-breaker for reground-loop pathology. Tier 4 fix is correctness, not a reground loop — no circuit-breaker risk reintroduced.

## Acceptance Criteria

1. `pnpm test` first-try passes after editing any file cited by a `mechanism_check:true` finding — without manual `meta_state_refresh_file_index` calls and without `rm records/meta/.cache/loop-describe-cold.json`.
2. `tools/learning-loop-mastra/__tests__/legacy-mcp/loop-describe-cold-cache.test.js` gains a new test that proves cold-tier cache invalidates when `file-index.jsonl` SHA changes (registry unchanged).
3. `package.json test` script begins with `node tools/learning-loop-mastra/tools/handlers/scripts/seed-file-index.mjs &&`; pre-commit hook (`simple-git-hooks.pre-commit`) inherits.
4. `pnpm test:cold-session` cold-session-discoverability drift-prevention test passes (canonical PROCESS_HINTS=9 entries and `.factory LOCAL_PROCESS_HINTS=9 entries` arrays match byte-for-byte). Sibling length-locked assertion in `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-consult-checklist-fallow-brief.test.js:74` is updated to assert length 9 in lockstep.
5. `loop-design-meta-state-batch-refresh-and-reground-drift` is shipped via this plan (the reuse-existing-primitive decision is the supersession rationale); no separate loop-design entry.
6. Finding `meta-260714T1704Z…` resolved via `meta_state_resolve`; PR body enumerates the cache-key fix + pretest-seed wiring + PROCESS_HINTS row delta per `rule-pr-body-registry-deltas`.
7. `pnpm check:freshness`, `pnpm test:cold-session`, `pnpm test:debug` still work — none of them call `pnpm test`, so the pretest seed does not affect them. Verification: `check:freshness` reads a calendar sentinel (not drift); `test:cold-session` is a single-file vitest run; `test:debug` targets `__tests__/debug/`.
8. No new MCP tool, no new CLI script, no manifest change.

## Constraints

- **Reuse, don't duplicate.** `seed-file-index.mjs` already exists at `tools/learning-loop-mastra/tools/handlers/scripts/seed-file-index.mjs` (78 LOC, committed); do not copy or rewrite it. The pretest step just runs it.
- **MCP stays agent L2.** No Bash-bypass of MCP decisions: pretest seed is wired into the test command (like `sanitize-coverage.mjs`), not as a manual operator reflex. Operator-grade audit (`meta_state_refresh_file_index` per-path with reason) is unchanged.
- **Runtime-agnostic.** The PROCESS_HINTS row is the only parity obligation (canonical in `core/loop-introspect.js`; mirror in `.factory/hooks/loop-surface-inject.cjs LOCAL_PROCESS_HINTS`). No new `.claude/` hooks, no `.mastracode/` config. Audit with `check_runtime_agnostic` MCP tool.
- **No AI/commit refs.** Conventional commits; no plan IDs in code, comments, commit messages, or test names. Cite invariants directly.
- **Idempotency.** `seed-file-index.mjs` is already idempotent (re-hashes every path, overwrites same keys, exits 0 only on completeness). Verify by reading `seed-file-index.mjs:L10-13` before wiring.

## Open Questions

None at plan-time. The two questions surfaced in the brainstorm are answered by the implementation:
- *Pretest-seed audit log?:* `seed-file-index.mjs` does not append a gate-log entry today. Decision (per brainstorm §"Risks / open items"): git history is sufficient audit for a mechanical baseline-sync. Revisit if operator requests commit-time reground audit.
- *Should `check:freshness` / `test:cold-session` / `test:debug` also pretest-seed?:* No — `check:freshness` is a calendar sentinel gate, `test:cold-session` is single-file (`cold-session-discoverability.test.cjs`), `test:debug` targets `__tests__/debug/`. None depend on `file-index.jsonl` freshness, and adding seed to them would mask real regressions in those views.

**Resolved during red-team (2026-07-14):** pretest seed now exposes a `SKIP_PRESEED=1` env-var escape hatch in `seed-file-index.mjs` (small scope addition) for any operator who wants the pre-commit drift signal back. Default behavior unchanged (seed runs in `pnpm test`).
