---
phase: 2
title: "SessionStart Hook (TDD)"
status: pending
priority: P2
effort: "2h"
dependencies: []
---

# Phase 2: SessionStart Hook (TDD)

## Overview

Adds a project-level Droid `SessionStart` hook (`.factory/hooks.json` + `.factory/hooks/loop-surface-inject.cjs`) that auto-injects a 1-2KB `loop_describe({tier:"summary"})` block into the agent's context at session start. Closes G7 (`loop_describe` adoption = 0 outside tests) by mechanical means. The hook is project-scoped (only fires when the project has `.mcp.json` + `learning-loop-mcp` entry) so plain projects get no noise. Tests-first: 4 new tests covering the three trigger conditions + the MCP-spawn failure path.

## Requirements

- Functional:
  - Droid fires the `SessionStart` hook with matcher `startup` (per `~/.factory/settings.json` schema; project-level config in `.factory/hooks.json`)
  - The hook script (`loop-surface-inject.cjs`) reads Droid's hook input from stdin (JSON with `hook_event_name`, `source`, `cwd`)
  - When `hook_event_name` is not `SessionStart` or `source` is not `startup` (or any other matcher we configure), the script exits 0 silently
  - When the project has no `.mcp.json`, the script exits 0 silently
  - When `.mcp.json` has no `learning-loop-mcp` server entry, the script exits 0 silently
  - When the project matches (`.mcp.json` + `learning-loop-mcp` entry), the script spawns the MCP server per `.mcp.json` config, sends JSON-RPC `initialize` + `tools/call(loop_describe, {tier:"summary"})`, parses the response, and prints a 1-2KB formatted block to stdout (Droid adds stdout to context)
  - The script respects `LL_DISABLE_LOOP_SURFACE_INJECTION=1` (escape hatch for debugging)
- Non-functional:
  - The script is ~50-80 lines (matches the Factory session-automation cookbook examples)
  - Session start latency: <500ms p95 (the script runs async; Droid is not blocked)
  - No new dependencies (uses only `node:fs`, `node:path`, `node:child_process` — same as other `.factory/hooks/*.cjs` scripts)
  - `pnpm test` passes (current 430 + 4 new = 434/434 after Phase 2)
  - The hook fires only on `startup` matcher (per the brainstorm decision; can extend to `resume`/`clear`/`compact` later as a follow-up)

## Architecture

The hook script reads Droid's stdin input (JSON), guards on the trigger conditions, spawns the MCP server, makes one `loop_describe` call, formats the result, and prints to stdout. Droid's `SessionStart` semantics add stdout to context.

**File 1: `.factory/hooks.json` (new, project-level)**

```json
{
  "SessionStart": [
    {
      "matcher": "startup",
      "hooks": [
        {
          "type": "command",
          "command": "\"$FACTORY_PROJECT_DIR\"/.factory/hooks/loop-surface-inject.cjs",
          "timeout": 10
        }
      ]
    }
  ]
}
```

Per the Factory Hooks Reference, `$FACTORY_PROJECT_DIR` is set by Droid when spawning the hook command and contains the absolute project root. Using it instead of `process.cwd()` ensures the hook works regardless of Droid's current directory.

**File 2: `.factory/hooks/loop-surface-inject.cjs` (new)**

