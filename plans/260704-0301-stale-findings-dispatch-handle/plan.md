---
title: "Stale-Findings Triage + GitHub-Issue Dispatch (Dispatch-Handle Model)"
description: "Collapse the stale-ref finding category into a derived view (Rec 8), add a dispatch-handle MCP tool that routes fixable findings to GitHub Issues with a ledger_ref back-pointer, define the close flow, wire Rec 10 session-start surfacing, and add the L1 'deferred decision' concept statement. Registry stays single-writer; worktrees edit code only."
status: done
priority: P2
branch: "main"
tags: [meta-state, stale-ref, dispatch, github-issues, derived-view, rec-8, rec-10, concept-surface]
blockedBy: []
blocks: []
created: "2026-07-03T20:03:27.136Z"
createdBy: "ck:plan"
source: skill
---

## Validation Log

### Session 1 — 2026-07-04
**Trigger:** `/ck:plan validate` after red-team edits applied. User flagged that `LOOP_DISPATCH_REPO` env var contradicts the two-surfaces split ("the only repo is this repo?"). Scout follow-up found 11 inconsistencies (1 HIGH, 3 MEDIUM, 7 LOW).
**Questions asked:** 4 (plus 1 follow-up clarification on Q3).

#### Questions & Answers

1. **[Architecture — manifest scope]** Phase 2 creates `meta_state_dispatch_finding` and updates `tools/manifest.json`, but `agent-manifest.json:19` lists agent-available tools and is NOT mentioned in the plan.
   - Options: Add to Phase 2 (Recommended) | Skip — defer to lifecycle-redesign | Document gap, leave to operator
   - **Answer:** Add to Phase 2 (Recommended)
   - **Rationale:** Without updating `agent-manifest.json`, the agent does not discover `meta_state_dispatch_finding` via the manifest surface. 1-line edit, low risk.

2. **[Risk — migration lock]** Phase 1's migration uses 30× serial `meta_state_supersede` calls. Should the plan add a single-flight guard?
   - Options: Keep current CAS-only (Recommended) | Add advisory lock file | Add hard lock + abort-on-conflict
   - **Answer:** Keep current CAS-only (Recommended)
   - **Rationale:** Registry is single-writer per the parallelism model; concurrent operator writes are an unsupported pattern. CAS via `_expected_version` is sufficient; advisory locks add complexity without addressing a real risk.

3. **[Architecture — coord_repo simplification]** Phase 2's `LOOP_DISPATCH_REPO` env var. User pushed back: "why the env var in there? Isn't we agree that the core MCP don't call github? And the only repo is this repo?"
   - **Answer (custom):** Drop the env var entirely; simplify Phase 2 to remove `LOOP_DISPATCH_REPO`, `LOOP_DISPATCH_ALLOWED_REPOS`, `LOOP_DISPATCH_REQUIRE_PRIVATE`, `LOOP_DISPATCH_FORCE_PUBLIC`, and `default_coord_repo` field. The agent runs `gh issue create` without `--repo` (defaults to current git remote = THIS repo). Disclosure mitigation is procedural (per Rec 10 surfacing prompt), not tool-level — confirming INC-1 from the consistency scout.
   - **Rationale:** P2 F8 was added in red-team as a mitigation, but the brainstorm's Addendum 3 (`brainstorm-260704-...md:63,190`) explicitly rejected tool-level gates: "the disclosure mitigation is procedural (private coord repo + operator-edited description), not tool-level." Plan was internally inconsistent.

4. **[Architecture — L1/L2 split]** Phase 4's split between L1 role statement (no mechanisms) and L2 mechanism mapping.
   - Options: Honor the strict split (Recommended) | L1 stays inline + L2 mechanism table | Revert F11
   - **Answer:** Honor the strict split (Recommended)
   - **Rationale:** Update existing L1 inline references (e.g., `meta_state_log_change` → `change-log` role name) to maintain consistency. Adds minor cleanup to Phase 4 step 2.

