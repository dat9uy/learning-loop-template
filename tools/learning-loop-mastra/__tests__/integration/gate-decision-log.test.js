import assert from "node:assert";
import { test, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, chmodSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { appendDecisionLog, readDecisionLog } from "../../core/gate-decision-log.js";
import { SURFACES } from "../../core/surfaces.js";

let root;

beforeEach(() => {
  root = join(tmpdir(), `gate-decision-log-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(root, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function surfaceLogPath(surface) {
  return join(root, surface, "coordination", ".gate-decision.log");
}

await test("appendDecisionLog appends one line per call to all surfaces", () => {
  for (let i = 0; i < 3; i++) {
    appendDecisionLog(root, {
      command_prefix: `cmd-${i}`,
      rule_id: `rule-${i}`,
      decision: "block",
      reason: "test",
      matched_pattern: null,
      skipped_via_override: false,
    });
  }

  for (const surface of SURFACES) {
    const path = surfaceLogPath(surface);
    assert.ok(existsSync(path), `expected ${path} to exist`);
    const lines = readFileSync(path, "utf8").trim().split("\n").filter(Boolean);
    assert.strictEqual(lines.length, 3);
    for (const line of lines) {
      const parsed = JSON.parse(line);
      assert.strictEqual(parsed.decision, "block");
    }
  }
});

await test("appendDecisionLog line schema: ts, command_prefix, rule_id, decision, reason, matched_pattern, skipped_via_override", () => {
  appendDecisionLog(root, {
    command_prefix: "node -e 'console.log(1)'",
    rule_id: "rule-no-new-artifact-types",
    decision: "escalate",
    reason: "Promoted rule matched",
    matched_pattern: "node -e",
    skipped_via_override: false,
  });

  const line = JSON.parse(readFileSync(surfaceLogPath(".claude"), "utf8").trim());
  assert.ok(typeof line.ts === "string" && !isNaN(new Date(line.ts).getTime()));
  assert.strictEqual(line.command_prefix, "node -e 'console.log(1)'");
  assert.strictEqual(line.rule_id, "rule-no-new-artifact-types");
  assert.strictEqual(line.decision, "escalate");
  assert.strictEqual(line.reason, "Promoted rule matched");
  assert.strictEqual(line.matched_pattern, "node -e");
  assert.strictEqual(line.skipped_via_override, false);
});

await test("appendDecisionLog fails open on write error", () => {
  appendDecisionLog(root, { command_prefix: "before", rule_id: "r", decision: "block", reason: "test", matched_pattern: null, skipped_via_override: false });
  const path = surfaceLogPath(".claude");
  chmodSync(path, 0o444);
  try {
    assert.doesNotThrow(() => {
      appendDecisionLog(root, { command_prefix: "after", rule_id: "r", decision: "block", reason: "test", matched_pattern: null, skipped_via_override: false });
    });
  } finally {
    chmodSync(path, 0o644);
  }
  // Original content on writable surface should still be present.
  const lines = readFileSync(path, "utf8").trim().split("\n").filter(Boolean);
  assert.strictEqual(lines.length, 1);
});

await test("appendDecisionLog concurrent calls do not corrupt the file", async () => {
  const entries = Array.from({ length: 10 }, (_, i) => ({
    command_prefix: `parallel-${i}`,
    rule_id: `rule-${i % 2}`,
    decision: "block",
    reason: "test",
    matched_pattern: null,
    skipped_via_override: false,
  }));

  await Promise.all(entries.map((e) => appendDecisionLog(root, e)));

  const path = surfaceLogPath(".claude");
  const raw = readFileSync(path, "utf8");
  const lines = raw.trim().split("\n").filter(Boolean);
  assert.strictEqual(lines.length, 10);
  for (const line of lines) {
    assert.ok(JSON.parse(line));
  }
});

await test("appendDecisionLog round-trips optional provenance fields (match_origin, candidate_kind, event_source)", () => {
  appendDecisionLog(root, {
    command_prefix: "cat <<'EOF'\nvitest run x | tail\nEOF\n",
    rule_id: "rule-no-raw-stdout-vitest",
    decision: "ok",
    reason: "inert-data match",
    matched_pattern: "tail",
    skipped_via_override: false,
    event_source: "bash-gate-evaluator",
    match_origin: "inert-data",
    candidate_kind: "unexpected-match",
  });

  const line = JSON.parse(readFileSync(surfaceLogPath(".claude"), "utf8").trim());
  assert.strictEqual(line.event_source, "bash-gate-evaluator");
  assert.strictEqual(line.match_origin, "inert-data");
  assert.strictEqual(line.candidate_kind, "unexpected-match");
  // Existing fields preserved.
  assert.strictEqual(line.rule_id, "rule-no-raw-stdout-vitest");
  assert.strictEqual(line.decision, "ok");
});

await test("appendDecisionLog old rows without provenance read back with absent optional fields (legacy compatibility)", () => {
  // Simulate a pre-provenance line: write the JSON directly, bypassing the
  // serializer, then confirm the reader does not drop or corrupt it.
  const legacy = {
    ts: new Date().toISOString(),
    command_prefix: "vitest run x | tail -10",
    rule_id: "rule-no-raw-stdout-vitest",
    decision: "escalate",
    reason: "Promoted rule matched",
    matched_pattern: "tail",
    skipped_via_override: false,
  };
  mkdirSync(join(root, ".claude", "coordination"), { recursive: true });
  writeFileSync(surfaceLogPath(".claude"), JSON.stringify(legacy) + "\n");

  const entries = readDecisionLog(root);
  assert.strictEqual(entries.length, 1);
  const entry = entries[0];
  assert.strictEqual(entry.rule_id, "rule-no-raw-stdout-vitest");
  // The optional provenance fields are absent, not null — callers must treat
  // missing as unclassified/telemetry-only.
  assert.ok(!("candidate_kind" in entry), "legacy row must not fabricate candidate_kind");
  assert.ok(!("event_source" in entry), "legacy row must not fabricate event_source");
});

await test("appendDecisionLog preserves newline hardening when provenance fields are supplied", () => {
  // Seed a baseline line so the append-count assertion is meaningful.
  appendDecisionLog(root, {
    command_prefix: "baseline",
    rule_id: "r",
    decision: "escalate",
    reason: "test",
    matched_pattern: null,
    skipped_via_override: false,
  });
  const before = readFileSync(surfaceLogPath(".claude"), "utf8").trim().split("\n").filter(Boolean).length;

  // A multi-line command_prefix must be flattened by oneLinePrefix even when
  // optional provenance fields are present. JSON escaping of string values
  // means a provenance field can never inject a raw line break; the hardening
  // boundary is the JSONL one-line invariant, so the append must be exactly
  // one line and the round-tripped command_prefix must carry no newline.
  appendDecisionLog(root, {
    command_prefix: "cat <<'EOF'\nvitest run x | tail\nEOF\n",
    rule_id: "rule-no-raw-stdout-vitest",
    decision: "escalate",
    reason: "Promoted rule matched",
    matched_pattern: "tail",
    skipped_via_override: false,
    event_source: "bash-gate-evaluator",
    match_origin: "inert-data",
    candidate_kind: "unexpected-match",
  });
  const after = readFileSync(surfaceLogPath(".claude"), "utf8").trim().split("\n").filter(Boolean).length;
  assert.strictEqual(after, before + 1, "a multi-line command must serialize as exactly one JSONL line");

  const last = JSON.parse(readFileSync(surfaceLogPath(".claude"), "utf8").trim().split("\n").filter(Boolean).at(-1));
  assert.ok(!/[\r\n]/.test(last.command_prefix), "command_prefix must be newline-flattened on read-back");
});

await test("readDecisionLog returns entries from all surfaces, deduped", () => {
  const ts = new Date().toISOString();
  const shared = { ts, command_prefix: "shared", rule_id: "rule-x", decision: "block", reason: "r", matched_pattern: null, skipped_via_override: false };
  const claudeOnly = { ts: new Date(Date.now() + 1).toISOString(), command_prefix: "claude-only", rule_id: "rule-y", decision: "block", reason: "r", matched_pattern: null, skipped_via_override: false };
  const hermesOnly = { ts: new Date(Date.now() + 2).toISOString(), command_prefix: "hermes-only", rule_id: "rule-z", decision: "block", reason: "r", matched_pattern: null, skipped_via_override: false };

  mkdirSync(join(root, ".claude", "coordination"), { recursive: true });
  mkdirSync(join(root, ".hermes", "coordination"), { recursive: true });
  writeFileSync(surfaceLogPath(".claude"), [JSON.stringify(shared), JSON.stringify(claudeOnly)].join("\n") + "\n");
  writeFileSync(surfaceLogPath(".hermes"), [JSON.stringify(shared), JSON.stringify(hermesOnly)].join("\n") + "\n");

  const entries = readDecisionLog(root, { since: new Date(Date.now() - 1000).toISOString() });
  assert.strictEqual(entries.length, 3);
  const prefixes = entries.map((e) => e.command_prefix).sort();
  assert.deepStrictEqual(prefixes, ["claude-only", "hermes-only", "shared"]);
});

await test("readDecisionLog filters by since", () => {
  const oldEntry = { ts: new Date(Date.now() - 60000).toISOString(), command_prefix: "old", rule_id: "r", decision: "block", reason: "r", matched_pattern: null, skipped_via_override: false };
  const newEntry = { ts: new Date().toISOString(), command_prefix: "new", rule_id: "r", decision: "block", reason: "r", matched_pattern: null, skipped_via_override: false };

  mkdirSync(join(root, ".claude", "coordination"), { recursive: true });
  writeFileSync(surfaceLogPath(".claude"), [JSON.stringify(oldEntry), JSON.stringify(newEntry)].join("\n") + "\n");

  const entries = readDecisionLog(root, { since: new Date(Date.now() - 30000).toISOString() });
  assert.strictEqual(entries.length, 1);
  assert.strictEqual(entries[0].command_prefix, "new");
});
