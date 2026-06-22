---
phase: 8
title: "SessionStart Hint Injection"
status: pending
effort: "~30min"
---

# Phase 8: SessionStart Hint Injection

## Overview

Add a Claude Code SessionStart hook that calls `mcp__learning-loop-mastra__loop_describe({tier: "warm"})` and surfaces `discoverability_hints` for cold-session agents. Resolves `meta-260622T1439Z-plan-b-s-layer-2-fix-gh-2246-relies-on-the-new-pnpm-test-dis` (status: reported) — Claude Code cold-session agents gain parity with Droid CLI (which already auto-injects via `.factory/hooks/loop-surface-inject.cjs:14-31`).

## Context Links

- `meta-260622T1439Z-plan-b-s-layer-2-fix-gh-2246-relies-on-the-new-pnpm-test-dis` (reported; Phase 8 resolves)
- `plans/reports/debug-260620-1713-caa56a15-stuck-taskupdate-loop-report.md` (Layer 2 fix context; discoverability_hints add `pnpm-test-discipline`)
- `.claude/settings.json:3-12` (existing SessionStart hook entry — runs `recurrence-check-on-start.cjs`; Phase 8 adds a sibling entry)
- `.factory/hooks/loop-surface-inject.cjs` (Droid reference; mirrors the pattern)
- `tools/learning-loop-mcp/core/loop-introspect.js#DISCOVERABILITY_HINTS` (hint source — already implemented)
- `tools/learning-loop-mcp/hooks/` (existing hook patterns — bash-gate, write-gate, inbound-gate)

## Requirements

- **Functional:**
  - Create `tools/learning-loop-mcp/hooks/session-start-inject-discoverability.cjs` that:
    1. Calls `mcp__learning-loop-mastra__loop_describe({tier: "warm"})` (via MCP client stdio spawn).
    2. Reads `discoverability_hints` from the response.
    3. Writes hints to `.claude/session-context.json` (read by agent at start).
    4. Exits 0.
  - Add SessionStart hook entry to `.claude/settings.json` (sibling to existing `recurrence-check-on-start.cjs`).
  - Add smoke test: spawn hook against a mock server, assert `.claude/session-context.json` is created with expected hint content.
- **Non-functional:**
  - Hook latency p95 < 50ms (loop_describe warm tier is local file read + cache check).
  - No new dep (uses `@modelcontextprotocol/sdk` already in `package.json`).
  - **Claude Code parity with Droid** — both surfaces auto-inject hints at SessionStart.

## Architecture

Standalone Node.js script (`.cjs`) invoked by Claude Code's SessionStart hook. Spawns the canonical MCP server briefly, calls `loop_describe`, writes hints to a context file the agent reads at start.

## Related Code Files

- **Modify:** `.claude/settings.json` (add SessionStart hook entry; sibling to line 3-12)
- **Create:** `tools/learning-loop-mcp/hooks/session-start-inject-discoverability.cjs` (hook script)
- **Create:** `tools/learning-loop-mcp/__tests__/session-start-inject-discoverability.test.cjs` (smoke test)
- **Delete:** none

## Implementation Steps

1. Read `.claude/settings.json` lines 1-15 (current SessionStart hook config).
2. Read `.factory/hooks/loop-surface-inject.cjs` (Droid pattern to mirror).
3. Read `tools/learning-loop-mcp/core/loop-introspect.js` (hint source — verify `loop_describe({tier: "warm"})` returns `discoverability_hints` block).
4. Create `session-start-inject-discoverability.cjs`:
   ```js
   const { spawn } = require("node:child_process");
   const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
   const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
   const fs = require("node:fs");
   const path = require("node:path");

   (async () => {
     const server = spawn("node", ["tools/learning-loop-mastra/server.js"], { stdio: ["pipe", "pipe", "pipe"] });
     const transport = new StdioClientTransport({ reader: server.stdout, writer: server.stdin });
     const client = new Client({ name: "session-start", version: "1.0.0" }, { capabilities: {} });
     await client.connect(transport);

     const describe = await client.callTool("mastra_loop_describe", { tier: "warm" });
     const parsed = JSON.parse(describe.content[0].text);
     const hints = parsed.discoverability_hints || [];

     const contextPath = path.resolve(".claude/session-context.json");
     fs.writeFileSync(contextPath, JSON.stringify({ hints, injected_at: new Date().toISOString() }, null, 2));

     await client.close();
     server.kill();
     process.exit(0);
   })().catch((err) => { console.error(err); process.exit(1); });
   ```
5. Modify `.claude/settings.json`:
   - Add sibling SessionStart hook entry:
     ```json
     {
       "type": "command",
       "command": "node tools/learning-loop-mcp/hooks/session-start-inject-discoverability.cjs"
     }
     ```
6. Create smoke test `session-start-inject-discoverability.test.cjs`:
   - Spawn a mock MCP server returning canned `loop_describe` response.
   - Run hook; assert `.claude/session-context.json` contains expected hints.
   - Cleanup.
7. Run full `pnpm test`; expect 1096 pass (1095 baseline + 1 new).

## Success Criteria

- [ ] `tools/learning-loop-mcp/hooks/session-start-inject-discoverability.cjs` exists.
- [ ] `.claude/settings.json` has SessionStart hook entry invoking the script.
- [ ] Smoke test proves hints are written to `.claude/session-context.json`.
- [ ] `pnpm test` exits 0 with 1096 pass / 0 fail / 1 skipped.

## Risk Assessment

- **Hook latency on cold start.** Risk: low. `loop_describe({tier: "warm"})` is local file read + cache check (~5-15ms on dev machine). Mitigation: smoke test asserts p95 < 50ms (Phase 8 step 6).
- **MCP server spawn contention.** Risk: very low. The hook spawns server briefly (~50ms) and exits; no persistent process. Mitigation: hook uses `--one-shot` mode if available (Mastra supports it); falls back to graceful kill.
- **Claude Code vs Droid hook divergence.** Risk: low. Both surfaces invoke their respective hook at SessionStart; same `loop_describe` payload; same `.claude/session-context.json` consumer. Mitigation: smoke test asserts both surfaces produce identical hint payloads.

## Security Considerations

- **Session-context file location.** Risk: low. `.claude/session-context.json` is project-local; not committed to git. Operator review requires the file's content is benign.

## Next Steps

Phase 9: TaskUpdate Idempotency Tool (resolves TaskUpdate-noop finding).