#### Confirmed Decisions
- **agent-manifest.json update in Phase 2 (Q1)** — added as Phase 2 step.
- **No single-flight guard (Q2)** — CAS-only migration per plan.
- **Drop `LOOP_DISPATCH_REPO` + related env vars (Q3 + INC-1)** — Phase 2 simplified; procedural disclosure only.
- **Honor L1/L2 strict split (Q4 + F11)** — Phase 4 step 2 also updates existing inline tool references to role names.

#### Action Items
- [ ] Phase 1: add `tools/learning-loop-mastra/__tests__/legacy-mcp/fix-loop-design-refs.test.js` to step 0 scope (INC-4: also mutates live registry)
- [ ] Phase 1: add `meta-state-sweep-tool.js:24-25` comment update to step 2 (INC-5: dead-code reference)
- [ ] Phase 2: add `agent-manifest.json` update (Q1)
- [ ] Phase 2: drop `LOOP_DISPATCH_REPO` / allowlist / content-gate / bypass (Q3 + INC-1)
- [ ] Phase 2: resolve INC-2 schema drift (moot after INC-1 fix — `repo` becomes commit-only as originally stated)
- [ ] Phase 2: document orphan self-heal trigger explicitly (INC-10)
- [ ] Phase 4: fix step-numbering references (INC-3 + INC-9) — use actual step numbers 1-10
- [ ] Phase 4: use full path `tools/learning-loop-mastra/docs/schemas.md:35` consistently (INC-6)
- [ ] Phase 4: clarify Status line reference (INC-7) — specify "main-body Status line (L100)" or "Addendum 2's Status line (L186)"
- [ ] Phase 4: rephrase cap-test headroom wording (INC-8)

#### Impact on Phases
- **Phase 1:** +1 test isolation (fix-loop-design-refs), +1 dead-code comment update, path consistency
- **Phase 2:** +1 manifest update, -4 env vars (P2 F8 reversal), schema drift auto-resolved, +1 orphan-self-heal note
- **Phase 3:** no change
- **Phase 4:** step numbering fixes, path consistency, status line clarification, wording fixes

### Verification Results
- **Tier:** Standard (4 phases, Fact Checker + Contract Verifier, 10 claims/phase)
- **Claims checked:** 7 (focused on load-bearing claims)
- **Verified:** 7 | **Failed:** 0 | **Unverified:** 0
- **Tier-specific notes:**
  - B1 (live-registry test): VERIFIED — `meta-state-sweep-summary.test.js:9,18` confirmed
  - F1 (4th schema site): VERIFIED — `schemas/meta-state.schema.json:21` confirmed
  - F3 (additional test pins at L257, L317): VERIFIED
  - F6 (preflight vs OPERATOR_MODE): VERIFIED — `runtime-state-record-tool.js:23-29, 50-57` confirmed
  - F9 (24h TTL window): VERIFIED — all 14 reported entries expire within 24h
  - Phase 4 lifecycle.md grep clean: VERIFIED
  - Phase 4 loop-engine.md L5 implementation-agnostic: VERIFIED
- **Contract Verifier gap:** `agent-manifest.json:19` not in plan — surfaced as Q1 (now resolved).

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01-..., phase-02-..., phase-03-..., phase-04-...
- Decision deltas checked: 11 inconsistencies (1 HIGH + 3 MEDIUM + 7 LOW)
- Reconciled stale references: 11 (ALL inconsistencies resolved in this session)
- **Unresolved contradictions:** 0

