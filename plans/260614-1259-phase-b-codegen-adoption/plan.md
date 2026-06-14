---
title: "Phase B — Codegen Adoption (B3-B6)"
description: "Apply Bridge 5 codegen to the remaining viable meta_state_* tools (closes LIM-7): only meta_state_log_change and meta_state_propose_design are genuine candidates after red-team review. Re-triage and fix LIM-2 script-caller passthrough without using z.intersection. Promote the Bridge 5 loop-design to inactive. Reduced scope: 2 migrations + 1 small bug fix + trivial B6 flip. 3 phases, ~3-4 hours total, stacked PR series on a feature branch off main."
status: completed
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

**Scope (locked by 2026-06-14 master-tracker update + red-team review):** B3+B4 atomic unit: migrate only `meta_state_log_change` and `meta_state_propose_design` using derived projections (`.pick()` / `.merge()`). `meta_state_promote_rule`, `meta_state_batch`, `meta_state_resolve`, and `meta_state_supersede` are reclassified as NOT candidates. B5 re-scoped to re-triage LIM-2 and apply a coercion-safe fix (no `z.intersection`). B6 post-merge flip of the active `loop-design-schema-as-source-of-truth-bridge-5-derive-tool-schemas-from` entry to `status: inactive`. Hardening LIMs (3, 4, 5, 6, 8, 9) out of scope — separate security/quality audit.

**Actual codegen scope (B3 finding):** after red-team review, only 2 tools are genuine candidates for codegen:
- `meta_state_log_change` — partial `.pick()` from `metaStateChangeEntrySchema.shape`.
- `meta_state_propose_design` — partial `.pick()` + `.merge({ loop_design_id })` from `metaStateLoopDesignSchema.shape`.

`meta_state_report` is already migrated. All other entry-creating tools have tool-level parameters or intentionally loose handler-validated schemas that do not benefit from codegen.

## Phases

| Phase | Name | Status | Effort | TDD Color | Dependencies |
|-------|------|--------|--------|-----------|--------------|
| 1 | [B3+B4 codegen adoption and verification](./phase-01-b3-b4-codegen-adoption-and-verification.md) | Completed | ~2-3h | RED → GREEN (per-tool, TDD-first) | B1+B2 (shipped 2026-06-13) |
| 2 | [B5 LIM-2 script-caller passthrough fix](./phase-02-b5-lim-2-script-caller-passthrough-fix.md) | Completed | ~1h | RED → GREEN (3-5 tests) | Phase 1 |
| 3 | [B6 loop-design flip](./phase-03-b6-loop-design-flip.md) | Completed | ~5min | n/a (one-line metadata flip) | Phase 1 + Phase 2 + green CI |

**Total effort:** ~3-4 hours. One session. Stacked PR series on a feature branch off main (PR #1: `meta_state_log_change`; PR #2: `meta_state_propose_design` + B5 fix; B6 done as final commit on PR #2 or as a post-merge commit per the master tracker's "post-merge flip" rule).

## Dependencies

**Blocked by:**
- `260613-1853-phase-b-bridge-5-core-fix` (B1+B2 shipped 2026-06-13; provides `buildPatchSchemaFor` + the TDD pattern + the `metaStateEntrySchema` 4-branch source of truth)

**Blocks:**
- `phase-c`, `phase-d`, `phase-e`, `phase-f` (Mastra migration phases + Bridge 7; C-D-E depend on Bridge 5 engine being adopted, F depends on the loop-design flip in B6)

**Out of scope (separate audit track):**
- LIM-3 (caller identity), LIM-4 (path traversal, security priority), LIM-5 (test harness), LIM-6 (idempotency cache + silent gate-log), LIM-8 (3 workflow tool passthroughs), LIM-9 (`meta_state_batch` update op passthrough) — confirmed "next-up" per operator 2026-06-14; separate security/quality audit session
- LIM-1 (full `core/schema-to-zod.js` recreation) — YAGNI for current meta-surface scope; parked as `loop-design` entry behind Bridge 7

## Red Team Review

### Session — 2026-06-14
**Findings:** 11 (11 accepted, 0 rejected)  
**Severity breakdown:** 4 Critical, 6 High, 1 Medium  
**Adjudication report:** `plans/260614-1259-phase-b-codegen-adoption/reports/from-code-reviewer-to-planner-red-team-adjudication-report.md`

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Phase 2 `z.intersection` breaks wire-format coercion | Critical | Accept | Phase 2 |
| 2 | Phase 2 `z.intersection` with `.strict()` rejects legitimate patch fields | Critical | Accept | Phase 2 |
| 3 | `meta_state_promote_rule` is NOT a genuine codegen candidate | Critical | Accept | Phase 1 |
| 4 | `meta_state_batch` migration is mis-scoped and should be deferred | Critical | Accept | Phase 1 |
| 5 | `meta_state_log_change` `.shape` swap exposes handler-generated fields | High | Accept | Phase 1 |
| 6 | `meta_state_propose_design` `.shape` swap drops `loop_design_id` and widens `affected_system` | High | Accept | Phase 1 |
| 7 | `meta_state_resolve` partial projection would drop `cascade_from` | High | Accept | Phase 1 |
| 8 | `meta_state_supersede` partial projection would drop `_expected_version` | High | Accept | Phase 1 |
| 9 | `meta_state_report` `.shape` pattern is mischaracterized as "simplest" | High | Accept | Phase 1 |
| 10 | "864-test baseline" is stale | High | Accept | Phase 1, Phase 2 |
| 11 | B6 loop-design flip has unhandled CAS race | Medium | Accept | Phase 3 |

### Whole-Plan Consistency Sweep
- **Files reread:** `plan.md`, `phase-01-b3-b4-codegen-adoption-and-verification.md`, `phase-02-b5-lim-2-script-caller-passthrough-fix.md`, `phase-03-b6-loop-design-flip.md`
- **Decision deltas checked:** 6 (Phase 2 design, Phase 1 candidate list, test baseline, pattern reference, Phase 3 CAS handling, B1+B2 parent plan status)
- **Reconciled stale references:**
  - Removed all `z.intersection` references from Phase 2.
  - Replaced "864+" test baseline with actual 870 pass / 1 skip count.
  - Reclassified `meta_state_promote_rule`, `meta_state_batch`, `meta_state_resolve`, `meta_state_supersede` as NOT candidates across Phase 1.
  - Updated Phase 1 Architecture to use `.pick()` / `.merge()` instead of raw `.shape` for entry-constructing tools.
  - Added auto-capture / retry guidance to Phase 3 Step 2.
  - Updated `plans/260613-1853-phase-b-bridge-5-core-fix/plan.md` `status` from `pending` to `completed` (all 6 phase files were already `completed`).
- **Unresolved contradictions:** 0

### Key Risks Addressed
- `z.intersection` would have regressed stdio wire-format coercion for all patch fields.
- Raw `.shape` swaps would have exposed ignored handler-generated fields or dropped tool-level parameters.
- `meta_state_batch` strict schemas would have broken the existing loose op-schema contract.
- The stale "864+" baseline would have made verification gates unverifiable.
- The B6 flip without retry could have left the loop-design active while the tracker claimed it inactive.