```js
#!/usr/bin/env node
/**
 * Droid SessionStart hook: inject loop_describe({tier:"summary"}) into context.
 * Only fires when the project has its own .mcp.json + learning-loop-mcp entry.
 * Reads stdin (Droid hook input JSON), guards, spawns MCP server, prints block.
 */

const { readFileSync, existsSync } = require("node:fs");
const { join } = require("node:path");
const { spawn } = require("node:child_process");

// Read Droid's hook input (JSON via stdin)
let input;
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0); // Malformed input: silent no-op
}

// Guard: only SessionStart with startup matcher
if (input.hook_event_name !== "SessionStart" || input.source !== "startup") {
  process.exit(0);
}

// Guard: escape hatch for debugging (RT Finding 8: log warning so silent disable is visible)
if (process.env.LL_DISABLE_LOOP_SURFACE_INJECTION === "1") {
  console.error("[loop-surface-inject] WARNING: disabled by LL_DISABLE_LOOP_SURFACE_INJECTION=1");
  process.exit(0);
}

// RT Finding 9: log which cwd source was used (for operability)
const cwd =
  input.cwd ? (() => { console.error("[loop-surface-inject] using cwd from input.cwd"); return input.cwd; })() :
  process.env.FACTORY_PROJECT_DIR ? (() => { console.error("[loop-surface-inject] using cwd from FACTORY_PROJECT_DIR"); return process.env.FACTORY_PROJECT_DIR; })() :
  (() => { console.error("[loop-surface-inject] using cwd from process.cwd() (FALLBACK)"); return process.cwd(); })();
const mcpCfgPath = join(cwd, ".mcp.json");

if (!existsSync(mcpCfgPath)) process.exit(0);

let mcpCfg;
try {
  mcpCfg = JSON.parse(readFileSync(mcpCfgPath, "utf8"));
} catch {
  process.exit(0); // Malformed .mcp.json: silent no-op
}

// Guard: only fire when project has its own learning-loop-mcp server
const serverCfg = mcpCfg.mcpServers && mcpCfg.mcpServers["learning-loop-mcp"];
if (!serverCfg) process.exit(0);

// Spawn the MCP server (per .mcp.json) and make one loop_describe call
// (Implementation: JSON-RPC stdio. Spawn `node tools/learning-loop-mcp/server.js`,
//  send initialize, send tools/call, capture response, kill server.)
//
// For the test suite, the spawn is mocked. For real usage, see implementation notes below.

spawnAndCall(serverCfg, cwd)
  .then((summary) => {
    if (summary) {
      console.log(formatBlock(summary));
    }
    process.exit(0);
  })
  .catch(() => {
    // MCP call failed: silent no-op (don't block session start)
    process.exit(0);
  });

function formatBlock(summary) {
  // Expects summary object: { tool_count, record_type_count, rule_count, active_finding_count, ... }
  return [
    "=== loop surface (auto-injected at session start) ===",
    `tools: ${summary.tool_count ?? "?"}`,
    `record types: ${summary.record_type_count ?? "?"}`,
    `active rules: ${summary.rule_count ?? "?"}`,
    `active findings: ${summary.active_finding_count ?? "?"}`,
    "",
    "Use mcp__learning_loop_mcp__* tools directly. Do not invoke ck:use-mcp from",
    "a project that has its own .mcp.json — that skill is for cross-project discovery.",
    "========================================================",
  ].join("\n");
}

async function spawnAndCall(serverCfg, cwd) {
  return new Promise((resolve, reject) => {
    // RT Finding 2: command allowlist (defense against .mcp.json hijack)
    const ALLOWED_COMMANDS = new Set(["node", "bun", "deno"]);
    const command = serverCfg.command || "node";
    if (!ALLOWED_COMMANDS.has(command)) {
      console.error(`[loop-surface-inject] refusing to spawn non-allowlisted command: ${command}`);
      return resolve(null);
    }
    const [cmd, ...args] = serverCfg.args || [];
    const child = spawn(command, [cmd, ...args], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });
    child.unref(); // RT Finding 6: don't keep parent alive if Droid session exits first

    let buffer = "";
    let initialized = false;
    let callSent = false;
    const timeout = setTimeout(() => {
      // RT Finding 7: 10s timeout (was 5s; too tight for cold cache)
      child.kill();
      reject(new Error("timeout"));
    }, 10000);

    // RT Finding 6: try/finally ensures child.kill() on every exit path
    const cleanup = () => {
      clearTimeout(timeout);
      try { child.kill(); } catch { /* already dead */ }
    };

    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString();
      // RT Finding 3: cap buffer at 1MB to prevent DoS via malicious server
      if (buffer.length > 1_000_000) {
        cleanup();
        return resolve(null);
      }
      // Send initialize once we see the server's prompt (or after a small delay)
      if (!initialized) {
        child.stdin.write(JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "loop-surface-inject", version: "1.0.0" } }
        }) + "\n");
        initialized = true;
        setTimeout(() => {
          if (!callSent) {
            child.stdin.write(JSON.stringify({
              jsonrpc: "2.0",
              id: 2,
              method: "tools/call",
              params: { name: "loop_describe", arguments: { tier: "summary" } }
            }) + "\n");
            callSent = true;
          }
        }, 100);
      }
      // Parse response when complete
      const lines = buffer.split("\n").filter((l) => l.trim());
      for (const line of lines) {
        try {
          const msg = JSON.parse(line);
          if (msg.id === 2 && msg.result) {
            cleanup();
            const text = msg.result.content?.[0]?.text;
            if (text) resolve(JSON.parse(text));
            else resolve(null);
            return;
          }
        } catch { /* not a complete message yet */ }
      }
    });

    child.on("error", (err) => { cleanup(); reject(err); });
    child.on("exit", () => { cleanup(); resolve(null); });
  });
}
```

