---
title: "Stale-Findings Triage + GitHub-Issue Dispatch (Dispatch-Handle Model)"
description: "Collapse the stale-ref finding category into a derived view (Rec 8), add a dispatch-handle MCP tool that routes fixable findings to GitHub Issues with a ledger_ref back-pointer, define the close flow, wire Rec 10 session-start surfacing, and add the L1 'deferred decision' concept statement. Registry stays single-writer; worktrees edit code only."
status: pending
priority: P2
branch: "main"
tags: [meta-state, stale-ref, dispatch, github-issues, derived-view, rec-8, rec-10, concept-surface]
blockedBy: []
blocks: []
created: "2026-07-03T20:03:27.136Z"
createdBy: "ck:plan"
source: skill
---

# Stale-Findings Triage + GitHub-Issue Dispatch (Dispatch-Handle Model)

## Overview

Stale findings accumulate faster than one operator session can triage: **28 stale today** (16 `stale-ref` recursion + 12 real underlying: 7 `loop-anti-pattern`, 3 `mcp-tool-missing`, 1 `schema-drift`, 1 `budget-check`) — plus **14 reported `stale-ref`** with a 24h TTL that age to stale if unhandled (**30 `stale-ref` total**). The cap test (`__tests__/legacy-mcp/cold-tier-regression.test.js:73-79`) counts `stale + (mechanism_check === true || null)` = **11 today**, threshold relaxed 3→25 (`:66-72` TODO) — the gate is **passing at 11/25**, NOT breached. The fixable subset needs to become parallelizable work units that survive the 7-day staleness window, are visible outside a loop-aware session, and can be picked up by multiple agents in isolated worktrees — where the **parallelism unit is the code fix, not the registry write** (registry is single-writer).

Two halves of one move:
1. **Clean the queue** — collapse the `stale-ref` recursion (all 30: 16 stale + 14 reported) so the triage queue is real underlying issues, not drift-about-drift.
2. **Parallelize the clean remainder** — dispatch fixable findings to GitHub Issues as coordination handles, so operator + agents can fix in parallel.

**Two-surfaces split (operator correction 2026-07-04):** the deterministic core (MCP tools) does no external side effects; the agentic runtime (the agent) runs `gh`. The dispatch tool does **not** spawn `gh` — it has two modes (`prepare` returns the issue body, `commit` writes the ledger + `ledger_ref`), and the agent runs `gh issue create` between them (see Phase 2).

**Concept restatement (L1, load-bearing):** *a finding is a deferred decision, not a thing to be removed.* Every finding has explicit exits; no mechanism silently closes one. This anchors the design and motivates the deferred lifecycle surgeries.

**Source:** `plans/reports/brainstorm-260704-stale-findings-github-dispatch-report.md` (design agreed) + addendum in `plans/reports/from-ck-predict-to-operator-260704-0105-direction-gaps-legacy-cleanup-two-surfaces-reframe-report.md`. Citations scout-verified 2026-07-04.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Rec 8 Collapse — stale-ref to derived view](./phase-01-rec-8-collapse-stale-ref-to-derived-view.md) | Pending |
| 2 | [Dispatch Tool — meta_state_dispatch_finding](./phase-02-dispatch-tool-meta-state-dispatch-finding.md) | Pending |
| 3 | [Close Flow + Rec 10 Session-Start Surfacing](./phase-03-close-flow-rec-10-session-start-surfacing.md) | Pending |
| 4 | [Docs — L1 Concept + Lifecycle](./phase-04-docs-l1-concept-lifecycle.md) | Pending |

## Dependencies

