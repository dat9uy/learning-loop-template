import assert from "node:assert";
import { test, beforeEach, afterEach } from "node:test";
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

import { findRecurrentGroups, checkAndEmit } from "../../core/recurrence-tracker.js";
import { gateCheckRecurrenceTool } from "../../tools/legacy/gate-check-recurrence-tool.js";

let root;

beforeEach(() => {
  root = join(tmpdir(), `gate-recurrence-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(root, { recursive: true });
  process.env.GATE_ROOT = root;
});

afterEach(() => {
  delete process.env.GATE_ROOT;
  rmSync(root, { recursive: true, force: true });
});

function decisionLogPath(surface) {
  return join(root, surface, "coordination", ".gate-decision.log");
}

function writeEntries(entries) {
  const claudeLines = [];
  const factoryLines = [];
  for (let i = 0; i < entries.length; i++) {
    const line = JSON.stringify(entries[i]);
    if (i % 2 === 0) claudeLines.push(line);
    else factoryLines.push(line);
  }
  mkdirSync(join(root, ".claude", "coordination"), { recursive: true });
  mkdirSync(join(root, ".factory", "coordination"), { recursive: true });
  if (claudeLines.length) writeFileSync(decisionLogPath(".claude"), claudeLines.join("\n") + "\n");
  if (factoryLines.length) writeFileSync(decisionLogPath(".factory"), factoryLines.join("\n") + "\n");
}

function makeEntry(ts, prefix, ruleId = "rule-no-new-artifact-types") {
  return {
    ts: new Date(ts).toISOString(),
    command_prefix: prefix,
    rule_id: ruleId,
    decision: "escalate",
    reason: "Promoted rule matched",
    matched_pattern: "node -e",
    skipped_via_override: false,
  };
}

await test("findRecurrentGroups: 3 occurrences in 10min → 1 group", () => {
  const now = Date.now();
  const prefix = 'node -e "console.log(1)"';
  writeEntries([
    makeEntry(now - 5 * 60000, prefix),
    makeEntry(now - 3 * 60000, prefix),
    makeEntry(now - 1 * 60000, prefix),
  ]);
  const groups = findRecurrentGroups(root);
  assert.strictEqual(groups.length, 1);
  assert.strictEqual(groups[0].count, 3);
  assert.strictEqual(groups[0].rule_id, "rule-no-new-artifact-types");
});

await test("findRecurrentGroups: 2 occurrences → no group (below threshold)", () => {
  const now = Date.now();
  writeEntries([
    makeEntry(now - 5 * 60000, 'node -e "a"'),
    makeEntry(now - 3 * 60000, 'node -e "b"'),
  ]);
  const groups = findRecurrentGroups(root);
  assert.strictEqual(groups.length, 0);
});

await test("findRecurrentGroups: command_prefix_normalized groups similar commands", () => {
  const now = Date.now();
  writeEntries([
    makeEntry(now - 5 * 60000, 'node -e "echo foo"'),
    makeEntry(now - 3 * 60000, "node -e 'echo foo'"),
    makeEntry(now - 1 * 60000, "node -e  echo foo"),
  ]);
  const groups = findRecurrentGroups(root);
  assert.strictEqual(groups.length, 1);
  assert.strictEqual(groups[0].command_prefix_normalized, "node -e echo foo");
});

await test("findRecurrentGroups: cross-surface dedup", () => {
  const now = Date.now();
  const entries = [
    makeEntry(now - 5 * 60000, "a"),
    makeEntry(now - 3 * 60000, "a"),
    makeEntry(now - 1 * 60000, "a"),
  ];
  // Put all entries on both surfaces to exercise dedup.
  mkdirSync(join(root, ".claude", "coordination"), { recursive: true });
  mkdirSync(join(root, ".factory", "coordination"), { recursive: true });
  const lines = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
  writeFileSync(decisionLogPath(".claude"), lines);
  writeFileSync(decisionLogPath(".factory"), lines);
  const groups = findRecurrentGroups(root);
  assert.strictEqual(groups.length, 1);
  assert.strictEqual(groups[0].count, 3);
});

await test("checkAndEmit: emits finding when no existing", () => {
  const now = Date.now();
  const prefix = 'node -e "x"';
  writeEntries([
    makeEntry(now - 5 * 60000, prefix),
    makeEntry(now - 3 * 60000, prefix),
    makeEntry(now - 1 * 60000, prefix),
  ]);
  const result = checkAndEmit(root);
  assert.strictEqual(result.findings_emitted, 1);
  assert.strictEqual(result.checked_groups, 1);

  const registryPath = join(root, "meta-state.jsonl");
  assert.ok(existsSync(registryPath));
  const lines = readFileSync(registryPath, "utf8").trim().split("\n").filter(Boolean);
  assert.strictEqual(lines.length, 1);
  const finding = JSON.parse(lines[0]);
  assert.strictEqual(finding.entry_kind, "finding");
  assert.strictEqual(finding.subtype, "recurring-false-positive");
  assert.strictEqual(finding.category, "gate-logic-bug");
  assert.strictEqual(finding.severity, "warning");
  assert.strictEqual(finding.status, "reported");
  assert.ok(finding.recurrence_key);
});

await test("checkAndEmit: dedup against existing finding", () => {
  const now = Date.now();
  const prefix = 'node -e "x"';
  writeEntries([
    makeEntry(now - 5 * 60000, prefix),
    makeEntry(now - 3 * 60000, prefix),
    makeEntry(now - 1 * 60000, prefix),
  ]);

  const normalized = 'node -e x';
  const existingFinding = {
    id: "meta-test-existing",
    entry_kind: "finding",
    category: "gate-logic-bug",
    severity: "warning",
    affected_system: "gate-logic",
    subtype: "recurring-false-positive",
    recurrence_key: `rule-no-new-artifact-types::${normalized}`,
    description: "existing recurring false positive",
    status: "reported",
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };
  writeFileSync(join(root, "meta-state.jsonl"), JSON.stringify(existingFinding) + "\n");

  const result = checkAndEmit(root);
  assert.strictEqual(result.findings_emitted, 0);
  assert.strictEqual(result.checked_groups, 1);
});

await test("checkAndEmit: dry-run via env var", () => {
  const now = Date.now();
  writeEntries([
    makeEntry(now - 5 * 60000, "a"),
    makeEntry(now - 3 * 60000, "a"),
    makeEntry(now - 1 * 60000, "a"),
  ]);
  process.env.GATE_RECURSION_DRY_RUN = "1";
  try {
    const result = checkAndEmit(root);
    assert.strictEqual(result.findings_emitted, 0);
    assert.strictEqual(result.checked_groups, 1);
    assert.strictEqual(existsSync(join(root, "meta-state.jsonl")), false);
  } finally {
    delete process.env.GATE_RECURSION_DRY_RUN;
  }
});

await test("gate_check_recurrence tool returns result JSON", async () => {
  const now = Date.now();
  writeEntries([
    makeEntry(now - 5 * 60000, "a"),
    makeEntry(now - 3 * 60000, "a"),
    makeEntry(now - 1 * 60000, "a"),
  ]);
  const response = await gateCheckRecurrenceTool.handler({});
  const result = JSON.parse(response.content[0].text);
  assert.strictEqual(result.checked_groups, 1);
  assert.strictEqual(result.findings_emitted, 1);
});

await test("SessionStart hook runs checkAndEmit and exits 0", () => {
  const now = Date.now();
  writeEntries([
    makeEntry(now - 5 * 60000, "a"),
    makeEntry(now - 3 * 60000, "a"),
    makeEntry(now - 1 * 60000, "a"),
  ]);
  const wrapper = new URL("../../hooks/legacy/recurrence-check-on-start.js", import.meta.url).pathname;
  const result = spawnSync(process.execPath, [wrapper], {
    input: "{}",
    env: { ...process.env, GATE_ROOT: root },
    encoding: "utf8",
    timeout: 5000,
  });
  assert.ok(result.stderr.includes("recurrence-check"));
  assert.ok(existsSync(join(root, "meta-state.jsonl")));
});