## Related Code Files

- Create:
  - `.factory/hooks.json` (project-level hook config, new Factory convention)
  - `.factory/hooks/loop-surface-inject.cjs` (the hook script, ~80 lines)
  - `.factory/hooks/__tests__/loop-surface-inject.test.js` — 4 new tests
- Modify:
  - `package.json` — extend the `test` script glob to include `.factory/hooks/__tests__/*.test.js` (current glob covers only `tools/**/*.test.js` and `.claude/coordination/__tests__/*.test.cjs`; the new hook tests live in `.factory/hooks/__tests__/`)
- Delete: none
- Delete: none

## Implementation Steps

### TDD Step 1: Write the 4 tests first (RED)

Create `.factory/hooks/__tests__/loop-surface-inject.test.js` with:

1. **Test 1 — no `.mcp.json`:** spawn the script with cwd pointing to a temp dir without `.mcp.json`. Assert: exit 0, stdout empty, no MCP spawn.
2. **Test 2 — `.mcp.json` without `learning-loop-mcp`:** spawn the script with cwd containing `.mcp.json` that registers a different server. Assert: exit 0, stdout empty, no MCP spawn.
3. **Test 3 — matching project, mocked MCP call:** spawn the script with cwd containing `.mcp.json` + `learning-loop-mcp` entry. Mock the `spawnAndCall` function to return a stub `loop_describe` summary `{ tool_count: 36, record_type_count: 8, rule_count: 1, active_finding_count: 12 }`. Assert: exit 0, stdout contains `=== loop surface (auto-injected at session start) ===`, `tools: 36`, `active findings: 12`, and the do-not-invoke-`ck:use-mcp` warning.
4. **Test 4 — guard on `LL_DISABLE_LOOP_SURFACE_INJECTION=1`:** spawn the script with the env var set, matching project. Assert: exit 0, stdout empty (escape hatch honored).

