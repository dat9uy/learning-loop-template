---
title: 'Local fallow gate self-verify wrapper (issue #34)'
description: >-
  Close out the debuggability-gap finding meta-260704T0933Z by adding a
  `gate:self-verify` wrapper that refreshes touched-file fingerprints +
  regenerates coverage before invoking fallow, plus emit a clear
  local-verification caveat in the fallow:gate script output. Document the
  contract in a new AGENTS.md sub-section so the fix-loop ritual is
  reproducible.
status: completed
priority: P2
branch: fix/issue-34-local-fallow-self-verify
tags:
  - meta-state
  - fallow
  - debuggability
  - gate
  - file-index
  - issue-34
blockedBy: []
blocks: []
created: '2026-07-04T03:29:12.600Z'
createdBy: 'ck:plan'
source: skill
---

# Local fallow gate self-verify wrapper (issue #34)

## Overview

The local fallow:gate is unreliable for catching introduced complexity findings because of two coupled issues: (a) coverage-matching can fail for some functions despite 100% statement coverage (yielding `crap: ?` and false `introduced: true` flags), and (b) source-file edits desync file-index.jsonl which fails the cold-tier grounding test, which produces incomplete coverage, which compounds the false positives. The fix is a reproducible `gate:self-verify` wrapper that refreshes touched-file fingerprints and regenerates coverage with a passing test suite before invoking fallow, plus a clearly-worded caveat in the script output so operators know to cross-check `crap`/`coverage_pct` absence.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Research](./phase-01-research.md) | Completed |
| 2 | [Implement](./phase-02-implement.md) | Completed |
| 3 | [Test](./phase-03-test.md) | Completed |
| 4 | [Ship](./phase-04-ship.md) | In Progress |

## Dependencies

- Closes meta-260704T0933Z-local-fallow-gate-cannot-fully-self-verify-and-the-file-inde (issue #34)
- Touches `package.json` (script addition) and `AGENTS.md` (new sub-section)
- New file: `tools/learning-loop-mastra/scripts/gate-self-verify.mjs`
- Test file: `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-self-verify-contract.test.js`

## Acceptance Criteria

- [x] `pnpm gate:self-verify` exists as a script in `package.json`
- [x] The script prints the local-verification caveat at startup
- [x] The script refreshes touched-file fingerprints before running `pnpm test`
- [x] The script delegates to `fallow:gate` after coverage regeneration
- [x] TDD tests cover the wrapper surface (script presence, caveat string, fingerprint-refresh call, fallow delegation)
- [x] AGENTS.md updated with a short sub-section explaining the local-verification caveat
- [ ] Issue #34 closed via close flow after merge
