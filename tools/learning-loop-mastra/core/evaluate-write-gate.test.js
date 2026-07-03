/**
 * TDD red tests for evaluateWriteGate + evaluatePreflight.
 *
 * Signature contract (locked):
 *   evaluateWriteGate({ filePath, root }) → { decision, reason, file_path?, matched_rule?, surface?, preflight_checklist? }
 *   evaluatePreflight({ filePath, root }) → { decision: "ok" } | { decision: "block", reason, surface?, preflight_checklist? }
 *
 * Tests import from ./evaluate-write-gate.js (does not exist yet → ERR_MODULE_NOT_FOUND = intended TDD red).
 */

import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { evaluateWriteGate, evaluatePreflight } from "./evaluate-write-gate.js";
import { SURFACES } from "./surfaces.js";

// ── helpers ──

function makeRoot() {
  return mkdtempSync(join(tmpdir(), "eval-write-gate-test-"));
}

function writePreflightMarker(root, surface, coordDirName = ".claude") {
  const dir = join(root, coordDirName, "coordination");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `.loop-preflight-${surface}`),
    JSON.stringify({ surface, completed_at: new Date().toISOString() }),
  );
}

// ── write-gate cascade ──

test("records/** blocks with MCP reason", () => {
  const root = makeRoot();
  const result = evaluateWriteGate({ filePath: "records/meta/decisions/foo.json", root });
  assert.strictEqual(result.decision, "block");
  assert.ok(result.reason.includes("MCP tools"));
  assert.strictEqual(result.matched_rule, "records/**");
});

test("runtime-state.jsonl blocks", () => {
  const root = makeRoot();
  const result = evaluateWriteGate({ filePath: "runtime-state.jsonl", root });
  assert.strictEqual(result.decision, "block");
  assert.ok(result.reason.includes("runtime-state.jsonl"));
  assert.strictEqual(result.matched_rule, "runtime-state.jsonl");
});

test("meta-state.jsonl blocks", () => {
  const root = makeRoot();
  const result = evaluateWriteGate({ filePath: "meta-state.jsonl", root });
  assert.strictEqual(result.decision, "block");
  assert.ok(result.reason.includes("meta-state.jsonl"));
  assert.strictEqual(result.matched_rule, "meta-state.jsonl");
});

test("file-index.jsonl blocks (path-keyed fingerprint sidecar; F4)", () => {
  const root = makeRoot();
  const result = evaluateWriteGate({ filePath: "file-index.jsonl", root });
  assert.strictEqual(result.decision, "block");
  assert.ok(result.reason.includes("file-index.jsonl"));
  assert.strictEqual(result.matched_rule, "file-index.jsonl");
});

test("schemas/** blocks", () => {
  const root = makeRoot();
  const result = evaluateWriteGate({ filePath: "schemas/meta-state-entry.json", root });
  assert.strictEqual(result.decision, "block");
  assert.ok(result.reason.includes("Schema"));
  assert.strictEqual(result.matched_rule, "schemas/**");
});

test("node_modules/** blocks", () => {
  const root = makeRoot();
  const result = evaluateWriteGate({ filePath: "node_modules/foo/index.js", root });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.matched_rule, "**/node_modules/**");
});

test("dist/** blocks", () => {
  const root = makeRoot();
  const result = evaluateWriteGate({ filePath: "dist/bundle.js", root });
  assert.strictEqual(result.decision, "block");
});

test("build/** blocks", () => {
  const root = makeRoot();
  const result = evaluateWriteGate({ filePath: "build/output.js", root });
  assert.strictEqual(result.decision, "block");
});

test(".claude preflight marker blocks", () => {
  const root = makeRoot();
  const result = evaluateWriteGate({
    filePath: ".claude/coordination/.loop-preflight-product",
    root,
  });
  assert.strictEqual(result.decision, "block");
  assert.ok(result.reason.includes("mark_preflight_complete"));
});

test(".factory preflight marker blocks", () => {
  const root = makeRoot();
  const result = evaluateWriteGate({
    filePath: ".factory/coordination/.loop-preflight-product",
    root,
  });
  assert.strictEqual(result.decision, "block");
});

test("every surface's preflight marker blocks (derived from SURFACES)", () => {
  // The preflight-marker rule is derived from SURFACES. A direct write to any
  // surface's coordination/.loop-preflight-* must be blocked. Regression guard:
  // before the rule was derived, .mastracode/coordination/.loop-preflight-*
  // matched no rule and was allowed (a bypass of the "markers may only be
  // created via mark_preflight_complete" invariant).
  // (.forEach, not for-of, so this core/*.test.js file does not trip the
  // "no inline for-of-SURFACES loops" invariant that scans core/.)
  SURFACES.forEach((surface) => {
    const root = makeRoot();
    const result = evaluateWriteGate({
      filePath: `${surface}/coordination/.loop-preflight-product`,
      root,
    });
    assert.strictEqual(result.decision, "block", `direct write to ${surface} preflight marker must block`);
    assert.ok(
      result.matched_rule.includes(`${surface}/coordination/.loop-preflight-*`),
      `matched_rule for ${surface} should list its preflight glob: ${result.matched_rule}`,
    );
    assert.ok(result.reason.includes("mark_preflight_complete"), `reason for ${surface}`);
  });
});

