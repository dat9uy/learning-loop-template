---
phase: 4
title: "File Migration (git mv)"
status: pending
priority: P1
effort: "30m"
dependencies: [3]
---

# Phase 4: File Migration (git mv)

## Overview

Execute the actual file moves in a single commit. All ~154 files are moved using `git mv` to preserve history. Files are renamed to the new naming convention where needed. Hook path checks and `generate-capabilities.js` are updated in this SAME commit to avoid a migration window where old flat paths bypass gates or break `--dry-run`.

## Requirements

- Functional: All 58 evidence files move to `records/<surface>/evidence/`.
- Functional: All 23 decisions, 22 experiments, 3 risks, 4 capabilities, 10 claims, 25 index files move to their surface dirs.
- Functional: Subdirectories under evidence (`unified-ui-snapshot/`, `operator-shape-walkthrough/`) are preserved.
- Functional: Empty `backlog-items/` and `validation-gates/` already deleted in phase 1.
- Functional: YAML `id` fields are **preserved** when renaming files — do not change IDs.

## Related Code Files

- Create: `records/meta/`, `records/vnstock/`, `records/fastapi/`, `records/tanstack/`, `records/product/` surface roots
- Create: `records/<surface>/evidence/`, `decisions/`, `experiments/`, `claims/`, `risks/`, `index/`, `capabilities/` per surface
- Modify: `.claude/coordination/hooks/write-coordination-gate.cjs` — update `globMatch` calls for evidence, index, capabilities (same commit)
- Modify: `.claude/coordination/hooks/bash-coordination-gate.cjs` — update `recordsPath.startsWith` checks for evidence (same commit)
- Modify: `tools/generate-capabilities/generate-capabilities.js` — update `outDir` to surface-first (same commit)
- Modify: `tools/extract-index/file-writer.js` — switch output to `records/<surface>/index/` (same commit)
- Move/Rename: all ~154 files per mapping table in brainstorm report

## Implementation Steps

1. **Pre-flight inventory**:
   ```bash
   find records -type f -not -name '.gitkeep' | sort > /tmp/pre-migration-manifest.txt
   wc -l /tmp/pre-migration-manifest.txt
   ```

2. **Create surface directories**:
   ```bash
   for surface in meta vnstock fastapi tanstack product; do
     for dir in evidence decisions experiments claims risks index capabilities; do
       mkdir -p records/$surface/$dir
     done
   done
   ```

3. **Move evidence files (preserve subdirectories)**:
   - `records/evidence/meta/*` → `records/meta/evidence/`
   - `records/evidence/loop/*` → `records/meta/evidence/` (loop merges to meta)
   - `records/evidence/product-build/fastapi-reference-endpoints.md` → `records/fastapi/evidence/`
   - `records/evidence/product-build/tanstack-reference-render.md` → `records/tanstack/evidence/`
   - `records/evidence/product/*` → `records/product/evidence/`
   - `records/evidence/vnstock-data/*` → `records/vnstock/evidence/` (rename dir to vnstock)

4. **Move YAML artifact files per surface mapping table**.

5. **Rename files to new convention where surface prefix is missing**:
   - `decision-260512T1316Z-knowledge-pack-retirement.yaml` → `decision-meta-260512T1316Z-knowledge-pack-retirement.yaml`
   - `experiment-product-build-fastapi-reference-20260511T003000Z.yaml` → `experiment-fastapi-20260511T003000Z-reference.yaml`
   - `experiment-loop-capabilities-stack-allowlist-20260510T160000Z.yaml` → `experiment-meta-capabilities-stack-allowlist-20260510T160000Z.yaml`
   - `risk-20260508-loop-dimension-model-transition.yaml` → `risk-meta-20260508-loop-dimension-model-transition.yaml`
   - **Preserve YAML `id` field** — do not change it even if filename changes.

6. **Update hook path checks (same commit)**:
   - `write-coordination-gate.cjs`: `globMatch('records/evidence/**', ...)` → `globMatch('records/*/evidence/**', ...)`
   - `bash-coordination-gate.cjs`: `recordsPath.startsWith('records/evidence/')` → `recordsPath.match(/^records\/[^/]+\/evidence\//)`

7. **Update `generate-capabilities.js` (same commit)**:
   - Change `outDir` from `records/capabilities` to surface-specific paths.

8. **Update `file-writer.js` (same commit)**:
   - Switch default output from `records/index/` to `records/<surface>/index/`.

9. **Remove old flat artifact_type directories** (now empty):
   ```bash
   git rm -r records/claims/ records/decisions/ records/experiments/ records/risks/ records/index/ records/capabilities/
   # evidence dir has subdirs, handle separately
   git rm -r records/evidence/meta records/evidence/loop records/evidence/product-build records/evidence/product records/evidence/vnstock-data
   rmdir records/evidence/ records/product-build/ 2>/dev/null || true
   ```

10. **Stage and verify**:
    ```bash
    git add -A
    git status
    ```

## Tests Before

- Phase 1 baseline is the pre-migration test. No new tests written here.

## Refactor

- File moves and renames.
- Hook path checks updated in same commit.
- `generate-capabilities.js` and `file-writer.js` updated in same commit.

## Tests After

- `git status` shows expected renames (no untracked files from moves).
- All ~154 files accounted for in new locations.
- No files remain in old flat artifact_type dirs.

## Success Criteria

- [ ] All 58 evidence files in `records/<surface>/evidence/`
- [ ] All 23 decisions in `records/<surface>/decisions/`
- [ ] All 22 experiments in `records/<surface>/experiments/`
- [ ] All 3 risks in `records/<surface>/risks/`
- [ ] All 4 capabilities in `records/<surface>/capabilities/`
- [ ] All 10 claims in `records/<surface>/claims/`
- [ ] All 25 index files moved (will be deleted in phase 5)
- [ ] No files remain in old flat artifact_type dirs
- [ ] YAML `id` fields unchanged on renamed files
- [ ] Hook path checks updated in same commit
- [ ] `generate-capabilities.js` updated in same commit
- [ ] Subdirectories preserved under evidence

## Risk Assessment

| Risk | Mitigation |
|---|---|
| File move misses files | Pre-flight `find` inventory; post-flight `find` count verification |
| Git doesn't track moves as renames | Use `git mv` individually; check `git status` |
| Wrong surface assignment | Follow mapping table from brainstorm report |
| `record:` refs break | Preserve YAML `id` fields; filename changes don't affect `record:` refs |

## Rollback Note

This phase + its code updates are committed together. If phases 5-7 fail, the entire commit is reverted via `git revert`.
