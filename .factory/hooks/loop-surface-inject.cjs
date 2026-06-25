#!/usr/bin/env node
/**
 * Droid SessionStart hook: inject loop_describe({tier:"summary"}) into context.
 * Only fires when the project has its own .mcp.json + learning-loop entry.
 * Reads stdin (Droid hook input JSON), guards, spawns MCP server, prints block.
 */

const { readFileSync, existsSync } = require("node:fs");
const { join } = require("node:path");

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
  "For rule and loop-design lifecycle, use `meta_state_list({ entry_kind: 'rule' | 'loop-design' })` (Phase 3) or `loop_describe({ tier: 'cold' })` (Phase 4). The cold tier surfaces a `loop_designs` list with `id`, `title`, `proposed_design_for`, `addresses`, and `shipped_in_plan`.",
  "To pick a tool, prefer the canonical MCP tool over `node -e` escape hatches or direct file I/O. The 4-question framework: what (what does it do), when (when to use vs alternatives), inputs (what it accepts), returns (what shape comes back). See `tools/learning-loop-mastra/tools/legacy/references/tool-selection-guide.md` for the intent to tool mapping.",
  "AGENTS.md is the priority-1 prompt (the steering layer: shape of the loop, rules, canonical paths). The tool manifest is the deterministic tool-selection surface. `loop_describe` warm tier `discoverability_hints` is the at-start-up injection. The `learning-loop` skill is the prompt-author docs. Each surface has a distinct role; do not duplicate content across them.",
  "For 'X is related to Y' prompts: (1) meta_state_relationship_validate to lint; (2) meta_state_report({..., reopens: ['<orphan_id>']}); (3) meta_state_resolve({id: parent, cascade_from: [new_finding_id]}) to close the stale parent in 1 step.",
  "On-demand hint lookup: use `loop_get_instruction({ key: '<slug>' | <index> })` when a hint has scrolled out of context or you need a cross-reference pattern. The meta-state registry (`meta-state.jsonl`) is the loop's self-model; `product/**` is the replaceable substrate that provokes learning; `tools/learning-loop-mastra/{core,tools,hooks}/legacy/**` and `schemas/**` are the template rules. Cite the correct surface.",
  "Narrow query: prefer `meta_state_list({ id: [...] })` or `meta_state_list({ ref_by, ref_field })` over the unfiltered dump. The unfiltered list is for batch audit / sweep only; the narrow query is the default.",
  "Phase A (2026-06-12 reframe): the meta-surface is the only bound surface. The 4-kind union (finding | change-log | rule | loop-design) is load-bearing: findings self-diagnose, change-logs audit, rules enforce, loop-designs defer. The product surface (decisions, experiments, risks, observations, capabilities) is unbound and archived. Substrate writes (product/**, records/**) are legacy carry-overs; all authoritative mutations go through meta_state_* MCP tools.",
  "For hook-emitted batches, query by `session_id` directly: `meta_state_list({ session_id: '...' })`. Do not filter `compact: true` output client-side — compact is for display, not for client-side filtering.",
  "Phase 4 (2026-06-15): Every feature must be runtime-agnostic (shim-not-fork + cross-surface-iteration). Codified as rule-runtime-agnostic-features. Audit a new feature with the check_runtime_agnostic MCP tool before shipping. The 6-item checklist is regression-tested by tools/learning-loop-mastra/__tests__/legacy-mcp/runtime-agnostic.test.js.",
]);

