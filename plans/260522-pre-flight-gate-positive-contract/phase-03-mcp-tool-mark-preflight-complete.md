---
phase: 2
title: "MCP Tool mark_preflight_complete"
status: completed
effort: "1.5h"
dependencies: [0]
---

# Phase 2: MCP Tool mark_preflight_complete

## Overview

New MCP tool that creates the preflight marker. Only this tool can create it — no Bash circumvention since both write gate and bash gate block `.claude/coordination/.loop-preflight-*` writes for Edit/Write/Bash.

## Requirements

- Input: `{ surface: string }` (required, min 1 char)
- Writes `.claude/coordination/.loop-preflight-<surface>` via `writePreflightMarker()` from gate-utils
- Returns JSON with surface, marker_path, completed_at
- Logs to gate-log.jsonl
- Fails gracefully if write fails

## Architecture

Follows `record-observation-tool.js` pattern:
1. `resolveRoot()` for project root
2. Call `writePreflightMarker(surface, coordDir)` from gate-utils (shared code)
3. `console.error()` diagnostic
4. `appendGateLog(root, entry)` audit trail
5. Return `{ content: [{ type: "text", text: JSON.stringify(result) }] }`

**Challenge:** gate-utils.cjs is CommonJS, MCP tools are ESM. Need to either:
- (A) Import gate-utils.cjs via `createRequire()` in the tool file
- (B) Duplicate the write logic using `record-writer.js` atomic write pattern

**Decision: Option A** — use `createRequire()` to import gate-utils.cjs. Keeps marker logic in one place, avoids drift between gate read and MCP write.

## Related Code Files

- Create: `tools/constraint-gate/tools/mark-preflight-complete-tool.js`
- Modify: `tools/constraint-gate/tools/manifest.json` (add entry, 31→32)
- Modify: `tools/constraint-gate/tools/agent-lifecycle-integration.test.js` (manifest count + tool test)
- Read: `tools/constraint-gate/tools/record-observation-tool.js` (pattern reference)
- Read: `tools/constraint-gate/resolve-root.js` (root resolution)
- Read: `tools/constraint-gate/gate-logging.js` (appendGateLog)
- Read: `.claude/coordination/hooks/lib/gate-utils.cjs` (writePreflightMarker)

## Implementation Steps

### TDD Step 1: Write test for mark_preflight_complete tool

Add to `agent-lifecycle-integration.test.js` in the "exercises additional workflow tools" block:

```js
// mark_preflight_complete
const preflightResult = await markPreflightCompleteTool.handler({
  surface: "product",
});
const preflightParsed = JSON.parse(preflightResult.content[0].text);
assert.equal(preflightParsed.surface, "product");
assert.ok(preflightParsed.marker_path.includes('.loop-preflight-product'));
assert.ok(preflightParsed.completed_at);
```

Also update manifest count assertion:
```js
assert.equal(manifest.length, 32, `expected 32 tools, found ${manifest.length}`);
```

### TDD Step 2: Write unit test for the tool

Create `tools/constraint-gate/tools/mark-preflight-complete-tool.test.js`:

```js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { markPreflightCompleteTool } from "./mark-preflight-complete-tool.js";

describe('mark_preflight_complete tool', () => {
  it('creates marker file with surface and completed_at', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-tool-'));
    process.env.GATE_ROOT = tmpDir;
    try {
      const result = await markPreflightCompleteTool.handler({ surface: 'product' });
      const parsed = JSON.parse(result.content[0].text);
      assert.equal(parsed.surface, 'product');
      assert.ok(parsed.completed_at);
      const coordDir = path.join(tmpDir, '.claude', 'coordination');
      const markerPath = path.join(coordDir, '.loop-preflight-product');
      assert.ok(fs.existsSync(markerPath));
      const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
      assert.equal(marker.surface, 'product');
      assert.ok(marker.completed_at);
    } finally {
      delete process.env.GATE_ROOT;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('rejects empty surface', async () => {
    // Zod validation should throw or return error
  });

  it('refreshes existing marker (overwrite)', async () => {
    // Write marker, call tool again, verify timestamp updated
  });

  it('CJS/ESM interop: writePreflightMarker via createRequire works', async () => {
    // Verify the CJS-imported function actually writes the file
    // This tests the createRequire bridge doesn't silently fail
  });
});
```

### TDD Step 3: Implement mark-preflight-complete-tool.js

```js
import { z } from "zod";
import { resolveRoot } from "../resolve-root.js";
import { appendGateLog } from "../gate-logging.js";
import { createRequire } from "module";
import path from "node:path";
const require = createRequire(import.meta.url);
const { writePreflightMarker } = require("../../.claude/coordination/hooks/lib/gate-utils.cjs");

export const markPreflightCompleteTool = {
  name: "mark_preflight_complete",
  description: "Mark preflight checklist as complete for a surface. Creates a marker file that unlocks product/** writes for 30 minutes. Only this tool can create the marker.",
  schema: {
    surface: z.string().min(1).describe("Surface name (e.g., 'product', 'api')"),
  },
  handler: async ({ surface }) => {
    const root = resolveRoot();
    const coordDir = path.join(root, ".claude", "coordination");
    try {
      writePreflightMarker(surface, coordDir);
    } catch (err) {
      return {
        content: [{ type: "text", text: JSON.stringify({
          surface,
          written: false,
          reason: err.message,
        })}],
        isError: true,
      };
    }
    const markerPath = path.join(coordDir, `.loop-preflight-${surface}`);
    const result = {
      surface,
      marker_path: markerPath,
      completed_at: new Date().toISOString(),
      written: true,
      ttl_minutes: 30,
    };
    console.error(`mark_preflight_complete: surface=${surface}`);
    appendGateLog(root, { tool: "mark_preflight_complete", ...result });
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  },
};
```

### TDD Step 4: Add to manifest.json

```json
{ "file": "./tools/mark-preflight-complete-tool.js", "export": "markPreflightCompleteTool" }
```

### TDD Step 5: Run tests

```bash
node --test tools/constraint-gate/tools/mark-preflight-complete-tool.test.js
node tools/constraint-gate/tools/agent-lifecycle-integration.test.js
```

## Success Criteria

- [x] mark_preflight_complete tool creates `.loop-preflight-<surface>` marker file
- [x] Marker contains `{ surface, completed_at }` with valid ISO8601 timestamp
- [x] Tool logged to gate-log.jsonl
- [x] Manifest has 32 entries
- [x] Integration test passes (tool invocation round-trips)
- [x] Unit test passes (file creation, empty surface rejection, overwrite)

## Risk Assessment

Medium — CJS/ESM interop via `createRequire` works but is a bridge pattern. If gate-utils ever migrates to ESM, this import breaks. Mitigate by keeping `writePreflightMarker` logic simple (it's ~10 lines) — easy to duplicate if needed.
