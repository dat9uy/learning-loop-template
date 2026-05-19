---
title: "Docs Canonicalization for Machine-Extracted Index"
description: "Update philosophy.md, operator-guide.md, and artifact-reference.md to canonicalize index-first conventions. Mark claims as frozen-legacy and close the machine-extracted-index brainstorm."
status: completed
priority: P2
branch: "main"
tags: [machine-extracted-index, docs, canonicalization]
blockedBy: ["260519-1558-migration-execution-machine-extracted-index"]
blocks: []
created: "2026-05-19T16:26:59.994Z"
createdBy: "ck:plan"
source: skill
---

# Docs Canonicalization for Machine-Extracted Index

## Overview

This plan executes **Plan 4** from the machine-extracted-index brainstorm (`plans/reports/brainstorm-20260518-machine-extracted-index.md`). Plans 1–3 are complete (schema scaffolding, extraction tool, migration execution). Plan 4 is the editorial finalization: rewrite docs to canonicalize index-first conventions, deprecate claim-primary language, and close lingering plan artifacts.

All changes are documentation-only. No runtime behavior changes. No record schema changes.

## Key Insights

1. **docs/record-system-architecture.md was updated in Plan 1 but still contains one stale claim-first reference at line 102.** It correctly describes index entries as canonical and claims as frozen-legacy, but line 102 “Claims-first scanning” must be rewritten to “Index-first scanning” as part of this plan.
2. **docs/philosophy.md still asserts claim-first epistemology** (“Truth status lives in claims”, “Always read claims first”). These philosophical foundations must be rewritten to index-first without losing the adversarial-mindset spirit.
3. **docs/operator-guide.md is the heaviest rewrite.** It has 36 claim references, a dedicated “Claim Verification” section, `pnpm verify:claim` instructions, and an agent-intake flow built around claims-first scanning. Each reference must be evaluated: rewrite to index-first, note as frozen-legacy historical reference, preserve as historical context (Q4/Q6 rule-origin sections), or remove if obsolete.
4. **docs/artifact-reference.md is titled “Claim Verification”** and has no index-entry schema documentation. It needs a deprecation banner and an index-entry schema reference (discovered gap, not explicitly in brainstorm). Note: the doc remains predominantly claim-centric; full index-first parallel sections are a future enhancement.
5. **The `pnpm verify:claim` script and `tools/claim-verification/` tool are frozen-legacy.** They still function for historical claims but must be noted as deprecated in docs. Do not remove them (preserves audit trail for frozen claims).
6. **Experiment schema still requires `claim_refs`.** New experiments cannot pass `pnpm validate:records` without referencing at least one claim. The plan must acknowledge this structural constraint: new experiments for index-first work should cite frozen-legacy claims in `claim_refs` for validation purposes while the actual assertion lives in the index. A future schema migration may make `claim_refs` optional or add `index_entry_refs`.
7. **`pnpm check` does not include `pnpm extract:index`.** The `package.json` check script is `validate:records && test`. Operators must run `pnpm extract:index` separately after editing evidence files. This gap must be documented, not silently assumed to be covered by `pnpm check`.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Philosophy Index-First Rewrite](./phase-01-philosophy-index-first-rewrite.md) | Completed |
| 2 | [Operator-Guide Index-First Rewrite](./phase-02-operator-guide-index-first-rewrite.md) | Completed |
| 3 | [Artifact-Reference Index-Entry Addition](./phase-03-artifact-reference-index-entry-addition.md) | Completed |
| 4 | [Plans Cleanup and Acceptance](./phase-04-plans-cleanup-and-acceptance.md) | Completed |

## Dependencies

- **Blocked by:** `260519-1558-migration-execution-machine-extracted-index` (Plan 3 — prototype seed migration and parity check). Status: **completed** (commit `044a89a`).
- **Blocked by:** `260520-0157-coordination-model-collapse` (Coordination model collapse — remove profile-based gating). Status: **pending**. This plan must complete first so the coordination system allows docs-only work without false-positive blocks.
- No downstream blocks.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Rewriting philosophy.md loses the adversarial-mindset tone | Medium | Medium | Review edits against original intent; red-team the diff |
| Operator-guide rewrite breaks internal cross-references | Low | Medium | Grep all doc cross-links after edits; validate with `pnpm check` |
| Artifact-reference.md schema tables drift from actual schemas | Low | High | Generate tables from schema JSON, do not hand-write field lists |
| Acceptance validation finds stale claim-primary references missed during editing | Medium | Low | Automated grep pass in Phase 4 catches any survivors |

## Red Team Review

### Session — 2026-05-19
**Findings:** 15 (15 accepted, 0 rejected)
**Severity breakdown:** 3 Critical, 5 High, 7 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Non-existent `evidence_refs` field on experiments | Critical | Accept | Phase 2 |
| 2 | Experiment schema still requires `claim_refs` (structural trap) | Critical | Accept | Phase 2, plan.md |
| 3 | Phase 4 acceptance gate grep misses `claims-first` variants | Critical | Accept | Phase 4 |
| 4 | Phase 3 schema table misrepresents required fields and types | High | Accept | Phase 3 |
| 5 | Schema table `source_refs[].file` pattern too restrictive | High | Accept | Phase 3 |
| 6 | Cross-record map falsely claims script validation for `superseded_by`/`supersedes` | High | Accept | Phase 3 |
| 7 | `pnpm check` does not include `extract:index`; no semantic validation | High | Accept | Phases 1–4, plan.md |
| 8 | `record-system-architecture.md:102` still has “Claims-first scanning” | High | Accept | Phase 1, plan.md |
| 9 | `record_ref` fictional field preserved in operator-guide | Medium | Accept | Phase 2 |
| 10 | Dangling cross-reference to deprecated artifact-reference title | Medium | Accept | Phase 2 |
| 11 | Capability schema lacks structured index-entry reference | Medium | Accept | Phase 2, Risk Assessment |
| 12 | Historical context sections (Q4/Q6) risk destruction | Medium | Accept | Phase 2 |
| 13 | Evidence Findings Convention misrepresents extraction requirements | Medium | Accept | Phase 2 |
| 14 | Artifact-reference.md scope insufficient for full canonicalization | Medium | Accept | Phase 3 |
| 15 | `topic_tag` pattern claimed but missing from schema | Medium | Accept | Phase 3 |

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01 through phase-04
- Decision deltas checked: 8
- Reconciled stale references: 15
- Unresolved contradictions: 0

## Whole-Plan Consistency Sweep Notes

- The term “claim-first” must not appear in any doc after this plan completes, except in historical/journal context or the “frozen-legacy” qualifier.
- “Index-first” is the replacement term.
- “Frozen-legacy claims” is the correct phrase for the 10 existing claim YAMLs; “deprecated claims” is imprecise (the schema is deprecated; the files are frozen-legacy).
- The `pnpm extract:index` command must be documented as a separate step after evidence edits; it is NOT included in `pnpm check`.
