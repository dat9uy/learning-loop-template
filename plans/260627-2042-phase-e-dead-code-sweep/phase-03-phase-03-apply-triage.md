---
phase: 3
title: "phase-03-apply-triage"
status: pending
priority: P2
dependencies: ["phase-02-phase-02-baseline-scan"]
effort: "0.25 day"
---

# Phase 3: Apply Triage

## Overview
Walk `tasks.md` row by row. Delete the 4 confirmed TEST-ONLY files (2 source + 2 test). Update `core/placement.yaml` and `docs/placement.md` to drop the deleted entries. Mark rows ☑ as they resolve.

## Requirements
- **Functional:** all ☐ rows in `tasks.md` are resolved (☑ deleted / ☑ verified-LIVE / ⚠ escalated); `core/placement.yaml` no longer references `list-probes`; `docs/placement.md` no longer references `list-probes` in the `helper` row or anywhere else.
- **Non-functional:** no test failures; `git diff --stat` shows exactly 4 file deletions + 2 manifest/placement edits; fallow `unused-files` count drops by ≥ 2.

## Architecture

Per `reports/researcher-260627-codebase-audit.md` §5, the high-confidence deletions are:

```
core/list-probes.js                         ← TEST-ONLY (0 prod consumers)
__tests__/legacy-mcp/list-probes.test.js    ← TEST-ONLY (test of above)
core/lib/source-ref-validator.js            ← TEST-ONLY (0 prod consumers)
core/lib/source-ref-validator.test.js       ← TEST-ONLY (test of above)
```

No file moves to `_archive/` — operator decided (per brainstorm §5 Phase 2.5) that migration-era code with no production consumer goes directly to delete, not archive.

## Related Code Files
- Delete: `tools/learning-loop-mastra/core/list-probes.js`
- Delete: `tools/learning-loop-mastra/__tests__/legacy-mcp/list-probes.test.js`
- Delete: `tools/learning-loop-mastra/core/lib/source-ref-validator.js`
- Delete: `tools/learning-loop-mastra/core/lib/source-ref-validator.test.js`
- Modify: `tools/learning-loop-mastra/core/placement.yaml` (drop `list-probes` row)
- Modify: `tools/learning-loop-mastra/docs/placement.md` (drop `list-probes` from `helper` row)

## Implementation Steps

### Step 1 — Re-verify the static-audit conclusions
```bash
cd tools/learning-loop-mastra
rg "from ['\"].*core/list-probes\.js['\"]" --type js | grep -v __tests__/legacy-mcp
rg "from ['\"].*core/lib/source-ref-validator\.js['\"]" --type js | grep -v __tests__/legacy-mcp | grep -v "core/lib/source-ref-validator.test.js"
```

Both commands MUST return zero matches outside of the test files. If any production import appears, STOP and reclassify as LIVE — the deletion is unsafe.

### Step 1.5 — Verify Mechanism A's FCIS invariant test

