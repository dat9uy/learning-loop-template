import { describe, test } from "vitest";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { metaStateReportTool } from "../../tools/handlers/meta-state-report-tool.js";

describe("metaStateReportTool mechanism_check extension", () => {
  const originalEnv = process.env.GATE_ROOT;

  // T33: metaStateReportTool stores mechanism_check on the entry when provided
  test("stores mechanism_check on the entry when provided (SP2 C-2 mitigation)", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "sp2-report-ext-1-"));
    process.env.GATE_ROOT = tempDir;
    try {
      await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Test mechanism_check field extension.",
        mechanism_check: true,
      });

      const raw = readFileSync(join(tempDir, "meta-state.jsonl"), "utf8");
      const entry = JSON.parse(raw.trim().split("\n")[0]);
      assert.strictEqual(entry.mechanism_check, true);
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  test("backward compat: omitting mechanism_check leaves it undefined on the entry", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "sp2-report-ext-2-"));
    process.env.GATE_ROOT = tempDir;
    try {
      await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Test mechanism_check omission backward compat.",
        // No mechanism_check field
      });

      const raw = readFileSync(join(tempDir, "meta-state.jsonl"), "utf8");
      const entry = JSON.parse(raw.trim().split("\n")[0]);
      assert.strictEqual(entry.mechanism_check, undefined);
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  test("writes no nested evidence block (only top-level fields)", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "report-top-level-"));
    process.env.GATE_ROOT = tempDir;
    try {
      await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Test report tool writes only top-level evidence fields.",
        evidence_code_ref: "test.js",
        evidence_journal: "journal.md",
        evidence_test: "test.js",
      });

      const raw = readFileSync(join(tempDir, "meta-state.jsonl"), "utf8");
      const entry = JSON.parse(raw.trim().split("\n")[0]);
      assert.strictEqual(entry.evidence_code_ref, "test.js");
      assert.strictEqual(entry.evidence_journal, "journal.md");
      assert.strictEqual(entry.evidence_test, "test.js");
      assert.strictEqual(entry.evidence, undefined, "report tool must NOT write nested evidence block");
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // T5: auto-defaults mechanism_check to true when evidence_code_ref is provided
  test("auto-defaults mechanism_check to true when evidence_code_ref is provided", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "report-auto-default-t5-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const response = await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Test auto-default mechanism_check when evidence_code_ref is set.",
        evidence_code_ref: "tools/foo.js:1",
        // No mechanism_check
      });

      const parsed = JSON.parse(response.content[0].text);
      assert.strictEqual(parsed.warnings, undefined);

      const raw = readFileSync(join(tempDir, "meta-state.jsonl"), "utf8");
      const entry = JSON.parse(raw.trim().split("\n")[0]);
      assert.strictEqual(entry.mechanism_check, true);
      assert.strictEqual(entry.evidence_code_ref, "tools/foo.js:1");
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // T6: explicit mechanism_check: true with evidence_code_ref stores true and emits no warning
  test("explicit mechanism_check: true with evidence_code_ref stores true and emits no warning", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "report-auto-default-t6-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const response = await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Test explicit mechanism_check true with evidence_code_ref.",
        evidence_code_ref: "tools/foo.js:1",
        mechanism_check: true,
      });

      const parsed = JSON.parse(response.content[0].text);
      assert.strictEqual(parsed.warnings, undefined);

      const raw = readFileSync(join(tempDir, "meta-state.jsonl"), "utf8");
      const entry = JSON.parse(raw.trim().split("\n")[0]);
      assert.strictEqual(entry.mechanism_check, true);
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // T7: explicit mechanism_check: false with evidence_code_ref stores false and emits a warning
  test("explicit mechanism_check: false with evidence_code_ref stores false and emits a warning", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "report-auto-default-t7-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const response = await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Test explicit mechanism_check false with evidence_code_ref warning.",
        evidence_code_ref: "tools/foo.js:1",
        mechanism_check: false,
      });

      const parsed = JSON.parse(response.content[0].text);
      assert.ok(Array.isArray(parsed.warnings));
      assert.strictEqual(parsed.warnings.length, 1);
      assert.strictEqual(parsed.warnings[0].code, "evidence_without_mechanism_check");
      assert.ok(typeof parsed.warnings[0].message === "string" && parsed.warnings[0].message.length > 20);

      const raw = readFileSync(join(tempDir, "meta-state.jsonl"), "utf8");
      const entry = JSON.parse(raw.trim().split("\n")[0]);
      assert.strictEqual(entry.mechanism_check, false);
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // T8: omits mechanism_check when neither field is provided
  test("omits mechanism_check when neither field is provided", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "report-auto-default-t8-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const response = await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Test mechanism_check omission when neither field is provided.",
        // No evidence_code_ref, no mechanism_check
      });

      const parsed = JSON.parse(response.content[0].text);
      assert.strictEqual(parsed.warnings, undefined);

      const raw = readFileSync(join(tempDir, "meta-state.jsonl"), "utf8");
      const entry = JSON.parse(raw.trim().split("\n")[0]);
      assert.strictEqual(entry.mechanism_check, undefined);
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // T9: explicit mechanism_check: true without evidence_code_ref is the escape hatch
  test("explicit mechanism_check: true without evidence_code_ref is the escape hatch", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "report-auto-default-t9-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const response = await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Test explicit mechanism_check true without evidence_code_ref escape hatch.",
        mechanism_check: true,
      });

      const parsed = JSON.parse(response.content[0].text);
      assert.strictEqual(parsed.warnings, undefined);

      const raw = readFileSync(join(tempDir, "meta-state.jsonl"), "utf8");
      const entry = JSON.parse(raw.trim().split("\n")[0]);
      assert.strictEqual(entry.mechanism_check, true);
      assert.strictEqual(entry.evidence_code_ref, undefined);
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // T10: mechanism_check: null behaves as if omitted
  test("mechanism_check: null behaves as if omitted", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "report-auto-default-t10-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const response = await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Test mechanism_check null behaves as omitted with evidence_code_ref.",
        evidence_code_ref: "x.js:1",
        mechanism_check: null,
      });

      const parsed = JSON.parse(response.content[0].text);
      assert.strictEqual(parsed.warnings, undefined);

      const raw = readFileSync(join(tempDir, "meta-state.jsonl"), "utf8");
      const entry = JSON.parse(raw.trim().split("\n")[0]);
      assert.strictEqual(entry.mechanism_check, true);
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });
});

