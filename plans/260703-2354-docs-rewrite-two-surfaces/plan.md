---
title: "Docs Rewrite by Two Surfaces x Abstraction Levels + Interface Reframe"
description: "Archive AGENTS.md + docs/ and write a fresh docs architecture organized by two surfaces (concept/implementation) x abstraction levels (L0-L4); reframe the runtime interface from MCP-wrapper to transport-agnostic concept contract."
status: pending
priority: P2
branch: "main"
tags: [docs, architecture, interface, direction]
blockedBy: []
blocks: []
created: "2026-07-03T16:55:44.210Z"
createdBy: "ck:plan"
source: skill
---

# Docs Rewrite by Two Surfaces x Abstraction Levels + Interface Reframe

## Overview

After Phase E closed (2026-06-30), the operator clarified the project direction as **one engine**: *agentic deferral → recorded as finding/change-log → promoted to a rule when it recurs → becomes deterministic*. "Learning" = the deterministic surface grows. The blocker is **vocabulary bloat**: the loop's concept vocabulary (deterministic-step / agentic-step / record / rule / promotion) is unnamed (`grep "agentic|deterministic"` across `philosophy.md`, `trajectory.md`, `AGENTS.md` returns zero hits), so every shared word ("agent", "workflow", "memory") defaults to its Mastra meaning and the concept layer collides with the implementation layer.

This plan executes two operator-approved directives:
1. **Archive `AGENTS.md` + `docs/` and write a fresh docs architecture** by two surfaces × abstraction levels. Do not port old content; write top-to-bottom at clean levels. Philosophy: md is debt owned by the loop — procedural knowledge is loop-encoded, not doc'd.
2. **Reframe the runtime interface** from a mechanism-only MCP-wrapper contract to a transport-agnostic concept contract ("what a runtime must *be* to participate"), with MCP as one transport.

Directive 3 (the promotion-engine wiring: recurrence→promotion bridge + agentic/deterministic provenance in the registry schema) is **deferred to the next session** — scouted, noted as open questions in the L1 doc, not implemented here.

**Intended outcome:** a minimal `docs/` where every file sits at one declared abstraction level (tagged in a header comment), the concept surface (L0/L1) is implementation-agnostic, the implementation surface (L2/L3/L4) names the realization, and the interface is stated in concept terms before mechanism terms.

## Abstraction taxonomy (locked)

| Level | Band | Content | Surface |
|-------|------|---------|---------|
| L0 | philosophy/why | irreducible judgment; escape-hatch gradient, "docs are debt", adversarial mindset | concept |
| L1 | concept/theory | engine invariant, concept vocab (deterministic-step/agentic-step/record/rule/promotion), 4-kind union, two-surface split | concept |
| L2 | architecture+contract | 3-layer arch, runtime participation contract — transport-agnostic bridge | implementation |
| L3 | mechanism | Mastra primitives, gate system internals, schema reference, file placement | implementation |
| L4 | procedure | residual escape-hatch runbook (most procedure → loop-encoded, not doc'd) | implementation |

Rule: a doc at level L references only levels ≤ L. Concept surface = {L0,L1}; Implementation surface = {L2,L3,L4}; L2 is the bridge (transport-agnostic but names the architecture).

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Archive stale docs + light-touch keeps](./phase-01-archive-stale-docs-light-touch-keeps.md) | Pending |
| 2 | [Write loop-engine.md (L1 concept)](./phase-02-write-loop-engine-md-l1-concept.md) | Pending |
| 3 | [Interface reframe (L2 runtime-contract)](./phase-03-interface-reframe-l2-runtime-contract.md) | Pending |
| 4 | [Rewrite architecture.md (L3)](./phase-04-rewrite-architecture-md-l3.md) | Pending |
| 5 | [Rewrite AGENTS.md thin + citations + trajectory.md compaction](./phase-05-rewrite-agents-md-thin-citations.md) | Pending |
| 6 | [Stop auto-writer + verify](./phase-06-stop-auto-writer-verify.md) | Pending |

