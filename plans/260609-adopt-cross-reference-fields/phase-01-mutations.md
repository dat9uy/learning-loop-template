---
phase: 1
title: Mutations
status: completed
priority: P2
effort: 20m
dependencies: []
---

# Phase 1: Mutations

## Overview

Apply the 4 registry mutations in the canonical order, using only MCP tools. No direct file I/O.

## Requirements

- Functional: design entry has correct `proposed_design_for`, `status`, `shipped_in_plan`, `shipped_at`, `version`; next-up finding is `resolved`; ship change-log is appended.
- Non-functional: every mutation goes through an MCP tool (`meta_state_patch`, `meta_state_ack`, `meta_state_check_grounding`, `meta_state_refresh_fingerprint`, `meta_state_resolve`, `meta_state_log_change`); no `node -e`; no `Edit`/`Write` to `meta-state.jsonl`; CAS via `_expected_version` on every patch.

## Architecture

Single-session, single-agent, ordered mutation sequence. Step 1 captures the current `version` of the design entry (read first to enable CAS). Steps 2-4 mutate the design entry. Step 5 files the change-log. Steps 6-9 close the next-up finding via the canonical path.

## Related Code Files

- Modify: `meta-state.jsonl#loop-design-cross-reference-fields` (via `meta_state_patch`, 2 calls: one for `proposed_design_for` + version bump, one for `status` + `shipped_*` + version bump; or one combined call if the patch tool accepts the full diff)
- Modify: `meta-state.jsonl#meta-260609T2102Z-next-up-adopt-loop-design-cross-reference-fields-...` (via `meta_state_resolve`, after `meta_state_ack` + `meta_state_check_grounding` + `meta_state_refresh_fingerprint` if drifted)
- Append: `meta-state.jsonl` (via `meta_state_log_change`, 1 new change-log entry)

## Implementation Steps

### Step 1.1: Read current state (CAS prep)

Call `meta_state_list({ entry_kind: "loop-design", id: "loop-design-cross-reference-fields" })` and capture:
- `version` (current is 6; expected after this phase: 7 or 8 depending on whether patch is 1 or 2 calls)
- Confirm `proposed_design_for` is `[]` and `status` is `"active"`.

Call `meta_state_list({ entry_kind: "finding", id: "meta-260609T2102Z-next-up-adopt-loop-design-cross-reference-fields-status-acti" })` and capture:
- `version` (for any future patch; ack + resolve do not require CAS)
- `status` (expected: `"reported"`)
- `expires_at` (expected: `"2026-06-10T14:02:41.798Z"`)
- `mechanism_check` (expected: `true`)
- `evidence_code_ref` (expected: `"tools/learning-loop-mcp/core/meta-state.js#metaStateLoopDesignSchema"`)

### Step 1.2: Backfill `proposed_design_for` on the design entry

Call `meta_state_patch` with:
```
{
  id: "loop-design-cross-reference-fields",
  entry_kind: "loop-design",
  _expected_version: <version from Step 1.1>,
  patch: {
    proposed_design_for: [
      "meta-260606T2055Z-tools-learning-loop-mcp-core-meta-state-js-metastateentrysch",
      "meta-260608T1258Z-tools-learning-loop-mcp-tools-meta-state-patch-tool-js"
    ]
  }
}
```

Expected response: `{ patched: true, version: 7, ... }`. If `_expected_version` mismatch, re-read and retry (one retry max; second mismatch = abort and surface to operator).

### Step 1.3: Flip `status: active → inactive` + set `shipped_in_plan` + `shipped_at`

Call `meta_state_patch` with:
```
{
  id: "loop-design-cross-reference-fields",
  entry_kind: "loop-design",
  _expected_version: 7,
  patch: {
    status: "inactive",
    shipped_in_plan: "plans/260609-adopt-cross-reference-fields/",
    shipped_at: "<ISO 8601 timestamp at call time, e.g. 2026-06-09T14:55:00.000Z>"
  }
}
```

Expected response: `{ patched: true, version: 8, ... }`.

### Step 1.4: Promote next-up finding from `reported` to `active`

Call `meta_state_ack` with:
```
{
  id: "meta-260609T2102Z-next-up-adopt-loop-design-cross-reference-fields-status-acti",
  reason: "operator-acked for adoption: design ships via plan 260609-adopt-cross-reference-fields; closing the 24h next-up finding before TTL flips to stale"
}
```

### Step 1.5: Check grounding (consult-gate prerequisite for resolve)

Call `meta_state_check_grounding` with:
```
{
  id: "meta-260609T2102Z-next-up-adopt-loop-design-cross-reference-fields-status-acti"
}
```

