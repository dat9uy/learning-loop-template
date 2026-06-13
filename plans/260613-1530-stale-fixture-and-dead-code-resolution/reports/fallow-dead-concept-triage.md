# Fallow × Dead Concept Cross-Reference Triage

**Date:** 2026-06-13
**Fallow findings:** 189 (down from 218)
**Method:** Cross-reference every fallow finding against dead concept families from Phase A (260612-1700), then audit what the three 260613-* cleanup plans actually caught.

## 1. Dead Concept Families (from Phase A)

The 2026-06-12 meta-surface re-debate made these concepts dead:

| Concept | Schemas Deleted | Tools Deleted | Core Modules |
|---------|----------------|---------------|--------------|
| capability | capability | capability_generate, capability_list_probes, capability_list_verified | generate-capabilities/ |
| claim | claim | index_update_claim, update_claim_verification | claim-update.js, claim-verification-rules.js |
| experiment | experiment | workflow_candidate_to_experiment | experiment-writer.js |
| risk | risk | — | risk-writer.js |
| decision | decision | — | decision-writer.js |
| observation-record | observation | record_create_observation, record_update_observation | observation-writer.js |
| resource-budget | resource-budget | — | budget-checker.js |
| index-entry | index-entry | index_extract, index_search | extract-index/, list-verified.js, search-index.js |
| vendor-doc | — | workflow_vendor_doc_assist | vendor-doc-assist/ |
| record-crud | — | — | record-writer.js, record-loader.js |
| schema-to-zod | — | — | schema-to-zod.js |

## 2. Cleanup Plan Coverage Gaps

### Plan 260613-1000 (42 files deleted)

**What it did:** Ran `fallow dead-code --format json`, verified via grep, deleted 42 files.

**Critical miss:** The "What fallow got wrong" table listed 6 core writers as **live**:
> Core writers (`budget-checker.js`, `decision-writer.js`, etc.) | 6 | Imported by MCP server via `tools/manifest.json` dynamic loading

This was wrong. `tools/manifest.json` lists tool *files* for dynamic loading, but the core *writers* are separate modules imported by the (now-deleted) tool files. The writers have **zero live importers** after the 13 tool deletions.

**Files missed (6):**
- `core/observation-writer.js` — 0 importers
- `core/budget-checker.js` — 0 importers
- `core/experiment-writer.js` — 0 importers
- `core/risk-writer.js` — 0 importers
- `core/decision-writer.js` — 0 importers
- `core/schema-to-zod.js` — 0 importers

**Also missed (2):**
- `core/record-writer.js` — 3 importers, but ALL 3 are the dead writers above
- `core/record-loader.js` — 0 importers

### Plan 260613-1421 (dead concepts from live files)

**What it did:** Removed dead functions from `gate-logic.js` and `record-validation-rules.js`. Deleted `extract-index/`, `list-verified.js`, `search-index.js` + 4 test files.

**Scope boundary was explicit:**
> This plan does NOT touch `extract-index/`, `list-verified.js`, or `search-index.js` — those are also dead product-surface code but were not flagged by the finding. They are a separate cleanup.

This was correctly deferred to the next plan.

### Plan 260613-1530 (this plan — stale fixtures + dead code)

**What it did:** Deleted `extract-index/`, `list-verified.js`, `search-index.js` + 4 tests. Cleaned TOOL_MAP and docs. Regenerated scout fixture. Triaged fallow health (suppressed 6 complexity targets).

**Miss:** Only triaged the 6 specific suppress targets from the plan. Did not sweep all 189 findings for dead-concept cross-references. The 8 core writer/loader files were not caught.

## 3. Remaining Dead Files (8 files)

All confirmed: **zero live importers**.

