---
title: "Promote cold-session test as gate-enforced resolution-evidence rule"
description: "Promote the cold-session test (cold-session-discoverability.test.cjs#droid exec exposes mcp__learning_loop_mcp__* tools) as a gate-enforced rule that gates the resolution of meta-260606T0443Z-mcp-tools-not-loaded-into-agent-tool-list. The rule fires when meta_state_resolve is called on the target finding; the check is that the cold-session test's last evidence shows the gap is closed."
status: completed
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

## Red Team Review

### Session — 2026-06-06
**Findings:** 17 (9 accepted, 8 rejected)
**Severity breakdown:** 4 Critical, 6 High, 7 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | `checkResolutionEvidence` is a ghost function (does not exist) | Critical | Accept | Phase 1 — acknowledged as net-new addition; added docstring clarification |
| 2 | `meta_state_resolve` has zero rule-consultation logic | Critical | Accept | Phase 1 — acknowledged as net-new addition; deployment order added to prevent race window |
| 3 | `resolveRoot` validation conflict for temp dirs | Critical | Accept | Phase 1 — Test 4 uses `process.env.GATE_ROOT` (skips validation per `resolveRoot` design) |
| 4 | `applyPromotedRules` silently `continue`s for new pattern type | Medium | Accept | Phase 1 — added `console.warn` in the `continue` branch; added `loop-introspect.js` filter |
| 5 | `loadPromotedRules` leaks new pattern type to `loop_describe` | Medium | Accept | Phase 1 — added filter in `listPromotedRules` to exclude `resolution-evidence-required` rules |
| 6 | `deleteOrExpireFinding` / `deleteStaleClientLoadingFinding` do not exist | High | Reject | Phase 2 — Test uses `updateEntry` (soft-delete) directly; no new helper needed |
| 7 | Soft-delete relies on non-existent `checkResolutionEvidence` | High | Reject | Phase 1 — `checkResolutionEvidence` is added by this plan; the filter on `[active, reported]` is explicitly defined in the implementation |
| 8 | Redacted ID (`*************************************************`) cannot be resolved literally | Medium | Accept | Phase 3 — Acknowledged: use `meta_state_list` with `subtype=cold-session-test-rule-design` to find the actual ID |
| 9 | Race window: rule consultation is live before rule entry exists | High | Accept | Phase 1 — Added "Critical deployment order" note; Phase 3 adds rule entry BEFORE deploying consultation |
| 10 | Hardcoded `session_id` string; no single source of truth | Medium | Reject | Low risk — string is stable and namespaced; future refactoring can extract to `core/constants.js` |
| 11 | `checkResolutionEvidence` hardcodes `subtype: "mcp-client-loading"` — not extensible | High | Reject | By design — this rule is specifically for the cold-session test; extensibility is a future concern |
| 12 | Phase 2 "soft-delete" uses `status: "expired"` via `updateEntry`, but `expired` is TTL-driven | High | Reject | `expired` is a terminal status and is explicitly handled by `checkResolutionEvidence`; the 7-day compaction is a safety net, not a bug |
| 13 | Phase 3 deferred design note resolution assumes `meta_state_resolve` MCP tool is available | Critical | Reject | The plan uses direct file I/O (same pattern as the cold-session test and closeout scripts) for the registry updates |
| 14 | Phase 3 rule entry uses `generateId()` with a live timestamp — rerunning creates duplicates | High | Reject | The `promoted_to_rule` object is the unique key; duplicate entries with the same `rule_id` are harmless (first wins) and detectable |
| 15 | Phase 3 verification only tests the blocking path | High | Reject | The satisfied path is tested in Phase 1 (Test 1: `checkResolutionEvidence` returns satisfied when no finding) |
| 16 | `promotedRulesCache` is not test-safe (no clear helper) | High | Reject | The cache is keyed on `(mtime, size)` and is invalidated on any mutation; `mkdtempSync` creates unique roots per test |
| 17 | `resolveRoot` reads from global state; tests need to stub it | High | Reject | The test uses `process.env.GATE_ROOT = tempRoot` before importing the tool, which `resolveRoot` reads at call time |

### Whole-Plan Consistency Sweep

