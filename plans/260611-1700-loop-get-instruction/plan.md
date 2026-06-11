---
title: "Ship loop_get_instruction and re-adopt instruction-layer design"
description: >-
  Promotes loop-design-instruction-layer from inactive back to active and ships
  the deferred loop_get_instruction MCP tool. Adds a 12th discoverability hint
  that teaches the meta-vs-product surface split and advertises the new tool.
  Updates the SessionStart hook mirror and adds a regression test file. Closes
  the reported finding meta-260611T1253Z-next-up-promote-loop-design-instruction-
  layer-from-inactive before its 24h TTL flips to stale.
status: pending
priority: P2
branch: "main"
tags:
  - meta
  - mcp-tools
  - meta-state
  - discoverability
  - instruction-layer
  - tdd
blockedBy: []
blocks: []
created: "2026-06-11T16:29:06.242Z"
createdBy: "ck:plan"
source: skill
related:
  - meta-260611T1253Z-next-up-promote-loop-design-instruction-layer-from-inactive
  - loop-design-instruction-layer
  - plans/260609-adopt-instruction-layer/
  - meta-260610T1458Z-next-session-target-fix-the-mcp-wire-format-coercion-bug-blo
---

# Ship loop_get_instruction and re-adopt instruction-layer design

## Overview

The loop-design `loop-design-instruction-layer` was marked `inactive` by plan `260609-adopt-instruction-layer`, which deliberately deferred a dedicated `loop_get_instruction` MCP tool as YAGNI. Empirical follow-up (finding `meta-260611T1253Z-...`) shows that ~20% of cross-reference instruction lookups are still missed because the warm-tier hints scroll out of context or the agent does not know which hint applies. The fix is to ship the deferred on-demand lookup tool after all.

This plan:
1. Builds `loop_get_instruction` (single `key` argument that accepts a named slug, a 0-based index, or an array of either).
2. Adds a 12th discoverability hint that both teaches the meta-vs-product surface split and advertises `loop_get_instruction`.
3. Keeps the canonical hint array and the SessionStart hook mirror in sync.
4. Reactivates `loop-design-instruction-layer`, logs the ship change, resolves `meta-260611T1253Z-...`, and returns the design to `inactive` with updated `proposed_design_for` and `shipped_in_plan`.

All registry mutations go through canonical MCP tools. No direct file I/O to `meta-state.jsonl`.

## Phases

| Phase | Name | Status | Effort |
|-------|------|--------|--------|
| 1 | [Implement loop_get_instruction tool and hint updates](./phase-01-implement-loop-get-instruction-tool-and-hint-updates.md) | Pending | 2h |
| 2 | [Meta-state mutations and closeout](./phase-02-meta-state-mutations-and-closeout.md) | Pending | 1h |

## Dependencies

- Blocked by: nothing. The wire-format coercion fix (`meta-260610T1458Z-...`) is already shipped, so the new tool can accept top-level arrays safely.
- Blocks: nothing.

## Touchpoints

### MCP tools (canonical path)
- `meta_state_patch` — reactivate the design entry (inactive → active) and later close it (active → inactive + updated ship metadata)
- `meta_state_ack` — promote the next-up finding from `reported` to `active`
- `meta_state_check_grounding` — verify the finding's `evidence_code_ref` still resolves
- `meta_state_refresh_fingerprint` — re-compute SHA-256 if `check_grounding` reports drift
- `meta_state_resolve` — close the next-up finding (consults `rule-no-orphaned-evidence`)
- `meta_state_log_change` × 2 — ship change-log for the new tool + design-adoption closeout
- `meta_state_derive_status` — post-ship drift check on the design entry
- `meta_state_list` — read-back verification

### Code files
- Create: `tools/learning-loop-mcp/tools/loop-get-instruction-tool.js`
- Modify: `tools/learning-loop-mcp/tools/manifest.json` (register the new tool)
- Modify: `tools/learning-loop-mcp/agent-manifest.json` (add `loop_get_instruction` to the `introspection` group)
- Modify: `tools/learning-loop-mcp/core/loop-introspect.js#DISCOVERABILITY_HINTS` (add 12th hint)
- Modify: `.factory/hooks/loop-surface-inject.cjs#LOCAL_DISCOVERABILITY_HINTS` (mirror the new hint)
- Modify: `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` (length 11 → 12 + assertion for new hint)
- Modify: `tools/learning-loop-mcp/__tests__/loop-describe-warm-tier.test.js` (length 11 → 12 + assertion for new hint)
- Create: `tools/learning-loop-mcp/__tests__/loop-get-instruction.test.js` (TDD regression tests)
- Create: `docs/journals/260611-loop-get-instruction-closeout.md`

