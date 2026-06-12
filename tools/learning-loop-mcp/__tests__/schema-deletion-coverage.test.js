import { test } from "node:test";
import assert from "node:assert";
import { existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemasDir = join(__dirname, "..", "..", "..", "schemas");

const DELETED_SCHEMAS = [
  "capability.schema.json",
  "claim.schema.json",
  "experiment.schema.json",
  "risk.schema.json",
  "decision.schema.json",
  "observation.schema.json",
  "resource-budget.schema.json",
  "index-entry.schema.json",
];

// 1. All 8 deleted schemas are gone
for (const schema of DELETED_SCHEMAS) {
  await test(`schema ${schema} does not exist`, () => {
    assert.strictEqual(existsSync(join(schemasDir, schema)), false, `${schema} should be deleted`);
  });
}

// 2. runtime-state.schema.json still exists
await test("runtime-state.schema.json exists", () => {
  assert.strictEqual(existsSync(join(schemasDir, "runtime-state.schema.json")), true);
});

// 3. _unbound README exists
await test("schemas/_unbound/_README.md exists", () => {
  assert.strictEqual(existsSync(join(schemasDir, "_unbound", "_README.md")), true);
});

// 4. Only runtime-state.schema.json and _unbound remain in schemas/
await test("schemas/ contains only runtime-state.schema.json and _unbound/", () => {
  const entries = readdirSync(schemasDir);
  const expected = ["_unbound", "meta-state.schema.json", "runtime-state.schema.json"];
  assert.deepStrictEqual(entries.sort(), expected.sort());
});
