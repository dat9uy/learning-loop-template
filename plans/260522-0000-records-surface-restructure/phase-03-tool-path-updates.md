---
phase: 3
title: "Tool Path Updates"
status: pending
priority: P1
effort: "45m"
dependencies: [2]
---

# Phase 3: Tool Path Updates

## Overview

Update all tools that walk or write to `records/` directories to support surface-first paths. Tools are updated to nested-walk mode but must handle the current flat structure gracefully during phase 3, or be updated in the same commit as file moves (phase 4).

## Requirements

- Functional: `record-loader.js` walks `records/<surface>/<artifact_type>/` and skips non-surface dirs.
- Functional: `extract-index.js` reads evidence from `records/*/evidence/`, experiments from `records/*/experiments/`. **Deferred:** index output path update moves to phase 4.
- Functional: `list-verified.js`, `search-index.js`, `claim-verification.js` walk surface-first paths.
- Non-functional: `check-budget.js` unchanged (observations stay flat).
- Non-functional: `generate-capabilities.js` update deferred to phase 4 (same commit as file moves) to avoid `--dry-run` breaking `pnpm check`.

## Architecture

Surface discovery must exclude non-surface directories: `observations`, `backlog-items`, `validation-gates`, and artifact-type dirs (`claims`, `experiments`, etc.) when still flat.

Preferred approach: **dual-mode detection** — check if `records/<dir>/` contains subdirectories (surface-first) or `.yaml` files directly (flat). Walk accordingly.

## Related Code Files

- Modify: `tools/validate-records/record-loader.js` — nested walk with dual-mode or placeholder exclusion
- Modify: `tools/validate-records/validate-records.js` — update error strings mentioning flat paths
- Modify: `tools/validate-records/record-validation-rules.js` — update `default: ["records/evidence"]` to `["records/*/evidence"]`
- Modify: `tools/extract-index/extract-index.js` — walk `records/*/evidence`, `records/*/experiments`
- Modify: `tools/extract-index/file-writer.js` — add surface derivation logic; keep writing to flat `records/index/` until phase 4
- Modify: `tools/list-verified/list-verified.js` — walk `records/*/claims` and `records/*/evidence`
- Modify: `tools/search-index/search-index.js` — walk `records/*/index`
- Modify: `tools/claim-verification/verify-claim.js` — walk `records/*/claims`
- Modify: `tools/constraint-gate/tools/workflow-intake-orient-tool.js` — walk surface-first paths for index, capabilities, evidence, decisions
- Modify: `tools/constraint-gate/tools/workflow-generate-prompt-tool.js` — return surface-first paths in `requiredRecords`
- Modify: `tools/constraint-gate/tools/workflow-verify-evidence-tool.test.js` — update hardcoded paths
- Modify: `tools/constraint-gate/tools/agent-lifecycle-integration.test.js` — update hardcoded paths
- Modify: `tools/constraint-gate/tools/workflow-convert-evidence-tool.test.js` — update hardcoded paths
- Modify: `tools/validate-records/validate-records.test.js` — update test expectations
- Modify: `tools/extract-index/extract-index.test.js` — update test expectations
- Read (verify): `tools/check-budget/check-budget.js` — confirm no changes needed

## Implementation Steps

1. **Update `record-loader.js`**:
   - Implement **dual-mode detection**: check if `records/` subdirs contain `.yaml` files directly (flat) or subdirectories (surface-first).
   - In flat mode: walk existing flat artifact_type dirs (`claims`, `experiments`, etc.).
   - In surface-first mode: discover surfaces, walk `records/<surface>/<artifact_type>/`.
   - Exclude: `observations`, `backlog-items`, `validation-gates`.

2. **Update `extract-index.js`**:
   - `buildExperimentMap`: walk `records/*/experiments/` using surface discovery.
   - `walkEvidenceFiles`: walk each surface's `evidence/` dir under `records/`.
   - `loadExistingIndexEntries`: keep walking flat `records/index/` until phase 4. After phase 4, walk `records/*/index/`.
   - **Do NOT** change `file-writer.js` output path yet — keep writing to `records/index/` until phase 4 to avoid orphaning entries.

3. **Update `file-writer.js` (surface derivation prep)**:
   - Add a `surface` parameter or derive from `entry.capability` using mapping table:
     ```
     vnstock-data → vnstock
     fundamental  → product
     fastapi-*    → fastapi
     tanstack-*   → tanstack
     meta-*       → meta
     ```
   - Keep default output dir as `records/index/` for now; switch to `records/<surface>/index/` in phase 4.

4. **Update `list-verified.js`**:
   - Change `claimsDir` from `join(root, "records", "claims")` to surface-first walk.
   - Change `evidenceDir` from `join(root, "records", "evidence")` to surface-first walk.
   - Implement surface discovery and nested walk.

5. **Update `search-index.js`**:
   - Change `indexDir` from `join(root, "records", "index")` to walk `records/*/index/`.
   - Implement surface discovery.

6. **Update `workflow-intake-orient-tool.js`**:
   - Change `loadYamlDir(root, "records/index")` to `records/*/index/`.
   - Change `loadYamlDir(root, "records/capabilities")` to `records/*/capabilities/`.
   - Change `resolve(root, "records/evidence/meta")` to `records/meta/evidence/`.
   - Change `readdir(resolve(root, "records/decisions"))` to surface-first walk.

7. **Update remaining tools and tests**:
   - `verify-claim.js`: walk `records/*/claims/`.
   - All constraint-gate test files: update hardcoded flat paths to surface-first.

## Tests Before

- Read existing tool tests. Note which tests assert on specific record paths.

## Refactor

- Path traversal logic in all record-reading tools.
- Surface derivation logic in file-writer.js.

## Tests After

- Run tool test suites.
- Note: `pnpm check` may still pass because `generate:capabilities` is NOT updated yet.
- `pnpm extract:index` must produce same output on current flat structure (dual-mode must detect flat layout).

## Success Criteria

- [ ] `record-loader.js` loads records from flat structure and can detect surface-first layout
- [ ] `extract-index.js` walks evidence and experiments correctly on current flat structure
- [ ] `list-verified.js` walks claims and evidence correctly
- [ ] `search-index.js` walks index correctly
- [ ] `workflow-intake-orient-tool.js` walks all record types correctly
- [ ] All tool tests pass
- [ ] `generate-capabilities.js` intentionally NOT updated yet (deferred to phase 4)

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Dual-mode detection fails on mixed layout | Ensure detection checks for `.yaml` files vs subdirs, not just directory count |
| `file-writer.js` surface mapping incomplete | Add explicit mapping table; handle unknown capabilities gracefully |
| Placeholder dirs discovered as surfaces | Explicitly exclude `backlog-items` and `validation-gates` |

## Regression Gate

```bash
pnpm validate:records && pnpm extract:index && npm test -- tools/
```

Note: `pnpm check` is NOT run here because `generate:capabilities --dry-run` is deferred to phase 4.
