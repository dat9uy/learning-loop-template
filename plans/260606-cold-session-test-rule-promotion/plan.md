---
title: "Promote cold-session test as gate-enforced resolution-evidence rule"
description: "Promote the cold-session test (cold-session-discoverability.test.cjs#droid exec exposes mcp__learning_loop_mcp__* tools) as a gate-enforced rule that gates the resolution of meta-260606T0443Z-mcp-tools-not-loaded-into-agent-tool-list. The rule fires when meta_state_resolve is called on the target finding; the check is that the cold-session test's last evidence shows the gap is closed."
status: pending
priority: P2
branch: "main"
tags: [product-build]
blockedBy: []
blocks: []
created: "2026-06-06T08:50:35.310Z"
createdBy: "ck:plan"
source: skill
---

# Promote cold-session test as gate-enforced resolution-evidence rule

## Pre-Creation Check

- **Plan Context at session start:** none (no active plan in scope; this is a new plan)
- **Cross-plan scan result:** no blocking dependencies
  - `260606-discoverability-and-meta-evidence-migration` (parent plan, completed): this plan is the captured deferral follow-up from that plan's "Out of Scope" section. The parent plan's success criteria are all met; the deferral was a deliberate design decision.
  - `260605-superseded-status-and-discoverability` (sibling plan, completed): ships the `promoted_to_rule` mechanism that this plan extends with a new `pattern_type`.
  - `260602-self-enforcing-loop` (architecture plan, completed): establishes the meta-state-as-rule-registry invariant that this plan builds on.
- **INBOUND STATE GATE note:** the 4 `observation-vnstock-*` records are flagged stale by the gate, but per `260606-discoverability-and-meta-evidence-migration` Out of Scope #4 they are domain state, not actual stale. No mutation in this plan.

## Overview

The cold-session test (added 2026-06-06) currently surfaces the droid-runtime MCP client-side loading gap as a `meta_state_report` finding, but does not prevent the gap from being marked resolved without evidence. This plan adds a new `pattern_type: "resolution-evidence-required"` to the gate's rule system, wires `meta_state_resolve` to consult such rules, and updates the cold-session test to keep its finding current (delete on gap-close, log on gap-open). The result: a resolution attempt on `meta-260606T0443Z-mcp-tools-not-loaded-into-agent-tool-list` is blocked unless the cold-session test's most recent evidence shows the gap is closed.

## Design (captured in meta-260606T1531Z-cold-session-test-rule-deferred)

1. **New `pattern_type: "resolution-evidence-required"` in `core/gate-logic.js#applyPromotedRules`:** a third pattern type, alongside `regex` and `glob`. The pattern type is not a command-path match; the rule check happens in `meta_state_resolve` (the per-tool gate). The new branch in `applyPromotedRules` is a `continue` (skips command-path matching for this pattern type).
2. **New `checkResolutionEvidence(rule, root)` helper in `core/gate-logic.js`:** reads `meta-state.jsonl`, asserts no `finding` entry with `subtype="mcp-client-loading"` AND `session_id="test-cold-session-mcp-client-loading"` AND `status in ["active", "reported"]`. Returns `{ satisfied: true }` or `{ satisfied: false, blocking_id, rule_id, applies_to_resolution }`.
3. **`meta_state_resolve` consultation:** before `updateEntry`, `meta_state_resolve` loads promoted rules and for each rule with `pattern_type === "resolution-evidence-required"` AND `applies_to_resolution === id` (the entry being resolved), calls `checkResolutionEvidence`. If any rule is unsatisfied, the tool returns `{ resolved: false, reason: "resolution_evidence_required", rule_id, blocking_id }` and does NOT mutate the registry.
4. **Cold-session test update (Phase 2):** the test, on every run, evaluates the live gap state. If the gap is closed AND a stale finding exists, the test DELETES the finding (so the gate's "no finding" check is satisfied). If the gap is open AND a finding exists, the test is idempotent (skips the write). If the gap is open AND no finding exists, the test logs a new finding (current behavior).

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Resolution-evidence mechanism (TDD)](./phase-01-resolution-evidence-mechanism-tdd.md) | Pending |
| 2 | [Cold-session test evidence refresh (TDD)](./phase-02-cold-session-test-evidence-refresh-tdd.md) | Pending |
| 3 | [Rule entry and closeout](./phase-03-rule-entry-and-closeout.md) | Pending |

