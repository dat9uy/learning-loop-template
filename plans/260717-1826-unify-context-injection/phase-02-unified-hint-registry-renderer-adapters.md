---
phase: 2
title: "Unified hint registry + budget renderer + per-runtime adapters"
status: completed
priority: P1
effort: "1d"
dependencies: [1]
---

# Phase 2: Unified hint registry + budget renderer + per-runtime adapters

## Overview

Introduce the single hint source (`core/hint-registry.js`, slug-keyed structured entries) and the single render pipeline (`core/hint-renderer.js`, channel + char-budget parameterized). The .claude and .factory injection surfaces become thin adapters over the renderer. This is the state-2 core of the plan: deterministic injection unified across runtimes, consumption still agentic. Dissolves the two-hook 10k-cap hand-partition.

**Scope note (Validation 1, 2026-07-17):** .mastracode is **excluded** — it stays pull-only (`loop_describe`). Its SessionStart support for `additionalContext` is unverified and the operator chose not to build the adapter in this plan. The renderer's channel table leaves room for a future `mastracode-session-start` channel without redesign.

## Requirements

- Functional:
  - `core/hint-registry.js`: frozen array of entries `{ slug, kind: "discoverability" | "process", text, suggestion, derived_from_rule: null }`. Initial content = the 16 canonical discoverability + 10 canonical process rows (moved verbatim from `loop-introspect.js:107-139`), slugs taken from the existing `HINT_KEY_MAP`/`HINT_KEY_MAP_PROCESS` (`loop-get-instruction-tool.js:5-29`), suggestions absorbed from `HINT_SUGGESTIONS`/`HINT_SUGGESTIONS_PROCESS` (`:31-65`). The placeholder-rot rows (process suggestions 3-7) are replaced by real one-line suggestions written during the move.
  - `buildDiscoverabilityHints()` / `buildProcessHints()` in `core/loop-introspect.js` become thin projections over the registry (`listHints({kind}).map(e => e.text)`). Back-compat: same return shape, same order. No call-site changes for `loop_describe`.
  - `core/hint-renderer.js`: `renderHints({ channel, charBudget })` → `{ partitions: string[], provenance: [{ slug, kind, source }] }`. Channels: `claude-session-start` (budget ~9500, two partitions — discoverability, process), `factory-session-start` (no cap, single block matching current `formatBlock` shape), `mcp-warm` (structured array, no cap), `sidecar` (session-context.json payload shape preserved). Partitioning is deterministic: greedy fill by entry, never splits a hint.
  - `loop-get-instruction-tool.js`: `HINT_KEY_MAP`/`HINT_KEY_MAP_PROCESS`/`HINT_SUGGESTIONS*` deleted as hand-maintained consts; slug→hint and index→hint resolution derived from the registry. Numeric-index behavior preserved for back-compat (index = position in kind-filtered registry order); slug becomes the documented-canonical key. Fix stale suggestion text (e.g. the `stale`-status row at `HINT_SUGGESTIONS[5]` contradicts the post-migration status vocabulary).
  - Adapters (all hooks stay in `hooks/universal/` per `rule-runtime-agnostic-features`; I/O normalized through `hooks/universal/lib/protocol-adapter.js` where applicable):
    - `.claude`: the two existing universal hooks become ~10-line renderer clients — `session-start-inject-discoverability.cjs` renders partition 0, `session-start-inject-process-hints.cjs` renders partition 1. Sidecar write (`session-context.json`) and `*_source` degrade flags preserved (payload now built by the renderer's `sidecar` channel).
    - `.factory`: Phase-1 hook swaps its `formatBlock` hint assembly for the `factory-session-start` channel render.
    - `.mastracode`: **no adapter** (Validation 1) — pull-only via `loop_describe`.
  - Cross-surface wiring iterates `core/surfaces.js` `SURFACES` — no hardcoded surface paths.
- Non-functional:
  - Each `claude-session-start` partition ≤ budget (test-asserted).
  - Byte-identity: `.claude` and `.factory` injections render the same hint text for the same registry (one render function, two channel formats).
  - Degrade paths preserved: forced-failure env hooks (`SESSION_START_FORCE_*`) still produce marker strings + `*_source: "fallback"` flags.

## Architecture

```
core/hint-registry.js     single source: [{ slug, kind, text, suggestion, derived_from_rule }]
        │
core/hint-renderer.js     renderHints({ channel, charBudget }) → partitions + provenance
        │
        ├─ hooks/universal/session-start-inject-discoverability.cjs  → .claude additionalContext (partition 0) + sidecar
        ├─ hooks/universal/session-start-inject-process-hints.cjs    → .claude additionalContext (partition 1)
        ├─ .factory/hooks/loop-surface-inject.cjs                    → stdout block (factory channel)
        └─ loop_describe warm/cold                                   → mcp-warm channel (structured)

(.mastracode: pull-only per Validation 1 — no push adapter)

loop-introspect.js        buildDiscoverabilityHints/buildProcessHints = projections (back-compat)
loop-get-instruction      slug/index maps derived from registry
```

## Related Code Files

- Create: `tools/learning-loop-mastra/core/hint-registry.js`
- Create: `tools/learning-loop-mastra/core/hint-renderer.js`
- Modify: `tools/learning-loop-mastra/core/loop-introspect.js` (delete const arrays; project from registry)
- Modify: `tools/learning-loop-mastra/hooks/universal/session-start-inject-discoverability.cjs`, `session-start-inject-process-hints.cjs` (renderer clients)
- Modify: `.factory/hooks/loop-surface-inject.cjs` (renderer channel)
- Modify: `tools/learning-loop-mastra/tools/handlers/loop-get-instruction-tool.js` (derive maps)
- Create: `tools/learning-loop-mastra/__tests__/hint-registry.test.cjs`, `hint-renderer.test.cjs`
- Modify: `tools/learning-loop-mastra/__tests__/legacy-mcp/cold-session-discoverability.test.cjs` (hint well-formedness test re-anchored to registry; the `HINT_SUGGESTIONS` alignment-count assertions in the deleted parity block move to `hint-registry.test.cjs`)
- Modify: existing session-start hook tests (`__tests__/legacy-mcp/session-start-inject-{discoverability,process-hints,degraded-sources}.test.cjs`)

## Implementation Steps (TDD)

1. **Tests first — registry** (`hint-registry.test.cjs`): every entry has unique slug, kind, non-empty text + suggestion; discoverability entries = the 16 canonical slugs; process entries = the 10 known slugs (8 rule-shaped + 2 standalone); projections from `loop-introspect` return text in registry order. Red.
2. **Tests first — renderer** (`hint-renderer.test.cjs`): greedy partition respects budget (no partition > charBudget for `claude-session-start`; no hint split across partitions); `factory-session-start` output contains all 26 hints in one block; provenance lists slug+kind+source per rendered hint; forced-degrade loader produces marker string, not throw. Red.
3. Implement `hint-registry.js`, migrate const content + slugs + suggestions verbatim (fix the placeholder rot rows 3-7 and the stale `stale`-status suggestion while moving — these are content bugfixes, call them out in the PR).
4. Implement `hint-renderer.js`; repoint `loop-introspect` builders to projections.
5. Rewrite the two .claude hooks + factory hook as renderer clients. (No .mastracode work — Validation 1.)
6. Rewrite `loop-get-instruction-tool.js` resolution over the registry (keep tool schema + response shape unchanged; numeric indexes preserved per Validation 4).
7. Update existing hook/loop_get_instruction tests to the registry source of truth; re-anchor cold-session well-formedness test (test #2) and the `HINT_SUGGESTIONS` alignment-count assertions to the registry.
8. Run `pnpm test:one` per touched test file → green; then `pnpm test:iter` → green.
9. Run `check_runtime_agnostic` MCP tool against `tools/learning-loop-mastra/hooks/universal/` before shipping (6-item checklist: core-in-universal-location, shims-in-sync, protocol-adapter-i/o, manifest-registered, cross-surface-iteration, parameterized-for-new-surfaces).

## Success Criteria

- [ ] Grep finds zero `DISCOVERABILITY_HINTS = Object.freeze` / `PROCESS_HINTS = Object.freeze` outside `hint-registry.js`
- [ ] Zero hand-maintained `HINT_KEY_MAP*` / `HINT_SUGGESTIONS*` consts; slug lookup derives from registry
- [ ] Renderer test asserts both .claude partitions ≤ budget and no hint split
- [ ] .claude + .factory renders carry byte-identical hint text from the same registry (.mastracode excluded per Validation 1)
- [ ] `pnpm test:iter` green; `check_runtime_agnostic` audit passes

## Risk Assessment

- **Risk:** hint order change alters numeric-index semantics of `loop_get_instruction`. **Mitigation:** registry order = current const order verbatim; index behavior preserved by test (Validation 4); docs steer to slugs.
- **Risk:** the sidecar payload shape is consumed by tests/tools (`session-context.json` readers). **Mitigation:** `sidecar` channel renders the identical key set (`buildContextPayload` shape, `:238-252` of the discoverability hook); a shape test locks it.
- **Risk:** scope creep into stale-dispatch/change-log-gap hint builders that share the .claude hook. **Mitigation:** out of scope — those loaders stay in the discoverability hook untouched; the renderer only takes over the two static hint sets.
- **Deferred (Validation 1):** .mastracode push injection. If wanted later, add a `mastracode-session-start` channel to the renderer + verify that runtime's hook protocol first; no renderer redesign needed.

<!-- Updated: Validation Session 1 - dropped .mastracode adapter (decision 1); re-anchored HINT_SUGGESTIONS assertions; confirmed numeric-index back-compat (decision 4) -->
