import { test } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readdirSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { readRegistry } from "../../core/meta-state.js";
import { withMcpServer } from "../with-mcp-server.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(dirname(dirname(dirname(__dirname))));
const LOOP_BIN = join(projectRoot, "tools", "learning-loop-mastra", "bin", "loop.mjs");

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), "zod-coerce-cli-"));
  mkdirSync(join(root, "records", "meta", "decisions"), { recursive: true });
  const schemasSrc = join(projectRoot, "schemas");
  const schemasDst = join(root, "schemas");
  mkdirSync(schemasDst, { recursive: true });
  for (const f of readdirSync(schemasSrc)) {
    if (f.endsWith(".schema.json")) copyFileSync(join(schemasSrc, f), join(schemasDst, f));
  }
  return root;
}

// meta_state_report rides the CLI (single-surface contract); the "true"
// wire-format coercion of mechanism_check is exercised via bin/loop.mjs +
// adaptLegacyHandler, which runs the same code path the MCP server did.
test("CLI meta_state_report 'true' string coerces to boolean mechanism_check", () => {
  const tempRoot = makeRoot();
  const proc = spawnSync(
    "node",
    [LOOP_BIN, "meta_state_report", JSON.stringify({
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Test boolean wire-format coercion via CLI (min 20 chars)",
      evidence_code_ref: "tools/test.js",
      mechanism_check: "true",
    })],
    {
      env: { ...process.env, LOOP_SURFACE: ".claude", GATE_ROOT: tempRoot, MASTRA_STORAGE_DRIVER: "memory" },
      encoding: "utf8",
      timeout: 30000,
    },
  );
  assert.strictEqual(proc.status, 0, `cli must exit 0; stderr=${proc.stderr}`);
  const result = JSON.parse((proc.stdout ?? "").trim());
  assert.equal(result.reported, true, `Failed to report finding: ${JSON.stringify(result)}`);

  const entries = readRegistry(tempRoot);
  const entry = entries.find((e) => e.id === result.id);
  assert(entry, "entry not found in registry");
  assert.equal(entry.mechanism_check, true);
});

// tools/list schema preservation is asserted against a residue tool
// (check_runtime_agnostic), which IS registered on MCP. The schema-coercion
// coverage for non-residue tools lives in mcp-tools-list-parity.test.js
// (direct schema conversion checks).
test("stdio smoke: tools/list schema preservation on the residue surface", async () => {
  await withMcpServer(async ({ listTools }) => {
    const tools = await listTools();
    const checkRuntime = tools.find((t) => t.name === "mastra_check_runtime_agnostic");
    assert(checkRuntime, "mastra_check_runtime_agnostic not found in tools/list");
    assert(checkRuntime.inputSchema, "inputSchema missing");
    const schema = checkRuntime.inputSchema;
    assert(schema.properties && schema.properties.feature_path, "feature_path missing from schema");
    assert.equal(
      schema.properties.feature_path.type,
      "string",
      "feature_path should be string type",
    );
  });
});
