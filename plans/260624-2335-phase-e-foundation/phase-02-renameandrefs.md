---
phase: 2
title: "RenameAndRefs"
status: pending
priority: P2
dependencies: [1]
effort: "1.5h"
---

# Phase 2: Rename `core/legacy/` → `core/` and update all 163 references

## Overview

The mechanical rename. Move `tools/learning-loop-mastra/core/legacy/` to `tools/learning-loop-mastra/core/` using `git mv` (preserves history), then update the `core/legacy` substring across all 123 affected files (which contain ~230+ raw references across `from`, `require`, `await import`, `pathToFileURL(join(...))`, and string-literal path constructions). Test #1 from Phase 1 (no `core/legacy` references) should turn green after this phase. Test #2 (FCIS invariant) continues to pass (vacuously, since the dir was empty before; now contains 30+ files but still 0 `@mastra/*` imports).

## Requirements

- Functional: every reference to `core/legacy` in the source tree is updated to `core/`. The directory is renamed in place (no location change). Git history is preserved.
- Non-functional: the rename is atomic from git's perspective (one commit); the diff is reviewable in one sitting.

## Architecture

**The rename is in-place.** The directory `tools/learning-loop-mastra/core/legacy/` becomes `tools/learning-loop-mastra/core/`. The parent `core/` is currently empty (it contains only the `legacy/` subdir, which becomes the new contents). The shell files at `tools/learning-loop-mastra/` (`server.js`, `create-loop-*.js`, `workflows/`, `agents/`, `tools/`) are unaffected — they are at the top level, not under `core/`.

**Why git mv, not mv:** `git mv` updates the index in one operation, producing a clean rename diff in `git log --follow`. A plain `mv` would require `git add` + `git rm` to update the index, producing a delete+add diff that loses the rename detection. With 30+ files, the diff would be unreadable.

**Why one commit, not 30+ commits:** the rename is a single conceptual change. One commit = one reviewable diff = one roll-back point. Splitting per-file would create a window of broken imports (Phase 1 wrote the test that fails today; once the rename starts, the import path is inconsistent until all 163 are updated).

## Related Code Files

- Rename: `tools/learning-loop-mastra/core/legacy/` → `tools/learning-loop-mastra/core/` (30+ files moved)
- Modify: ~123 files containing the `core/legacy` substring (across all import styles)
  - 35 tool/hook/scout files (e.g., `tools/learning-loop-mastra/tools/legacy/gate-check-recurrence-tool.js:2`)
  - 60+ test files (e.g., `tools/learning-loop-mastra/__tests__/legacy-mcp/`)
  - Top-level `tools/learning-loop-mastra/create-loop-workflow.js:5` (uses `./core/legacy/...` — `./` prefix)
  - `tools/learning-loop-mastra/workflows/{workflow-intake-orient,workflow-intake-plan,workflow-self-improvement}.js` (3 workflow files using dynamic imports)
  - `.factory/hooks/loop-surface-inject.cjs:34,120,123,205` (production Droid CLI runtime hook)
  - `.claude/coordination/__tests__/claude-code-mcp-loading.test.cjs:159,211` (test fixture)
  - `.claude/coordination/hooks/README.md:84` (hook doc)
  - `AGENTS.md` (1 occurrence)
  - `tools/scripts/run-pnpm-test-namespaced.mjs` (comment-only ref)
  - `__tests__/legacy-cleanup.test.cjs:59,61,62,89` (test data that asserts OLD paths — sed updates the literals to NEW paths)
  - `records/meta/.cache/loop-describe-cold.json` (11 stale refs — DELETE the cache file; it regenerates from new paths)

**Historical files (DO NOT MODIFY):**
- `docs/journals/260624-phase-d-plan-4-cutover-shipped.md` — describes the pre-rename state; preserving the historical reference is forensic, not stale.
- `docs/journals/260624-test-migration-fix.md` — same.

**Allowed scope:** only update source code + AGENTS.md + README files that REFERENCE the path. Test #1 (no `core/legacy` references) explicitly excludes `plans/260624-2335-phase-e-foundation/` (this plan dir is the audit trail) and `__tests__/legacy-mcp/` (legacy tests are pinned per the scope report § E.3; the `legacy-mcp` directory name is intentional and unrelated to the `core/legacy/` rename).

**RED-TEAM SCOPE CORRECTION (2026-06-25):** the original plan's find scope missed critical files. The corrected scope includes:

- `tools/learning-loop-mastra/` (top level — `create-loop-workflow.js` lives here)
- `tools/learning-loop-mastra/workflows/` (NOT in the original find glob; 3 files reference `core/legacy/`)
- `tools/learning-loop-mastra/agents/` (defensive — verify no `core/legacy` refs)
- `tools/learning-loop-mastra/data/` (defensive — runtime cache may have stale refs)
- `.claude/coordination/` (test fixtures + hook README)
- `.factory/hooks/` (production runtime hook for Droid CLI; lines 34, 120, 123, 205 of `loop-surface-inject.cjs`)
- `tools/scripts/` (test runner — comment-only ref but in scope for cleanliness)

**RED-TEAM REGEX CORRECTION (2026-06-25):** the original regex `(\.\./)*core/legacy/` only matches `../core/legacy/...` — NOT `./core/legacy/...`. Verified: `create-loop-workflow.js:5` uses `import { stripMcpContentEnvelope } from "./core/legacy/envelope-stripper.js";`. The corrected regex is `(\./|\.\./)*core/legacy/` (covers both `./` and `../` prefixes).

**RED-TEAM PATTERN CORRECTION (2026-06-25):** the original grep filter `(from\s+['\"]|require\(['\"])` excludes dynamic `await import(...)` calls and `pathToFileURL(join(..., "core/legacy/..."))` constructions. Verified: 16 dynamic imports + 7+ path constructions miss the filter. The corrected approach operates on the substring `core/legacy/` directly, regardless of context — any path that contains the substring gets updated.

## Implementation Steps

1. **Run the rename.**
   ```bash
   git mv tools/learning-loop-mastra/core/legacy tools/learning-loop-mastra/core.tmp
   git mv tools/learning-loop-mastra/core.tmp tools/learning-loop-mastra/core
   ```
   - The two-step (via `.tmp`) avoids the `core/ → core/legacy/` confusion if a stale `core/` already existed (verified: it does not, but defensive).
   - Alternative (single step): `git mv tools/learning-loop-mastra/core/legacy tools/learning-loop-mastra/core` — works because the parent `core/` only contains the `legacy/` subdir.

2. **Update all import statements in source code.**
   - **CORRECTED IMPLEMENTATION (post-red-team):**
   - The sed operates on the **substring** `core/legacy/` regardless of import style. Any path that contains the substring gets updated to `core/`.
   - **Find scope (corrected):**
     ```bash
     find tools/learning-loop-mastra/ AGENTS.md .claude/ .factory/ tools/scripts/ -type f \
       \( -name '*.js' -o -name '*.cjs' -o -name '*.mjs' -o -name '*.md' \) \
       ! -path '*/plans/260624-2335-phase-e-foundation/*' \
       ! -path '*/docs/journals/260624-*' \
       2>/dev/null | xargs grep -l 'core/legacy' 2>/dev/null
     ```
   - **Sed command (corrected regex covers `./` and `../`):**
     ```bash
     # Operates on substring 'core/legacy/' directly; covers all path styles:
     #   - import { x } from '../core/legacy/...'
     #   - import { x } from './core/legacy/...'
     #   - await import('../core/legacy/...')
     #   - pathToFileURL(join(root, 'core/legacy/...'))
     #   - path.join(root, 'tools/learning-loop-mastra/core/legacy/...')
     #   - any string literal containing 'core/legacy/'
     echo "$files" | xargs sed -i 's|core/legacy/|core/|g'
     ```
   - **Why the substring approach:** the path is unambiguous in this codebase (the `legacy/` substring appears ONLY in `core/legacy/`). Any reference to `core/legacy/` should become `core/`. The substring approach catches all import styles + path constructions + string literals in one pass.

3. **Special-case: `__tests__/legacy-cleanup.test.cjs`.**
   - Verified: this test asserts the OLD paths (`./core/legacy/envelope-stripper.js`, etc.) at lines 59, 61, 62, 89.
   - The test's purpose is to lock the post-rename state — the assertions must be UPDATED to the new paths.
   - The sed in Step 2 updates the file's content (the string literals become `core/...`). Verify: after the sed, `grep "core/legacy" __tests__/legacy-cleanup.test.cjs` returns 0 matches.

4. **Special-case: `.claude/coordination/hooks/README.md`.**
   - This is a documentation file that mentions the `core/legacy/` path. The substring sed updates it to `core/`.

5. **Special-case: `tools/scripts/run-pnpm-test-namespaced.mjs`.**
   - Comment-only ref to `core/legacy/`. The substring sed updates it.