Use `node:test` + `node:assert` (matching the project's existing test patterns). Mock `node:child_process.spawn` via dependency injection (the script exports `spawnAndCall` for testability; tests pass a stub).

### TDD Step 2: Run the tests — all 4 fail (RED confirmed)

```bash
pnpm test .factory/hooks/__tests__/loop-surface-inject.test.js
# Expected: 4 failures (file does not exist; or functions not exported)
```

### TDD Step 3: Implement the script (GREEN)

1. Create `.factory/hooks/loop-surface-inject.cjs` with the content above.
2. Export `spawnAndCall`, `formatBlock`, and `main` for testability:
   ```js
   module.exports = { spawnAndCall, formatBlock, main };
   ```
3. Refactor `main` so tests can call it directly with a stubbed `spawnAndCall`.
4. Run the 4 tests — all pass (GREEN).

### TDD Step 4: Create `.factory/hooks.json` + update `package.json` test glob

1. Create the project-level config file (per Factory Hooks Reference). Commit to the repo.
2. Update `package.json` `"test"` script to include the new test path:
   ```json
   "test": "node --test 'tools/**/*.test.js' '.claude/coordination/__tests__/*.test.cjs' '.factory/hooks/__tests__/*.test.js'"
   ```
   This is a 1-line change; no other scripts affected.

### TDD Step 5: Manual end-to-end verification (REGRESSION GUARD)

1. In a Droid session inside this project, observe the first user message context — it should include the `=== loop surface (auto-injected at session start) ===` block.
2. In a Droid session in a different project (no `.mcp.json` or no `learning-loop-mcp` entry), confirm no block is injected.
3. Set `LL_DISABLE_LOOP_SURFACE_INJECTION=1` and confirm the block is suppressed.

## Success Criteria

- [ ] `.factory/hooks.json` exists at project root with `SessionStart` matcher `startup`
- [ ] `.factory/hooks/loop-surface-inject.cjs` exists, is executable, and respects all 3 guards
- [ ] All 4 new tests pass
- [ ] `pnpm test` passes 434/434 (current 430 + 4 new)
- [ ] Manual verification: agent context includes the loop-surface block in a matching project
- [ ] Manual verification: no block injected in a plain project
- [ ] `LL_DISABLE_LOOP_SURFACE_INJECTION=1` suppresses the block

## Risk Assessment

- **Risk: the script's `spawnAndCall` is too slow.** Mitigation: 5s timeout (configurable via env var). On timeout, the script exits 0 silently — session start is not blocked. Acceptable degradation. If the script becomes a bottleneck, follow the Factory cookbook's "backgrounding" pattern (`guides/hooks/session-automation.md#troubleshooting`).
- **Risk: malformed JSON-RPC response.** Mitigation: the parsing loop catches individual line errors and continues; on no successful parse, resolves `null`, which causes `formatBlock` to be skipped and stdout to be empty. No throw, no session block.
- **Risk: DoS via unbounded server response (RT Finding 3).** Mitigation: buffer capped at 1MB; if exceeded, the child is killed and the script exits 0 silently.
- **Risk: command hijack via compromised `.mcp.json` (RT Finding 2).** Mitigation: command allowlist `{node, bun, deno}`; anything else triggers a stderr warning and exits 0 silently.
- **Risk: zombie MCP server process if cleanup is racy (RT Finding 6).** Mitigation: `try/finally` pattern around `child.kill()`; `child.unref()` so the child doesn't keep the parent alive if Droid session exits first.
- **Risk: 5s timeout too tight for cold-cache `loop_describe` (RT Finding 7).** Mitigation: timeout increased to 10s. Acceptable degradation: if timeout fires, session start is silent (no block).
- **Risk: `LL_DISABLE_LOOP_SURFACE_INJECTION=1` is a silent escape hatch (RT Finding 8).** Mitigation: a stderr warning is emitted when the env var is set, visible in `--debug` mode. The agent's first user message context may not have the warning, but `loop_describe({tier:"warm"}).warnings` will surface it if the operator calls the tool.
- **Risk: `FACTORY_PROJECT_DIR` not set in future Droid versions (RT Finding 9).** Mitigation: the script logs which cwd source was used. If the fallback path is hit, the operator sees it in stderr and can adjust the hook config.
- **Risk: the script tries to spawn even when no `learning-loop-mcp` server is configured.** Mitigation: test 2 + the guard at line `if (!serverCfg) process.exit(0)` prevent this.
- **Risk: the hook fires on `resume`/`clear`/`compact` matchers and re-injects the block on every match.** Mitigation: the matcher is `startup` only. A future phase may extend to `resume`/`clear`/`compact` with deduplication. The current scope is intentionally narrow.
- **Risk: the format block leaks the meta-state path or other PII into the agent's context.** Mitigation: the block contains only counts (numbers) and a one-line warning. No file paths, no entry IDs, no PII. The agent can call `loop_describe({tier:"warm"})` if it needs more.
- **Risk: the new `SessionStart` config conflicts with user-level `~/.factory/settings.json` hook config.** Per Factory Hooks Reference, project-level `hooks.json` is merged with user-level; both can have `SessionStart` entries. Multiple hooks' `additionalContext` are concatenated. No conflict.
