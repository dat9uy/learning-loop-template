---
phase: 4
title: "Content-aware empty-patch / no-content hints"
status: todo
priority: P2
effort: "1.5h"
dependencies: [3]
---

# Phase 4: Content-aware empty-patch / no-content hints

## Overview

The current `empty_patch` hint (`meta-state-patch-tool.js:116`) points only at lifecycle tools
(`meta_state_supersede` / `meta_state_resolve` / `meta_state_log_change`) — none of which update
`description` or `evidence_code_ref`, the agent's actual goal in session `e10944c4`. Fix the hint to name
the mutable **content** fields for refresh use cases, alongside the lifecycle guidance. Add a parallel
`no_content` hint for `meta_state_batch` update ops (Phase 3's batch runtime floor).

## Requirements

- Functional (patch): the `empty_patch` result `hint` for `entry_kind:"finding"` lists the canonical
  mutable content fields — `description` and `evidence_code_ref` first (the common refresh case), then
  `category`, `severity`, `affected_system`, `subtype`, `recurrence_key`, `mechanism_check`, `reopens`,
  `evidence_test`, `evidence_journal` — and still names supersede/resolve/log_change for
  status/consolidated_into/resolved_at operations. Per-kind hints (rule, loop-design) list **their own**
  mutable fields (no finding-specific fields like `recurrence_key` leaking into a rule hint).
- Functional (batch): the `no_content` result for a batch update op names the mutable content fields of
  the **existing entry's** kind (derived the same way as Phase 3's validation) and notes that content
  fields go inline on the op (e.g. `{op:"update", id, description:"…"}`), not in a nested `patch:{}`.
- Non-functional: both hints are **derived from the schema** (not hand-maintained) so they never drift.

## Architecture

Build the hint from `buildPatchSchemaFor(entry_kind)`'s field keys — the per-kind schema is the single
source of truth. Shape:
```
patch must contain at least one mutable field for entry_kind=<kind>. Mutable fields: <top N keys…>.
For status/consolidated_into use meta_state_supersede; for resolved use meta_state_resolve; for
schema/rule/tool/policy/surface changes use meta_state_log_change.
```
List `description` and `evidence_code_ref` first (sort or explicit prefix) since they are the common
refresh case; cap the list to keep the hint compact (the full set lives in the schema).

## Related Code Files

- Modify: `tools/learning-loop-mastra/tools/handlers/meta-state-patch-tool.js` — construct the
  `empty_patch` hint from the branch schema's keys (line ~110-120).
- Modify: `tools/learning-loop-mastra/tools/handlers/meta-state-batch-tool.js` — construct the
  `no_content` hint for a rejected update op from `buildPatchSchemaFor(existingEntry.entry_kind)`.
- Test: `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-patch-tool.test.js` (extend the
  existing `empty_patch` test at line ~278) and `meta-state-batch-tool.test.js` (extend no_content).

## Implementation Steps (TDD)

1. **RED (patch)** — test: `empty_patch` result for `entry_kind:"finding"` contains `"description"`
   **and** `"evidence_code_ref"` in `hint`. Fails (today's hint lists only lifecycle tools).
2. **GREEN (patch)** — derive the field list from
   `Object.keys(buildPatchSchemaFor(entry_kind)._zod.def.shape)` (or the parity projection's
   properties); order `description` and `evidence_code_ref` first; interleave the lifecycle-tool
   guidance. Run → green.
3. **EDGE (patch)** — tests: `entry_kind:"rule"` hint contains rule-specific fields (e.g. `pattern`,
   `enforcement`) and does **not** contain finding-specific `recurrence_key`; `entry_kind:"loop-design"`
   hint contains `title`/`description`/`severity_hint`. All three kinds still mention
   supersede/resolve/log_change.
4. **RED (batch)** — test: a `no_content` batch-update rejection's message/hint names the existing
   entry's kind's content fields and notes inline placement. Fails.
5. **GREEN (batch)** — reuse the same schema-derived field list with `existingEntry.entry_kind`; note
   that content goes inline on the op. Run → green.

## Success Criteria

- [ ] Patch finding hint names `description` + `evidence_code_ref` (+ other top mutable fields).
- [ ] Patch per-kind hints name their own fields; no cross-kind leakage; all kinds still mention
      supersede/resolve/log_change.
- [ ] Batch `no_content` hint names the existing entry's kind's content fields + inline placement note.
- [ ] Both hints are schema-derived (no drift if fields change).

## Risk Assessment

**Risk:** dumping all ~29 finding fields makes the hint huge and noisy. **Mitigation:** cap to the
high-value subset, leading with `description`/`evidence_code_ref`; the full set is already visible in
the model-visible schema, so the hint only needs to point the model at the common case.

<!-- Updated: Validation Session 1 — added parallel no_content hint for meta_state_batch update op -->
