---
phase: 3
title: "Manifest Registration"
status: completed
priority: P2
effort: "0.25h"
dependencies: [2]
---

# Phase 3: Manifest Registration

## Overview

Register `meta-state-derive-status-tool.js` in `tools/learning-loop-mcp/tools/manifest.json` at the end of the `meta-state-*` group (per SP0's red-team MEDIUM-1 fix). This makes the tool discoverable by the MCP server's `safeImport` loop and by `loop_describe({tier: "warm"})`.

No new tests in this phase — the 10 tool tests from Phase 2 already exercise the tool directly. The manifest registration is verified by the existing `loop-describe.test.js` (which checks tool count and metadata).

## Requirements

- Functional:
  - `tools/learning-loop-mcp/tools/manifest.json` includes a new line: `{ "file": "./tools/meta-state-derive-status-tool.js", "export": "metaStateDeriveStatusTool" }`
  - The new line is at the end of the `meta-state-*` group (after `meta-state-log-change-tool`, before any non-meta-state tools)
  - The MCP server can load the tool without errors (`safeImport` succeeds)
  - `loop_describe({tier: "warm"})` shows the new tool in the MCP tool list
- Non-functional:
  - 509 existing tests still pass (no behavior change; manifest is JSON metadata)
  - Manifest order is alphabetical within the group
  - JSON syntax is valid (no trailing comma on the last entry, no missing comma on the new entry)

## Architecture

### Manifest addition

In `tools/learning-loop-mcp/tools/manifest.json`, add a new line at the **end of the `meta-state-*` group** (after `meta-state-log-change-tool`, which is currently the last entry in the group):

```json
{ "file": "./tools/meta-state-derive-status-tool.js", "export": "metaStateDeriveStatusTool" }
```

The exact position within the group is "end of group" — this is the safest placement that preserves the grouping convention. The SP0 plan documented this in red-team MEDIUM-1; the SP1 plan follows the same pattern.

### Verification

- The existing `loop-describe.test.js` (at `tools/learning-loop-mcp/__tests__/loop-describe.test.js`) checks the tool count and the tool names. Adding a new tool increases the count by 1; the new tool's name appears in the `tools` array.
- The MCP server (`tools/learning-loop-mcp/server.js`) reads the manifest and calls `safeImport` for each entry. The new entry should load without errors (the file exists, the export name matches).

## TDD Workflow

This phase has no new tests. The verification is:

1. **Edit `manifest.json`** — add the registration line.
2. **Run `pnpm test`** — all 509 existing tests still pass.
3. **Run `pnpm validate:plan-loop`** — passes (no plan changes yet).
4. **Run `pnpm validate:records`** — passes (no record changes).
5. **Optional:** start the MCP server (`pnpm gate:server`) and call `loop_describe` to confirm the new tool is in the list. (Cook session can do this.)

## Related Code Files

- Create: none
- Modify:
  - `tools/learning-loop-mcp/tools/manifest.json` (add 1 line)
- Delete: none

## Implementation Steps

1. Edit `tools/learning-loop-mcp/tools/manifest.json` — add the new line at the end of the `meta-state-*` group (after `meta-state-log-change-tool`).
2. Run `pnpm test` — confirm 509 tests pass.
3. Run `pnpm validate:plan-loop` — confirm passes.
4. Run `pnpm validate:records` — confirm passes.

## Success Criteria

- [ ] `manifest.json` includes the new tool at the end of the `meta-state-*` group
- [ ] JSON syntax is valid
- [ ] 509 existing tests pass
- [ ] `pnpm validate:plan-loop` passes
- [ ] `pnpm validate:records` passes
- [ ] (Optional) `loop_describe({tier: "warm"})` shows the new tool

## Risk Assessment

- **Risk: the manifest JSON is malformed (trailing comma, missing comma).** Mitigation: validate the JSON after the edit (`node -e "JSON.parse(require('fs').readFileSync('...'))"`). The MCP server's `loadManifest` function uses `JSON.parse` in a try/catch; a malformed manifest would log an error and the server would start with 0 tools. The existing test `loop-describe.test.js` would catch this.
- **Risk: the new tool's export name doesn't match the manifest entry.** Mitigation: the export is `metaStateDeriveStatusTool` (per Phase 2's tool file); the manifest entry uses `"export": "metaStateDeriveStatusTool"`. The MCP server's `safeImport` checks `imported[mod.export]` and skips if missing; this would log an error but not crash. The cook can verify by reading both files.
- **Risk: the new tool's path is wrong (e.g., `./tools/derive-status-tool.js` instead of `./tools/meta-state-derive-status-tool.js`).** Mitigation: the path matches the existing convention (e.g., `meta-state-log-change-tool.js` is the sibling). The cook verifies the file exists at the path before editing the manifest.
