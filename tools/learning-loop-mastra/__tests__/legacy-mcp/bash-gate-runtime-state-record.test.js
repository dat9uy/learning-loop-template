import assert from "node:assert";
import { test } from "node:test";
import { matchConstraintPattern, makeGateDecision } from "../core/gate-logic.js";

// ─── matchConstraintPattern: runtime_state_record detection ───

await test("matchConstraintPattern: runtime_state_record(...) → side-effect-import", () => {
  const result = matchConstraintPattern("runtime_state_record({device: 'abc123'})");
  assert.strictEqual(result, "side-effect-import");
});

await test("matchConstraintPattern: runtime_state_record with spaces → side-effect-import", () => {
  const result = matchConstraintPattern("runtime_state_record( { device: 'abc123' } )");
  assert.strictEqual(result, "side-effect-import");
});

await test("matchConstraintPattern: node script calling runtime_state_record → null (pattern requires parens)", () => {
  // The pattern is `.*runtime_state_record\s*\(` which requires the `(` character.
  // A filename like `script-that-calls-runtime_state_record.js` does NOT match
  // because the pattern looks for the function call syntax `runtime_state_record(`.
  const result = matchConstraintPattern("node script-that-calls-runtime_state_record.js");
  assert.strictEqual(result, null);
});

await test("matchConstraintPattern: runtime_state_read → NOT side-effect-import", () => {
  // runtime_state_read is a different tool and should NOT match
  const result = matchConstraintPattern("runtime_state_read({device: 'abc123'})");
  assert.strictEqual(result, null);
});

await test("matchConstraintPattern: import vnstock_data → side-effect-import", () => {
  const result = matchConstraintPattern("import vnstock_data");
  assert.strictEqual(result, "side-effect-import");
});

await test("matchConstraintPattern: import vnstock (without _data) → vendor-api", () => {
  const result = matchConstraintPattern("import vnstock");
  assert.strictEqual(result, "vendor-api");
});

// ─── makeGateDecision: runtime_state_record always blocks (hard block) ───

await test("makeGateDecision: runtime_state_record without preflight → block (hard block)", () => {
  const result = makeGateDecision("side-effect-import", { found: false });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.hard_block, true);
  assert.strictEqual(result.constraint_type, "side-effect-import");
  assert.ok(result.reason.includes("runtime_state_record") || result.reason.includes("Importing vnstock_data"));
});

await test("makeGateDecision: runtime_state_record with preflight → still block (hard block, no override)", () => {
  // Even with an active observation, side-effect-import is a hard block
  const result = makeGateDecision("side-effect-import", { found: true, observation: { id: "obs-preflight-1" } });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.hard_block, true);
  assert.strictEqual(result.constraint_type, "side-effect-import");
});

await test("makeGateDecision: runtime_state_read (no match) → ok", () => {
  // runtime_state_read doesn't match any pattern, so no constraint
  const result = makeGateDecision(null, { found: false });
  assert.strictEqual(result.decision, "ok");
});

// ─── Edge cases ───

await test("matchConstraintPattern: runtime_state_record in quoted string → null (message flag)", () => {
  // Quoted strings should be skipped by the message flag logic
  const result = matchConstraintPattern('git commit -m "runtime_state_record test"');
  assert.strictEqual(result, null);
});

await test("matchConstraintPattern: runtime_state_record in bash -c wrapper → side-effect-import", () => {
  // Wrapper commands should still be checked
  const result = matchConstraintPattern('bash -c "runtime_state_record({})"');
  assert.strictEqual(result, "side-effect-import");
});
