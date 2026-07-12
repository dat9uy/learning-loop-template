---
phase: 3
title: "Phase 3: rule promotion (widened regex) + finding resolutions + loop-design supersede + closeout"
status: pending
effort: ""
---

# Phase 3: rule promotion (widened regex per Finding 11) + finding resolutions + loop-design supersede + closeout

## Overview

Promote `rule-assertinvariant-at-boundary` with a **widened regex** (Red Team Finding 11: original curated enum excluded `tryClaimSessionId` line 1032 and `generateId` line 1069; widened regex + `applies_to.tools` scope gives real universal coverage without test-mock false positives). Resolve the 2 findings the wrapper now closes (`meta-260630T2110Z` closed in Phase 2; `meta-260712T0053Z` closed in Phase 1). Supersede the 2 loop-designs the implementation replaces. File 3 closeout change-logs.

## Findings affected by Phase 3

| Finding | Disposition | Rationale |
|---------|-------------|-----------|
| `meta-260630T2110Z` (file-readers L47-48) | **Resolve** via `meta_state_resolve` | Closed by Phase 2 step 1 |
| `meta-260712T0053Z` (patch-tool entry_kind corruption) | **Resolve** via `meta_state_resolve` | Closed by Phase 1 (wrapper at `writeEntry` + kept `delete cleanPatch.entry_kind` defense) |
| Finding #3 / `meta-260619T2237Z` (report-tool id) | **Resolve** via `meta_state_resolve` | Closed by Phase 2 step 2 |
| Finding #5 / `meta-260629T2300Z` (pre-commit auto-edit) | **NOT closed** — phantom path dropped in Phase 2; finding stays open, tracked by existing rule |
| Finding 1 / `meta-260613T1615Z` (import-chain) | **NOT closed** — covered by existing rule `rule-import-chain-analysis-after-tool-deletion` |

## Implementation Steps

1. **Promote `rule-assertinvariant-at-boundary` with widened regex** (Red Team Finding 11 fix). Use `meta_state_promote_rule` MCP tool with:
   - `rule_id: "rule-assertinvariant-at-boundary"`
   - `enforcement: "agent"` (consult-side, not gate-side — Finding 11 medium: matches test mocks would be too noisy at gate-side)
   - `pattern_type: "regex"`
   - `pattern: "^export\\s+(async\\s+)?function\\s+\\w+\\s*\\("`
   - `applies_to.tools: ["meta-state-write-entry", "meta-state-update-entry", "meta-state-archive-entry", "meta-state-delete-entry", "meta-state-batch", "meta-state-log-change", "meta-state-report", "meta-state-resolve", "meta-state-supersede", "meta-state-promote-rule", "meta-state-dispatch-finding", "meta-state-re-verify"]`
   - `scope_predicate: "none"` (fires globally per Q5 decision)
   - The widened regex matches any `export (async) function <name>(`, scoped by `applies_to.tools` to the 12 core-logic surface tools. Real universal coverage without test-mock false positives (Finding 9).
2. **Resolve finding `meta-260630T2110Z`** with `meta_state_resolve` — closeout text: "Closed by plan 260712-0724 Phase 2: `assertinvariant` wraps `core/file-readers.js#L47-48` lookup (NOT L10 — line citation corrected per red-team Finding 9), returns `{constraint_type:'unmapped-active-entry', affected_system, entry_id}` on unmapped active entries. Inbound gate escalates via the existing constraint-type path; gate:self-verify confirms the regression test passes."
3. **Resolve finding `meta-260712T0053Z`** — closeout text: "Closed by plan 260712-0724 Phase 1: `assertinvariant` is the universal pre-state pre-condition wrapper applied at `writeEntry`, `updateEntry`, `archiveEntry`, `deleteEntry`, and `metaStateBatch` boundaries. The patch-tool corruption class is closed by the wrapper at `writeEntry` + the kept `delete cleanPatch.entry_kind` defense (line 710) + the kept `IMMUTABLE_PATCH_FIELDS` deny-list (lines 339-355). The deny-list is NOT removed (Red Team Finding 2: patch-tool has its own handler-side deny-list that fires BEFORE updateEntry's mutation)."
4. **Resolve finding #3 (`meta-260619T2237Z`)** — closeout text: "Closed by plan 260712-0724 Phase 2: `meta-state-report-tool.js#L28` is wrapped with `assertinvariant` that asserts `result.id === generated_id` after writeEntry. The silent auto-replace surface is closed. (NOT L89-98 — line citation corrected per red-team Finding 9.)"
5. **Supersede `loop-design-assertinvariant-core-logic-invariant-wrapper`** (status:active → inactive) via `meta_state_supersede` with `consolidated_into:<Implementation 3 change-log id>`. Closeout text: "Replaced by the universal `assertinvariant` primitive shipped in plan 260712-0724. The 5-call-site scope is superseded by universal scope per operator direction in plan 260711-0516 § The principle. Note: the wrapper is pre-state-only (not before/after as originally framed — Red Team Finding 1 architectural correction), but the universal-scope simplification cascade is preserved."
6. **Supersede `loop-design-operation-envelope-on-change-log`** (status:active → inactive) via `meta_state_supersede` with `consolidated_into:<Implementation 3 change-log id>`. Closeout text: "Replaced wholesale by the universal `assertinvariant` wrapper. The `operation_envelope` field on change-log is preserved (Implementation 2) and protected by the wrapper at `writeEntry` + the kept `IMMUTABLE_PATCH_FIELDS` deny-list."
7. **File closeout change-logs** — per Implementation 1's pattern, three change-logs: (a) code-fix change-log describing the wrapper + writeEntry wrap + cross-process race fix (snapshot inside lock); (b) test-coverage change-log describing the 4 RED→GREEN + golden regression; (c) rule-promotion change-log describing the agent-side consult with widened regex. Update source report: strike through Implementation 3 in the status banner; mark 3 findings as resolved; flip 2 loop-design rows to "SHIPPED (Implementation 3, PR <#>)".
8. **Final closeout**: full `pnpm test` + `gate:self-verify` + report delta to `meta-state.jsonl` PR body per `rule-pr-body-registry-deltas`.