describe("meta_state_report reopens field", () => {
  const originalEnv = process.env.GATE_ROOT;

  // T11: round-trip with valid array
  test("persists reopens when passed as array", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "report-extension-reopens-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const result = await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Test reopens round-trip with two expired parents (min 20 chars).",
        reopens: ["meta-260608T1522Z-test-parent-1", "meta-260608T1618Z-test-parent-2"],
      });
      const parsed = JSON.parse(result.content[0].text);
      assert.strictEqual(parsed.reported, true);
      const raw = readFileSync(join(tempDir, "meta-state.jsonl"), "utf8");
      const entry = JSON.parse(raw.trim().split("\n")[0]);
      assert.deepStrictEqual(entry.reopens, [
        "meta-260608T1522Z-test-parent-1",
        "meta-260608T1618Z-test-parent-2",
      ]);
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // T12: omitted = no field
  test("omits reopens field when not passed", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "report-extension-reopens-omit-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const result = await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Test reopens omission - no reopens field (min 20 chars).",
      });
      const parsed = JSON.parse(result.content[0].text);
      const raw = readFileSync(join(tempDir, "meta-state.jsonl"), "utf8");
      const entry = JSON.parse(raw.trim().split("\n")[0]);
      assert.strictEqual(entry.reopens, undefined);
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // T13: invalid type rejection
  test("rejects reopens as non-array", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "report-extension-reopens-type-"));
    process.env.GATE_ROOT = tempDir;
    try {
      await assert.rejects(
        metaStateReportTool.handler({
          category: "loop-anti-pattern",
          severity: "warning",
          affected_system: "mcp-tools",
          description: "Test reopens type rejection (min 20 chars).",
          reopens: "meta-260608T1522Z-not-an-array",
        }),
        (err) => /expected array/.test(err.message),
      );
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });
});
