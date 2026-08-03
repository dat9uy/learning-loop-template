// RED→GREEN regression: the write-boundary gate must scan authored content for
// plan-ID/phase-number lineage, not just match paths. Before this scan, a
// banned token in a Write `content` or Edit `new_string` passed the gate
// undetected and only surfaced at the file-scan test / commit-msg hook.
//
// Closes finding `meta-260802T1425Z-the-write-boundary-gate-does-not-scan-authored-content-for-p`.

import { test, beforeEach, afterEach } from "vitest";
import assert from "node:assert";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { evaluateWriteGate, extractAuthoredContent } from "../core/evaluate-write-gate.js";
import { isScannableArtifactPath } from "../core/stable-artifacts-lineage.js";

let root;
const SCAN_PREFIX = "tools/learning-loop-mastra";

beforeEach(() => {
  root = join(tmpdir(), `lineage-gate-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(root, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function evaluate(rel, authoredContent) {
  return evaluateWriteGate({ filePath: join(root, rel), root, authoredContent });
}

// Banned lineage in authored content for a scannable production file → block.
await test("banned plan/phase token in authored content blocks the write", () => {
  const bad = [
    "// Plan 260711-0030 added this helper",
    "/* Phase 3 wires the marker file */",
    "// see plans/260711-0030-x for context",
    "// Phase B of the migration",
  ];
  for (const line of bad) {
    const result = evaluate(`${SCAN_PREFIX}/core/example.js`, `${line}\nexport const x = 1;\n`);
    assert.strictEqual(result.decision, "block", `expected block for: ${line}`);
    assert.strictEqual(result.matched_rule, "rule-no-plan-ids-in-stable-code-artifacts");
    assert.ok(result.reason.includes("line 1"), `reason must report the hit line; got: ${result.reason}`);
  }
});

// Clean authored content on a scannable path → no lineage block.
await test("clean authored content passes the lineage scan", () => {
  const result = evaluate(
    `${SCAN_PREFIX}/core/example.js`,
    "// This helper reads preflight markers.\nexport const x = 1;\n"
  );
  assert.notStrictEqual(result.decision, "block", `unexpected block: ${JSON.stringify(result)}`);
});

// Durable registry ids are masked before matching — a finding slug that embeds
// a plan date-stamp must not read as a lineage reference.
await test("durable registry ids are exempt from the lineage scan", () => {
  const content = "// Closes finding meta-260802T1425Z-the-write-boundary-gate.\nexport const x = 1;\n";
  const result = evaluate(`${SCAN_PREFIX}/core/example.js`, content);
  assert.notStrictEqual(result.decision, "block", `unexpected block: ${JSON.stringify(result)}`);
});

// Excluded paths (tests, docs, json, outside the scan root) are not scanned.
await test("excluded and out-of-scope paths skip the lineage scan", () => {
  const banned = "// Plan 260711-0030 Phase 3 fixture\n";
  const skipped = [
    `${SCAN_PREFIX}/__tests__/fixture.js`,
    `${SCAN_PREFIX}/core/example.test.js`,
    `${SCAN_PREFIX}/docs/notes.md`,
    `${SCAN_PREFIX}/core/data.json`,
    `docs/notes.js`, // outside the scan root entirely
  ];
  for (const rel of skipped) {
    const result = evaluate(rel, banned);
    assert.notStrictEqual(result.matched_rule, "rule-no-plan-ids-in-stable-code-artifacts",
      `path ${rel} must not be lineage-scanned; got: ${JSON.stringify(result)}`);
  }
});

// No authored content (pure path decisions, e.g. deletes) → scan is a no-op.
await test("missing or empty authored content skips the lineage scan", () => {
  for (const authoredContent of [undefined, null, ""]) {
    const result = evaluate(`${SCAN_PREFIX}/core/example.js`, authoredContent);
    assert.notStrictEqual(result.matched_rule, "rule-no-plan-ids-in-stable-code-artifacts");
  }
});

// Content extraction precedence: Write `content` > Edit `new_string` > `patch`.
await test("extractAuthoredContent resolves the tool-input content field", () => {
  assert.strictEqual(extractAuthoredContent(undefined), null);
  assert.strictEqual(extractAuthoredContent(null), null);
  assert.strictEqual(extractAuthoredContent({}), null);
  assert.strictEqual(extractAuthoredContent({ content: "a", new_string: "b" }), "a");
  assert.strictEqual(extractAuthoredContent({ new_string: "b", patch: "c" }), "b");
  assert.strictEqual(extractAuthoredContent({ patch: "c" }), "c");
});

// Scope predicate: the file-scan test and the gate must agree on what is scanned.
await test("isScannableArtifactPath matches the documented scope", () => {
  assert.ok(isScannableArtifactPath(`${SCAN_PREFIX}/core/x.js`));
  assert.ok(isScannableArtifactPath(`${SCAN_PREFIX}/hooks/universal/x.cjs`));
  assert.ok(isScannableArtifactPath(`${SCAN_PREFIX}/config/x.yaml`));
  assert.ok(!isScannableArtifactPath(`${SCAN_PREFIX}/__tests__/x.js`));
  assert.ok(!isScannableArtifactPath(`${SCAN_PREFIX}/deep/__tests__/x.js`));
  assert.ok(!isScannableArtifactPath(`${SCAN_PREFIX}/x.test.js`));
  assert.ok(!isScannableArtifactPath(`${SCAN_PREFIX}/x.md`));
  assert.ok(!isScannableArtifactPath(`${SCAN_PREFIX}/x.json`));
  assert.ok(!isScannableArtifactPath(`other-tree/x.js`));
  assert.ok(!isScannableArtifactPath(`${SCAN_PREFIX}/x.ts`));
});
