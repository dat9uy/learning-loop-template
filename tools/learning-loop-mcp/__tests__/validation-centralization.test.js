import { test } from "node:test";
import assert from "node:assert";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..", "..");

/* ── Phase 1: TDD contract — tests define behavior before file moves ── */

test("runValidateRecords returns structured result with negative fixtures", async () => {
  const { runValidateRecords } = await import("#mcp/core/negative-fixture-runner.js");
  const result = runValidateRecords(ROOT, { includeNegativeFixtures: true });
  assert.ok(Array.isArray(result.errors), "errors should be array");
  assert.ok(Array.isArray(result.warnings), "warnings should be array");
  assert.ok(Array.isArray(result.records), "records should be array");
  assert.ok(result.records.length >= 5, `expected at least 5 records, got ${result.records.length}`);
});

test("runValidateRecords with allowDisallowed returns structured result", async () => {
  const { runValidateRecords } = await import("#mcp/core/negative-fixture-runner.js");
  const result = runValidateRecords(ROOT, {
    allowDisallowedFixtures: true,
    includeNegativeFixtures: true,
  });
  assert.ok(Array.isArray(result.errors), "errors should be array");
  assert.ok(Array.isArray(result.records), "records should be array");
});

test("runValidateRecords with includeNegativeFixtures: false skips fixtures", async () => {
  const { runValidateRecords } = await import("#mcp/core/negative-fixture-runner.js");
  const result = runValidateRecords(ROOT, {
    allowDisallowedFixtures: false,
    includeNegativeFixtures: false,
  });
  assert.ok(Array.isArray(result.errors), "errors should be array");
  assert.ok(Array.isArray(result.warnings), "warnings should be array");
  assert.ok(Array.isArray(result.records), "records should be array");
});

test("core validation modules are importable from new MCP paths (Phase 2)", async () => {
  const modules = [
    "#mcp/core/record-loader.js",
    "#mcp/core/schema-loader.js",
    "#mcp/core/record-validation-rules.js",
    "#mcp/core/derived-claim-assurance.js",
    "#mcp/core/filename-convention-validation.js",
    "#mcp/core/yaml-parse-wrapper.js",
    "#mcp/core/negative-fixture-runner.js",
  ];

  for (const mod of modules) {
    try {
      await import(mod);
    } catch (err) {
      assert.fail(`expected ${mod} to be importable but got: ${err.message}`);
    }
  }
});

test("negative fixture runner resolves from new fixture path (Phase 3)", async () => {
  const { runNegativeFixtures } = await import("#mcp/core/negative-fixture-runner.js");
  const errors = runNegativeFixtures(ROOT, false);
  assert.deepStrictEqual(errors, [], `fixture path resolution failed: ${errors.join("; ")}`);
});
