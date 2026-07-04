---
phase: 4
title: Ship
status: in-progress
effort: ''
---

# Phase 4: Ship

## Overview

Commit the changes, push the branch, open the PR, run `/ck:code-review`, address findings, run `/ck:ship`, then close out issue #34 via the meta-state close flow per the user's directive.

## Implementation Steps

1. `git add` the changed files (script, test, package.json, AGENTS.md).
2. Conventional commit: `feat(meta-state): add gate:self-verify wrapper for local fallow pre-push (issue #34)`.
3. Push branch `fix/issue-34-local-fallow-self-verify`.
4. Open PR via `gh pr create --base main --head fix/issue-34-local-fallow-self-verify --title "<title>" --body "<body>"`.
5. Wait for CI; address findings.
6. **Merge the PR** once green.
7. After merge, run the close flow per the user's directive:
   - `meta_state_refresh_file_index` for each path the change touched (the script `gate-self-verify.mjs` and the test file).
   - `meta_state_log_change` with `change_target: "tools/learning-loop-mastra/scripts/gate-self-verify.mjs"` and reason citing PR + issue #34.
   - `meta_state_resolve({id: meta-260704T0933Z-..., resolution: "PR #<N> adds gate:self-verify wrapper..."})`.
8. Update dispatch ledger via `meta_state_dispatch_finding` if needed.

## Success Criteria

- [ ] PR is open with the new files
- [ ] CI green on the PR
- [ ] PR merged into main
- [ ] Close-flow executed: refresh_file_index → log_change → resolve
- [ ] Issue #34 marked closed or its dispatch ledger updated to closed