## Architecture — the widened regex

The original regex `^export (async )?function (writeEntry|updateEntry|archiveEntry|deleteEntry|metaStateBatch|assertinvariant)\(` was hand-curated and missed `tryClaimSessionId` (line 1032) and `generateId` (line 1069). Red Team Finding 11 fix: widen to `^export\s+(async\s+)?function\s+\w+\s*\(` and scope by `applies_to.tools` to the 12 core-logic surface tools. This gives real universal coverage without test-mock false positives (Finding 9).

```regex
^export\s+(async\s+)?function\s+\w+\s*\(
```

The `applies_to.tools` scope means the rule fires only on additions to the 12 core-logic tools. Adding a new core-logic op requires extending the `applies_to.tools` list — but this is a 1-line edit to a known list, not a curated function-name enumeration.

## Related Code Files

- Create: `meta-state.jsonl` entries via `meta_state_log_change` (3 closeout change-logs) + `meta_state_promote_rule` (rule entry with widened regex) + `meta_state_resolve` × 3 findings + `meta_state_supersede` × 2 loop-designs
- Modify: `tools/learning-loop-mastra/core/loop-introspect.js` — add `rule-assertinvariant-at-boundary` to the rules list in `loop_describe({tier:"cold"})` output
- Modify: `plans/reports/assertinvariant-meta-pattern-260711-0516-resolution-plan-report.md` — closeout edits per Implementation 1's `pm-260712-0351-implementation-1-plan-sync-report.md` precedent
- Create: `plans/reports/pm-260712-0724-implementation-3-plan-sync-report.md` — the plan-sync report

## Success Criteria

- [ ] `rule-assertinvariant-at-boundary` promoted with widened regex + `applies_to.tools` scope; entry visible in `meta_state_list({entry_kind:"rule"})`
- [ ] 3 findings resolved via `meta_state_resolve`; verified via `meta_state_list({status:"open"})` excludes the 3 ids (excluding #5 and 1 which stay open with rationale)
- [ ] 2 loop-designs superseded via `meta_state_supersede`; verified via `meta_state_list({entry_kind:"loop-design"})` shows them as `status:"inactive"`
- [ ] 3 closeout change-logs filed via `meta_state_log_change`; verified via `meta_state_list({entry_kind:"change-log"})` shows the 3 ids with `applies_to.tools` referencing the universal wrapper
- [ ] Source report updated; status banner reflects all 3 implementations shipped
- [ ] `pnpm test` passes across all 9 namespaces
- [ ] `gate:self-verify` passes
- [ ] PR body enumerates registry deltas per `rule-pr-body-registry-deltas`
- [ ] Plan dir synced to `status:done` via `ck plan check phase-01`, `ck plan check phase-02`, `ck plan check phase-03`

## Risk Assessment

- **Risk:** Widened regex matches test mocks of core-logic functions. **Mitigation:** `applies_to.tools` scope predicate restricts firing to the 12 listed tools; a test mock of `writeEntry` lives in a test file, not in the production tool surface. Real universal coverage without test-mock false positives (Red Team Finding 9 fix).
- **Risk:** Superseding both loop-designs in one PR may cause stale-pointer errors if any code references them. **Mitigation:** `meta_state_relationships` lint pre-supersede confirms zero outbound references; the loop-designs point at rules/tools, not at each other.
- **Risk:** Source report closeout edits drift from the change-log entries. **Mitigation:** sync report (`pm-260712-0724-implementation-3-plan-sync-report.md`) cross-references every change-log id, mirroring Implementation 1's precedent.