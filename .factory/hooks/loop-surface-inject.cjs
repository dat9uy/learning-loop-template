#!/usr/bin/env node
/**
 * Droid SessionStart hook: inject loop_describe({tier:"summary"}) into context.
 * Only fires when the project has its own .mcp.json + learning-loop-mcp entry.
 * Reads stdin (Droid hook input JSON), guards, spawns MCP server, prints block.
 */

const { readFileSync, existsSync } = require("node:fs");
const { join } = require("node:path");
const { spawn } = require("node:child_process");

async function main(inputArg, envArg, spawnImpl) {
  const input = inputArg || (() => {
    try {
      return JSON.parse(readFileSync(0, "utf8"));
    } catch {
      return null;
    }
  })();

  if (!input) return null;

  // Guard: only SessionStart with startup matcher
  if (input.hook_event_name !== "SessionStart" || input.source !== "startup") {
    return null;
  }

  const env = envArg || process.env;

  // Guard: escape hatch for debugging
  if (env.LL_DISABLE_LOOP_SURFACE_INJECTION === "1") {
    return null;
  }

  const cwd =
    input.cwd ||
    env.FACTORY_PROJECT_DIR ||
    process.cwd();

  const mcpCfgPath = join(cwd, ".mcp.json");
  if (!existsSync(mcpCfgPath)) return null;

  let mcpCfg;
  try {
    mcpCfg = JSON.parse(readFileSync(mcpCfgPath, "utf8"));
  } catch {
    return null;
  }

  const serverCfg = mcpCfg.mcpServers && mcpCfg.mcpServers["learning-loop-mcp"];
  if (!serverCfg) return null;

  const spawnFn = spawnImpl || spawnAndCall;
  try {
    const summary = await spawnFn(serverCfg, cwd);
    if (summary) {
      return formatBlock(summary);
    }
    return null;
  } catch {
    return null;
  }
}

function formatBlock(summary) {
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
    const ALLOWED_COMMANDS = new Set(["node", "bun", "deno"]);
    const command = serverCfg.command || "node";
    if (!ALLOWED_COMMANDS.has(command)) {
      return resolve(null);
    }
    const [cmd, ...args] = serverCfg.args || [];
    const child = spawn(command, [cmd, ...args], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });
    child.unref();

    let buffer = "";
    let initialized = false;
    let callSent = false;
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("timeout"));
    }, 10000);

    const cleanup = () => {
      clearTimeout(timeout);
      try { child.kill(); } catch { /* already dead */ }
    };

    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString();
      if (buffer.length > 1_000_000) {
        cleanup();
        return resolve(null);
      }
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

// Real execution path when Droid spawns this hook
if (require.main === module) {
  main().then((block) => {
    if (block) console.log(block);
    process.exit(0);
  }).catch(() => {
    process.exit(0);
  });
}

module.exports = { main, formatBlock, spawnAndCall };
