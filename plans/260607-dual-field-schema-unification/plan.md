---
title: "Dual-Field Schema Unification: evidence_code_ref (top-level) as Single Source of Truth + Gate Hardening"
description: "Closes meta-260607T0008Z-dual-field-schema-risk: queryDrift skips SP2 grounding for 30 entries that carry only the nested evidence.code_ref form. Migrates 30 entries in-place to top-level evidence_code_ref, validates writes against the 4-kind Zod union, and adds a new consult-gate rule (rule-no-orphaned-evidence) to prevent silent divergence."
status: pending
priority: P2
branch: "main"
tags: [meta, meta-state, schema-drift, registry-mutation, gate-hardening, zod-validation, consult-gate, tdd]
blockedBy: []
blocks: []
created: "2026-06-07T02:15:10.371Z"
createdBy: "ck:plan"
source: skill
related:
  - meta-state.jsonl entry meta-260607T0008Z-dual-field-schema-risk-evidence-code-ref-top-level-vs-eviden (the finding this plan resolves)
  - meta-state.jsonl entry meta-260606T2055Z-tools-learning-loop-mcp-core-meta-state-js-metastateentrysch (4-kind union ship; this plan extends the surface)
  - plans/260606-rule-loop-design-first-class/plan.md (sibling, completed; ships the 4-kind union this plan assumes)
  - plans/260606-cold-session-test-rule-promotion/plan.md (sibling, completed; ships the consult-gate pattern Phase 6 reuses)
  - plans/260606-meta-state-scan-readiness-refactor/plan.md (sibling, completed 2026-06-07; ships the backfill-mechanism-check.mjs CAS pattern Phase 3 reuses)
  - tools/learning-loop-mcp/core/query-drift.js (the bug: line 37 `typeof entry.evidence_code_ref === "string"` skips 30 entries)
  - tools/learning-loop-mcp/core/meta-state.js (the writer: `writeEntry` accepts unvalidated entries; `updateEntry` same)
  - tools/learning-loop-mcp/core/check-grounding.js (legacy fallback chain at line 117)
  - tools/learning-loop-mcp/core/derive-status.js (legacy fallback chain at line 66)
  - tools/learning-loop-mcp/tools/meta-state-refresh-fingerprint-tool.js (legacy fallback chain at line 51)
  - tools/learning-loop-mcp/scripts/backfill-mechanism-check.mjs (the CAS-safe idempotent migration pattern)
  - tools/learning-loop-mcp/scripts/migrate-rule-entry-kind.mjs (the clean-break + idempotency + audit-trail pattern)
  - tools/learning-loop-mcp/core/gate-logic.js#checkResolutionEvidence (the consult-gate mechanism Phase 6 uses)
  - tools/learning-loop-mcp/__tests__/gate-resolution-evidence.test.js (the test scaffolding for new consult-gate rules)
  - tools/learning-loop-mcp/__tests__/cold-tier-regression.test.js (the regression guard for cold-tier size; Phase 7 extends it)
  - plans/reports/brainstorm-260607-dual-field-schema-unification.md (the brainstorm this plan implements)
related_findings:
  - meta-260607T0008Z-dual-field-schema-risk-evidence-code-ref-top-level-vs-eviden (schema-drift, escalate, mechanism_check=true)
---

# Dual-Field Schema Unification: evidence_code_ref (top-level) as Single Source of Truth + Gate Hardening

## TL;DR

Two equivalent fields in the meta-state registry (`evidence_code_ref` top-level vs `evidence.code_ref` nested) cause `core/query-drift.js:37` to silently skip 30 entries from SP2 grounding. 4 writers, 2 shapes, no canonical source. 5 of 6 consumers use a legacy fallback chain; the 6th (`queryDrift`) doesn't.

**Fix:** make top-level canonical, migrate 30 entries in-place, validate at `writeEntry` + `updateEntry`, add a new consult-gate rule `rule-no-orphaned-evidence`. 7 TDD phases. ~5KB code deletion, ~3KB new code, 30 registry entries flattened. Zero new schema types, zero new MCP tools (rule-no-new-artifact-types is active).

## Problem Statement

`core/query-drift.js:37` gates SP2 grounding on `typeof entry.evidence_code_ref === "string"`. 30 of ~50 entries (mostly change-logs) carry only the nested form and skip SP2 entirely. 5 other consumers use `entry.evidence_code_ref ?? entry.evidence?.code_ref` (works) but `queryDrift` does not. No schema enforces a single shape: `metaStateFindingEntrySchema` uses top-level, `metaStateChangeEntrySchema` uses nested. Both pass their own `.safeParse`. `writeEntry` accepts unvalidated entries.

