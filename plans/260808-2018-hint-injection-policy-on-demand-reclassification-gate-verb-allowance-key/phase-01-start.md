---
phase: 1
title: "Injection-policy mechanism + gate-verb-allowance key"
status: pending
priority: P1
effort: "3-4h"
dependencies: []
---

# Phase 1: Injection-policy mechanism + gate-verb-allowance key

## Overview

Add the `tier` injection-policy field to `HINT_REGISTRY` (default `"startup"`, so the mechanism ships inert — no behavior change for existing rows). Wire it through the two injection paths (loop-introspect warm builders, hint-renderer channels) and the per-turn sidecar (session-start hooks). Then add the first on-demand entry — `gate-verb-allowance` at index 16 (append-only) — which resolves the B finding `meta-260808T1614Z` and is the test fixture proving the mechanism works: it is fetchable via `loop_get_instruction` but absent from warm `discoverability_hints`, present in `hint_index`.

## Requirements

- Functional: every `HINT_REGISTRY` entry accepts an optional `tier: "startup" | "on-demand"` (default `"startup"`). Omitted → startup (back-compat). The `listHints({ kind, tier })` filter param defaults to `undefined` (no filter) — NEVER `"startup"` (see Invariants; `loop_get_instruction` numeric resolution depends on the no-filter default).
- Functional: `buildDiscoverabilityHints` / `buildDiscoverabilityPointers` in `loop-introspect.js` take a `{tier:"startup"}` arg for the **warm** path only; a `buildHintIndex` (reusing/extending `projectToPointers`, `loop-introspect.js:139-149` — do NOT duplicate the projection) returns `[{slug, suggestion}]` for all registry entries + rule-derived process slugs (accept `rulesById` and merge `buildProcessView` slugs so the index is the complete discovery surface).
- Functional: warm `loop_describe` emits `discoverability_hints` (startup-tier full text) + a new `hint_index` (all slugs + suggestions). Cold `loop_describe` stays **unfiltered** (full history — `loop-describe-tool.js:44`). `buildHintBlocks` (`loop-describe-tool.js:30`) takes a `{tier}` arg: warm (`:136`) passes `tier:"startup"`; cold (`:274`) passes no tier (unfiltered). `process_hints` likewise filters standalone rows to startup-tier for warm only.
- Functional: the 4 `hint-renderer.js` channels stay **UNFILTERED** (inspection tooling — `:6-9`); they keep `listHints({kind:"discoverability"})` unfiltered so operators preview all 17 hints. The `hint_index` is NOT added to the renderer — only to the warm injection paths.
- Functional: `session-start-inject-discoverability.cjs` (+ process-hints hook) writes the startup pointers + `hint_index` to `session-context.json`; on-demand full text is NOT written to the sidecar.
- Functional: `.factory/hooks/loop-surface-inject.cjs` (forked hook, `.factory/hooks.json:8`, calls `buildDiscoverabilityHints()`/`buildProcessHints()` at `:134,:143`, emits via `formatBlock`) — emit a `hint_index` block (or write the same sidecar). `.mastracode` wires no hint injection (relies on `loop_describe`).
- Functional: `loop_get_instruction` is **unchanged** — it resolves against the full registry (startup + on-demand) via `findHintBySlug`/`lookupByIndex`. On-demand slugs resolve; their numeric index is their registry position.
- Functional: new `gate-verb-allowance` entry (discoverability, index 16, `tier: "on-demand"`). Its `text` contains: `gate_mark_preflight({surface:"runtime-state"})` then `runtime_state_record({affected_system:"gate-verb:<verb>", kind:"budget-state", id:"gate-verb:<verb>", source_ref:"local:meta-state:gate-verb-allowance", timestamp:"<ISO>"})`, the rule `id` MUST equal `affected_system`, the sentinel note (non-resolving, no finding-id grep), the 30-min expiry, AND "the promoted-rule denylist still applies during the allowance window" (preserves the security constraint CLAUDE.md carries today; the block message omits it). `suggestion` is a one-line pointer.
- Non-functional: discoverability numeric indices 0–15 unchanged (append-only). No slug renamed/removed/reordered. Process numeric offset shifts 16→17 (documented).
- Non-functional: `gate-verb-allowance` `text` ≥ 50 chars, `suggestion` > 20 chars (registry invariants).

## Architecture

The `tier` field decouples injection-policy from semantic-kind. The filter is applied at **warm-injection** sites only — never the renderer (inspection) and never the cold tier (full history):

```
HINT_REGISTRY (frozen, append-only)
  ├── tier: "startup"     → warm discoverability_hints (full text) + hint_index   [warm only]
  └── tier: "on-demand"   → hint_index only; full text via loop_get_instruction   [warm only]

Cold loop_describe: UNFILTERED (full history)         [both tiers injected]
hint-renderer:     UNFILTERED (inspection)            [both tiers previewed]
loop_get_instruction: UNFILTERED (full registry)      [any hint, any tier]
```

