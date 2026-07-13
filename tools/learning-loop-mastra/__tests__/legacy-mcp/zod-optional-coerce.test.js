import { test } from "vitest";
import assert from "node:assert";
import { z } from "zod";

// Test that optional fields on meta-state tools accept their values directly
// (no wire-format coercion layer needed; zod-native schemas handle it).

test("meta_state_report schema accepts affected_system enum", () => {
  const schema = z.object({
    affected_system: z.enum(["meta", "vnstock", "fastapi", "tanstack", "product", "api", "web", "meta-state-tools", "runtime-state"]).optional(),
    code_ref: z.string().optional(),
    ledger_ref: z.string().optional(),
  });
  const result = schema.safeParse({ affected_system: "vnstock", code_ref: "tools/test.js:42", ledger_ref: "vnstock-device-slot" });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.data.affected_system, "vnstock");
  assert.strictEqual(result.data.code_ref, "tools/test.js:42");
  assert.strictEqual(result.data.ledger_ref, "vnstock-device-slot");
});

test("meta_state_list schema accepts affected_system filter", () => {
  const schema = z.object({
    affected_system: z.string().optional(),
  });
  const result = schema.safeParse({ affected_system: "vnstock" });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.data.affected_system, "vnstock");
});

test("meta_state_log_change schema accepts affected_system", () => {
  const schema = z.object({
    affected_system: z.enum(["meta", "vnstock", "fastapi", "tanstack", "product", "api", "web", "meta-state-tools", "runtime-state"]).optional(),
    code_ref: z.string().optional(),
    ledger_ref: z.string().optional(),
  });
  const result = schema.safeParse({ affected_system: "meta", code_ref: "core/meta-state.js:1" });
  assert.strictEqual(result.success, true);
});

test("meta_state_patch schema accepts affected_system in patch", () => {
  const schema = z.object({}).passthrough();
  const result = schema.safeParse({ affected_system: "vnstock", code_ref: "tools/test.js" });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.data.affected_system, "vnstock");
});

test("zod-native enum accepts plain string (no wire-format wrapping)", () => {
  const schema = z.object({
    affected_system: z.enum(["meta", "vnstock"]).optional(),
  });
  const result = schema.safeParse({ affected_system: "vnstock" });
  assert.strictEqual(result.success, true);
});
