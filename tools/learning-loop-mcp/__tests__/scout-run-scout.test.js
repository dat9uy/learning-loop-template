import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { runScout } from "../scout/run-scout.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const schemaPath = join(
  __dirname,
  "..",
  "scout",
  "scout-output.schema.json"
);
const schema = JSON.parse(readFileSync(schemaPath, "utf8"));

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const validate = ajv.compile(schema);

const miniCodebasePath = join(
  __dirname,
  "..",
  "scout",
  "test-fixtures",
  "mini-codebase"
);

const realTestPath = join(__dirname);

test("run-scout walks a mini-codebase and produces a valid ScoutOutput", () => {
  const result = runScout({ projectRoot: miniCodebasePath, writeJson: false });
  const ok = validate(result);
  assert.equal(ok, true, JSON.stringify(validate.errors, null, 2));
  // Mini-codebase has 7 test files (bucket-a, b, c, d, dangling-d1, d3, d5)
  assert.ok(result.inventory.length >= 5, `expected >= 5 inventory entries, got ${result.inventory.length}`);
  assert.ok(result.bucket_distribution.A >= 1);
  assert.ok(result.bucket_distribution.B >= 1);
  assert.ok(result.bucket_distribution.C >= 1);
  assert.ok(result.bucket_distribution.D >= 1);
});

test("run-scout against the real test code base produces a non-empty inventory", () => {
  const result = runScout({ projectRoot: realTestPath, writeJson: false });
  // We have 77+ test files in __tests__/ per the plan
  assert.ok(
    result.inventory.length >= 50,
    `expected inventory.length >= 50, got ${result.inventory.length}`
  );
});

test("run-scout against the real test code base surfaces the cold-session test 1 in budget table", () => {
  const result = runScout({ projectRoot: realTestPath, writeJson: false });
  // The cold-session test should be classified as bucket D
  const coldSession = result.inventory.find((i) =>
    i.file.includes("cold-session-discoverability.test.cjs")
  );
  assert.ok(coldSession, "cold-session-discoverability.test.cjs should be in inventory");
  assert.equal(coldSession.bucket, "D");
});

test("idempotency: re-running run-scout produces the same output (modulo run_timestamp and last_modified)", () => {
  const a = runScout({ projectRoot: miniCodebasePath, writeJson: false });
  const b = runScout({ projectRoot: miniCodebasePath, writeJson: false });
  // Mask run_timestamp and inventory[].last_modified (per F9 red team — both outside content hash)
  function mask(o) {
    const copy = JSON.parse(JSON.stringify(o));
    delete copy.run_timestamp;
    if (Array.isArray(copy.inventory)) {
      for (const item of copy.inventory) delete item.last_modified;
    }
    return copy;
  }
  assert.deepEqual(mask(a), mask(b));
});
