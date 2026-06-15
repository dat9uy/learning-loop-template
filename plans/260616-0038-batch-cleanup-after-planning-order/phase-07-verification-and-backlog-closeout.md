---
phase: 7
title: "Verification and backlog closeout"
status: complete
priority: P3
effort: "20m"
dependencies: [1, 2, 3, 4, 5, 6]
---

<!-- Updated: Validation Session 1 — added loop-design entry to meta-state for AST-based check (per Q3 answer) -->

# Phase 7: Verification and backlog closeout

## Overview

After Phases 1-6 ship, run the full test suite to confirm no regressions, then close the loop:
1. Mark all 15 cleanup items as `cleared (2026-06-16)` in the planning-order report's "Cleanup backlog" section.
2. Annotate Q1 as `RESOLVED (2026-06-16)` in the planning-order report's "Open questions for Step 4" section.
3. File a single `change-log` entry in `meta-state.jsonl` capturing the batch.
4. **File a `loop-design` entry in `meta-state.jsonl`** proposing the AST-based check for the runtime-agnostic regex (per Validation Session 1, Q3 answer — the 9 known syntax bypasses are an accepted limitation of the regex; an AST-based check is a future follow-up).

## Related Code Files

- Modify: `plans/reports/brainstorm-260615-1430-planning-order-bash-gate-and-runtime-agnostic.md` (mark items cleared + Q1 resolved)
- Append: `meta-state.jsonl` (1 new `change-log` entry + 2 new `loop-design` entries — AST-based check + recurrence-tracker MCP-mediation)

## Implementation Steps

### 7.1 — Run the full test suite

```bash
cd /home/datguy/codingProjects/learning-loop-template
pnpm test
```

Expected result: **988-990/989-991 (1 skipped)** — baseline was 986/987; Phase 6 added 1 test; Phases 5 added 1-3 tests (depends on whether 1.4 + 1.5 were strengthened vs. dropped).

If any test fails:
- Identify the failing test and the phase that introduced the change.
- Either fix the implementation (preferred) or fix the test (last resort).
- Re-run `pnpm test` until it passes.

### 7.2 — Annotate the planning-order report

Edit `plans/reports/brainstorm-260615-1430-planning-order-bash-gate-and-runtime-agnostic.md` § Cleanup backlog to mark all 15 items as `cleared (2026-06-16)`:

| # | Item | Status (post-Phase 7) |
|---|------|------------------------|
| 1.1 | Stale fallow-ignore comment | ✅ cleared 2026-06-16 (CLEANUP Phase 3) |
| 1.2 | No file-level JSDoc for `core/surfaces.js` | ✅ cleared 2026-06-16 (CLEANUP Phase 1) |
| 1.3 | Phase-01 Unresolved questions not annotated | ✅ cleared 2026-06-16 (CLEANUP Phase 2) |
| 1.4 | "Mutation test" doesn't exercise parameterization | ✅ cleared 2026-06-16 (CLEANUP Phase 5) |
| 1.5 | "Best-effort" test doesn't exercise failure | ✅ cleared 2026-06-16 (CLEANUP Phase 5) |
| 2.1 | Hand-rolled cross-surface loops in `gate-override.js` | ✅ resolved by Step 4 Phases 1-3 (2026-06-15) |
| 2.2 | `gate-decision-log.js` append semantics | ✅ resolved by Step 4 Phase 1 (2026-06-15) |
| 2.3 | `Math.random()` finding-id suffix | ✅ cleared 2026-06-16 (CLEANUP Phase 4) |
| 2.4 | `recurrence-check-on-start.js` stdin no comment | ✅ cleared 2026-06-16 (CLEANUP Phase 3) |
| 2.5 | `gate-check-recurrence-tool.js` explicit undefined | ✅ cleared 2026-06-16 (CLEANUP Phase 3) |
| 4.1 | CHECKLIST descriptions don't name helpers | ✅ cleared 2026-06-16 (CLEANUP Phase 2) |
| 4.2 | Shim-mirror predicate only checks existence | ✅ cleared 2026-06-16 (CLEANUP Phase 5) |
| 4.3 | `readModifyWriteOnAllSurfaces` cross-surface atomicity | ✅ cleared 2026-06-16 (CLEANUP Phase 1) |
| 4.4 | Stale line-number ranges in Step 4 phase files | ✅ cleared 2026-06-16 (CLEANUP Phase 2) |
| 4.5 | Checklist regex has bypasses + false positives | ✅ cleared 2026-06-16 (CLEANUP Phase 6) |
| F-5 | `err.message` from `appendFileSync` may leak path | ✅ cleared 2026-06-16 (CLEANUP Phase 4) |
| Q1 | `skipped_via_override` field aspirational | ✅ resolved 2026-06-16 (CLEANUP Phase 2) |

