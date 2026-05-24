import { describe, test } from "node:test";
import assert from "node:assert";
import { validateSourceRef, validateSourceRefs, mergeSourceRefs } from "./source-ref-validator.js";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("validateSourceRef", () => {
  let tempDir;

  test.beforeEach = () => {};
  test.afterEach = () => {};

  test("accepts valid local:records/evidence path", () => {
    tempDir = mkdtempSync(join(tmpdir(), "srv-test-"));
    mkdirSync(join(tempDir, "records", "evidence"), { recursive: true });
    writeFileSync(join(tempDir, "records", "evidence", "test.md"), "# Test");
    const result = validateSourceRef("local:records/evidence/test.md", "decision", tempDir);
    assert.strictEqual(result.valid, true);
  });

  test("accepts valid local:records/meta/evidence path", () => {
    tempDir = mkdtempSync(join(tmpdir(), "srv-test-"));
    mkdirSync(join(tempDir, "records", "meta", "evidence"), { recursive: true });
    writeFileSync(join(tempDir, "records", "meta", "evidence", "test.md"), "# Test");
    const result = validateSourceRef("local:records/meta/evidence/test.md", "decision", tempDir);
    assert.strictEqual(result.valid, true);
  });

  test("rejects local: path outside allowed roots", () => {
    tempDir = mkdtempSync(join(tmpdir(), "srv-test-"));
    mkdirSync(join(tempDir, "product", "api", "src"), { recursive: true });
    writeFileSync(join(tempDir, "product", "api", "src", "main.py"), "print(1)");
    const result = validateSourceRef("local:product/api/src/main.py", "decision", tempDir);
    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes("must stay under"));
  });

  test("accepts record: ref format", () => {
    const result = validateSourceRef("record:decision-meta-260522T2030Z-test", "experiment", tempDir || "/tmp");
    assert.strictEqual(result.valid, true);
  });

  test("rejects record: ref with empty ID", () => {
    const result = validateSourceRef("record:", "experiment", "/tmp");
    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes("must contain a record ID"));
  });

  test("allows legacy: ref but marks deprecated", () => {
    const result = validateSourceRef("legacy:old-path", "decision", "/tmp");
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.deprecated, true);
  });

  test("rejects unsupported prefix", () => {
    const result = validateSourceRef("http://example.com", "decision", "/tmp");
    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes("must start with"));
  });

  test("rejects non-string ref", () => {
    const result = validateSourceRef(123, "decision", "/tmp");
    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes("must be a string"));
  });

  test("allows product/*/capabilities for capability records only", () => {
    tempDir = mkdtempSync(join(tmpdir(), "srv-test-"));
    mkdirSync(join(tempDir, "product", "api", "capabilities"), { recursive: true });
    writeFileSync(join(tempDir, "product", "api", "capabilities", "test.py"), "# Test");
    const capResult = validateSourceRef("local:product/api/capabilities/test.py", "capability", tempDir);
    assert.strictEqual(capResult.valid, true);
    const decResult = validateSourceRef("local:product/api/capabilities/test.py", "decision", tempDir);
    assert.strictEqual(decResult.valid, false);
  });
});

describe("validateSourceRefs", () => {
  test("validates array of refs", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "srv-test-"));
    mkdirSync(join(tempDir, "records", "evidence"), { recursive: true });
    writeFileSync(join(tempDir, "records", "evidence", "test.md"), "# Test");
    const result = validateSourceRefs(
      ["local:records/evidence/test.md", "record:decision-meta-260522T2030Z-test"],
      "decision",
      tempDir
    );
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors.length, 0);
  });

  test("collects errors for invalid refs", () => {
    const result = validateSourceRefs(
      ["local:product/api/src/main.py", "record:decision-meta-260522T2030Z-test"],
      "decision",
      "/tmp"
    );
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.errors.length, 1);
  });

  test("collects deprecated refs", () => {
    const result = validateSourceRefs(
      ["legacy:old-path", "record:decision-meta-260522T2030Z-test"],
      "decision",
      "/tmp"
    );
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.deprecated.length, 1);
    assert.ok(result.deprecated.includes("legacy:old-path"));
  });
});

describe("mergeSourceRefs", () => {
  test("appends new refs to existing", () => {
    const merged = mergeSourceRefs(["local:a.md"], ["local:b.md"]);
    assert.deepStrictEqual(merged, ["local:a.md", "local:b.md"]);
  });

  test("deduplicates refs", () => {
    const merged = mergeSourceRefs(["local:a.md"], ["local:a.md", "local:b.md"]);
    assert.deepStrictEqual(merged, ["local:a.md", "local:b.md"]);
  });

  test("handles empty arrays", () => {
    const merged = mergeSourceRefs([], ["local:a.md"]);
    assert.deepStrictEqual(merged, ["local:a.md"]);
  });

  test("handles undefined existing", () => {
    const merged = mergeSourceRefs(undefined, ["local:a.md"]);
    assert.deepStrictEqual(merged, ["local:a.md"]);
  });
});
