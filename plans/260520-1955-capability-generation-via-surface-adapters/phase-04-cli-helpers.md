---
phase: 4
title: "CLI Helpers"
status: pending
priority: P2
effort: "1.5h"
dependencies: [3]
---

# Phase 4: CLI Helpers

## Overview

Build two CLI helpers referenced by the Tier 2 Verification Lookup Pattern:
- `list-probes` — list runtime probes in `product/<stack>/capabilities/`
- `search-index` — query index entries by capability, dimension, and status

These wrap mechanical lookup steps so agents (and operators) can trace dependencies without manual file scanning.

## Requirements
- Functional: `pnpm list-probes --stack api` prints all `.py` files under `product/api/capabilities/`
- Functional: `pnpm search-index --capability capability-fastapi-reference-rest --dimension runtime --status active` prints matching index YAML files
- Functional: Both tools accept `--json` for machine-readable output
- Non-functional: < 100 lines each; no external dependencies beyond `node:fs`

## Architecture

### `list-probes`

Scans `product/<stack>/capabilities/` recursively. Filters to files (not dirs). Prints relative paths. With `--json`, prints array of objects with `path`, `stack`, `domain` (inferred from parent directory name).

### `search-index`

Scans `records/index/` for YAML files. Loads each, checks frontmatter fields:
- `--capability` matches if the index filename or `capability:` field references the capability ID (e.g., `capability-fastapi-reference-rest`). Does NOT rely on `source_refs` since v2.0 drops that field.
- `--dimension` matches if `verification.<dimension>` exists
- `--status` matches if `verification.<dimension>.status` equals the value

Prints matching record IDs. With `--json`, prints full record metadata.

## Related Code Files
- Create: `tools/list-probes/list-probes.js`
- Create: `tools/list-probes/list-probes.test.js`
- Create: `tools/search-index/search-index.js`
- Create: `tools/search-index/search-index.test.js`
- Modify: `package.json` — add `list:probes` and `search:index` scripts

## Implementation Steps
1. Write tests first (TDD):
   - `list-probes.test.js`: mock `product/api/capabilities/` tree → verify output
   - `search-index.test.js`: mock `records/index/` with varied dimensions → verify filtering
2. Implement `list-probes.js`
3. Implement `search-index.js`
4. Wire scripts into `package.json`
5. Run tests; fix failures

## Success Criteria
- [ ] `pnpm list-probes --stack api` returns `product/api/capabilities/vnstock-data/capability-01-reference.py`
- [ ] `pnpm search-index --capability capability-fastapi-reference-rest` returns matching index entries
- [ ] Both tools support `--json` flag
- [ ] Tests pass

## Risk Assessment
| Risk | Mitigation |
|------|-----------|
| Index file format varies, breaking search | Only scan frontmatter; ignore body; log skipped files |
| Large index directory slows search | Current scale is < 50 files; linear scan is fine |
| `--capability` match logic is ambiguous | Document matching rules; match by filename-derived ID or explicit `capability:` field in index entries |

## Security Considerations
- Tools only read records; no writes
- `--json` output may contain record content; operators should not pipe to untrusted systems