// ── product/** preflight delegation ──

test("product/** with valid preflight marker → ok", () => {
  const root = makeRoot();
  writePreflightMarker(root, "product");
  const result = evaluateWriteGate({ filePath: "product/src/index.ts", root });
  assert.strictEqual(result.decision, "ok");
});

test("product/** with no marker → block + checklist", () => {
  const root = makeRoot();
  const result = evaluateWriteGate({ filePath: "product/src/index.ts", root });
  assert.strictEqual(result.decision, "block");
  assert.ok(result.reason.includes("Preflight"));
  assert.ok(result.surface);
  assert.ok(Array.isArray(result.preflight_checklist));
});

test("product/** with .factory marker → ok", () => {
  const root = makeRoot();
  writePreflightMarker(root, "product", ".factory");
  const result = evaluateWriteGate({ filePath: "product/app.ts", root });
  assert.strictEqual(result.decision, "ok");
});

// ── promoted rules ──

test("promoted rule matching file path → escalate", () => {
  const root = makeRoot();
  // Write a meta-state.jsonl with an active glob rule that matches "tools/forbidden/**"
  const rule = JSON.stringify({
    id: "rule-test-glob",
    entry_kind: "rule",
    origin: "meta-test-origin",
    status: "active",
    enforcement: "gate",
    pattern_type: "glob",
    pattern: "tools/forbidden/**",
    description: "Test rule blocking tools/forbidden/** paths",
    promoted_at: new Date().toISOString(),
    promoted_by: "test",
  });
  writeFileSync(join(root, "meta-state.jsonl"), rule + "\n");
  const result = evaluateWriteGate({ filePath: "tools/forbidden/secret.ts", root });
  assert.strictEqual(result.decision, "escalate");
  assert.strictEqual(result.rule_id, "rule-test-glob");
});

// ── safe paths → ok ──

test("plans/** → ok", () => {
  const root = makeRoot();
  const result = evaluateWriteGate({ filePath: "plans/260628-my-plan/plan.md", root });
  assert.strictEqual(result.decision, "ok");
});

test("docs/** → ok", () => {
  const root = makeRoot();
  const result = evaluateWriteGate({ filePath: "docs/architecture.md", root });
  assert.strictEqual(result.decision, "ok");
});

test("tools/** → ok", () => {
  const root = makeRoot();
  const result = evaluateWriteGate({ filePath: "tools/learning-loop-mastra/core/foo.js", root });
  assert.strictEqual(result.decision, "ok");
});

test(".claude/** (non-preflight) → ok", () => {
  const root = makeRoot();
  const result = evaluateWriteGate({ filePath: ".claude/settings.json", root });
  assert.strictEqual(result.decision, "ok");
});

// ── evaluatePreflight seam ──

test("evaluatePreflight with valid marker → ok", () => {
  const root = makeRoot();
  writePreflightMarker(root, "product");
  const result = evaluatePreflight({ filePath: "product/app.ts", root });
  assert.strictEqual(result.decision, "ok");
});

test("evaluatePreflight with no marker → block + checklist", () => {
  const root = makeRoot();
  const result = evaluatePreflight({ filePath: "product/app.ts", root });
  assert.strictEqual(result.decision, "block");
  assert.ok(Array.isArray(result.preflight_checklist));
  assert.ok(result.surface);
});

test("evaluatePreflight with stale marker (>30min) → block", () => {
  const root = makeRoot();
  const dir = join(root, ".claude", "coordination");
  mkdirSync(dir, { recursive: true });
  // Write a marker with completed_at 31 minutes ago
  const staleTime = new Date(Date.now() - 31 * 60 * 1000).toISOString();
  writeFileSync(
    join(dir, ".loop-preflight-product"),
    JSON.stringify({ surface: "product", completed_at: staleTime }),
  );
  const result = evaluatePreflight({ filePath: "product/app.ts", root });
  assert.strictEqual(result.decision, "block");
});

// ── edge cases ──

test("empty filePath → ok", () => {
  const root = makeRoot();
  const result = evaluateWriteGate({ filePath: "", root });
  assert.strictEqual(result.decision, "ok");
});

test("null filePath → ok", () => {
  const root = makeRoot();
  const result = evaluateWriteGate({ filePath: null, root });
  assert.strictEqual(result.decision, "ok");
});
