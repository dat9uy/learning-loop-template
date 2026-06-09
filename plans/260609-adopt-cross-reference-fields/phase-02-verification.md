---
phase: 2
title: Verification
status: completed
priority: P2
effort: 10m
dependencies:
  - 1
---

# Phase 2: Verification

## Overview

Read-back verification of every Phase 1 mutation. Mechanical + structural assertions. No new mutations.

## Requirements

- Functional: every Phase 1 mutation is observable in `meta-state.jsonl` via `meta_state_list` / `meta_state_derive_status`; full test suite passes.
- Non-functional: verification is read-only (no mutations); reuses the MCP read surface.

## Architecture

Two layers of verification:

1. **MCP-tool read-back** (the canonical verification path; same tools the loop's cold-tier regression test uses).
2. **Shell-level test suite** (`pnpm check`) to confirm no regressions and that the registry's structural invariants still hold.

## Related Code Files

- Read: `meta-state.jsonl` (via `meta_state_list`, `meta_state_derive_status`)
- Run: `pnpm check` (full validation: 898/898 tests + schema validation + index extraction)

## Implementation Steps

### Step 2.1: Read-back the design entry

Call `meta_state_list({ entry_kind: "loop-design", id: "loop-design-cross-reference-fields" })`.

Assert (all must hold):
- `status === "inactive"`
- `proposed_design_for.length === 2`
- `proposed_design_for[0] === "meta-260606T2055Z-tools-learning-loop-mcp-core-meta-state-js-metastateentrysch"`
- `proposed_design_for[1] === "meta-260608T1258Z-tools-learning-loop-mcp-tools-meta-state-patch-tool-js"`
- `shipped_in_plan === "plans/260609-adopt-cross-reference-fields/"`
- `shipped_at` is a valid ISO 8601 timestamp ≤ now
- `version === 8` (baseline 6 + 2 patches: 6→7 for `proposed_design_for`, 7→8 for `status` + `shipped_*`)

### Step 2.2: Read-back the next-up finding

Call `meta_state_list({ entry_kind: "finding", id: "meta-260609T2102Z-next-up-adopt-loop-design-cross-reference-fields-status-acti" })`.

Assert (all must hold):
- `status === "resolved"`
- `resolved_at` is a valid ISO 8601 timestamp ≤ now
- `resolved_by === "operator"`
- `resolution` contains the phrase "shipped_in_plan" (the substantive closeout narrative)

### Step 2.3: Confirm the ship change-log exists

Call `meta_state_list({ entry_kind: "change-log" })` and grep for the `id` returned from Step 1.7 (recorded in Phase 1).

Assert (all must hold):
- An entry exists with `change_target === "meta-state.jsonl#loop-design-cross-reference-fields"`
- `consolidates === "meta-260609T2102Z-next-up-adopt-loop-design-cross-reference-fields-status-acti"` (single string per `metaStateChangeEntrySchema.consolidates: z.string().optional()`)
- `applies_to.tools` includes `meta_state_patch` (proves the change-log references the very tool that did the work)

### Step 2.4: Derive status of the design entry

Call `meta_state_derive_status({ id: "loop-design-cross-reference-fields" })`.

Inspect the response:
- `derived_status === "active-uncertain"`: PASS (the design is still code-grounded; the file is unchanged by this plan).
- `drift === false`: PASS (no fingerprint drift).
- If `derived_status === "code-missing"` or `drift === true`: FAIL. Investigate. The design's `evidence_code_ref` is `tools/learning-loop-mcp/core/meta-state.js#metaStateLoopDesignSchema` which is stable; drift is unexpected.

### Step 2.5: Run the full test suite

Run `pnpm check` from the project root.

Assert: exit code 0, all 898 tests pass, validation reports 0 errors.

If failures: investigate. Likely candidates: cold-tier regression test (may need a fixture refresh if the registry shape changed), schema validation (if the patch tool wrote a non-conformant value).

### Step 2.6: Confirm diff matches expected mutations

Run `git diff meta-state.jsonl` and confirm the diff is **non-empty but exactly 4 expected changes**:

1. The design entry line: shows the new `proposed_design_for` array (2 entries) + the version bump.
2. The design entry line: shows the `status: inactive` + `shipped_in_plan` + `shipped_at` + the version bump. (May merge with change 1 in a single JSON line if both patches hit the same JSON object; that's fine.)
3. The next-up finding line: shows `status: "resolved"`, `resolved_at`, `resolved_by: "operator"`, `resolution` text.
4. An appended line: the new change-log entry (last line of the file).

No other lines should change. If any unrelated line changed, an escape-hatch was used — file a finding and abort.

## Success Criteria

- [ ] Step 2.1 all 8 assertions pass.
- [ ] Step 2.2 all 4 assertions pass.
- [ ] Step 2.3 all 3 assertions pass.
- [ ] Step 2.4 `derived_status === "active-uncertain"` AND `drift === false`.
- [ ] Step 2.5 `pnpm check` exit code 0.
- [ ] Step 2.6 `git diff meta-state.jsonl` shows exactly the 4 expected mutations (1 patch on the design entry, 1 status flip on the design entry, 1 resolve on the next-up finding, 1 appended change-log line).

## Risk Assessment

- **Risk**: `pnpm check` failure from a cold-tier test counting change-logs. **Mitigation**: the test was rewritten to invariant-based assertions in plan `260608-2255`; should not be count-sensitive. If a fixture exists for the design, the design is `entry_kind: loop-design` (not in the change-log count).
- **Risk**: Schema validation flags the patch as non-conformant. **Mitigation**: `metaStateLoopDesignSchema` requires `proposed_design_for: array().min(1)` (now satisfied with 2 entries) and `status: enum(["active", "inactive"])` (now satisfied with "inactive"). The shipped_in_plan + shipped_at are optional. Patch tool's Zod validation will catch any shape error before write.
- **Risk**: Phase 1's `meta_state_log_change` produced a duplicate entry (the `meta-260606T2106Z` gap). **Mitigation**: Step 2.3 grep would find 2 entries with same `change_target` + similar `reason`; surface to operator.
