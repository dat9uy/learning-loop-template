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

## 6. Remaining Fallow Triage (172 findings after dead-file deletion)

After removing the 17 dead-concept findings, 172 remain:

| Category | Count | Action |
|----------|-------|--------|
| Test files | 36 | Skip (complexity in tests is acceptable) |
| Meta-surface live tools | ~60 | Complexity suppression or refactor candidates |
| Scout modules | ~17 | Complexity suppression |
| Hooks | ~10 | Complexity suppression |
| Product/web components | 3 | Out of scope (product preflight required) |
| Scripts | ~4 | Complexity suppression |
| Other core | ~42 | Manual review needed |

The 6 suppressions already applied (gate-logic.js, tool-registry.js, record-validation-rules.js) are correct for the live code.
