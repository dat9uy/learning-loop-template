---
phase: 5
title: "AGENTSmdSection1"
status: pending
priority: P2
dependencies: [2, 3, 4]
effort: "0.5h"
---

# Phase 5: AGENTS.md §1 — Name the 3 Layers

## Overview

Per the scope report § E.1(d): "Update `AGENTS.md §1` to name the 3 layers explicitly: Core / Mastra shell / Runtime interface." This phase adds the 3-layer naming to §1 while preserving the existing content (meta-surface, 4-kind union, product-surface reframe). Test #4 from Phase 1 (AGENTS.md §1 names the 3 layers) turns green here.

## Requirements

- Functional: AGENTS.md §1 explicitly names "Core", "Mastra shell", and "Runtime interface" as the 3 layers of the architecture.
- Non-functional: the rewrite does NOT remove or modify the existing §1 content (meta-surface as the only bound surface, the 4-kind discriminated union, the product-surface reframe). Only additions, no deletions.

## Architecture

**The 3 layers (per the scope report § "Proposed structure"):**

```
┌────────────────────────────────────────────────────────────┐
│  Layer 1: Runtime Interface (Claude Code / Droid / Mastra)│
│  - Implements the 5 contract requirements                  │
│  - .claude/, .factory/, .mastracode/                       │
└─────────────────────────┬──────────────────────────────────┘
                          │ satisfies
┌─────────────────────────▼──────────────────────────────────┐
│  Layer 2: Mastra Shell (imperative)                        │
│  - server.js + create-loop-{tool,workflow,agent}.js        │
│  - factories: wraps core in createTool/createWorkflow      │
└─────────────────────────┬──────────────────────────────────┘
                          │ wraps
┌─────────────────────────▼──────────────────────────────────┐
│  Layer 3: Core (functional)                                │
│  - meta-state.js, gate-logic.js, schemas                   │
│  - FCIS invariant: zero @mastra/* imports                  │
└────────────────────────────────────────────────────────────┘
```

**Where this goes in AGENTS.md §1:** the scope report says "Update `AGENTS.md §1` to name the 3 layers." The current §1 starts with a 4-row table describing the meta-surface (4 kinds). The 3-layer architecture is a CONTAINER for §1's content — the meta-surface is implemented by the 3 layers (Core owns the data model, Mastra shell owns the tool surface, Runtime interface owns the agent runtime).

**RED-TEAM CORRECTION (2026-06-25):** the original plan's attack-vector #7 referenced an "interface word collision" — verified false. `grep -in "interf" AGENTS.md` returns ZERO matches. The §2 "Protocol Adapter" doesn't contain "interface". HOWEVER: there is still a SEMANTIC distinction worth noting in §1.1 — "Runtime interface" (Layer 3, the contract for runtime integration) is a different concept from "Protocol Adapter" (§2, the hook I/O normalizer for surface-to-surface translation). The rewrite ADDS a one-line disambiguation to §1.1.

**Preserve, don't replace:** the existing §1 content is correct and load-bearing. The rewrite ADDS a "Layer architecture" subsection that names the 3 layers AND a one-line mapping (Core → data model, Mastra shell → tool surface, Runtime interface → agent runtime). The existing 4-kind table stays.

**Insertion order (red-team H11):** §1.1 (h3) is inserted BEFORE §1's h2 body. This is markdown-legal (h3-before-h2) and intentional — it leads with the framing (the 3 layers) before the meta-surface content. Readers see the architecture first, then the specifics.

## Related Code Files

- Modify: `AGENTS.md` §1 (~30 LoC added; 0 LoC removed)
- Modify: `tools/learning-loop-mastra/__tests__/phase-e-foundation/agents-section-1-layers.test.js` (Phase 1's test — verify it's strong enough)

## Implementation Steps

1. **Read AGENTS.md §1 to confirm the existing structure.**
   - Confirmed (2026-06-24, pre-plan): §1 starts with "## 1. The Meta-Surface (the only bound surface)"; contains the 4-row table for `finding | change-log | rule | loop-design`; explains why meta-surface is the only bound surface; ends with a paragraph on the substrate.
   - Total §1 length: ~30 lines.

