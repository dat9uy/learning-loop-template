import { test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { CLI_READ_TOOLS } from "../core/cli-tools.js";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");
const HOOK_PATH = join(
  PROJECT_ROOT,
  "tools",
  "learning-loop-mastra",
  "hooks",
  "universal",
  "session-start-inject-discoverability.cjs",
);
const {
  readSurfaceMcpJson,
  buildTransportBanner,
  buildAdditionalContext,
} = require(HOOK_PATH);

test("readSurfaceMcpJson returns a runtime env block and fails open", () => {
  const root = mkdtempSync(join(tmpdir(), "cli-session-config-"));
  mkdirSync(join(root, ".claude"), { recursive: true });
  writeFileSync(
    join(root, ".mcp.json"),
    JSON.stringify({
      mcpServers: {
        "learning-loop": {
          env: { LOOP_SURFACE: ".claude", LOOP_READS_VIA_CLI: "1" },
        },
      },
    }),
  );

  assert.deepStrictEqual(readSurfaceMcpJson(root), {
    LOOP_SURFACE: ".claude",
    LOOP_READS_VIA_CLI: "1",
  });
  assert.deepStrictEqual(readSurfaceMcpJson(join(root, "missing")), {});
});

test("transport banner names the CLI contract only for opted runtimes", () => {
  assert.strictEqual(buildTransportBanner({ readsViaCli: false }), "");

  const banner = buildTransportBanner({ readsViaCli: true });
  assert.ok(banner.includes("tools/learning-loop-mastra/bin/loop.mjs <tool> '<json-args>'"));
  assert.ok(banner.includes("mastra_<read> MCP tools are NOT registered"));
  assert.ok(banner.includes("Writes still use mastra_<write> MCP tools"));
  assert.ok(banner.includes("LOOP_SURFACE"));
  assert.ok(banner.includes("GATE_ROOT"));
  for (const toolName of CLI_READ_TOOLS) {
    assert.ok(banner.includes(toolName), `banner must name ${toolName}`);
  }
});

test("non-opted additionalContext stays byte-identical", () => {
  const actual = buildAdditionalContext(
    ["first hint", "second hint"],
    "core",
    "discoverability",
    buildTransportBanner({ readsViaCli: false }),
  );
  assert.strictEqual(
    actual,
    "Loop steering (pull): loop_describe({tier:'warm'}) | hints: .claude/session-context.json | one: loop_get_instruction({key})\n1. first hint\n2. second hint",
  );
});

test("opted SessionStart output includes the transport banner", { timeout: 20000 }, () => {
  const proc = spawnSync("node", [HOOK_PATH], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, MASTRA_STORAGE_DRIVER: "memory" },
    encoding: "utf8",
    timeout: 15000,
  });
  assert.strictEqual(proc.status, 0, `hook exited ${proc.status}; stderr=${proc.stderr}`);
  const output = JSON.parse(proc.stdout);
  const context = output.hookSpecificOutput.additionalContext;
  assert.ok(context.includes("Loop read transport:"));
  assert.ok(context.includes("mastra_<read> MCP tools are NOT registered"));
  assert.ok(context.includes("Writes still use mastra_<write> MCP tools"));
});

test("opted SessionStart fatal output preserves the transport banner", { timeout: 20000 }, () => {
  const proc = spawnSync("node", [HOOK_PATH], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      MASTRA_STORAGE_DRIVER: "memory",
      SESSION_START_FORCE_FATAL: "1",
    },
    encoding: "utf8",
    timeout: 15000,
  });
  assert.strictEqual(proc.status, 0, `fatal hook exited ${proc.status}; stderr=${proc.stderr}`);
  const output = JSON.parse(proc.stdout);
  const context = output.hookSpecificOutput.additionalContext;
  assert.ok(context.includes("Loop read transport:"));
  assert.ok(context.includes("tools/learning-loop-mastra/bin/loop.mjs"));
  assert.ok(context.includes("mastra_<read> MCP tools are NOT registered"));
});
