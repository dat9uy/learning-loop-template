---
phase: 5
title: "PR-body Rule Promotion"
status: pending
priority: P1
dependencies: [2, 3]
effort: "~30min"
---

# Phase 5: PR-body Rule Promotion

## Overview

Defer design work via `meta_state_propose_design`, then promote `rule-pr-body-registry-deltas` to an active rule with `enforcement: "agent"` and `pattern_type: "consult-checklist"`. The rule's discoverability surface is `PROCESS_HINTS` (created in Phase 3), not `DISCOVERABILITY_HINTS`.

**Strict ordering:** Phase 2 (citation repair) and Phase 3 (PROCESS_HINTS split) must complete before this phase. Phase 2 ensures the audit trail is clean. Phase 3 ensures the rule has a discoverability home.

**Registry-level ordering gate (Red Team H6):** Add a check in `loop-describe-tool.js` that fails the warm tier if a `rule-*` entry with `pattern_type: "consult-checklist"` lacks a corresponding `PROCESS_HINTS` row. This prevents promoting a rule before its discoverability surface exists.

## Requirements

- Functional: `loop-design-pr-quality-rules-and-hints-split` is filed with `proposed_design_for: ["rule-pr-body-registry-deltas"]` and `addresses: ["meta-260622T1708Z-...", "meta-260622T1713Z-..."]`.
- Functional: `rule-pr-body-registry-deltas` is promoted with `enforcement: "agent"`, `pattern_type: "consult-checklist"`, `scope_predicate: "project_has_learning_loop_mcp"`.
- Functional: source finding `meta-260622T1708Z-...` has `promoted_to_rule: "rule-pr-body-registry-deltas"` after promotion.
- Functional: source finding `meta-260622T1713Z-...` is resolved (or remains active, per operator decision).
- Functional: the new `PROCESS_HINTS` entry surfaces the rule at session start.
- Functional: `loop-describe({tier:"warm"})` enforces that promoted `consult-checklist` rules have a corresponding `PROCESS_HINTS` row (H6).
- Non-functional: `meta_state_propose_design` is idempotent on `addresses + proposed_design_for` set.
- Non-functional: `meta_state_promote_rule` is gated on `OPERATOR_MODE=1`.
- Non-functional: PROCESS_HINTS text does not duplicate enforcement metadata (Red Team M3).

## Architecture

Two-step promotion pattern (precedent: `rule-runtime-agnostic-features` at `meta-state.jsonl:129`):

```js
// Step 1: Defer design
meta_state_propose_design({
  title: "PR-body registry-delta rule + discoverability hints split",
  description: "...",
  proposed_design_for: ["rule-pr-body-registry-deltas"],
  addresses: ["meta-260622T1708Z-...", "meta-260622T1713Z-..."],
  affected_system: "meta",
  severity_hint: "medium",
  loop_design_id: "loop-design-pr-quality-rules-and-hints-split"
})

// Step 2: Promote rule (6 items, post-H8 simplification)
meta_state_promote_rule({
  id: "meta-260622T1708Z-every-pr-that-modifies-meta-state-jsonl-registry-sweeps-stat",
  rule_id: "rule-pr-body-registry-deltas",
  enforcement: "agent",
  pattern_type: "consult-checklist",
  scope_predicate: "project_has_learning_loop_mcp",
  pattern: JSON.stringify({
    version: 1,
    items: [
      { id: "swept-entries", description: "Sweep entries by id + reason (status=stale)" },
      { id: "resolved-entries", description: "Resolved entries by id + resolution note" },
      { id: "new-entries", description: "New entries by id + initial status" },
      { id: "promoted-rules", description: "Promoted rules by finding_id + rule_id" },
      { id: "superseded-entries", description: "Superseded entries by id + consolidated_into" },
      { id: "archived-entries", description: "Archived entries by id + archived_reason" }
    ]
  })
})
```

**Note (Red Team M5):** The 7th item (`other-patches`) is dropped. Routine field-level patches (`acked_at`, `code_fingerprint`, `reopens`) are bookkeeping, not registry deltas requiring PR-body enumeration. Phase 4's simplified parser (H8) does not emit "Other Patch" category.

**Note (Red Team M3):** The PROCESS_HINTS entry does not duplicate `consult-checklist` or `project_has_learning_loop_mcp` (those are enforcement shape, not registry invariants). The hint cites the rule id and points to the registry for details.

## Related Code Files

- Modify: `meta-state.jsonl` (1 new `loop-design` entry, 1 new `rule` entry, source finding patches)
- Modify: `core/loop-introspect.js` (add 1 PROCESS_HINTS entry citing the rule id only)
- Modify: `tools/learning-loop-mcp/tools/loop-describe-tool.js` (add H6 ordering gate)

