import { describe, test } from "node:test";
import assert from "node:assert";
import { zodFromSchema } from "../core/schema-to-zod.js";

describe("runtime-state schema (Phase 3)", () => {
  let schema;

  test("schema file exists and parses", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const __dirname = fileURLToPath(new URL(".", import.meta.url));
    const schemaPath = join(__dirname, "..", "..", "..", "schemas", "runtime-state.schema.json");
    const raw = readFileSync(schemaPath, "utf8");
    schema = JSON.parse(raw);
    assert.ok(schema, "schema must parse");
    assert.strictEqual(schema.title, "Runtime State", "title must be Runtime State");
  });

  test("valid ledger-event row passes validation", () => {
    const zodSchema = zodFromSchema(schema);
    const result = zodSchema.safeParse({
      affected_system: "vnstock",
      kind: "ledger-event",
      id: "vnstock-device-slot-2026-05-08t10-17-23z",
      source_ref: "local:meta-state:rule-test",
      value: 1,
      delta: 0,
      fingerprint: "sha256:064bb87b70c510ff7ad4d268bca397ca8253f40a3fe9518e690149624d46c2d2",
      timestamp: "2026-05-08T10:17:23Z",
      status: "active",
      metadata: { experiment: "test" },
    });
    assert.strictEqual(result.success, true, `valid row should pass: ${result.error?.message}`);
  });

  test("invalid kind is rejected", () => {
    const zodSchema = zodFromSchema(schema);
    const result = zodSchema.safeParse({
      affected_system: "vnstock",
      kind: "unknown-kind",
      id: "test-id",
      source_ref: "local:meta-state:rule-test",
      timestamp: "2026-05-08T10:17:23Z",
      status: "active",
    });
    assert.strictEqual(result.success, false, "invalid kind should be rejected");
  });

  test("missing source_ref is rejected", () => {
    const zodSchema = zodFromSchema(schema);
    const result = zodSchema.safeParse({
      affected_system: "vnstock",
      kind: "ledger-event",
      id: "test-id",
      timestamp: "2026-05-08T10:17:23Z",
      status: "active",
    });
    assert.strictEqual(result.success, false, "missing source_ref should be rejected");
  });

  test("budget-state kind is valid", () => {
    const zodSchema = zodFromSchema(schema);
    const result = zodSchema.safeParse({
      affected_system: "vnstock",
      kind: "budget-state",
      id: "vnstock-budget-2026-05-08",
      source_ref: "local:meta-state:rule-test",
      value: 5,
      delta: null,
      fingerprint: "sha256:064bb87b70c510ff7ad4d268bca397ca8253f40a3fe9518e690149624d46c2d2",
      timestamp: "2026-05-08T10:17:23Z",
      status: "active",
      metadata: {},
    });
    assert.strictEqual(result.success, true, "budget-state should be valid");
  });
});
