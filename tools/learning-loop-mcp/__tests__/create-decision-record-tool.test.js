import { describe, test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recordCreateDecisionTool } from "../tools/create-decision-record-tool.js";

describe("recordCreateDecisionTool", () => {
  const originalEnv = process.env.GATE_ROOT;

  function makeTempRoot() {
    const tempDir = mkdtempSync(join(tmpdir(), "rcdt-test-"));
    mkdirSync(join(tempDir, "records", "meta", "decisions"), { recursive: true });
    mkdirSync(join(tempDir, "schemas"), { recursive: true });
    writeFileSync(
      join(tempDir, "schemas", "decision.schema.json"),
      JSON.stringify({
        type: "object",
        properties: {
          id: { type: "string" },
          type: { const: "decision" },
          schema_version: { type: "string" },
          status: { type: "string" },
          surface: { type: "string" },
          question: { type: "string" },
          decision: { type: "string" },
          rationale: { type: "string" },
          source_refs: { type: "array", items: { type: "string" } },
        },
        required: ["surface", "question", "decision", "rationale"],
      }),
      "utf8",
    );
    return tempDir;
  }

  test("rejects deprecated markdown source_refs", async () => {
    const tempDir = makeTempRoot();
    process.env.GATE_ROOT = tempDir;
    try {
      mkdirSync(join(tempDir, "plans"), { recursive: true });
      writeFileSync(join(tempDir, "plans", "x.md"), "# Plan");

      const result = await recordCreateDecisionTool.handler({
        surface: "meta",
        question: "Q?",
        decision: "A",
        rationale: "Because.",
        source_refs: ["local:plans/x.md"],
      });

      const parsed = JSON.parse(result.content[0].text);
      assert.strictEqual(parsed.created, false);
      assert.strictEqual(parsed.reason, "deprecated_source_refs");
      assert.deepStrictEqual(parsed.deprecated, ["local:plans/x.md"]);
      assert.ok(result.isError);
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  test("accepts valid local:meta-state source_refs", async () => {
    const tempDir = makeTempRoot();
    process.env.GATE_ROOT = tempDir;
    try {
      writeFileSync(
        join(tempDir, "meta-state.jsonl"),
        JSON.stringify({
          id: "meta-260601T1339Z-test-entry",
          entry_kind: "finding",
          status: "active",
          created_at: "2026-06-01T13:39:00Z",
        }) + "\n",
        "utf8",
      );

      const result = await recordCreateDecisionTool.handler({
        surface: "meta",
        question: "Q?",
        decision: "A",
        rationale: "Because.",
        source_refs: ["local:meta-state:meta-260601T1339Z-test-entry"],
      });

      const parsed = JSON.parse(result.content[0].text);
      assert.strictEqual(parsed.created, true);
      assert.strictEqual(result.isError, undefined);
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });
});