#### Inconsistencies surfaced by scout (Session 1) — RESOLVED
- **INC-1 (HIGH):** `LOOP_DISPATCH_REPO` env var contradicts two-surfaces split; brainstorm Addendum 3 already rejected tool-level gates → **RESOLVED** by Q3 answer (drop env vars + allowlist + content-gate + bypass). Phase 2 simplified to procedural disclosure only.
- **INC-2 (MEDIUM):** Schema says `repo` is "commit-only" but content-gate test fires on prepare → **RESOLVED** by INC-1 fix (no prepare-side gate; schema is now consistent).
- **INC-3 (MEDIUM):** Phase 4 step-numbering drift — references to non-existent steps 11/12; labels for steps 7 (cross-check) and 9 (closeout) swapped → **RESOLVED** (step references corrected to actual 1-10 numbering).
- **INC-4 (MEDIUM):** `fix-loop-design-refs.test.js` also mutates live registry → **RESOLVED** (added to Phase 1 step 0 scope; both tests now use tempDir).
- **INC-5 (LOW):** Dead-code comment at `meta-state-sweep-tool.js:24-25` not updated alongside L40 description → **RESOLVED** (step 2 now updates both).
- **INC-6 (LOW):** `docs/schemas.md:35` vs `tools/learning-loop-mastra/docs/schemas.md:35` path drift → **RESOLVED** (consistent full-path usage in Phase 4 success criteria + step 4-5).
- **INC-7 (LOW):** "the addendum's Status line" ambiguous (L100 main-body vs L186 Addendum 2) → **RESOLVED** (specified "main-body Status line at L100" explicitly in step 9).
- **INC-8 (LOW):** "threshold of 10 has zero headroom" wording drift → **RESOLVED** (rephrased to "post-migration count of 10 has zero headroom against the original threshold of 3").
- **INC-9 (LOW):** Step 7/9 label swap (subset of INC-3) → **RESOLVED** (cross-check confirmed at step 7; closeout at step 9).
- **INC-10 (LOW):** Orphan self-heal requires re-invocation; no proactive scan → **RESOLVED** (Phase 3 `buildStaleDispatchHints` builder outputs both `fixable_candidates` AND `orphan_findings`; surfacing prompt explains operator action).

#### NONE-FOUND checks (consistency confirmed)
- Lifecycle status set treated consistently as live-but-deprecated.
- Citation asymmetry (`local:meta-state:<id>` vs issue URL) consistently framed.
- Frontmatter dependencies consistent (Phase 1: [], Phase 2: [1], Phase 3: [1,2], Phase 4: [1,2,3]).
- Rec 8/9/10/11/12 + Q11 numbering consistent with source report.
- Single-writer model consistently stated.
- `dispatch` exit placement consistent (non-terminal routing action; L1 role, L2 mechanism).

#### Validation Outcome
**Recommendation: PROCEED to `/ck:cook` or implementation.** Zero unresolved contradictions. All 11 inconsistencies resolved. The plan now has internal consistency between its stated principle (two-surfaces split, registry single-writer, L1 role-only) and its proposed changes (no tool-level gates, B1 + INC-4 test isolation fixes, L1/L2 mechanism split).


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
| 1 | [Rec 8 Collapse — stale-ref to derived view](./phase-01-rec-8-collapse-stale-ref-to-derived-view.md) | Done |
| 2 | [Dispatch Tool — meta_state_dispatch_finding](./phase-02-dispatch-tool-meta-state-dispatch-finding.md) | Done |
| 3 | [Close Flow + Rec 10 Session-Start Surfacing](./phase-03-close-flow-rec-10-session-start-surfacing.md) | Done |
| 4 | [Docs — L1 Concept + Lifecycle](./phase-04-docs-l1-concept-lifecycle.md) | Done |

## Dependencies

