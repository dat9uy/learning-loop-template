#!/usr/bin/env node
/**
 * Measure the loop's push surfaces for before/after budget checks.
 *
 * The MCP server runs against an isolated in-memory/temp gate root so this
 * harness never mutates the repository registry while measuring. Hook output
 * is measured from the two canonical .claude SessionStart hooks; the sidecar
 * is reduced to structural facts so injected_at does not make the report noisy.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareTempRoot, connectMcpServer } from "../learning-loop-mastra/__tests__/with-mcp-server.js";

const scriptDir = resolve(fileURLToPath(new URL(".", import.meta.url)));
const root = resolve(scriptDir, "..", "..");
const serverEntry = join(root, "tools/learning-loop-mastra/mastra/server.js");
const hooks = [
  join(root, "tools/learning-loop-mastra/hooks/universal/session-start-inject-discoverability.cjs"),
  join(root, "tools/learning-loop-mastra/hooks/universal/session-start-inject-process-hints.cjs"),
];
const sidecarPath = join(root, ".claude", "session-context.json");
const gateLogPath = join(root, ".claude", "coordination", ".gate-decision.log");

function byteLength(value) {
  return Buffer.byteLength(typeof value === "string" ? value : JSON.stringify(value));
}

function isManifestTool(tool) {
  return !tool.name.startsWith("run_")
    && !tool.name.startsWith("ask_")
    && tool.name !== "mastra_update_r2_allowlist";
}

function runHook(hookPath) {
  const result = spawnSync(process.execPath, [hookPath], {
    cwd: root,
    input: JSON.stringify({ session_id: "measure-context-surfaces" }),
    encoding: "utf8",
    env: { ...process.env },
  });
  if (result.status !== 0) {
    throw new Error(`${hookPath} exited ${result.status}: ${result.stderr || result.error?.message || "unknown error"}`);
  }
  const stdout = result.stdout.trim();
  let payload;
  try {
    payload = JSON.parse(stdout);
  } catch (error) {
    throw new Error(`${hookPath} emitted invalid JSON: ${error.message}`);
  }
  const text = payload?.hookSpecificOutput?.additionalContext;
  if (typeof text !== "string") {
    throw new Error(`${hookPath} did not emit hookSpecificOutput.additionalContext`);
  }
  return { chars: text.length, bytes: byteLength(text), source: hookPath.slice(root.length + 1) };
}

function sidecarShape() {
  if (!existsSync(sidecarPath)) throw new Error(`missing sidecar: ${sidecarPath}`);
  const payload = JSON.parse(readFileSync(sidecarPath, "utf8"));
  const keys = Object.keys(payload).sort();
  const perKeyBytes = Object.fromEntries(keys.map((key) => [key, byteLength(payload[key])]));
  const sourceFlags = Object.fromEntries(
    keys.filter((key) => key.endsWith("_source")).map((key) => [key, payload[key]]),
  );
  return {
    keys,
    per_key_bytes: perKeyBytes,
    source_flags: sourceFlags,
    shape_sha256: createHash("sha256").update(JSON.stringify(keys)).digest("hex"),
  };
}

function parseLogTimestamp(line) {
  try {
    const value = JSON.parse(line)?.timestamp;
    const time = Date.parse(value);
    return Number.isNaN(time) ? null : time;
  } catch {
    return null;
  }
}

function gateLogBaseline() {
  const now = Date.now();
  const since = now - 30 * 24 * 60 * 60 * 1000;
  const lines = existsSync(gateLogPath)
    ? readFileSync(gateLogPath, "utf8").split("\n").filter(Boolean)
    : [];
  const matching = lines.filter((line) => {
    const time = parseLogTimestamp(line);
    const recent = time === null || time >= since;
    return recent && line.includes("invalid_field") && /meta_state_(patch|batch)|patch-tool|batch-tool/.test(line);
  });
  return {
    path: gateLogPath.slice(root.length + 1),
    window_days: 30,
    matching_lines: matching.length,
    note: "Lines without a parseable timestamp are retained for conservative counting.",
  };
}

async function measureTools() {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const tempRoot = prepareTempRoot();
    let handles;
    try {
      handles = await connectMcpServer(serverEntry, tempRoot, { LOOP_SURFACE: ".claude" });
      const tools = await handles.listTools();
      const serialized = JSON.stringify(tools);
      const manifestTools = tools.filter(isManifestTool);
      return {
        total_bytes: byteLength(serialized),
        manifest_tool_bytes: byteLength(manifestTools),
        manifest_tool_count: manifestTools.length,
        tool_count: tools.length,
        tools: tools
          .map((tool) => ({ name: tool.name, bytes: byteLength(tool), manifest: isManifestTool(tool) }))
          .sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name)),
        attempts: attempt,
      };
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolvePromise) => setTimeout(resolvePromise, attempt * 250));
    } finally {
      if (handles) await handles.cleanup();
    }
  }
  throw lastError;
}

const tools = await measureTools();
const hookMeasurements = hooks.map(runHook);
console.log(JSON.stringify({
  measured_at: new Date().toISOString(),
  root,
  mcp_tools_list: tools,
  session_start_hooks: hookMeasurements,
  session_start_combined_chars: hookMeasurements.reduce((sum, item) => sum + item.chars, 0),
  session_start_combined_bytes: hookMeasurements.reduce((sum, item) => sum + item.bytes, 0),
  sidecar: sidecarShape(),
  gate_log_invalid_field_baseline: gateLogBaseline(),
}, null, 2));
