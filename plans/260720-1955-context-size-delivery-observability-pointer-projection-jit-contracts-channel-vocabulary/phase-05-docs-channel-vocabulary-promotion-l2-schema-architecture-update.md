---
phase: 5
title: "Docs — channel vocabulary promotion (L2) + schema-architecture update"
status: complete
priority: P2
effort: "2h"
dependencies: [2, 3, 4]
---

# Phase 5: Docs — channel vocabulary promotion (L2) + schema-architecture update

## Overview

Anchor the surfaces this plan changed in the doc layer. **Merge the `channel` term into the EXISTING architecture.md push/pull table** (channel name + delivery-fidelity class `full`/`lean`/`unknown` column) — NO new L2 `runtime-contract.md` section (Validation V3: the concept is already named/exported at `hint-renderer.js:198` and referenced at `architecture.md:514`; a parallel L2 section would duplicate it). Update the zod→wire doc for the JIT off-wiring + glossary. L1 gets one cross-ref line only. `<!-- Updated: Validation Session 1 - V3 merge into existing table -->`

## Context Links

- Brainstorm §5 (L2 choice + rationale)
- `docs/runtime-contract.md` (L2, 44 lines — target of the new section)
- `docs/architecture.md` § Context-Injection Division of Labor (L492-514 — existing push/pull table the channel term merges into)
- `docs/loop-engine.md` (L1 — cross-ref only)
- `docs/mcp-tool-schema-architecture.md` (408 lines — zod→wire flow)

## Key Insights

- The channel concept already exists de-facto at L3: the architecture.md push/pull-warm/pull-single/static table (L503-506) and `hint-renderer.js` CHANNELS map. Phase 5 *names and promotes*, it does not invent — merge vocabulary into the existing table, never a parallel second table (DRY; two-surfaces-must-not-share-vocabulary rule in loop-engine.md § Two surfaces).
- `rule-runtime-agnostic-features` gets its vocabulary anchor: "every injected surface has a declared channel; fidelity is attested (classifier), not assumed."
- State-axis link (documented, not moved): state-2 = deterministic injection ⇒ injection lands on a declared channel; the finding's lesson = channel delivery fidelity varies per provider profile and must be measured at the endpoint.

## Requirements

- Functional:
  1. ~~`docs/runtime-contract.md`: new Channels section~~ — **REMOVED (Validation V3).** The channel term is defined once by merging into the existing architecture.md table (item 2); no parallel L2 section.
  2. `docs/architecture.md`: extend § Context-Injection Division of Labor — merge the channel term into the EXISTING push/pull table (add channel name + fidelity class column); new subsection mapping channels → state axes; pointer + classifier mechanism paragraph (delivery-classify.mjs, once-per-session pointer [Validation V2], honesty flag re: `syn`-profile unverified project-level UPS). **Mandatory (Validation V4):** mark the factory-hook channel as "pointer projection deferred (D3.1 — separate plan)" since Phase 3 deferred the factory hook flip.
  3. `docs/mcp-tool-schema-architecture.md`: update zod→wire flow for JIT off-wiring (branch schemas now ride `invalid_field`/`empty_patch` error payloads; wire patch is free-form + parity `minProperties`) and the field glossary (`core/field-glossary.js` single source, served via `loop_describe` cold tier, loop-owned error points enriched).
  4. `docs/loop-engine.md`: one cross-ref line (state axes → channel term in architecture.md). L1 otherwise untouched.
  5. `tools/learning-loop-mastra/tools/handlers/references/tool-selection-guide.md`: add glossary pointer only. ~~Fix stale `meta_state_ack` line~~ — **DROPPED (Validation V6); ship as a standalone one-line docs commit.**
- Non-functional: docs stay under `docs.maxLoc` 800 per file (architecture.md 513 → keep additions tight); no vocabulary duplication (one channel definition, in the merged table).

## Related Code Files

- Modify: `docs/architecture.md`, `docs/mcp-tool-schema-architecture.md`, `docs/loop-engine.md` (1 line), `tools/learning-loop-mastra/tools/handlers/references/tool-selection-guide.md`
- ~~`docs/runtime-contract.md`~~ — **NOT modified (Validation V3: no new L2 Channels section).**
- Create: none. Delete: none.

## Implementation Steps

1. ~~Write the L2 Channels section (term def → 4 channels table → fidelity classes → attestation path).~~ — **REMOVED (Validation V3).** The channel term is defined by merging into the architecture.md table in step 2.
2. architecture.md: extend the EXISTING push/pull table (add channel name + fidelity-class column) + new channels/state-axes subsection; document the once-per-session pointer line (V2) + classifier + the `syn`-profile honesty flag and documented-degradation fallback. **Mark the factory-hook channel "pointer projection deferred (D3.1 — separate plan)" (Validation V4 — mandatory).** Cross-ref the finding id once.
3. mcp-tool-schema-architecture.md: revise the wire-flow section for JIT + glossary (branch-schema serialization call sites, the `_zod.toJSONSchema` root-sentinel warning stays).
4. loop-engine.md: single cross-ref line in the state-axis area (state axes → channel term in architecture.md).
5. tool-selection-guide.md: glossary pointer only. ~~Stale `meta_state_ack` line fix~~ — **DROPPED (Validation V6); standalone commit.**
6. Verify every claim against shipped code (phases 2-4); verify internal links/anchors resolve. `<!-- Updated: Validation Session 1 - V3/V4/V6 -->`

## Success Criteria

- [x] "Channel" defined once in the merged architecture.md push/pull/channel table (no parallel L2 `runtime-contract.md` section — Validation V3); zero duplicate definitions
- [x] architecture.md table is the single push/pull/channel table (merged, not paralleled); factory-hook channel marked "deferred (D3.1)"
- [x] mcp-tool-schema-architecture.md matches the shipped JIT behavior (a reader can derive the error-payload contract from the doc)
- [x] All edited files ≤ 800 LOC; claims verified against code

## Risk Assessment

- **Vocabulary drift** (channel meaning diverges across docs) → single L2 definition; L3 uses it, L1 only cross-refs.
- **Doc/code drift on JIT specifics** → write docs after phases 2-4 land (dependency), verify claims against final code in step 6.
