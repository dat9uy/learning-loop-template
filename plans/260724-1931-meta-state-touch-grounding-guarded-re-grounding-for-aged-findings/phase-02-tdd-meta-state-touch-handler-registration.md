---
phase: 2
title: "TDD: meta_state_touch handler + registration"
status: completed
priority: P1
effort: "4h"
dependencies: [1]
---

# Phase 2: TDD: meta_state_touch handler + registration

## Overview

Implement the handler to green the phase-1 tests, then register it on every surface (MCP manifest, CLI write set, agent manifests, session-start sketch, docs/hints) so all drift/parity tests go green.

## Requirements

- Functional: `meta_state_touch` per phase-1 contract; both surfaces (MCP + CLI)
- Non-functional: single handler, shim-not-fork (runtime-agnostic rule); `check_runtime_agnostic` clean

## Architecture

Handler `metaStateTouchTool` follows the re-verify skeleton minus execution: zod schema `{ id: z.string(), _expected_version: z.coerce.number().optional() }`, `resolveRoot()`, `loadEntry`, guards, `checkGrounding` with `readFileIndex(root)` injected, `applyUpdateAndCheck` CAS patch `{ last_verified_at, _expected_version }`, `replyWithLog` + explicit gate-log snapshot entry.

Registration surfaces (verified by tracing `meta_state_re_verify`):

| Surface | File | Change |
|---|---|---|
| Handler | `tools/learning-loop-mastra/tools/handlers/meta-state-touch-tool.js` | new |
| MCP manifest | `tools/learning-loop-mastra/tools/manifest.json` | `{ "file": "tools/meta-state-touch-tool.js", "export": "metaStateTouchTool", "pathFields": [] }` |
| CLI write set | `tools/learning-loop-mastra/core/cli-tools.js` | add `"meta_state_touch"` to `CLI_WRITE_TOOLS` |
| Agent manifests | `tools/learning-loop-mastra/agent-manifest.json`, `tools/learning-loop-mastra/tools/handlers/agent-manifest.json` | add `mastra_meta_state_touch` / `meta_state_touch` |
| Agent wiring | `tools/learning-loop-mastra/mastra/agents/build-meta-state-tools.js` | register tool (mirror re-verify) |
| Session-start sketch | `tools/learning-loop-mastra/hooks/universal/session-start-inject-discoverability.cjs` | add `meta_state_touch: "{id}"` sketch line |
| Fallow credit | `.fallowrc.json` `dynamicallyLoaded` | add handler path if manifest-driven imports require it |
| Tool-selection guide | `tools/learning-loop-mastra/tools/handlers/references/tool-selection-guide.md` | one row: when to touch vs re_verify |
| Lifecycle docs | `docs/meta-state-lifecycle.md` | re-ground row: re_verify (steps) OR touch (no steps) |
| Warm hint | `tools/learning-loop-mastra/core/hint-registry.js` (status-lifecycle hint ~L90) | mention touch as the no-steps path |

## Implementation Steps

1. Write `meta-state-touch-tool.js` (handler only; no new core module — logic is thin glue over existing primitives).
2. Run phase-1 test file → green.
3. Add manifest entry + `CLI_WRITE_TOOLS` + both agent manifests + `build-meta-state-tools.js` wiring.
4. Update session-start sketch; run `cli-write-hint-sketch-drift.test.js` → green.
5. Run drift/parity trio: `cli-write-tool-set.test.js`, `cli-write-tool-set-drift.test.js`, `cli-write-parity.test.js`, `cli-mcp-subset-registration.test.js` → green.
6. Update tool-selection guide, `docs/meta-state-lifecycle.md`, hint-registry hint.
7. Smoke both surfaces: `META_STATE_VERIFY_EXEC= node tools/learning-loop-mastra/bin/loop.mjs meta_state_touch '{"id":"<known-grounded-open-id>"}'` (with `LOOP_SURFACE=.claude`); MCP surface via existing parity harness.
8. `mastra_check_runtime_agnostic` on the new handler; fix any shim-not-fork violations.
9. `assertinvariant` audit (hint #8): confirm `applyUpdateAndCheck` already wraps the mutation — add wrapper only if the helper doesn't own it.

## Success Criteria

- [x] Phase-1 test file green
- [x] All CLI/MCP drift + parity tests green
- [x] Docs/hints/guide updated; `field-glossary.test.js` unaffected (no new fields)
- [x] Narrow tests → broaden to full `pnpm test` at end of phase

## Risk Assessment

- Risk: drift tests encode an explicit tool whitelist that fails on ANY new tool — expected; update the whitelist fixtures, never weaken the assertion.
- Risk: session-start sketch drift test pins exact sketch text — update hook + test fixture together.