- `core/hint-registry.js`: add `tier` to the schema doc; add `listHints({ kind, tier })` (default `tier=undefined` = no filter); add `buildHintIndex({rulesById})` (reuse `projectToPointers`, merge rule-derived slugs). Keep `findHintBySlug`/`resolveHintText` unchanged.
- `core/loop-introspect.js`: `buildDiscoverabilityHints({tier})` — warm caller passes `"startup"`, cold caller omits; `buildHintIndex({rulesById})` consumer; `buildProcessHints({tier,rulesById})` filters standalone rows for warm only.
- `tools/handlers/loop-describe-tool.js`: `buildHintBlocks({tier})` — warm (`:136`) passes `tier:"startup"` + adds `hint_index`; cold (`:274`) passes no tier (unfiltered, no `hint_index`).
- `core/hint-renderer.js`: **no filter** — keep `listHints({kind:"discoverability"})` unfiltered in all 4 channels; no `hint_index` here.
- `hooks/universal/session-start-inject-discoverability.cjs` (+ process-hints): sidecar payload from filtered views + index.
- `.factory/hooks/loop-surface-inject.cjs`: emit `hint_index` block (or write the sidecar).
- `tools/handlers/loop-get-instruction-tool.js`: **no change** — reads the full registry.

Data flow: registry → (warm filter) → warm/sidecar/.factory (startup full text + all-slugs index); registry → (unfiltered) → cold loop_describe, renderer, loop_get_instruction.

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/hint-registry.js` (add `tier` field, `buildHintIndex({rulesById})`, `listHints({kind,tier})` default-undefined; add the `gate-verb-allowance` entry at index 16)
- Modify: `tools/learning-loop-mastra/core/loop-introspect.js` (`buildDiscoverabilityHints({tier})`, `buildHintIndex` consumer, `buildProcessHints({tier})`; emit `hint_index` in warm output)
- Modify: `tools/learning-loop-mastra/tools/handlers/loop-describe-tool.js` (`buildHintBlocks({tier})`: warm filters + `hint_index`, cold unfiltered)
- Modify: `tools/learning-loop-mastra/hooks/universal/session-start-inject-discoverability.cjs` (sidecar payload + index)
- Modify: `tools/learning-loop-mastra/hooks/universal/session-start-inject-process-hints.cjs` (sidecar payload)
- Modify: `.factory/hooks/loop-surface-inject.cjs` (emit `hint_index` block / sidecar — the forked `.factory` SessionStart hook)
- No change: `tools/learning-loop-mastra/core/hint-renderer.js` (stays UNFILTERED — inspection tooling; red-team finding 3)
- No change: `tools/learning-loop-mastra/tools/handlers/loop-get-instruction-tool.js` (resolves against full registry)

## Implementation Steps (TDD — tests first)

1. **Write failing tests** in `__tests__/hint-registry.test.cjs`:
   - `gate-verb-allowance` is present at registry index 16 (17th discoverability row); `tier: "on-demand"`.
   - `listHints({kind:"discoverability", tier:"startup"})` returns 16 (the existing rows, default startup); `listHints({kind:"discoverability", tier:"on-demand"})` returns 1 (`gate-verb-allowance`).
   - **No-filter default (red-team #10):** `listHints({kind:"discoverability"}).length === listHints({kind:"discoverability", tier:undefined}).length` AND both equal 17 (the `tier` param defaults to undefined, never `startup`).
   - `buildHintIndex({rulesById})` returns all 17 discoverability entries + rule-derived process slugs each with `slug` + `suggestion` (complete discovery surface — red-team #11; reuse `projectToPointers`, do not duplicate).
   - `findHintBySlug("gate-verb-allowance")` returns the entry; `resolveHintText` returns its `text` (not null).
   - Numeric indices 0–15 unchanged: `reopens-script`→10, `narrow-query`→12, `internalization-rule`→0. Process offset shifts 16→17 (red-team #12; update the stale `k - 16` comment at `loop-get-instruction.test.js:141` to use `discoverabilityLen`).
2. **Write failing tests** in `__tests__/legacy-mcp/loop-get-instruction.test.js`:
   - `loop_get_instruction({key:"gate-verb-allowance"})` returns the hint (not `Unknown hint key`); `text` contains `gate_mark_preflight({surface:"runtime-state"})`, `runtime_state_record`, `id` MUST equal `affected_system`, `local:meta-state:gate-verb-allowance`, **AND "the promoted-rule denylist still applies during the allowance window"** (red-team #4).
   - `loop_get_instruction({key:16})` returns the same hint (numeric index 16).
3. **Write failing tests** in `__tests__/legacy-mcp/loop-describe-warm-tier.test.js`:
   - Warm `discoverability_hints` does NOT contain `gate-verb-allowance`'s text (it is on-demand).
   - Warm `hint_index` contains a `gate-verb-allowance` entry with its `suggestion`.
   - **Cold tier stays unfiltered (red-team #2):** `loop_describe({tier:"cold"})` `discoverability_hints.length === 16` (unchanged — full history; the cold path passes no `tier`).
   - **Renderer stays unfiltered (red-team #3):** `hint-renderer` provenance covers all 17 discoverability rows (the renderer does NOT filter).
   - **`.factory` emits `hint_index` (red-team #1):** add/extend a `.factory` hook test asserting `loop-surface-inject.cjs` output carries `hint_index`.
4. Run tests → red. Implement: add `tier` field + `buildHintIndex({rulesById})` (reuse `projectToPointers`) + `listHints({kind,tier})` default-undefined + the `gate-verb-allowance` entry in `hint-registry.js`; wire the **warm-only** filter + `hint_index` into `loop-introspect.js` (warm) + `loop-describe-tool.js` `buildHintBlocks({tier})` (warm filters + index, cold unfiltered) + the two `.claude` session-start hooks + `.factory/hooks/loop-surface-inject.cjs`. Do NOT touch `hint-renderer.js` (stays unfiltered).
5. Update the existing count assertions this phase forces (broaden the grep to `=== 16|18|12|17|19` — red-team #8): `hint-registry.test.cjs:176` `listHints({kind:undefined}).length === 18` → **19** (Phase 1 adds the key); `hint-renderer.test.cjs:106` `provenance.length === 18` → **19** (renderer is unfiltered, sees the new row). Startup-filtered view assertions stay at 16; warm `discoverability_hints` stays 16 startup-tier. `loop-describe-warm-tier.test.js:128-132` `buildDiscoverabilityHints` count stays 16 (verify the warm test passes `tier:"startup"`).
6. Run `pnpm test:one __tests__/hint-registry.test.cjs` then the warm-tier + loop-get-instruction + hint-renderer + session-start-inject + `.factory` suites → green. Then `pnpm exec vitest --changed`.
7. `check_runtime_agnostic` on `hint-registry.js` + the universal hooks. NOTE (red-team #9): the audit's `UNIVERSAL_DIRS`/`SHIM_DIRS` exclude `.factory/hooks/` (not under `coordination/hooks/`), so 6/6 does NOT prove `.factory` delivery — the Phase 1 `.factory` test (step 3) is the actual proof.

## Success Criteria

- [ ] `loop_get_instruction({key:"gate-verb-allowance"})` returns the incantation hint including the denylist constraint (resolves the B finding).
- [ ] `gate-verb-allowance` is on-demand: absent from warm `discoverability_hints`, present in warm `hint_index`.
- [ ] `tier` field ships inert: all 16 existing rows behave as before (default startup); only `gate-verb-allowance` is on-demand.
- [ ] `listHints({kind})` no-filter default pinned (`tier:undefined` returns all); numeric indices 0–15 unchanged; `gate-verb-allowance` at 16; process offset 16→17 documented.
- [ ] Cold `loop_describe` stays unfiltered (16 hints); `hint-renderer` stays unfiltered (17 hints + process).
- [ ] `.factory/hooks/loop-surface-inject.cjs` emits `hint_index` (verified by a test, not the runtime-agnostic audit).
- [ ] `pnpm test:one` green for hint-registry, loop-get-instruction, loop-describe-warm-tier, hint-renderer, session-start-inject, `.factory` suites; `vitest --changed` green.

## Risk Assessment

- **Risk: `listHints({kind})` callers break when the unfiltered count changes 16→17.** *Signal:* test failures referencing `disc.length === 16` on the unfiltered call. *Response:* the unfiltered `listHints({kind:"discoverability"})` now returns 17 — update those specific assertions; the startup-filtered view stays 16. Grep all `=== 16` / `length === 16` against `listHints`/`discoverability_hints` and classify each as all-rows (bump) vs startup-view (keep).
- **Risk: warm `hint_index` field is a contract addition some consumer rejects.** *Signal:* a test/hook asserts the warm object's exact key set. *Response:* `hint_index` is additive; if a strict-keys assertion exists, add it to the allowlist in the same commit.
- **Risk: the gate-verb-allowance `text` drifts from the actual block-message incantation in `evaluate-bash-gate.js`.** *Signal:* the two copies diverge after a future edit. *Response:* Phase 3 dedup treats the hint as canonical for the static reference and the block message as the dynamic emitter; a test in this phase asserts the shared substring (`gate_mark_preflight({surface:"runtime-state"})` + `runtime_state_record` + the sentinel) appears in both.
- **Risk: the `tier` default direction is wrong.** *Assumption:* default `"startup"` preserves behavior so Phase 1 is inert. *Signal:* warm `discoverability_hints` length changes before Phase 2. *Response:* if it changes, the default flipped to `"on-demand"` by mistake — fix to `"startup"`. Phase 2 is the only phase that intentionally changes the warm set.