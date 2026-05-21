---
title: "Records Surface-First Directory Restructure"
description: "Migrate flat records/<artifact_type>/ structure to surface-first records/<surface>/<artifact_type>/ layout. Big-bang migration with pre-migration tests, gate pattern updates, tool path updates, file moves, index regeneration, and docs sync."
status: pending
priority: P1
branch: "main"
tags: [refactor, records, surface-first, restructure, migration]
blockedBy: []
blocks: []
created: "2026-05-22T00:00:00Z"
createdBy: "ck:plan"
source: skill
---

# Records Surface-First Directory Restructure

## Overview

Migrate the flat `records/<artifact_type>/` structure to a surface-first `records/<surface>/<artifact_type>/` layout. Each surface (meta, vnstock, fastapi, tanstack, product) owns its full ledger. Observations remain in a flat mixed folder as the exception. Claims remain frozen-legacy.

**Scope:** ~154 files move (58 evidence, 23 decisions, 22 experiments, 3 risks, 4 capabilities, 10 claims, 25 index, plus subdirs), ~25 tool/test/config files update, docs and skill blueprints sync.
**Strategy:** Big-bang migration (single coordinated commit).
**Risk mitigation:** Pre-migration baseline tests, TDD phase structure, rollback plan.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Baseline & Pre-Migration Validation](./phase-01-baseline-validation.md) | pending |
| 2 | [Gate & Hook Pattern Updates](./phase-02-gate-hook-updates.md) | pending |
| 3 | [Tool Path Updates](./phase-03-tool-path-updates.md) | pending |
| 4 | [File Migration (git mv)](./phase-04-file-migration.md) | pending |
| 5 | [Index Regeneration & Ref Validation](./phase-05-index-regeneration.md) | pending |
| 6 | [Test Suite & Final Validation](./phase-06-final-validation.md) | pending |
| 7 | [Documentation & Blueprint Sync](./phase-07-docs-sync.md) | pending |

## Key Decisions

| Decision | Source |
|----------|--------|
| Big-bang over surface-by-surface | Brainstorm report Option A |
| Observations stay flat | Gap review Q6 |
| All 58 evidence files migrate | Gap review Q5 |
| Claims frozen-legacy, not moved to index | Gap review Q1 + `decision-260519T1400Z-claim-deprecation` |
| Delete old index, regenerate from scratch | Brainstorm open question 2 |

## Dependencies

- All existing plans touching `records/` must be complete or their files accounted for.
- `pnpm validate:records` and `pnpm extract:index` must work on current main.

## Risks

| Risk | Mitigation |
|------|------------|
| Missed path reference in tools/hooks | Pre-migration grep inventory; post-migration run all checks |
| Tests fail after migration | TDD phases: update test expectations BEFORE moving files |
| Local refs break after move | `pnpm check` validates cross-references; fix in phase 5 |
| Gate write-path breaks | Update `WRITE_PATH_PATTERNS` in `gate-utils.cjs` and `gate-logic.js` in phase 2; defer hook path checks to phase 4 |
| Hook bypass during migration window | Bash/write gates must support dual paths (old + new) or be updated in same commit as file moves |
| Index corruption | Delete old index files, regenerate fresh in phase 5 |
| `record:` reference graph breaks | Preserve YAML `id` fields when renaming files; do not change IDs |
| 221 `local:` refs break | Inventory and map all refs before migration; fix in phase 5 |
| `generate:capabilities --dry-run` breaks | Defer `generate-capabilities.js` update to phase 4 (same commit as file moves) |

## Red Team Review

