---
title: "Extraction Tool: Machine-Extracted Index"
description: "Build tools/extract-index/ to read evidence ## Findings, parse atomic assertions, and write records/index/ YAMLs. Resolves three open design gotchas from the brainstorm."
status: completed
priority: P1
branch: "main"
tags: ["machine-extracted-index", "extraction-tool", "records", "parser"]
blockedBy:
  - project:260519-1400-schema-scaffolding-machine-extracted-index
blocks: []
created: "2026-05-19T10:43:34.460Z"
createdBy: "ck:plan"
source: skill
---

# Extraction Tool: Machine-Extracted Index

## Overview

Plan 2 of 4 from the machine-extracted index redesign. Builds the extraction tool that reads evidence markdown `## Findings` sections, parses atomic assertions tagged with `[topic-tag]`, and writes `records/index/<assertion-id>.yaml` entries. Resolves the three open design gotchas surfaced in the brainstorm worked example: cross-dimension bullets, supersession detection, and frontmatter backfill.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Spec and Parser](./phase-01-spec-and-parser.md) | Completed |
| 2 | [Entry Point and Writer](./phase-02-entry-point-and-writer.md) | Completed |
| 3 | [Tests and Integration](./phase-03-tests-and-integration.md) | Completed |

## Key Decisions

- **Parser strategy:** Line-based scanner for `## Findings` bullets. No markdown AST library (remark/unified is overkill for a single rigidly-structured section). Zero new npm dependencies.
- **Frontmatter parsing:** Existing `yaml` package. Manual `---` split at line boundaries only, skipping `---` inside fenced code blocks. No `gray-matter`.
- **Hash algorithm:** SHA-256 via `node:crypto` on raw file Buffer. Format: `sha256:<hex>`.
- **Status derivation:** `evidence.validation_status` maps directly to `index.status` (passed -> active, pending -> pending_approval, failed -> skip and log to stderr).
- **Module structure:** Six focused modules under `tools/extract-index/`, each under 200 lines.
- **Pre-write aggregation:** In-memory map keyed by assertion ID merges `source_refs` across evidence files and computes `n_count = merged_source_refs.length`.
- **Cross-dimension gotcha:** Human-editorial invariant only. Tool enforces one-file-one-dimension mechanically via frontmatter strictness (error on missing `dimension`), not by semantic bullet analysis.
- **Supersession gotcha:** Combine explicit `## Confirmation / Disproof Notes` block naming old assertion-id + optional topic-tag naming convention. Without explicit disproof note, never auto-supersede.
- **Frontmatter backfill gotcha:** Unified single validation step. Missing `capability`, `dimension`, `scope`, or `validation_status` errors with inferred suggestions from sibling files.
- **YAML serialization:** Mandate `yaml.stringify` from the `yaml` package. Forbid manual template-literal construction.
- **Atomic writes:** Write to `.tmp` then `fs.renameSync` to final path.
- **Error aggregation:** Per-file try/catch for all parse and I/O operations. Collect errors, log to stderr, skip file, exit 1 at end if any errors occurred.

## Acceptance Criteria

- Tool runs clean on evidence files that already have `## Findings` (supplemented with synthetic fixture tests since zero live evidence files currently have this section).
- Produces valid YAMLs per `schemas/index-entry.schema.json` (Plan 1).
- `pnpm check` passes (validation + tests).
- Three gotcha scenarios are covered by tests.
- Round-trip test passes: evidence markdown -> index YAML -> schema validation.
- `n_count` is computed correctly from merged `source_refs.length` when multiple evidence files contribute to the same assertion ID.
- Per-file error aggregation: one malformed evidence file does not block processing of the rest.

## Dependencies

- **Plan 1 (Schema + Scaffolding)** must be completed — provides `schemas/index-entry.schema.json`, `records/index/` directory, shared `schema-loader.js`, and validator plumbing.

## Risks

| Risk | Mitigation |
|------|-----------|
| Parser is brittle on edge-case markdown | Line-based scanner is well-scoped; multi-line continuation logic is tested; unknown nested bullets warn, not crash |
| Tool writes invalid YAML on first run | Output validated against Plan 1 schema before any write; tests use real schema |
| Supersession detection false positives | Never auto-supersede without explicit disproof note; hard-stop to operator |
| Same assertion ID collision destroys source_refs | Pre-write in-memory aggregation step merges source_refs and computes n_count |
| One malformed evidence file blocks entire run | Per-file error aggregation: collect, log, skip, exit 1 at end |
| One corrupt existing index file blocks extraction | Per-file try/catch on existing index reads; treat as "missing" with warning |

## Validation Log

### Session 1 — 2026-05-19
**Trigger:** Post-red-team validation interview
**Questions asked:** 3

#### Questions & Answers

