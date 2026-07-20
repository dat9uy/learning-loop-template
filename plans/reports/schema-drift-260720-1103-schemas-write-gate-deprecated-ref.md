---
title: "schemas/** write gate references deprecated pnpm validate:records + has no override path"
date: 2026-07-20
finding: meta-260720T1104Z-the-schemas-write-gate-at-tools-learning-loop-mastra-core-bo
category: gate-logic-bug
severity: warning
---

# schemas/** write gate drift

## What I observed

The `schemas/**` write gate's reason text — surfaced on every Edit/Write attempt that touches
`schemas/*.json` — references `pnpm validate:records` as the remediation step. That script does
not exist in `package.json`. The "then approve" step the reason text implies also has no working
mechanism for glob rules: `mastra_gate_override` (the MCP escape hatch documented in
`gate-override-tool.js`) only accepts *promoted* rule_ids, and `schemas/**` is a simple-glob rule
in `core/bound-artifacts.js` — it is NOT promoted. Calling `gate_override({rule_id:"schemas/**"})`
returns `error: unknown rule_id: schemas/**`.

This was the hard block I hit during plan 260719-2201 Phase 3 step 4 — the doc-only `schemas/
runtime-state.schema.json` tightening (decision 4) was rejected by the gate, and there was no
working override path. The change was skipped with a note in the D-resolution; the spec-honesty
edit is permanently deferred until the gate is repaired.

## Evidence

| # | Source | Observation |
|---|--------|-------------|
| 1 | `tools/learning-loop-mastra/core/bound-artifacts.js:80` | `reason: "Schema changes require validation. Run pnpm validate:records first, then approve."` |
| 2 | `package.json` (grep `"validate:records"`) | 0 matches — script is not defined |
| 3 | `gate_override({rule_id:"schemas/**",operator_note:"..."})` (MCP tool) | Returns `{"error":"unknown rule_id: schemas/**"}` |
| 4 | `gate-override-tool.js` schema | `pattern_type: agent-checklist` requires `promoted` rules; glob rules are not promoted |
| 5 | Inherited stale references | `orchestration-patterns.md`, `prompt-blueprints.md`, `agent-anti-confusion-checklist.md`, `plan-phase-0-template.md` all reference `pnpm validate:records` |
| 6 | Phase A schema-loader deletion | `schemas/**` files have NO code consumer — the Zod handler is the only enforcement point (verified during plan 260719-2201 Phase 3 step 4) |

## Why it matters

- **Operational deadlock on doc-only changes.** The recent Phase A schema-loader deletion
  means `schemas/**` is a spec-only sidecar. The gate is a hard block on spec-honesty
  changes (e.g. tightening a description to document a Zod refine) with no working override
  path AND no working validation step.
- **Operator confusion.** The gate text instructs the operator to run a script that does
  not exist. Any operator following the message will hit `ELIFECYCLE Command failed with
  exit code 1` and have to triangulate the actual workflow by reading `bound-artifacts.js`.
- **Doc drift cascade.** At least 4 reference docs inherit the same stale `pnpm validate:records`
  reference. They tell agents to "Run pnpm validate:records and pnpm check" in workflow
  recipes — both of which are partially or wholly missing from the current `package.json`
  scripts.

## Fix options (ranked)

1. **Repair the gate reason + add a schema preflight marker (recommended).** Two-line edit:
   change `bound-artifacts.js:80` reason to the current canonical workflow
   (operator-mediated change + `meta_state_log_change`); add a `schemas` preflight surface
   alongside `product`/`skills` so doc-only edits can be approved via
   `gate_mark_preflight({surface:"schemas"})`. Then sweep the 4 stale doc references and
   replace `pnpm validate:records` with the new canonical step.
2. **Promote `schemas/**` to a promoted rule.** Single-line edit in `evaluate-write-gate.js`:
   add `schemas` to the promoted-rule registry. Then `gate_override({rule_id:"schemas/**",
   operator_note:"doc-only"})` works for one-shot bypasses. Lower blast-radius than option 1
   but the underlying dead-script reference stays.
3. **Status quo + per-edit override path.** Document the current deadlock (this finding +
   the resolution note in the D phase) and add a `gate_check` escalation flow for any
   future schema edits. Doesn't fix the root cause; just narrows the operator's triage
   path.

## Operator decision

Filed as `meta-260720T1104Z-...` (status: open, mechanism_check on). Awaiting operator
choice between options 1, 2, 3 — option 1 is the cleanest fix but touches the preflight
surface registry (out of scope for the A+B+D plan). Reuse of plan 260719-2201's
"B-widening is a follow-up" pattern: a separate plan can be opened once the operator picks
an option.

## Unresolved questions

- Is there a historical reason `schemas/**` was kept as a simple-glob block rather than
  promoted (option 2)? The `gate-override-tool.js` agent-checklist type is recent (added
  with the hint-registry work in plan 260717-1826) — pre-2026-07-17 there may not have
  been a working override path at all, so promoting was not yet feasible.
- Should the `pnpm validate:records` references in the 4 doc files be fixed in the same
  change as the gate reason (single atomic commit), or as a follow-up sweep? Single
  commit is cleaner — the reason text is the source of truth the docs inherit.