### Session — 2026-05-22
**Findings:** 24 total (21 accepted, 3 rejected)
**Severity breakdown:** 7 Critical, 11 High, 3 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | `gate-logic.js` omitted from plan | Critical | Accept | Phase 2 |
| 2 | Bash gate bypass during migration window | Critical | Accept | Phase 2, Phase 4 |
| 3 | Write gate mediation break during migration | Critical | Accept | Phase 2, Phase 4 |
| 4 | `record-loader.js` returns zero records | Critical | Accept | Phase 3 |
| 5 | `extract-index.js` finds zero evidence | Critical | Accept | Phase 3 |
| 6 | `generate:capabilities --dry-run` breaks `pnpm check` | Critical | Accept | Phase 3, Phase 4 |
| 7 | Bash gate falls through for surface-first paths | Critical | Accept | Phase 2, Phase 4 |
| 8 | File counts wrong (154 actual vs ~106 claimed) | High | Accept | Phase 4, plan.md |
| 9 | `record:` reference graph breaks on rename | High | Accept | Phase 4 |
| 10 | 221 `local:` refs unscoped | High | Accept | Phase 5 |
| 11 | `file-writer.js` writes to wrong flat location | High | Accept | Phase 3 |
| 12 | `tools/constraint-gate/` suite omitted | High | Accept | Phase 2, Phase 3 |
| 13 | `list-verified.js`/`search-index.js` hardcoded flat | High | Accept | Phase 3 |
| 14 | Phase 7 docs sync misses `charter.md`, `system-architecture.md` | High | Accept | Phase 7 |
| 15 | Rollback plan contradicts single-commit | High | Accept | plan.md |
| 16 | `extract-index` existing-index loader breaks in phase 3 | High | Accept | Phase 3 |
| 17 | Surface discovery ingests placeholder dirs | High | Accept | Phase 1, Phase 3 |
| 18 | Phase 3 backward-compatibility claim impossible | High | Accept | Phase 3 |
| 19 | `fundamental-product` capability surface undefined | Medium | Accept | Phase 3, Phase 5 |
| 20 | Phase 7 regression gate only greps docs | Medium | Accept | Phase 7 |
| 21 | `file-writer.js` surface derivation underspecified | Medium | Accept | Phase 3 |

### Whole-Plan Consistency Sweep
- All 21 accepted findings applied to target phase files below.
- Contradictions resolved: gate pattern updates split between phase 2 (pattern tables) and phase 4 (hook path checks).
- File counts updated from ~106 to ~154 across plan and phase 4.
- `record:` ID stability requirement added to phase 4.
- Rollback plan revised from `git reset --hard` to `git revert`.
- Unresolved contradictions: 0.

## Rollback Plan

Since this is a single coordinated commit, rollback means reverting the commit:
1. `git revert <commit-hash>` to create an inverse commit that restores old paths
2. Or `git checkout <pre-migration-commit> -- records/` to restore the old records tree
3. Re-run `pnpm check` and full test suite to confirm clean state
4. Branch fresh and retry

**Important:** Old index files are deleted with `git rm` in phase 5. If regeneration fails, restore them via `git checkout <pre-migration-commit> -- records/index/` before reverting the full commit.

## Validation Log

### Session 1 — 2026-05-22
**Trigger:** `/ck:plan validate` after red-team review
**Questions asked:** 4

#### Verification Results
- Claims checked: 4 (all verified against plan recommendations)
- Verified: 4 | Failed: 0 | Unverified: 0
- Tier: Standard

#### Questions & Answers

1. **[Architecture]** The plan uses big-bang (single commit) for ~154 files + 25 tool updates. Should we switch to incremental commits?
   - Options: Single commit (Recommended) | Incremental commits | Keep single commit but stage carefully
   - **Answer:** Single commit (Recommended)
   - **Rationale:** Big-bang stays. Simpler history, no intermediate broken states. Risk managed by pre-flight validation and git revert.

2. **[Assumptions]** When renaming files, should YAML `id` fields inside the files stay the same or change to match the new filename?
   - Options: Preserve old IDs (Recommended) | Update IDs to match new filenames | Add a `legacy_id` field
   - **Answer:** Preserve old IDs (Recommended)
   - **Rationale:** `record:` refs are id-based and stay valid. Filename conventions don't need to match IDs.

3. **[Scope]** The capability-to-surface mapping table maps `fundamental` → `product`. Is this correct?
   - Options: Yes, fundamental goes to product (Recommended) | No, fundamental goes to vnstock | Create a new 'fundamental' surface
   - **Answer:** Yes, fundamental goes to product (Recommended)
   - **Rationale:** Fundamental capability is productized data, not vnstock framework knowledge.

4. **[Scope]** Phase 5 scopes ~221 broken `local:` refs as batch manual fixes. Should we write an automated migration script?
   - Options: Write an automated script (Recommended) | Manual batch editing | Defer ref repair
   - **Answer:** Write an automated script (Recommended)
   - **Rationale:** Script maps old flat paths to new surface-first paths. Faster, less error-prone, reproducible.

#### Confirmed Decisions
- Commit strategy: Single coordinated commit — user confirmed
- ID preservation: Keep existing YAML `id` fields unchanged during rename — user confirmed
- Capability mapping: `fundamental` → `product` — user confirmed
- Local ref repair: Automated script in phase 5 — user confirmed

#### Action Items
- [ ] Add automated `local:` ref migration script to phase 5

#### Impact on Phases
- Phase 5: Add script-based `local:` ref repair step
- No other phase changes needed (all answers aligned with plan)

### Whole-Plan Consistency Sweep
- Validation decisions checked against all phase files.
- No contradictions introduced.
- Plan ready for implementation.
