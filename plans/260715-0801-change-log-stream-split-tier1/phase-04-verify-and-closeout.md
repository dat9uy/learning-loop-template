---
phase: 4
title: "Verify and closeout"
status: completed
effort: "P2"
dependencies: []
notes: "Completed. Session 260715-1517 (post PR #60): F11b CLAUDE.md inbound-gate docs fix (registry-table.sh | tail -20); merge=union dry-run (Red Team F10) — SURFACED + FIXED a driver-config gap (canonical `git merge-file --union %O %A %B` silently drops the other side; corrected to `%A %O %B` and documented in .gitattributes + AGENTS.md §8); closeout journal. Session 260715-1547 (live): re-grounded .gitattributes via meta_state_refresh_file_index (the finding cites .gitattributes, not meta-state.js; baseline was stale 7c466a3f after the Phase-4 comment edit), then meta_state_resolve closed meta-260715T0633Z-change-log-stream (resolved_at 2026-07-15T08:47:43Z); ship change-log meta-260715T1536Z-change-log-jsonl recorded in change-log.jsonl; finding-stream verified still open (Tier-2 ticket, version 1, description intact)."
---

# Phase 4: Verify and closeout

## Overview

Whole-plan verification: full test suite, union invariants, a live `merge=union` dry-run, and registry closeout — resolve the Tier-1 finding (`change-log-stream`) with PR + change-log refs, and **explicitly keep the Tier-2 finding (`finding-stream`) OPEN** as the debt ticket. Journal the ship.

## Requirements

- Functional: `pnpm test` green; a simulated parallel-append merge resolves via `merge=union` with no duplicate ids; the two open findings are handled per their roles.
- Non-functional: no regression in `loop_describe` warm tier, relationship tools, or the inbound gate — the inbound gate's stale-observation surface is preserved (the claim that it "reads through the chokepoint" was false; see Implementation Step 5 for the actual fix — Red Team F11b).

## Architecture

Verification is end-to-end: drive the affected flows, not just unit tests. The `merge=union` dry-run proves the core payoff (parallel change-log appends auto-merge). Closeout uses `meta_state_resolve` (live-gated) for the Tier-1 finding and leaves the Tier-2 finding open with its description intact.

## Related Code Files

- Verify: `change-log.jsonl`, `meta-state.jsonl`, `.gitattributes`, `read-registry-cache.js`, `meta-state.js`, both CI workflows, `registry-table.sh`
- Modify (registry): `meta-260715T0633Z-change-log-stream-…` (resolve), `meta-260715T0633Z-finding-stream-…` (confirm still open — do NOT touch)
- Create: journal entry under `docs/journals/`

## Implementation Steps

1. **Full suite.** `pnpm test` green; `pnpm lint`/typecheck if configured. Confirm zero skipped/hidden failures.
2. **Union invariants live.** Via MCP: `meta_state_list` returns findings + change-logs (chronological via `created_at` sort — Red Team F15a); `meta_state_relationships` (plural — Red Team F4) for a `superseded` finding still resolves its `consolidated_into` change-log across files; `meta_state_relationship_validate` (singular, description-linter) on a clean description → no orphans.
3. **`merge=union` dry-run (Red Team F10).** Construct **two branches each cut from a SHARED base, each appending a different change-log line at the SAME EOF position** (not sequential merge — that doesn't exercise `merge=union`). Both branches must leave `meta-state.jsonl` byte-identical to base (only touch `change-log.jsonl`). Attempt a non-fast-forward merge; assert git auto-merges via the union driver with no conflict and both lines present, no duplicate ids. (This is the payoff the whole plan exists for — verify it actually works.)
4. **`loop_describe` warm tier.** Call `loop_describe({tier: "warm"})`; confirm `registry_summary` counts match the union; process hints unaffected.
5. **Inbound gate (Red Team F11b, Validation Session 1 Q1).** Confirm the gate still surfaces stale observations correctly. **The claim that the gate "reads through the chokepoint" was false** — `core/evaluate-inbound-gate.js:121,140-146` reads `runtime-state.jsonl` via `readRuntimeObservations(root)`, not the registry chokepoint. **Validation Session 1 Q1 decision: docs-only fix at `AGENTS.md`** (CLAUDE.md inherits per project structure). Update the "last 20 raw lines" instruction in `AGENTS.md` to use `registry-table.sh | tail -20`. Remove the false claim from this plan + journal. Add an explicit check that the AGENTS.md update is in the same PR as the registry split.
6. **Registry closeout (live session, Red Team F15b).** In a `LOOP_SESSION_MODE=live` session: **first** run `meta_state_list({ id: 'meta-260715T0633Z-finding-stream-…' })` and assert `status === 'open'` BEFORE running any resolve (do NOT close the Tier-2 ticket by accident). Then `meta_state_resolve` the `change-log-stream` finding with resolution = PR ref + the change-log created by this plan's ship. **Do NOT resolve `finding-stream`** — confirm it remains `open`; its description (behavioral-safety + committed-Tier-2 + self-defeating-trigger) stays intact as the Tier-2 ticket. If a change-log for this ship is needed, write it via `meta_state_log_change` (it now lands in `change-log.jsonl` — also exercises the new path).
7. **Journal.** Write `docs/journals/<date>-tier1-change-log-stream-split.md`: what shipped, the union/merge-union verification result, what stays open (Tier 2), the seam swap point for Tier 2.
8. **Whole-plan consistency sweep.** Re-read `plan.md` + all `phase-*.md`; confirm no stale terms, no contradicted decisions, acceptance criteria all checked.

## Success Criteria

- [x] `pnpm test` green; no regressions in `loop_describe`, relationship tools, or inbound gate. **[PR #60: 1922/1923 pass, 1 pre-existing skip.]**
- [x] `merge=union` dry-run: two parallel change-log appends auto-merge, no conflict, no duplicate ids. **[Session 260715-1517: dry-run verified the payoff AND surfaced a driver-config gap — the canonical `git merge-file --union %O %A %B` silently drops the other side; corrected to `%A %O %B` and documented in .gitattributes + AGENTS.md §8 (per-clone `git config merge.union.driver`). With the corrected driver: both appends present, 0 dup ids, no conflict.]**
- [x] `meta-260715T0633Z-change-log-stream-…` resolved with PR + change-log refs. **Resolved via meta_state_resolve after re-grounding .gitattributes with meta_state_refresh_file_index (stale 06:23 seed baseline after the Phase 4 union-driver comment edit); ship change-log meta-260715T1536Z-change-log-jsonl recorded; finding-stream verified still open (Tier-2 ticket).**
- [x] `meta-260715T0633Z-finding-stream-…` confirmed OPEN, description intact (Tier-2 ticket). **[Verified session 260715-1517: status=open.]**
- [x] Journal entry written; whole-plan consistency sweep clean. **[journal-260715-1517-tier1-phase4-closeout.md; plan + all phase files reconciled.]**

## Risk Assessment

Low at this stage (verification + closeout). Main risk: prematurely resolving the `finding-stream` finding and losing the Tier-2 debt signal — mitigated by an explicit pre-resolve assertion (Red Team F15b) and a post-check that it's still open. Secondary: the `merge=union` dry-run surfaces a real union bug (e.g. duplicate ids from a stale base-version) — if it does, that's a Phase 2 immutability-guard failure; do not ship until fixed. Third: the inbound-gate plumbing fix is real work, not just a docs tweak — Phase 4 verification confirms either path (a) gate rewired or (b) docs updated; don't ship with the original false claim still in place.