---
phase: 2
title: "Meta-state mutations and closeout"
status: completed
priority: P2
effort: "1h"
dependencies:
  - 1
---

# Phase 2: Meta-state mutations and closeout

## Overview

Apply the registry mutations in canonical order using only MCP tools. Reactivate `loop-design-instruction-layer`, log the tool ship, resolve the next-up finding, then return the design to `inactive` with updated ship metadata. No direct file I/O.

## Requirements

- Functional: design entry reflects the re-adoption lifecycle (inactive → active → inactive) with updated `proposed_design_for`, `shipped_in_plan`, and `shipped_at`.
- Functional: next-up finding `meta-260611T1253Z-...` is resolved.
- Functional: 2 change-logs appended (tool ship + design re-adoption closeout).
- Non-functional: every mutation goes through an MCP tool; CAS via `_expected_version`; grounding check before resolve.

## Architecture

Single-session ordered mutation sequence. Step 1 captures the current design version. Step 2 reactivates. Step 3 files the tool ship change-log. Step 4 acks and resolves the next-up finding. Step 5 closes the design again. Step 6 verifies and writes the journal.

## Related Code Files

- Modify: `meta-state.jsonl#loop-design-instruction-layer` (via `meta_state_patch`, 2 calls)
- Modify: `meta-state.jsonl#meta-260611T1253Z-next-up-promote-loop-design-instruction-layer-from-inactive` (via `meta_state_resolve`)
- Append: `meta-state.jsonl` × 2 (via `meta_state_log_change`)
- Create: `docs/journals/260611-loop-get-instruction-closeout.md`
- Modify: `plans/260611-1700-loop-get-instruction/plan.md` (status: pending → completed)

## Implementation Steps

### Step 2.1: Read current state (CAS prep)

Call `meta_state_list({ entry_kind: "loop-design", id: "loop-design-instruction-layer" })` and capture:
- `version` (current is 13; expected after reactivation: 14; after closeout: 15)
- Confirm `status` is `"inactive"` and `proposed_design_for` has 3 entries.

Call `meta_state_list({ entry_kind: "finding", id: "meta-260611T1253Z-next-up-promote-loop-design-instruction-layer-from-inactive" })` and capture:
- `status` (expected: `"reported"`)
- `expires_at` (expected: `"2026-06-12T05:53:12.947Z"`)
- `mechanism_check` (expected: `true`)
- `evidence_code_ref` (expected: `"tools/learning-loop-mcp/core/loop-introspect.js#DISCOVERABILITY_HINTS"`)

### Step 2.2: Reactivate the design entry

Call `meta_state_patch`:

```json
{
  "id": "loop-design-instruction-layer",
  "entry_kind": "loop-design",
  "_expected_version": 13,
  "patch": {
    "status": "active"
  }
}
```

Expected response: `{ patched: true, version: 14, ... }`.

### Step 2.3: File the tool ship change-log

Call `meta_state_log_change`:

```json
{
  "change_target": "tools/learning-loop-mcp/tools/loop-get-instruction-tool.js",
  "change_dimension": "surface",
  "change_diff": {
    "added": [
      "tools/learning-loop-mcp/tools/loop-get-instruction-tool.js (loop_get_instruction MCP tool)",
      "tools/learning-loop-mcp/__tests__/loop-get-instruction.test.js (TDD regression tests)",
      "DISCOVERABILITY_HINTS[11] = 'loop_get_instruction + meta-vs-product surface split' (hint H12)"
    ],
    "removed": [],
    "changed": [
      "tools/learning-loop-mcp/tools/manifest.json (registered loop_get_instruction)",
      "tools/learning-loop-mcp/agent-manifest.json (added loop_get_instruction to introspection group)",
      "tools/learning-loop-mcp/core/loop-introspect.js (12 hints)",
      ".factory/hooks/loop-surface-inject.cjs (hook mirror: 12 hints)",
      "tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs (length 11 → 12)",
      "tools/learning-loop-mcp/__tests__/loop-describe-warm-tier.test.js (length 11 → 12)"
    ]
  },
  "reason": "Ships the deferred loop_get_instruction MCP tool for on-demand discoverability hint lookup. Reactivates loop-design-instruction-layer after empirical evidence (meta-260611T1253Z-...) showed the warm-tier-only surface misses ~20% of cross-reference lookups. The tool accepts named slugs, numeric indices, or arrays of keys and returns the canonical hint text plus a one-line suggestion. Pairs with the wire-format coercion fix so top-level array input works over stdio.",
  "applies_to": {
    "surfaces": ["meta"],
    "tools": ["loop_get_instruction", "loop_describe"],
    "rules": [],
    "statuses": ["active", "inactive"],
    "schemas": ["tools/learning-loop-mcp/core/loop-introspect.js#DISCOVERABILITY_HINTS"]
  },
  "evidence_code_ref": "tools/learning-loop-mcp/tools/loop-get-instruction-tool.js",
  "evidence_journal": "docs/journals/260611-loop-get-instruction-closeout.md"
}
```