## Locked Decisions

1. **New pattern type, not regex/glob hack.** The "regex matching empty string" alternative would be misleading in `loop_describe` output. A named pattern type is the honest semantic shape. The pattern type is extensible (any future "before resolving X, show evidence from Y" rule can reuse it).
2. **Test responsibility: keep evidence current.** The cold-session test, not the gate, is responsible for ensuring the persisted finding reflects the live gap state. The gate's check is read-only; the test mutates. This is the inverse of typical gate logic (where the gate is the active check). Rationale: the test already runs the live probe; piggybacking the deletion on the probe run avoids spawning a separate probe in the gate.
3. **Rule's pattern is the test's session_id (`test-cold-session-mcp-client-loading`).** This is a stable, machine-derivable key. The test's existing idempotency guard already uses this key; the rule check reuses the same key. Single source of truth.
4. **The deferred design note (`meta-260606T1531Z-cold-session-test-rule-deferred`) is resolved in Phase 3, NOT in this plan's body.** The plan ships the design; the operator resolves the design note as part of closeout.
5. **The original gap (`meta-260606T0443Z-mcp-tools-not-loaded-into-agent-tool-list`) is NOT resolved by this plan.** The gap is still open in the current environment (verified 2026-06-06). The rule, once active, will correctly BLOCK any resolution attempt. This is the desired behavior — the rule proves itself by blocking.
6. **`meta_state_resolve` returns a structured error on rule failure.** The return shape is `{ resolved: false, reason: "resolution_evidence_required", rule_id, blocking_id, applies_to_resolution }`. The `appendGateLog` entry records the failure with full provenance.
7. **Test isolation: the new tests for `checkResolutionEvidence` and the `meta_state_resolve` consultation use `mkdtempSync` fixtures.** No pollution of the real project's `meta-state.jsonl` or `records/`. The cold-session test (Phase 2) DOES write to the real project's `meta-state.jsonl` (intentional, per the design); its existing test isolation is already snapshot-based for this file (updated 2026-06-06 in a prior turn).

## Out of Scope (Captured as Follow-Ups)

- **Schema enhancement for formal cross-references (`meta-260606T1543Z-meta-state-cross-reference-field-design`).** The relationship between the deferred design note and the target finding is captured informally in the description field (with a structured "Related finding:" prefix). A formal `applies_to.findings` or generic `related_to` field is a separate plan. This plan uses the description-prefix workaround.
- **Resolution of `meta-260606T0443Z-mcp-tools-not-loaded-into-agent-tool-list`.** The gap is still open in the current environment; the rule correctly blocks resolution. A separate plan (out of scope of this deferral) is needed to fix the droid runtime's MCP client-side loading and re-verify the cold-session test shows the gap closed.
- **Per-finding rule targeting via `applies_to_resolution`.** This plan supports a 1:1 mapping (one rule → one target finding). Future plans could extend to N:M (one rule → many findings, many rules → one finding) by changing the field from a single id to an array.
- **Rule expiration / soft delete via `meta_state_resolve`.** When the rule's target finding is resolved, the rule entry itself remains in the registry. The `loadPromotedRules` filter still loads it; the consultation in `meta_state_resolve` skips it (no target finding to apply to). The rule entry could be auto-disabled or marked `disabled` in a future plan.

## Success Criteria

- [ ] Phase 1: `tools/learning-loop-mcp/__tests__/gate-resolution-evidence.test.js` exists and the 4 new tests pass
- [ ] Phase 1: `tools/learning-loop-mcp/core/gate-logic.js#checkResolutionEvidence` is exported and documented
- [ ] Phase 1: `applyPromotedRules` handles the new `pattern_type` (skips command-path matching)
- [ ] Phase 1: `meta_state_resolve` consults the rule and returns `{ resolved: false, reason: "resolution_evidence_required" }` on unsatisfied evidence
- [ ] Phase 1: existing rule tests still pass (no regression in `loadPromotedRules` or `applyPromotedRules`)
- [ ] Phase 2: `cold-session-discoverability.test.cjs#droid exec exposes mcp__learning_loop_mcp__* tools` deletes the persisted finding when the gap is closed
- [ ] Phase 2: existing cold-session test behavior (gap open → log; gap closed + no finding → silent pass; gap open + finding exists → idempotent no-op) is preserved
- [ ] Phase 3: a new finding entry exists in `meta-state.jsonl` with `promoted_to_rule: { ..., pattern_type: "resolution-evidence-required", applies_to_resolution: "meta-260606T0443Z-..." }`
- [ ] Phase 3: `meta-260606T1531Z-cold-session-test-rule-deferred` is resolved (operator action; the plan shipped)
- [ ] Phase 3: a `change-log` entry is added documenting the rule mechanism's first instance
- [ ] Phase 3: an attempt to `meta_state_resolve` `meta-260606T0443Z-...` returns `resolution_evidence_required` (rule is correctly blocking; the gap is still open)

