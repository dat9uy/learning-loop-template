---
phase: 4
title: "Registry mutations, closeout journal, design adoption"
status: completed
priority: P2
effort: "1h"
dependencies:
  - 3
---

# Phase 4: Registry mutations, closeout journal, design adoption

## Overview

Apply the registry mutations in canonical order using only MCP tools. The design entry `loop-design-id-addressed-meta-state-list` is already `status: active` (per the closeout of plan 260611-mcp-wire-format-coercion-fix which re-emitted the originating finding as a loop-design); no reactivation is needed. The flow is: log the tool ship change-log → ack the originating finding → check grounding → resolve the finding → patch the design to `inactive` with `shipped_in_plan` and `shipped_at` set → file the design adoption closeout change-log → write the closeout journal → flip the plan status.

## Requirements

- Functional: design entry reflects the adoption lifecycle (active → active with `proposed_design_for` populated → inactive with `shipped_in_plan` + `shipped_at`).
- Functional: originating finding `meta-260610T1457Z-...` is `resolved` with `resolved_by: "operator"`.
- Functional: 2 change-logs appended (tool ship + design adoption closeout).
- Non-functional: every mutation goes through an MCP tool; CAS via `_expected_version`; grounding check before resolve.
- Non-functional: zero direct file I/O to `meta-state.jsonl`; zero `node -e` escape hatches for mutations.
- Non-functional: closeout journal written; plan status flipped to `completed`.

## Architecture

Single-session ordered mutation sequence. Step 4.1 captures the current design version. Step 4.2 logs the tool ship change. Step 4.3 acks the originating finding. Step 4.4 checks grounding and resolves the finding. Step 4.5 closes the design (status: active → inactive, with `proposed_design_for` populated, `shipped_in_plan` + `shipped_at` set). Step 4.6 files the design adoption closeout change-log. Step 4.7 verifies via read-back. Step 4.8 runs the full check. Step 4.9 confirms the diff. Step 4.10 writes the journal. Step 4.11 flips plan status. Step 4.12 runs the post-closeout sweep.

The `proposed_design_for` field requires care: it must be a non-empty array of valid entry ids. Per the schema (`min(1)`), the cold-tier no-broken-refs invariant (every id in `proposed_design_for` must resolve to an existing entry), and the `fix-loop-design-refs` test, the closeout populates it with the tool ship change-log id from Step 4.2 (1 entry satisfies `min(1)` and resolves by definition). The originating finding `meta-260610T1457Z-...` is referenced by the design's `addresses` field, not `proposed_design_for`; that relationship is preserved.

## Related Code Files

- Read: `meta-state.jsonl#loop-design-id-addressed-meta-state-list` (capture `version` for CAS)
- Read: `meta-state.jsonl#meta-260610T1457Z-tool-surface-gap-meta-state-list-does-not-accept-id-single-o` (capture `status`, `expires_at`, `mechanism_check`, `evidence_code_ref` for grounding check)
- Modify: `meta-state.jsonl#loop-design-id-addressed-meta-state-list` (via `meta_state_patch`, 1 call: status active → inactive, with `proposed_design_for` + `shipped_in_plan` + `shipped_at` populated). The design is already `active`; no reactivation needed.
- Modify: `meta-state.jsonl#meta-260610T1457Z-...` (via `meta_state_resolve`, after `meta_state_ack` + `meta_state_check_grounding`)
- Append: `meta-state.jsonl` × 2 (via `meta_state_log_change`)
- Create: `docs/journals/260612-id-addressed-meta-state-list-closeout.md`
- Modify: `plans/260612-1200-id-addressed-meta-state-list/plan.md` (status: pending → completed)

## Implementation Steps

### Step 4.1: Read current state (CAS prep)

Call `meta_state_list({ id: "loop-design-id-addressed-meta-state-list" })` and capture:
- `version` (expected: 3, per the post-fix-loop-design-refs state)
- Confirm `status === "active"` and `proposed_design_for` is empty.

