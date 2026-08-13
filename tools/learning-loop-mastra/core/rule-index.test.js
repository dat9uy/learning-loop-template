import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, statSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";
import { compileRuleIndex, readRuleIndex } from "./rule-index.js";

function makeRule(overrides = {}) {
  return {
    id: "rule-index-fixture",
    entry_kind: "rule",
    internalization_level: "I2",
    pattern_type: "agent-checklist",
    pattern: JSON.stringify({
      version: 1,
      items: [{ id: "check", description: "Check the fixture" }],
    }),
    description: "An authoritative Rule description for the index fixture.",
    status: "active",
    promoted_at: "2026-08-13T00:00:00.000Z",
    promoted_by: "test",
    version: 0,
    ...overrides,
  };
}

function makeI3Rule(overrides = {}) {
  return makeRule({
    id: "rule-index-i3-fixture",
    internalization_level: "I3",
    pattern_type: "regex",
    pattern: "fixture",
    evidence_code_ref: "evidence.js",
    ...overrides,
  });
}

test("compiled Rule index collapses history, excludes inactive latest versions, and partitions I2/I3", () => {
  const entries = [
    makeRule({ id: "rule-zeta", version: 0, created_at: "2026-08-13T00:00:01.000Z" }),
    makeI3Rule({ id: "rule-alpha", version: 0, created_at: "2026-08-13T00:00:02.000Z" }),
    makeRule({
      id: "rule-zeta",
      version: 1,
      created_at: "2026-08-13T00:00:03.000Z",
      description: "The latest authoritative description replaces the old version.",
    }),
    makeI3Rule({
      id: "rule-alpha",
      version: 1,
      created_at: "2026-08-13T00:00:04.000Z",
      status: "inactive",
    }),
  ];

  const index = compileRuleIndex(entries);

  assert.deepEqual(index.i2.map((rule) => rule.id), ["rule-zeta"]);
  assert.deepEqual(index.i3, []);
  assert.deepEqual(index.diagnostics, []);
  assert.equal(index.i2[0].version, 1);
  assert.equal(index.i2[0].description, "The latest authoritative description replaces the old version.");
});

test("compiled Rule index returns deterministic chronological order with id tie-break", () => {
  const entries = [
    makeRule({ id: "rule-zeta", created_at: "2026-08-13T00:00:02.000Z" }),
    makeRule({ id: "rule-alpha", created_at: "2026-08-13T00:00:01.000Z" }),
    makeRule({ id: "rule-beta", created_at: "2026-08-13T00:00:01.000Z" }),
  ];

  const index = compileRuleIndex(entries);

  assert.deepEqual(index.i2.map((rule) => rule.id), ["rule-alpha", "rule-beta", "rule-zeta"]);
});

test("compiled Rule index reports invalid Rules and excludes them from both projections", () => {
  const index = compileRuleIndex([
    makeRule({ id: "rule-valid" }),
    makeRule({ id: "rule-bad-description", description: "too short" }),
    makeI3Rule({ id: "rule-missing-evidence", evidence_code_ref: undefined }),
    makeRule({ id: "rule-bad-level", internalization_level: "I4" }),
    makeRule({ id: "rule-invalid-inactive", status: "inactive", description: "too short" }),
  ]);

  assert.deepEqual(index.i2.map((rule) => rule.id), ["rule-valid"]);
  assert.deepEqual(index.i3, []);
  assert.deepEqual(
    index.diagnostics.map(({ code, rule_id }) => ({ code, rule_id })),
    [
      { code: "invalid_rule", rule_id: "rule-bad-description" },
      { code: "invalid_rule", rule_id: "rule-missing-evidence" },
      { code: "invalid_rule", rule_id: "rule-bad-level" },
      { code: "invalid_rule", rule_id: "rule-invalid-inactive" },
    ],
  );
  assert.ok(index.diagnostics.every((diagnostic) => Array.isArray(diagnostic.issues)));
});

