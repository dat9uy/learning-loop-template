# 260519 — Extraction Tool Implementation (Plan 2 of 4)

## Context

Implemented `tools/extract-index/` per Plan 2 of the machine-extracted index redesign. Plan 1 delivered the schema and scaffolding; this session built the parser, CLI, and tests.

## What Was Built

Six modules under `tools/extract-index/` (all under 200 lines):

| Module | Responsibility |
|--------|--------------|
| `frontmatter-splitter.js` | Line-based `---` split, skips fenced-code-block delimiters |
| `findings-parser.js` | State-machine scanner for `## Findings` bullets with continuation lines |
| `hash-computer.js` | SHA-256 on raw Buffer, `sha256:<hex>` format |
| `index-entry-builder.js` | Maps parsed finding + meta to schema-compliant `extracted-assertion` |
| `file-writer.js` | Atomic write (`.tmp` + `renameSync`), hash compare, corrupt-existing fallback |
| `extract-index.js` | CLI: `--capability`, `--dry-run`, `--verbose`, `--root` |

Three test files: `frontmatter-splitter.test.js`, `findings-parser.test.js`, `extract-index.test.js` (38 tests total).

## Key Decisions Verified

1. **Zero new npm dependencies.** Uses existing `yaml` package for parse/stringify; `node:crypto` for SHA-256.
2. **Line-based parser, no AST library.** `remark/unified` is overkill for a single rigidly-structured section.
3. **Pre-write aggregation.** In-memory map keyed by assertion ID merges `source_refs` and computes `n_count` as `merged_source_refs.length`.
4. **Supersession hard-stop.** Never auto-supersede without explicit `## Confirmation / Disproof Notes`. Disproof note must name the old assertion ID.
5. **Frontmatter strictness.** Missing `capability`, `dimension`, `scope`, or `validation_status` errors with inferred suggestions from sibling files.

## Gotcha Coverage

| Gotcha | Test | Status |
|--------|------|--------|
| Cross-dimension | Missing `dimension` -> error with sibling suggestion | PASS |
| Supersession | Same ID, different assertion -> hard-stop; disproof note -> detected | PASS |
| Frontmatter backfill | Missing `capability` -> error with sibling suggestion | PASS |
| Per-file error aggregation | One bad file does not block run | PASS |
| Corrupt existing index | Treated as missing with warning | PASS |
| Malformed experiment | Warning, does not block | PASS |

## Fixes From Code Review

1. `context: null` omitted when evidence has no `Context:` nested bullet (schema requires `string`, not nullable).
2. `validateFrontmatter` now enforces: `capability` matches `[a-z0-9-]+`, `dimension` in enum, `validation_status` in enum. Prevents path traversal and schema-invalid IDs.
3. `main()` guarded with `import.meta.url === process.argv[1]` so importing the module for tests does not trigger CLI execution.

## Metrics

- `pnpm check`: 139 tests pass, 0 failures
- `validate:records`: 55 records validated, 0 errors
- New code: ~240 implementation + ~230 tests

## Unresolved

- Existing evidence files have non-standard `validation_status` values (`passed-with-warning`, `corroborates-observed-behavior`). Tool now correctly reports these as errors. Operator may need to migrate these to the standard enum.
- No synthetic fixture in `records/evidence/` for manual dry-run validation. Tests use tmp-dir fixtures exclusively.
