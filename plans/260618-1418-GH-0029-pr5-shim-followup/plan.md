---
title: PR#5 Schema-Parity Shim Followup
description: >-
  Refute Q3 (override bypass) via live e2e probe; fix misleading comment, add
  regression test, fold empirical finding back into docs.
status: completed
priority: P2
branch: 260618-0029-coerce-layer-zod-native-migration
tags:
  - parity
  - shim
  - regression-test
  - doc-update
  - ckignore-cleanup
blockedBy: []
blocks: []
created: '2026-06-18T07:24:28.732Z'
createdBy: 'ck:plan'
source: skill
---

# PR#5 Schema-Parity Shim Followup

## Overview

Address the 3 unresolved questions from PR#5 review (`code-reviewer-260618-1226-GH-0029-coerce-migration-parity-shim-deviation-report.md`). Q1 (Researcher 1's trivial-case-only test) and Q2 (zod internal API stability) are settled empirically. **Q3 is REFUTED** by live e2e evidence — the `_zod.toJSONSchema` override at `create-loop-tool.js:38` propagates correctly through Mastra's `MCPServer.convertSchema` path; all 39 production tools return proper JSON Schemas via `tools/list`. The plan's only code change is a comment fix; the rest is doc updates, a regression test, and `.ckignore` cleanup.

## Goal

1. **Lock down the working override path** with an e2e regression test that exercises the actual `tools/list` MCP path (not just `z.toJSONSchema` directly).
2. **Fix the misleading comment** at `create-loop-tool.js:35-37` to accurately describe the path the override travels in production.
3. **Update `docs/mcp-tool-schema-architecture.md` §3.5** to reflect the refutation (Q3 was a synthetic-probe artifact, not a production bug).
4. **Add `schema-parity.js` to SP2 fingerprint registry** so the shim's internals are tracked for drift.
5. **Remove `!node_modules` from `.ckignore`** (research bypass, no longer needed after plan ships).

## Phases

| Phase | Name | Status | Effort | Depends on |
|---|---|---|---|---|
| 1 | Research (e2e evidence + refutation) | pending | 1h (already done in research reports) | Completed |
| 2 | Implement (comment fix + test + doc + SP2 + ckignore) | pending | 1.5h | phase-01 |
| 3 | Test + verify (pnpm test + e2e parity + ckignore revert) | pending | 30min | phase-02 |

Total: **~3h**.

## Key Research Findings (input from researcher-A & researcher-B)