2. **Add the "Layer architecture" subsection to §1.**
   - Insert AFTER the §1 title and BEFORE the meta-surface table.
   - **New subsection heading:** `### 1.1 The 3 layers (Core / Mastra shell / Runtime interface)`
   - **Content:**
     - 3 paragraphs, one per layer, naming it, stating its role, and pointing at the canonical directory.
     - **Layer 1 — Core (functional).** "Pure logic. Zero `@mastra/*` imports. Lives at `tools/learning-loop-mastra/core/`. Codifies the FCIS invariant (see `core/README.md`). Owns: meta-state, gate decisions, schema validation, fingerprint computation, drift detection."
     - **Layer 2 — Mastra shell (imperative).** "Wraps core in Mastra framework primitives. Lives at `tools/learning-loop-mastra/` (top level): `server.js`, `create-loop-{tool,workflow,agent}.js`, `workflows/`, `agents/`, `tools/`. May import core; core may NOT import the shell."
     - **Layer 3 — Runtime interface (contract).** "The contract that agent runtimes sign to integrate with the loop. Lives at `tools/learning-loop-mastra/interface/` (NEW in Phase E.1b, Plan 2 of this scope report). A runtime satisfies the 5 contract requirements (see `interface/CONTRACT.md`, ship in Plan 2)."
     - **Diagram:** ASCII tree (3 boxes, arrows showing the one-way dependency).
     - **Mapping:** "The meta-surface (the only bound surface) is implemented by all 3 layers: Core owns the data model, Mastra shell owns the tool surface, Runtime interface owns the agent runtime."

3. **Update §1's "lives in one place" line to also mention the 3 layers.**
   - Original: "The meta-surface lives in one place: `meta-state.jsonl` at the project root."
   - Updated: "The meta-surface lives in one place: `meta-state.jsonl` at the project root. It is implemented across the 3 layers (see §1.1): Core owns the data model, Mastra shell owns the tool surface, Runtime interface owns the agent runtime."
   - One sentence added; the original sentence is preserved.

4. **Cross-link from §1.1 to the new artifacts.**
   - "Layer 1 (Core) → see `tools/learning-loop-mastra/core/README.md` for the FCIS invariant"
   - "Layer 2 (Mastra shell) → see `tools/learning-loop-mastra/server.js` for the MCPServer entry"
   - "Layer 3 (Runtime interface) → see `tools/learning-loop-mastra/interface/CONTRACT.md` (ships in Plan 2)"

5. **Verify Test #4 turns green.**
   - `node --test tools/learning-loop-mastra/__tests__/phase-e-foundation/agents-section-1-layers.test.js`
   - Asserts the first 100 lines of AGENTS.md contain "Core", "Mastra shell", "Runtime interface" AND preserve "meta-surface", "4-kind", "product surface".
   - Expected: passes.

6. **Verify the original §1 content is preserved.**
   - Diff AGENTS.md before/after this phase.
   - Expected: only additions, no removals (besides the one-sentence update in step 3).

7. **Run the full test suite.**
   - `pnpm test`
   - Expected: all tests pass.

8. **Commit.**
   - One commit: `docs(phase-e): name 3 layers in AGENTS.md §1 (Core / Mastra shell / Runtime interface)`
   - Body: `Plan 1 (Foundation) §5. Preserves the existing §1 content (meta-surface, 4-kind union, product-surface reframe); only additions. Test #4 (AGENTS.md §1 layers) now passes.`

## Success Criteria

- [ ] AGENTS.md §1.1 (new subsection) exists; contains "Core", "Mastra shell", "Runtime interface"
- [ ] The original §1 content (meta-surface, 4-kind table, product-surface reframe, substrate paragraph) is preserved verbatim
- [ ] The "lives in one place" line is updated to mention the 3 layers (1 sentence added, original preserved)
- [ ] Cross-links to `core/README.md`, `server.js`, and `interface/CONTRACT.md` are present
- [ ] Test #4 (AGENTS.md §1 layers) passes
- [ ] All 1189+ existing tests still pass
- [ ] The 4-phase test suite (`__tests__/phase-e-foundation/`) is now 4/4 green

