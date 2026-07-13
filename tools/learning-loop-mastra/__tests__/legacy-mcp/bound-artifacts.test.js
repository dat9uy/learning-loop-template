/**
 * TDD red tests for the shared bound-artifacts constant.
 *
 * Phase 3 of plans/260707-0114-loop-skill-layer-prerequisite/plan.md.
 *
 * Contract:
 *   - `core/bound-artifacts.js` exports BOUND_ARTIFACTS (a frozen array).
 *   - Each entry has { name, matchedRule, glob(s), reason }.
 *   - The 6 simple-glob rules exist: records, runtime-state, meta-state,
 *     file-index, schemas, build-artifacts.
 *   - The rule order is pinned (first-match-wins — relied on by
 *     evaluate-write-gate.js).
 *   - The constant has zero @mastra/* imports (FCIS preserved).
 *   - evaluate-write-gate.js imports BOUND_ARTIFACTS (the inline literals
 *     for the 6 simple rules are gone).
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

test("BOUND_ARTIFACTS is a frozen array covering the 6 simple-glob rules", async () => {
  const mod = await import("../../core/bound-artifacts.js");
  assert.ok(Array.isArray(mod.BOUND_ARTIFACTS), "BOUND_ARTIFACTS must be an array");
  assert.ok(Object.isFrozen(mod.BOUND_ARTIFACTS), "BOUND_ARTIFACTS must be frozen");
  const names = mod.BOUND_ARTIFACTS.map((r) => r.name);
  for (const required of [
    "records",
    "runtime-state",
    "meta-state",
    "file-index",
    "schemas",
    "build-artifacts",
  ]) {
    assert.ok(names.includes(required), `BOUND_ARTIFACTS must include "${required}"`);
  }
});

test("BOUND_ARTIFACTS rule order is pinned (first-match-wins)", async () => {
  const mod = await import("../../core/bound-artifacts.js");
  const expected = ["records", "runtime-state", "meta-state", "file-index", "schemas", "build-artifacts"];
  assert.deepStrictEqual(
    mod.BOUND_ARTIFACTS.map((r) => r.name),
    expected,
    `BOUND_ARTIFACTS order must be pinned: ${expected.join(", ")}`,
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

test("evaluate-write-gate.js no longer inlines the 6 simple-glob literals", () => {
  const src = readFileSync(WRITE_GATE_PATH, "utf8");
  // After the refactor, the simple-glob literals (records/**, runtime-state.jsonl,
  // meta-state.jsonl, file-index.jsonl, schemas/**) must NOT appear as a globMatch
  // first-argument. (The build-artifacts rule uses a complex match with ||-chained
  // globMatch calls — presence-checked separately below.)
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