## Implementation Steps

1. **Propose the design.** `meta_state_propose_design` with the inputs above. Capture the returned `id`.

2. **Add PROCESS_HINTS entry (Red Team M3 fix).** Add a new entry to `PROCESS_HINTS` in `core/loop-introspect.js`:
   ```
   "PR-body registry deltas. Every PR that touches `meta-state.jsonl` must enumerate its deltas in the PR body: (a) sweep entries by id+reason, (b) resolved entries by id+resolution note, (c) new entries by id+initial status, (d) promoted rules by finding_id+rule_id, (e) superseded/archived entries by id+target. See `rule-pr-body-registry-deltas` in `meta-state.jsonl` for the canonical rule body and enforcement shape. The CI workflow `meta-state-pr-body-advisory.yml` surfaces the deltas in the PR's Checks tab."
   ```
   This entry describes intent and cites the rule id. Enforcement shape is NOT duplicated (lives in the registry).

3. **Promote the rule.** `meta_state_promote_rule` with the 6-item pattern (post-M5).

4. **Verify promotion.** `meta_state_list({ id: ["rule-pr-body-registry-deltas", "loop-design-pr-quality-rules-and-hints-split"] })`. Confirm both entries exist with correct `enforcement`, `pattern_type`, `scope_predicate`, `origin`, `proposed_design_for`, `addresses`.

5. **Verify source finding linkage.** `meta_state_list({ id: ["meta-260622T1708Z-..."] })`. Confirm `promoted_to_rule: "rule-pr-body-registry-deltas"`.

6. **Verify `loop_describe` surfaces the new PROCESS_HINTS entry.** `loop_describe({tier:"warm"})`. Confirm `process_hints` includes the new entry.

7. **Implement H6 ordering gate.** Modify `loop-describe-tool.js`: when the warm tier renders rules, cross-check each `consult-checklist` rule against `PROCESS_HINTS` rows. If a rule has no matching `PROCESS_HINTS` row (keyed by rule id), throw an error or warn loudly. This prevents future regressions where a rule is promoted without a discoverability home.

8. **Resolve source findings (operator decision Q5).** Per operator:
   - Option A: Resolve both findings (`meta_state_resolve` with `resolution: "rule-pr-body-registry-deltas" promoted; PROCESS_HINTS split shipped; CI advisory in place`).
   - Option B: Leave findings active as audit trail. Status flips to `active` after `meta_state_ack` (no resolve).
   - Option C: Resolve finding 1 (PR-body rule); leave finding 2 active until PROCESS_HINTS surface is verified in production.

## Success Criteria

- [ ] `loop-design-pr-quality-rules-and-hints-split` filed with `proposed_design_for` and `addresses`
- [ ] `rule-pr-body-registry-deltas` promoted with 6-item pattern (post-M5)
- [ ] Source finding has `promoted_to_rule` reference
- [ ] PROCESS_HINTS entry added in `core/loop-introspect.js` (no enforcement-shape duplication — M3)
- [ ] H6 ordering gate implemented in `loop-describe-tool.js`
- [ ] `loop_describe({tier:"warm"})` includes the new entry in `process_hints`
- [ ] H6 gate fails loudly if a `consult-checklist` rule lacks a `PROCESS_HINTS` row (test)
- [ ] (Operator decision) Source findings resolved or acknowledged
- [ ] Cold-session discoverability test still passes (PROCESS_HINTS entry is consistent with mirror)

## Risk Assessment

- **Promotion with broken `evidence_journal`.** Risk: high if Phase 2 is skipped. Mitigation: Phase 2 is a hard dependency; `meta_state_promote_rule` will succeed but the audit trail is corrupted.
- **PROCESS_HINTS entry not yet in surface.** Risk: high if Phase 3 is skipped. Mitigation: H6 ordering gate (step 7) enforces at runtime.
- **Idempotency collision on `propose_design`.** Risk: very low. `meta_state_propose_design` is idempotent on `addresses + proposed_design_for` set; re-invocation returns the existing id.
- **Operator decision Q5 ambiguous.** Risk: low. Phase 5 can proceed with `ack` (status: `active`) and defer resolve to Phase 6 acceptance gate.
- **PROCESS_HINTS drift from rule body (M3).** Risk: low. Hint cites the rule id; future rule updates do not require hint update. Mitigation: explicit `See rule-... in meta-state.jsonl` citation.
- **`other-patches` dropped (M5).** Risk: low. Routine field-level patches are bookkeeping; if a future operator needs to enumerate them, they can extend the rule.
