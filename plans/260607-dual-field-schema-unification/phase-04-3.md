---
phase: 4
title: "3 — In-place migration (30 entries)"
status: pending
priority: P1
effort: "1.5h"
dependencies: ["2"]
---

# Phase 3: In-place migration (30 entries)

## Overview

Migrate 30 entries in `meta-state.jsonl` from nested form to top-level form. Idempotent. CAS-safe. Atomic (defer writes until all validations pass). Pattern is reused from `scripts/backfill-mechanism-check.mjs` (the `260606-meta-state-scan-readiness-refactor` Phase 5 ship). **RED→GREEN:** Phase 1's T-1 turns green; the 30 entries are flattened.

## Requirements

- **Functional:** for each entry in registry:
  - If `entry.evidence?.code_ref` is set and `entry.evidence_code_ref` is not set: copy `entry.evidence.code_ref` to `entry.evidence_code_ref`.
  - If `entry.evidence?.journal` is set and `entry.evidence_journal` is not set: copy `entry.evidence.journal` to `entry.evidence_journal`.
  - If `entry.evidence?.test` is set and `entry.evidence_test` is not set: copy `entry.evidence.test` to `entry.evidence_test`.
  - If `entry.evidence` is now `{}` (no remaining fields): delete `entry.evidence`.
  - If `entry.evidence` has any other fields: keep (forward-compat with future schema additions).
  - Validate the result against the entry's kind-specific schema. If validation fails, abort with a clear error.
  - Defer all writes until all validations pass (atomic).
  - For each pending write: call `updateEntry(root, entry.id, { ...patch, _expected_version: entry.version ?? 0 })`. If `r === "version_mismatch"`, log warning and skip. If `r !== true`, log warning and skip.
- **Idempotency:** skip if `entry.evidence_code_ref` is already set (regardless of `entry.evidence?.code_ref` value).
- **Non-functional:** the script logs each step in structured format: `[flatten] <entry-id>: <field> → top-level`. Exits 0 on success, 1 on validation failure. Reads from `process.argv` for `--root=<path>` (default: `process.cwd()`).

## Architecture

Direct file I/O via `core/meta-state.js#readRegistry` + `updateEntry`. Same pattern as `backfill-mechanism-check.mjs`. NOT a one-shot `pnpm` script invocation in CI; invoked by an operator from the shell after the plan is approved.

## Related Code Files

- **Create:** `tools/learning-loop-mcp/scripts/flatten-evidence-fields.mjs`
- **Create:** `tools/learning-loop-mcp/__tests__/flatten-evidence-fields.test.js`
- **Modify:** `meta-state.jsonl` (in-place mutation of 30 entries)
- **Read-only:** `tools/learning-loop-mcp/core/meta-state.js` (uses `readRegistry`, `updateEntry`, `metaStateFindingEntrySchema`, `metaStateChangeEntrySchema`, `metaStateRuleEntrySchema`, `metaStateLoopDesignSchema`)
- **Reference pattern:** `tools/learning-loop-mcp/scripts/backfill-mechanism-check.mjs` (CAS-safe idempotent migration)

## Implementation Steps

1. **Write the 3 TDD tests (RED).** Create `__tests__/flatten-evidence-fields.test.js`:
   - **T-A (roundtrip):** apply script to fixture with 4 dual-form entries (1 finding, 1 change-log, 1 rule, 1 loop-design); assert 0 nested forms post-run; assert all 4 entries validate against their kind-specific schema.
   - **T-B (idempotency):** run script twice on the same fixture; assert second run produces 0 changes; assert registry is byte-identical (snapshot diff).
   - **T-C (partial-state recovery):** fixture with 1 entry already migrated (top-level set, no nested) and 1 not; assert only the un-migrated entry is rewritten; assert the already-migrated entry is untouched (CAS `_expected_version` matches).
2. **Implement the script (GREEN).** `tools/learning-loop-mcp/scripts/flatten-evidence-fields.mjs`:
   - Parse `--root=<path>` from `process.argv`.
   - Read registry. Iterate entries.
   - For each entry: check if flattening is needed (skip if no nested form).
   - Construct the patch object (top-level fields + delete `evidence` if empty).
   - Validate the patched entry against the kind-specific schema.
   - Collect all pending updates. Defer writes.
   - For each pending update: call `updateEntry` with `_expected_version`. Handle `version_mismatch` and other failures.
3. **Run the script on the real registry.** `node tools/learning-loop-mcp/scripts/flatten-evidence-fields.mjs --root=$(pwd)`. Verify: 0 entries with nested `evidence.code_ref`. Verify all 30 updated entries validate against their kind-specific schema.
4. **Add a change-log entry.** Use `meta_state_log_change` MCP tool (or the `record_update_decision` workflow) to record the migration. `change_target: "meta-state.jsonl#flatten-evidence-fields"`, `change_diff: { changed: ["30 entries: evidence.code_ref → evidence_code_ref (top-level)"] }`, `reason: "Closes meta-260607T0008Z-dual-field-schema-risk. Top-level is now canonical; the 4-kind Zod union enforces shape at write time. 30 entries flattened in-place."`
5. **Run the test suite.** `pnpm test`. All tests pass (allow 1 pre-existing failure: `gate-integration.test.cjs`).

## Success Criteria

- [ ] T-A, T-B, T-C from `flatten-evidence-fields.test.js` all pass
- [ ] T-1 from Phase 1's coverage test turns GREEN (0 entries with nested `evidence.code_ref`)
- [ ] `meta-state.jsonl`: 0 entries carry nested `evidence.code_ref`
- [ ] All 30 updated entries validate against their kind-specific schema
- [ ] Change-log entry recorded (use `meta_state_log_change` MCP tool)
- [ ] `pnpm test` passes (allow 1 pre-existing failure)

## Risk Assessment

- **Risk:** Migration script corrupts registry. **Mitigation:** CAS via `_expected_version`; defer all writes until all validations pass; abort on first validation failure; `git status` check before commit (if registry state looks wrong, the script is reversible by `git checkout meta-state.jsonl`).
- **Risk:** An entry has `evidence.code_ref` and `evidence_code_ref` set to DIFFERENT values. **Mitigation:** the script's idempotency guard (skip if `evidence_code_ref` is already set) handles this; the nested form is preserved as-is and a manual review is needed. Log a warning in this case.
- **Risk:** A loop-design entry has a nested `evidence` block. **Mitigation:** loop-designs don't have evidence per the schema, but a future writer may have added one. The script treats any entry with a nested `evidence.code_ref` as a candidate for flattening; loop-designs are simply exempt from the kind-specific validation if they have no other required fields.
- **Risk:** Snapshot diff test fails because of trailing-newline differences. **Mitigation:** the script uses `writeFileSync` with a trailing `\n`; the snapshot diff compares the file bytes, not parsed entries. Accept this.
