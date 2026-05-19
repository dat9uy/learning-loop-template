---
phase: 3
title: "Tests and Integration"
status: pending
priority: P1
effort: "2h"
dependencies:
  - "phase-02-entry-point-and-writer"
---

# Phase 3: Tests and Integration

## Overview

Write comprehensive tests for all `tools/extract-index/` modules and run the full `pnpm check` pipeline. Includes unit tests for pure functions, integration tests for the CLI, and round-trip validation against Plan 1 schema. Uses synthetic fixtures because zero live evidence files currently contain `## Findings`.

## Context Links

- Test patterns: `tools/validate-records/validate-records.test.js`, `tools/check-budget/check-budget.test.js`
- Schema validation: `schemas/index-entry.schema.json`
- Plan 1 validator plumbing: `tools/validate-records/record-validation-rules.js`

## Requirements

- Functional: Unit tests for `frontmatter-splitter.js`, `findings-parser.js`, `hash-computer.js`, `index-entry-builder.js`; integration tests for `extract-index.js` CLI; round-trip test.
- Non-functional: Use `node:test` and `node:assert/strict`; follow existing fixture patterns; keep test files focused.

## Architecture

```
extract-index.test.js
  -> unit: frontmatter-splitter
  -> unit: findings-parser
  -> unit: hash-computer
  -> unit: index-entry-builder
  -> integration: CLI dry-run
  -> round-trip: evidence -> index -> schema validate
```

### Test File Organization

Split into focused test files to stay under 200 lines each:
- `findings-parser.test.js` — bullet extraction edge cases
- `frontmatter-splitter.test.js` — frontmatter parsing
- `extract-index.test.js` — CLI integration and round-trip

### Fixtures

In-memory fixtures (no disk writes for unit tests). For integration tests, use `mkdtempSync` tmp dirs with synthetic evidence files, then clean up in `after`.

### Key Test Scenarios

1. **Frontmatter parsing**
   - Valid frontmatter -> correct meta and body
   - Missing frontmatter -> `meta: null`
   - Unclosed `---` -> throws
   - Invalid YAML in frontmatter -> throws
   - `---` inside fenced code block in body -> NOT treated as frontmatter terminator

2. **Findings extraction**
   - No `## Findings` -> empty array
   - Single bullet with tag, assertion, context, caveat
   - Multiple bullets
   - Multi-line assertion (continuation lines)
   - Multi-line caveat
   - Bullet without `[tag]` -> throws with line info and regex constraint
   - Invalid tag (underscore/uppercase) -> throws with regex constraint
   - Unknown nested bullet -> warns, not included in output
   - Multiple `## Findings` sections -> uses first
   - Blank line between bullet and nested bullets -> state preserved correctly

3. **Gotcha tests (integration)**
   - Cross-dimension: evidence file missing `dimension` frontmatter -> error with inferred suggestion from sibling files.
   - Supersession: new evidence with `## Confirmation / Disproof Notes` naming old assertion-id -> hard-stop reported in output.
   - Frontmatter backfill: evidence file missing `capability` -> error with suggestion derived from sibling file names or directory.
   - `validation_status: failed` -> skipped and logged, not thrown.
   - Corrupt existing index file -> treated as missing with warning, does not block run.
   - Malformed experiment YAML -> warning emitted, does not block extraction.

4. **Hash computation**
   - Identical Buffer content -> identical `sha256:<hex>`
   - Single byte change -> different hash
   - String input rejected (Buffer-only contract)

5. **Index entry builder**
   - `passed` -> `status: active`
   - `pending` -> `status: pending_approval`
   - `failed` -> skip (no entry)
   - Correct `id` generation
   - Correct `source_refs` structure with `local:` prefix
   - Correct `schema_version` and `type` fields
   - Correct `experiment_refs` as `record:<id>` strings
   - `n_count` equals merged `source_refs.length`

6. **Round-trip**
   - Write synthetic evidence with `## Findings` to tmp dir.
   - Run extraction tool.
   - Load produced YAML with `validate-records` plumbing.
   - Validate against `index-entry.schema.json`.
   - Assert zero validation errors.

7. **CLI integration**
   - `extract-index --dry-run` returns exit 0, prints stats.
   - `extract-index --capability nonexistent` returns exit 0 (no files matched).
   - Invalid evidence returns exit 1.
   - `--dry-run` with synthetic fixture exercises real parsing path (not just skip).

## Related Code Files

- Create: `tools/extract-index/extract-index.test.js`
- Create: `tools/extract-index/findings-parser.test.js`
- Create: `tools/extract-index/frontmatter-splitter.test.js`
- Modify: `package.json` — ensure `"test": "node --test tools/**/*.test.js"` discovers new tests

## Implementation Steps

1. Write `findings-parser.test.js` with all bullet extraction scenarios.
2. Write `frontmatter-splitter.test.js` with parsing edge cases including code-block `---`.
3. Write `extract-index.test.js` with integration and round-trip tests.
4. Run `pnpm test` and fix failures.
5. Run `pnpm check` (validate:records + test) and ensure all pass.
6. Run `extract-index --dry-run --verbose` against live evidence and verify no crashes.

## Success Criteria

- [ ] All unit tests pass.
- [ ] Integration tests pass (CLI spawn, tmp dir fixtures, cleanup).
- [ ] Round-trip test passes: synthetic evidence -> extracted index YAML -> zero schema validation errors.
- [ ] `pnpm check` passes in full.
- [ ] `extract-index --dry-run` runs clean on all current evidence files.
- [ ] No test leaks (all tmp files cleaned up).
- [ ] Synthetic fixture test exercises at least one file with real `## Findings` parsing.

## Risk Assessment

- Test file may grow past 200 lines. Mitigation: split into focused test files per module.
- Live evidence files may cause unexpected parser behavior. Mitigation: run `--dry-run --verbose` early to surface issues.

## Security Considerations

- Tests use tmp dirs, not live `records/index/`. Integration tests should not write to real index directory unless using a dedicated test fixture path.
- `extract-index --dry-run` is safe against live data; tests should default to dry-run or tmp-dir output.
