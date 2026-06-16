# B3 Codegen Candidate Audit

Plan: `plans/260614-1259-phase-b-codegen-adoption/`
Date: 2026-06-14

## Summary

Of the MCP tools flagged by the original LIM-7 audit as hand-writing Zod schemas, only two are genuine candidates for schema derivation from `metaStateEntrySchema`. The rest either have tool-level parameters not present on the entry schemas, intentionally loose handler-validated pre-filters, or schemas that are already optimal.

## Per-tool decisions

| Tool | Decision | Rationale |
|------|----------|-----------|
| `meta_state_report` | Already migrated | Uses `metaStateFindingEntrySchema.shape` directly; handler consumes most entry fields. |
| `meta_state_log_change` | **Migrate (partial)** | Hand-written schema is a subset of `metaStateChangeEntrySchema.shape`. Use `.pick()` to expose caller-provided fields and omit handler-generated fields. |
| `meta_state_propose_design` | **Migrate (partial)** | Hand-written schema is a subset of `metaStateLoopDesignSchema.shape`. Use `.pick()` + `.merge({ loop_design_id })`. Tool-level `loop_design_id` is not stored on the entry. |
| `meta_state_promote_rule` | **NOT a candidate** | Tool schema includes `id` (source finding id), `preview`, `sample_commands`, `sample_paths` which are not in `metaStateRuleEntrySchema`. Handler constructs a new rule entry internally. |
| `meta_state_batch` | **NOT a candidate / defer to Bridge 7** | `write` op uses `z.record(z.string(), z.unknown())` and `update` op uses `.passthrough()` as intentional pre-filters; validation is deferred to the handler. Replacing with strict per-kind schemas would break existing batch callers. |
| `meta_state_resolve` | **NOT a candidate** | Tool-level `cascade_from` is not in `metaStateFindingEntrySchema`. Schema is already minimal. |
| `meta_state_supersede` | **NOT a candidate** | Tool-level `_expected_version` is not in `metaStateFindingEntrySchema`. Schema is already minimal. |
| `meta_state_archive` | **NOT a candidate** | Tool-specific filter schema with no entry-shape overlap. |

## Notes

- The change-log entry schema has `.default([])` on `added`/`removed`/`changed` arrays inside `change_diff`; the tool schema mirrors this.
- The loop-design `.pick()` widens `affected_system` from the tool's 6-value enum to the entry schema's 15-value enum. This is forward-compatible and matches the source of truth.
- No changes to `core/meta-state.js` are required for this migration.