Record the returned change-log id as `TOOL_CHANGE_LOG_ID` for Step 2.5.

### Step 2.4: Promote the next-up finding to active

Call `meta_state_ack`:

```json
{
  "id": "meta-260611T1253Z-next-up-promote-loop-design-instruction-layer-from-inactive",
  "reason": "operator-acked for adoption: loop_get_instruction tool ships via plan 260611-1700-loop-get-instruction; closing before 24h TTL flips to stale"
}
```

### Step 2.5: Check grounding and resolve the finding

Call `meta_state_check_grounding({ id: "meta-260611T1253Z-next-up-promote-loop-design-instruction-layer-from-inactive" })`.

Expected: `"grounded"` because Phase 1 already edited `loop-introspect.js` and this first check will record the fresh fingerprint. If `"drifted"`, call `meta_state_refresh_fingerprint` with the same id, then re-run `check_grounding`.

Then call `meta_state_resolve`:

```json
{
  "id": "meta-260611T1253Z-next-up-promote-loop-design-instruction-layer-from-inactive",
  "resolution": "loop_get_instruction MCP tool shipped via plan 260611-1700-loop-get-instruction. The tool closes the remaining 20% on-demand instruction-layer gap by letting agents fetch hints by slug, index, or array of keys. loop-design-instruction-layer was reactivated, the new tool was added to its proposed_design_for, and the design returned to inactive."
}
```

### Step 2.6: Close out the design entry

Call `meta_state_patch`:

```json
{
  "id": "loop-design-instruction-layer",
  "entry_kind": "loop-design",
  "_expected_version": 14,
  "patch": {
    "proposed_design_for": [
      "meta-260610T0102Z-tools-learning-loop-mcp-core-loop-introspect-js-discoverabil",
      "meta-260610T0102Z-tools-learning-loop-mcp-agent-manifest-json-tools-meta-state",
      "meta-260606T1433Z-discoverability-meta-evidence-migration",
      "<TOOL_CHANGE_LOG_ID>"
    ],
    "status": "inactive",
    "shipped_in_plan": "plans/260611-1700-loop-get-instruction/",
    "shipped_at": "<ISO 8601 timestamp at call time>"
  }
}
```

Expected response: `{ patched: true, version: 15, ... }`.

### Step 2.7: File the design re-adoption closeout change-log

Call `meta_state_log_change`:

```json
{
  "change_target": "meta-state.jsonl#loop-design-instruction-layer",
  "change_dimension": "surface",
  "change_diff": {
    "added": [
      "proposed_design_for appended with tool ship change-log id",
      "status: active → inactive (re-adoption closeout)",
      "shipped_in_plan: plans/260611-1700-loop-get-instruction/",
      "shipped_at: <ISO timestamp>"
    ],
    "removed": [],
    "changed": []
  },
  "reason": "Re-adopts loop-design-instruction-layer. The design was originally marked inactive by plan 260609-adopt-instruction-layer which deferred loop_get_instruction as YAGNI. Empirical evidence in meta-260611T1253Z-... showed the warm-tier-only surface still missed on-demand lookups, so the deferred tool was shipped and the design returned to inactive with updated proposed_design_for and shipped_in_plan.",
  "applies_to": {
    "surfaces": ["meta"],
    "tools": ["meta_state_patch", "meta_state_log_change", "meta_state_resolve", "meta_state_ack", "meta_state_check_grounding", "loop_get_instruction"],
    "rules": [],
    "statuses": ["active", "inactive", "resolved"],
    "schemas": ["tools/learning-loop-mcp/core/meta-state.js#metaStateLoopDesignSchema"]
  },
  "evidence_code_ref": "tools/learning-loop-mcp/core/meta-state.js#metaStateLoopDesignSchema",
  "evidence_journal": "docs/journals/260611-loop-get-instruction-closeout.md",
  "consolidates": "meta-260611T1253Z-next-up-promote-loop-design-instruction-layer-from-inactive"
}
```

`consolidates` is a single string per schema.

### Step 2.8: Read-back verification

Call `meta_state_list({ entry_kind: "loop-design", id: "loop-design-instruction-layer" })`.

Assert:
- `status === "inactive"`
- `proposed_design_for.length === 4`
- `proposed_design_for[3] === TOOL_CHANGE_LOG_ID`
- `shipped_in_plan === "plans/260611-1700-loop-get-instruction/"`
- `shipped_at` is a valid ISO 8601 timestamp ≤ now
- `version === 15`

Call `meta_state_list({ entry_kind: "finding", id: "meta-260611T1253Z-next-up-promote-loop-design-instruction-layer-from-inactive" })`.

Assert:
- `status === "resolved"`
- `resolved_by === "operator"`
- `resolution` mentions `loop_get_instruction`