### Registry mutations
- Modify: `meta-state.jsonl#loop-design-instruction-layer` (via `meta_state_patch`, 2 calls: reactivate v13 → v14, then closeout v14 → v15 with new `proposed_design_for` + `shipped_in_plan`)
- Modify: `meta-state.jsonl#meta-260611T1253Z-...` (via `meta_state_resolve`, after `meta_state_ack` + `meta_state_check_grounding`)
- Append: `meta-state.jsonl` × 2 change-logs (tool ship + design re-adoption closeout)

## Success Criteria

- [ ] Phase 1: `loop_get_instruction` tool exists, registered in both manifests, and returns the correct hint + suggestion for named slugs, numeric indices, and arrays of keys.
- [ ] Phase 1: `DISCOVERABILITY_HINTS` has 12 entries; the new hint mentions both `loop_get_instruction` and the meta-vs-product surface split.
- [ ] Phase 1: Hook mirror `LOCAL_DISCOVERABILITY_HINTS` has the same 12 entries as the canonical array.
- [ ] Phase 1: Existing warm-tier tests updated to assert 12 hints and the new hint content.
- [ ] Phase 1: New `loop-get-instruction.test.js` passes (direct handler + stdio transport + array input + unknown-key error path).
- [ ] Phase 2: `loop-design-instruction-layer` is patched to `active` (reactivation), then back to `inactive` with updated `proposed_design_for`, `shipped_in_plan: plans/260611-1700-loop-get-instruction/`, and `shipped_at`.
- [ ] Phase 2: Next-up finding `meta-260611T1253Z-...` has `status: "resolved"`, `resolved_by: "operator"`.
- [ ] Phase 2: 2 ship change-logs filed (tool ship + design re-adoption), with the design-adoption entry consolidating the next-up finding.
- [ ] `pnpm check` passes with the new tests included.
- [ ] Zero direct file I/O to `meta-state.jsonl`.
- [ ] Closeout journal written.

## Out of Scope

- Adding more than one new hint (we add exactly the hint that advertises the tool + teaches the surface split).
- Re-auditing the top-10 tool descriptions (already done in `260609-adopt-instruction-layer`).
- Reframing AGENTS.md sections.
- Changing the 4-kind union or cross-reference-field schemas.
- Closing other active loop-designs (`loop-design-meta-state-registry-sqlite-migration-trajectory-parked`, `loop-design-id-addressed-meta-state-list`, `loop-design-schema-as-source-of-truth-bridge-5-derive-tool-schemas-from`).

## Risk Assessment

- **Risk**: 24h TTL on `meta-260611T1253Z-...` expires during implementation. **Mitigation**: both phases in one session; total budget <3h.
- **Risk**: New tool schema rejects top-level array input over stdio. **Mitigation**: wire-format coercion is already shipped; new test file includes a stdio array-input case.
- **Risk**: `rule-no-orphaned-evidence` consult-gate blocks `meta_state_resolve`. **Mitigation**: the finding's `evidence_code_ref` points to `loop-introspect.js#DISCOVERABILITY_HINTS`, which Phase 1 edits. Call `meta_state_check_grounding` after the edit; if drifted, refresh fingerprint before resolving.
- **Risk**: Hint count assertions in other test files are missed. **Mitigation**: grep the repo for `discoverability_hints.length` and `hints.length` before committing; update every assertion.
- **Risk**: Hook mirror drifts from canonical array. **Mitigation**: cold-session test already asserts parity; update the hook in the same commit.
- **Risk**: CAS mismatch on the design entry. **Mitigation**: capture version at reactivation, use it for the closeout patch; one retry; second mismatch = abort and surface to operator.
- **Risk**: `meta_state_log_change` duplicates. **Mitigation**: idempotency guard — re-read `meta-state.jsonl` and confirm no entry with same `change_target` + `reason` exists before calling.
