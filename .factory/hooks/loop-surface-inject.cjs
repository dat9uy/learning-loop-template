#!/usr/bin/env node
/**
 * Droid SessionStart hook: inject loop_describe({tier:"summary"}) into context.
 * Only fires when the project has its own .mcp.json + learning-loop-mcp entry.
 * Reads stdin (Droid hook input JSON), guards, spawns MCP server, prints block.
 */

const { readFileSync, existsSync } = require("node:fs");
const { join } = require("node:path");
const { spawn } = require("node:child_process");

// SECURITY: hints are operator-curated and rendered from a local hardcoded copy.
// The server's discoverability_hints field is not trusted at render time.
// To update the hints, edit this file and commit.
const LOCAL_DISCOVERABILITY_HINTS = Object.freeze([
  "To cite a thing, point at the code: `meta_state_report({ evidence_code_ref: 'path/to/file.js:line' })`. The loop will hash and re-check it.",
  "When you pass `evidence_code_ref` to `meta_state_report`, `mechanism_check` is auto-defaulted to `true` (so the loop will hash and re-check the code). Pass `mechanism_check: false` explicitly to opt out — the response will include a `warnings` array explaining the tradeoff.",
  "For `source_refs`, prefer `local:meta-state:<id>` (cite a finding). Markdown refs (`local:plans/...`) are accepted for the escape hatch but discouraged.",
  "Run `meta_state_derive_status({ id })` to re-check if a finding is still true. Run `meta_state_refresh_fingerprint({ id })` to re-hash the code after a refactor.",
  "For designs without code, cite the change-log that records the design (`meta_state_log_change` with `change_target: '<plan-path>'`).",
  "Findings have 6 statuses: `reported` (24h TTL), `active` (operator-acked), `stale` (past TTL or past staleness window; re-verifiable via meta_state_re_verify), `resolved` (closed), `superseded` (consolidated into a change-log), `auto-resolved` (closed by mechanism). The legacy `expired` status was removed in plan 260611-1000-remove-expired-status; only `stale` parents are cascade-closeable.",
  "For reopens: set reopens: ['<old_stale_id>'] on the new finding at report time, then cascade-resolve the parent via meta_state_resolve({id: old_id, cascade_from: [child_id]}). The cascade closes the stale parent in 1 step.",
  "For rule and loop-design lifecycle, use `meta_state_list({ entry_kind: 'rule' | 'loop-design' })` or `loop_describe({ tier: 'cold' })`. The cold tier surfaces a `loop_designs` list with `id`, `title`, `proposed_design_for`, `addresses`, and `shipped_in_plan`.",
  "To pick a tool, prefer the canonical MCP tool over `node -e` escape hatches or direct file I/O. The 4-question framework: what (what does it do), when (when to use vs alternatives), inputs (what it accepts), returns (what shape comes back). See `tools/learning-loop-mcp/references/tool-selection-guide.md` for the intent to tool mapping.",
  "AGENTS.md is the priority-1 prompt (the steering layer: shape of the loop, rules, canonical paths). The tool manifest is the deterministic tool-selection surface. `loop_describe` warm tier `discoverability_hints` is the at-start-up injection. The `learning-loop` skill is the prompt-author docs. Each surface has a distinct role; do not duplicate content across them.",
  "For 'X is related to Y' prompts: (1) meta_state_relationship_validate to lint; (2) meta_state_report({..., reopens: ['<orphan_id>']}); (3) meta_state_resolve({id: parent, cascade_from: [new_finding_id]}) to close the stale parent in 1 step.",
  "On-demand hint lookup: use `loop_get_instruction({ key: '<slug>' | <index> })` when a hint has scrolled out of context or you need a cross-reference pattern. The meta-state registry (`meta-state.jsonl`) is the loop's self-model; `product/**` is the replaceable substrate that provokes learning; `tools/learning-loop-mcp/**` and `schemas/**` are the template rules. Cite the correct surface.",
]);

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

  const tier = env.LL_LOOP_INJECT_TIER === "summary" ? "summary" : "warm";

  if (tier === "summary") {
    await reportHintDowngrade(input, env, cwd, "env_LL_LOOP_INJECT_TIER=summary");
  }

  const spawnFn = spawnImpl || spawnAndCall;
  try {
    const summary = await spawnFn(serverCfg, cwd, tier);
    if (summary) {
      return formatBlock(summary, tier);
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

/**
 * Log a meta_state_report finding when the operator downgrades the SessionStart
 * hook tier via LL_LOOP_INJECT_TIER=summary. The downgrade is auditable, not silent.
 */
async function reportHintDowngrade(input, env, cwd, reason) {
  if (env && env.LL_DISABLE_MCP_FAILURE_REPORTING === "1") return;

  const sessionId = input?.session_id
    || env?.DROID_SESSION_ID
    || `unknown-${Date.now()}`;

  let corePath;
  try {
    const path = require("node:path");
    const projectRoot = path.resolve(__dirname, "..", "..");
    corePath = path.join(projectRoot, "tools/learning-loop-mcp/core/meta-state.js");
  } catch (e) {
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

  let existing = null;
  try {
    existing = readRegistry(cwd).find((e) =>
      e.entry_kind === "finding"
      && e.session_id === sessionId
      && e.subtype === "hint-downgrade"
      && (e.status === "active" || e.status === "reported"),
    );
  } catch {
    // registry may not exist yet
  }
  if (existing) return;

  const id = generateId("hint-downgrade");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const entry = {
    id,
    entry_kind: "finding",
    category: "loop-anti-pattern",
    severity: "warning",
    affected_system: "mcp-tools",
    subtype: "hint-downgrade",
    description: `SessionStart hook tier downgraded to summary (reason=${reason}, session_id=${sessionId}). Discoverability hints were not rendered. To re-enable hints, unset LL_LOOP_INJECT_TIER or set it to 'warm'.`,
    evidence_code_ref: ".factory/hooks/loop-surface-inject.cjs",
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
    console.error(`[loop-surface-inject] cannot write hint-downgrade finding: ${e.message}`);
  }
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

function formatBlock(summary, tier = "warm") {
  const lines = [
    "=== loop surface (auto-injected at session start) ===",
    `tools: ${summary.tool_count ?? "?"}`,
    `record types: ${summary.record_type_count ?? "?"}`,
    `active rules: ${summary.rule_count ?? "?"}`,
    `active findings: ${summary.active_finding_count ?? "?"}`,
  ];

  if (tier !== "summary" && LOCAL_DISCOVERABILITY_HINTS.length > 0) {
    lines.push("");
    for (const hint of LOCAL_DISCOVERABILITY_HINTS) {
      lines.push(hint);
    }
  }

  lines.push("");
  lines.push("Use mcp__learning_loop_mcp__* tools directly. Do not invoke ck:use-mcp from");
  lines.push("a project that has its own .mcp.json — that skill is for cross-project discovery.");
  lines.push("========================================================");
  return lines.join("\n");
}

async function spawnAndCall(serverCfg, cwd, tier = "summary") {
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
    let initSent = false;
    let callSent = false;
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("timeout"));
    }, 10000);

    const cleanup = () => {
      clearTimeout(timeout);
      try { child.kill(); } catch { /* already dead */ }
    };

    // Send initialize and tools/call shortly after spawn. The MCP server
    // imports its tool modules via top-level await and then awaits
    // server.connect(transport) before logging "MCP server started" on
    // stderr. A ~200ms delay gives the server time to register the stdin
    // 'data' listener before we write. This avoids the prior
    // chicken-and-egg: the old code wrote initialize inside the stdout
    // 'data' handler, but the first stdout data is the response to
    // initialize — which could never be sent.
    const sendInitAndCall = () => {
      if (initSent) return;
      initSent = true;
      try {
        child.stdin.write(JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "loop-surface-inject", version: "1.0.0" } }
        }) + "\n");
      } catch {
        cleanup();
        return reject(new Error("stdin_write_failed_at_initialize"));
      }
      setTimeout(() => {
        if (callSent) return;
        callSent = true;
        try {
          child.stdin.write(JSON.stringify({
            jsonrpc: "2.0",
            id: 2,
            method: "tools/call",
            params: { name: "loop_describe", arguments: { tier } }
          }) + "\n");
        } catch {
          cleanup();
          return reject(new Error("stdin_write_failed_at_tools_call"));
        }
      }, 100);
    };
    setTimeout(sendInitAndCall, 200);

    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString();
      if (buffer.length > 1_000_000) {
        cleanup();
        return resolve(null);
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
