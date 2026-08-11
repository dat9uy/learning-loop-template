# Audit: glossary-extend convertible set (Phase 2)

**Plan:** `plans/260811-0914-mcp-wire-budget-restore-and-glossary-extend/`
**Date:** 2026-08-11
**Method:** semantics-based rule — a handler field converts to a glossary ref only
when its description prose duplicates the glossary entry's `meaning` (entry-field
semantics). Filter/query/op-input parameters that share a glossary name are excluded.

## Result: zero additional convertible bytes

Across all 44 manifest handlers, every glossary-keyed schema field was enumerated
(scripted via `manifest-loader` + zod `.shape` introspection) and classified:

| Classification | Fields | Disposition |
|---|---|---|
| Already glossary refs (report, log_change, propose-design, core/meta-state.js, runtime_state_record.source_ref) | ~30 | Kept as-is |
| Filter/query params sharing a glossary name (meta_state_list `id`/`status`/`affected_system`/`session_id`/`entry_kind`, runtime_state_read `affected_system`) | ~10 | **Excluded** — prose carries tool-specific filter behavior the glossary does not capture |
| Op-input params sharing a glossary name (patch/batch/archive/supersede/accept/... `id`/`entry_kind`/`mechanism_check`) | ~20 | **Excluded** — operation-input phrasing, not entry-field semantics |
| Different-enum semantic mismatch (runtime_state_record `affected_system` vs meta-state `affected_system`) | 1 | **Excluded** — the runtime enum (`AFFECTED_SYSTEM_ENUM_RUNTIME`) differs from the meta-state enum the glossary entry documents |

The already-converted set (report/propose-design/log-change + `core/meta-state.js`
entry schemas) already covers the entry-field prose that semantically duplicates the
glossary. No additional handler field qualifies.

## Allowlist (the plan's ref-coverage test gate)

The allowlist is the *existing* ref set, now exercised through the shared helper:

- `meta_state_report`: category, subtype, severity, affected_system, description,
  evidence_journal, evidence_code_ref, evidence_test, mechanism_check, session_id
- `meta_state_log_change`: change_dimension, change_target, change_diff, reason,
  applies_to, supersedes, consolidates, evidence_code_ref, evidence_journal,
  operation_envelope
- `meta_state_propose_design`: title, description, proposed_design_for, addresses,
  affected_system, severity_hint, loop_design_id

**Explicit negative:** `meta_state_list` filter fields (`id`, `status`,
`affected_system`, `session_id`, `entry_kind`, `ref_by`, `ref_field`) are NOT refs.

## Audited convertible bytes: 0

The Phase 2 gate ("wire drops by ≥ audited convertible bytes") is therefore
trivially satisfied at 0 bytes required. This matches the red-team's honest
finding: under "existing 19 entries only," the real convertible set is ~0-3% of
the top targets. Phase 2's delivered value is the shared-helper extraction (DRY),
not wire shrink.

## What Phase 2 shipped

1. `core/schema-glossary.js` — shared `describeField(field, schema)`.
2. Migrated 3 handlers off their local/inline ref construction to the shared helper
   (log_change's `describeChangeField`, report + propose-design's inline `.map()`).
3. `field-glossary.test.js` — covers the helper (node-type preservation), the
   allowlisted ref set, and the `meta_state_list` filter-field negative.

**Status: DONE** — no mass-conversion performed (audit total < 500 B; the plan's
risk section pre-decided against churning 44 handlers for a token gain).