- **No cross-plan blockers.** `260614-1856-GH-1259-fix-stale-records-references` (different "stale" — observation paths, not findings) and `260626-1535-phase-e-stale-sweep-fix` (shipped 2026-06-26; predecessor context on the same `checkStaleness`/sweep machinery) neither block nor are blocked by this plan.
- **P0 B1 precondition (precedes Phase 1):** `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-sweep-summary.test.js` must switch from live `GATE_ROOT` to `mkdtempSync` isolation BEFORE Phase 1 step 1. Without this, every `pnpm test` run (the pre-commit hook) mutates the live `meta-state.jsonl` — this is the user-reported "pre-commit auto-updates reported to stale" confusion mechanism. This is Phase 1 step 0.
- **Phase 1 → Phase 2:** dispatch launches on a clean queue. Phase 1's step 2 is the sweep producer fix — without it, removing the enum breaks sweep at runtime (schema validation failure).
- **Phase 1 migration is single-worktree serial** (the `consolidates` field is a cross-entry dependency). Run the 30× `meta_state_supersede` migration in the main worktree before dispatch begins (non-atomic; `meta_state_batch` cannot set `consolidated_into` — see Phase 1).
- **Phase 4 → [1, 2, 3]:** Phase 4 is the closure phase — L1 docs (needs Phase 2's `dispatch` tool) + source-report closeout (marks Rec 10 `[DONE]`, needs Phase 3). Ships last. Internal execution order (P2 F5): doc edits (steps 1-4, 8, 11) → cross-check (step 9, needs Phase 2) → closeout (steps 5-7, 10, 12, needs Phases 1, 2, 3).
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

**P0 B1 (precommit auto-update of reported→stale, the user's reported confusion):** **TWO tests** mutate the live registry on every `pnpm test` run (the pre-commit hook):
- `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-sweep-summary.test.js:9,18` calls `metaStateSweepTool.handler({apply:true})` against the LIVE registry (no `GATE_ROOT` override; sets `OPERATOR_MODE="1"` to bypass the operator gate). Auto-transitions past-TTL `reported` entries → `stale` on the live `meta-state.jsonl`. This is the user-reported "pre-commit auto-updates reported to stale which confused the agent" symptom.
- `tools/learning-loop-mastra/__tests__/legacy-mcp/fix-loop-design-refs.test.js:8,23,51` (INC-4) — runs `tools/scripts/fix-loop-design-refs.mjs` against `resolveRoot()` with no `GATE_ROOT` override; mutates the live registry via `updateEntry` (change-log entries persist across pre-commits).

Phase 1 step 0 switches BOTH tests to `mkdtempSync` isolation (template: `meta-state-sweep.test.js:11-46`), eliminating live-registry mutation from pre-commit.

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

- **P0 B1 (precondition):** `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-sweep-summary.test.js` switched from live `GATE_ROOT` to `mkdtempSync` isolation. Verified by reading `meta-state.jsonl` before/after a `pnpm test` run (entry count + `updated_at` unchanged). **This is the root cause of the user-reported "pre-commit auto-updates reported to stale" confusion; without this fix, the plan does not actually solve the user's complaint.**
- **Rec 8:** `stale-ref` absent from **all four** category-enum sites (`core/meta-state.js:63`, `:77`, `docs/schemas.md:35`, `schemas/meta-state.schema.json:21`); sweep no longer emits stale-ref follow-ups (regression test green); **all 30 stale-ref entries (16 stale + 14 reported) migrated to `superseded`** under one change-log; `meta_state_list({status:"stale"})` total ≈ 12 (the 14 reported no longer age to stale); **cap-test count drops 11→10** (29/30 stale-refs are `mc=false` by design; only 1 `mc=true` counts); cap test passes at the re-tightened threshold **12** (10 + 2 headroom); the derived view (`meta_state_relationships`) surfaces the same information including the "superseded target" arm. **Three test pins retargeted** (P1 F3): `meta-state-sweep-stale-transition.test.js:168` AND F3 case (L225-269) AND F4 case (L271-321).
- **Dispatch:** the core tool does **not** spawn `gh` (two-surfaces: the agent runs `gh`). `prepare({id})` returns the issue body with `local:meta-state:<id>` AND advisory `coord_repo_hint` text (no env-var default — INC-1 reversal: P2 F8's `LOOP_DISPATCH_REPO` / `LOOP_DISPATCH_ALLOWED_REPOS` / `LOOP_DISPATCH_REQUIRE_PRIVATE` / `LOOP_DISPATCH_FORCE_PUBLIC` dropped; coord-repo policy is procedural per brainstorm Addendum 3); `commit({id, issue_number, issue_url, repo})` writes the `dispatch-<id>` ledger event + patches `ledger_ref`; `gh issue view <n> --json` confirms the issue exists in the **coord repo** (default: current git remote via `gh`'s implicit default; explicit `--repo` from operator) and its body cites `local:meta-state:<id>`; re-dispatch (prepare or commit) is refused via a ledger scan and returns the existing coords; **concurrent-dispatch test (renamed, P2 F7)** uses `Promise.all` to assert ONE ledger row + ONE `ledger_ref` under true concurrency; **orthogonal-gate tests (P2 F6)** assert preflight-vs-OPERATOR_MODE gate split; `agent-manifest.json:19` includes `mastra_meta_state_dispatch_finding` (Q1 fix) for agent discovery.
- **Close:** a dispatched finding can be `resolve`d with a PR/issue ref + a change-log after a `meta_state_refresh_file_index` step; the change-log and the resolution note cross-reference.
- **Parallelism / merge reconciliation:** after two feature-worktree fix PRs merge, `seed-file-index.mjs` produces a `file-index.jsonl` whose fingerprints match the merged tree; grounding reconciliation resolves merge-introduced drift; no `meta-state.jsonl` authority write originated in a feature worktree (worktree's hook-forced index/registry refresh is `git restore`d before commit — red-team M2).
- **TTL:** the four test cases in phase-03 pass (including the **regression-pin** `ledger_ref`-set + modified-`evidence_code_ref` contract — P3 F12 renamed from "forward-looking").
- **Concept:** `docs/loop-engine.md` carries the "deferred decision" statement and the explicit-exits set including `dispatch` and `supersede` — **role names only, no mechanism/tool names** (P3 F11); mechanism mapping goes in `docs/meta-state-lifecycle.md` (L2). Phase 4 ships after Phases 1-3 — it's the closure phase: L1 docs + source-report closeout.
- **Report closeout:** `plans/reports/from-ck-predict-to-operator-260704-0105-direction-gaps-legacy-cleanup-two-surfaces-reframe-report.md` marks Rec 8, Rec 10, Rec 11 as `[DONE]` (resolved by this plan's Phases 1 and 3); Rec 12 noted half-solved (scoped dispatch-close case shipped, general trigger rule deferred); Rec 9 left open (no consult-gate built); **Q11** (operator/agent symmetry in addendum 2) noted as a separate open question, not addressed by this plan; addendum `**Status**` line updated to "shipped → see `plans/260704-0301-stale-findings-dispatch-handle/`".
- **Rec 10:** at SessionStart, the surface emits a bounded **top-5** of fixable stale dispatch candidates (non-empty `evidence_code_ref`, `severity !== "escalate"`, no `ledger_ref`, non-terminal, ranked **oldest-first**) AND a list of orphan findings (INC-10: reported/active findings with a `dispatch-<id>` ledger row but no `ledger_ref` back-pointer) — total surface output is bounded but the two lists are distinguished. The dispatch protocol prompt instructs ("agent proposes; operator dispatches; private coordination repo; agent picks `--repo` explicitly or relies on `gh`'s default to current git remote"); a non-operator agent can surface + propose but cannot commit-dispatch (tool-gated, P2 F6). (Phase 3 originally shipped without the orphan list and with newest-first ranking; both corrected — `buildStaleDispatchHints(entries, dispatchIds)` + hook reads `runtime-state.jsonl`.)

## References

- Brainstorm: `plans/reports/brainstorm-260704-stale-findings-github-dispatch-report.md`
- Addendum (Recs 8/10/12, two-surfaces framing): `plans/reports/from-ck-predict-to-operator-260704-0105-direction-gaps-legacy-cleanup-two-surfaces-reframe-report.md`
- **Red-team review (resolves user-reported pre-commit concern):** `plans/reports/red-team-260704-stale-findings-dispatch-handle.md` — P0 B1 finding is the root cause fix.
- Predecessor (sweep machinery context, shipped): `plans/260626-1535-phase-e-stale-sweep-fix/plan.md`
- L1 doc: `docs/loop-engine.md` · Lifecycle doc: `docs/meta-state-lifecycle.md`
- Core: `tools/learning-loop-mastra/core/meta-state.js`, `core/loop-introspect.js`, `core/gate-logic.js`
- Sweep: `tools/learning-loop-mastra/tools/legacy/meta-state-sweep-tool.js`
- Sweep test that mutates live registry (must be fixed in Phase 1 step 0): `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-sweep-summary.test.js:9,18`
- Cap test: `tools/learning-loop-mastra/__tests__/legacy-mcp/cold-tier-regression.test.js`
- JSON Schema (4th site, P0 F1): `schemas/meta-state.schema.json:21`
