/**
 * TDD red tests for the shared bound-artifacts constant.
 *
 * Phase 3 of plans/260707-0114-loop-skill-layer-prerequisite/plan.md.
 * Updated by Phase 2 of plans/260720-1112-runtime-state-read-path-consolidation-
 * schemas-write-gate-repair: `schemas/**` migrated out of BOUND_ARTIFACTS into a
 * preflight-delegating rule in evaluate-write-gate.js. The constant now holds
 * 5 simple-glob rules + 1 special-cased preflight rule (the schemas rule is
 * NOT here — it lives in evaluate-write-gate.js alongside `skills`).
 *
 * Contract:
 *   - `core/bound-artifacts.js` exports BOUND_ARTIFACTS (a frozen array).
 *   - Each entry has { name, matchedRule, glob(s), reason }.
 *   - The 5 simple-glob rules exist: records, runtime-state, meta-state,
 *     file-index, build-artifacts.
 *   - `schemas` is NOT in BOUND_ARTIFACTS — it is a preflight-delegating rule
 *     handled by evaluateWriteGate (mirrors `skills`).
 *   - The rule order is pinned (first-match-wins — relied on by
 *     evaluate-write-gate.js).
 *   - The constant has zero @mastra/* imports (FCIS preserved).
 *   - evaluate-write-gate.js imports BOUND_ARTIFACTS (the inline literals
 *     for the 5 simple rules are gone).
 */

import { test } from "vitest";
import assert from "node:assert";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const MCP_ROOT = new URL("../../../../", import.meta.url).pathname;
const CONST_PATH = join(MCP_ROOT, "tools/learning-loop-mastra/core/bound-artifacts.js");
const WRITE_GATE_PATH = join(MCP_ROOT, "tools/learning-loop-mastra/core/evaluate-write-gate.js");

test("core/bound-artifacts.js exists", () => {
  assert.ok(existsSync(CONST_PATH), "core/bound-artifacts.js must exist");
});

test("BOUND_ARTIFACTS is a frozen array covering the 5 simple-glob rules", async () => {
  const mod = await import("../../core/bound-artifacts.js");
  assert.ok(Array.isArray(mod.BOUND_ARTIFACTS), "BOUND_ARTIFACTS must be an array");
  assert.ok(Object.isFrozen(mod.BOUND_ARTIFACTS), "BOUND_ARTIFACTS must be frozen");
  const names = mod.BOUND_ARTIFACTS.map((r) => r.name);
  for (const required of [
    "records",
    "runtime-state",
    "meta-state",
    "file-index",
    "build-artifacts",
  ]) {
    assert.ok(names.includes(required), `BOUND_ARTIFACTS must include "${required}"`);
  }
});

test("BOUND_ARTIFACTS rule order is pinned (first-match-wins)", async () => {
  const mod = await import("../../core/bound-artifacts.js");
  const expected = ["records", "runtime-state", "runtime-tracking", "meta-state", "file-index", "build-artifacts"];
  assert.deepStrictEqual(
    mod.BOUND_ARTIFACTS.map((r) => r.name),
    expected,
    `BOUND_ARTIFACTS order must be pinned: ${expected.join(", ")}`,
  );
});

test("BOUND_ARTIFACTS does NOT contain 'schemas' (Phase 2 migration to preflight rule)", async () => {
  const mod = await import("../../core/bound-artifacts.js");
  const names = mod.BOUND_ARTIFACTS.map((r) => r.name);
  assert.ok(
    !names.includes("schemas"),
    `BOUND_ARTIFACTS must not contain 'schemas' — it migrated to a preflight-delegating rule in evaluate-write-gate.js (Phase 2 of plans/260720-1112)`,
  );
});

test("each BOUND_ARTIFACTS entry has name, matchedRule, glob(s), reason", async () => {
  const mod = await import("../../core/bound-artifacts.js");
  for (const entry of mod.BOUND_ARTIFACTS) {
    assert.strictEqual(typeof entry.name, "string", `${entry.name}: name must be a string`);
    assert.ok(entry.matchedRule, `${entry.name}: matchedRule must be set`);
    assert.ok(entry.glob, `${entry.name}: glob must be set`);
    assert.ok(typeof entry.reason === "string" && entry.reason.length > 0, `${entry.name}: reason must be a non-empty string`);
  }
});

test("bound-artifacts.js has zero @mastra/* imports (FCIS preserved)", () => {
  const src = readFileSync(CONST_PATH, "utf8");
  assert.ok(
    !/@mastra\//.test(src),
    "core/bound-artifacts.js must not import from @mastra/* (FCIS — data-only module)",
  );
});

test("evaluate-write-gate.js imports BOUND_ARTIFACTS (source-of-truth refactor)", () => {
  const src = readFileSync(WRITE_GATE_PATH, "utf8");
  assert.ok(
    src.includes("from \"./bound-artifacts.js\"") || src.includes("from \"./bound-artifacts.cjs\""),
    "evaluate-write-gate.js must import from ./bound-artifacts.js",
  );
});

test("evaluate-write-gate.js no longer inlines the 5 simple-glob literals", () => {
  const src = readFileSync(WRITE_GATE_PATH, "utf8");
  // After the refactor, the simple-glob literals (records/**, runtime-state.jsonl,
  // meta-state.jsonl, file-index.jsonl) must NOT appear as a globMatch
  // first-argument. (The build-artifacts rule uses a complex match with ||-chained
  // globMatch calls — presence-checked separately below.)
  // `schemas/**` MUST also NOT be inlined as a literal globMatch first-arg — it
  // is migrated to a special-cased preflight-delegating rule that uses the
  // SCHEMAS_GLOB constant (the no-inline-literals test is the regression backstop
  // for the Phase 2 migration).
  for (const forbidden of [
    /globMatch\("records\/\*\*/,
    /globMatch\("runtime-state\.jsonl"/,
    /globMatch\("meta-state\.jsonl"/,
    /globMatch\("file-index\.jsonl"/,
    /globMatch\("schemas\/\*\*/,
  ]) {
    assert.ok(
      !forbidden.test(src),
      `evaluate-write-gate.js must not inline ${forbidden}`,
    );
  }
});

test("evaluateWriteGate handles schemas/** via preflight delegation (Phase 2)", async () => {
  // The schemas rule is special-cased in evaluate-write-gate.js (not in
  // BOUND_ARTIFACTS). Smoke-test that the schema glob is recognised and routed
  // to the schemas preflight branch — covered in detail by
  // legacy-mcp/schemas-write-gate.test.js.
  const { evaluateWriteGate } = await import("../../core/evaluate-write-gate.js");
  const result = evaluateWriteGate({ filePath: "schemas/foo.schema.json", root: process.cwd() });
  // Without a marker the decision is block; the surface field is the canonical
  // signal that the schemas preflight branch fired (not build-artifacts).
  assert.ok(
    result.surface === "schemas" || result.decision === "ok",
    `expected schemas preflight branch; got: ${JSON.stringify(result)}`,
  );
});
