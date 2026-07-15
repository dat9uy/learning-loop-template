---
phase: 4
title: "Verify and closeout"
status: pending
effort: "P2"
dependencies: []
---

# Phase 4: Verify and closeout

## Overview

Whole-plan verification: full test suite, union invariants, a live `merge=union` dry-run, and registry closeout — resolve the Tier-1 finding (`change-log-stream`) with PR + change-log refs, and **explicitly keep the Tier-2 finding (`finding-stream`) OPEN** as the debt ticket. Journal the ship.

## Requirements

- Functional: `pnpm test` green; a simulated parallel-append merge resolves via `merge=union` with no duplicate ids; the two open findings are handled per their roles.
- Non-functional: no regression in `loop_describe` warm tier, relationship tools, or the inbound gate (which reads through the chokepoint).

## Architecture

Verification is end-to-end: drive the affected flows, not just unit tests. The `merge=union` dry-run proves the core payoff (parallel change-log appends auto-merge). Closeout uses `meta_state_resolve` (live-gated) for the Tier-1 finding and leaves the Tier-2 finding open with its description intact.

## Related Code Files

- Verify: `change-log.jsonl`, `meta-state.jsonl`, `.gitattributes`, `read-registry-cache.js`, `meta-state.js`, both CI workflows, `registry-table.sh`
- Modify (registry): `meta-260715T0633Z-change-log-stream-…` (resolve), `meta-260715T0633Z-finding-stream-…` (confirm still open — do NOT touch)
- Create: journal entry under `docs/journals/`

## Implementation Steps

1. **Full suite.** `pnpm test` green; `pnpm lint`/typecheck if configured. Confirm zero skipped/hidden failures.
2. **Union invariants live.** Via MCP: `meta_state_list` returns findings + change-logs; `meta_state_relationships` for a `superseded` finding still resolves its `consolidated_into` change-log across files; `meta_state_relationship_validate` on a clean description → no orphans.
3. **`merge=union` dry-run.** Construct two branches each appending a distinct change-log line to `change-log.jsonl` at EOF; merge sequentially; assert git auto-merges with no conflict and both lines present, no duplicate ids. (This is the payoff the whole plan exists for — verify it actually works.)
4. **`loop_describe` warm tier.** Call `loop_describe({tier: "warm"})`; confirm `registry_summary` counts match the union; process hints unaffected.
5. **Inbound gate.** Confirm the gate still surfaces stale observations correctly (it reads through the chokepoint, so the union should be transparent — verify no regression).
6. **Registry closeout (live session).** In a `LOOP_SESSION_MODE=live` session: `meta_state_resolve` the `change-log-stream` finding with resolution = PR ref + the change-log created by this plan's ship. **Do NOT resolve `finding-stream`** — confirm it remains `open`; its description (behavioral-safety + committed-Tier-2 + self-defeating-trigger) stays intact as the Tier-2 ticket. If a change-log for this ship is needed, write it via `meta_state_log_change` (it now lands in `change-log.jsonl` — also exercises the new path).
7. **Journal.** Write `docs/journals/<date>-tier1-change-log-stream-split.md`: what shipped, the union/merge-union verification result, what stays open (Tier 2), the seam swap point for Tier 2.
8. **Whole-plan consistency sweep.** Re-read `plan.md` + all `phase-*.md`; confirm no stale terms, no contradicted decisions, acceptance criteria all checked.

## Success Criteria

- [ ] `pnpm test` green; no regressions in `loop_describe`, relationship tools, or inbound gate.
- [ ] `merge=union` dry-run: two parallel change-log appends auto-merge, no conflict, no duplicate ids.
- [ ] `meta-260715T0633Z-change-log-stream-…` resolved with PR + change-log refs.
- [ ] `meta-260715T0633Z-finding-stream-…` confirmed OPEN, description intact (Tier-2 ticket).
- [ ] Journal entry written; whole-plan consistency sweep clean.

## Risk Assessment

Low at this stage (verification + closeout). Main risk: prematurely resolving the `finding-stream` finding and losing the Tier-2 debt signal — mitigated by an explicit "do NOT resolve" step and a post-check that it's still open. Secondary: the `merge=union` dry-run surfaces a real union bug (e.g. duplicate ids from a stale base-version) — if it does, that's a Phase 2 immutability-guard failure; do not ship until fixed.