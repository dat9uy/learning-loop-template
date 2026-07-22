---
title: "Lifecycle status + stale mechanism (enum collapse + derived view + re_verify/sweep rework + migration)"
description: "Plan 1 of the 4-plan lifecycle + Rec 12 split (tracker: plans/reports/from-problem-solving-to-plan-split-260707-0812-rec12-lifecycle-pr-tracker-report.md). Ships the merged P1+P2 of the 0958 redesign: collapse the finding status enum to open/resolved/superseded (+archived runtime-applied), rework stale as a derived evidence-freshness view, drop the ack ceremony, rework re_verify (stamp last_verified_at, no transition) + sweep (read-only reporting view, no status writes), migrate 10 finding active + 12 finding stale entries (22 finding flips, scoped by entry_kind:finding — NOT 190; non-finding actives have their own enums) to open on main, re-baseline the cap test, and re-source Rec 10 session-start surfacing from the derived view. isOpen predicate tolerates legacy statuses so the migration is non-breaking hygiene. Authority dissolution (OPERATOR_MODE -> LOOP_SESSION_MODE) is Plan 2; Rec 12 L1 trigger + symmetry is Plan 3; Rec 12 closed loop (b)+(c) is Plan 4."
status: completed
priority: P2
branch: "lifecycle-status-stale-mechanism"
tags: [lifecycle, status-enum, stale-derived-view, ack-deprecation, re-verify, sweep, migration, cap-test, rec-10-surfacing]
blockedBy: []
blocks: [lifecycle-authority-dissolution-session-mode, rec12-l1-trigger-statement-and-symmetry, rec12-closed-loop]
created: "2026-07-07T01:23:05.131Z"
createdBy: "ck:plan"
source: skill
---

# Plan 1: Lifecycle status + stale mechanism

**Date:** 2026-07-07
**Branch (to create):** `lifecycle-status-stale-mechanism` (off `main` @ `1202514`)
**Design source:** `plans/reports/brainstorm-260706-0958-record-lifecycle-authority-redesign-report.md` (3 surgeries + Rec 12 + Q11). This plan ships the merged P1+P2 of that redesign.
**Tracker:** `plans/reports/from-problem-solving-to-plan-split-260707-0812-rec12-lifecycle-pr-tracker-report.md` (4-plan split; this is Plan 1).
**Research basis:** 3 parallel verification passes against current `main` (schema/read sites, tool surfaces/migration mechanics, Rec 10 surfacing/test isolation). Drift from the 0958 report corrected inline below.

## Why

The finding lifecycle carries three concept debts (the 0958 report): `auto-resolved` is a dead write path that contradicts "no mechanism silently closes a finding"; `ack`/`active` fork the lifecycle on a ceremony that adds no information; `stale` is persisted as a status but is a *computed property of evidence* (age + hash drift) — the same anti-pattern the `stale-ref` collapse already corrected for relationship drift. Collapsing `stale` to a derived view also kills the P0 B1 path (a) by construction: `meta_state_sweep` loses status writes, so `meta-state-sweep-summary.test.js` can no longer mutate the live registry via sweep `apply:true`.

This plan is the entry point of the 4-plan split and un-blocks Plan 2 (authority), Plan 3 (Rec 12 L1 trigger + symmetry), Plan 4 (Rec 12 closed loop). It does **not** depend on the skill-layer prerequisite (already shipped on `main`).

## Decisions locked (from 0958 report + this planning session)

