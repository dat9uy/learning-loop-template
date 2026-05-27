---
title: "Restructure Coordination Gate to Learning-Loop-MCP"
description: "Rename tools/coordination-gate to tools/learning-loop-mcp, flatten mcp/ subfolder, co-locate references/evals from .claude/skills/learning-loop/, add Node.js subpath imports, and update all config/docs/skills. Pure refactor — zero logic changes."
status: completed
priority: P1
branch: "main"
tags: [refactor, rename, mcp, agent-experience, project-organization, product-build]
blockedBy:
  - "260524-unified-coordination-gate"
blocks: []
created: "2026-05-27T01:48:36.504Z"
createdBy: "ck:plan"
source: skill
---

# Restructure Coordination Gate to Learning-Loop-MCP

## Overview

The coordination gate system (`tools/coordination-gate/`) has three structural problems:

1. **Server name mismatch**: The directory is called `coordination-gate` but the repo brand is "learning-loop". Agents discover the MCP server by name; "coordination-gate" is unbranded and overloaded (also used for hook directories).

2. **Unnecessary `mcp/` nesting**: `tools/coordination-gate/mcp/server.js` sits one level deeper than needed. After flattening, import paths to `core/` and `lib/` become shorter.

3. **References/evals in wrong tree**: `.claude/skills/learning-loop/references/` contains system rules consumed by both Claude and Droid skills, but `.factory/skills/learning-loop/` only has `SKILL.md` — its references point to non-existent local paths. These files describe MCP-enforced rules and belong with the runtime.

This plan fixes all three in one coordinated refactor: rename to `learning-loop-mcp`, flatten `mcp/`, move references/evals into the package, add Node.js subpath imports, and update all consumers.

## Key Principle

**Refactor-only, no logic changes.** Every phase preserves exact behavior. Tests are the contract.

## Phases

| Phase | Name | Status | Effort | Priority |
|-------|------|--------|--------|----------|
| 1 | [Rename+Flatten](./phase-01-rename-flatten.md) | Pending | 2h | P1 |
| 2 | [Co-locate References+Evals](./phase-02-co-locate-references-evals.md) | Pending | 1h | P1 |
| 3 | [Subpath Imports](./phase-03-subpath-imports.md) | Pending | 2h | P1 |
| 4 | [Config+Docs+Skills Update](./phase-04-config-docs-skills-update.md) | Pending | 2h | P1 |
| 5 | [Verification+Tests](./phase-05-verification-tests.md) | Pending | 2h | P1 |

## Dependencies

- Phase 1 must complete before Phase 2 (directory structure must be stable before adding new content)
- Phase 1 must complete before Phase 3 (imports update requires new directory layout)
- Phase 2 and Phase 3 are independent (references move vs import rewrites touch different files)
- Phase 4 must complete after Phase 1-3 (config updates reference the new paths)
- Phase 5 depends on all prior phases (full test suite)

## Cross-Plan Relationships

- **Blocked by:** `260524-unified-coordination-gate` (core extraction and hook unification must be complete; this plan renames the canonical tree)
- **Blocks:** `260527-0000-tools-simplification-mcp-agent-surface` (that plan references `tools/coordination-gate/` throughout its phases; this rename must land first)

## Risk Summary

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Missed path reference in docs/plans/hooks | High | Grep inventory before commit; zero-tolerance for `coordination-gate` in active code |
| Import path breaks after flatten | High | Run `pnpm test` after each phase; server smoke test after Phase 1 |
| Subpath imports incompatible with pnpm/node | Medium | Node 18+ supports ESM subpath imports natively; project already uses `"type": "module"` |
| MCP client caches old server name | Medium | Restart agent sessions after Phase 4; document in skill files |
| `.factory` skill still has stale references | Medium | This refactor fixes the root cause; both skills point to real files |
| Historical plan references become stale | Low | Acceptable — historical docs reference state at time of writing |

## Red Team Review