- **Files reread:** plan.md, phase-01-resolution-evidence-mechanism-tdd.md, phase-02-cold-session-test-evidence-refresh-tdd.md, phase-03-rule-entry-and-closeout.md
- **Decision deltas checked:** 5
  1. `checkResolutionEvidence` is net-new (not pre-existing) — acknowledged in Phase 1
  2. `meta_state_resolve` consultation is net-new — acknowledged in Phase 1
  3. `listPromotedRules` filter added to exclude `resolution-evidence-required` rules — added to Phase 1
  4. Deployment order: rule entry BEFORE consultation — added to Phase 1 Overview
  5. Redacted ID resolution requires lookup — acknowledged in Phase 3
- **Reconciled stale references:** 3
  - Phase 1 docstring updated to reflect I/O helpers in `gate-logic.js`
  - Phase 3 `listPromotedRules` filter added to prevent semantic leak
  - Phase 3 `session_id` note added to acknowledge hardcoded string
- **Unresolved contradictions:** 0

## Validation Log

### Session 1 — 2026-06-06
**Trigger:** Post-red-team validation interview
**Questions asked:** 4

#### Questions & Answers

1. **[Scope]** The plan intentionally leaves the MCP client-side loading gap (meta-260606T0443Z) open and unresolved. The rule's first act will be to block its own resolution, proving it works. Do you want to also fix the gap in this plan, or keep it as a separate follow-up plan?
   - Options: Keep the gap open as a separate plan (Recommended) | Also fix the gap in this plan
   - **Answer:** Keep the gap open as a separate plan (Recommended)
   - **Rationale:** Confirms the current scope. The gap is a separate runtime concern (droid CLI MCP client-side loading); the rule mechanism is the focus here.

2. **[Architecture]** The `resolution-evidence-required` pattern type is not visible to `loop_describe` (warm/cold tier). A filter in `listPromotedRules` excludes it. Is this the right discoverability approach, or should it be listed with a new "resolution" tag?
   - Options: Keep it hidden from loop_describe (Recommended) | Add a "resolution" tag to loop_describe
   - **Answer:** Keep it hidden from loop_describe (Recommended)
   - **Rationale:** Resolution rules are a different semantic surface than command-path rules; mixing them into `loop_describe` would be misleading. A separate surface (e.g., `loop_describe` warm tier with a `resolution_rules` section) is a future concern.

3. **[Risk]** The soft-delete mechanism for the cold-session test uses `status: "expired"` (updateEntry) rather than a hard delete. The `checkResolutionEvidence` filter is `status in [active, reported]`. Are you confident `expired` is the right terminal status for this use case?
   - Options: Yes, `expired` is the right terminal status (Recommended) | No, add a new terminal status `dismissed`
   - **Answer:** Yes, `expired` is the right terminal status (Recommended)
   - **Rationale:** Confirms the soft-delete approach. `expired` preserves the audit trail; the 7-day compaction is a safe garbage-collector. The filter is explicitly `status in [active, reported]`, so `expired` findings are correctly excluded.

4. **[Risk]** The `meta_state_resolve` consultation hook is deployed live (no feature flag) once the rule entry exists in the registry. If a bug in the consultation causes legitimate resolutions to be blocked, the only kill switch is changing the rule entry's status to `disabled`. Is this level of control acceptable?
   - Options: Yes, the rule entry is the kill switch (Recommended) | No, add an env var or config flag
   - **Answer:** Yes, the rule entry is the kill switch (Recommended)
   - **Rationale:** Confirms the existing promoted-rule kill-switch pattern. The `status: "disabled"` mechanism is the canonical way to disable a rule in the meta-state registry. Adding a separate flag would fragment the control surface.

#### Confirmed Decisions
- **Scope:** Gap resolution is a separate plan — the rule mechanism is the focus here.
- **Architecture:** `resolution-evidence-required` rules are hidden from `loop_describe` — a separate surface is a future concern.
- **Risk:** Soft-delete uses `status: "expired"` — preserves audit trail, 7-day compaction is safe.
- **Risk:** The rule entry is the kill switch — `status: "disabled"` is the canonical mechanism.

#### Action Items
- None — all decisions confirm the existing plan.

#### Impact on Phases
- No changes required — all answers confirm the existing design.

### Whole-Plan Consistency Sweep (Validation)

- **Files reread:** plan.md, phase-01-resolution-evidence-mechanism-tdd.md, phase-02-cold-session-test-evidence-refresh-tdd.md, phase-03-rule-entry-and-closeout.md
- **Decision deltas checked:** 4 (from validation answers)
- **Reconciled stale references:** 0
- **Unresolved contradictions:** 0

**Validation verdict:** All 4 answers confirm the existing design. No phase changes required. Plan is ready for implementation.

