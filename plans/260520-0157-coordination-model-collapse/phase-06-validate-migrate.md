---
phase: 6
title: "Validate & Unblock"
status: completed
priority: P1
effort: "2h"
dependencies: [5]
---

# Phase 6: Validate & Unblock

## Overview

Run the full validation suite: all hook tests, MCP server tests, record validation, and smoke tests. Update the blocked plan to reflect the fix. Write a resolution journal entry.

## Requirements

- Functional: All tests pass.
- Functional: `pnpm validate:records` passes.
- Functional: `pnpm check` passes (or failures are understood and documented).
- Functional: Smoke test confirms `docs/**` writes are allowed and `records/observations/**` writes are blocked.
- Functional: The docs canonicalization plan (`260519-2326-docs-canonicalization-machine-extracted-index`) is unblocked.

## Related Code Files

- Run: `for f in .claude/coordination/__tests__/*.test.cjs; do node "$f"; done`
- Run: `cd tools/constraint-gate && pnpm test`
- Run: `pnpm validate:records`
- Run: `pnpm check`
- Modify: `plans/260519-2326-docs-canonicalization-machine-extracted-index/plan.md` — remove `blockedBy` reference
- Create: `docs/journals/260520-coordination-model-collapse-resolution.md`

## Implementation Steps

1. **Run all hook tests.**
   ```bash
   for f in .claude/coordination/__tests__/*.test.cjs; do
     echo "=== $f ==="
     node "$f" || exit 1
   done
   ```

2. **Run MCP server tests.**
   - `cd tools/constraint-gate && pnpm test`

3. **Run record validation.**
   - `pnpm validate:records`
   - Fix any validation failures caused by deleted files in source_refs.

4. **Run project check.**
   - `pnpm check`
   - Address any failures.

5. **Smoke test: docs-only work allowed.**
   - Invoke write gate directly:
     ```bash
     echo '{"tool_name":"Write","tool_input":{"file_path":"docs/journals/.tmp-smoke-test.md"}}' | node .claude/coordination/hooks/write-coordination-gate.cjs
     echo "Exit code: $?"
     ```
   - Verify exit code is 0.

6. **Smoke test: observations blocked.**
   - Invoke write gate directly:
     ```bash
     echo '{"tool_name":"Write","tool_input":{"file_path":"records/observations/.tmp-smoke-test.yaml"}}' | node .claude/coordination/hooks/write-coordination-gate.cjs
     echo "Exit code: $?"
     ```
   - Verify exit code is 2.

7. **Smoke test: schemas blocked.**
   - Invoke write gate directly:
     ```bash
     echo '{"tool_name":"Write","tool_input":{"file_path":"schemas/.tmp-smoke-test.json"}}' | node .claude/coordination/hooks/write-coordination-gate.cjs
     echo "Exit code: $?"
     ```
   - Verify exit code is 2.

8. **Update the blocked plan.**
   - Read `plans/260519-2326-docs-canonicalization-machine-extracted-index/plan.md`.
   - Remove `260520-0157-coordination-model-collapse` from `blockedBy`.
   - Update the dependency note to say the coordination fix is complete.

9. **Write resolution journal entry.**
   - Create `docs/journals/260520-coordination-model-collapse-resolution.md`.
   - Document: what was deleted, what was preserved, why the collapse was necessary, the red team findings that shaped the final design, and the outcome.

10. **Run git diff review.**
    - `git diff --stat`
    - Verify the diff only touches coordination system files and docs.
    - No product code changes.

## Success Criteria

- [x] All hook tests pass.
- [x] MCP server tests pass.
- [x] `pnpm validate:records` passes.
- [x] `pnpm check` passes.
- [x] Smoke test confirms `docs/**` writes are allowed (exit 0).
- [x] Smoke test confirms `records/observations/**` writes are blocked (exit 2).
- [x] Smoke test confirms `schemas/**` writes are blocked (exit 2).
- [x] Docs canonicalization plan has no `blockedBy` reference to this plan.
- [x] Resolution journal entry exists.
- [x] Git diff shows only expected files changed.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `pnpm validate:records` fails due to deleted files in source_refs | Low | Medium | Fix source_refs in affected records to remove references to deleted files. |
| Smoke test not representative of actual hook behavior | Low | Low | Run test via actual hook invocation (spawnSync with stdin). |

## Next Steps

- The docs canonicalization plan (`260519-2326-docs-canonicalization-machine-extracted-index`) is unblocked and ready for `/ck:cook`.
- End of plan.
