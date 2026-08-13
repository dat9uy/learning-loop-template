import assert from "node:assert";
import { test } from "vitest";
import { matchConstraintPattern, makeGateDecision } from "./command-constraint-policy.js";

// ─── matchConstraintPattern: runtime_state_record detection ───
//
// The `side-effect-import` pattern's second alternative is scoped to a PYTHON
// direct call form (`\b(?:python3(?:\.\d+)?|python2?)\s+.*runtime_state_record\s*\(`)
// — the original product-surface python tool that called `runtime_state_record`
// directly. It must NOT fire on the loop CLI's own `runtime_state_record` write
// tool or on the gate's remediation incantation, which embed the same name.

await test("matchConstraintPattern: bare runtime_state_record(...) → null (loop CLI write, not python)", () => {
  // The loop CLI runtime_state_record write tool is the sanctioned path. A bare
  // `runtime_state_record(...)` token (e.g. the gate-verb remediation incantation
  // or a quoted copy) is not a python direct call and must not hard-block.
  const result = matchConstraintPattern("runtime_state_record({device: 'abc123'})");
  assert.strictEqual(result, null);
});

await test("matchConstraintPattern: python runtime_state_record(...) → side-effect-import", () => {
  // Python-side direct call is the original intent of the second alternative.
  const result = matchConstraintPattern("python -c 'runtime_state_record({device: \"abc123\"})'");
  assert.strictEqual(result, "side-effect-import");
});

await test("matchConstraintPattern: python3 runtime_state_record with spaces → side-effect-import", () => {
  const result = matchConstraintPattern("python3 -c 'runtime_state_record( { device: \"abc123\" } )'");
  assert.strictEqual(result, "side-effect-import");
});

await test("matchConstraintPattern: node script calling runtime_state_record → null (pattern requires python verb)", () => {
  // A node script named with `runtime_state_record` has no python verb — the
  // second alternative requires `python[23]?` before the call. The first
  // alternative (`import\s+vnstock_data\b`) also does not match.
  const result = matchConstraintPattern("node script-that-calls-runtime_state_record.js");
  assert.strictEqual(result, null);
});

await test("matchConstraintPattern: runtime_state_read → NOT side-effect-import", () => {
  // runtime_state_read is a different tool and should NOT match
  const result = matchConstraintPattern("runtime_state_read({device: 'abc123'})");
  assert.strictEqual(result, null);
});

await test("matchConstraintPattern: loop CLI runtime_state_record write → null (sanctioned path)", () => {
  // The canonical loop CLI write form is data JSON — never a python call.
  const result = matchConstraintPattern(
    `node tools/learning-loop-mastra/bin/loop.mjs runtime_state_record '{"affected_system":"gate-verb:bash","kind":"budget-state","id":"gate-verb:bash"}'`,
  );
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

await test("matchConstraintPattern: runtime_state_record in bash -c wrapper (no python) → null", () => {
  // The second alternative requires a python verb before `runtime_state_record(`.
  // A bare `bash -c 'runtime_state_record({})'` has no python verb → no match.
  const result = matchConstraintPattern('bash -c "runtime_state_record({})"');
  assert.strictEqual(result, null);
});

await test("matchConstraintPattern: python inside bash -c wrapper → side-effect-import", () => {
  // A python direct call nested in a bash -c wrapper is still a real python call.
  const result = matchConstraintPattern('bash -c "python -c \'runtime_state_record({})\'"');
  assert.strictEqual(result, "side-effect-import");
});
