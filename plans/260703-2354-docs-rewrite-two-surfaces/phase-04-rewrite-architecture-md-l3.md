---
phase: 4
title: "Rewrite architecture.md (L3)"
status: pending
effort: "1d"
priority: P2
dependencies: [1]
---

# Phase 4: Rewrite architecture.md (L3)

## Overview
Rewrite `docs/architecture.md` from the archived `system-architecture.md`, fixing the 8 stale `learning-loop-mcp` path refs + 4 product-surface hits. This is the one doc that names Mastra primitives + paths in depth: the 3-layer architecture, gate system internals, meta-state SP table.

## Requirements
- Functional: `docs/architecture.md` exists (L3 tag), covers the 3-layer architecture (Core/Shell/Runtime-interface), gate system internals (inbound/outbound/MCP tool flows, staleness), meta-state stored-procedure table, the mermaid diagram. All paths point at `tools/learning-loop-mastra/mastra/server.js` (not the deleted `learning-loop-mcp`).
- Non-functional: ≤ ~800 LOC (docs.maxLoc). L3 references L0–L3 only.

## Architecture
The doc is the implementation-surface companion to `runtime-contract.md` (L2): where the contract states the 4 capabilities transport-agnostically, `architecture.md` shows the mechanism that realizes them today (the gate system, the MCP tool flow, the 3 layers). It names: `core/surfaces.js` SURFACES (storage fan-out), `core/runtime-agnostic-checklist.js` (feature-code auditor), the gate modules, the 3-layer path invariants — i.e. the L3 mechanism detail the L2 contract points at.

## Related Code Files
- Create: `docs/architecture.md` (rewrite from `docs/_archive-260703/system-architecture.md` — wait: that file was NOT archived in Phase 1; `system-architecture.md` is the source. Archive it as part of this phase's rewrite: the old becomes `_archive-260703/system-architecture.md`, the new is `docs/architecture.md`.)
- Read: `docs/_archive-260703/` is not where system-architecture went — see correction below.
- Correction: `docs/system-architecture.md` was NOT in the Phase 1 archive list (it was "migrate-to-L3, rewrite"). So in this phase: `git mv docs/system-architecture.md docs/_archive-260703/` AFTER extracting content, then write the new `docs/architecture.md`. Simpler: read `docs/system-architecture.md`, write `docs/architecture.md`, then `git mv` the old into the archive.
- Reference (read-only): `tools/learning-loop-mastra/core/gate-logic.js`, `core/surfaces.js`, `core/runtime-agnostic-checklist.js`, `core/loop-introspect.js`, `mastra/server.js` — to confirm path correctness.

## Implementation Steps
1. Read `docs/system-architecture.md` (current). Extract the load-bearing content: 3-layer arch, gate flow diagram, staleness algorithms, the existing F-items known-issues (F1, F2, F3, F4, F8, F11, F12, F13 — only these 8 exist in the file; do NOT hunt for or invent F5–F7/F9/F10), meta-state SP table.
2. Fix the 8 `learning-loop-mcp` path refs → `tools/learning-loop-mastra/...`; remove/replace the 4 product-surface hits (product surface is unbound per `loop-engine.md`).
3. Add L3 level tag. Add a short pointer to `runtime-contract.md` (L2) for the transport-agnostic capability contract, and to `loop-engine.md` (L1) for the engine.
4. Write `docs/architecture.md`. Then `git mv docs/system-architecture.md docs/_archive-260703/`.
5. Verify the mermaid diagram still renders (paths corrected).

## Success Criteria
- [ ] `docs/architecture.md` exists (L3 tag); `docs/system-architecture.md` archived.
- [ ] `grep -rn "learning-loop-mcp" docs/architecture.md` returns 0 hits.
- [ ] 3-layer arch + gate flow + staleness + meta-state SP table all present.
- [ ] `grep -rn "product-surface\|decisions/.*experiments\|risks/" docs/architecture.md` returns 0 product-surface hits.
- [ ] LOC ≤ 800.

## Risk Assessment
- **Risk:** losing the known-issues detail in the rewrite. **Mitigation:** the 8 existing F-items (F1–F4, F8, F11–F13) are load-bearing for gate debugging; copy them over verbatim, only fixing path refs. Do not summarize them away. Do not invent the missing F5–F7/F9/F10.
- **Risk:** the mermaid diagram references deleted paths. **Mitigation:** re-render check; fix node labels.