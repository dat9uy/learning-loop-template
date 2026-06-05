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
    // spawnAndCall returned null (e.g., child exited without responding).
    // This is also a failure — report it.
    await reportMcpConnectionFailure(input, env, cwd, "probe_returned_null");
    return null;
  } catch (err) {
    await reportMcpConnectionFailure(input, env, cwd, err && err.message ? err.message : "probe_threw");
    return null;
  }
}

/**
 * Log a meta_state_report finding on MCP probe failure. Idempotent per session_id.
 * Phase 4 of plan 260605: closes the MCP-connection discoverability gap.
 */
async function reportMcpConnectionFailure(input, env, cwd, reason) {
  // Escape hatch: operators can disable failure reporting for debugging.
  if (env && env.LL_DISABLE_MCP_FAILURE_REPORTING === "1") return;

  const sessionId = input?.session_id
    || env?.DROID_SESSION_ID
    || `unknown-${Date.now()}`;

  let corePath;
  try {
    // The meta-state module lives in the project, not in the test temp cwd.
    // Resolve relative to this hook's own location: .factory/hooks/<this>.cjs
    // -> <project-root>/tools/learning-loop-mcp/core/meta-state.js
    const path = require("node:path");
    const projectRoot = path.resolve(__dirname, "..", "..");
    corePath = path.join(projectRoot, "tools/learning-loop-mcp/core/meta-state.js");
  } catch (e) {
    // Should not happen — log and bail.
    console.error(`[loop-surface-inject] cannot resolve core path: ${e.message}`);
    return;
  }

  let writeEntry, readRegistry, generateId;
  try {
    const core = await import(corePath);
    writeEntry = core.writeEntry;
    readRegistry = core.readRegistry;
    generateId = core.generateId;
  } catch (e) {
    console.error(`[loop-surface-inject] cannot import core/meta-state.js: ${e.message}`);
    return;
  }

  // Idempotency: skip if a finding for this session is already active or reported.
  let existing = null;
  try {
    existing = readRegistry(cwd).find((e) =>
      e.entry_kind === "finding"
      && e.session_id === sessionId
      && e.subtype === "mcp-connection"
      && (e.status === "active" || e.status === "reported"),
    );
  } catch {
    // registry may not exist yet — treat as no existing finding
  }
  if (existing) return;

  const id = generateId("mcp-connection-missing");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const entry = {
    id,
    entry_kind: "finding",
    category: "mcp-tool-missing",
    severity: "warning",
    affected_system: "mcp-tools",
    subtype: "mcp-connection",
    description: `MCP server probe failed at session start (reason=${reason}, session_id=${sessionId}). The 5 SP0-SP3 tools (meta_state_log_change, meta_state_derive_status, meta_state_check_grounding, meta_state_refresh_fingerprint, meta_state_query_drift) may be unreachable in this session. Workarounds: (1) try mcp__learning_loop_mcp__* tools directly (the probe may have failed transiently); (2) reconnect via session config; (3) fall back to direct file I/O via Node scripts that import core/meta-state.js.`,
    evidence_code_ref: "tools/learning-loop-mcp/server.js",
    session_id: sessionId,
    status: "reported",
    auto_resolve: null,
    created_at: now.toISOString(),
    expires_at: expiresAt,
    acked_at: null,
    resolved_at: null,
    resolved_by: null,
    version: 0,
  };

  try {
    await writeEntry(cwd, entry);
  } catch (e) {
    console.error(`[loop-surface-inject] cannot write meta_state finding: ${e.message}`);
    return;
  }

  // Surface the banner to the operator (printed via console.log to match the
  // existing formatBlock pattern in the success path).
  console.log(formatMcpFailureBanner(sessionId, reason));
}

function formatMcpFailureBanner(sessionId, reason) {
  return [
    "=== MCP connection probe failed (loop-surface-inject) ===",
    `reason: ${reason}`,
    `session_id: ${sessionId}`,
    "",
    "The 5 SP0-SP3 tools (meta_state_log_change, meta_state_derive_status,",
    "meta_state_check_grounding, meta_state_refresh_fingerprint, meta_state_query_drift)",
    "may be unreachable in this session.",
    "",
    "Workarounds:",
    "  1. Try mcp__learning_loop_mcp__* tools directly (the probe may have failed transiently).",
    "  2. Reconnect via session config (.mcp.json or Droid hook init).",
    "  3. Fall back to direct file I/O via Node scripts that import core/meta-state.js (loses appendGateLog audit trail).",
    "",
    "A meta_state_report finding has been logged for this session.",
    "========================================================",
  ].join("\n");
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
