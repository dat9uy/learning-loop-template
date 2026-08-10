---
phase: 3
title: "Architecture-aligned test migration"
status: completed
priority: P1
effort: "3-5d"
dependencies: [2]
---

# Phase 3: Architecture-aligned test migration

## Overview

Move tests by owning module and runtime boundary in small batches. Use path-only `git mv` wherever possible; change imports, fixture paths, sentinels, and repository-root calculations only when the move requires it. Preserve every assertion and test behavior.

## Requirements

- Colocate pure core units beside the implementation using the canonical convention selected in Phase 1.
- Move in-process composition tests to the integration home.
- Keep runtime-interface ownership visible and separate from core.
- Move e2e tests as whole files and update the explicit e2e list.
- Run the affected tier and direct-file checks after every batch.

## Architecture

Likely unit destinations:

- `tools/learning-loop-mastra/core/*.test.js`
- `tools/learning-loop-mastra/core/entry/*.test.js`
- `tools/learning-loop-mastra/core/__tests__/` or the selected canonical alternative

Likely integration destination:

- `tools/learning-loop-mastra/__tests__/integration/`

Runtime interface tests remain under `tools/learning-loop-mastra/__tests__/interface/` or an explicitly named runtime integration subdirectory. They must not be moved into `core/` merely because they assert core-adjacent behavior.

## Related Code Files

- Move: pure `legacy-mcp` tests to owning core modules
- Move: in-process handler/tool/storage/hook tests to integration locations
- Move: interface/runtime tests to interface-aligned locations
- Move: process-boundary tests to e2e-aligned locations
- Modify: `vitest.config.mjs` e2e paths and integration membership
- Modify: moved files' relative imports, fixture paths, sentinels, and `REPO_ROOT` calculations
- Modify: freshness/helper/manifest/prune references affected by moves

## Implementation Steps

1. Migrate pure core groups first: gate logic, shell parsing/classification, boolean/Zod coercion, wire/schema validation, canonical comparison, hashing, status/projection/staleness, relationships, and deterministic scout classifiers.
2. Run the unit project and direct moved-file checks; compare test counts with the frozen inventory.
3. Migrate core/handler integration groups: meta-state lifecycle tools, surfaces, file index/readers, runtime-state facades, change/audit logs, path containment, write-gate composition, skills manifests, and temporary-substrate tests.
4. Migrate Mastra/CLI/interface integration groups that do not spawn processes: direct handler parity, workflow shape/input/unwrap, storage factories, interface contracts, hook manifests, and static runtime-agnostic checks.
5. Run the integration project and direct moved-file checks.
6. Migrate e2e files as whole units: MCP protocol/stdio tests, Mastra Code smoke, CLI binary dispatch, process-boundary workflow/storage parity, session/runtime startup, and current `.claude` gate integration tests.
7. Update deep relative paths, fixture/sentinel locations, helper manifests, and the e2e list only where required.
8. After each batch, run the relevant guard plus the tier; stop and repair any count or classification drift before the next batch.

## Implementation record (completed 2026-08-10)

Executed via three parallel fullstack-developer subagents (one per batch), with the orchestrator doing path engineering and verification centrally.

**Migration map** (`artifacts/legacy-classification.json` + `/tmp/migration_map.json`): 172 sources → 172 unique destinations, no duplicates, no orphans.

| Batch | Count | Destination | Rewrites |
|---|---|---|---|
| e2e | 22 | `__tests__/e2e/` | 7 (helper paths) |
| integration | 109 | `__tests__/integration/` | 1 (`cold-session-discoverability` helpers) |
| unit | 41 | 26→`core/` (colocated), 15→`__tests__/unit/` | 26 (core depth) |

**Verified results after migration:**
- `pnpm test:unit`: 88 files / 1276 tests / exit 0
- `pnpm test:integration`: 164 files / 1507 tests / exit 0
- `pnpm test:e2e`: 73 files / 590 tests / exit 0
- Tier guards (e2e-membership + completeness): pass post-migration
- `legacy-mcp/` directory removed (0 test files remain)
- Disjoint union maintained: no file in two projects

**Fix-ups applied during verification:**
1. **e2e helper path rewrite was WRONG** — the batch manifest encoded `../../with-mcp-server.js` (from `__tests__/e2e/` → `tools/learning-loop-mastra/with-mcp-server.js` ✗). Correct is `../with-mcp-server.js` (→ `__tests__/with-mcp-server.js` ✓). Both `with-mcp-server.js` and `helpers/` are at `__tests__/` level; `__tests__/e2e/` is the same depth as `legacy-mcp/` was. Reverted 7 files.
2. **`probe-helpers.cjs`** (a `.cjs` helper, not a test) was left in `legacy-mcp/`. Moved it to `__tests__/helpers/` and updated 2 consumers (`integration/cold-session-discoverability`, `.claude/coordination/__tests__/claude-code-mcp-loading`).
3. **`fixtures/gate-check-snapshot.json`** moved to `integration/fixtures/`.
4. **`cold-tier-regression.test.js`** hardcoded its own legacy-mcp self-path → updated to integration/.
5. **`.gitignore`** sentinel path updated `legacy-mcp/` → `integration/`.
6. **`test:cold-session`** script + **`cold-session-freshness`** sentinel path updated to integration/.
7. **`manifest-constants.cjs`** comment refs updated.
8. **`package.json` edit caused a grounding hash_mismatch drift** (finding evidence = package.json) — resolved by re-running `seed-file-index.mjs` (the test's preamble) + fixing the stale self-path.

**Key lesson:** `__tests__/{e2e,integration,unit}` are all the SAME depth as `legacy-mcp/` (one level under `__tests__/`). Only `core/` moves change depth (`../../core/` → `./`). A helper-path rewrite rule for e2e/integration is only needed for `../helpers/` and `../with-mcp-server.js`, and both stay as `../` from the tier homes.

## Success Criteria

- [x] All pure unit tests are colocated with their owning implementation under one canonical convention (sibling `core/<name>.test.js`).
- [x] All in-process composition tests are in the integration ownership path (`__tests__/integration/`).
- [x] Runtime-interface tests remain visibly interface/runtime-owned.
- [x] Every e2e file remains in e2e and every moved path is reflected in configuration/guards.
- [x] No assertion is weakened, deleted, or duplicated.
- [x] Each batch passes its tier and direct-file checks.
- [x] The pre/post manifest and test/skip counts remain equal (302 test files post-migration vs 324 discovered = the 22 scout-fixture-path exclusions; tier runs confirm parity).

## Risk Assessment

- **Deep relative imports:** calculate the new depth explicitly and run each moved file directly.
- **Fixture/sentinel drift:** search for old path strings and validate cold-session/freshness helpers after each related move.
- **Mixed tests:** classify by strongest boundary; split only when a test-level boundary is clear.
- **False e2e demotion:** keep actual process/transport tests whole and update marker guard inputs.
