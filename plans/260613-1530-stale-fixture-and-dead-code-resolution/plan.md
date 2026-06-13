---
title: "Resolve Stale Scout Fixtures + Dead Product-Surface Code + Fallow Health"
description: "Resolve two meta-state findings (stale scout fixture refs + dead product-surface code) and triage fallow health complexity findings."
status: pending
priority: P2
branch: "main"
tags: [cleanup, dead-code, stale-ref, fallow, meta-state]
blockedBy: ["260613-1421-product-surface-dead-concept-cleanup"]
blocks: []
created: "2026-06-13T15:30:00.000Z"
createdBy: "ck:plan"
source: skill
meta_finding:
  - "meta-260613T1448Z-scout-fixtures-scout-output-json-contains-stale-references-t"
  - "meta-260613T1448Z-dead-product-surface-code-remains-in-extract-index-list-veri"
---

# Resolve Stale Scout Fixtures + Dead Product-Surface Code + Fallow Health

## Overview

Two meta-state findings need resolution:

1. **Stale scout fixture** — `scout/fixtures/scout-output.json` references 5 deleted product-surface modules (26 stale refs). The fixture was last generated 2026-06-08, before plan 260613-1421 deleted those files. Fix: regenerate the fixture by running `run-scout.js`.

2. **Dead product-surface code** — `extract-index/` (6 files), `list-verified.js`, and `search-index.js` are dead. Plan 260613-1421 explicitly scoped them out. No live MCP tools, hooks, or server code imports them. Fix: delete all 8 files + 4 associated test files.

Additionally, `fallow health --format json` reports 218 functions above complexity thresholds (74 critical, 69 high, 75 moderate). Phase 4 triages these — the dead-code deletion in Phase 2 eliminates some findings automatically.

## Phases

| Phase | Name | Status | Effort | Dependencies |
|-------|------|--------|--------|--------------|
| 1 | [Dead Code Deletion](./phase-01-dead-code-deletion.md) | pending | 10min | — |
| 2 | [Stale Reference Cleanup](./phase-02-stale-reference-cleanup.md) | pending | 15min | 1 |
| 3 | [Scout Fixture + Cache Regeneration](./phase-03-scout-fixture-and-cache-regeneration.md) | pending | 5min | 1, 2 |
| 4 | [Fallow Health Triage](./phase-04-fallow-health-triage.md) | pending | 15min | 1, 2, 3 |
| 5 | [Meta-State Resolution](./phase-05-meta-state-resolution.md) | pending | 5min | 1, 2, 3, 4 |

## Success Criteria

- [ ] All 8 dead source files + 4 test files deleted
- [ ] TOOL_MAP entries for `extract_index` and `generate_capabilities` removed from workflow tools
- [ ] Documentation references to deleted modules scrubbed
- [ ] Scout fixture regenerated with zero stale references
- [ ] Cold cache (`loop-describe-cold.json`) invalidated/regenerated
- [ ] `pnpm test` passes (0 regressions)
- [ ] Fallow health findings triaged
- [ ] Both meta-state findings resolved

## Rollback

All deletions are in git. If `pnpm test` fails after any phase:
```bash
git checkout -- <deleted-files>
```
Investigate the failure before re-deleting.