Call `meta_state_list({ id: "meta-260610T1457Z-tool-surface-gap-meta-state-list-does-not-accept-id-single-o" })` and capture:
- `status` (expected: `"stale"` per the design re-emission closeout in `docs/journals/260611-mcp-wire-format-coercion-fix.md` line 21: "Re-emitted `meta-260610T1457Z` as loop-design `loop-design-id-addressed-meta-state-list`")
- `expires_at` (expected: `"2026-06-11T07:57:01.735Z"` — past, so `stale` is expected)
- `mechanism_check` (expected: `true`)
- `evidence_code_ref` (expected: `"tools/learning-loop-mcp/tools/meta-state-list-tool.js#inputSchema"`)

If the finding's status is anything other than `stale` (e.g., already `resolved` by another plan), abort and surface to operator.

### Step 4.2: Log the tool ship change-log

Call `meta_state_log_change`:

```json
{
  "change_target": "tools/learning-loop-mcp/tools/meta-state-list-tool.js",
  "change_dimension": "surface",
  "change_diff": {
    "added": [
      "tools/learning-loop-mcp/__tests__/meta-state-list-id-filter.test.js (TDD regression tests for id filter)",
      "tools/learning-loop-mcp/__tests__/meta-state-list-ref-by-filter.test.js (TDD regression tests for ref_by/ref_field filter)",
      "tools/learning-loop-mcp/__tests__/meta-state-list-id-stdio.test.js (stdio round-trip regression test)",
      "meta_state_list schema: id (string|string[]), ref_by (string), ref_field (enum of 6)",
      "meta_state_list handler: ref_by/ref_field filter via buildInverseIndexes; id filter via Set membership",
      "meta_state_list response: id_filter, ref_by_filter, ref_field_filter in output",
      "DISCOVERABILITY_HINTS[12] = 'narrow query: id + ref_by/ref_field' (hint H13)"
    ],
    "removed": [],
    "changed": [
      "tools/learning-loop-mcp/tools/meta-state-list-tool.js (schema + handler extended)",
      "tools/learning-loop-mcp/core/loop-introspect.js (12 hints → 13)",
      ".factory/hooks/loop-surface-inject.cjs (mirror: 13 hints)",
      "tools/learning-loop-mcp/tools/loop-get-instruction-tool.js (HINT_KEY_MAP + HINT_SUGGESTIONS extended for hint H13)",
      "tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs (length 12 → 13)",
      "tools/learning-loop-mcp/__tests__/loop-describe-warm-tier.test.js (length 12 → 13 + new destructured)",
      "tools/learning-loop-mcp/__tests__/loop-get-instruction.test.js (added narrow-query alias test)"
    ]
  },
  "reason": "Ships the id-addressed meta_state_list filter (loop-design-id-addressed-meta-state-list). Adds two narrow-query paths: `id: string|string[]` for per-id fetch and `ref_by`+`ref_field` for 1-hop neighborhood. Closes the full-registry-dump reflex documented in meta-260610T1457Z-tool-surface-gap-meta-state-list-does-not-accept-id-single-o where agents asked 'what is the state of entries [a, b, c]?' and defaulted to unfiltered reads. Pairs with existing meta_state_relationships (per-entry neighborhood via inverse indexes) and meta_state_derive_status (single-entry truth) to form a 3-tier read surface. Wire-format coercion fix (meta-260610T1458Z-...) ensures top-level id: string[] round-trips over stdio.",
  "applies_to": {
    "surfaces": ["meta"],
    "tools": ["meta_state_list", "meta_state_relationships", "meta_state_derive_status", "loop_get_instruction"],
    "rules": [],
    "statuses": ["active", "inactive", "resolved"],
    "schemas": ["tools/learning-loop-mcp/tools/meta-state-list-tool.js#schema", "tools/learning-loop-mcp/core/loop-introspect.js#DISCOVERABILITY_HINTS"]
  },
  "evidence_code_ref": "tools/learning-loop-mcp/tools/meta-state-list-tool.js",
  "evidence_journal": "docs/journals/260612-id-addressed-meta-state-list-closeout.md"
}
```