6. **Verify Test #1 turns green.**
   - `node --test tools/learning-loop-mastra/__tests__/phase-e-foundation/no-core-legacy-refs.test.js`
   - Expected: 0 references found; test passes.
   - If still > 0 references, the sed missed a file pattern. Diagnose with `grep -rln "core/legacy" tools/learning-loop-mastra/ AGENTS.md .claude/ .factory/ 2>/dev/null | grep -v plans/260624-2335-phase-e-foundation | grep -v docs/journals/260624-` and patch the sed command.

7. **Invalidate the loop-describe cold cache.**
   - `records/meta/.cache/loop-describe-cold.json` has 11 stale `evidence_code_ref` references (per red-team H3).
   - Delete the cache file: `rm records/meta/.cache/loop-describe-cold.json`.
   - The next cold-tier read regenerates it from the renamed paths.

8. **Run the full test suite to confirm no import resolution breaks.**
   - `pnpm test`
   - Expected: all tests pass. If any fail with `Cannot find module '.../core/legacy/...'`, a sed missed a path. Find and fix.
   - **Specific tests to watch:** `__tests__/legacy-mcp/runtime-agnostic.test.js` (uses dynamic imports of `core/legacy/`), `__tests__/legacy-cleanup.test.cjs` (asserts old paths in test data — must be updated by the sed).

9. **Commit.**
   - One commit: `refactor(phase-e): rename core/legacy/ to core/ + update ~123 import-bearing files (substring sed)`
   - Body: `Mechanical rename. Substring sed catches all path styles (./ ../ await import pathToFileURL). Test #1 (no core/legacy references) now passes. All tests green. Plan: plans/260624-2335-phase-e-foundation/`
   - NO meta-state mutations in this commit (fingerprint refresh is Phase 6).

## Success Criteria

- [ ] `git mv` preserves history (verified: `git log --follow tools/learning-loop-mastra/core/meta-state.js` shows the original commits)
- [ ] `grep -r "core/legacy" tools/learning-loop-mastra/ AGENTS.md .claude/ .factory/ 2>/dev/null | grep -v "plans/260624-2335-phase-e-foundation" | grep -v "docs/journals/260624-" | wc -l` returns 0
- [ ] Test #1 (no `core/legacy` references) passes
- [ ] All existing tests still pass (1189+, exact count per `pnpm test`)
- [ ] `records/meta/.cache/loop-describe-cold.json` is invalidated
- [ ] No production code is changed beyond the rename + import updates (no logic edits)

## Risk Assessment

- **R1 (sed breaks a path with `core/legacy` substring that should stay):** the `core/legacy` substring appears in:
  - The renamed dir itself (handled by excluding the `core/legacy/*` path)
  - This plan dir (handled by excluding `plans/260624-2335-phase-e-foundation/`)
  - Historical journals (handled by excluding `docs/journals/260624-*.md`)
  - The `legacy-mcp` test dir name (handled by NOT excluding it — the path pattern `*/core/legacy/*` is the exclusion, not `*/legacy/*`)
  - **Verification step:** after the sed, `grep -rn "core/legacy" tools/ AGENTS.md docs/ 2>/dev/null | grep -v plans/260624-2335-phase-e-foundation | grep -v 'docs/journals/260624-'` must return 0 lines.

- **R2 (import path depth breaks):** the regex preserves `../` depth, but a file like `tools/learning-loop-mastra/tools/legacy/foo.js` imports from `../../core/legacy/meta-state.js`. After the sed, the import becomes `../../core/meta-state.js`. Verified by reading the regex. If a file uses a non-relative path (e.g., absolute or aliased), the regex misses it. Mitigation: the baseline manifest from Phase 1 includes the exact set of files; cross-check after the sed.

- **R3 (some test files use `legacy-mcp` as a substring and DO contain `core/legacy` references):** the `__tests__/legacy-mcp/` dir has many files that import from `../../core/legacy/...`. The path-pattern exclusion `*/legacy-mcp/*` is WRONG — these files DO need updating. **Correction:** the exclusion is `*/legacy-mcp/<file>` AND the file does NOT match `core/legacy` (refined sed above uses the `grep -lE "(from|require).*core/legacy"` filter, which is more precise).

- **R4 (git mv fails on Windows-style line endings or case-insensitive filesystems):** not applicable — Linux only, per the project's WSL2 environment. Verified: `git config core.ignorecase` is `false`.

## Test Output Reference (expected green state, post-Phase 2)

```text
$ node --test tools/learning-loop-mastra/__tests__/phase-e-foundation/no-core-legacy-refs.test.js
# Subtest: no core/legacy references in source tree
# Expected: 0
# Actual: 0
ok 1 - no core/legacy references in source tree
```
