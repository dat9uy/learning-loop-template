---
title: "Phase B — Codegen Adoption (B3-B6)"
description: "Apply Bridge 5 codegen to the remaining meta_state_* tools (closes LIM-7), fix LIM-2 script-caller passthrough bug, and promote the Bridge 5 loop-design to inactive. Atomic B3+B4 unit + small B5 bug fix + trivial B6 flip. 3 phases, ~6-7 hours total, stacked PR series on a feature branch off main."
status: pending
priority: P1
branch: "main"
tags: [meta, mcp-tools, meta-state, bridge-5, codegen, tdd, passthrough-fix]
blockedBy: ["260613-1853-phase-b-bridge-5-core-fix"]
blocks: ["phase-c", "phase-d", "phase-e", "phase-f"]
created: "2026-06-14T06:09:33.243Z"
createdBy: "ck:plan"
source: skill
related:
  - plans/reports/productization-260612-1530-master-tracker.md (master tracker; Phase B status; 2026-06-14 scoping decision)
  - plans/reports/brainstorm-260612-1530-bridge-5-schema-as-source-of-truth.md (Report 2; original Bridge 5 design proposal)
  - plans/reports/brainstorm-260613-1146-phase-b-bridge-5-core-fix.md (B1+B2 scoping + design adaptation; this plan extends from B1+B2)
  - plans/260613-1853-phase-b-bridge-5-core-fix/ (B1+B2 plan; this plan is B3-B6)
  - meta-260612T1131Z-next-up-adopt-loop-design-schema-as-source-of-truth-bridge-5 (target finding for B6 resolution)
  - meta-260612T0058Z-next-up-wire-format-quirk-on-meta-state-patch-proposed-desig (target finding already resolved 2026-06-13)
  - loop-design-schema-as-source-of-truth-bridge-5-derive-tool-schemas-from (loop-design entry; flips to inactive in B6)
  - tools/learning-loop-mcp/core/meta-state.js#metaStateEntrySchema (source of truth; 4 per-kind branches)
  - tools/learning-loop-mcp/tools/meta-state-patch-tool.js (B2 reference migration; pattern to replicate)
  - tools/learning-loop-mcp/tools/meta-state-report-tool.js (B3 candidate; already uses `metaStateFindingEntrySchema.shape` — pattern reference)
  - tools/learning-loop-mcp/tool-registry.js:77-134 (`coerceParamsToSchema`; B3 generated schemas must compose with it)
  - tools/learning-loop-mcp/tool-registry.js:197-235 (`installWireFormatCoercion`; same)
  - __tests__/meta-state-patch-derived-schema.test.js (B2's TDD pattern; reuse for B3)
---

# Phase B — Codegen Adoption (B3-B6)

## Overview

B1+B2 (shipped 2026-06-13) fixed the structural blocker behind `meta_state_patch` — `buildPatchSchemaFor(kind)` + `PATCH_KINDS` inlined in `core/meta-state.js`, the patch tool wired to a per-kind union schema, 9 ad-hoc reader patches reverted. **B3-B6 extends the codegen to the remaining `meta_state_*` tools and closes the loop on the Bridge 5 design.**

**Scope (locked by 2026-06-14 master-tracker update):** B3+B4 atomic unit (codegen adoption + verification gate, stacked PR strategy). B5 re-scoped to fix LIM-2 script-caller passthrough bug only; LIM-1 full-codegen-engine recreation deferred as YAGNI for current meta-surface scope (parked as Bridge 7 `loop-design` dependency). B6 post-merge flip of the active `loop-design-schema-as-source-of-truth-bridge-5-derive-tool-schemas-from` entry to `status: inactive`. Hardening LIMs (3, 4, 5, 6, 8, 9) out of scope — separate security/quality audit.

**Actual codegen scope (B3 finding):** of the 22 MCP tools that hand-write Zod, ~5-7 are genuine candidates for codegen (entry-creating tools whose schemas can derive from `metaState<Kind>EntrySchema.shape` or a partial projection). The rest have tool-specific filter/parameter schemas that don't benefit from codegen. B3 migrates the genuine candidates; the rest stay hand-written (they're already optimal).

## Phases

| Phase | Name | Status | Effort | TDD Color | Dependencies |
|-------|------|--------|--------|-----------|--------------|
| 1 | [B3+B4 codegen adoption and verification](./phase-01-b3-b4-codegen-adoption-and-verification.md) | Pending | ~5-6h | RED → GREEN (per-tool, TDD-first) | B1+B2 (shipped 2026-06-13) |
| 2 | [B5 LIM-2 script-caller passthrough fix](./phase-02-b5-lim-2-script-caller-passthrough-fix.md) | Pending | ~1h | RED → GREEN (3-5 tests) | Phase 1 |
| 3 | [B6 loop-design flip](./phase-03-b6-loop-design-flip.md) | Pending | ~5min | n/a (one-line metadata flip) | Phase 1 + Phase 2 + green CI |

**Total effort:** ~6-7 hours. One session. Stacked PR series on a feature branch off main (PR #1: read-only tool migration; PR #2: writer migration; PR #3: B5 LIM-2 fix; B6 done as final commit on PR #3 or as a post-merge commit per the master tracker's "post-merge flip" rule).

## Dependencies

**Blocked by:**
- `260613-1853-phase-b-bridge-5-core-fix` (B1+B2 shipped 2026-06-13; provides `buildPatchSchemaFor` + the TDD pattern + the `metaStateEntrySchema` 4-branch source of truth)

**Blocks:**
- `phase-c`, `phase-d`, `phase-e`, `phase-f` (Mastra migration phases + Bridge 7; C-D-E depend on Bridge 5 engine being adopted, F depends on the loop-design flip in B6)

**Out of scope (separate audit track):**
- LIM-3 (caller identity), LIM-4 (path traversal, security priority), LIM-5 (test harness), LIM-6 (idempotency cache + silent gate-log), LIM-8 (3 workflow tool passthroughs), LIM-9 (`meta_state_batch` update op passthrough) — confirmed "next-up" per operator 2026-06-14; separate security/quality audit session
- LIM-1 (full `core/schema-to-zod.js` recreation) — YAGNI for current meta-surface scope; parked as `loop-design` entry behind Bridge 7
