---
phase: 4
title: "Manifest Registration + slugify Refactor"
status: pending
priority: P2
effort: "0.5h"
dependencies: [2]
---

# Phase 4: Manifest Registration + `slugify` Refactor

## Overview

Two small follow-ups to make the new tool discoverable and to remove code duplication:
1. Register `meta-state-log-change-tool.js` in `tools/learning-loop-mcp/tools/manifest.json` (at the end of the `meta-state-*` group, per red-team MEDIUM-1 fix).
2. Extract the duplicated `slugify()` function from `meta-state-report-tool.js` and `meta-state-log-change-tool.js` into a shared `core/slugify.js` module. Both tool files import from the shared location.

No new tests in this phase — the existing 52 tests from Phases 1-3 are the regression-safety floor. The refactor is mechanical: the `slugify` function is identical in both files; extracting it removes the duplication without changing behavior.

## Requirements

- Functional:
  - `tools/learning-loop-mcp/tools/manifest.json` includes a new line: `{ "file": "./tools/meta-state-log-change-tool.js", "export": "metaStateLogChangeTool" }`
  - `tools/learning-loop-mcp/core/slugify.js` exists and exports the `slugify` function
  - `tools/learning-loop-mcp/tools/meta-state-report-tool.js` imports `slugify` from `#mcp/core/slugify.js` instead of defining it locally
  - `tools/learning-loop-mcp/tools/meta-state-log-change-tool.js` imports `slugify` from `#mcp/core/slugify.js` instead of defining it locally
- Non-functional:
  - 52 existing tests from Phases 1-3 still pass
  - No behavior change (the extracted function is identical to the local copies)
  - Manifest order is alphabetical

## Architecture

### New file: `tools/learning-loop-mcp/core/slugify.js`

```js
/**
 * Slugify a string for use in entry IDs.
 * Lowercase, replace non-alphanumeric with hyphens, truncate to 60 chars, trim hyphens.
 */
export function slugify(description) {
  return description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 60)
    .replace(/^-|-$/g, "");
}
```

### Manifest addition (post-red-team fix)

In `tools/learning-loop-mcp/tools/manifest.json`, add a new line at the **end of the `meta-state-*` group** (after `meta-state-sweep-tool`, before any non-meta-state tools). The convention is to keep `meta-state-*` tools grouped together. The exact position within the group is "end of group" — this is the safest placement that preserves the grouping convention.

```json
{ "file": "./tools/meta-state-log-change-tool.js", "export": "metaStateLogChangeTool" },
```

### Refactor: `meta-state-report-tool.js`

Replace the local `slugify()` function (lines 79-86 or wherever) with an import:

```js
import { slugify } from "#mcp/core/slugify.js";
```

Remove the local function definition.

### Refactor: `meta-state-log-change-tool.js`

Replace the local `slugify()` import path (currently `#mcp/core/slugify.js` per Phase 2) with the same import. If Phase 2 used a local copy, refactor to import.

## TDD Workflow

This phase has no new tests. The 52 existing tests are the verification:

1. **Edit `manifest.json`** — add the registration line.
2. **Create `core/slugify.js`** — extract the function.
3. **Edit `meta-state-report-tool.js`** — replace local function with import.
4. **Edit `meta-state-log-change-tool.js`** — replace local function with import (or import path, depending on Phase 2's choice).
5. **Run `pnpm test`** — all 52 tests still pass.

## Related Code Files

- Create:
  - `tools/learning-loop-mcp/core/slugify.js` (the extracted function)
- Modify:
  - `tools/learning-loop-mcp/tools/manifest.json` (add 1 line)
  - `tools/learning-loop-mcp/tools/meta-state-report-tool.js` (replace local function with import)
  - `tools/learning-loop-mcp/tools/meta-state-log-change-tool.js` (replace local function with import)
- Delete: none

## Implementation Steps

1. Edit `tools/learning-loop-mcp/tools/manifest.json` — add the new line in alphabetical order.
2. Create `tools/learning-loop-mcp/core/slugify.js` with the function.
3. Edit `meta-state-report-tool.js` — remove local `slugify` function definition, add import.
4. Edit `meta-state-log-change-tool.js` — same edit.
5. Run `pnpm test` — confirm 52 tests pass.

## Success Criteria

- [x] `manifest.json` includes the new tool
- [x] `core/slugify.js` exists with the exported function
- [x] `meta-state-report-tool.js` imports `slugify` from the shared location
- [x] `meta-state-log-change-tool.js` imports `slugify` from the shared location
- [x] No local `slugify` definitions remain in tool files
- [x] 52 existing tests pass
- [x] `pnpm test` passes (full suite)

## Risk Assessment

- **Risk: import path is wrong.** Mitigation: the `#mcp/*` alias maps to `./tools/learning-loop-mcp/*` per `package.json` `imports` field; `#mcp/core/slugify.js` resolves to `tools/learning-loop-mcp/core/slugify.js`.
- **Risk: the manifest is in JSON without trailing comma tolerance.** Mitigation: the manifest is currently a valid JSON array; the new line is added in alphabetical order with a trailing comma (matches the existing convention of trailing commas on all-but-last entries).
- **Risk: the extracted function differs subtly from the local copies.** Mitigation: the function is byte-identical to the local copy in `meta-state-report-tool.js`; the test suite verifies behavior preservation.
