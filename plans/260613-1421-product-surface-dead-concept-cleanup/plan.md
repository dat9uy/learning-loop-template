---
title: "Product-Surface Dead Concept Cleanup"
description: "Remove dead product-surface concepts from live files after 2026-06-12 meta-surface re-debate. The prior cleanup (260613-1000) deleted entirely-unused files; this plan removes dead concepts embedded in live files."
status: in-progress
priority: P2
branch: "main"
tags: [cleanup, dead-code, product-surface, meta-surface]
blockedBy: ["260613-1000-dead-code-cleanup"]
blocks: []
created: "2026-06-13T14:21:00.000Z"
createdBy: "ck:plan"
source: meta-state
meta_finding: "meta-260613T1421Z-dead-product-surface-concept-code-remains-in-live-files-afte"
---

# Product-Surface Dead Concept Cleanup

## Overview

After the 2026-06-12 meta-surface re-debate, AGENTS.md declares the product surface **unbound** — all product-surface record CRUD is paused. The prior dead-code cleanup (260613-1000) deleted 48 entirely-unused files but did not remove dead product-surface **concepts** from files that are otherwise live.

This plan removes:
1. **Entirely dead files** that exist only to serve the product surface (6 files + 2 directories)
2. **Dead test files** that test only product-surface validation (5 files)
3. **Dead functions** inside live files (2 functions in gate-logic.js, 2 functions + 1 import in record-validation-rules.js)

**Scope boundary:** This plan does NOT touch `extract-index/`, `list-verified.js`, or `search-index.js` — those are also dead product-surface code but were not flagged by the finding. They are a separate cleanup.

## Phases

| Phase | Name | Scope | Status | Effort | Dependencies |
|-------|------|-------|--------|--------|--------------|
| 1 | [Delete Dead Product-Surface Files](./phase-01-delete-dead-product-surface-files.md) | 6 files + 2 dirs | pending | 10min | — |
| 2 | [Delete Dead Product-Surface Tests](./phase-02-delete-dead-product-surface-tests.md) | 5 test files | pending | 10min | 1 |
| 3 | [Clean Dead Concepts from Live Files](./phase-03-clean-dead-concepts-from-live-files.md) | 2 live files | pending | 15min | 1, 2 |

## Success Criteria

- [ ] All 6 dead files + 2 directories deleted
- [ ] All 5 dead test files deleted
- [ ] `checkDecisionRecords` removed from gate-logic.js
- [ ] `validateClaimVerification` import and call removed from record-validation-rules.js
- [ ] `validateCandidateConsumption` removed from record-validation-rules.js
- [ ] `pnpm test` passes after each phase
- [ ] No regressions in MCP server startup or hook execution

## Risk Assessment

- **Low risk:** All deletions verified by grep/import analysis — no live code depends on them
- **Watch:** `record-validation-rules.js` has mixed concerns (live source-ref validation + dead claim verification). Phase 3 surgically removes only the dead parts.
- **Out of scope:** `extract-index/`, `list-verified.js`, `search-index.js` — also dead but not flagged by the finding
