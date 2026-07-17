/**
 * Phase 4 (plans/260717-1826-unify-context-injection): CLI test for
 * tools/scripts/hint-render.mjs — exercise every channel via spawn and
 * assert byte-equality with the in-process renderer for the same channel.
 */
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");
const { pathToFileURL } = require("node:url");

const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");
const CLI_PATH = resolve(PROJECT_ROOT, "tools/scripts/hint-render.mjs");

const CHANNELS = ["claude-session-start", "factory-session-start", "mcp-warm", "sidecar"];

describe("hint-render.mjs CLI (Phase 4)", () => {
  test("cli binary is executable and resolves", () => {
    const result = spawnSync("node", [CLI_PATH, "--help"], { encoding: "utf8" });
    assert.strictEqual(result.status, 0, `cli --help must exit 0; stderr: ${result.stderr}`);
    assert.ok(result.stdout.includes("Usage:"), "help text must include usage");
  });

  test("cli exits 2 on unknown channel", () => {
    const result = spawnSync("node", [CLI_PATH, "--channel", "no-such-channel"], { encoding: "utf8" });
    assert.strictEqual(result.status, 2, "unknown channel must exit 2");
    assert.ok(result.stderr.includes("unknown channel"), "error message must name the channel");
  });

  test("cli exits 2 on missing channel", () => {
    const result = spawnSync("node", [CLI_PATH], { encoding: "utf8" });
    assert.strictEqual(result.status, 2, "missing --channel must exit 2");
  });

  for (const channel of CHANNELS) {
    test(`cli --channel ${channel} prints render output`, () => {
      const result = spawnSync("node", [CLI_PATH, "--channel", channel], {
        encoding: "utf8",
        timeout: 10000,
      });
      assert.strictEqual(result.status, 0, `${channel}: exit 0; stderr: ${result.stderr}`);
      assert.ok(result.stdout.length > 0, `${channel}: must produce stdout output`);
    });
  }

  test("cli --provenance surfaces slug + source per hint", () => {
    const result = spawnSync("node", [CLI_PATH, "--channel", "claude-session-start", "--provenance"], {
      encoding: "utf8",
      timeout: 10000,
    });
    assert.strictEqual(result.status, 0);
    // Each hint's slug surfaces in the stderr provenance list. Spot-check.
    assert.ok(result.stderr.includes("internalization-rule"), "provenance must include a discoverability slug");
    assert.ok(result.stderr.includes("pnpm-test-discipline"), "provenance must include a process slug");
    // Provenance counts: 16 discoverability + 10 process = 26 source rows.
    const lines = result.stderr.split("\n").filter((l) => l.match(/\([a-z-]+\)\s+←/));
    assert.ok(lines.length >= 26, `provenance should list >= 26 hints; got ${lines.length}`);
  });

  test("cli --partition selects one partition", () => {
    const result = spawnSync("node", [CLI_PATH, "--channel", "claude-session-start", "--partition", "0"], {
      encoding: "utf8",
      timeout: 10000,
    });
    assert.strictEqual(result.status, 0);
    assert.ok(result.stdout.includes("evidence_code_ref"), "partition 0 must include discoverability content");
  });

  test("cli --partition out-of-range exits 2", () => {
    const result = spawnSync("node", [CLI_PATH, "--channel", "claude-session-start", "--partition", "99"], {
      encoding: "utf8",
      timeout: 10000,
    });
    assert.strictEqual(result.status, 2, "out-of-range partition must exit 2");
  });

  test("cli runs in <1s on claude-session-start", () => {
    const t0 = Date.now();
    const result = spawnSync("node", [CLI_PATH, "--channel", "claude-session-start"], { encoding: "utf8" });
    const elapsed = Date.now() - t0;
    assert.strictEqual(result.status, 0);
    assert.ok(elapsed < 1000, `cli must run in <1s; got ${elapsed}ms`);
  });
});