**Session:** 2026-05-27
**Findings:** 9 total (5 accepted, 4 rejected)
**Severity breakdown:** 1 Critical, 3 High, 1 Medium, 0 Low

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Stale hook wrapper paths = gate bypass window | Critical | Accept | Phase 1 (atomic commit emphasis), Phase 5 (hook verification) |
| 2 | `gate-utils.cjs` hardcodes dead path to `patterns.json` | High | Accept | Phase 4 (add to update targets) |
| 3 | `workflow-generate-prompt-tool.js` hardcodes blueprint paths Phase 2 moves | High | Accept | Phase 2 (add to file list) |
| 4 | `.claude/coordination/__tests__/*.test.cjs` hardcode old server/core paths | High | Accept | Phase 4 (add to update targets), Phase 5 (add to test targets) |
| 5 | Subpath imports expose non-module paths (`#records/*`, `#schemas/*`) | Medium | Accept | Phase 3 (remove from package.json imports) |
| 6 | MCP server name change breaks cached client connections | Medium | Reject | Expected transition cost; .mcp.json updated in Phase 4 |
| 7 | `source-ref-validator.js` allows unvalidated `legacy:` paths | Medium | Reject | Pre-existing issue, out of refactor scope |
| 8 | Evals co-located with runtime = writable by any agent | Low | Reject | Not a new risk; `.claude/skills/` was also writable |
| 9 | `workflow-runner.js` `{path}` substitution unsanitized | Low | Reject | Pre-existing issue; spawn() with shell:false mitigates |

### Whole-Plan Consistency Sweep
- All 5 accepted findings applied to target phase files below.
- Phase 1: Added explicit note that all 6 hook wrappers must be updated in the same commit as `git mv`.
- Phase 2: Added `workflow-generate-prompt-tool.js` to the file inventory.
- Phase 3: Removed `#records/*` and `#schemas/*` from `package.json` imports; kept only `#mcp/*` and `#lib/*`.
- Phase 4: Added `.claude/coordination/__tests__/*.test.cjs` and `.claude/coordination/hooks/lib/gate-utils.cjs` as explicit update targets.
- Phase 5: Added `.claude/coordination/__tests__/*.test.cjs` to the test suite verification steps.
- No contradictions remain.

## Validation Log

### Session 1 — 2026-05-27
**Trigger:** `/ck:plan validate` after red-team review
**Questions asked:** 3

#### Verification Results
- Claims checked: 10 (all verified against codebase evidence)
- Verified: 10 | Failed: 0 | Unverified: 0
- Tier: Standard

#### Questions & Answers

1. **[Commit Strategy]** Phase 1 hook wrappers must be updated in the same git commit as the rename to avoid a gate bypass window. Is that acceptable?
   - Options: Single atomic commit (Recommended) | Stage carefully and review each sub-step
   - **Answer:** Single atomic commit (Recommended)
   - **Rationale:** Prevents any intermediate state where hook wrappers point to non-existent paths, which would create a fail-open gate bypass.

2. **[Subpath Imports]** The red team recommended removing `#records/*` and `#schemas/*` from subpath imports. Should we keep only `#mcp/*` and `#lib/*`?
   - Options: Only JS module aliases (Recommended) | Add records/schemas back
   - **Answer:** Only JS module aliases (Recommended)
   - **Rationale:** Records and schemas contain YAML/JSON data, not JS modules. Exposing them as importable namespaces is unnecessary and leaks path structure.

3. **[Dead Code]** `gate-utils.cjs` is dead code in production but still imported by `.claude/coordination/__tests__/*.test.cjs`. Should we update its path in Phase 4 and schedule deletion later?
   - Options: Update now, delete later (Recommended) | Delete now | Keep as-is
   - **Answer:** Update now, delete later (Recommended)
   - **Rationale:** Updating the path avoids test breakage during this refactor. Deleting dead code deserves its own focused cleanup plan.

#### Confirmed Decisions
- Commit strategy: Single atomic commit for all Phase 1 changes — user confirmed
- Subpath imports scope: Only `#mcp/*` and `#lib/*` — user confirmed
- `gate-utils.cjs` handling: Update path in Phase 4, schedule deletion in follow-up — user confirmed

#### Action Items
- None — all answers aligned with existing plan recommendations.

#### Impact on Phases
- No phase changes needed (all answers aligned with plan).

### Whole-Plan Consistency Sweep
- Validation decisions checked against all phase files.
- Phase 1 already specifies atomic commit for hook wrappers.
- Phase 3 already specifies only `#mcp/*` and `#lib/*`.
- Phase 4 already includes `gate-utils.cjs` as an update target.
- No contradictions introduced.
- Plan ready for implementation.

## Success Metrics

| Metric | Target |
|--------|--------|
| `pnpm test` pass rate | 100% |
| `pnpm check` pass rate | 100% |
| `node tools/learning-loop-mcp/server.js` | Starts without errors, registers 33 tools |
| `rg "coordination-gate" tools/ .claude/ .factory/ package.json .mcp.json` | 0 matches (except historical docs/plans) |
| `ls tools/learning-loop-mcp/references/` | 10 markdown files |
| `ls tools/learning-loop-mcp/evals/` | `evals.json` |
| Deepest relative import in MCP tree | `../../lib/` max (was `../../../lib/`) |