Record the returned change-log id as `TOOL_CHANGE_LOG_ID` for Step 4.5.

### Step 4.3: Promote the originating finding to active

Call `meta_state_ack`:

```json
{
  "id": "meta-260610T1457Z-tool-surface-gap-meta-state-list-does-not-accept-id-single-o",
  "reason": "operator-acked for adoption: id-addressed meta_state_list filter ships via plan 260612-1200-id-addressed-meta-state-list; closing the stale finding that motivated the design"
}
```

### Step 4.4: Check grounding and resolve the finding

Call `meta_state_check_grounding({ id: "meta-260610T1457Z-tool-surface-gap-meta-state-list-does-not-accept-id-single-o" })`.

Expected: `"grounded"` because Phase 2 edited `tools/learning-loop-mcp/tools/meta-state-list-tool.js` (the `evidence_code_ref` target). If `"drifted"`, call `meta_state_refresh_fingerprint` with the same id, then re-run `check_grounding`.

Then call `meta_state_resolve`:

```json
{
  "id": "meta-260610T1457Z-tool-surface-gap-meta-state-list-does-not-accept-id-single-o",
  "resolution": "id-addressed meta_state_list filter shipped via plan 260612-1200-id-addressed-meta-state-list. The two narrow-query paths (id: string|string[] and ref_by+ref_field) close the full-registry-dump reflex that motivated this finding. The loop-design loop-design-id-addressed-meta-state-list (re-emitted from this finding in plan 260611-mcp-wire-format-coercion-fix) was adopted; the design returned to inactive with updated proposed_design_for and shipped_in_plan."
}
```

### Step 4.5: Close out the design entry

Call `meta_state_patch`:

```json
{
  "id": "loop-design-id-addressed-meta-state-list",
  "entry_kind": "loop-design",
  "_expected_version": <captured in Step 4.1>,
  "patch": {
    "proposed_design_for": [
      "<TOOL_CHANGE_LOG_ID>"
    ],
    "status": "inactive",
    "shipped_in_plan": "plans/260612-1200-id-addressed-meta-state-list/",
    "shipped_at": "<ISO 8601 timestamp at call time>"
  }
}
```

Expected response: `{ patched: true, version: <captured+1>, ... }`.

### Step 4.6: File the design adoption closeout change-log

Call `meta_state_log_change`:

```json
{
  "change_target": "meta-state.jsonl#loop-design-id-addressed-meta-state-list",
  "change_dimension": "surface",
  "change_diff": {
    "added": [
      "proposed_design_for populated with tool ship change-log id",
      "status: active → inactive (adoption closeout)",
      "shipped_in_plan: plans/260612-1200-id-addressed-meta-state-list/",
      "shipped_at: <ISO timestamp>"
    ],
    "removed": [],
    "changed": []
  },
  "reason": "Adopts loop-design-id-addressed-meta-state-list. The design was filed as a finding (meta-260610T1457Z-...) and re-emitted as a loop-design after the wire-format coercion fix (meta-260610T1458Z-...) unblocked loop-design entries with typed cross-references. The narrow-query filters (id: string|string[] and ref_by+ref_field) ship via the tool change-log <TOOL_CHANGE_LOG_ID>. The design entry moves to status=inactive with proposed_design_for populated, shipped_in_plan set, shipped_at set. Closes the originating finding meta-260610T1457Z-... and the design returns to inactive.",
  "applies_to": {
    "surfaces": ["meta"],
    "tools": ["meta_state_list", "meta_state_patch", "meta_state_log_change", "meta_state_resolve", "meta_state_ack", "meta_state_check_grounding"],
    "rules": [],
    "statuses": ["active", "inactive", "resolved", "stale"],
    "schemas": ["tools/learning-loop-mcp/core/meta-state.js#metaStateLoopDesignSchema", "tools/learning-loop-mcp/tools/meta-state-list-tool.js#schema"]
  },
  "evidence_code_ref": "tools/learning-loop-mcp/core/meta-state.js#metaStateLoopDesignSchema",
  "evidence_journal": "docs/journals/260612-id-addressed-meta-state-list-closeout.md",
  "consolidates": "meta-260610T1457Z-tool-surface-gap-meta-state-list-does-not-accept-id-single-o"
}
```

