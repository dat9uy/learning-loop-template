import { test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { CLI_READ_TOOLS } from "../core/cli-tools.js";
import { META_STATE_FINDING_CATEGORIES, META_STATE_FINDING_SEVERITIES } from "../core/constants.js";
import { BANNER_BYTES_BUDGET } from "./banner-budget.js";

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
  buildConfiguredTransportBanner,
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
  // The file-backed dispatch form must be advertised so agents with
  // gate-sensitive or shell-risky payloads know the alternate shape.
  assert.ok(
    banner.includes("--args-file <path>"),
    "records-via-cli banner must advertise the --args-file form",
  );
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

test("--args-file dispatch form is covered in the banner footer", () => {
  const banner = buildTransportBanner({ readsViaCli: true, recordsViaCli: true });
  assert.match(
    banner,
    /loop\.mjs <tool> --args-file <path>/,
    "records-via-cli banner must show the inline JSON + file-form invocation guidance",
  );
});

test("meta_state_report sketch inlines the required category enum values", () => {
  const banner = buildTransportBanner({ readsViaCli: true, recordsViaCli: true });
  // The sketch is built from the same constants the zod schema enforces
  // (core/constants.js), so this test locks banner ≡ schema rather than a
  // hand-copied literal list.
  for (const value of META_STATE_FINDING_CATEGORIES) {
    assert.ok(
      banner.includes(value),
      `meta_state_report sketch must list category value "${value}"`,
    );
  }
  // The severity enum is also enforced.
  assert.ok(
    banner.includes(`severity:${META_STATE_FINDING_SEVERITIES.join("|")}`),
    "sketch must list the severity enum",
  );
});

test("transport banner interpolates the pinned LOOP_SURFACE value so the agent need not guess", () => {
  // Regression: the footer used to emit a generic "Set LOOP_SURFACE before
  // invoking" prompt, forcing the agent to guess the surface and burn a
  // rejected first call (e.g. LOOP_SURFACE=loop). When a concrete surface
  // is threaded in, the banner must state the exact value to set.
  const readsOnly = buildTransportBanner({ readsViaCli: true, surface: ".claude" });
  assert.ok(
    readsOnly.includes("Set LOOP_SURFACE=.claude before invoking"),
    `reads-only banner must name the concrete surface; got: ${readsOnly}`,
  );
  assert.ok(
    !readsOnly.includes("Set LOOP_SURFACE before invoking\n"),
    "reads-only banner must not emit the bare generic footer when a surface is given",
  );

  const recordsViaCli = buildTransportBanner({ readsViaCli: true, recordsViaCli: true, surface: ".claude" });
  assert.ok(
    recordsViaCli.includes("Set LOOP_SURFACE=.claude before invoking"),
    `records-via-cli banner must name the concrete surface; got: ${recordsViaCli}`,
  );
});

test("transport banner fails open to the generic footer when no surface is configured", () => {
  // No surface threaded -> the original generic prompt must be preserved so
  // the banner never goes empty or malformed on a config without LOOP_SURFACE.
  const banner = buildTransportBanner({ readsViaCli: true });
  assert.ok(
    banner.includes("Set LOOP_SURFACE before invoking; set GATE_ROOT when reading a different repo."),
    `fail-open banner must keep the generic footer; got: ${banner}`,
  );
  assert.ok(!banner.includes("Set LOOP_SURFACE=null"), "must not stringify a null surface");
});

test("buildConfiguredTransportBanner reads the pinned surface from .mcp.json into the footer", () => {
  const root = mkdtempSync(join(tmpdir(), "cli-session-surface-"));
  mkdirSync(join(root, ".claude"), { recursive: true });
  writeFileSync(
    join(root, ".mcp.json"),
    JSON.stringify({
      mcpServers: {
        "learning-loop": {
          env: { LOOP_SURFACE: ".claude", LOOP_RECORDS_VIA_CLI: "1" },
        },
      },
    }),
  );
  const banner = buildConfiguredTransportBanner(root);
  assert.ok(banner.includes("Set LOOP_SURFACE=.claude before invoking"), `banner must carry the pinned surface; got: ${banner}`);

  // Fail-open: a config without LOOP_SURFACE keeps the generic footer.
  const bareRoot = mkdtempSync(join(tmpdir(), "cli-session-bare-"));
  mkdirSync(join(bareRoot, ".claude"), { recursive: true });
  writeFileSync(
    join(bareRoot, ".mcp.json"),
    JSON.stringify({ mcpServers: { "learning-loop": { env: { LOOP_RECORDS_VIA_CLI: "1" } } } }),
  );
  const bareBanner = buildConfiguredTransportBanner(bareRoot);
  assert.ok(
    bareBanner.includes("Set LOOP_SURFACE before invoking; set GATE_ROOT when reading a different repo."),
    `bare config must fall back to the generic footer; got: ${bareBanner}`,
  );
  assert.ok(!bareBanner.includes("Set LOOP_SURFACE=."), "must not interpolate an absent surface");
});

test("reads-only banner stays under the records-via-cli byte budget (no schema re-injection)", () => {
  // Lock the "no schema re-injection" invariant so a future banner edit
  // cannot silently erode the context-size win. A reads-only banner
  // must be smaller than a records-via-cli banner (which adds the
  // sketches); both stay well under a 2 KiB cap.
  const readsOnly = buildTransportBanner({ readsViaCli: true, recordsViaCli: false });
  const recordsViaCli = buildTransportBanner({ readsViaCli: true, recordsViaCli: true });
  assert.ok(recordsViaCli.length > readsOnly.length, "records banner should be larger (carries sketches)");
  assert.ok(recordsViaCli.length < BANNER_BYTES_BUDGET, `records banner must stay under the 4 KiB budget; got: ${recordsViaCli.length}`);
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
