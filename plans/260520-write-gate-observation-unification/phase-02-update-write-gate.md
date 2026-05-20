---
phase: 2
title: "Update Write Gate"
status: pending
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 2: Update Write Gate

## Overview

Teach `write-coordination-gate.cjs` to read `write-path` observations from `records/observations/` before applying domain rules to blocked paths. If a fresh observation matches the target path, allow the write. If the observation is stale (operator sent state-change message after observation recorded), block. If no observation, apply existing domain rules (block for `records/evidence/**`, allow for `records/claims/**`).

`records/observations/**` stays unconditionally blocked — only the MCP server writes there (via Node.js `fs`, bypassing the hook).

## Requirements

- Functional: Before domain rules, check for active `write-path` observation matching target path.
- Functional: If observation found, check staleness via `checkObservationStaleness()`.
- Functional: Fresh observation → allow (exit 0).
- Functional: Stale observation → block with `decision: 'escalate'` and `inbound_gate: true`.
- Functional: No observation → fall through to existing domain rules.
- Functional: `records/observations/**` remains unconditionally blocked regardless of observations.
- Non-functional: Execution time remains under 50ms.

## Architecture

### Flow

```
Input: Edit/Write tool call with file_path
  |
  v
Is records/observations/** ?
  |--YES--> block unconditionally
  |
  v
Read observations from records/observations/
Find matching write-path observation for file_path
  |
  +--YES--> check staleness
  |           |
  |           +--FRESH--> allow (exit 0)
  |           |
  |           +--STALE--> escalate (exit 2, inbound_gate: true)
  |
  +--NO--> apply DOMAIN_RULES (existing behavior)
```

### Code Changes

In `write-coordination-gate.cjs`, between `toRelative()` and `main()`:

1. Import `readObservations`, `checkObservationStaleness`, `pathMatchesObservation` from `gate-utils.cjs`.
2. In `main()`, after computing `relPath`:
   - Special-case `records/observations/**` first → block.
   - Compute `root = findProjectRoot()`; `obsDir = path.join(root, 'records', 'observations')`; `coordDir = path.join(__dirname, '..')`.
   - Read observations from `obsDir`.
   - Find matching `write-path` observation with `pathMatchesObservation()`.
   - If match found:
     - Run `checkObservationStaleness([obs], coordDir)` on the matching observation only.
     - If stale → escalate.
     - If fresh → allow.
   - If no match → fall through to `DOMAIN_RULES` loop.

### Why Check Staleness on Single Observation

`checkObservationStaleness` iterates all observations and returns the first stale one. For write-path, we only care about the observation that matches our path. If other observations are stale, that's the bash gate's concern. We should wrap the matching observation in an array and pass it to `checkObservationStaleness`.

## Related Code Files

- Modify: `.claude/coordination/hooks/write-coordination-gate.cjs`
- Read for context: `.claude/coordination/hooks/lib/gate-utils.cjs`

## Implementation Steps

1. Read current `write-coordination-gate.cjs`.
2. Add imports for `readObservations`, `checkObservationStaleness`, `pathMatchesObservation`.
3. Add `coordDir = path.join(__dirname, '..')` for staleness check (same convention as bash gate). Compute `obsDir = path.join(findProjectRoot(), 'records', 'observations')` for reading observations.
4. Insert observation-check logic before the `DOMAIN_RULES` loop:
   - Early block for `records/observations/**`.
   - Read observations from `obsDir`.
   - Find first matching active observation.
   - If found, check staleness with `coordDir`.
   - Fresh → exit 0.
   - Stale → escalate with `inbound_gate: true`.
5. Keep existing `DOMAIN_RULES` loop as fallback.
6. Run existing write gate tests to catch regressions.

## Success Criteria

- [ ] Write `records/evidence/foo.md` with no observation → blocked (exit 2, matched_rule: `records/evidence/**`).
- [ ] Write `records/evidence/foo.md` with fresh `write-path` observation (`constraint: records-evidence`) → allowed (exit 0).
- [ ] Write `records/evidence/foo.md` with stale `write-path` observation → escalated (exit 2, `inbound_gate: true`).
- [ ] Write `records/claims/foo.yaml` with no observation → allowed (exit 0) (general records still allowed).
- [ ] Write `records/observations/foo.yaml` with fresh `write-path` observation → blocked (exit 2) (unconditional).
- [ ] Write `docs/foo.md` with no observation → allowed (exit 0) (unaffected).
- [ ] Execution time under 50ms.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `records/observations/**` bypass via `records` wildcard observation | Low | High | Early block before observation check. Test verifies. |
| Performance regression from reading observations on every write | Low | Medium | Observations are small YAML files in a single directory. `readObservations` already used by bash gate on every Bash call. Benchmark: < 5ms for typical observation count (< 20 files). |

## Next Steps

- Phase 4: Update Tests (adds write gate observation tests).
- Phase 3: Update Bash Gate (independent, also uses `pathMatchesObservation`).