`consolidates` is a single string per the schema (not an array).

### Step 4.7: Read-back verification

Call `meta_state_list({ id: "loop-design-id-addressed-meta-state-list" })` and assert:
- `status === "inactive"`
- `proposed_design_for.length === 1`
- `proposed_design_for[0] === TOOL_CHANGE_LOG_ID`
- `shipped_in_plan === "plans/260612-1200-id-addressed-meta-state-list/"`
- `shipped_at` is a valid ISO 8601 timestamp ≤ now
- `version === <captured+1>`

Call `meta_state_list({ id: "meta-260610T1457Z-tool-surface-gap-meta-state-list-does-not-accept-id-single-o" })` and assert:
- `status === "resolved"`
- `resolved_by === "operator"`
- `resolution` mentions `260612-1200-id-addressed-meta-state-list`

Call `meta_state_derive_status({ id: "loop-design-id-addressed-meta-state-list" })` and assert:
- `derived_status === "active-no-signal"` (the design has no `evidence_code_ref`)
- `drift === false`

### Step 4.8: Run full check one more time

```bash
cd /home/datguy/codingProjects/learning-loop-template
pnpm check 2>&1 | tail -20
```

Expected: exit 0. Confirms no registry mutations broke a downstream test.

### Step 4.9: Confirm diff matches expected mutations

```bash
cd /home/datguy/codingProjects/learning-loop-template
git diff meta-state.jsonl 2>&1 | tail -50
```

Expected: the diff contains exactly:
1. The design entry line updated: `status: "inactive"`, `proposed_design_for: [<TOOL_CHANGE_LOG_ID>]`, `shipped_in_plan` set, `shipped_at` set, `version` incremented.
2. The originating finding line: `status: "resolved"`, `resolved_at`, `resolved_by: "operator"`, `resolution` text.
3-4. 2 appended change-log lines (tool ship + design adoption).
5. The ack may update `acked_at` on the finding line (in-place edit).

No unexpected lines should change.

### Step 4.10: Write the closeout journal

Create `docs/journals/260612-id-addressed-meta-state-list-closeout.md` with sections:
- **Summary** (2-3 sentences)
- **Mutations applied** — list each MCP call in order: `log_change` (tool ship), `ack` (originating finding), `check_grounding` (originating finding), `resolve` (originating finding), `patch` (design closeout, 1 call), `log_change` (design adoption closeout). Note: no `refresh_fingerprint` is expected to be needed because the finding's `evidence_code_ref` is `tools/learning-loop-mcp/tools/meta-state-list-tool.js#inputSchema` which Phase 2 edits; the first `check_grounding` after the edit records the fresh fingerprint.
- **TTL pressure closed** — the originating finding was `stale` (past 24h TTL); the `stale → resolved` transition is the canonical close path per plan 260611-1000
- **Tool surface used** — list of MCP tools invoked
- **Code changes summary** — new test files + modified files
- **Out of scope** — pre-existing capability drift (if any); other active loop-designs
- **Test count** — record the delta (before → after)

### Step 4.11: Flip plan status

```bash
cd /home/datguy/codingProjects/learning-loop-template/plans/260612-1200-id-addressed-meta-state-list
ck plan check 1
ck plan check 2
ck plan check 3
ck plan check 4
```

Then edit `plan.md` frontmatter: `status: pending` → `status: completed`.

### Step 4.12: Post-closeout sweep

