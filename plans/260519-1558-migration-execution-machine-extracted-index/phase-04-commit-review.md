---
phase: 4
title: "Commit Review"
status: complete
priority: P2
effort: "30m"
dependencies: [3]
---

# Phase 4: Commit Review

## Overview

Stage, commit, and review all changes produced by Phases 1–3. The commit scope is evidence markdown additions (frontmatter backfill + `## Findings`) and newly created index YAMLs. Frozen claim files are untouched.

## Requirements

- Functional: Clean conventional commit with no claim file edits.
- Non-functional: `pnpm check` passes before commit; code-reviewer agent reviews the diff.

## Architecture

Git diff should show only:
- `records/evidence/vnstock-data/*.md` — frontmatter additions, `## Findings` sections
- `records/evidence/vnstock-data/*.md` — newly created evidence files
- `records/index/*.yaml` — newly created index entries
- `docs/` untouched (Plan 4 handles docs canonicalization)
- `records/claims/*.yaml` untouched (frozen-legacy, read-only)

## Related Code Files

- All files modified/created in Phases 1–3

## Implementation Steps

1. **Final `pnpm check`.**
   ```bash
   pnpm check
   ```
   Must pass with 0 errors, 0 test failures.

2. **Stage changes.**
   ```bash
   git add records/evidence/vnstock-data/
   git add records/index/
   ```
   Explicitly exclude `records/claims/` from staging.

3. **Verify diff scope.**
   ```bash
   git diff --cached --stat
   ```
   Confirm no claim files, no docs files, no schema/tool changes.

4. **Create conventional commit.**
   Use `feat(records,index):` scope. Message summarizes the migration of two prototype seed claims into machine-extracted index entries.

5. **Code review via code-reviewer agent.**
   Delegate to `code-reviewer` agent with the commit hash or staged diff. Focus:
   - Are index entries schema-valid?
   - Are `## Findings` sections properly formatted with `[topic-tag]`?
   - Is supersession cross-referencing correct?
   - Any evidence file accidentally edited beyond `## Findings` addition?

## Success Criteria

- [ ] `pnpm check` passes at 100%.
- [ ] Git diff contains only evidence markdown and index YAMLs.
- [ ] No `records/claims/` files in diff.
- [ ] No `docs/` files in diff.
- [ ] Commit message follows conventional commit format.
- [ ] Code-reviewer agent approves or flags only observational concerns.

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Accidental claim file edit in diff | Explicit `git add` paths; review diff stat before commit |
| Test failure from evidence markdown parser edge case | Final `pnpm check` catches this; fix before commit |
| Commit message references plan artifacts | Per `review-audit-self-decision.md` rule 5, no plan references in code comments or commit messages |

## Next Steps

After this phase, the Plan 3 implementation is complete. Plan 4 (Deprecation + Docs Canonicalization) updates `docs/philosophy.md` and `docs/operator-guide.md` to canonicalize the new conventions. It depends on Plan 3 validated.