| File | Dead Concept | Functions | Fallow Findings |
|------|-------------|-----------|-----------------|
| `core/observation-writer.js` | observation-record | writeObservation (cc=7), updateObservation (cc=19) | 2 |
| `core/budget-checker.js` | resource-budget | runCheckBudget (cc=17) | 1 |
| `core/experiment-writer.js` | experiment | buildExperimentYaml (cc=15), updateExperiment (cc=7) | 2 |
| `core/risk-writer.js` | risk | buildRiskYaml (cc=11) | 1 |
| `core/decision-writer.js` | decision | buildDecisionYaml (cc=9), updateDecision (cc=7), createDecision (cc=5) | 3 |
| `core/schema-to-zod.js` | schema-to-zod | buildZodSchemaFor (cc=9), composeUpdateSchema (cc=6), zodObjectForProperties (cc=5) | 3 |
| `core/record-writer.js` | record-crud | validateRecordShape (cc=13), findRecordById (cc=9), atomicWriteYaml (cc=5), updateRecordFile (cc=5) | 4 |
| `core/record-loader.js` | record-crud | isSurfaceFirst (cc=8) | 1 |

**Total fallow findings eliminated:** 17 (from 189 → 172)

## 4. Borderline: `inbound-state.js`

`checkObservationStaleness` (cc=19) and `readLastOperatorMessage` (cc=17) are imported by 3 live files (gate-tool, notify-artifact, bash-gate).

**Phase A plan says:** "updated: partitions by `affected_system: 'meta'` and reads from `runtime-state.jsonl` for `affected_system != 'meta'`."

The function was **migrated**, not deleted. It now checks staleness of `runtime-state.jsonl` entries. The 3 importers are valid.

**Verdict:** Live code. Complexity suppression (cc=19) is appropriate, not deletion.

## 5. Systemic Issue

**Root cause of the gap:** Plan 260613-1000 used `fallow dead-code` (static import analysis) but manually overrode its output for "runtime-loaded" modules. The override incorrectly classified core writers as live because they appeared in `tools/manifest.json`. But the manifest loads *tool* files, not *core* modules — the core modules are imported by the tool files, and when the tool files were deleted, the core modules became dead.

**Lesson:** After deleting a set of tool files, re-run the dead-code analysis. Don't trust the pre-deletion analysis for modules that were imported only by the deleted tools.

## 6. Remaining 172 Findings — Bucketed Triage

After dead-file deletion, 172 findings remain across 63 files + 36 test findings.

### Bucket A: Suppress (79 findings, 24 files) — `// fallow-ignore-next-line complexity`

Complexity inherent to the domain. Low change frequency. Not worth refactoring.

**Already suppressed (6):** gate-logic.js (4), tool-registry.js (1), record-validation-rules.js (1)

**Pending suppression (73 findings, 21 files):**

| File | Functions | Why Inherent |
|------|-----------|-------------|
| `core/inbound-state.js` | checkObservationStaleness (cc=19), readLastOperatorMessage (cc=17) | Migrated to runtime-state.jsonl; staleness logic is inherently branchy |
| `core/meta-state.js` | 6 functions (max cc=23) | Registry CRUD with Zod validation, CAS versioning, TTL logic |
| `core/verification-runner.js` | runVerification (cc=19) | Command execution with timeout, allowlist, shell control |
| `core/check-grounding.js` | checkGrounding (cc=18), 2 others | SHA-256 fingerprinting + drift detection |
| `core/derive-status.js` | deriveStatus (cc=10), 2 others | Multi-signal status derivation |
| `core/query-drift.js` | computeRecommendation (cc=13), 2 others | Drift aggregation across registry |
| `core/read-registry-cache.js` | readRegistryWithCache (cc=5) | LRU cache with invalidation |
| `core/file-readers.js` | readObservations (cc=7), readBudgets (cc=7) | YAML directory scanning |
| `hooks/bash-gate.js` | main (cc=18) | Gate orchestration with pattern matching |
| `hooks/write-gate.js` | main (cc=16) | Write-path validation |
| `hooks/inbound-gate.js` | main (cc=7) | Inbound message interception |
| `hooks/lib/protocol-adapter.js` | normalizeToolName (cc=9), extractPrompt (cc=5) | Protocol normalization |
| `lib/source-ref-validator.js` | validateSourceRef (cc=15), 2 others | Multi-format ref validation |
| `scout/bucket-classifier.js` | 4 functions (max cc=12) | File classification heuristics |
| `scout/dangling-detector.js` | 6 functions (max cc=10) | Multi-pass dangling detection |
| `scout/gap-analyzer.js` | analyzeGaps (cc=10) | Gap analysis across inventory |
| `scout/budget-estimator.js` | stripComments (cc=28), 2 others | Comment-aware code analysis |
| `scout/run-scout.js` | runScout (cc=11), 2 others | Filesystem walk + output generation |
| `tools/lib/frontmatter-splitter.js` | splitFrontmatter (cc=8) | YAML frontmatter parsing |
| `tools/lib/resolve-root.js` | resolveRoot (cc=6) | Project root resolution |
| `.factory/hooks/loop-surface-inject.cjs` | 7 functions (max cc=20) | Hook injection with MCP discovery |