- **No cross-plan blockers.** `260614-1856-GH-1259-fix-stale-records-references` (different "stale" — observation paths, not findings) and `260626-1535-phase-e-stale-sweep-fix` (shipped 2026-06-26; predecessor context on the same `checkStaleness`/sweep machinery) neither block nor are blocked by this plan.
- **Phase 1 → Phase 2:** dispatch launches on a clean queue. Phase 1's first step is the sweep producer fix — without it, removing the enum breaks sweep at runtime (schema validation failure).
- **Phase 1 migration is single-worktree serial** (the `consolidates` field is a cross-entry dependency). Run the 30× `meta_state_supersede` migration in the main worktree before dispatch begins (non-atomic; `meta_state_batch` cannot set `consolidated_into` — see Phase 1).
- **Phase 4 → [1, 2, 3]:** Phase 4 is the closure phase — L1 docs (needs Phase 2's `dispatch` tool) + source-report closeout (marks Rec 10 `[DONE]`, needs Phase 3). Ships last.
- **Lifecycle-redesign plan (separate, later):** drop `auto-resolved`; drop `ack`/`active` (collapse to one `open` state); re-architect `OPERATOR_MODE` → delegated scoped authority; the general change-log trigger rule (addendum 2 Rec 12). Dispatch is built compatible (explicit `resolve`, no `ack`, `delegated_to` recorded in the ledger).

## Scope boundary

**In:** Rec 8 collapse + dispatch feature (export + link-back) + L1 concept statement + the scoped change-log trigger rule (dispatch-close case only) + Rec 10 (session-start stale surfacing) as a Phase 3 build item.

**Out (deferred to lifecycle-redesign plan):** drop `auto-resolved`; drop `ack`/`active`; re-architect `OPERATOR_MODE` → delegated scoped authority; the general change-log trigger rule (Rec 12).

**Out (separate plans):** promotion query (addendum Q1–Q3), legacy rename (Q4), L1 bridge correction (Q5 — already DONE).

## Parallelism model + merge reconciliation (cross-cutting, load-bearing)

The "parallel worktrees" goal is sound **only if the parallelism unit is the code fix, not the registry write.** Grounded in the write model:

- `meta-state.jsonl` and `file-index.jsonl` are **full-rewrite snapshot files** (`core/meta-state.js` writes go through the per-root `enqueue` queue at `:348`; no cross-worktree coordination). CAS `_expected_version` does **not** cross worktree boundaries.
- `runtime-state.jsonl` is the one **append-only** file (union-merges cleanly; disjoint ids via `dispatch-<finding_id>`).
- Two state kinds merge differently: **authority state** (findings/change-logs/ledger) merges by entry id *iff no two worktrees edit the same entry*; **derived state** (`file-index.jsonl` fingerprints) **does not merge** — the only correct fingerprint post-merge is the one computed from the merged tree.

**Git-hook constraint:** `package.json:40-42` sets `simple-git-hooks` `pre-commit: "pnpm test && pnpm fallow:gate"`. The test suite includes the grounding + cap invariants that read `meta-state.jsonl` + `file-index.jsonl`. A feature worktree that edits code must refresh `file-index.jsonl` (and patch `meta-state.jsonl` if drift findings appear) before `pnpm test` passes — the hook forces those writes at commit time. So a "code-only" worktree still writes the index/registry at commit.

**Rules:**
1. **Worktrees edit code; the registry is single-writer.** Feature worktrees touch `tools/**` / `core/**` / `product/**` source only. The hook-forced index/registry refresh in the worktree is local-validation-only and **must be `git restore`d before commit** (red-team M2): `git restore --staged meta-state.jsonl file-index.jsonl runtime-state.jsonl && git checkout -- meta-state.jsonl file-index.jsonl runtime-state.jsonl`. `meta-state.jsonl` + `file-index.jsonl` + `runtime-state.jsonl` are git-tracked; a worktree's hook-forced write committed and merged would be an authority-state write originating in a feature worktree — violating this rule. (No pre-commit guard rejects this today; the `git restore` is a documented manual step until a guard is added in a separate hardening plan.)
2. **Registry authority writes (`dispatch` commit, `resolve`, `meta_state_log_change`) happen in the main worktree**, single-writer, against the merged tree.
3. **`file-index.jsonl` is rebuilt post-merge, never merged.** After fix PRs merge, run `tools/learning-loop-mastra/tools/legacy/scripts/seed-file-index.mjs` (or `meta_state_refresh_file_index` per touched path) to recompute fingerprints from the merged tree.
4. **Phase 1 migration stays single-worktree serial** (cross-entry `consolidates` dependency; 30× `meta_state_supersede` is non-atomic).
5. **Disjoint finding ownership is the real cross-worktree guard**, not CAS. The dispatch tool's ledger-scan idempotency + `ledger_ref` enforce first-write-wins; assignment enforces disjointness.

**Post-merge reconciliation (mandatory):** as fix PRs merge into the main worktree → (a) `seed-file-index.mjs` / per-path `meta_state_refresh_file_index`; (b) re-run grounding (`meta_state_check_grounding` / `meta_state_derive_status`) and address merge-introduced drift; (c) `meta_state_log_change` + `meta_state_resolve` per finding.

## TTL interaction (v1 live)

The `ack`/`active`/`auto-resolved` surgeries are deferred, so the reported→stale TTL (`STALENESS_WINDOW_MS`, 7d; reported 24h TTL) is **live during this plan**. Dispatch must not break it. Phase 3 owns the four TTL test cases (see phase-03).

**Scout correction (2026-07-04):** `meta_state_sweep`'s handler (`tools/legacy/meta-state-sweep-tool.js:44-61`) only runs `checkExpiry` + `checkStaleness`; there is **no file-modification→`auto-resolved` branch** in the current handler (the L24-25 comment + L40 description reference it, but no production write path sets `auto-resolved` — grep confirmed). So the brainstorm's "sweep skips `ledger_ref`-set entries" guard is **moot in v1** — the path it would guard does not exist. Phase 3 drops that code change and keeps a **forward-looking TTL test** (a `ledger_ref`-set finding with a modified `evidence_code_ref` is NOT auto-resolved) so a future re-addition of the path without the `ledger_ref`-skip would fail. The sweep tool's stale `description` at `:40` is updated in Phase 1 (it references the absent auto-resolve path).

## Acceptance criteria

- **Rec 8:** `stale-ref` absent from all three category-enum sites (`core/meta-state.js:63`, `:77`, `docs/schemas.md:35`); sweep no longer emits stale-ref follow-ups (regression test green); **all 30 stale-ref entries (16 stale + 14 reported) migrated to `superseded`** under one change-log; `meta_state_list({status:"stale"})` total ≈ 12 (the 14 reported no longer age to stale); **cap-test count drops 11→10** (29/30 stale-refs are `mc=false` by design; only 1 `mc=true` counts); cap test passes at the re-tightened threshold **12** (10 + 2 headroom); the derived view (`meta_state_relationships`) surfaces the same information including the "superseded target" arm.
- **Dispatch:** the core tool does **not** spawn `gh` (two-surfaces: the agent runs `gh`). `prepare({id})` returns the issue body with `local:meta-state:<id>`; `commit({id, issue_number, issue_url, repo})` writes the `dispatch-<id>` ledger event + patches `ledger_ref`; `gh issue view <n> --json` confirms the issue exists in the **coord repo** and its body cites `local:meta-state:<id>`; re-dispatch (prepare or commit) is refused via a ledger scan and returns the existing coords; concurrent-race produces ONE ledger row + ONE `ledger_ref`.
- **Close:** a dispatched finding can be `resolve`d with a PR/issue ref + a change-log after a `meta_state_refresh_file_index` step; the change-log and the resolution note cross-reference.
- **Parallelism / merge reconciliation:** after two feature-worktree fix PRs merge, `seed-file-index.mjs` produces a `file-index.jsonl` whose fingerprints match the merged tree; grounding reconciliation resolves merge-introduced drift; no `meta-state.jsonl` authority write originated in a feature worktree (worktree's hook-forced index/registry refresh is `git restore`d before commit — red-team M2).
- **TTL:** the four test cases in phase-03 pass (including the forward-looking `ledger_ref`-set + modified-`evidence_code_ref` auto-resolve contract).
- **Concept:** `docs/loop-engine.md` carries the "deferred decision" statement and the explicit-exits set including `dispatch` and `supersede` (Phase 4 ships after Phases 1-3 — it's the closure phase: L1 docs + source-report closeout).
- **Report closeout:** `plans/reports/from-ck-predict-to-operator-260704-0105-direction-gaps-legacy-cleanup-two-surfaces-reframe-report.md` marks Rec 8, Rec 10, Rec 11 as `[DONE]` (resolved by this plan's Phases 1 and 3); Rec 12 noted half-solved (scoped dispatch-close case shipped, general trigger rule deferred); Rec 9 left open (no consult-gate built); addendum `**Status**` line updated to "shipped → see `plans/260704-0301-stale-findings-dispatch-handle/`".
- **Rec 10:** at SessionStart, the surface emits a bounded **top-5** of fixable stale dispatch candidates (non-empty `evidence_code_ref`, `severity !== "escalate"`, no `ledger_ref`, non-terminal) with the dispatch protocol prompt ("agent proposes; operator dispatches; private coordination repo"); a non-operator agent can surface + propose but cannot commit-dispatch (tool-gated).

## References

- Brainstorm: `plans/reports/brainstorm-260704-stale-findings-github-dispatch-report.md`
- Addendum (Recs 8/10/12, two-surfaces framing): `plans/reports/from-ck-predict-to-operator-260704-0105-direction-gaps-legacy-cleanup-two-surfaces-reframe-report.md`
- Predecessor (sweep machinery context, shipped): `plans/260626-1535-phase-e-stale-sweep-fix/plan.md`
- L1 doc: `docs/loop-engine.md` · Lifecycle doc: `docs/meta-state-lifecycle.md`
- Core: `tools/learning-loop-mastra/core/meta-state.js`, `core/loop-introspect.js`, `core/gate-logic.js`
- Sweep: `tools/learning-loop-mastra/tools/legacy/meta-state-sweep-tool.js`
- Cap test: `tools/learning-loop-mastra/__tests__/legacy-mcp/cold-tier-regression.test.js`
