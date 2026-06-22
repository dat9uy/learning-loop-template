#!/usr/bin/env node
/**
 * Claude Code SessionStart hook: inject loop_describe({tier:"warm"}) discoverability hints.
 *
 * Spawns the canonical MCP server, calls mastra_loop_describe({tier:"warm"}),
 * writes hints to .claude/session-context.json, and exits 0.
 */

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

async function main() {
  const projectRoot = path.resolve(__dirname, "..", "..", "..");
  const serverPath = path.join(projectRoot, "tools", "learning-loop-mastra", "server.js");

  const server = spawn("node", [serverPath], {
    cwd: projectRoot,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, MASTRA_STORAGE_DRIVER: "memory" },
  });

  let stdout = "";
  let stderr = "";
  server.stdout.on("data", (d) => { stdout += d; });
  server.stderr.on("data", (d) => { stderr += d; });

  // Wait for server startup (it logs to stderr)
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Simple JSON-RPC over stdio
  const requestId = Math.random().toString(36).slice(2);
  const request = JSON.stringify({
    jsonrpc: "2.0",
    id: requestId,
    method: "tools/call",
    params: {
      name: "mastra_loop_describe",
      arguments: { tier: "warm" },
    },
  });

  server.stdin.write(request + "\n");

  // Wait for response
  const response = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("timeout waiting for MCP response"));
    }, 5000);

    const check = () => {
      const lines = stdout.split("\n").filter((l) => l.trim());
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.id === requestId) {
            clearTimeout(timeout);
            resolve(parsed);
            return;
          }
        } catch {
          // not JSON, ignore
        }
      }
      setTimeout(check, 50);
    };
    check();
  });

  server.kill();

  if (response.error) {
    console.error(`[session-start] MCP error: ${JSON.stringify(response.error)}`);
    process.exit(1);
  }

  const result = response.result;
  let hints = [];
  if (result && result.content && result.content[0] && result.content[0].text) {
    try {
      const parsed = JSON.parse(result.content[0].text);
      hints = parsed.discoverability_hints || [];
    } catch {
      // fallback: empty hints
    }
  }

  const contextPath = path.join(projectRoot, ".claude", "session-context.json");
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
  process.exit(1);
});
