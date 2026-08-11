---
phase: 4
title: "Retire flags in docs + configs"
status: pending
priority: P2
effort: "3h"
dependencies: [1]
---

# Phase 4: Retire flags in docs + configs

## Overview

Remove `LOOP_RECORDS_VIA_CLI` / `LOOP_READS_VIA_CLI` from the three runtime `mcp.json`
configs and rewrite every evergreen doc/comment surface that describes the flags as an
active opt-out. Correct the stale tool counts (CLAUDE.md "41", architecture.md "43/41" —
actual 42 CLI / 44 handler manifest / 8 live MCP / 50 agent declaration). Historical journals stay intact.

## Requirements

- Functional: no evergreen doc, config, or code comment tells a runtime to set either flag
  or describes the flags as the mechanism by which the CLI becomes the record surface. The
  three runtime configs carry no `LOOP_*_VIA_CLI` key. Tool counts in docs are correct or
  linked to `core/cli-tools.js` as the source of truth.
- Non-functional: docs stay concise (`docs.maxLoc: 800`); historical journal/trajectory
  mentions of the flags are preserved as past state, not rewritten.

## Architecture

The flag surfaces span docs, configs, and code comments. Phase 1 already cleaned
`server.js`, the hook, `cli-tools.js`, `bin/loop.mjs`, and `placement.yaml` comments. This
phase covers the remaining evergreen docs + the 3 runtime configs + `mcp-config.test.js`'s
flag assertion (the test edit is in Phase 2; here we remove the config keys it asserted
against). The whole-repo grep is widened beyond `docs/ AGENTS.md CLAUDE.md` to include
`tools/learning-loop-mastra/interface/` and all evergreen docs. [Findings 4, 7, 11]

## Related Code Files

- Modify: `.mcp.json`, `.factory/mcp.json`, `.mastracode/mcp.json` (remove `LOOP_RECORDS_VIA_CLI`)
- Modify: `docs/runtime-contract.md` (lines ~24, ~26, ~30, ~47, ~88/90 — all flag paragraphs)
- Modify: `CLAUDE.md` ("Tool surface" bullet — retire flag prose + correct "41 tools" → 42)
- Modify: `docs/architecture.md:216` (flag-as-mechanism paragraph + "43/41" counts)
- Modify: `docs/philosophy.md:156`, `docs/mcp-tool-schema-architecture.md:7,242`
- Modify: `tools/learning-loop-mastra/interface/RUNTIME_ONBOARDING.md:125`
- Modify: `scripts/probe-mastracode.cjs`, `tools/scripts/measure-cli-context.mjs`
- Modify: `tools/learning-loop-mastra/__tests__/cli-workflow-dispatch.test.js`,
  `tools/learning-loop-mastra/__tests__/cli-write-tool-set.test.js`,
  `tools/learning-loop-mastra/__tests__/cli-write-tool-set-drift.test.js`,
  `tools/learning-loop-mastra/__tests__/e2e/mastra-code-smoke.test.cjs`,
  `tools/learning-loop-mastra/__tests__/helpers/manifest-constants.cjs`
- Modify: `.claude/skills/learning-loop/SKILL.md`, `.factory/skills/learning-loop/SKILL.md`,
  `.mastracode/skills/learning-loop/SKILL.md`
- Read-only: `docs/journals/**`, `docs/trajectory.md` (historical — leave intact)

## Implementation Steps

1. Remove the `"LOOP_RECORDS_VIA_CLI": "1"` key from `.mcp.json`, `.factory/mcp.json`,
   `.mastracode/mcp.json`. Keep `LOOP_SURFACE`. [Finding 4]
2. `docs/runtime-contract.md`: rewrite every paragraph that mentions either flag (~lines 24,
   26, 30, 47, 88/90) to the single-surface contract — the CLI is the single record surface
   (reads + portable writes), MCP carries only the residue, no opt-out flags. Do not anchor
   to two line numbers; rewrite every flag paragraph the grep finds. [Finding 7]
3. `CLAUDE.md`: rewrite the "Tool surface" bullet — remove the
   `All three wired runtimes set LOOP_RECORDS_VIA_CLI=1 ... so reads and writes ride the CLI`
   sentence; state the CLI carries 42 tools (12 reads + 30 writes), the handler manifest has
   44 entries, the live MCP residue has 8 tools, and `agent-manifest.json` remains the full
   50-entry declaration. Verify counts from `core/cli-tools.js` and the manifest constants;
   keep `LOOP_SURFACE` / `GATE_ROOT` guidance. [Red-team corrections 1, 10]
4. `docs/architecture.md:216`: rewrite the flag-as-mechanism paragraph to the single-surface
   statement; correct "43 manifest entries / 41 ride the CLI" → 44 manifest / 42 ride the CLI
   (or link to `core/cli-tools.js`). [Findings 7, 11]
5. `docs/philosophy.md:156`, `docs/mcp-tool-schema-architecture.md:7,242`,
   `tools/learning-loop-mastra/interface/RUNTIME_ONBOARDING.md:125`: rewrite each flag
   reference to the single-surface contract. `RUNTIME_ONBOARDING.md` no longer tells runtimes
   to set the flag. [Finding 7]
6. Enumerate and update active scripts, copied runtime skills, tests, and measurements found by
   the flag grep; preserve only historical journal/trajectory references. In particular, update
   `scripts/probe-mastracode.cjs`, `tools/scripts/measure-cli-context.mjs`, the listed CLI/MCP
   tests, and all three copied runtime `SKILL.md` files. Do not blanket-rewrite historical
   journals.
7. Whole-repo verification:
   search active code/config/docs/tests/scripts/skills for both flags and require zero active
   contract references; run a separate historical-only grep for `docs/journals/` and
   `docs/trajectory.md` and record those as intentionally retained.
8. Verify all cited file paths still resolve; confirm `core/cli-tools.js` link target.

## Success Criteria

- [ ] `.mcp.json`, `.factory/mcp.json`, `.mastracode/mcp.json` carry no `LOOP_*_VIA_CLI` key.
- [ ] `docs/runtime-contract.md` describes the CLI as the single record surface with no opt-out flags.
- [ ] `CLAUDE.md` "Tool surface" bullet distinguishes 42 CLI, 44 handler-manifest, 8 live MCP, and 50 agent-declaration tools.
- [ ] `docs/architecture.md`, `philosophy.md`, `mcp-tool-schema-architecture.md`, `RUNTIME_ONBOARDING.md` carry no active-flag prose.
- [ ] Whole-repo grep returns zero evergreen hits (historical journals excepted).

## Risk Assessment

- **Historical vs evergreen confusion:** journals legitimately reference the flags as past
  state. Signal: grep hits under `docs/journals/` or `docs/trajectory.md`. Response: leave
  intact; only rewrite evergreen contract surfaces. Do not edit history.
- **Count re-stated wrong:** copying "42" without verifying against `core/cli-tools.js` could
  re-stale the doc. Signal: `loop.mjs list | wc -l` ≠ the doc's count. Response: link to
  `core/cli-tools.js` as the source of truth instead of restating a literal where possible.
- **Config removal breaks a non-wired runtime:** a runtime not in the three wired configs
  might still set the flag. Signal: Phase 5 `pnpm test` or a runtime smoke fails. Response:
  the server ignores the flag after Phase 1, so a leftover key is a no-op, not a break — but
  document and remove it for consistency.