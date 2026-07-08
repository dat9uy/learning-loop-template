---
phase: 3
title: "buildChangeLogGapHints pure builder"
status: pending
priority: P2
dependencies: [1, 2]
---

# Phase 3: buildChangeLogGapHints pure builder

## Overview

The Rec 12 (b) detection: a pure `buildChangeLogGapHints(entries, touchedPaths)` builder in `core/loop-introspect.js` that joins the branch's touched bound-artifact paths (phase 2) against change-log coverage (phase 1's canonicalizer) and returns the gap set. Mirrors the `buildStaleDispatchHints` purity contract — no I/O, caller-supplied set — so it stays unit-testable without git or the registry sidecar.

## Requirements

- Functional:
  - `buildChangeLogGapHints(entries, touchedPaths = new Set())` returns `{ gap_candidates: string[], gap_protocol_prompt: string }`.
  - A touched path is a **gap candidate** iff: (a) it matches some `CHANGE_LOG_BOUND_PATHS` prefix (phase 1), AND (b) no `entry_kind === "change-log"` entry in `entries` covers it, where **covered** = some entry's `canonicalizeChangeTarget(entry)` set contains a path `c` such that `touched === c` OR `touched` starts with `c` (prefix-descendant; directory `c` like `"docs/"` covers `"docs/loop-engine.md"`).
  - `gap_candidates` sorted by path string (deterministic — paths carry no `created_at`); cap at 5.
  - `gap_protocol_prompt` names the backfill action AND includes the first gap path (red-team L1): e.g. `"N bound edits on this branch have no change-log. Backfill via meta_state_log_change({ change_target, change_diff, reason }); first gap: <path>. Verify change_target is repo-relative (the detector matches repo-relative paths; #anchor/mcp→mastra/bare-schema are normalized on read)."`.
- Non-functional: pure function over `entries` (a registry snapshot array) + caller-supplied `Set<string>`; no I/O; no `buildColdTierCache`/`writeColdTierCache` (session-start hot path); unit-testable without git or runtime-state.

## Architecture

In `core/loop-introspect.js`, sibling of `buildStaleDispatchHints` (L195-261). Reuse the caller-supplied-set convention (`dispatchIds` → `touchedPaths`). Do NOT reuse `top5OldestFirst` — that sorts entries by `created_at`; paths are unordered, so a new `top5ByPath` helper (sort by `localeCompare`, `slice(0,5)`). Import `CHANGE_LOG_BOUND_PATHS` + `canonicalizeChangeTarget` + `isBoundPath` from `./change-log-bound-paths.js` (phase 1's new sibling module, NOT `bound-artifacts.js`).

Coverage join (the load-bearing logic):
```
covered = new Set()
for (const e of entries.filter(e => e.entry_kind === "change-log"))
  for (const c of canonicalizeChangeTarget(e))
    covered.add(c)                       // exact + directory markers
isCovered(p) = [...covered].some(c => p === c || p.startsWith(c))
gaps = [...touchedPaths]
  .filter(p => isBoundPath(p))           // CHANGE_LOG_BOUND_PATHS match
  .filter(p => !isCovered(p))
  .sort((a,b) => a.localeCompare(b))
  .slice(0, 5)
```

The coarse prefix-descendant match is a deliberate decision (plan.md decision 4): for an advisory signal, false-negative-safe (a `"docs/"` log over-covers, suppressing docs gaps) beats false-positive-noisy. The residual mismatch risk (caller writes `"meta-state.js"`, git reports `tools/learning-loop-mastra/core/meta-state.js`) is documented in `gap_protocol_prompt` as "if a change-log was logged, verify its `change_target` is repo-relative."

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/loop-introspect.js` — add `buildChangeLogGapHints` + `top5ByPath` helper + import from `./change-log-bound-paths.js`.
- Create: `tools/learning-loop-mastra/__tests__/legacy-mcp/build-change-log-gap-hints.test.js` — pure-fn TDD.
- Reference: `tools/learning-loop-mastra/core/loop-introspect.js:195-261` — `buildStaleDispatchHints` pattern to mirror.

## Implementation Steps (TDD)

1. **Test first.** Create `build-change-log-gap-hints.test.js` mirroring `build-stale-dispatch-hints.test.js`'s `makeEntry` fixture helper (adapted for `entry_kind: "change-log"`):
   - **Bound filter:** touched `{["docs/loop-engine.md","README.md"]}` + no change-logs → gap = `["docs/loop-engine.md"]` (README not bound).
   - **Exact coverage:** touched `{["docs/loop-engine.md"]}` + change-log `{change_target:"docs/loop-engine.md"}` → gap = `[]`.
   - **Directory coverage:** touched `{["docs/a.md","docs/b.md"]}` + change-log `{change_target:"docs/"}` → gap = `[]` (over-coverage accepted).
   - **Compound coverage:** touched `{["AGENTS.md","meta-state.jsonl"]}` + change-log `{change_target:"AGENTS.md + meta-state.jsonl + core/x.js"}` → gap = `[]` (both covered).
   - **applies_to.schemas coverage:** touched `{["docs/loop-engine.md"]}` + change-log with `change_target:"<non-path>"` + `applies_to:{schemas:["docs/loop-engine.md"]}` → gap = `[]`.
   - **Mixed gap:** touched `{["docs/a.md","tools/learning-loop-mastra/core/y.js","schemas/s.json"]}` + change-log covering only `"docs/"` → gap = `["schemas/s.json","tools/learning-loop-mastra/core/y.js"]` (docs/a.md covered by dir; sort by path).
   - **Cap at 5:** 7 bound touched paths, none covered → gap length 5, the first 5 by `localeCompare`.
   - **Non-path change_target ignored:** change-log `{change_target:"meta-state-finding-categories"}` covers nothing → touched bound path still a gap.
   - **Empty touchedPaths** → `[]`. **Empty entries** → all bound touched paths are gaps.
   - **Determinism:** two runs over the same fixture produce identical order.
2. **Implement** `buildChangeLogGapHints` + `top5ByPath` in `loop-introspect.js`; import `CHANGE_LOG_BOUND_PATHS`, `canonicalizeChangeTarget`, `isBoundPath` from `./change-log-bound-paths.js`.
3. **Run** `pnpm test` legacy-mcp namespace; confirm green. Re-run `build-stale-dispatch-hints.test.js` to confirm no regression in the sibling builder.

## Success Criteria

- [ ] `buildChangeLogGapHints(entries, touchedPaths)` passes all 10+ fixture cases.
- [ ] Pure: no I/O, no `buildColdTierCache`/`writeColdTierCache` call.
- [ ] Reuses `canonicalizeChangeTarget` (phase 1) + `CHANGE_LOG_BOUND_PATHS` (phase 1).
- [ ] Cap-at-5 + deterministic path-string order.
- [ ] `build-change-log-gap-hints.test.js` + `build-stale-dispatch-hints.test.js` green.

## Risk Assessment

Low-medium. Pure function; the join logic is the only subtlety. Mitigation: the prefix-descendant rule is pinned by the directory-coverage + mixed-gap tests; the canonicalization risk is documented in the prompt string, not encoded as enforcement. Rollback: remove the export; phase 4 hook falls back to an empty `change_log_gap_hints` block.