Edit the "Cleanup backlog" section header from:
```
## Cleanup backlog
Minor findings surfaced during code review of each shipped step. **Processed in one session after all 4 steps ship**...
```

to:
```
## Cleanup backlog

✅ **All 15 items cleared 2026-06-16** by `plans/260616-0038-batch-cleanup-after-planning-order/`. See the table below for the per-item disposition. The cleanup batch is closed.

<details>
<summary>Per-item disposition</summary>

| # | Item | Disposition |
|---|------|-------------|
...
</details>
```

### 7.3 — Annotate Q1 in the planning-order report

Edit `plans/reports/brainstorm-260615-1430-planning-order-bash-gate-and-runtime-agnostic.md` § Open questions for Step 4 to mark Q1 as fully resolved:

```
2. **`skipped_via_override` field status (RESOLVED 2026-06-16 — CLEANUP Phase 2)**.
   The field was removed from the plan's decision shape in `plans/260615-1530-.../plan.md`
   by the CLEANUP batch. The field was aspirational; the actual requirement (operator
   can override a block) is satisfied by the `.gate-override` marker + `gate_override`
   MCP tool + audit entry in `runtime-state.jsonl`. The `bash-gate.js` decision
   object does NOT include the field (verified by reading the source).
```

### 7.4 — File a change-log entry

Append a single `change-log` entry to `meta-state.jsonl` capturing the batch. The entry is immutable (immutable per the meta-state rule):

```json
{
  "id": "meta-260616T0038Z-tools-learning-loop-mcp-cleanup-batch-after-planning-order",
  "entry_kind": "change-log",
  "change_dimension": "mechanical",
  "change_target": "tools/learning-loop-mcp/{core/surfaces.js,core/runtime-agnostic-checklist.js,core/inbound-state.js,core/recurrence-tracker.js,hooks/recurrence-check-on-start.js,tools/gate-check-recurrence-tool.js,__tests__/{surfaces.test.js,gate-logic-glob-whitelist.test.js,runtime-agnostic.test.js}}",
  "change_diff": {
    "added": [
      "stripCommentsAndStrings helper in core/runtime-agnostic-checklist.js (eliminates false positives on comments/strings before regex testing)",
      "sanitizeErrorMessage helper in core/surfaces.js (strips path from err.message in 3 console.error call sites)",
      "1 new test in __tests__/runtime-agnostic.test.js for stripCommentsAndStrings contract"
    ],
    "removed": [],
    "changed": [
      "core/surfaces.js: file-level JSDoc added (1.2); readModifyWriteOnAllSurfaces JSDoc tightened with WARNING prefix (4.3); 3 console.error call sites use sanitizeErrorMessage (F-5)",
      "core/inbound-state.js: 2 fallow-ignore comments removed (1.1)",
      "core/recurrence-tracker.js: generateFindingId uses crypto.randomBytes(4).toString('hex') instead of Math.random() (2.3)",
      "core/runtime-agnostic-checklist.js: 6 CHECKLIST description fields updated to name the canonical helper (4.1); 2 regex-based items use stripCommentsAndStrings (4.5); file-level JSDoc documents 'best-effort, lowest common denominator'",
      "hooks/recurrence-check-on-start.js: explicit 'Intentionally ignored' comment at readFileSync(0, 'utf8') call site (2.4)",
      "tools/gate-check-recurrence-tool.js: handler builds options object conditionally, no explicit undefined keys (2.5)",
      "tools/learning-loop-mcp/__tests__/surfaces.test.js: 'best-effort' test strengthened with chmodSync(0o000) + try/finally (1.5)",
      "tools/learning-loop-mcp/__tests__/gate-logic-glob-whitelist.test.js: 'mutation test' strengthened with vi.doMock to swap SURFACES (1.4)",
      "tools/learning-loop-mcp/__tests__/runtime-agnostic.test.js: shim-mirror test strengthened to hash-compare content (4.2); 1 new test for stripCommentsAndStrings (4.5)",
      "plans/260615-1500-.../phase-01-surfaces-helper.md: 3 Unresolved questions annotated as Resolved (1.3)",
      "plans/260615-1530-.../plan.md: skipped_via_override field removed from decision shape (Q1)",
      "plans/260615-2126-.../plan.md + 3 phase files: line-number ranges replaced with symbol references (4.4)"
    ]
  },
  "reason": "Ships the CLEANUP batch that closes the planning-order sequence (plans 260615-1500, -1530, -1600, -2126 all shipped 2026-06-15). 15 items: 13 from the planning-order report's Cleanup backlog (1.1-1.5, 2.3-2.5, 4.1-4.5), 1 from the Step 4 code review (F-5 err.message path leak), 1 from Q1 follow-up (skipped_via_override field). No behavior change for items 1.1, 1.2, 1.3, 2.4, 2.5, 4.1, 4.3, 4.4, Q1 (documentation/comment). Behavior change for 1.4, 1.5, 2.3, 4.2, 4.5, F-5 (test strengthening, code hygiene, regex preprocessor). All changes are local; no new public surface; no new MCP tools.",
  "applies_to": {
    "surfaces": ["product", "meta"],
    "rules": ["rule-runtime-agnostic-features"],
    "statuses": ["active"]
  },
  "evidence_code_ref": "tools/learning-loop-mcp/core/runtime-agnostic-checklist.js#stripCommentsAndStrings",
  "evidence_journal": "docs/journals/260616-cleanup-batch.md",
  "affected_system": "meta",
  "status": "active",
  "created_at": "2026-06-16T00:38:00.000Z"
}
```