Phase dependencies: 2,3,4 blockedBy 1 · 5 blockedBy 2,3,4 · 6 blockedBy 5.

## Dependencies

- **Cross-plan conflict (NOT absorbs):** `plans/260626-1535-phase-e-stale-sweep-fix` (pending) is a registry-lifecycle corrective batch, NOT a docs-sweep plan. One of its meta-state entries cites `docs/mcp-server-restart-protocol.md` as `evidence_code_ref`; Phase 1 archives that file. Phase 1 MUST patch that entry's `evidence_code_ref` to the archived path (via `meta_state_patch` + `meta_state_refresh_file_index`) so the sweep-fix plan's grounding check survives. This plan does NOT absorb the sweep-fix plan; the two are file-conflicting, resolved by the path-patch.
- **Out of scope (forensic):** `tools/learning-loop-mastra/tools/legacy/references/*.md` (7 substrate-era prompt-blueprint files) cite archived docs (`operator-guide.md`, `artifact-concepts.md`, `record-system-architecture.md`). No runtime code consumes them (verified). Their citations are historical and acceptable; this plan does NOT repoint them.
- **No code-contract changes outside `interface/` + `meta-state-sweep-tool.js`** — `core/` logic, gate logic, and tool behavior are untouched. This is a docs + interface-framing change, not a behavior change. The 2 structural tests pinning AGENTS.md §1/§1.1 stay green because thin AGENTS retains those phrases verbatim PLUS the lowercase `meta-surface` / `4-kind` / `product surface` phrases `agents-section-1-layers.test.js` asserts anywhere in the file.

## Acceptance criteria

- [ ] `docs/` contains only leveled docs: `philosophy.md` (L0), `trajectory.md` (L0), `loop-engine.md` (L1, new), `meta-state-lifecycle.md` (L1), `review-discipline.md` (L1, renamed), `runtime-contract.md` (L2, new), `architecture.md` (L3, rewritten), `security/`, `mcp-tool-schema-architecture.md`, `journals/`, `_archive-260703/`.
- [ ] Each new/rewritten doc opens with `<!-- level: L<n> | surface: <concept|implementation> -->`.
- [ ] `loop-engine.md` (L1) contains zero Mastra terms and zero file paths; `architecture.md` (L3) names them.
- [ ] `runtime-contract.md` (L2) states 4 transport-agnostic capabilities + many-to-many transport mapping; `interface/contract.js` reframed as "MCP-transport conformance validator (1 of N)" with `transport: "mcp"` slot; logic unchanged.
- [ ] `AGENTS.md` rewritten thin: §1/§1.1 verbatim (tests pass) + 4-kind union + pointers into `docs/`.
- [ ] All stale `learning-loop-mcp` path refs removed from new docs + AGENTS.md + README.md + CLAUDE.md.
- [ ] `docs/registry-summary.md` no longer written by `meta_state_sweep`; vnstock installer + appendix dropped.
- [ ] `pnpm test` — all 10 namespaces pass; `agents-section-1-layers.test.js` + `agents-md-layer-locations.test.js` green.
- [ ] `node tools/learning-loop-mastra/interface/contract.js {claude-code,factory,mastra-code}` passes for all 3 runtimes.

## Open questions (deferred, not blocking)

1. Should `docs/journals/` eventually move to repo-root `/journals/` (would force `evidence_journal` path updates across `meta-state.jsonl` + plans)? Deferred — keep in place this pass.
2. Thin AGENTS.md keeps §6 (internalization rule) + §11 (R2 ownership) as brief contract anchors (cited by code/tests) — confirm vs fully pointing to docs.
3. A future library-transport runtime has no surface dir — `SURFACES` + storage model may need a non-dir surface concept. Noted in `runtime-contract.md` as a forward question; not solved here.
4. **Directive 3 (next session):** the recurrence→promotion bridge + agentic/deterministic provenance field in `core/meta-state.js`. Noted as open questions in `loop-engine.md`; scout report in prior predict/problem-solving reports is the input.