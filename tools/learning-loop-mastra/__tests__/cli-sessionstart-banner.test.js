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
          env: { LOOP_SURFACE: ".claude" },
        },
      },
    }),
  );

  assert.deepStrictEqual(readSurfaceMcpJson(root), {
    LOOP_SURFACE: ".claude",
  });
  assert.deepStrictEqual(readSurfaceMcpJson(join(root, "missing")), {});
});

test("transport banner always names the CLI contract (single record surface)", () => {
  const banner = buildTransportBanner();
  assert.ok(banner.includes("tools/learning-loop-mastra/bin/loop.mjs <tool> '<json-args>'"));
  assert.ok(banner.includes("mastra_<read> MCP tools are NOT registered"));
  assert.ok(banner.includes("Writes also ride the CLI"));
  assert.ok(banner.includes("LOOP_SURFACE"));
  assert.ok(banner.includes("GATE_ROOT"));
  for (const toolName of CLI_READ_TOOLS) {
    assert.ok(banner.includes(toolName), `banner must name ${toolName}`);
  }
});

test("transport banner adds write-tool sketches (one-liner per write tool)", () => {
  const banner = buildTransportBanner();
  // Recovery policy + write-tool sketches are surfaced.
  assert.ok(banner.includes("InternalError"), "banner must name the InternalError shape");
  assert.ok(banner.includes("Write-tool arg sketches"), "banner must label the sketches section");
  // The file-backed dispatch form must be advertised so agents with
  // gate-sensitive or shell-risky payloads know the alternate shape.
  assert.ok(
    banner.includes("--args-file <path>"),
    "banner must advertise the --args-file form",
  );
  // Spot-check a few write tools are present in the sketches section.
  for (const writeTool of [
    "meta_state_report",
    "meta_state_resolve",
    "meta_state_batch",
  ]) {
    assert.ok(
      banner.includes(`loop.mjs ${writeTool}`),
      `banner must include a sketch for ${writeTool}`,
    );
  }
  // No full schema re-injection: the banner must not embed a JSON
  // schema's `$schema` key (it would mean a schema dump leaked in).
  assert.ok(!banner.includes('"$schema"'), `banner must not embed a JSON schema; got: ${banner.slice(0, 500)}`);
});

test("--args-file dispatch form is covered in the banner footer", () => {
  const banner = buildTransportBanner();
  assert.match(
    banner,
    /loop\.mjs <tool> --args-file <path>/,
    "banner must show the inline JSON + file-form invocation guidance",
  );
});

test("meta_state_report sketch inlines the required category enum values", () => {
  const banner = buildTransportBanner();
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
  const withSurface = buildTransportBanner({ surface: ".claude" });
  assert.ok(
    withSurface.includes("Set LOOP_SURFACE=.claude before invoking"),
    `banner must name the concrete surface; got: ${withSurface}`,
  );
  assert.ok(
    !withSurface.includes("Set LOOP_SURFACE before invoking\n"),
    "banner must not emit the bare generic footer when a surface is given",
  );
});

test("transport banner fails open to the generic footer when no surface is configured", () => {
  // No surface threaded -> the original generic prompt must be preserved so
  // the banner never goes empty or malformed on a config without LOOP_SURFACE.
  const banner = buildTransportBanner();
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
          env: { LOOP_SURFACE: ".claude" },
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
    JSON.stringify({ mcpServers: { "learning-loop": { env: {} } } }),
  );
  const bareBanner = buildConfiguredTransportBanner(bareRoot);
  assert.ok(
    bareBanner.includes("Set LOOP_SURFACE before invoking; set GATE_ROOT when reading a different repo."),
    `bare config must fall back to the generic footer; got: ${bareBanner}`,
  );
  assert.ok(!bareBanner.includes("Set LOOP_SURFACE=."), "must not interpolate an absent surface");
});

test("transport banner stays under the byte budget (no schema re-injection)", () => {
  // Lock the "no schema re-injection" invariant so a future banner edit
  // cannot silently erode the context-size win. The single-surface banner
  // carries the sketches, so it must stay well under the cap.
  const banner = buildTransportBanner();
  assert.ok(banner.length < BANNER_BYTES_BUDGET, `banner must stay under the ${BANNER_BYTES_BUDGET}-byte budget; got: ${banner.length}`);
});

test("additionalContext with banner is prefixed by the transport banner", () => {
  const actual = buildAdditionalContext(
    ["first hint", "second hint"],
    "core",
    "discoverability",
    buildTransportBanner({ surface: ".claude" }),
  );
  assert.ok(actual.startsWith("Loop read transport: this runtime reads the loop's"));
  assert.ok(actual.includes("Set LOOP_SURFACE=.claude before invoking"));
  assert.ok(actual.endsWith("2. second hint"));
});

test("SessionStart output includes the unconditional transport banner", { timeout: 20000 }, () => {
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
  assert.ok(context.includes("Writes also ride the CLI"));
  assert.ok(context.includes("Write-tool arg sketches"));
});

test("SessionStart fatal output preserves the transport banner", { timeout: 20000 }, () => {
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
  assert.ok(context.includes("Writes also ride the CLI"));
});