## Dependencies

- **Inherited from `260605-superseded-status-and-discoverability`:** the `promoted_to_rule` mechanism, `loadPromotedRules` filter (accepts `status: resolved` with `promoted_to_rule`), and `applyPromotedRules` defensive checks.
- **Inherited from `260606-discoverability-and-meta-evidence-migration`:** the cold-session test (`cold-session-discoverability.test.cjs#droid exec exposes mcp__learning_loop_mcp__* tools`) with its session_id-keyed idempotency guard.
- **No blocking plans.** This plan can ship independently of any in-flight plan.

## Risk Assessment

- **Risk 1:** The new `pattern_type` is a new code path in `loadPromotedRules` / `applyPromotedRules`. Mitigation: explicit `continue` branch in `applyPromotedRules` (no command-path matching for this type); no new entry in `loadPromotedRules` filter logic.
- **Risk 2:** The cold-session test's deletion behavior could leave a window where the test is running and the finding is gone but the gap is detected. Mitigation: the test uses `readRegistry` before write, so the deletion is atomic with the registry's per-root write queue (`core/meta-state.js#enqueue`). No read-modify-write race.
- **Risk 3:** `meta_state_resolve` consultation is per-call, not cached. Each resolution call reads `meta-state.jsonl` via `loadPromotedRules`. The `loadPromotedRules` cache (mtime + size tuple) minimizes repeated I/O.
- **Risk 4:** The rule's pattern is the session_id string. If a future test reuses the same session_id for a different gap, the rule would falsely report unsatisfied. Mitigation: the session_id is namespaced (`test-cold-session-mcp-client-loading`); the rule's pattern matches the full string.
- **Risk 5:** A resolution attempt on `meta-260606T0443Z-...` will fail with `resolution_evidence_required` for the duration of the gap. This is correct behavior but may surprise operators who expect to be able to force-resolve. Mitigation: Phase 3 closeout includes a clear note that the rule blocks resolution; the `disable` status on the rule entry remains the explicit kill switch.

## TDD Tests Added (this plan)

| Test File | Test | Asserts |
|-----------|------|---------|
| `__tests__/gate-resolution-evidence.test.js` (new) | `checkResolutionEvidence` returns satisfied when no finding exists | helper reads registry; absent finding → `{ satisfied: true }` |
| `__tests__/gate-resolution-evidence.test.js` (new) | `checkResolutionEvidence` returns unsatisfied when active finding exists | helper reads registry; present finding → `{ satisfied: false, blocking_id, rule_id }` |
| `__tests__/gate-resolution-evidence.test.js` (new) | `applyPromotedRules` skips `resolution-evidence-required` pattern type in command-path matching | pattern type is not a regex/glob; `applyPromotedRules` returns `{ decision: "ok" }` for command/path inputs |
| `__tests__/gate-resolution-evidence.test.js` (new) | `meta_state_resolve` returns `resolution_evidence_required` when rule is unsatisfied | `meta_state_resolve({ id: target })` returns `{ resolved: false, reason: "resolution_evidence_required", ... }` and does NOT mutate the registry |
| `__tests__/cold-session-discoverability.test.cjs` (extend) | cold-session test deletes persisted finding on gap-close | test sets up a finding with the target session_id, runs the test in gap-closed mode, asserts the finding is removed from the registry |

**Total: 5 new tests across 2 test files.** TDD discipline: each test is written FIRST (red), the implementation is added (green), and any cleanup is a separate refactor step.

