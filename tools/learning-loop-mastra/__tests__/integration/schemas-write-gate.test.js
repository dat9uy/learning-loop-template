// Plan 260720-1112 Phase 2: RED→GREEN regression for the schemas/** write-gate
// repair. The schemas rule is migrated from a dead-end simple-glob block in
// BOUND_ARTIFACTS (with a reason that references the non-existent
// `pnpm validate:records` script and no working override path) to a
// preflight-delegating rule mirroring `skills` (gate_mark_preflight(surface:
// "schemas") unlocks writes to schemas/** for 30 minutes).
//
// Closes finding `meta-260720T1104Z`.

import { test, beforeEach, afterEach } from "vitest";
import assert from "node:assert";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { evaluateWriteGate } from "../../core/evaluate-write-gate.js";
import { gateMarkPreflightTool } from "../../tools/handlers/mark-preflight-complete-tool.js";

let root;

beforeEach(() => {
  root = join(tmpdir(), `schemas-gate-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(root, { recursive: true });
  mkdirSync(join(root, ".factory", "coordination"), { recursive: true });
  // Isolate the MCP handler from real coordination dirs (otherwise it would
  // fan-out and write real .loop-preflight-schemas markers into
  // .claude/.factory/.mastracode/coordination/, polluting other tests).
  process.env.GATE_COORD_DIR = join(root, ".factory", "coordination");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  delete process.env.GATE_COORD_DIR;
});

function writePreflightMarker(surface) {
  const path = join(root, ".factory", "coordination", `.loop-preflight-${surface}`);
  writeFileSync(path, JSON.stringify({ completed_at: new Date().toISOString() }), "utf8");
}

// ── Gate behavior: schemas/** blocks without marker; no `validate:records` in reason ──

await test("schemas/runtime-state.schema.json without preflight marker → block, surface=schemas, no validate:records in reason", () => {
  const result = evaluateWriteGate({ filePath: join(root, "schemas/runtime-state.schema.json"), root });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.surface, "schemas", `expected surface=schemas; got: ${JSON.stringify(result)}`);
  assert.ok(
    !result.reason.includes("validate:records"),
    `reason must not mention pnpm validate:records; got: ${result.reason}`
  );
  assert.ok(
    result.reason.includes("gate_mark_preflight") && result.reason.includes("schemas"),
    `reason must point at canonical preflight workflow; got: ${result.reason}`
  );
});

await test("schemas/foo.schema.json with preflight marker → ok", () => {
  writePreflightMarker("schemas");
  const result = evaluateWriteGate({ filePath: join(root, "schemas/foo.schema.json"), root });
  assert.strictEqual(result.decision, "ok", `expected ok; got: ${JSON.stringify(result)}`);
});

// ── Cascade ordering: schemas/dist/foo.json must match `schemas`, NOT `build-artifacts` ──

await test("schemas/dist/foo.json without marker → matched by schemas rule, not build-artifacts", () => {
  const result = evaluateWriteGate({ filePath: join(root, "schemas/dist/foo.json"), root });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.surface, "schemas", `expected surface=schemas (preflight-delegating); got: ${JSON.stringify(result)}`);
  // The block must be the schemas preflight block — NOT the build-artifacts simple block.
  // `build-artifacts` has no surface; `schemas` returns surface="schemas".
  assert.ok(result.preflight_checklist, "schemas preflight must surface a checklist");
});

await test("schemas/dist/foo.json with marker → ok", () => {
  writePreflightMarker("schemas");
  const result = evaluateWriteGate({ filePath: join(root, "schemas/dist/foo.json"), root });
  assert.strictEqual(result.decision, "ok");
});

// ── Tool description + validator ──

await test("gate_mark_preflight tool description lists 'schemas' surface", () => {
  assert.ok(
    gateMarkPreflightTool.description.includes("schemas"),
    `tool description must mention schemas surface; got: ${gateMarkPreflightTool.description}`
  );
});

await test("gate_mark_preflight schema.surface description lists 'schemas'", () => {
  // z.enum has an internal values() array; check via the description string
  // since the underlying schema is not directly introspectable across zod versions.
  const schema = gateMarkPreflightTool.schema.surface;
  assert.ok(
    typeof schema.description === "string" && schema.description.includes("schemas"),
    `schema description must mention schemas; got: ${schema.description}`
  );
});

await test("gate_mark_preflight accepts surface='schemas' (z.enum validator)", async () => {
  // Use the actual MCP handler to verify the runtime accepts "schemas".
  const handlerResult = await gateMarkPreflightTool.handler({ surface: "schemas" });
  const parsed = JSON.parse(handlerResult.content[0].text);
  assert.strictEqual(parsed.marked, true);
  assert.strictEqual(parsed.surface, "schemas");
});

// ── happy path: other surfaces unaffected ──

await test("product/foo.ts without product marker → block, surface=product (unaffected)", () => {
  const result = evaluateWriteGate({ filePath: join(root, "product/foo.ts"), root });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.surface, "product");
});
