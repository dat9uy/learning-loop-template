// cli-schema-flag.test.js — Phase 3 of plans/260722-1343-write-capable-cli-w.
//
// `loop.mjs <tool> --schema` prints the normalized input schema for a
// CLI-portable tool. Pull, not push — no schema bytes in the SessionStart
// banner. The flag works without `LOOP_SURFACE` (mirrors `list`'s
// pin-exempt contract: schema is static, reads no runtime records).
//
// Arg-position handling: `loop.mjs <tool> --schema` is the canonical form
// (the `<tool>` argv slot is occupied by the bare name; `--schema` is the
// third argv). Unknown tools and out-of-set tools fall to the existing
// exit-2 path with a UsageError.

import { test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, "..");
const LOOP_BIN = join(PKG_ROOT, "bin", "loop.mjs");

describe("cli --schema flag (Phase 3)", () => {
  test("--schema on a CLI_WRITE_TOOLS member → exit 0, valid JSON with top-level keys", () => {
    const proc = spawnSync("node", [LOOP_BIN, "meta_state_report", "--schema"], {
      encoding: "utf8",
      timeout: 15000,
    });
    assert.strictEqual(proc.status, 0, `--schema must exit 0; stderr=${proc.stderr}`);
    const stdoutTrim = (proc.stdout ?? "").trim();
    let parsed;
    try {
      parsed = JSON.parse(stdoutTrim);
    } catch (err) {
      assert.fail(`stdout must be JSON; got: ${stdoutTrim.slice(0, 500)}`);
    }
    assert.ok(typeof parsed === "object" && parsed !== null, "schema must be an object");
    // JSON Schema form (zod's toJSONSchema output): keys live under `.properties`.
    assert.ok(parsed.properties && typeof parsed.properties === "object", `schema must have .properties; got keys: ${Object.keys(parsed).join(", ")}`);
    for (const key of ["category", "severity", "affected_system", "description"]) {
      assert.ok(key in parsed.properties, `schema properties must include ${key}; got: ${Object.keys(parsed.properties).join(", ")}`);
    }
  });

  test("--schema on a CLI_READ_TOOLS member → exit 0, valid JSON", () => {
    const proc = spawnSync("node", [LOOP_BIN, "meta_state_list", "--schema"], {
      encoding: "utf8",
      timeout: 15000,
    });
    assert.strictEqual(proc.status, 0, `--schema must exit 0; stderr=${proc.stderr}`);
    const stdoutTrim = (proc.stdout ?? "").trim();
    let parsed;
    try {
      parsed = JSON.parse(stdoutTrim);
    } catch (err) {
      assert.fail(`stdout must be JSON; got: ${stdoutTrim.slice(0, 500)}`);
    }
    assert.ok(typeof parsed === "object" && parsed !== null, "schema must be an object");
    // meta_state_list takes a `compact` arg — should appear under .properties.
    assert.ok(parsed.properties && (parsed.properties.compact || parsed.properties.include_all_versions), `schema properties must include a meta_state_list arg; got: ${Object.keys(parsed.properties || {}).join(", ")}`);
  });

  test("--schema works WITHOUT LOOP_SURFACE (pin-exempt, mirrors `list`)", () => {
    const env = { ...process.env };
    delete env.LOOP_SURFACE;
    const proc = spawnSync("node", [LOOP_BIN, "meta_state_report", "--schema"], {
      env,
      encoding: "utf8",
      timeout: 15000,
    });
    assert.strictEqual(proc.status, 0, `--schema must exit 0 without LOOP_SURFACE; stderr=${proc.stderr}`);
    const stdoutTrim = (proc.stdout ?? "").trim();
    assert.ok(stdoutTrim.length > 0, `--schema must produce stdout without LOOP_SURFACE; got: ${stdoutTrim}`);
  });

  test("--schema on a non-CLI tool → exit 2 (UsageError)", () => {
    // `update_r2_allowlist` is in MCP_RESIDUE, NOT in CLI_TOOLS — it stays
    // on MCP. `--schema` for it must exit 2 because the CLI does not
    // carry the tool.
    const proc = spawnSync("node", [LOOP_BIN, "update_r2_allowlist", "--schema"], {
      encoding: "utf8",
      timeout: 10000,
    });
    assert.strictEqual(proc.status, 2, `unknown-to-CLI tool must exit 2; stderr=${proc.stderr}`);
    assert.ok((proc.stderr ?? "").startsWith("loop.mjs:"), `stderr must carry loop.mjs: prefix; got: ${proc.stderr}`);
  });

  test("--schema on an entirely unknown tool → exit 2", () => {
    const proc = spawnSync("node", [LOOP_BIN, "no_such_tool_xyz", "--schema"], {
      encoding: "utf8",
      timeout: 10000,
    });
    assert.strictEqual(proc.status, 2, `unknown tool must exit 2; stderr=${proc.stderr}`);
  });

  test("schema has no leaked `pathFields` (transport detail stays out of the JSON)", () => {
    // The CLI normalizes the input schema via `normalizeInputSchema`
    // (same path as MCP wire-format). The output is the model-visible
    // schema; transport details like `pathFields` stay internal.
    const proc = spawnSync("node", [LOOP_BIN, "meta_state_report", "--schema"], {
      encoding: "utf8",
      timeout: 15000,
    });
    assert.strictEqual(proc.status, 0);
    const stdoutTrim = (proc.stdout ?? "").trim();
    assert.ok(!stdoutTrim.includes("pathFields"), `schema output must not include transport pathFields; got: ${stdoutTrim.slice(0, 500)}`);
  });
});