## Architecture (target end-state)

```
  meta-state.jsonl
    all entries: evidence_code_ref (top-level) [+ evidence_journal, evidence_test]
    no nested evidence.code_ref
                              ▲
                              │ Zod-validated (metaStateEntrySchema union)
                              │
  writeEntry / updateEntry ──┘
       ▲
       │ top-level only (no nested)
       │
  4 writer tools: meta_state_report, meta_state_log_change,
                  meta_state_propose_design, meta_state_promote_rule
```

5 consumers (query-drift, derive-status, check-grounding, refresh-fingerprint, backfill-mechanism-check) read top-level only. Legacy fallback `entry.evidence_code_ref ?? entry.evidence?.code_ref` removed.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [0 — Surface + decision records](./phase-01-0.md) | Pending |
| 2 | [1 — Diagnostic red: dual-form coverage](./phase-02-1.md) | Pending |
| 3 | [2 — Schema flatten (top-level canonical)](./phase-03-2.md) | Pending |
| 4 | [3 — In-place migration (30 entries)](./phase-04-3.md) | Pending |
| 5 | [4 — Zod validate at writeEntry + updateEntry](./phase-05-4.md) | Pending |
| 6 | [5 — Update 4 writers to top-level only](./phase-06-5.md) | Pending |
| 7 | [6 — New consult-gate rule (rule-no-orphaned-evidence)](./phase-07-6.md) | Pending |

## Dependencies

- **blockedBy:** `[]` (sibling plan `260606-meta-state-scan-readiness-refactor` is **completed** as of 2026-06-07; its `backfill-mechanism-check.mjs` CAS pattern is reused by Phase 4)
- **blocks:** `[]`

## Success Criteria

- `pnpm test` passes (allow 1 pre-existing failure: `gate-integration.test.cjs` per `meta-260607T0715Z-...`)
- `meta-state-evidence-coverage.test.js` (Phase 2): 0 entries with nested `evidence.code_ref`; 0 active findings missing `evidence_code_ref`; 4 of 4 union branches expose `evidence_code_ref` top-level
- `meta-state-schema.test.js` (Phase 3): 4 union members; change-log schema rejects nested `evidence.code_ref`
- `flatten-evidence-fields.test.js` (Phase 4): roundtrip + idempotency + partial-state recovery pass; `meta-state.jsonl` has 0 entries with nested `evidence.code_ref`
- `meta-state.test.js` (Phase 5): 4 new tests pass (writeEntry rejects, accepts 4 union members; updateEntry rejects, accepts)
- `meta-state-report-tool-extension.test.js` + `meta-state-log-change.test.js` (Phase 6): both writers output top-level only
- `gate-resolution-evidence.test.js` (Phase 7): 2 new tests pass; `meta_state_resolve` blocks resolution on ungrounded findings
- `query-drift.test.js` T-25..T-27: drift detection now covers all 30 previously-skipped entries
- `cold-tier-regression.test.js` extended: 2 new buckets with tolerance 0

## Out of Scope

- Renaming `evidence_code_ref` to `mechanism_ref` (user picked "top-level field", not "new neutral name")
- Adding `evidence_code_ref` to `metaStateLoopDesignSchema` (loop-designs don't have evidence)
- Touching `records/**` schemas (`decision.schema.json`, etc.) — they have a separate `source_refs` field
- Removing the `entry_kind: "change-log"` exemption from compaction (orthogonal)

## Risk Map

| Risk | Severity | Mitigation |
|---|---|---|
| Migration script corrupts registry | High | CAS via `_expected_version`; snapshot diff test; defer writes until all validations pass; abort on first failure |
| Phase 3 schema flatten breaks `meta-state-list-compact.test.js` fixtures | Med | Update fixtures; Phase 2 tests as gate |
| Zod union `.partial()` rejects valid patches | Med | Test with realistic patches from `meta_state_resolve`/`sweep`/`promote_rule` |
| Consult-gate rule fires on legitimate findings | Med | Rule exempts findings where `mechanism_check !== true` |
| Cold-tier regression test fixture gets stale | Low | Same `TOLERANCES` pattern from code review C1 fix; new buckets tolerance 0 after Phase 4 |
| The 1 entry with `evidence_journal` only | Low | Migration script's journal/test branches handle it |

## Plan Handoff

- **Plan path:** `plans/260607-dual-field-schema-unification/plan.md`
- **Next steps (recommended):** `/ck:plan validate` (cheap gate; surfaces unspecified assumptions in Phases 3-6) OR `/ck:cook plans/260607-dual-field-schema-unification/plan.md` (skip extra gates, go to implementation)
