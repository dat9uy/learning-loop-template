---
phase: 3
title: "Manifest Registration (`manifest.json` + `agent-manifest.json`)"
status: pending
priority: P2
effort: "0.25h"
dependencies: [2]
---

# Phase 3: Manifest Registration (`manifest.json` + `agent-manifest.json`)

## Overview

Register the 2 new tools in 2 manifests:

1. **`tools/learning-loop-mcp/tools/manifest.json`** — the flat array `server.js` reads. Add 2 new lines appended at the end of the meta-state-* group (after `meta-state-derive-status-tool.js`, per SP1's pattern and the SP0 red-team MEDIUM-1 fix).
2. **`tools/learning-loop-mcp/agent-manifest.json`** — the grouped structure the `meta_state` group describes. Add 2 new entries to the `meta_state` group (per I-13, the file is already drifted; SP2 adds the 2 new tools without backfilling SP0/SP1 — that's a separate cleanup plan).

This makes the tools discoverable by the MCP server's `safeImport` loop and by `loop_describe({tier: "warm"})`. No new tests in this phase — the 11 tool tests from Phase 2 already exercise the tools directly.

## Requirements

- Functional:
  - `tools/learning-loop-mcp/tools/manifest.json` includes 2 new lines appended at the end of the meta-state-* group:
    ```json
    { "file": "./tools/meta-state-check-grounding-tool.js", "export": "metaStateCheckGroundingTool" },
    { "file": "./tools/meta-state-refresh-fingerprint-tool.js", "export": "metaStateRefreshFingerprintTool" }
    ```
  - `tools/learning-loop-mcp/agent-manifest.json` includes 2 new entries in the `meta_state` group (appended to the end of the `tools` array):
    ```json
    "meta_state_check_grounding",
    "meta_state_refresh_fingerprint"
    ```
  - The MCP server can load both tools without errors (`safeImport` succeeds)
  - `loop_describe({tier: "warm"})` shows both new tools in the MCP tool list
- Non-functional:
  - 551 existing tests still pass (no behavior change; manifests are JSON metadata)
  - Manifest order is insertion order within the meta-state-* group (append at end)
  - JSON syntax is valid (no trailing comma on the last entry, no missing comma on the new entries)

## Architecture

### `tools/manifest.json` addition

In `tools/learning-loop-mcp/tools/manifest.json`, add 2 new lines at the **end of the meta-state-* group** (after `meta-state-derive-status-tool.js`, which is currently the last entry at line 49):

```json
{ "file": "./tools/meta-state-check-grounding-tool.js", "export": "metaStateCheckGroundingTool" },
{ "file": "./tools/meta-state-refresh-fingerprint-tool.js", "export": "metaStateRefreshFingerprintTool" }
```

The exact position is "end of the meta-state-* group" — this is the safest placement that preserves the SP0/SP1 insertion-order convention.

### `agent-manifest.json` addition

In `tools/learning-loop-mcp/agent-manifest.json`, the `meta_state` group currently has 5 tools (per the verification report). Add 2 new entries to the end of the `tools` array:

```json
"meta_state": {
  "description": "Meta-state registry for loop self-awareness findings",
  "tools": [
    "meta_state_report",
    "meta_state_list",
    "meta_state_ack",
    "meta_state_resolve",
    "meta_state_promote_rule",
    "meta_state_check_grounding",      // NEW (SP2)
    "meta_state_refresh_fingerprint"   // NEW (SP2)
  ],
  "ordering": "any"
}
```

**Note:** The pre-existing drift (SP0's `meta_state_log_change` and SP1's `meta_state_derive_status` are missing from this group) is **not** fixed in this phase. It's a separate cleanup plan. The 2 SP2 tools are added without backfilling.

### Verification

- The existing `loop-describe.test.js` (at `tools/learning-loop-mcp/__tests__/loop-describe.test.js`) checks the tool count and the tool names. Adding 2 new tools increases the count by 2; the new tool names appear in the `tools` array.
- The MCP server (`tools/learning-loop-mcp/server.js`) reads `manifest.json` and calls `safeImport` for each entry. The new entries should load without errors (the files exist, the export names match).
- Optional: extend `loop-describe.test.js` (or add a new `__tests__/sp2-tools-discoverable.test.js`) to assert the 2 new tool names appear in the `loop_describe` warm response. Per I-12.

## TDD Workflow

This phase has no new tests by default. The optional discoverability test is recommended but not required (the existing `loop-describe.test.js` already validates the manifest is valid JSON and the tools load).

1. **Edit `tools/manifest.json`** — add the 2 registration lines at the end of the meta-state-* group.
2. **Edit `agent-manifest.json`** — add the 2 entries to the `meta_state` group.
3. **Run `pnpm test`** — all 551 existing tests still pass.
4. **Run `pnpm validate:plan-loop`** — passes.
5. **Run `pnpm validate:records`** — passes.
6. **Optional:** start the MCP server (`pnpm gate:server`) and call `loop_describe` to confirm the 2 new tools are in the list.

## Related Code Files

- Create: none
- Modify:
  - `tools/learning-loop-mcp/tools/manifest.json` (add 2 lines)
  - `tools/learning-loop-mcp/agent-manifest.json` (add 2 entries to `meta_state.tools` array)
- Delete: none

## Implementation Steps

1. Read the current `tools/manifest.json` (already done in pre-plan verification; the last line is `meta-state-derive-status-tool.js` at line 49).
2. Edit `tools/manifest.json` — append 2 new lines after line 49.
3. Read the current `agent-manifest.json` (already done; the `meta_state.tools` array has 5 entries).
4. Edit `agent-manifest.json` — append 2 new entries to the `meta_state.tools` array.
5. Run `pnpm test` — confirm 551 tests pass.
6. Run `pnpm validate:plan-loop` — confirm passes.
7. Run `pnpm validate:records` — confirm passes.
8. (Optional) Edit `__tests__/loop-describe.test.js` to add 2 assertions for the new tool names (per I-12).

## Success Criteria

- [ ] `manifest.json` includes the 2 new tools at the end of the meta-state-* group
- [ ] `agent-manifest.json` `meta_state.tools` array includes the 2 new tool names
- [ ] JSON syntax is valid in both files
- [ ] 551 existing tests pass
- [ ] `pnpm validate:plan-loop` passes
- [ ] `pnpm validate:records` passes
- [ ] (Optional) `loop_describe({tier: "warm"})` shows the 2 new tools

## Risk Assessment

- **Risk: the manifest JSON is malformed (trailing comma, missing comma).** Mitigation: validate the JSON after the edit (`node -e "JSON.parse(require('fs').readFileSync('...'))"`). The MCP server's `loadManifest` function uses `JSON.parse` in a try/catch; a malformed manifest would log an error and the server would start with 0 tools. The existing test `loop-describe.test.js` would catch this.
- **Risk: the new tools' export names don't match the manifest entries.** Mitigation: the exports are `metaStateCheckGroundingTool` and `metaStateRefreshFingerprintTool` (per Phase 2's tool files); the manifest entries use the same names. The MCP server's `safeImport` checks `imported[mod.export]` and skips if missing; this would log an error but not crash. The cook verifies by reading both files.
- **Risk: the new tools' paths are wrong (e.g., `./tools/check-grounding-tool.js` instead of `./tools/meta-state-check-grounding-tool.js`).** Mitigation: the paths match the existing convention (e.g., `meta-state-log-change-tool.js` is the sibling). The cook verifies the files exist at the paths before editing the manifest.
- **Risk: the `agent-manifest.json` drift is misinterpreted as an SP2 regression.** Mitigation: the verification report explicitly documents the pre-existing drift. The plan's Phase 3 adds the 2 SP2 tools without backfilling SP0/SP1. The drift is a known issue, not a new bug.
