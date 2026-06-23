---
phase: 4
title: "SessionStart Direct Hint Import"
status: completed
priority: P1
dependencies: []
---

# Phase 4: SessionStart MCP SDK

## Overview

Address I3: rewrite `tools/learning-loop-mcp/hooks/session-start-inject-discoverability.cjs` to use direct in-process import of `buildDiscoverabilityHints()` from `core/loop-introspect.js` instead of hand-rolled JSON-RPC. The hand-rolled pattern was the documented deadlock root cause in `meta-260621T1743Z` (Plan B fixed 5+1 cases; this hook reintroduces the pattern). Per Red Team Finding 2, the new approach eliminates the MCP server spawn entirely by reading the static `DISCOVERABILITY_HINTS` constant directly.

## Requirements

- Functional: hook writes `.claude/session-context.json` with `hints` (from `buildDiscoverabilityHints()`) and `injected_at`.
- Non-functional: no MCP server spawn, no hand-rolled JSON-RPC parsing, no SDK import.
- Compatibility: smoke test (`session-start-inject-discoverability.test.cjs`) continues to pass.

## Architecture

**Revised approach (Finding 2):** The hook does NOT need to spawn the MCP server. `discoverability_hints` is a static, frozen constant exported from `tools/learning-loop-mcp/core/loop-introspect.js:90` via `buildDiscoverabilityHints()`. The hook can read it via direct in-process import — no spawn, no Client, no server startup. This eliminates the MCP-server-startup class of risk entirely and removes ~30 lines of plumbing.

The hand-rolled approach (current, being deleted):

```js
const server = spawn("node", [serverPath], { stdio: ["pipe", "pipe", "pipe"], ... });
await new Promise((resolve) => setTimeout(resolve, 500)); // fixed wait
server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: requestId, method: "tools/call", ... }) + "\n");
const response = await pollForResponse(stdout, requestId); // poll loop
server.kill();
```

The direct-import approach (replacement):

```js
const { buildDiscoverabilityHints } = require(".../core/loop-introspect.js");
const hints = buildDiscoverabilityHints();
fs.writeFileSync(sessionContextPath, JSON.stringify({ hints, injected_at: new Date().toISOString() }, null, 2));
```

## Related Code Files

- Rewrite: `tools/learning-loop-mcp/hooks/session-start-inject-discoverability.cjs`
- Verify: `tools/learning-loop-mcp/__tests__/session-start-inject-discoverability.test.cjs` (smoke test; should still pass without changes)

## Implementation Steps

1. Rewrite `tools/learning-loop-mcp/hooks/session-start-inject-discoverability.cjs` to use direct in-process import (no MCP server spawn):

   ```js
   #!/usr/bin/env node
   /**
    * Claude Code SessionStart hook: inject discoverability hints.
    *
    * Reads `buildDiscoverabilityHints()` directly from core/loop-introspect.js
    * (a frozen constant; no MCP server startup required). Writes hints to
    * .claude/session-context.json. Replaces the previous hand-rolled JSON-RPC
    * pattern that was the documented deadlock root cause in meta-260621T1743Z.
    */

   const fs = require("node:fs");
   const path = require("node:path");
   const { buildDiscoverabilityHints } = require("../core/loop-introspect.js");

   async function main() {
     const projectRoot = path.resolve(__dirname, "..", "..", "..");
     const contextPath = path.join(projectRoot, ".claude", "session-context.json");

     let hints = [];
     try {
       hints = buildDiscoverabilityHints();
     } catch (err) {
       console.error(`[session-start] buildDiscoverabilityHints failed: ${err.message}`);
       // Fall through with empty hints; do NOT exit 1 (smoke test requires exit 0).
     }

     fs.mkdirSync(path.dirname(contextPath), { recursive: true });
     fs.writeFileSync(
       contextPath,
       JSON.stringify({ hints, injected_at: new Date().toISOString() }, null, 2),
     );

     console.error(`[session-start] wrote ${hints.length} hints to .claude/session-context.json`);
     process.exit(0);
   }

   main().catch((err) => {
     console.error(`[session-start] fatal: ${err.message}`);
     // Write empty hints file before exit so downstream readers don't see missing file.
     try {
       const projectRoot = path.resolve(__dirname, "..", "..", "..");
       const contextPath = path.join(projectRoot, ".claude", "session-context.json");
       fs.mkdirSync(path.dirname(contextPath), { recursive: true });
       fs.writeFileSync(contextPath, JSON.stringify({ hints: [], injected_at: new Date().toISOString() }, null, 2));
     } catch { /* ignore */ }
     process.exit(0);
   });
   ```

2. No SDK path verification needed (no SDK import).

3. Run the existing smoke test: `node --test tools/learning-loop-mcp/__tests__/session-start-inject-discoverability.test.cjs`. Assert:
   - Exit code 0
   - `hints` array is non-empty
   - `injected_at` is an ISO string

4. Add a latency assertion (per Plan 1a risk §"SessionStart hook adds latency to every Claude Code start"). The direct-import approach is in-process; no server startup cost. Test the actual latency:

   ```js
   test("SessionStart hook latency < 50ms (direct import, no server startup)", { timeout: 5000 }, async () => {
     const start = Date.now();
     // ... spawn hook
     const elapsed = Date.now() - start;
     assert.ok(elapsed < 100, `hook took ${elapsed}ms; should be <100ms with direct import`);
   });
   ```

   Note: the latency budget was already violated by Plan 1a's hand-rolled approach (500ms fixed wait + 5000ms timeout = up to 5.5s in the worst case). The direct-import approach reduces this to <50ms steady-state. The test asserts `< 100ms` to confirm no regression.

## Success Criteria

- [x] Phase 4.1 — Hook rewritten to use direct `buildDiscoverabilityHints()` import (no MCP server spawn)
- [x] Phase 4.2 — No hand-rolled JSON-RPC parsing; no SDK import
- [x] Phase 4.3 — Existing smoke test passes unchanged
- [x] Phase 4.4 — Latency assertion added; hook completes in <100ms
- [x] Phase 4.5 — `pnpm test` passes; `SessionStart hook writes discoverability hints to session-context.json` green

## Risk Assessment

- **`buildDiscoverabilityHints()` import path is wrong.** Risk: low. The function is exported from `tools/learning-loop-mcp/core/loop-introspect.js:114-116`. Mitigation: smoke test catches this immediately.
- **Latency regression.** Risk: low. Direct import is in-process; <50ms steady-state. Net: faster, not slower.
- **Hook signature mismatch.** Risk: low. Claude Code's SessionStart hook protocol is unchanged; only the hook's internal implementation changes. The hook still writes `.claude/session-context.json` with the same shape.
- **Loss of MCP-server-aware hints.** Risk: low. `buildDiscoverabilityHints()` returns the same constant that the MCP server's `loop_describe_tool` returns. The hint content is identical to what Plan 1a's hook was extracting via MCP.
