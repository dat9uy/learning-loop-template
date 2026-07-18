---
phase: 1
title: "Single-source SessionStart content (kill mirror + probe)"
status: completed
priority: P1
effort: "0.5d"
dependencies: []
---

# Phase 1: Single-source SessionStart content (kill mirror + probe)

## Overview

Delete the drift-prone LOCAL hint mirror and the 10s MCP spawn probe from the factory SessionStart hook. The hook direct-imports the canonical builders (hints) and cheap core readers (counts) — the same pattern the universal .claude hooks already use, and the factory hook itself already uses in its failure path. This removes finding items (a) and (c) at their root: one source, no parity test.

## Requirements

- Functional:
  - `.factory/hooks/loop-surface-inject.cjs` renders hints from `buildDiscoverabilityHints()`/`buildProcessHints()` via `await import` of `core/loop-introspect.js` (CJS hook → ESM core; proven at `loop-surface-inject.cjs:139`).
  - Counts come from cheap sync core reads, not the MCP spawn: `tool_count` = `tools/manifest.json` length (JSONC-stripped per `loop-introspect.js:43-46`); `record_type_count` = `readdirSync(schemas)`; `rule_count` = `loadPromotedRules(root).length`; `active_finding_count` = `readRegistry(root)` filtered by `isOpen`.
  - Delete: `LOCAL_DISCOVERABILITY_HINTS`, `LOCAL_PROCESS_HINTS`, `spawnAndCall`, `reportMcpConnectionFailure`, `formatMcpFailureBanner`, the `client.callTool` probe, and the now-stale header comment (`:3` claims "inject loop_describe({tier:summary})").
  - Keep: `LL_DISABLE_LOOP_SURFACE_INJECTION` escape hatch, `LL_LOOP_INJECT_TIER=summary` downgrade + `reportHintDowngrade` (still meaningful — it audits operator tier downgrade), `formatBlock` (repointed at canonical hints).
  - Accepted trade-off (operator-confirmed): the probe's side-role as MCP-connection health check is gone. No replacement in this phase; genuine MCP failure surfaces at tool-call time.
- Non-functional:
  - Hook wall-time drops (no child spawn, no 10s timeout path).
  - No behavior change to emitted hint text (byte-identical to canonical at render time — by construction, not by parity test).

## Architecture

```
SessionStart (.factory/hooks.json, matcher "startup")
  → .factory/hooks/loop-surface-inject.cjs (CJS)
      → await import core/loop-introspect.js   → hints (canonical, no I/O)
      → require/import core readers            → counts (manifest.json, schemas/, readRegistry, loadPromotedRules)
      → formatBlock(counts, hints, tier)       → stdout block
```

Failure handling: if the core import throws, print nothing and exit 0 (current catch-all behavior); `console.error` the reason. No meta-state finding emission from this path (that was the probe-failure reporter's job; a broken core import breaks everything else too and is caught by tests).

## Related Code Files

- Modify: `.factory/hooks/loop-surface-inject.cjs` (delete ~200 lines: mirror arrays, spawn, failure reporters)
- Modify: `tools/learning-loop-mastra/__tests__/legacy-mcp/cold-session-discoverability.test.cjs` (replace test #7 "hook mirror hint parity" describe block, `:305-380`)
- Create: `tools/learning-loop-mastra/__tests__/factory-hook-single-source.test.cjs`

## Implementation Steps (TDD)

1. **Write failing tests first** (`factory-hook-single-source.test.cjs`):
   - Hook source contains no `LOCAL_DISCOVERABILITY_HINTS` / `LOCAL_PROCESS_HINTS` / `spawnAndCall` identifiers (grep-level guard against mirror regression).
   - `main(input, env)` with a stubbed SessionStart payload returns a block whose hint lines deep-equal `buildDiscoverabilityHints()` ++ `buildProcessHints()` output (import canonical builders in-test; call the hook's exported `main` with injected env, no child spawn).
   - Counts in the block equal values computed in-test from core readers (manifest length, registry filter, etc.).
   - `LL_LOOP_INJECT_TIER=summary` still emits no hint rows (downgrade path intact).
   - Run: `pnpm test:one tools/learning-loop-mastra/__tests__/factory-hook-single-source.test.cjs` → red.
2. Rewrite `loop-surface-inject.cjs` per Requirements. Header comment rewritten to state: renders canonical hints via direct core import; to update hints edit `core/loop-introspect.js` (until Phase 2 moves them to the registry).
3. In `cold-session-discoverability.test.cjs`: delete the `parseFrozenStringArray` helper and both string-compare tests (the `hook mirror hint parity` describe block). Point the test-inventory header comment at the new single-source test.
4. Run `pnpm test:one` on both touched test files → green. Then `pnpm test:iter` → green.

## Success Criteria

- [ ] No `LOCAL_*` arrays, no MCP spawn, no `reportMcpConnectionFailure` in the factory hook
- [ ] Rendered hints byte-equal canonical builders in test
- [ ] Parity test #7 deleted; no regex-parses-source tests remain for hint content
- [ ] `pnpm test:iter` green (bail=1)

## Risk Assessment

- **Risk:** Droid runtime resolves `cwd` differently (`FACTORY_PROJECT_DIR`); core imports need project-root resolution. **Mitigation:** reuse the existing `path.resolve(__dirname, "..", "..")` projectRoot derivation already proven in `reportHintDowngrade` (`:207-209`).
- **Risk:** `require(esm)` vs `await import` inconsistency across Node versions on operator machines. **Mitigation:** use `await import` exclusively in this CJS hook (matches existing failure-path code); tests exercise the real import, not mocks.
- **Risk:** some downstream consumer parses the failure banner. **Mitigation:** grep for `MCP connection probe failed` consumers before deletion; banner was stdout-only, no test references expected — verify in step 3.