### 7.5 — Journal entry

Write a short journal entry in `docs/journals/260616-cleanup-batch.md` (per the docs-manager rule "After Feature Implementation"). 1-2 paragraphs: what shipped, what the cleanup batch closed, the test-count delta, the planning-order sequence's final state.

### 7.6 — File a loop-design entry for the AST-based check (per Validation Session 1, Q3)

Append a single `loop-design` entry to `meta-state.jsonl` proposing the AST-based check as a future follow-up. The entry is `active` until the design ships (then `inactive`); the meta-state registry tracks the proposed_design_for / addresses fields:

```json
{
  "id": "loop-design-ast-based-runtime-agnostic-check",
  "entry_kind": "loop-design",
  "title": "AST-based runtime-agnostic check — close the 9 known syntax bypasses",
  "status": "active",
  "proposed_design_for": [
    "tools/learning-loop-mcp/core/runtime-agnostic-checklist.js"
  ],
  "addresses": [
    "meta-260615T2255Z-f-2-runtime-agnostic-checklist-regex-9-bypasses"
  ],
  "description": "Replace the regex-based 6-item checklist in runtime-agnostic-checklist.js with an AST-based check that closes the 9 known syntax bypasses: forEach, map, for-in, while, template literals, array literals, raw templates, path.resolve, spread iter. The current regex is best-effort (per F-2 code review 2026-06-15); an AST check makes the audit exhaustive. Implementation: use `acorn` (or `acorn-walk`) to parse the source AST, then walk the AST nodes to detect cross-surface patterns. Estimated ~50 LoC + 1 dependency. Out of scope for CLEANUP batch plan 260616-0038; tracked here for follow-up.",
  "affected_system": "meta",
  "severity_hint": "low",
  "created_at": "2026-06-16T00:38:00.000Z",
  "created_by": "ck:plan-validation-session-1"
}
```