Call `meta_state_derive_status({ id: "loop-design-instruction-layer" })`.

Assert:
- `derived_status === "active-no-signal"` (the design entry has no `evidence_code_ref`)
- `drift === false`

### Step 2.9: Run full check

```bash
cd /home/datguy/codingProjects/learning-loop-template
pnpm check 2>&1 | tail -20
```

Expected: exit 0.

### Step 2.10: Confirm diff matches expected mutations

Run `git diff meta-state.jsonl` and confirm the diff contains only:
1. The design entry line: `status: "inactive"`, `proposed_design_for` with 4 entries, `shipped_in_plan` updated, `shipped_at` updated, `version: 15`.
2. The next-up finding line: `status: "resolved"`, `resolved_at`, `resolved_by: "operator"`, `resolution` text.
3-4. 2 appended change-log lines.
5. The ack may update `acked_at` on the finding line (in-place edit).

No unexpected lines should change.

### Step 2.11: Write the closeout journal

Create `docs/journals/260611-loop-get-instruction-closeout.md` with:
- Summary (2-3 sentences)
- Mutations applied (list each MCP call)
- TTL pressure closed
- Framing shift (YAGNI → empirical need for on-demand lookup)
- Tool surface used
- Code changes summary
- Out of scope
- Test count

### Step 2.12: Flip plan status

Run:

```bash
cd /home/datguy/codingProjects/learning-loop-template/plans/260611-1700-loop-get-instruction
ck plan check 1
ck plan check 2
```

Then edit `plan.md` frontmatter: `status: pending` → `status: completed`.

### Step 2.13: Post-closeout sweep

Call `meta_state_list({ entry_kind: "loop-design", status: "inactive" })` and confirm `loop-design-instruction-layer` is present with the new `shipped_in_plan`.

Call `meta_state_list({ entry_kind: "finding", id: "meta-260611T1253Z-next-up-promote-loop-design-instruction-layer-from-inactive" })` and confirm `status: "resolved"`.

## Success Criteria

- [ ] Step 2.1 read captured `version: 13`, `status: "inactive"`, `proposed_design_for` length 3.
- [ ] Step 2.2 reactivation patch: `patched: true, version: 14`.
- [ ] Step 2.3 tool ship change-log returned a new id (recorded for Step 2.6).
- [ ] Step 2.4 ack response: `status: "active"`, `acked_at` populated.
- [ ] Step 2.5 check_grounding: `status: "grounded"` (or drifted → refresh → grounded); resolve response: `status: "resolved"`, `resolved_by: "operator"`.
- [ ] Step 2.6 closeout patch: `patched: true, version: 15`.
- [ ] Step 2.7 design re-adoption change-log returned with `consolidates` set to the finding id.
- [ ] Step 2.8 all read-back assertions pass; `derived_status === "active-no-signal"` AND `drift === false`.
- [ ] Step 2.9 `pnpm check` exit 0.
- [ ] Step 2.10 `git diff meta-state.jsonl` matches expected mutations.
- [ ] Step 2.11 journal created.
- [ ] Step 2.12 `ck plan check 1/2` exit 0; `plan.md` status flipped to `completed`.
- [ ] Step 2.13 sweep confirms design is inactive with new ship metadata and finding is resolved.
- [ ] Zero `node -e` invocations during this phase.
- [ ] Zero `Edit`/`Write`/`Create` to `meta-state.jsonl` during this phase.

## Risk Assessment

- **Risk**: CAS mismatch on the design entry. **Mitigation**: capture version in Step 2.1; use it in Step 2.2 and the incremented version in Step 2.6; one retry; second mismatch = abort.
- **Risk**: `meta_state_resolve` consult-gate blocks on `rule-no-orphaned-evidence`. **Mitigation**: Step 2.5 grounding check before resolve. The finding's `evidence_code_ref` points to `loop-introspect.js#DISCOVERABILITY_HINTS` which Phase 1 edits; the first check after the edit records the fresh fingerprint.
- **Risk**: `meta_state_log_change` duplicates. **Mitigation**: idempotency guard — re-read `meta-state.jsonl` and confirm no entry with same `change_target` + `reason` exists before calling.
- **Risk**: 24h TTL elapses during Step 2.1-2.13. **Mitigation**: all steps in one session; total phase <1h.
- **Risk**: `consolidates` passed as array. **Mitigation**: pass single string per schema.

## Hand-off

After Step 2.13, the plan is complete. The active loop-designs remain:
- `loop-design-meta-state-registry-sqlite-migration-trajectory-parked` (parked)
- `loop-design-id-addressed-meta-state-list` (active)
- `loop-design-schema-as-source-of-truth-bridge-5-derive-tool-schemas-from` (active)

`loop-design-instruction-layer` is back to `inactive` with `shipped_in_plan: plans/260611-1700-loop-get-instruction/`.