The Mechanism A plan (`260627-1304-phase-e-topology-mechanism-a-b`) added `__tests__/phase-e-foundation/fcis-invariant.test.js`, which walks `core/` recursively and asserts zero `@mastra/*` imports. Deleting 2 core files changes the file tree the test enumerates; the test should still pass (it doesn't enumerate by name, just by import content), but we verify:

```bash
cd tools/learning-loop-mastra
node --test __tests__/phase-e-foundation/fcis-invariant.test.js
```

Expected: green. If red, STOP and investigate — a deletion should never break the FCIS invariant (the invariant is about import content, not file count).

Also run the sibling placement-manifest test:
```bash
node --test __tests__/phase-e-foundation/placement-manifest.test.js
```

Expected: green. Step 3 (placement.yaml update) keeps this test green by removing the `list-probes` row at the same time the file is deleted.

Record the before-state test counts in `tasks.md` (one line per test) for Phase 5 delta computation.

### Step 2 — Delete the 4 files
```bash
cd tools/learning-loop-mastra
rm core/list-probes.js
rm __tests__/legacy-mcp/list-probes.test.js
rm core/lib/source-ref-validator.js
rm core/lib/source-ref-validator.test.js
```

Verify with `git status` — expect exactly 4 deletions.

### Step 3 — Update `core/placement.yaml`
Read the current file. Remove the `list-probes.js` entry (per `researcher-260627-codebase-audit.md` §5: rows 96-98).

The `source-ref-validator.js` entry does NOT need to be removed — the static auditor confirmed it was never in the manifest. Verify with:
```bash
rg "source-ref-validator" core/placement.yaml
```
Expected: zero matches.

### Step 4 — Update `docs/placement.md`
Remove `list-probes.js` from the `helper` row in the role-taxonomy table (§3.2 of the parent brainstorm). If `source-ref-validator.js` is mentioned anywhere, also remove it (per the static audit it shouldn't be, but verify).

```bash
rg "list-probes" docs/placement.md
rg "source-ref-validator" docs/placement.md
```

Both should return zero matches after edits.

### Step 5 — Update `tasks.md` rows to ☑

Mark rows 1-4 as resolved:
```markdown
| 1 | `core/list-probes.js` | TEST-ONLY | ☑ agreed | Deleted | placement.yaml:96-98 dropped; docs/placement.md "helper" row updated | ☑ |
| 2 | `__tests__/legacy-mcp/list-probes.test.js` | TEST-ONLY | ☑ auto | Deleted with #1 | none | ☑ |
| 3 | `core/lib/source-ref-validator.js` | TEST-ONLY | ☑ agreed | Deleted | none (not in manifest) | ☑ |
| 4 | `core/lib/source-ref-validator.test.js` | TEST-ONLY | ☑ auto | Deleted with #3 | none | ☑ |
```

For rows 5-6 (`core/surfaces.js`, `core/read-registry-cache.js` — LIVE-with-verification), run the verification grep:
```bash
rg "from ['\"].*core/surfaces\.js['\"]" --type js
rg "from ['\"].*core/read-registry-cache\.js['\"]" --type js
```
If either shows only `core/meta-state.js` callers, mark ☑ verified-LIVE. If anything is missing, mark ⚠ disputed and STOP.

### Step 6 — Run fallow unused-files delta check
```bash
cd tools/learning-loop-mastra
fallow dead-code \
  --root . \
  --unused-files \
  --format compact \
  -o ../plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/unused-files-post-deletion.txt \
  --quiet
```

Open the file and confirm the count dropped by ≥ 2 compared to `unused-files.txt` from Phase 2.

### Step 7 — Run full test suite
```bash
cd tools/learning-loop-mastra
pnpm test
```

All tests must pass. The baseline count is the "baseline" placeholder from the parent phase-e plan (Phase-0 measurement). Compute the delta against the captured-before counts from `tasks.md`. Expected delta:
- `__tests__/legacy-mcp/list-probes.test.js`: −3 tests
- `core/lib/source-ref-validator.test.js`: −24 tests (sibling test discovered by the namespaced runner per Phase 1 step 2.5)

If any test fails, the deletion is unsafe — revert with the 4 explicit filenames (not a `git checkout .` which is too broad):

```bash
git checkout HEAD -- core/list-probes.js \
  __tests__/legacy-mcp/list-probes.test.js \
  core/lib/source-ref-validator.js \
  core/lib/source-ref-validator.test.js
```

## Success Criteria
- [ ] 4 files deleted (verified by `git status`)
- [ ] `rg "list-probes"` returns zero matches in `core/`, `__tests__/legacy-mcp/`, `docs/`, `tools/`
- [ ] `rg "source-ref-validator"` returns zero matches in `core/` (other than potentially `core/lib/` itself if other validators remain)
- [ ] `core/placement.yaml` no longer enumerates `list-probes.js`
- [ ] `docs/placement.md` no longer references `list-probes` in the `helper` row
- [ ] `tasks.md` rows 1-4 marked ☑; rows 5-6 either ☑ verified-LIVE or ⚠ disputed-and-stopped
- [ ] `unused-files.txt` count dropped by ≥ 2
- [ ] Full test suite passes
- [ ] Fallback prepared: if `pnpm test` fails, the 4 deletions revert with one `git checkout` command

## Risk Assessment
- **R1 — A test still imports `list-probes` or `source-ref-validator` outside the expected files.** Mitigation: Step 1 grep MUST return zero non-test matches before deletion. If it doesn't, abort.
- **R2 — `core/placement.yaml` references a file beyond `list-probes` that's affected.** Mitigation: open the file before editing; only modify the `list-probes` row.
- **R3 — Test count regression.** Mitigation: Step 7 must show green before closing the phase. If regression, `git checkout` reverts the 4 deletions in one command.
- **R4 — `tasks.md` row 5 or 6 (LIVE-with-verification) actually IS dead and fallow flagged it.** Mitigation: the ⚠ disputed status pauses the phase; Phase 5 verification will catch it.