Inspect the `status` field in the response. If `"drifted"`, call `meta_state_refresh_fingerprint` and re-run check_grounding. If `"grounded"`, proceed to Step 1.6.

### Step 1.6: Resolve the next-up finding

Call `meta_state_resolve` with:
```
{
  id: "meta-260609T2102Z-next-up-adopt-loop-design-cross-reference-fields-status-acti",
  resolution: "Design adopted: loop-design-cross-reference-fields marked status=inactive, proposed_design_for backfilled with the 2 change-logs that delivered the design (4-kind union + meta_state_patch), shipped_in_plan set to this plan. The TTL pressure (expires_at 2026-06-10T14:02:41.798Z) is closed. The 4-kind union change-log's promised shipped_in_plan cold-tier field is now populated end-to-end."
}
```

Expected response: `{ resolved: true, resolved_by: "operator" }`. If the consult-gate `rule-no-orphaned-evidence` blocks, see Risk Assessment in plan.md (the design's `evidence_code_ref` is stable; refresh_fingerprint in Step 1.5 should have handled drift).

### Step 1.7: File the ship change-log

Call `meta_state_log_change` with:
```
{
  change_target: "meta-state.jsonl#loop-design-cross-reference-fields",
  change_dimension: "surface",
  change_diff: {
    added: [
      "proposed_design_for backfilled with [meta-260606T2055Z-..., meta-260608T1258Z-...]",
      "status: active → inactive",
      "shipped_in_plan: plans/260609-adopt-cross-reference-fields/",
      "shipped_at: <ISO timestamp>"
    ],
    removed: [],
    changed: []
  },
  reason: "Adopts loop-design-cross-reference-fields. The design's motivation (typed cross-reference fields + CRUD coverage to maintain them) shipped across 2 prior plans: meta-260606T2055Z (4-kind union + relationships tool) and meta-260608T1258Z (meta_state_patch). This change-log records the design's adoption: design entry moves to status=inactive, proposed_design_for populated, shipped_in_plan set. Closes meta-260609T2102Z-next-up-adopt-loop-design-cross-reference-fields-... before its 24h TTL flips to status=stale.",
  applies_to: {
    surfaces: ["meta"],
    tools: ["meta_state_patch", "meta_state_log_change", "meta_state_resolve", "meta_state_ack", "meta_state_check_grounding"],
    rules: [],
    statuses: ["active", "inactive", "resolved"],
    schemas: ["tools/learning-loop-mcp/core/meta-state.js#metaStateLoopDesignSchema"]
  },
  evidence_code_ref: "tools/learning-loop-mcp/core/meta-state.js#metaStateLoopDesignSchema",
  evidence_journal: "docs/journals/260609-adopt-cross-reference-fields-closeout.md",
  consolidates: "meta-260609T2102Z-next-up-adopt-loop-design-cross-reference-fields-status-acti"
}
```

Expected response: `{ id: "meta-<timestamp>-tools-learning-loop-mcp-core-meta-state-js-metastateloo..." }` (a new change-log id; record it for the journal).

## Success Criteria

- [ ] Step 1.1 read captured `version: 6` and confirmed `proposed_design_for: []` + `status: "active"`.
- [ ] Step 1.2 patch response: `patched: true, version: 7`.
- [ ] Step 1.3 patch response: `patched: true, version: 8`.
- [ ] Step 1.4 ack response: `status: "active"`, `acked_at` populated.
- [ ] Step 1.5 check_grounding response: `status: "grounded"` (or `drifted` → refresh + re-check → grounded).
- [ ] Step 1.6 resolve response: `status: "resolved"`, `resolved_by: "operator"`.
- [ ] Step 1.7 log_change response: a new change-log id starting with `meta-260609T...`.
- [ ] Zero `node -e` invocations during this phase.
- [ ] Zero `Edit`/`Write`/`Create` to `meta-state.jsonl` during this phase.

## Risk Assessment

- **Risk**: CAS mismatch on the design entry. **Mitigation**: Step 1.1 captures the version; one retry; second mismatch = abort + operator surface.
- **Risk**: `meta_state_resolve` consult-gate blocks on `rule-no-orphaned-evidence`. **Mitigation**: Step 1.5 + 1.5a (refresh if drifted) before Step 1.6.
- **Risk**: Step 1.7's `meta_state_log_change` returns duplicate (the gap documented in `meta-260606T2106Z-agent-called-meta-state-log-change-...`). **Mitigation**: idempotency guard — re-read `meta-state.jsonl` and confirm no entry with same `change_target` + `reason` exists before calling; if the tool doesn't have a built-in guard, do the guard in the agent.
- **Risk**: 24h TTL elapses during Step 1.1-1.7. **Mitigation**: all steps in one session; total phase <20 min.
