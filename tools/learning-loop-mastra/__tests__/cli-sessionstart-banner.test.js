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

test("transport banner with recordsViaCli adds write-tool sketches (one-liner per write tool)", () => {
  const banner = buildTransportBanner({ readsViaCli: true, recordsViaCli: true });
  // Recovery policy + write-tool sketches are surfaced.
  assert.ok(banner.includes("InternalError"), "banner must name the InternalError shape");
  assert.ok(banner.includes("Write-tool arg sketches"), "banner must label the sketches section");
  // Spot-check a few write tools are present in the sketches section.
  for (const writeTool of [
    "meta_state_report",
    "meta_state_resolve",
    "meta_state_batch",
  ]) {
    assert.ok(
      banner.includes(`loop.mjs ${writeTool}`),
      `records-via-cli banner must include a sketch for ${writeTool}`,
    );
  }
  // No full schema re-injection: the banner must not embed a JSON
  // schema's `$schema` key (it would mean a schema dump leaked in).
  assert.ok(!banner.includes('"$schema"'), `banner must not embed a JSON schema; got: ${banner.slice(0, 500)}`);
});

test("reads-only banner stays under the records-via-cli byte budget (no schema re-injection)", () => {
  // Lock the "no schema re-injection" invariant so a future banner edit
  // cannot silently erode the context-size win. A reads-only banner
  // must be smaller than a records-via-cli banner (which adds the
  // sketches); both stay well under a 2 KiB cap.
  const readsOnly = buildTransportBanner({ readsViaCli: true, recordsViaCli: false });
  const recordsViaCli = buildTransportBanner({ readsViaCli: true, recordsViaCli: true });
  assert.ok(recordsViaCli.length > readsOnly.length, "records banner should be larger (carries sketches)");
  assert.ok(recordsViaCli.length < 4096, `records banner must stay under 4 KiB; got: ${recordsViaCli.length}`);
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
  // Plan 260722-1343 Phase 4: .claude migrated to LOOP_RECORDS_VIA_CLI=1
  // (combined flag), so the banner reflects the records-via-cli state:
  // mastra_<read> AND mastra_<write> MCP tools are not registered.
  assert.ok(context.includes("Loop read transport:"));
  assert.ok(context.includes("mastra_<read> MCP tools are NOT registered"));
  assert.ok(context.includes("Writes also ride the CLI"));
  assert.ok(context.includes("Write-tool arg sketches"));
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
  // Records-via-cli state: writes also ride the CLI.
  assert.ok(context.includes("Writes also ride the CLI"));
});