## Risk Assessment

- **R1 (rewriting §1 removes or modifies existing content):** the test asserts preservation (key phrases like "meta-surface", "4-kind", "product surface"). Mitigation: only ADDITIONS, no removals (the diff must show only `+` lines, no `-` lines except inside updated sentences where the original is preserved).
- **R2 (the 3-layer diagram is unclear):** use a plain ASCII tree (3 boxes, arrows), not Unicode emoji or special characters. The current AGENTS.md uses ASCII tables (the 4-kind table); the new diagram matches that style.
- **R3 (the cross-link to `interface/CONTRACT.md` is broken because the file doesn't exist yet):** the cross-link is forward-pointing (Plan 2 ships the file). Mitigation: the link is a relative path; if the file is absent, the link is broken text. Acceptable for now (Plan 1 ships first; Plan 2 follows). Alternatively, use a "[link to Plan 2 — ships in Phase E.1b]" placeholder.
- **R4 (Test #4 false positive on a doc that mentions the 3 strings but doesn't name them as layers):** the test checks for the exact strings, not the semantic meaning. A doc that says "the runtime interface could be Core, Mastra shell, or Runtime interface" would pass the test. Mitigation: the test also asserts the layer order ("Core" appears before "Mastra shell" which appears before "Runtime interface") and the cross-link presence.

## Diff Sketch (expected, post-Phase 5)

```diff
 # AGENTS.md — Agent Surfaces Reference

+### 1.1 The 3 layers (Core / Mastra shell / Runtime interface)
+
+The meta-surface is implemented across 3 layers:
+
+- **Core (functional).** Pure logic. Zero `@mastra/*` imports. Lives at
+  `tools/learning-loop-mastra/core/`. Codifies the FCIS invariant (see
+  `core/README.md`). Owns: meta-state, gate decisions, schema validation,
+  fingerprint computation, drift detection.
+
+- **Mastra shell (imperative).** Wraps core in Mastra framework primitives.
+  Lives at `tools/learning-loop-mastra/` (top level): `server.js`,
+  `create-loop-{tool,workflow,agent}.js`, `workflows/`, `agents/`, `tools/`.
+  May import core; core may NOT import the shell.
+
+- **Runtime interface (contract).** The contract that agent runtimes sign
+  to integrate with the loop. Lives at `tools/learning-loop-mastra/interface/`
+  (NEW in Phase E.1b, ships in Plan 2). A runtime satisfies the 5 contract
+  requirements (see `interface/CONTRACT.md`).
+
+```
+┌────────────────────────────────────────────────────────────┐
+│  Layer 3: Runtime Interface                                │
+└─────────────────────────┬──────────────────────────────────┘
+                          │ satisfies
+┌─────────────────────────▼──────────────────────────────────┐
+│  Layer 2: Mastra Shell                                     │
+└─────────────────────────┬──────────────────────────────────┘
+                          │ wraps
+┌─────────────────────────▼──────────────────────────────────┐
+│  Layer 1: Core                                             │
+└────────────────────────────────────────────────────────────┘
+```
+
 ## 1. The Meta-Surface (the only bound surface)

-The meta-surface lives in one place: `meta-state.jsonl` at the project root.
+The meta-surface lives in one place: `meta-state.jsonl` at the project root.
+It is implemented across the 3 layers (see §1.1): Core owns the data model,
+Mastra shell owns the tool surface, Runtime interface owns the agent runtime.

 [rest of §1 unchanged]
```

## Test Output Reference (expected green state, post-Phase 5)

```text
$ node --test tools/learning-loop-mastra/__tests__/phase-e-foundation/agents-section-1-layers.test.js
# Subtest: AGENTS.md §1 names the 3 layers
# First 100 lines contain: Core, Mastra shell, Runtime interface
# Original content preserved: meta-surface, 4-kind, product surface
ok 1 - AGENTS.md §1 names the 3 layers
```