The `addresses` field references a hypothetical finding-id (the F-2 finding from the Step 4 code review; if a meta-state entry for F-2 doesn't exist, omit the field — the loop-design is self-explanatory). The `proposed_design_for` field names the file the design will modify. When the design ships, the entry's `status` flips to `inactive` and `shipped_in_plan` is set.

### 7.7 — File a loop-design entry for the Q2 follow-up (recurrence-tracker MCP-mediation)

Per the planning-order report's Open questions for Step 4, Q2: "Direct writes are accepted for now; a post-4-step brainstorm will reconsider MCP-mediation for `recurrence-tracker.js#checkAndEmit`." The current code in `core/recurrence-tracker.js:122` does `appendFileSync(join(root, "meta-state.jsonl"), JSON.stringify(finding) + "\n", "utf8")` — a direct file write that bypasses the `meta_state_report` MCP tool (and its schema validation, idempotency check, TTL management, and operator audit trail). Track the MCP-mediation as a deferred design:

```json
{
  "id": "loop-design-recurrence-tracker-mcp-mediation",
  "entry_kind": "loop-design",
  "title": "Recurrence-tracker MCP-mediation — replace direct meta-state.jsonl write with meta_state_report",
  "status": "active",
  "proposed_design_for": [
    "tools/learning-loop-mcp/core/recurrence-tracker.js"
  ],
  "addresses": [],
  "description": "Replace the direct `appendFileSync` write in `recurrence-tracker.js#checkAndEmit` with a call to the `meta_state_report` MCP tool (or its module-level equivalent for in-process calls). The current direct write bypasses: (1) `metaStateEntrySchema.safeParse` validation, (2) the operator-role gate, (3) the audit trail in `runtime-state.jsonl`, (4) the TTL/expiry sweep. The post-4-step brainstorm should consider: (a) is the in-process direct write necessary for performance, or can we go through the MCP layer? (b) if performance is the concern, can the schema check be extracted into a module-level helper that both `recurrence-tracker.js` and the `meta_state_report` tool call? (c) what is the blast radius of a malformed finding entry? Severity hint: low — the current direct write is functionally correct; the MCP-mediation is a defense-in-depth improvement, not a bug fix. Created during CLEANUP batch plan 260616-0038 validation session.",
  "affected_system": "meta",
  "severity_hint": "low",
  "created_at": "2026-06-16T00:38:00.000Z",
  "created_by": "ck:plan-validation-session-1"
}
```

**Note:** the `addresses` field is empty (no existing finding-id to reference). The post-4-step brainstorm that ships this design should file the corresponding finding first (or merge them).

## Success Criteria

- [ ] `pnpm test` shows 988-990/989-991 (1 skipped) — no regressions from Phases 1-6.
- [ ] `plans/reports/brainstorm-260615-1430-...md` § Cleanup backlog: all 15 items marked `cleared 2026-06-16` with CLEANUP phase reference.
- [ ] `plans/reports/brainstorm-260615-1430-...md` § Open questions for Step 4: Q1 marked `RESOLVED 2026-06-16`.
- [ ] `meta-state.jsonl` has 1 new `change-log` entry with the cleanup batch summary.
- [ ] `meta-state.jsonl` has 2 new `loop-design` entries: AST-based check (per Q3) + recurrence-tracker MCP-mediation (per Q2 follow-up).
- [ ] `docs/journals/260616-cleanup-batch.md` exists with the journal entry.

## Risk Assessment

| Risk | Mitigation |
|---|---|
| `pnpm test` reveals a regression in one of the strengthened tests | Each test is small and well-defined; identify the phase that introduced the regression, fix the implementation (preferred) or test (last resort), re-run. |
| The change-log entry's `id` collides with an existing entry | Use the timestamp-based id format `meta-260616T0038Z-...` which is unique to this batch. Verify with `grep "260616T0038" meta-state.jsonl` (expect 0 existing hits). |
| The change-log entry's `change_diff.changed` array is incomplete (missing some changes) | Cross-check against the 7 phase files; the entry should mention all 12 changes (1.1, 1.2, 1.3, 1.4, 1.5, 2.3, 2.4, 2.5, 4.1, 4.2, 4.3, 4.4, 4.5, F-5, Q1 = 15 items; 3 are "added" (helpers + 1 test), 12 are "changed"). |
| The planning-order report's "Cleanup backlog" section becomes too verbose with the per-item table | The `<details>` block is collapsible; the table is hidden by default. The header line ("All 15 items cleared 2026-06-16") is the at-a-glance summary. |
| The journal entry is too long | Per the journal skill: "1-2 paragraphs, sacrifice grammar for concision." Keep it under 200 words. |