Call `meta_state_list({ entry_kind: "loop-design", status: "inactive" })` and confirm `loop-design-id-addressed-meta-state-list` is present with `shipped_in_plan: plans/260612-1200-id-addressed-meta-state-list/`.

Call `meta_state_list({ id: "meta-260610T1457Z-tool-surface-gap-meta-state-list-does-not-accept-id-single-o" })` and confirm `status: "resolved"`.

The remaining active loop-designs should be:
- `loop-design-meta-state-registry-sqlite-migration-trajectory-parked` (parked)
- `loop-design-schema-as-source-of-truth-bridge-5-derive-tool-schemas-from` (active)

## Success Criteria

- [x] Step 4.1 read captured `version` and the finding's `status: "stale"`, `evidence_code_ref`, `mechanism_check`.
- [x] Step 4.2 tool ship change-log returned a new id (recorded for Step 4.5 as `TOOL_CHANGE_LOG_ID`).
- [x] Step 4.3 ack response: `status: "active"`, `acked_at` populated.
- [x] Step 4.4 check_grounding: `status: "grounded"` (or drifted → refresh → grounded); resolve response: `status: "resolved"`, `resolved_by: "operator"`.
- [x] Step 4.5 closeout patch: `patched: true, version: <captured+1>`.
- [x] Step 4.6 design adoption change-log returned with `consolidates` set to the finding id.
- [x] Step 4.7 all read-back assertions pass; `derived_status === "active-no-signal"` AND `drift === false`.
- [x] Step 4.8 `pnpm check` exit 0.
- [x] Step 4.9 `git diff meta-state.jsonl` matches expected mutations.
- [x] Step 4.10 journal created.
- [x] Step 4.11 `ck plan check 1/2/3/4` exit 0; `plan.md` status flipped to `completed`.
- [x] Step 4.12 sweep confirms design is inactive with new ship metadata and finding is resolved.
- [x] Zero `node -e` invocations during this phase.
- [x] Zero `Edit`/`Write`/`Create` to `meta-state.jsonl` during this phase.

## Risk Assessment

- **Risk**: CAS mismatch on the design entry. **Mitigation**: capture `version` in Step 4.1; one retry; second mismatch = abort and surface to operator.
- **Risk**: `meta_state_resolve` consult-gate blocks on `rule-no-orphaned-evidence`. **Mitigation**: Step 4.4 grounding check before resolve. The finding's `evidence_code_ref` points to `tools/learning-loop-mcp/tools/meta-state-list-tool.js#inputSchema` which Phase 2 edits; the first check after the edit records the fresh fingerprint.
- **Risk**: `proposed_design_for` rejected as empty array. **Mitigation**: Step 4.5 populates it with the `TOOL_CHANGE_LOG_ID` (1 entry, satisfies `min(1)`).
- **Risk**: cold-tier no-broken-refs invariant rejects `proposed_design_for` entries that don't resolve. **Mitigation**: `TOOL_CHANGE_LOG_ID` is freshly created in Step 4.2; it resolves by definition.
- **Risk**: 24h TTL elapses on the stale finding before resolve. **Mitigation**: the finding is already `stale` (past TTL); no further TTL pressure. The `stale → resolved` transition is the canonical close path per plan 260611-1000.
- **Risk**: `consolidates` passed as array. **Mitigation**: pass single string per the schema.
- **Risk**: `meta_state_log_change` duplicates. **Mitigation**: idempotency guard — re-read `meta-state.jsonl` and confirm no entry with same `change_target` + `reason` exists before calling.

## Hand-off

After Step 4.12, the plan is complete. The remaining active loop-designs are:
- `loop-design-meta-state-registry-sqlite-migration-trajectory-parked` (parked)
- `loop-design-schema-as-source-of-truth-bridge-5-derive-tool-schemas-from` (active)

`loop-design-id-addressed-meta-state-list` is back to `inactive` with `shipped_in_plan: plans/260612-1200-id-addressed-meta-state-list/`. The 3-tier read surface (per-entry, neighborhood, full) is now operational.
