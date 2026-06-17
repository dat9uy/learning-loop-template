---
phase: 1
title: "Patch M-C1 (schemas.js header)"
status: completed
priority: P1
effort: "5min"
dependencies: []
---

# Phase 1: Patch M-C1 (schemas.js header)

## Overview

1-line commit. Adds a "Plan 3 cut-over note" to `tools/learning-loop-mastra/schemas.js` explaining the re-export seams Plan 3 needs to migrate. This is the missed F8 action item from Plan 1's red-team adjudication (accepted disposition: "add Plan 3 cut-over note to schemas.js header in Phase 1 Step 1"). Already applied in this session (see commit log below); Phase 1's job is to verify the patch sticks through Plan 1's closeout commit and rebase cleanly onto `main`.

## Why this is Phase 1

The operator disposition for F8 was "1-line patch in Plan 2's first commit" (per Plan 1's post-impl review § M-C1). Doing it in Phase 1 — before the parity harness, dual-server spawn, or any structural test code — means:
- The Plan 2 PR has a small, atomic first commit that's reviewable in seconds.
- If Plan 1's branch needs a rebase onto `main` before Plan 2 PRs, the rebase is trivial (one file, one line).
- Plan 3's cut-over author (separate person/session) reads `schemas.js` and immediately knows the re-exports are seams, not dead code.

## Requirements

- **Functional:** the header comment explains (a) why these are re-exports, (b) which file is the source of truth, (c) what Plan 3 needs to know.
- **Non-functional:** no code changes; header only. No new exports. No import changes. No test changes.

## Related Code Files

- Modify: `tools/learning-loop-mastra/schemas.js` (add 5 lines of header comment)

## Implementation Steps

1. **Verify the patch is on disk.** Read `tools/learning-loop-mastra/schemas.js` and confirm the "Plan 3 cut-over note" is present. (Already applied 2026-06-16; this step is a sanity check.)
2. **Stage the file.** `git add tools/learning-loop-mastra/schemas.js`.
3. **Commit.** `docs(mastra): document schemas.js re-export seams for Plan 3 cut-over (M-C1)`.
4. **Verify commit content.** `git show --stat HEAD` — should show 1 file changed, 5 insertions(+), 0 deletions(-).

## Success Criteria

- [ ] `tools/learning-loop-mastra/schemas.js` contains the "Plan 3 cut-over note" header
- [ ] The file is unchanged in size beyond the comment (no code edits)
- [ ] Commit message cites M-C1 + Plan 3 cut-over + F8 disposition
- [ ] No new exports, no removed exports, no import changes
- [ ] `pnpm test` still passes 9/9 namespaces + 55/55 namespace-10 (no regression from a comment change)

## Risk Assessment

- **Risk:** the patch was applied before the Plan 1 branch was pushed; if Plan 1 hasn't pushed yet, the patch rides on the wrong commit. **Mitigation:** the operator opens Plan 1's PR first (per brainstorm § Immediate actions #1); this patch is either squashed into Plan 1's closeout or is the first commit on top of Plan 1's tip. Either is acceptable; the operator decides.
- **Risk:** the header text references the F8 finding ID, which may go stale if the finding is later renumbered. **Mitigation:** the comment does NOT cite F8 directly; it cites "Plan 3 cut-over" which is a stable plan concept. The 5-year-later reader can grep `git blame` for the original F8 reference.

## Notes for Implementer

The header text applied is:

```js
// Re-export legacy tool configs used by the Mastra peer server.
// These schemas are the single source of truth; the Mastra factory only wraps them.
//
// Plan 3 cut-over note (C6, deferred from F8 red-team adjudication 2026-06-16):
// when C6 replaces the legacy @modelcontextprotocol/sdk McpServer with the Mastra
// MCPServer, these re-exports are the seams to migrate first. Each tool in
// tools/learning-loop-mcp/tools/ keeps `schema` (zod) + `handler` (function) as the
// contract; the mastra server imports them via #mcp/* and wraps via createLoopTool.
```

3 new lines added (lines 4-9 in the patched file). The original 2 comment lines + 3 export lines are preserved. Net diff: +5 lines.
