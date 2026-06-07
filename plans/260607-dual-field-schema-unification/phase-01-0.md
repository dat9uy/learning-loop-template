---
phase: 1
title: "0 — Surface declaration + decision records"
status: pending
priority: P1
effort: "30m"
dependencies: []
---

# Phase 0: Surface declaration + decision records

## Overview

Declare the surface in `product/**` (N/A — this is meta work) and create 2 decision records in `records/<surface>/decisions/`. Follow the AGENTS.md "Decision records MUST exist before implementation phases begin" rule (per `meta-260606T1830Z-context-pollution-stale-workaround-languag` precedent).

## Requirements

- **Functional:** 2 decision records in `records/meta/decisions/`. Both record the operator-approved choices from brainstorm `plans/reports/brainstorm-260607-dual-field-schema-unification.md`:
  1. Schema winner: top-level `evidence_code_ref` is canonical. Nested form is dropped.
  2. Hardening: Zod-validate at `writeEntry` + `updateEntry`; new consult-gate rule `rule-no-orphaned-evidence`.
- **Non-functional:** Decisions reference the brainstorming report path (no markdown references in `source_refs`; use the rule's own `meta-state` entries per the Internalization Rule).

## Architecture

N/A — pure metadata. No code changes.

## Related Code Files

- **Create:** `records/meta/decisions/decision-260607T-dual-field-schema-winner.yaml`
- **Create:** `records/meta/decisions/decision-260607T-zod-validate-at-chokepoints.yaml`
- **Read-only:** `tools/learning-loop-mcp/core/decision-writer.js` (the canonical writer)

## Implementation Steps

1. **Decide record shape.** Use the same shape as `records/meta/decisions/decision-260606T-rule-loop-design-first-class.yaml` (referenced from the sibling plan). Fields: `surface: meta`, `question`, `decision`, `rationale`, `alternatives` (mention the rejected options from the brainstorm), `tradeoffs`, `source_refs` (cite `local:meta-state:<id>` for the finding), `decision_effect`, `notes`.
2. **Write decision 1 (schema winner).** Use `record_create_decision` MCP tool. Title: "Top-level `evidence_code_ref` is the single source of truth; nested `evidence.code_ref` is dropped." Question: "Which schema shape should be the single source of truth for evidence references in meta-state entries?" Decision: "Top-level `evidence_code_ref` (with `evidence_journal` and `evidence_test` also top-level). The nested `evidence` block in `metaStateChangeEntrySchema` is removed."
3. **Write decision 2 (hardening).** Use `record_create_decision` MCP tool. Title: "Validate meta-state writes against the 4-kind Zod union at `writeEntry` and `updateEntry`; add consult-gate rule `rule-no-orphaned-evidence`." Decision: "Both A (Zod-validate at chokepoints) AND B (new consult-gate rule) are in scope."
4. **Validate.** Run `pnpm validate:plan-loop` and `pnpm validate:records`. Both must pass with the 2 new decision records present.

## Success Criteria

- [ ] `records/meta/decisions/decision-260607T-dual-field-schema-winner.yaml` exists with status: `accepted`
- [ ] `records/meta/decisions/decision-260607T-zod-validate-at-chokepoints.yaml` exists with status: `accepted`
- [ ] `pnpm validate:plan-loop` exits 0
- [ ] `pnpm validate:records` exits 0

## Risk Assessment

- **Risk:** Plan gate (`pnpm validate:plan-loop`) blocks Phase 0 if decision records are missing. **Mitigation:** Phase 0 IS the gate. If Phase 0 fails, no later phase runs.
- **Risk:** Decision records reference the wrong `meta-state` finding id. **Mitigation:** Use `meta-260607T0008Z-dual-field-schema-risk-evidence-code-ref-top-level-vs-eviden` (the finding this plan resolves). Verify by `meta_state_list({ id: "meta-260607T0008Z-..." })`.