// Process-specific rules: agent behavior under operational conditions.
// Mirrors PROCESS_HINTS in tools/learning-loop-mastra/core/loop-introspect.js.
const LOCAL_PROCESS_HINTS = Object.freeze([
  "pnpm test discipline. `pnpm test` runs 9 namespaces / 1100+ tests in ~13s. Per-namespace logs at `.test-logs/<ns>.log` mirror progress. Rule 1 (silent-command): if a Bash call is silent for >2 min, tail `.test-logs/<ns>.log` instead of re-reading files. Rule 2 (same-file-read): if you read the same file >5 times in 60s with no Edit/Write/Bash, STOP — write a one-line journal to `plans/reports/` and ask the operator. The old 10-min claim was an agent-side `tail -60` artifact; the runner preserves the principle of observable per-namespace progress.",
  "PR-body registry deltas. Every PR that touches `meta-state.jsonl` must enumerate its deltas in the PR body: (a) sweep entries by id+reason, (b) resolved entries by id+resolution note, (c) new entries by id+initial status, (d) promoted rules by finding_id+rule_id, (e) superseded/archived entries by id+target. See `rule-pr-body-registry-deltas` in `meta-state.jsonl` for the canonical rule body and enforcement shape. The CI workflow `meta-state-pr-body-advisory.yml` surfaces the deltas in the PR's Checks tab.",
  "Runtime-agnostic audit. Before shipping a new feature, audit it against the 6-item checklist in `rule-runtime-agnostic-features` (process rule: core-in-universal-location, shims-in-sync, protocol-adapter-i/o, manifest-registered, cross-surface-iteration, parameterized-for-new-surfaces). Use the `check_runtime_agnostic` MCP tool to verify. The regression test is at `tools/learning-loop-mastra/__tests__/legacy-mcp/runtime-agnostic.test.js`.",
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

  const serverCfg = mcpCfg.mcpServers && mcpCfg.mcpServers["learning-loop"];
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
    // -> <project-root>/tools/learning-loop-mastra/core/meta-state.js (post-Phase-D legacy move)
    const path = require("node:path");
    const projectRoot = path.resolve(__dirname, "..", "..");
    corePath = path.join(projectRoot, "tools/learning-loop-mastra/core/meta-state.js");
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
    description: `MCP server probe failed at session start (reason=${reason}, session_id=${sessionId}). The 5 SP0-SP3 tools (meta_state_log_change, meta_state_derive_status, meta_state_check_grounding, meta_state_refresh_fingerprint, meta_state_query_drift) may be unreachable in this session. Workarounds: (1) try mcp__learning_loop__* tools directly (the probe may have failed transiently); (2) reconnect via session config; (3) fall back to direct file I/O via Node scripts that import core/meta-state.js.`,
    evidence_code_ref: "tools/learning-loop-mastra/mastra/server.js",
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
    corePath = path.join(projectRoot, "tools/learning-loop-mastra/core/meta-state.js");
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
    "  1. Try mcp__learning_loop_mastra__* tools directly (the probe may have failed transiently).",
    "  2. Reconnect via session config (.mcp.json or Droid hook init).",
    "  3. Fall back to direct file I/O via Node scripts that import core/meta-state.js (loses appendGateLog audit trail).",
    "",
    "A meta_state_report finding has been logged for this session.",
    "========================================================",
  ].join("\n");
}

// fallow-ignore-next-line complexity
function formatBlock(summary, tier = "warm") {
  const lines = [
    "=== loop surface (auto-injected at session start) ===",
    `tools: ${summary.tool_count ?? "?"}`,
    `record types: ${summary.record_type_count ?? "?"}`,
    `active rules: ${summary.rule_count ?? "?"}`,
    `active findings: ${summary.active_finding_count ?? "?"}`,
  ];

  if (tier !== "summary") {
    if (LOCAL_DISCOVERABILITY_HINTS.length > 0) {
      lines.push("");
      lines.push("--- discoverability_hints ---");
      for (const hint of LOCAL_DISCOVERABILITY_HINTS) {
        lines.push(hint);
      }
    }
    if (LOCAL_PROCESS_HINTS.length > 0) {
      lines.push("");
      lines.push("--- process_hints ---");
      for (const hint of LOCAL_PROCESS_HINTS) {
        lines.push(hint);
      }
    }
  }

  lines.push("");
  lines.push("Use mcp__learning_loop_mastra__* tools directly. Do not invoke ck:use-mcp from");
  lines.push("a project that has its own .mcp.json — that skill is for cross-project discovery.");
  lines.push("========================================================");
  return lines.join("\n");
}

async function spawnAndCall(serverCfg, cwd, tier = "summary") {
  const ALLOWED_COMMANDS = new Set(["node", "bun", "deno"]);
  const command = serverCfg.command || "node";
  if (!ALLOWED_COMMANDS.has(command)) {
    return null;
  }
  const [cmd, ...args] = serverCfg.args || [];

  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = await import(
    "@modelcontextprotocol/sdk/client/stdio.js"
  );

  const transport = new StdioClientTransport({
    command,
    args: [cmd, ...args],
    cwd,
    env: process.env,
    stderr: "pipe",
  });

  // Drain piped stderr so the child process never stalls on a full buffer.
  if (transport.stderr) {
    transport.stderr.on("data", () => {});
  }

  const client = new Client({
    name: "loop-surface-inject",
    version: "1.0.0",
  });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup().finally(() => reject(new Error("timeout")));
    }, 10000);

    const cleanup = async () => {
      clearTimeout(timeout);
      try {
        await client.close();
      } catch {
        // already closed
      }
      try {
        if (transport.pid) {
          process.kill(transport.pid);
        }
      } catch {
        // already dead
      }
    };

    (async () => {
      try {
        await client.connect(transport);

        // Preserve the original unref semantics: the probe child should not
        // keep the Droid parent process alive if the hook finishes early.
        try {
          if (transport._process && typeof transport._process.unref === "function") {
            transport._process.unref();
          }
        } catch {
          // private field may change — keep probing
        }

        const result = await client.callTool({
          name: "mastra_loop_describe",
          arguments: { tier },
        });
        await cleanup();
        const text = result?.content?.[0]?.text;
        resolve(text ? JSON.parse(text) : null);
      } catch (err) {
        await cleanup();
        reject(err);
      }
    })();
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
