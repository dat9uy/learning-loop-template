---
phase: 3
title: Test
status: completed
effort: ''
---

# Phase 3: Test

## Overview

The wrapper is a shell-orchestration script, so unit tests exercise its **contract surface** (script file presence, registered package.json command, caveat string verbatim, ordered sub-command sequence via mock spawning), not its end-to-end pipeline (which is exercised by Phase 4's CI gate).

## Implementation Steps

1. Add `tools/learning-loop-mastra/__tests__/scripts/gate-self-verify.test.cjs`:
   - `script presence` — file exists at `tools/learning-loop-mastra/scripts/gate-self-verify.mjs`
   - `package.json registration` — `scripts.gate:self-verify` equals `node tools/learning-loop-mastra/scripts/gate-self-verify.mjs`
   - `caveat string verbatim` — script source contains the finding's caveat phrase unchanged
   - `ordered sub-commands` — script imports child_process and invokes `spawnSync` (or `spawn`) for `node tools/learning-loop-mastra/tools/legacy/scripts/seed-file-index.mjs`, `pnpm test`, then `pnpm fallow:gate` in that order
   - `caveat precedes fallow` — script writes the caveat to stderr/stdout BEFORE spawning fallow
2. Run `node --test tools/learning-loop-mastra/__tests__/scripts/gate-self-verify.test.cjs` and confirm green.
3. Run the full suite: `pnpm test` then a manual `pnpm fallow:gate` (without commit) to confirm the wrapper is wired.

## Success Criteria

- [ ] `gate-self-verify.test.cjs` exists
- [ ] All 5 contract tests pass
- [ ] Full test suite passes
- [ ] Manual `pnpm gate:self-verify --dry-run` (no-op pass) prints the caveat and exits 0
