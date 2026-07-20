---
phase: 5
title: "Docs — channel vocabulary promotion (L2) + schema-architecture update"
status: pending
priority: P2
effort: "2h"
dependencies: [2, 3, 4]
---

# Phase 5: Docs — channel vocabulary promotion (L2) + schema-architecture update

## Overview

Anchor the surfaces this plan changed in the doc layer. Promote **channel** to an L2 contract term (a named projection of canonical content onto a runtime surface, with declared shape, char budget, provenance, and delivery-fidelity class `full`/`lean`/`unknown`), map channels to mechanisms at L3, and update the zod→wire doc for the JIT off-wiring + glossary. L1 gets one cross-ref line only.

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
  1. `docs/runtime-contract.md`: new **Channels** section — term definition; the 4 current channels (SessionStart additionalContext ×2 [discoverability/process hooks], UserPromptSubmit [inbound gate], MCP `tools/list`, `.claude/session-context.json` sidecar pull); delivery-fidelity classes + attestation path (`delivery-<sessionId>` classifier rows in `runtime-state.jsonl`).
  2. `docs/architecture.md`: extend § Context-Injection Division of Labor — merge the channel term into the existing push/pull table (add channel name + fidelity class column); new subsection mapping channels → state axes; pointer + classifier mechanism paragraph (delivery-classify.mjs, always-emit pointer, honesty flag re: `syn`-profile unverified project-level UPS).
  3. `docs/mcp-tool-schema-architecture.md`: update zod→wire flow for JIT off-wiring (branch schemas now ride `invalid_field`/`empty_patch` error payloads; wire patch is free-form + parity `minProperties`) and the field glossary (`core/field-glossary.js` single source, served via `loop_describe` cold tier, loop-owned error points enriched).
  4. `docs/loop-engine.md`: one cross-ref line (state axes → L2 channel term). L1 otherwise untouched.
  5. `tools/learning-loop-mastra/tools/handlers/references/tool-selection-guide.md`: add glossary pointer (file already stale re: removed `meta_state_ack` — fix that line while nearby).
- Non-functional: docs stay under `docs.maxLoc` 800 per file (architecture.md 513 → keep additions tight); no vocabulary duplication across L1/L2/L3.

## Related Code Files

- Modify: `docs/runtime-contract.md`, `docs/architecture.md`, `docs/mcp-tool-schema-architecture.md`, `docs/loop-engine.md` (1 line), `tools/learning-loop-mastra/tools/handlers/references/tool-selection-guide.md`
- Create: none. Delete: none.

## Implementation Steps

1. Write the L2 Channels section (term def → 4 channels table → fidelity classes → attestation path). Cross-ref the finding id once.
2. architecture.md: extend the existing table + new channels/state-axes subsection; document the pointer line + classifier + the `syn`-profile honesty flag and documented-degradation fallback.
3. mcp-tool-schema-architecture.md: revise the wire-flow section for JIT + glossary (branch-schema serialization call sites, the `_zod.toJSONSchema` root-sentinel warning stays).
4. loop-engine.md: single cross-ref line in the state-axis area.
5. tool-selection-guide.md: glossary pointer + stale `meta_state_ack` line fix.
6. Verify every claim against shipped code (phases 2-4); verify internal links/anchors resolve.

## Success Criteria

- [ ] "Channel" defined once at L2, used consistently at L3; zero duplicate definitions
- [ ] architecture.md table is the single push/pull/channel table (merged, not paralleled)
- [ ] mcp-tool-schema-architecture.md matches the shipped JIT behavior (a reader can derive the error-payload contract from the doc)
- [ ] All edited files ≤ 800 LOC; claims verified against code

## Risk Assessment

- **Vocabulary drift** (channel meaning diverges across docs) → single L2 definition; L3 uses it, L1 only cross-refs.
- **Doc/code drift on JIT specifics** → write docs after phases 2-4 land (dependency), verify claims against final code in step 6.
