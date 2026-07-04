---
phase: 2
title: "Implement"
status: pending
effort: ""
---

# Phase 2: Implement

## Overview

Build `tools/learning-loop-mastra/scripts/gate-self-verify.mjs` as a thin wrapper that:
1. Prints the local-verification caveat at startup so users see the contract.
2. Re-seeds `file-index.jsonl` via `seed-file-index.mjs` (canonical re-hash mechanism — already in repo) so coverage matches current fingerprints.
3. Re-runs `pnpm test` with c8 coverage regeneration.
4. Delegates to `pnpm fallow:gate`.

The "warning when introduced findings lack `crap`/`coverage_pct`" requirement (from the issue body) is realized as the **pre-fallback CAVEAT box + AGENTS.md §7 cross-check rule** rather than a post-fallow grep parser. Rationale: parsing fallow's text output is brittle (output format is not a stable contract); operator-mediated cross-check via the documented rule is more durable. The CAVEAT box at startup names the contract verbatim so operators never miss it.

## Files

- **NEW** `tools/learning-loop-mastra/scripts/gate-self-verify.mjs` — the wrapper.
- **NEW** `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-self-verify-contract.test.js` — TDD contract tests.
- **EDIT** `package.json` — add `"gate:self-verify": "node tools/learning-loop-mastra/scripts/gate-self-verify.mjs"`.
- **EDIT** `AGENTS.md` — add §7 sub-section explaining the local-verification caveat + cross-check rule.

## Implementation Steps

1. Write the failing tests first; capture contract:
   - script exists at canonical path
   - script prints the caveat string verbatim
   - script re-seeds file-index for cited paths before delegating
   - script delegates to `pnpm fallow:gate`
   - ordering invariant (refresh precedes fallow delegation in execution surface)
2. Implement the script: spawn `node tools/learning-loop-mastra/tools/legacy/scripts/seed-file-index.mjs` → `pnpm test` → `pnpm fallow:gate`. Stream stdout/stderr through child_process.spawnSync with stdio inheritance.
3. Update `package.json` script registration.
4. Update `AGENTS.md` with §7 "Local fallow gate self-verify" sub-section.

## Success Criteria

- [ ] Wrapper script present at `tools/learning-loop-mastra/scripts/gate-self-verify.mjs`
- [ ] Caveat string emitted on startup (verbatim from issue #34)
- [ ] Wrapper refreshes file-index fingerprints, regenerates coverage, then runs `pnpm fallow:gate`
- [ ] `package.json` registers `gate:self-verify`
- [ ] `AGENTS.md` §7 added with caveat language + cross-check rule