import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, mkdirSync, readdirSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { z } from "zod";
import { connectMcpServer } from "./with-mcp-server.js";
import { schemaJsonParity, toolsCallParity } from "./parity-harness.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "..", "..", "..");
const legacyEntry = join(projectRoot, "tools/learning-loop-mcp/server.js");
const mastraEntry = join(projectRoot, "tools/learning-loop-mastra/server.js");
const mastraManifest = JSON.parse(
  readFileSync(
    join(projectRoot, "tools/learning-loop-mastra/tools/manifest.json"),
    "utf8",
  ),
);

function copySchemas(tempRoot) {
  const schemasSrc = join(projectRoot, "schemas");
  const schemasDst = join(tempRoot, "schemas");
  mkdirSync(schemasDst, { recursive: true });
  for (const f of readdirSync(schemasSrc)) {
    if (f.endsWith(".schema.json")) {
      copyFileSync(join(schemasSrc, f), join(schemasDst, f));
    }
  }
}

function prepareTempRoot() {
  const tempRoot = mkdtempSync(join(tmpdir(), "parity-zod-"));
  mkdirSync(join(tempRoot, "records", "meta", "decisions"), { recursive: true });
  copySchemas(tempRoot);
  return tempRoot;
}

/**
 * Probe inputs for the read-only tools where full tools/call content parity is
 * safe (no registry mutation, deterministic output).
 *
 * Note: gate_check is intentionally excluded. It records the checked command as
 * a ledger event in runtime-state.jsonl, so it is not actually read-only and
 * can race with concurrent registry readers/writers.
 */
const READ_ONLY_CALLS = [
  {
    legacyName: "meta_state_list",
    mastraName: "mastra_meta_state_list",
    args: { compact: true, limit: 5 },
  },
  {
    legacyName: "loop_describe",
    mastraName: "mastra_loop_describe",
    args: { tier: "summary" },
  },
  {
    legacyName: "runtime_state_read",
    mastraName: "mastra_runtime_state_read",
    args: { kind: "budget-state" },
  },
  {
    legacyName: "check_runtime_agnostic",
    mastraName: "mastra_check_runtime_agnostic",
    args: { feature_path: "schemas/meta-state.schema.json" },
  },
];

describe("z.toJSONSchema parity", () => {
  let tempRoot;
  let legacy;
  let mastra;

  before(async () => {
    tempRoot = prepareTempRoot();
    legacy = await connectMcpServer(legacyEntry, tempRoot);
    mastra = await connectMcpServer(mastraEntry, tempRoot);
  });

  after(async () => {
    if (legacy) await legacy.cleanup();
    if (mastra) await mastra.cleanup();
  });

  /**
   * Probe 1a/1b: verify the legacy McpServer emits Draft 7 output with
   * additionalProperties omitted and field descriptions preserved.
   */
  test("probe: legacy gate_check schema serializes to Draft 7", async () => {
    const tools = await legacy.listTools();
    const gateCheck = tools.find((t) => t.name === "gate_check");
    assert.ok(gateCheck, "gate_check not found in legacy tools/list");
    assert.ok(gateCheck.inputSchema.$schema, "expected $schema field");
    assert.ok(
      gateCheck.inputSchema.properties.command.description,
      "expected field description",
    );
    assert.equal(
      gateCheck.inputSchema.additionalProperties,
      undefined,
      "legacy omits additionalProperties",
    );
  });

  /**
   * Probe 1c: the harness normalizes the additionalProperties: false that Mastra
   * emits for the same schema.
   */
  test("probe: z.toJSONSchema parity normalizes additionalProperties", () => {
    const legacySchema = z.object({ flag: z.boolean() });
    const wrapped = z.preprocess((v) => v ?? {}, legacySchema);
    const result = schemaJsonParity(legacySchema, wrapped);
    assert.equal(result.parity, true, JSON.stringify(result.diff));
  });

  /**
   * Probe 2: the harness unwraps a z.preprocess wrapper in input mode.
   */
  test("probe: z.toJSONSchema handles z.preprocess wrappers", () => {
    const legacySchema = z.object({
      items: z.array(z.string()),
      enabled: z.boolean(),
    });
    const wrapped = z.preprocess((v) => v ?? {}, legacySchema);
    const result = schemaJsonParity(legacySchema, wrapped);
    assert.equal(result.parity, true, JSON.stringify(result.diff));
  });

  for (const { file, export: exportName } of mastraManifest) {
    const legacyName = exportName
      .replace(/Tool$/, "")
      .replace(/([A-Z])/g, "_$1")
      .toLowerCase()
      .replace(/^_/, "");
    const mastraName = `mastra_${legacyName}`;

    test(`schema parity: ${legacyName} → ${mastraName}`, { timeout: 10000 }, async () => {
      const [legacyTools, mastraTools] = await Promise.all([
        legacy.listTools(),
        mastra.listTools(),
      ]);

      const legacyTool = legacyTools.find((t) => t.name === legacyName);
      const mastraTool = mastraTools.find((t) => t.name === mastraName);

      assert.ok(legacyTool, `${legacyName} missing from legacy tools/list`);
      assert.ok(mastraTool, `${mastraName} missing from mastra tools/list`);

      const result = schemaJsonParity(
        legacyTool.inputSchema,
        mastraTool.inputSchema,
      );
      assert.equal(
        result.parity,
        true,
        `${legacyName} schema mismatch: ${JSON.stringify(result.diff, null, 2)}`,
      );
    });
  }

  for (const { legacyName, mastraName, args } of READ_ONLY_CALLS) {
    test(`content parity: ${legacyName} → ${mastraName}`, { timeout: 10000 }, async () => {
      const [legacyResult, mastraResult] = await Promise.all([
        legacy.callTool(legacyName, args),
        mastra.callTool(mastraName, args),
      ]);

      const result = toolsCallParity(
        { content: [{ type: "text", text: JSON.stringify(legacyResult) }] },
        { content: [{ type: "text", text: JSON.stringify(mastraResult) }] },
      );
      assert.equal(
        result.parity,
        true,
        `${legacyName} content mismatch: ${JSON.stringify(result.diff, null, 2)}`,
      );
    });
  }
});
