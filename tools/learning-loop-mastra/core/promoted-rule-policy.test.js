// promoted-rule-policy.test.js — direct subject-level command/path policy tests.
//
// The stable Bash-gate and write-gate seam is the primary coverage for I3
// enforcement; these direct tests cover only the policy's subject-level contract:
// scope, ordering, overrides, safety, provenance, deferred inert telemetry, the
// heredoc kill-switch, and result shaping, isolated from the stable seams.

import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "vitest";
import { evaluateI3CommandPolicy, evaluateI3PathPolicy } from "./promoted-rule-policy.js";

function makeI3Rule(overrides = {}) {
  return {
    id: "rule-fixture",
    entry_kind: "rule",
    internalization_level: "I3",
    pattern_type: "regex",
    pattern: "vitest run",
    status: "active",
    created_at: "2026-08-13T00:00:00.000Z",
    ...overrides,
  };
}

let root;
let originalBlanker;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "promoted-rule-policy-"));
  originalBlanker = process.env.GATE_HEREDOC_BLANKER;
  delete process.env.GATE_HEREDOC_BLANKER;
});

afterEach(() => {
  if (originalBlanker === undefined) delete process.env.GATE_HEREDOC_BLANKER;
  else process.env.GATE_HEREDOC_BLANKER = originalBlanker;
});

test("command policy: regex match escalates with evaluator provenance", () => {
  const rules = [makeI3Rule({ id: "rule-no-raw-stdout-vitest", pattern: "(vitest run|pnpm test\\b).*\\| *(tail|head|grep)\\b" })];
  const result = evaluateI3CommandPolicy({ command: "vitest run | tail", root, i3Rules: rules });
  assert.strictEqual(result.decision, "escalate");
  assert.strictEqual(result.rule_id, "rule-no-raw-stdout-vitest");
  assert.strictEqual(result.meta_state_id, "rule-no-raw-stdout-vitest");
  assert.strictEqual(result.pattern_type, "regex");
  assert.strictEqual(result.event_source, "bash-gate-evaluator");
});

test("command policy: no match returns ok without telemetry", () => {
  const rules = [makeI3Rule({ id: "rule-a", pattern: "must-not-match-xyz" })];
  const result = evaluateI3CommandPolicy({ command: "echo hello", root, i3Rules: rules });
  assert.deepEqual(result, { decision: "ok" });
});

test("path policy: glob match escalates with glob provenance shape", () => {
  const rules = [makeI3Rule({ id: "rule-glob", pattern_type: "glob", pattern: "product/**" })];
  const result = evaluateI3PathPolicy({ filePath: "product/foo.txt", root, i3Rules: rules });
  assert.deepEqual(
    { decision: result.decision, rule_id: result.rule_id, meta_state_id: result.meta_state_id, pattern_type: result.pattern_type },
    { decision: "escalate", rule_id: "rule-glob", meta_state_id: "rule-glob", pattern_type: "glob" },
  );
});

test("path policy: first matching rule wins (ordering / precedence)", () => {
  const rules = [
    makeI3Rule({ id: "rule-first", pattern_type: "glob", pattern: "product/**", created_at: "2026-08-13T00:00:01.000Z" }),
    makeI3Rule({ id: "rule-second", pattern_type: "glob", pattern: "product/**", created_at: "2026-08-13T00:00:02.000Z" }),
  ];
  const result = evaluateI3PathPolicy({ filePath: "product/foo.txt", root, i3Rules: rules });
  assert.strictEqual(result.rule_id, "rule-first");
});

test("override: overridden rule is skipped and later rule can decide", () => {
  mkdirSync(join(root, ".claude", "coordination"), { recursive: true });
  writeFileSync(
    join(root, ".claude", "coordination", ".gate-override"),
    JSON.stringify({ rule_ids: ["rule-first"], ttl_seconds: 3600, created_at: new Date().toISOString() }),
    "utf8",
  );
  const rules = [
    makeI3Rule({ id: "rule-first", pattern_type: "glob", pattern: "product/**" }),
    makeI3Rule({ id: "rule-second", pattern_type: "glob", pattern: "product/**" }),
  ];
  const result = evaluateI3PathPolicy({ filePath: "product/foo.txt", root, i3Rules: rules });
  assert.strictEqual(result.rule_id, "rule-second");
});