| Finding | Evidence | Verdict |
|---------|----------|---------|
| Q3 (override bypass) | Live e2e probe of all 39 tools in `tools/list` returned proper JSON Schemas | **REFUTED** — no production bug |
| Q3 synthetic probe `{"$ref":"#"}` | Isolated `/tmp/probe-q3-clean.cjs` returns `$ref:"#"` for nested objects | Confirmed as zod 4.4.3 quirk; doesn't affect real migration-touched schemas (verified) |
| `jsonSchema()` helper in `@mastra/core/utils` | Read full `utils.d.ts` (115 lines) — not exported | **NOT AVAILABLE** |
| `toStandardSchema()` from `@mastra/schema-compat` | Source inspected — would be a no-op refactor | **NOT NEEDED** |
| Pin zod to 4.4.x | `package.json:48` already pins `zod: 4.4.3` | **ALREADY DONE** |
| Q1 (Researcher 1's test) | Plan's "trivial case" claim was over-broad but correct; `.optional()` is actually fine in zod 4.4.3 | Empirically settled |
| Q2 (zod internal API stability) | `_zod.def.type`, `_zod.bag`, `globalRegistry`, `_zod.toJSONSchema` all stable in 4.4.3 | Bounded risk; 7 `coerce-correctness.test.js` tests are regression net |

**Recommended action set (downgraded from 7 to 4):**
- ~~Strategy A: `jsonSchema()` wrapper~~ — doesn't exist
- ~~Strategy B: `toStandardSchema` wrap~~ — no-op
- ~~Strategy C: pin zod~~ — already done
- **Keep:** Comment fix + regression test + SP2 fingerprint + doc correction + `.ckignore` revert

## Predecessor Artifacts

- `plans/reports/scouts-260618-1336-GH-0029-pr5-unresolved-questions-report.md` — original scout report (Q1/Q2/Q3 conclusions; Q3 needs correction)
- `plans/reports/researcher-A-260618-1418-GH-0029-pr5-shim-fix-strategies-report.md` — Q3 refutation + 3-strategy analysis
- `plans/reports/researcher-B-260618-1418-e2e-parity-test-design-report.md` — e2e test design (also confirms Q3 refutation empirically)
- `docs/mcp-tool-schema-architecture.md` — cached reference; §3.5 needs updating
- `plans/260618-0029-coerce-layer-zod-native-migration/plan.md:11` — references the missing `research-260618-0031-zod-impact-analysis.md` (Q1 footnote)
- `tools/learning-loop-mastra/create-loop-tool.js:35-37` — misleading comment (target of fix)
- `tools/learning-loop-mastra/__tests__/with-mcp-server.js` — stdio server helper (used by new test)
- `tools/learning-loop-mastra/__tests__/coerce-correctness.test.js` — existing parity regression net (tested `z.toJSONSchema` directly, NOT the MCP path)
- `plans/260618-1418-GH-0029-pr5-shim-followup/e2e-tools-list-parity-probe.cjs` — pre-built e2e probe (researcher A)
- `/tmp/probe-e2e/probe-all-tools.test.js` — pre-built aggregate probe (researcher B)

## Dependencies

- None cross-plan. The `260618-0029-coerce-layer-zod-native-migration` plan is `completed`; this is a followup.

## Out of Scope

- Refactoring the shim (researcher-A confirmed it's working correctly)
- Replacing `coerce-correctness.test.js` (YAGNI — both tests serve different surfaces)
- Pinning zod to 4.4.x with regression notes (already in `package.json`)
- Fixing the `research-260618-0031-zod-impact-analysis.md` missing reference (out of scope; separate doc-cleanup)
- Fixing the plan's `.optional()` overstatement at `phase-01-schema-migration.md:123-126` (out of scope; doc nit)

## Acceptance Criteria

- [ ] `create-loop-tool.js:35-37` comment replaced with accurate description (5 min, comment-only)
- [ ] New file `tools/learning-loop-mastra/__tests__/mcp-tools-list-parity.test.js` with **4 tests** (1 universal contract + 3 per-tool load-bearing) per phase-02 step 2.2 verbatim spec (30 min)
- [ ] `pnpm test` passes 1067/0/1 (was 1063 + 4 new); total runtime +~1s for the e2e test
- [ ] SP2 change-log entry for `schema-parity.js` via `meta_state_log_change` with `change_dimension: "mechanical"` (5 min, registry-only)
- [ ] `docs/mcp-tool-schema-architecture.md` §3.5, §3.6, §8 updated to reflect Q3 refutation (preserving "synthetic-probe quirk, not fully diagnosed" caveat) (10 min)
- [ ] `scouts-260618-1336-GH-0029-pr5-unresolved-questions-report.md` Q3 addendum added (10 min)
- [ ] `plans/260618-0029-coerce-layer-zod-native-migration/plan.md:11` dangling ref replaced (5 min)
- [ ] `.ckignore` reverted to remove `!node_modules` (dated rationale comment kept) (1 min, file edit)

## Risk Assessment

- **Comment change:** zero risk (documentation-only).
- **New test:** low risk — it's a regression guard, will pass on the current code (verified by researcher A's e2e probe). The test catches future regressions in the override mechanism, the shim, or the Mastra SDK's schema path.
- **SP2 fingerprint:** zero risk (registry-only; no code change).
- **Doc updates:** zero risk (prose-only; future agents get the correct picture).
- **`.ckignore` revert:** zero risk (removes a research bypass; if needed again, add back via the same mechanism).