1. **[Scope]** The dry-run acceptance criterion is vacuous — zero live evidence files have `## Findings`. Add a synthetic fixture to the repo before implementation?
   - Options: Yes, add now (Recommended) | No, rely on tmp-dir fixtures | Defer to Plan 3
   - **Answer:** Yes, add a synthetic fixture to the repo now
   - **Rationale:** Ensures the parser is exercised against real content; dry-run criterion becomes meaningful

2. **[Architecture]** Cross-dimension gotcha: human-editorial only vs bullet annotation convention?
   - Options: Human-editorial only (Recommended) | Bullet annotation convention
   - **Answer:** Human-editorial only
   - **Rationale:** Operator typically asks agent how to write correct evidence, so misplacement is caught during authoring. Adding per-bullet dimension syntax creates friction without proportional value.

3. **[Architecture]** `n_count` definition: evidence-file count vs experiment count?
   - Options: Count evidence files (Recommended) | Count experiments | Keep both counts
   - **Answer:** Count evidence files (`source_refs.length`)
   - **Rationale:** N counts independent evidence sources corroborating the same assertion, matching the brainstorm design.

#### Confirmed Decisions
- Synthetic fixture: add to `records/evidence/` before implementation starts
- Cross-dimension enforcement: human-editorial only, tool enforces via frontmatter strictness
- `n_count`: computed as `merged_source_refs.length` in aggregation step

#### Action Items
- [ ] Create synthetic evidence file with `## Findings` under `records/evidence/`
- [ ] Update `docs/record-system-architecture.md` to note synthetic fixture purpose

#### Impact on Phases
- Phase 1: synthetic fixture informs parser test cases
- Phase 3: dry-run acceptance criterion now meaningful; round-trip test uses real fixture

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01, phase-02, phase-03
- Decision deltas checked: 3 (synthetic fixture, human-editorial cross-dimension, n_count definition)
- Reconciled stale references: 0
- Unresolved contradictions: 0

## Red Team Review

### Session — 2026-05-19
**Findings:** 15 (12 accepted, 3 rejected)
**Severity breakdown:** 2 Critical, 6 High, 7 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Same assertion ID collision + n_count logic absent | Critical | Accept | Phase 2 — added pre-write aggregation step |
| 2 | Cross-dimension gotcha is a bait-and-switch | Critical | Accept | Phase 2 — clarified as human-editorial invariant, tool enforces via frontmatter strictness only |
| 3 | Frontmatter splitter naive `---` split breaks on code blocks | High | Accept | Phase 1 — mandate line-based split skipping `---` inside fenced code blocks |
| 4 | Cascading failure when parser throws | High | Accept | Phase 2 — per-file error aggregation spec added |
| 5 | Missing error path for corrupt existing index files | High | Accept | Phase 2 — per-file try/catch on existing index reads |
| 6 | YAML serialization method unspecified | High | Accept | Phase 2 — mandate `yaml.stringify`, forbid manual template-literal construction |
| 7 | `index-entry-builder.js` omits `schema_version` | High | Accept | Phase 2 — added `schema_version: "1.0"` and `type: "extracted-assertion"` to builder spec |
| 8 | `source_refs.file` format missing `local:` prefix | High | Accept | Phase 2 — explicitly specify `file: local:records/evidence/...` |
| 9 | `findings-parser.js` continuation logic ambiguous | Medium | Accept | Phase 1 — defined explicit state machine with `currentField` tracking |
| 10 | `experiment_refs` reverse lookup describes wrong data structure | Medium | Accept | Phase 2 — rewrite to `Map<localPath, experimentId[]>` |
| 11 | Hash format contract unspecified | Medium | Accept | Phase 1 — pin to `sha256:<hex>` format |
| 12 | Non-atomic write in file-writer.js | Medium | Accept | Phase 2 — atomic temp+rename pattern mandated |
| 13 | Dry-run acceptance criterion is vacuous | Medium | Accept | Phase 3 — synthetic fixture test requirement added |
| 14 | Unbounded file hashing enables local DoS | Critical | Reject | Local-only operator tool; evidence files are small markdown controlled by operator |
| 15 | Symlink traversal in evidence discovery | Critical | Reject | Local-only operator tool; operator controls all files under `records/evidence/` |

### Rejected Findings Rationale
Findings 14 and 15 were rejected because the extraction tool is a local-only CLI run by the operator on files the operator controls. The "attacker" scenarios (multi-GB symlinks, arbitrary file reads) require write access to `records/evidence/` which the operator already has. The tool does not run as a service, in CI with untrusted input, or against remote data. Defense-in-depth against these scenarios is unnecessary for this threat model.

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01, phase-02, phase-03
- Decision deltas checked: 12 (aggregation step, hash format, error aggregation, atomic writes, frontmatter code-block handling, parser state machine, builder schema_version/type/local prefix, experiment map structure, gotcha unification, n_count computation, synthetic fixture, YAML serialization mandate)
- Reconciled stale references: 3 (old "cross-dimension error message" success criterion, old per-file writer architecture, old overlapping gotcha 1/3 error paths)
- Unresolved contradictions: 0
