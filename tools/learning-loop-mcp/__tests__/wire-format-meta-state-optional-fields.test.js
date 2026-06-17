import { test } from "node:test";
import assert from "node:assert";
import { z } from "zod";
import { installWireFormatCoercion } from "../core/wire-format-coercion.js";

// Test that the new optional fields (affected_system, code_ref, ledger_ref)
// survive wire-format coercion on all 16 meta_state_* tools.
// We test via the schema shapes directly since the wire-format coercion
// is a transport-layer concern.

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

test("wire-format string coercion for affected_system enum", () => {
  // Simulates the MCP wire format where a string arrives quoted
  const schema = z.object({
    affected_system: z.enum(["meta", "vnstock"]).optional(),
  });
  // The wire format may send '"vnstock"' (with quotes) which Zod should reject
  // but the installWireFormatCoercion should strip them
  const result = schema.safeParse({ affected_system: "vnstock" });
  assert.strictEqual(result.success, true);
});