1. **Statuses:** `open` / `resolved` / `superseded` (+ `archived` applied at runtime, outside the enum). Drop `reported`, `active`, `stale`, `auto-resolved` as statuses.
2. **`stale` = derived evidence-freshness view** over `open` findings (age > 7d from `last_verified_at`/`created_at` OR hash drift via `file-index.jsonl`), surfaced by existing drift tools + an age filter. Not a status, not persisted.
3. **`isOpen(finding)` predicate** = status not in `{resolved, superseded, archived}`. Tolerates legacy `active`/`reported`/`stale` as open-equivalent during transition → the data migration is a non-breaking hygiene flip, not a race with the code merge. Read sites use `isOpen`, not literal `status === "open"`.
4. **`ack` dropped** — no `meta_state_ack` tool, no `acked_at` field. Operator-exit (resolve/promote/supersede/dispatch/re-verify) is the engagement signal.
5. **`re_verify`** = re-run `verification.steps` + stamp `last_verified_at` on pass (finding stays `open`; no status transition). Trigger = the derived stale view. `META_STATE_VERIFY_EXEC` gate stays.
6. **`sweep`** = read-only reporting view (no status writes). `apply:true` mode removed; the `reported→stale`/`active→stale` transitions and the unreachable `auto-resolve` branch are deleted.
7. **Migration:** **10 finding `active→open` + 12 finding `stale→open` = 22 finding flips** (NOT 190 — the 0958 report's "177/178 active findings" was a registry-wide count misattributed to findings; only 10 `active` entries are findings; the other 168 are 153 change-logs + 9 rules + 6 loop-designs, each with its OWN status enum — `change-log` is `z.literal("active")` immutable audit log, rules/loop-designs are `active/inactive` — and must NOT be flipped). Scoped by `entry_kind:"finding"` via `meta_state_batch` `op:"update"` (limit 500 ≥ 22, atomic, per-op CAS) **on main**, as a separate migration commit (NOT from a feature worktree). `auto-resolved` is a 0-entry no-op (verified). **Red-team critical fix C1.**
8. **Cap test** re-baselined to the derived view (`open + age/drift + mechanism_check`) at a threshold computed over the live registry *before* dropping `stale`.
9. **Rec 10 surfacing** (`buildStaleDispatchHints`) re-sourced from `isStaleView`/`isOpen` instead of `status:"stale"`/`status:"reported"||"active"`. The `session-start-inject-discoverability.cjs` script needs no change (the filter lives in the builder).

## Scope boundary (explicit)

- **In scope:** finding status enum collapse (3 schema sites); ~12 read-site rewrites to `isOpen`/`isStaleView` **plus the write sites + tool-internal read sites the red-team surfaced (C2/C3/H1/H2/H3)** — `meta_state_report` + `recurrence-tracker` write `status:"open"`; `meta_state_resolve` cascade guard + reported-block; `meta_state_query_drift` input enum; `meta_state_archive` decision rule; `meta_state_relationship_validate` ORPHAN_STATUSES + `meta_state_relationships` stale/auto-resolved branches; **all 7 terminal/excludable Sets** (H4); `cold-tier-regression.test.js:226`; `ack` deprecation + `expires_at`/`acked_at` write removal; `re_verify` + `sweep` rework (no status writes); **22-finding data migration on main** (not 190); cap-test re-baseline; Rec 10 surfacing; sweep-test migration (6 definite + 3 review); sweep-summary `mkdtempSync` isolation removal.
- **Out of scope (Plan 2 — authority dissolution):** the `OPERATOR_MODE` → `LOOP_SESSION_MODE` rename at the 3 remaining gates (`supersede`/`dispatch-commit`/`promote-rule`) + 7 comment/string sites + the 7 non-sweep OPERATOR_MODE test files. **This plan removes ONLY sweep's apply gate** (`sweep-tool:41`) because sweep loses apply mode — the gate's reason for existing goes away. It does NOT rename `OPERATOR_MODE` anywhere; tests that set `OPERATOR_MODE="1"` solely to exercise sweep `apply:true` drop that line. Tests that set `OPERATOR_MODE="1"` for supersede/dispatch/promote keep it until Plan 2.
- **Out of scope (Plan 3):** the Rec 12 L1 trigger statement + Q11 symmetry in `loop-engine.md` `record` role.
- **Out of scope (Plan 4):** change-log gap detection (b) + session-start gap injection (c).

## Phases (smallest-first, lowest-risk — TDD per phase)

| Phase | Name | Risk | Depends on | Status |
|---|---|---|---|---|
| 1 | [Derived-stale predicate + cap-baseline precompute](./phase-01-derived-stale-predicate-cap-baseline-precompute.md) | Low (additive; stale still a status) | — | Pending |
| 2 | [Enum collapse + read-site rewrites + ack deprecation](./phase-02-enum-collapse-read-site-rewrites-ack-deprecation.md) | High (enum + ~12 read sites + ack; must land as a unit) | 1 | Pending |
| 3 | [re_verify + sweep rework (no status writes)](./phase-03-re-verify-sweep-rework-no-status-writes.md) | Medium (tool contract change + 6-9 test migrations) | 2 | Pending |
| 4 | [Data migration + cap finalize + Rec 10 surfacing + cleanup](./phase-04-data-migration-cap-finalize-rec-10-surfacing-cleanup.md) | Medium (22-finding main commit + Rec 10 re-source) | 3 | Pending |

Phase 1 de-risks the plan: the derived predicate + cap precompute ship while `stale` is still a status, so there is a safety net before any enum change. Phase 2 is the atomic unit (enum + read sites + ack together — `isOpen` tolerates legacy entries so the registry need not migrate in lockstep). Phase 3 reworks the two tools that write status. Phase 4 is the data migration on main + finalization.

## Dependencies

**Cross-plan:**
- `blocks: [lifecycle-authority-dissolution-session-mode, rec12-l1-trigger-statement-and-symmetry, rec12-closed-loop]` — Plan 2 uses the new `open` status model; Plan 3's Q11 symmetry comments on Plan 2's authority result; Plan 4's gap detection sits on the post-migration registry. (These plan dirs are not yet cut; the slugs are placeholders from the tracker.)
- No `blockedBy` — entry point. The skill-layer prerequisite (`260707-0114`) is shipped and compatible.

**Worktree/main split (load-bearing):** per `plans/260704-0301-stale-findings-dispatch-handle/plan.md:169`, the registry is single-writer; feature worktrees edit code only. The hook-forced index/registry refresh in a worktree must not be committed — historically a documented manual `git restore` step with **no automated guard** (verified: zero grep hits in `tools/learning-loop-mastra/hooks/`). **This plan adds a verifiable gate (red-team M2):** `git rm --cached meta-state.jsonl file-index.jsonl runtime-state.jsonl` on the worktree branch so the registry files can't be committed from the worktree at all (structural single-writer guard). Phases 1-3 + phase 4's code parts land in a feature worktree (registry files uncommittable); phase 4's 22-finding migration runs on main via `meta_state_batch` as a separate commit. `isOpen` makes the order non-breaking: legacy `active`/`stale` finding entries are tolerated as open until the migration flips them.

## Acceptance criteria

- **Enum:** finding status = `{open, resolved, superseded}` at all **3** schema-declaration sites (`core/meta-state.js:91`, `schemas/meta-state.schema.json`, `tools/learning-loop-mastra/docs/schemas.md:39`); `archived` runtime-applied (not in enum); no `reported`/`active`/`stale`/`auto-resolved` in any site. (`docs/schemas.md` at project root does NOT exist — 0958 report's 4-site claim corrected to 3.)
- **Read + write sites:** no `status === "active" || "reported"` branch remains in `core/` or the tool files; all 8 active|reported sites + `file-readers.js:46` use `isOpen`; stale-specific branches (`loop-introspect.js:199`, `derive-status.js:123`, `meta-state.js:773-774`) use `isStaleView`; **all 7 terminal/excludable Sets** updated to `{resolved, superseded}` (+archived runtime): `loop-introspect.js:165,316`, `derive-status.js:25`, `meta-state.js:27`, `sweep-tool.js:12`, `resolve-tool.js:14`, `list-tool.js:14`; `core/entry/finding.js:11-12` `isActive`/`isStale` reworked. **Write sites (C2):** `meta_state_report` + `recurrence-tracker` write `status:"open"` (not `reported`); recurrence routes through `writeEntry` (not raw `appendFileSync`). **Tool-internal read sites (C3/H1/H2/H3):** `meta_state_resolve:136,212` isOpen-based + reported-block dropped; `meta_state_query_drift` input enum accepts `open`; `meta_state_archive:37,39` decision rule isOpen + age (no `acked_at`); `meta_state_relationship_validate` ORPHAN_STATUSES + `meta_state_relationships:98,102` use `isStaleView`/drop dead `auto-resolved` branch. **Test:** `cold-tier-regression.test.js:226` asserts `isOpen(af)`.
- **ack:** `meta_state_ack` tool absent from manifest + `meta-state-ack-tool.js` removed; `acked_at` field removed from schema.
- **re_verify:** no `status === "stale"` hard-requirement; on verification pass stamps `last_verified_at` (no status transition); finding stays `open`.
- **sweep:** no status writes; `apply:true` mode removed; returns the derived stale set as a report; `sweep-tool:41` OPERATOR_MODE apply gate removed.
- **Migration:** 10 finding `active→open` + 12 finding `stale→open` = **22 finding flips** committed on main as a separate migration commit (scoped by `entry_kind:"finding"`); registry entry count preserved (229 → 229, 22 finding flips); `meta_state_list({entry_kind:"finding", status:"stale"})` and `({entry_kind:"finding", status:"active"})` return nothing; the 153 change-log + 9 rule + 6 loop-design `active` entries are **unchanged** (separate enums); `auto-resolved` 0-entry no-op.
- **Cap test:** passes at the post-migration threshold recomputed from the derived view (phase 1 precompute; phase 4 finalize).
- **Rec 10 surfacing:** `buildStaleDispatchHints` sourced from `isStaleView`/`isOpen`; session-start output unchanged in content (same top-5 + orphans).
- **Test isolation:** `meta-state-sweep-summary.test.js` `mkdtempSync` removed (sweep read-only); `fix-loop-design-refs.test.js` `mkdtempSync` stays permanently (sweep-independent, writes change-logs via `writeEntry`).
- All `pnpm test` touched suites green.

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Enum + read/write sites + ack must land as one unit; a missed literal-equality site breaks a production path post-migration | High | Phase 2 enumerates EVERY site from the research + red-team (8 active|reported + file-readers:46 + 3 stale branches + 7 terminal Sets + entry helpers + 2 write sites + resolve/query-drift/archive/relationship tool sites + cold-tier:226). **No graceful degradation:** `isOpen` tolerates legacy entries PRE-migration, but a post-migration `"open"` entry breaks any missed `=== "active"`/`"reported"` site (e.g. the resolve cascade guard). Tests-first per site; the cost of a missed site is a broken production path, not graceful degradation. **Red-team M3.** |
| 22-finding migration commit conflicts with single-writer/worktree rule; `git restore` is a manual step with no automated guard | High | Code in worktree; migration on main via `meta_state_batch` (22 finding flips scoped by `entry_kind:"finding"`). **Verifiable gate (red-team M2):** `git rm --cached meta-state.jsonl file-index.jsonl runtime-state.jsonl` on the worktree branch so the registry files can't be committed from the worktree at all (preferred), OR a pre-commit/`fallow:gate` check that diffs the registry files against `main` and fails on mutations. `isOpen` makes the code/migration order non-breaking. |
| Cap-test threshold (12 today, on `status:"stale"`) diverges from derived-view population (the 22 open-eligible findings — 10 active + 12 stale — with unknown age distribution) | Medium | Phase 1 computes the derived count over the live registry *before* dropping `stale`; threshold = derived count + headroom. Phase 4 finalizes against the migrated registry. |
| `re_verify` test T9 (`stale→active`) and sweep tests assert the old status-write contract | Medium | Phase 3 migrates the 6 definite + 3 review tests to the new contract (re_verify stamps `last_verified_at`; sweep read-only). OPERATOR_MODE lines kept where they gate supersede/dispatch/promote (Plan 2's rename). |
| Removing `ack` loses the "human confirmed" signal | Low | Derivable: "an operator exit was taken" implies confirmation. YAGNI to add metadata now. |
| `sweep` deprecation breaks callers expecting `apply:true` | Low | `apply:true` is operator-only today (rare). Phase 3 returns a clear read-only report; the dispatch/close flow uses `resolve`/`dispatch`, not sweep. |
| Scope creep into Plan 2's OPERATOR_MODE rename | Medium | Scope boundary above: this plan removes only sweep's apply gate; no `OPERATOR_MODE`→`LOOP_SESSION_MODE` rename. |

## Validation

`--deep --tdd` mode: research ran (3 verification passes); red-team ran (report: `plans/reports/from-red-team-260707-0829-lifecycle-status-stale-mechanism-plan-review-report.md` — 3 Critical / 5 High / 3 Medium / 4 Low; all 11 accepted findings applied; dimension 3 clean). Validation interview + whole-plan consistency sweep complete (zero unresolved contradictions).

### Validation interview — 2026-07-07 (3 decisions, all = recommended)

- **`sweep` fate → read-only reporting view.** Keep `meta_state_sweep` as a read-only tool returning the derived stale report (dry-run only). Familiar entry point; no status writes. (Phase 3 as written.)
- **Single-writer/worktree guard → `git rm --cached` gate.** On the worktree branch, `git rm --cached meta-state.jsonl file-index.jsonl runtime-state.jsonl` so the registry files are structurally uncommittable from the worktree (red-team M2). (Phase 4 + plan.md dependencies as written.)
- **Phase 2 atomicity → one atomic phase.** Keep phase 2 as one unit (enum + 7 terminal Sets + ack + all read/write site rewrites). `isOpen` tolerates legacy entries so the unit is non-breaking. (Phase 2 as written.)

All three match the plan as written — no edits required.

## Unresolved questions

1. **Derived-stale view surface** — pre-decided: output mode of `meta_state_query_drift` + age filter (no new MCP tool — UQ2 of 0958). Confirm in phase 1. (Alternative: a dedicated `meta_state_list_stale` — rejected as YAGNI.)
2. **`auto-resolved`→`resolved` vs `superseded`** — 0-entry today (verified: 0 `auto-resolved` in registry); default `resolved` with a migration note if any surfaces. Moot unless one appears during phase 4.
3. **STALENESS_WINDOW_MS** — sweep's `checkStaleness` uses `META_STATE_STALENESS_WINDOW_MS` env (default 7d). The derived view's age window should reuse the same constant/source so they can't diverge. Phase 1 decision: extract a shared `STALENESS_WINDOW_MS` constant.
4. **Does `meta_state_list({status:"open"})` need to return the legacy `active`/`stale` entries pre-migration?** Yes — `meta_state_list`'s status filter should treat `active`/`reported`/`stale` as `open` (via `isOpen`) so consumers see a consistent open set before the migration flips the persisted values. Phase 2 decision.