### Bucket B: Refactor Candidates (54 findings, 35 files) — Document for future plans

High complexity in live MCP tool handlers. These are the tool entry points — complexity comes from input validation, error handling, and MCP protocol boilerplate. Each handler is a single function that dispatches to core logic.

**Priority refactor targets (cc > 20):**

| File | Function | cc | Refactor Strategy |
|------|----------|-----|-------------------|
| `tools/meta-state-list-tool.js` | handler | 47 | Extract query builder, result formatter, pagination logic |
| `core/loop-introspect.js` | summarize | 37 | Extract switch cases into strategy map |
| `core/loop-introspect.js` | buildInverseIndexes | 21 | Extract index builders |
| `core/loop-introspect.js` | buildRegistrySummary | 21 | Extract summary formatters |
| `tools/meta-state-relationships-tool.js` | handler | 33 | Extract direction router, result assembler |
| `tools/gate-tool.js` | handler | 23 | Extract decision tree into gate-logic.js |
| `tools/meta-state-resolve-tool.js` | handler | 22 | Extract cascade validation |
| `tools/meta-state-promote-rule-tool.js` | handler | 21 | Extract rule validation |
| `tools/meta-state-refresh-tools-tool.js` | handler | 21 | Extract import loop |
| `tools/meta-state-re-verify-tool.js` | handler | 20 | Extract verification orchestration |

**Lower priority (cc 5-19):** 25 more tool handlers + 4 scripts + 3 runtime-state tools. These are manageable complexity; refactor only when touching the file for other reasons.

### Bucket C: Out of Scope (3 findings, 3 files) — Requires product preflight

| File | Function | cc |
|------|----------|-----|
| `product/web/src/components/FundamentalTabs.tsx` | FundamentalTabs | 9 |
| `product/web/src/components/MacroTabs.tsx` | MacroTabs | 8 |
| `product/web/src/components/SearchBox.tsx` | onSubmit | 7 |

**Action:** None until product preflight is available.

### Bucket D: Skip (36 findings) — Test files

Complexity in test files is acceptable. No action needed.

## 7. Concrete Next Steps

| Step | Action | Findings | Effort |
|------|--------|----------|--------|
| 1 | Add `// fallow-ignore-next-line complexity` to all 21 Bucket A files | 73 | 15min |
| 2 | Create `plans/XXXXXX-fallow-refactor-candidates/plan.md` documenting Bucket B targets | 54 | 30min |
| 3 | Verify fallow critical count drops after Step 1 | — | 5min |
| 4 | Bucket B refactors: implement when touching files for other reasons | 54 | ongoing |

**After Step 1:** Expected fallow critical count ≈ 0 (all remaining critical findings are in Bucket B tool handlers or Bucket A suppressed files).

## 8. Systemic Issue (from §5)

**Root cause:** Plan 260613-1000 used `fallow dead-code` but manually overrode its output. After deleting tool files, the core modules they imported became dead — but nobody re-ran the analysis.

**Lesson:** After deleting a set of tool files, re-run dead-code analysis. Don't trust pre-deletion analysis for modules imported only by the deleted tools.