test("unsafe regex warns and skips instead of escalating", () => {
  const rules = [makeI3Rule({ id: "rule-unsafe", pattern: "(a+)+" })];
  const result = evaluateI3CommandPolicy({ command: "a", root, i3Rules: rules });
  assert.deepEqual(result, { decision: "ok" });
});

test("glob outside the whitelist warns and skips", () => {
  const rules = [makeI3Rule({ id: "rule-outside", pattern_type: "glob", pattern: "../escape/**" })];
  const result = evaluateI3PathPolicy({ filePath: "anything", root, i3Rules: rules });
  assert.deepEqual(result, { decision: "ok" });
});

test("inactive and I2 rules are not enforced", () => {
  const rules = [
    makeI3Rule({ id: "rule-inactive", pattern: "exec", status: "inactive" }),
    makeI3Rule({ id: "rule-i2", internalization_level: "I2", pattern: "exec" }),
  ];
  const result = evaluateI3CommandPolicy({ command: "exec", root, i3Rules: rules });
  assert.deepEqual(result, { decision: "ok" });
});

test("agent-checklist and determinism-checklist rules are not command/path matched", () => {
  const rules = [makeI3Rule({ id: "rule-agent", pattern_type: "agent-checklist", pattern: "{}" })];
  const result = evaluateI3CommandPolicy({ command: "anything", root, i3Rules: rules });
  assert.deepEqual(result, { decision: "ok" });
});

test("scope predicate project_has_learning_loop_mcp includes only when .mcp.json present", () => {
  const rule = makeI3Rule({ id: "rule-scoped", pattern: "exec", scope_predicate: "project_has_learning_loop_mcp" });
  assert.deepEqual(evaluateI3CommandPolicy({ command: "exec", root, i3Rules: [rule] }), { decision: "ok" });

  writeFileSync(join(root, ".mcp.json"), JSON.stringify({ mcpServers: { "learning-loop": {} } }), "utf8");
  const result = evaluateI3CommandPolicy({ command: "exec", root, i3Rules: [rule] });
  assert.strictEqual(result.decision, "escalate");
  assert.strictEqual(result.rule_id, "rule-scoped");
});

test("deferred inert telemetry surfaces only when no real violation matched", () => {
  const rules = [makeI3Rule({ id: "rule-no-raw-stdout-vitest", pattern: "(vitest run|pnpm test\\b).*\\| *(tail|head|grep)\\b" })];
  const result = evaluateI3CommandPolicy({ command: "cat <<'EOF'\nvitest run foo.test.js | tail\nEOF\n", root, i3Rules: rules });
  assert.strictEqual(result.decision, "ok");
  assert.strictEqual(result.event, "unexpected-match");
  assert.strictEqual(result.match_origin, "inert-data");
  assert.strictEqual(result.candidate_kind, "unexpected-match");
});

test("real escalation wins over a deferred inert telemetry marker", () => {
  const rules = [
    makeI3Rule({ id: "rule-no-raw-stdout-vitest", pattern: "(vitest run|pnpm test\\b).*\\| *(tail|head|grep)\\b" }),
    makeI3Rule({ id: "rule-real", pattern: "vitest run", created_at: "2026-08-13T00:00:01.000Z" }),
  ];
  const result = evaluateI3CommandPolicy({ command: "cat <<'EOF'\nvitest run foo.test.js | tail\nEOF\n; vitest run", root, i3Rules: rules });
  assert.strictEqual(result.decision, "escalate");
  assert.strictEqual(result.rule_id, "rule-real");
});

test("heredoc kill-switch forces an un-blanked heredoc match to escalate", () => {
  process.env.GATE_HEREDOC_BLANKER = "0";
  const rules = [makeI3Rule({ id: "rule-heredoc", pattern: "cat <<EOF" })];
  const result = evaluateI3CommandPolicy({ command: "cat <<EOF\nvitest run\nEOF", root, i3Rules: rules });
  assert.strictEqual(result.decision, "escalate");
  assert.strictEqual(result.event_source, "bash-gate-evaluator");
});