test("read Rule index validates that active I3 evidence resolves and skips unresolved Rules", () => {
  const root = mkdtempSync(join(tmpdir(), "rule-index-grounding-"));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "evidence.js"), "export const evidence = true;\n");
  writeFileSync(
    join(root, "meta-state.jsonl"),
    [
      JSON.stringify(makeI3Rule({ id: "rule-grounded", evidence_code_ref: "src/evidence.js" })),
      JSON.stringify(makeI3Rule({ id: "rule-missing", evidence_code_ref: "src/missing.js" })),
    ].join("\n") + "\n",
  );

  const index = readRuleIndex(root);

  assert.deepEqual(index.i3.map((rule) => rule.id), ["rule-grounded"]);
  assert.equal(index.diagnostics.length, 1);
  assert.equal(index.diagnostics[0].code, "grounding_unresolved");
  assert.equal(index.diagnostics[0].rule_id, "rule-missing");
  assert.equal(index.diagnostics[0].grounding.status, "drifted");
});

test("read Rule index keeps the canonical registry read fail-open for malformed sibling lines", () => {
  const root = mkdtempSync(join(tmpdir(), "rule-index-malformed-"));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "evidence.js"), "export const evidence = true;\n");
  writeFileSync(
    join(root, "meta-state.jsonl"),
    `${JSON.stringify(makeI3Rule({ id: "rule-valid", evidence_code_ref: "src/evidence.js" }))}\n{not-json}\n`,
  );

  const index = readRuleIndex(root);

  assert.deepEqual(index.i3.map((rule) => rule.id), ["rule-valid"]);
  assert.equal(index.diagnostics[0].code, "malformed_registry_line");
  assert.equal(index.diagnostics[0].line, 2);
});

test("read Rule index rechecks cached I3 grounding when evidence disappears", () => {
  const root = mkdtempSync(join(tmpdir(), "rule-index-cache-grounding-"));
  mkdirSync(join(root, "src"));
  const evidencePath = join(root, "src", "evidence.js");
  writeFileSync(evidencePath, "export const evidence = true;\n");
  writeFileSync(
    join(root, "meta-state.jsonl"),
    `${JSON.stringify(makeI3Rule({ id: "rule-cached-grounding", evidence_code_ref: "src/evidence.js" }))}\n`,
  );

  assert.deepEqual(readRuleIndex(root).i3.map((rule) => rule.id), ["rule-cached-grounding"]);
  unlinkSync(evidencePath);

  const index = readRuleIndex(root);

  assert.deepEqual(index.i3, []);
  assert.equal(index.diagnostics[0].code, "grounding_unresolved");
});

test("read Rule index rechecks cached grounding when evidence content changes", () => {
  const root = mkdtempSync(join(tmpdir(), "rule-index-cache-content-"));
  mkdirSync(join(root, "src"));
  const evidencePath = join(root, "src", "evidence.js");
  writeFileSync(evidencePath, "export const evidence = true;\n");
  writeFileSync(
    join(root, "meta-state.jsonl"),
    `${JSON.stringify(makeI3Rule({ id: "rule-cached-content", evidence_code_ref: "src/evidence.js" }))}\n`,
  );

  const first = readRuleIndex(root);
  const originalStat = statSync(evidencePath);
  writeFileSync(evidencePath, "export const evidence = false;\n");
  utimesSync(evidencePath, originalStat.atime, originalStat.mtime);

  const second = readRuleIndex(root);

  assert.notStrictEqual(second, first);
  assert.deepEqual(second.i3.map((rule) => rule.id), ["rule-cached-content"]);
});

test("read Rule index preserves containment failures instead of downgrading them to diagnostics", () => {
  const root = mkdtempSync(join(tmpdir(), "rule-index-containment-"));
  const outsideRoot = mkdtempSync(join(tmpdir(), "rule-index-outside-"));
  const outsideEvidence = join(outsideRoot, "evidence.js");
  writeFileSync(outsideEvidence, "export const evidence = true;\n");
  writeFileSync(
    join(root, "meta-state.jsonl"),
    `${JSON.stringify(makeI3Rule({ evidence_code_ref: outsideEvidence }))}\n`,
  );

  assert.throws(() => readRuleIndex(root), /PathContainmentError/);
});
