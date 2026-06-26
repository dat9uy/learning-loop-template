---
phase: 3
title: "E.4 — Delete core/schema-descriptions.yaml (orphaned dead code)"
status: pending
priority: P2
dependencies: []
---

# Phase 3: E.4 — Schema rot cleanup (delete orphaned schema-descriptions.yaml)

## Overview

Delete `tools/learning-loop-mastra/core/schema-descriptions.yaml`. The scout verified it has zero live importers in the current mastra tree (the file's header comment falsely references `tools/learning-loop-mcp/core/schema-descriptions.yaml` and a `schema-description-loader.js` that no longer exist — the `tools/learning-loop-mcp/` tree was removed in plan 260613). The scope report offered "delete OR rewrite"; per D2, delete is the cleaner choice because:
1. Zero live importers (scout verified)
2. The header comment is stale (claims a sibling location that doesn't exist)
3. Rewrite would mean authoring a new 64-line YAML with no consumer — pointless without first shipping a new loader

**Risk:** Very Low — single file deletion; no live consumer to break; `pnpm test` is the safety net.

## Requirements

- Functional: `tools/learning-loop-mastra/core/schema-descriptions.yaml` does not exist after Phase 3
- Non-functional:
  1. No live importer breaks (scout verified; `pnpm test` is the gate)
  2. `grep -rn "schema-descriptions" tools/learning-loop-mastra/` returns 0 matches outside `docs/journals/` (historical refs OK)
  3. `tools/learning-loop-mastra/docs/schemas.md` (the authoritative schema doc shipped in Plan 1) is unchanged
- TDD gate: `pnpm test` GREEN after deletion; `ls schema-descriptions.yaml` returns ENOENT

## Architecture

The scope report's E.4 ("Schema rot cleanup") framed this as "delete OR rewrite to reference the 4 meta-state kinds." The choice depends on whether the file is actively consumed:

| File state | Action |
|------------|--------|
| Actively consumed (loader exists, tests reference it) | Rewrite to reference the 4 meta-state kinds |
| Orphaned dead code (no loader, no consumers) | **Delete** (this plan) |
| Future need (e.g., new schema-authoring flow) | Add a new file + loader from scratch; do NOT keep the old file |

Scout verification confirmed the second state. The deletion closes a 64-line dead-code file + its stale header comment. The authoritative schema documentation lives at `tools/learning-loop-mastra/docs/schemas.md` (shipped in Plan 1).

## Related Code Files

- Delete: `tools/learning-loop-mastra/core/schema-descriptions.yaml` (64 lines)
- No file creation
- No file modification

## File Inventory (deep mode)

| File | Operation | Lines affected | Notes |
|------|-----------|----------------|-------|
| `tools/learning-loop-mastra/core/schema-descriptions.yaml` | Delete | -64 lines net | Confirmed dead code by scout |

## Test Scenario Matrix (deep mode)

| # | Scenario | Expected | Verification |
|---|----------|----------|--------------|
| 1 | `ls tools/learning-loop-mastra/core/schema-descriptions.yaml` returns ENOENT | After phase 3 | File deleted |
| 2 | `grep -rn "schema-descriptions" tools/learning-loop-mastra/` returns 0 matches outside `docs/journals/` | After phase 3 | No live references |
| 3 | `pnpm test` GREEN | After phase 3 | No regression |
| 4 | `git diff --stat HEAD` shows `tools/learning-loop-mastra/core/schema-descriptions.yaml \| 64 ---------` (deletion only) | After phase 3 | Diff scope clean |
| 5 | `node tools/learning-loop-mastra/interface/contract.js claude-code` still returns `{ok: true}` | After phase 3 | Contract unaffected |
| 6 | `cat tools/learning-loop-mastra/docs/schemas.md \| head -5` shows the Plan-1-shipped authoritative doc is unchanged | After phase 3 | Authoritative doc intact |

## Function/Interface Checklist (deep mode)

- [ ] `git log -- tools/learning-loop-mastra/core/schema-descriptions.yaml` reviewed for prior context (informational only — no rollback needed)
- [ ] `git rm` used (NOT `rm` + `git add`) to preserve deletion history

## Dependency Map (deep mode)

**Depends on:**
- Plan 1 (DONE) — renamed `core/legacy/` → `core/`; this deletion happens in the post-rename `core/`
- Plan 6 (DONE) — moved the shell code; this deletion is in `core/` which is unaffected by Plan 6

**Does not depend on:**
- Phase 1/2/4/5 of this plan — E.4 ships independently
- Plan 2 (interface spec) — orthogonal
- Plan 5 (hardening) — parallel

**Does not block:**
- Anything (E.4 closes dead code; nothing depended on the file)

## Implementation Steps

### Step 1: Final pre-deletion audit (grep for live consumers)

```bash
cd /home/datguy/codingProjects/learning-loop-template

# Search for live importers in the mastra tree
grep -rn "schema-descriptions" tools/learning-loop-mastra/ \
  --exclude-dir=journals 2>/dev/null
# Expected: 0 matches (scout verified)

# Confirm no test imports the file
grep -rn "schema-descriptions" tools/learning-loop-mastra/__tests__/ 2>/dev/null
# Expected: 0 matches

# Confirm no loader module references it
grep -rn "loadDescriptions\|schema_description" tools/learning-loop-mastra/ \
  --exclude-dir=journals 2>/dev/null
# Expected: 0 matches (scout verified — tools/learning-loop-mcp/ tree was removed in plan 260613)
```

**If any of the above returns a non-zero count:** STOP and investigate. The file may have a consumer I missed. Revert D2 (delete) and choose rewrite instead.

### Step 2: Delete the file via `git rm`

```bash
cd /home/datguy/codingProjects/learning-loop-template

git rm tools/learning-loop-mastra/core/schema-descriptions.yaml
# Expected: rm 'tools/learning-loop-mastra/core/schema-descriptions.yaml'
```

**Why `git rm` (not `rm` + `git add`):** preserves deletion history; `git log --follow` works correctly; review tooling shows the deletion as a single op.

### Step 3: Verify deletion

```bash
ls tools/learning-loop-mastra/core/schema-descriptions.yaml 2>&1
# Expected: ls: cannot access 'tools/learning-loop-mastra/core/schema-descriptions.yaml': No such file or directory

git status --short
# Expected: D tools/learning-loop-mastra/core/schema-descriptions.yaml
```

### Step 4: Run `pnpm test` (expect GREEN)

```bash
pnpm test 2>&1 | tail -15
# Expected: all 13 namespaces GREEN
```

**If any test fails:** STOP. The test references the file (which would mean scout missed a consumer). Revert via `git checkout HEAD -- tools/learning-loop-mastra/core/schema-descriptions.yaml` and choose rewrite instead.

### Step 5: Diff scope check

```bash
git diff --stat HEAD
# Expected: tools/learning-loop-mastra/core/schema-descriptions.yaml | 64 ---------
# (deletion only; 64 lines removed; no other changes)
```

### Step 6: Confirm the authoritative doc is intact

```bash
head -5 tools/learning-loop-mastra/docs/schemas.md
# Expected: shows the Plan-1-shipped schema doc header (unchanged)
```

## Success Criteria

- [ ] Step 1 final audit returns 0 matches in live tree (excluding `docs/journals/`)
- [ ] Step 2 `git rm` succeeds; file deleted
- [ ] Step 3 verification: `ls` returns ENOENT; `git status` shows `D` (deletion)
- [ ] Step 4 `pnpm test` GREEN (no regression)
- [ ] Step 5 diff scope clean (only the 64-line deletion)
- [ ] Step 6 authoritative doc `docs/schemas.md` unchanged

## Risk Assessment

- **R-Phase3-A:** Hidden consumer breaks (e.g., a test imports the file directly). **Mitigation:** Step 1 final audit + Step 4 `pnpm test` GREEN gate. If a test fails, revert via `git checkout` and re-scope.
- **R-Phase3-B:** The header comment's claim about `tools/learning-loop-mcp/` location was actually true at some prior time and the loader still exists somewhere I missed. **Mitigation:** Scout verified `tools/learning-loop-mcp/` directory does NOT exist on disk; the tree was removed in plan 260613 (per `meta-state.jsonl` change-log at line 102). If scout missed a consumer, `pnpm test` will catch it.
- **R-Phase3-C:** A future operator wants to add a schema-description loader for the 4 record-type tools and finds the file is gone. **Mitigation:** The authoritative schema doc is at `docs/schemas.md` (Plan 1). A future loader can be added from scratch; deleting the old file does not prevent this. Document the deletion in the journal entry so future readers know why the file is gone.
- **R-Phase3-D:** `git rm` accidentally removes the wrong file. **Mitigation:** The path is fully-qualified and unique; scout verified it's a leaf file with no consumers. If accidental, `git reset HEAD~1` recovers it (assuming not yet committed).