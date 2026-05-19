---
phase: 2
title: "Entry Point and Writer"
status: pending
priority: P1
effort: "2h"
dependencies:
  - "phase-01-spec-and-parser"
---

# Phase 2: Entry Point and Writer

## Overview

Build the CLI entry point (`extract-index.js`) and the index entry builder / file writer modules. Orchestrates parsing from Phase 1 into complete index YAML outputs. Implements the three gotcha handlers and the pre-write aggregation step for ID collision handling and `n_count` computation.

## Context Links

- Brainstorm gotchas: `plans/reports/brainstorm-20260518-machine-extracted-index.md` (Worked Example section, Unresolved Questions)
- Index entry schema: `schemas/index-entry.schema.json`
- Decision record: `records/decisions/decision-260519T1400Z-claim-deprecation.yaml`

## Requirements

- Functional: CLI scans `records/evidence/**/*.md`, extracts findings, aggregates by assertion ID, writes `records/index/*.yaml`; handles gotchas.
- Non-functional: ESM Node.js; exit codes per repo convention (0 success, 1 validation failure, 2 usage error); stdout for stats, stderr for warnings/errors.

## Architecture

```
extract-index.js        -> CLI: glob evidence, orchestrate, aggregate, report
index-entry-builder.js  -> Map parsed finding + meta -> index-entry object
file-writer.js          -> Atomic write YAML to records/index/, compare existing hash
```

### Pre-Write Aggregation Step (new)

Before writing any index files, collect ALL parsed findings across ALL evidence files into an in-memory map keyed by `assertion-<capability>-<dimension>-<topic_tag>`:

- Merge `source_refs` arrays from all evidence files contributing to the same ID.
- Set `n_count = merged_source_refs.length`.
- Compute `extraction.last_updated_at` from the latest evidence file's extraction timestamp.
- Preserve `first_extracted_at` from the earliest source.
- This resolves the collision and n_count gaps identified by red-team review.

### index-entry-builder.js

Input: parsed finding + frontmatter meta + evidence file path + hash + merged `source_refs` + `n_count`.
Output: object matching `index-entry.schema.json`.

Key logic:
- `id`: `assertion-<capability>-<dimension>-<topic_tag>`
- `schema_version`: `"1.0"`
- `type`: `"extracted-assertion"`
- `status`: derived from `validation_status` (passed -> active, pending -> pending_approval, failed -> skip and log)
- `source_refs`: array of `{ file: "local:records/evidence/...", section: "## Findings", bullet_index: N, line_anchor: "..." }`
- `experiment_refs`: look up experiment records that cite this evidence file in `source_refs`; convert experiment `id` values to `record:<id>` strings
- `extraction`: `agent_run`, `first_extracted_at`, `last_updated_at`, `evidence_immutable_hash`
- `n_count`: passed from aggregated map

### file-writer.js

- Read existing index file (if any) with **per-file try/catch**; treat unreadable/malformed as "missing" and log warning.
- Compare `evidence_immutable_hash` in existing extraction block to new hash.
- Write only if changed or new.
- **Atomic write:** write to `records/index/.<id>.yaml.tmp`, then `fs.renameSync` to final path.
- Handle directory creation.
- **Serialize using `yaml.stringify`** from the `yaml` package — forbid manual template-literal YAML construction.

### extract-index.js

CLI args:
- `--capability <name>`: filter evidence by capability frontmatter
- `--dry-run`: parse and report without writing
- `--verbose`: log skipped files and warnings

Flow:
1. Discover evidence markdown files (`records/evidence/**/*.md`). Skip symlinks; validate each path is a regular file.
2. **Per-file error aggregation:** For each file, wrap split/parse/hash in try/catch. On error, collect in `errors[]`, log `stderr: <file>: <error>`, and skip the file. Do NOT abort the entire run.
3. **Build experiment map first:** Pre-build `Map<localPath, experimentId[]>` by iterating all experiment YAMLs once and inverting their `source_refs` arrays. Wrap each experiment parse in try/catch; log warning and continue on failure.
4. **Frontmatter validation (unified step):** Check required fields (`capability`, `dimension`, `scope`, `validation_status`). If any missing, error with inferred suggestions derived from sibling files in same evidence directory. This single step replaces the overlapping Gotcha 1/Gotcha 3 error paths.
5. Parse `## Findings` bullets.
6. **Gotcha 2 (supersession):** After aggregation, compare new entries against existing `records/index/` entries with same `(capability, dimension, scope)`. If same topic-tag exists with different assertion text, or if `## Confirmation / Disproof Notes` names an old assertion-id, hard-stop and report to operator. Without explicit disproof note, never auto-supersede.
7. Aggregate all entries by ID in memory.
8. Build index entries.
9. Write YAMLs (atomic temp + rename).
10. Report stats.
11. If `errors[]` is non-empty, exit 1.

## Related Code Files

- Create: `tools/extract-index/extract-index.js`
- Create: `tools/extract-index/index-entry-builder.js`
- Create: `tools/extract-index/file-writer.js`
- Modify: `package.json` — add `"extract:index": "node tools/extract-index/extract-index.js"` script

## Implementation Steps

1. Write `index-entry-builder.js` — map parsed data to schema-compliant objects.
2. Write `file-writer.js` — compare-and-write logic with hash checking, atomic temp+rename, `yaml.stringify`.
3. Write `extract-index.js` — CLI entry point, evidence globbing, per-file error aggregation, experiment map pre-build, gotcha handling, stats reporting.
4. Add `extract:index` to `package.json` scripts.
5. Run `extract-index --dry-run --verbose` against existing evidence files to verify no crashes. **Note:** zero evidence files currently have `## Findings`, so this validates the skip-noise path only. Supplement with synthetic fixture tests in Phase 3.

## Success Criteria

- [ ] `extract-index --dry-run` completes without error on all current evidence files (skip path validated).
- [ ] `index-entry-builder.js` produces objects that pass schema validation against `schemas/index-entry.schema.json`.
- [ ] `file-writer.js` writes YAML only when content changes; uses atomic temp+rename.
- [ ] Missing frontmatter `dimension` produces clear error with inferred suggestion from sibling files (unified frontmatter validation step).
- [ ] Gotcha 2: supersession hard-stop triggers when disproof note names existing assertion.
- [ ] Frontmatter backfill error includes inferred suggestions.
- [ ] CLI exit codes follow convention (0 success, 1 validation failure, 2 usage error).
- [ ] `validation_status: failed` evidence files are skipped and logged (not thrown).
- [ ] One corrupt existing index file does not block extraction; it is treated as "missing" with a warning.
- [ ] Malformed experiment YAML does not block extraction; warning is emitted.

## Risk Assessment

- Experiment-to-evidence linkage lookup may be slow. Mitigation: pre-build `Map<localPath, experimentId[]>` by inverting experiment `source_refs` arrays once before evidence loop.
- Supersession hard-stop may be noisy. Mitigation: only triggers on explicit disproof note or exact topic-tag collision with divergent assertion text.

## Security Considerations

- Tool writes to `records/index/` only. Never modifies evidence, experiments, or claims.
- `--dry-run` prevents accidental writes during testing.
- Symlinks in `records/evidence/` are skipped to prevent arbitrary file reads.
