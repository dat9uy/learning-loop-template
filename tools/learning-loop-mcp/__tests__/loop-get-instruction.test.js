import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, readdirSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loopGetInstructionTool } from "../tools/loop-get-instruction-tool.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "..", "..", "..");
const serverEntry = join(projectRoot, "tools/learning-loop-mcp/server.js");

describe("loop_get_instruction", () => {
  test("returns hint by named slug 'reopens-script'", async () => {
    const result = await loopGetInstructionTool.handler({ key: "reopens-script" });
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.count, 1);
    assert.strictEqual(parsed.results[0].key, "reopens-script");
    assert.strictEqual(parsed.results[0].index, 10);
    assert.ok(parsed.results[0].hint.includes("meta_state_relationship_validate"));
    assert.ok(parsed.results[0].suggestion.length > 0);
  });

  test("returns hint by numeric index", async () => {
    const result = await loopGetInstructionTool.handler({ key: 0 });
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.results[0].index, 0);
    assert.ok(parsed.results[0].hint.includes("evidence_code_ref"));
  });

  test("accepts an array of keys and returns multiple results", async () => {
    const result = await loopGetInstructionTool.handler({
      key: ["internalization-rule", 10, "meta-vs-product-split"],
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.count, 3);
    assert.ok(parsed.results.every((r) => r.hint && r.suggestion));
  });

  test("returns error entry for unknown slug", async () => {
    const result = await loopGetInstructionTool.handler({ key: "no-such-hint" });
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.count, 1);
    assert.ok(parsed.results[0].error);
    assert.ok(parsed.results[0].error.includes("no-such-hint"));
  });

  test("schema advertises key as string | number | array", () => {
    const keySchema = loopGetInstructionTool.schema.key;
    assert.ok(keySchema, "schema.key should be defined");
  });
});

// Stdio transport regression test: top-level array input over MCP stdio
// must round-trip without being wrapped to {item: [...]} by the
// wire-format coercion helper. Pairs with the meta-260610T1458Z fix.
describe("loop_get_instruction (stdio transport)", () => {
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

  test("accepts top-level array key input over stdio", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "loop-get-instruction-stdio-"));
    mkdirSync(join(tempRoot, "records", "meta", "decisions"), { recursive: true });
    copySchemas(tempRoot);

    const child = spawn("node", [serverEntry], {
      cwd: projectRoot,
      env: { ...process.env, GATE_ROOT: tempRoot },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let buffer = "";
    let serverErr = "";
    const pending = new Map();

    child.stderr.on("data", (chunk) => { serverErr += chunk.toString(); });
    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      const remaining = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const msg = JSON.parse(trimmed);
          if (msg.id !== undefined && pending.has(msg.id)) {
            const { resolve, reject } = pending.get(msg.id);
            pending.delete(msg.id);
            if (msg.error) reject(new Error(msg.error.message));
            else resolve(msg.result);
          } else {
            remaining.push(line);
          }
        } catch {
          remaining.push(line);
        }
      }
      buffer = remaining.join("\n");
    });

    const send = (id, method, params) => {
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        child.stdin.write(
          JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n",
          (err) => {
            if (err) { pending.delete(id); reject(err); }
          },
        );
      });
    };

    const call = async (id, name, args) => {
      const result = await send(id, "tools/call", { name, arguments: args });
      if (!result || !result.content || !result.content[0] || typeof result.content[0].text !== "string") {
        throw new Error(`Unexpected MCP result for ${name}: ${JSON.stringify(result)}`);
      }
      try {
        return JSON.parse(result.content[0].text);
      } catch (parseErr) {
        throw new Error(`Failed to parse ${name} result: ${result.content[0].text.slice(0, 500)} (error: ${parseErr.message}); server stderr: ${serverErr.slice(0, 1000)}`);
      }
    };

    try {
      await new Promise((resolve) => setTimeout(resolve, 300));
      await send(0, "initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "loop-get-instruction-test", version: "1.0.0" },
      });

      const result = await call(1, "loop_get_instruction", {
        key: ["reopens-script", "internalization-rule"],
      });

      assert.strictEqual(result.count, 2, "array of 2 keys should return count=2");
      assert.strictEqual(result.results.length, 2);
      const reopens = result.results.find((r) => r.index === 10);
      const internalization = result.results.find((r) => r.index === 0);
      assert.ok(reopens, "results should contain the reopens-script hint (index 10)");
      assert.ok(internalization, "results should contain the internalization-rule hint (index 0)");
      assert.ok(reopens.hint.includes("meta_state_relationship_validate"));
      assert.ok(internalization.hint.includes("evidence_code_ref"));
    } finally {
      child.kill();
    }
  });
});
