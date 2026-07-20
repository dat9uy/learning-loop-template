---
phase: 3
title: "Row strike + closeout"
status: pending
priority: P2
effort: "30m"
dependencies: [2]
---

# Phase 3: Row strike + closeout

## Overview

Strike the two corrupt same-id rows from `runtime-state.jsonl` (operator manual bypass — the gate
blocks the agent), log a change-log for the whole plan-edit, run the whole-plan consistency sweep on
260719-1428, and resolve the C finding opened in Phase 1.

## Requirements

- Functional: the two `npx-skills-mastra-roundtrip-2026-07-19` rows (lines 23-24) are removed from
  `runtime-state.jsonl`; a change-log records the plan-edit + row strike; the C finding is resolved;
  260719-1428 has zero stale hand-off references.
- Non-functional: the row strike is performed by the operator (the agent cannot — write-gate blocks
  direct edits, `runtime_state_record` only appends, and the `runtime-state` rule's override is
  broken). A gate-log/change-log note records who/when/why.

## Architecture

`runtime-state.jsonl` is a mutable sidecar. `bound-artifacts.js:50-54` blocks direct writes;
`runtime_state_record` is append-only (no delete/replace tool); the `runtime-state` rule is a
simple-glob block, not promoted, so `gate_override({rule_id:"runtime-state"})` returns
`unknown rule_id` — the same broken-override shape as the schemas gate fixed in 260720-1112.
`gate_mark_preflight` unlocks only `product/**` + `skills/**`. So the agent has no sanctioned path
to strike rows. The operator performs the one-time edit manually; the inbound gate re-pins the file
afterward (consistent). The adjacent gate-logic gap is noted, not fixed here (out of scope).

## Related Code Files

- Modify (operator manual): `runtime-state.jsonl` — strike lines 23-24.
- Mutate (via MCP): `meta-state.jsonl` — change-log entry + C finding resolution.

## Implementation Steps

1. **Operator row strike (manual):** the operator removes the two lines with
   `id: "npx-skills-mastra-roundtrip-2026-07-19"` from `runtime-state.jsonl` (lines 23-24 — the
   08:13:00 corrupt placeholder + the 11:55:30 "correction"). Verify with
   `grep -c "npx-skills-mastra-roundtrip-2026-07-19" runtime-state.jsonl` → 0. The agent does not
   perform this edit (gate-blocked); it confirms the result.

2. **Log the change:** call `meta_state_log_change` with:
   - `change_dimension: "semantic"`
   - `change_target: "plans/260719-1428-central-skills-management"`
   - `change_diff: { removed: ["phase-03 Q4 ledger-event hand-off (status note L6 + Risk Assessment L103)", "plan.md Q4 ledger-event fallback (Confirmed Decisions + Action Item + Impact on Phases)", "runtime-state.jsonl lines 23-24 (two corrupt same-id npx-skills-mastra-roundtrip rows)"], changed: ["phase-03 npx-unavailable fallback -> F6 hash test (step 17)", "F11/F12 decoupled from ledger row -> plain presence + byte-identity tests"] }`
   - `reason:` "Drop unwired Q4 ledger-event hand-off; gate npx-round-trip on F6 hash test (Finding C of problem-solving-260719-2029)."
   - `applies_to: { surfaces: ["plans", "runtime-state"], rules: [] }`
   - `evidence_code_ref: "plans/260719-1428-central-skills-management/phase-03-mastra-npx-provider-switch-and-manifest-driven-exclusion.md:103"`

3. **Whole-plan consistency sweep on 260719-1428:** re-read `plan.md` + all `phase-*.md`. Grep for
   stale terms: `ledger-event`, `reads it back`, `whichever sandbox`, `metadata.hashes`,
   `runtime_state_read`, `npx-skills-mastra-roundtrip`. Every hit must be either (a) the
   supersession note in `plan.md` Q4 (expected — it documents the dropped mechanism) or (b) the
   historical validation-log text in `plan.md` (expected — audit trail). No *live* step/criterion
   may reference the hand-off. Reconcile any contradiction; report 0 unresolved.

4. **Resolve the C finding:** call `meta_state_resolve({ id: <Phase-1 finding id>, resolution:
   "Q4 ledger-event hand-off dropped from central-skills Phase 3; npx-unavailable fallback is the
   F6 hash test (step 17). F11/F12 decoupled to plain tests. Two corrupt same-id rows struck from
   runtime-state.jsonl (operator manual; gate blocks agent).", resolved_by: "operator" })`.

5. **Sanity test:** `pnpm test:iter` green. No test depended on the struck rows (the hand-off was
   unwired — no test gated on a runtime-state row); this is a regression guard, not a contract
   change.

6. **Note the adjacent gap (no action):** the runtime-state.jsonl write-gate's broken override
   (simple-glob, not promoted, `gate_override` "unknown rule_id") is the same shape as the schemas
   gate fixed in 260720-1112. If a future plan needs a sanctioned row-delete/replace path, that is a
   separate gate-logic finding — do not scope-creep this plan.

## Success Criteria

- [ ] `grep -c "npx-skills-mastra-roundtrip-2026-07-19" runtime-state.jsonl` → 0.
- [ ] `meta_state_log_change` entry landed (verify via `meta_state_list({ id: [<new change-log id>] })`).
- [ ] Whole-plan sweep on 260719-1428: 0 unresolved contradictions; only expected stale refs are the
      Q4 supersession note + historical validation-log text.
- [ ] C finding `status: resolved` (verify via `meta_state_list({ id: [<Phase-1 id>], include_archived: true })`).
- [ ] `pnpm test:iter` green.

## Risk Assessment

- **Operator edits a gated file** — the strike is a one-time manual action outside the tooling. The
  gate has no sanctioned delete path, so this is the chosen disposition. Record who/when/why in the
  change-log so the audit trail is not lost. The inbound gate re-pins the file after the edit.
- **Resolving too early** — resolve only after step 3 sweep confirms zero live hand-off references.
  If the sweep finds a stale reference, fix it before resolving.
- **Adjacent gate-logic gap** — discovered, not fixed. Scope-creep risk if this plan tries to extend
  preflight to `runtime-state.jsonl`; keep it out. Step 6 only notes it.