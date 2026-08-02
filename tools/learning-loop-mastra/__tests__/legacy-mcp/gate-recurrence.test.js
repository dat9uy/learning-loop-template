import assert from "node:assert";
import { test, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

import { findRecurrentGroups, checkAndEmit, hashRecurrenceKey } from "../../core/recurrence-tracker.js";
import { writeEntryIfAbsent } from "../../core/meta-state.js";
import { gateCheckRecurrenceTool } from "../../tools/handlers/gate-check-recurrence-tool.js";

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

function makeEntry(ts, prefix, ruleId = "rule-no-new-artifact-types", sessionId = "11111111-2222-3333-4444-555555555555", sessionTier = "real") {
  return {
    ts: new Date(ts).toISOString(),
    command_prefix: prefix,
    rule_id: ruleId,
    decision: "escalate",
    reason: "Promoted rule matched",
    matched_pattern: "node -e",
    skipped_via_override: false,
    session_id: sessionId,
    session_id_tier: sessionTier,
  };
}

await test("findRecurrentGroups: 3 occurrences in one session → 1 group", () => {
  const now = Date.now();
  const prefix = 'node -e "console.log(1)"';
  const sid = "11111111-2222-3333-4444-555555555555";
  writeEntries([
    makeEntry(now - 5 * 60000, prefix, "rule-no-new-artifact-types", sid),
    makeEntry(now - 3 * 60000, prefix, "rule-no-new-artifact-types", sid),
    makeEntry(now - 1 * 60000, prefix, "rule-no-new-artifact-types", sid),
  ]);
  const groups = findRecurrentGroups(root);
  assert.strictEqual(groups.length, 1);
  assert.strictEqual(groups[0].count, 3);
  assert.strictEqual(groups[0].rule_id, "rule-no-new-artifact-types");
});

await test("findRecurrentGroups: 2 occurrences → no group (below threshold)", () => {
  const now = Date.now();
  const sid = "11111111-2222-3333-4444-555555555555";
  writeEntries([
    makeEntry(now - 5 * 60000, 'node -e "a"', "rule-no-new-artifact-types", sid),
    makeEntry(now - 3 * 60000, 'node -e "b"', "rule-no-new-artifact-types", sid),
  ]);
  const groups = findRecurrentGroups(root);
  assert.strictEqual(groups.length, 0);
});

await test("findRecurrentGroups: command_prefix_normalized groups similar commands", () => {
  const now = Date.now();
  const sid = "11111111-2222-3333-4444-555555555555";
  writeEntries([
    makeEntry(now - 5 * 60000, 'node -e "echo foo"', "rule-no-new-artifact-types", sid),
    makeEntry(now - 3 * 60000, "node -e 'echo foo'", "rule-no-new-artifact-types", sid),
    makeEntry(now - 1 * 60000, "node -e  echo foo", "rule-no-new-artifact-types", sid),
  ]);
  const groups = findRecurrentGroups(root);
  assert.strictEqual(groups.length, 1);
  assert.strictEqual(groups[0].command_prefix_normalized, "node -e echo foo");
});

await test("findRecurrentGroups: cross-surface dedup", () => {
  const now = Date.now();
  const sid = "11111111-2222-3333-4444-555555555555";
  const entries = [
    makeEntry(now - 5 * 60000, "a", "rule-no-new-artifact-types", sid),
    makeEntry(now - 3 * 60000, "a", "rule-no-new-artifact-types", sid),
    makeEntry(now - 1 * 60000, "a", "rule-no-new-artifact-types", sid),
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

await test("findRecurrentGroups: burst from prior session (aged >10min) is detected", () => {
  // The original bug: time-axis only kept entries within 10 min. A burst from
  // a prior session (any age) was silently dropped. Phase 1 replaces the
  // time-axis with session-axis + full-log scan.
  const now = Date.now();
  const oldSid = "aaaaaaaa-1111-2222-3333-444444444444";
  const prefix = "old-burst-pattern";
  // 3 entries spaced 1 day apart — way outside the old 10-min window.
  writeEntries([
    makeEntry(now - 3 * 24 * 60 * 60000, prefix, "rule-no-new-artifact-types", oldSid),
    makeEntry(now - 2 * 24 * 60 * 60000, prefix, "rule-no-new-artifact-types", oldSid),
    makeEntry(now - 1 * 24 * 60 * 60000, prefix, "rule-no-new-artifact-types", oldSid),
  ]);
  const groups = findRecurrentGroups(root);
  assert.strictEqual(groups.length, 1, "aged burst from prior session must be detected");
  assert.strictEqual(groups[0].session_id, oldSid);
});

await test("findRecurrentGroups: no-session entries never fire (clean cutover)", () => {
  const now = Date.now();
  const prefix = "old-no-session-pattern";
  // 46 historical entries with no session_id — the real backlog shape.
  const entries = [];
  for (let i = 0; i < 46; i++) {
    entries.push({
      ts: new Date(now - i * 60 * 60000).toISOString(),
      command_prefix: prefix,
      rule_id: "rule-no-new-artifact-types",
      decision: "escalate",
      reason: "Promoted rule matched",
      matched_pattern: "node -e",
      skipped_via_override: false,
      // no session_id — historical shape
    });
  }
  writeEntries(entries);
  const groups = findRecurrentGroups(root);
  assert.strictEqual(groups.length, 0, "no-session backlog must NOT fire");
});

await test("findRecurrentGroups: fallback-tier group spanning >24h does not fire", () => {
  const now = Date.now();
  const prefix = "fallback-span";
  const fallbackSid = "deadbeef-cafe";
  writeEntries([
    makeEntry(now - 5 * 24 * 60 * 60000, prefix, "rule-no-new-artifact-types", fallbackSid, "fallback"),
    makeEntry(now - 3 * 24 * 60 * 60000, prefix, "rule-no-new-artifact-types", fallbackSid, "fallback"),
    makeEntry(now - 1 * 24 * 60 * 60000, prefix, "rule-no-new-artifact-types", fallbackSid, "fallback"),
  ]);
  const groups = findRecurrentGroups(root);
  assert.strictEqual(groups.length, 0, "fallback-tier >24h span must not fire");
});

await test("findRecurrentGroups: fallback-tier group spanning <=24h fires", () => {
  const now = Date.now();
  const prefix = "fallback-tight";
  const fallbackSid = "beefdead-cafe";
  writeEntries([
    makeEntry(now - 23 * 60 * 60000, prefix, "rule-no-new-artifact-types", fallbackSid, "fallback"),
    makeEntry(now - 12 * 60 * 60000, prefix, "rule-no-new-artifact-types", fallbackSid, "fallback"),
    makeEntry(now - 1 * 60 * 60000, prefix, "rule-no-new-artifact-types", fallbackSid, "fallback"),
  ]);
  const groups = findRecurrentGroups(root);
  assert.strictEqual(groups.length, 1, "fallback-tier <=24h span fires");
});

await test("findRecurrentGroups: prefix containing `::` groups correctly", () => {
  const now = Date.now();
  const sid = "11111111-2222-3333-4444-555555555555";
  // The prefix happens to contain "::" — verify it doesn't corrupt the
  // session-key split (grouping uses fields, not joined-string split).
  const prefix = "kubectl exec -- /bin/sh -c 'a::b'";
  writeEntries([
    makeEntry(now - 5 * 60000, prefix, "rule-no-new-artifact-types", sid),
    makeEntry(now - 3 * 60000, prefix, "rule-no-new-artifact-types", sid),
    makeEntry(now - 1 * 60000, prefix, "rule-no-new-artifact-types", sid),
  ]);
  const groups = findRecurrentGroups(root);
  assert.strictEqual(groups.length, 1);
  assert.strictEqual(groups[0].command_prefix_normalized, prefix.replace(/['"]/g, "").replace(/\s+/g, " ").trim());
});

await test("findRecurrentGroups: rule_id:null entries skipped", () => {
  const now = Date.now();
  const sid = "11111111-2222-3333-4444-555555555555";
  const entries = [];
  for (let i = 0; i < 5; i++) {
    entries.push({
      ts: new Date(now - i * 60000).toISOString(),
      command_prefix: "docker",
      rule_id: null,
      decision: "escalate",
      reason: "constraint matched",
      matched_pattern: null,
      skipped_via_override: false,
      session_id: sid,
      session_id_tier: "real",
    });
  }
  writeEntries(entries);
  const groups = findRecurrentGroups(root);
  assert.strictEqual(groups.length, 0);
});

await test("findRecurrentGroups: distinct session_ids stay distinct under cross-surface dedupe", () => {
  // 3 distinct sessions, each crossing threshold (3 entries spaced 1ms apart)
  // for the same prefix. Without session_id in the dedupe key, the three
  // sessions' ts-clusters would dedupe-merge on the same-ms branch when they
  // share a millisecond; with session_id in the key, the three sessions
  // remain independent groups.
  const baseMs = Date.now();
  const sids = [
    "11111111-2222-3333-4444-555555555555",
    "22222222-3333-4444-5555-666666666666",
    "33333333-4444-5555-6666-777777777777",
  ];
  const entries = [];
  for (const sid of sids) {
    for (let i = 0; i < 3; i++) {
      entries.push({
        ts: new Date(baseMs + i).toISOString(),
        command_prefix: "x",
        rule_id: "rule-no-new-artifact-types",
        decision: "escalate",
        reason: "x",
        matched_pattern: "node -e",
        skipped_via_override: false,
        session_id: sid,
        session_id_tier: "real",
      });
    }
  }
  // Put them on the SAME surface.
  mkdirSync(join(root, ".claude", "coordination"), { recursive: true });
  const lines = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
  writeFileSync(decisionLogPath(".claude"), lines);
  const groups = findRecurrentGroups(root);
  assert.strictEqual(groups.length, 3, "distinct session_ids must produce distinct groups");
});

await test("hashRecurrenceKey: same prefix under different rules → different hashes", () => {
  const a = hashRecurrenceKey("rule-a", "node -e x");
  const b = hashRecurrenceKey("rule-b", "node -e x");
  assert.notStrictEqual(a, b, "rule_id must be mixed into the hash input");
  assert.strictEqual(a.length, 16);
});

await test("hashRecurrenceKey: stable across calls", () => {
  const a = hashRecurrenceKey("rule-x", "node -e x");
  const b = hashRecurrenceKey("rule-x", "node -e x");
  assert.strictEqual(a, b);
});

await test("checkAndEmit: emits finding when no existing", async () => {
  const now = Date.now();
  const sid = "11111111-2222-3333-4444-555555555555";
  const prefix = 'node -e "x"';
  writeEntries([
    makeEntry(now - 5 * 60000, prefix, "rule-no-new-artifact-types", sid),
    makeEntry(now - 3 * 60000, prefix, "rule-no-new-artifact-types", sid),
    makeEntry(now - 1 * 60000, prefix, "rule-no-new-artifact-types", sid),
  ]);
  const result = await checkAndEmit(root);
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
  assert.strictEqual(finding.status, "open");
  // Phase 1: recurrence_key is rule_id::sha256(rule_id::prefix)[:16]
  const expectedHash = hashRecurrenceKey("rule-no-new-artifact-types", "node -e x");
  assert.strictEqual(finding.recurrence_key, `rule-no-new-artifact-types::${expectedHash}`);
  assert.ok(!finding.recurrence_key.includes("node -e"), "raw prefix must NOT appear in recurrence_key");
});

await test("checkAndEmit: same prefix across two sessions → one finding (in-call dedup)", async () => {
  const now = Date.now();
  const sidA = "11111111-2222-3333-4444-555555555555";
  const sidB = "22222222-3333-4444-5555-666666666666";
  const prefix = "shared-prefix";
  writeEntries([
    makeEntry(now - 50 * 60000, prefix, "rule-no-new-artifact-types", sidA),
    makeEntry(now - 49 * 60000, prefix, "rule-no-new-artifact-types", sidA),
    makeEntry(now - 48 * 60000, prefix, "rule-no-new-artifact-types", sidA),
    makeEntry(now - 5 * 60000, prefix, "rule-no-new-artifact-types", sidB),
    makeEntry(now - 4 * 60000, prefix, "rule-no-new-artifact-types", sidB),
    makeEntry(now - 3 * 60000, prefix, "rule-no-new-artifact-types", sidB),
  ]);
  const result = await checkAndEmit(root);
  assert.strictEqual(result.findings_emitted, 1, "two sessions crossing threshold for the same prefix → one finding");

  const lines = readFileSync(join(root, "meta-state.jsonl"), "utf8").trim().split("\n").filter(Boolean);
  assert.strictEqual(lines.length, 1);
});

await test("checkAndEmit: dedup against existing finding", async () => {
  const now = Date.now();
  const sid = "11111111-2222-3333-4444-555555555555";
  const prefix = 'node -e "x"';
  writeEntries([
    makeEntry(now - 5 * 60000, prefix, "rule-no-new-artifact-types", sid),
    makeEntry(now - 3 * 60000, prefix, "rule-no-new-artifact-types", sid),
    makeEntry(now - 1 * 60000, prefix, "rule-no-new-artifact-types", sid),
  ]);

  const normalized = "node -e x";
  const existingHash = hashRecurrenceKey("rule-no-new-artifact-types", normalized);
  const existingFinding = {
    id: "meta-test-existing",
    entry_kind: "finding",
    category: "gate-logic-bug",
    severity: "warning",
    affected_system: "gate-logic",
    subtype: "recurring-false-positive",
    recurrence_key: `rule-no-new-artifact-types::${existingHash}`,
    description: "existing recurring false positive",
    status: "open",
    created_at: new Date().toISOString(),
  };
  writeFileSync(join(root, "meta-state.jsonl"), JSON.stringify(existingFinding) + "\n");

  const result = await checkAndEmit(root);
  assert.strictEqual(result.findings_emitted, 0);
  assert.strictEqual(result.checked_groups, 1);
});

await test("checkAndEmit: accepted existing finding → suppresses", async () => {
  const now = Date.now();
  const sid = "11111111-2222-3333-4444-555555555555";
  const prefix = "accepted-prefix";
  writeEntries([
    makeEntry(now - 5 * 60000, prefix, "rule-no-new-artifact-types", sid),
    makeEntry(now - 3 * 60000, prefix, "rule-no-new-artifact-types", sid),
    makeEntry(now - 1 * 60000, prefix, "rule-no-new-artifact-types", sid),
  ]);
  const existingHash = hashRecurrenceKey("rule-no-new-artifact-types", prefix);
  writeFileSync(
    join(root, "meta-state.jsonl"),
    JSON.stringify({
      id: "meta-test-accepted",
      entry_kind: "finding",
      subtype: "recurring-false-positive",
      recurrence_key: `rule-no-new-artifact-types::${existingHash}`,
      status: "accepted",
      created_at: new Date().toISOString(),
    }) + "\n"
  );
  const result = await checkAndEmit(root);
  assert.strictEqual(result.findings_emitted, 0, "accepted status must suppress re-filing");
});

await test("checkAndEmit: resolved existing finding → suppresses", async () => {
  const now = Date.now();
  const sid = "11111111-2222-3333-4444-555555555555";
  const prefix = "resolved-prefix";
  writeEntries([
    makeEntry(now - 5 * 60000, prefix, "rule-no-new-artifact-types", sid),
    makeEntry(now - 3 * 60000, prefix, "rule-no-new-artifact-types", sid),
    makeEntry(now - 1 * 60000, prefix, "rule-no-new-artifact-types", sid),
  ]);
  const existingHash = hashRecurrenceKey("rule-no-new-artifact-types", prefix);
  writeFileSync(
    join(root, "meta-state.jsonl"),
    JSON.stringify({
      id: "meta-test-resolved",
      entry_kind: "finding",
      subtype: "recurring-false-positive",
      recurrence_key: `rule-no-new-artifact-types::${existingHash}`,
      status: "resolved",
      created_at: new Date().toISOString(),
    }) + "\n"
  );
  const result = await checkAndEmit(root);
  assert.strictEqual(result.findings_emitted, 0, "resolved status must suppress re-filing");
});

await test("checkAndEmit: archived existing finding → does NOT suppress → re-files", async () => {
  const now = Date.now();
  const sid = "11111111-2222-3333-4444-555555555555";
  const prefix = "archived-prefix";
  writeEntries([
    makeEntry(now - 5 * 60000, prefix, "rule-no-new-artifact-types", sid),
    makeEntry(now - 3 * 60000, prefix, "rule-no-new-artifact-types", sid),
    makeEntry(now - 1 * 60000, prefix, "rule-no-new-artifact-types", sid),
  ]);
  const existingHash = hashRecurrenceKey("rule-no-new-artifact-types", prefix);
  writeFileSync(
    join(root, "meta-state.jsonl"),
    JSON.stringify({
      id: "meta-test-archived",
      entry_kind: "finding",
      subtype: "recurring-false-positive",
      recurrence_key: `rule-no-new-artifact-types::${existingHash}`,
      status: "archived",
      created_at: new Date().toISOString(),
    }) + "\n"
  );
  const result = await checkAndEmit(root);
  assert.strictEqual(result.findings_emitted, 1, "archived status must re-admit — finding filed");
});

await test("checkAndEmit: suppression emits stderr diagnostic", async () => {
  const now = Date.now();
  const sid = "11111111-2222-3333-4444-555555555555";
  const prefix = "diagnostic-prefix";
  writeEntries([
    makeEntry(now - 5 * 60000, prefix, "rule-no-new-artifact-types", sid),
    makeEntry(now - 3 * 60000, prefix, "rule-no-new-artifact-types", sid),
    makeEntry(now - 1 * 60000, prefix, "rule-no-new-artifact-types", sid),
  ]);
  const existingHash = hashRecurrenceKey("rule-no-new-artifact-types", prefix);
  writeFileSync(
    join(root, "meta-state.jsonl"),
    JSON.stringify({
      id: "meta-test-suppress-marker",
      entry_kind: "finding",
      subtype: "recurring-false-positive",
      recurrence_key: `rule-no-new-artifact-types::${existingHash}`,
      status: "accepted",
      created_at: new Date().toISOString(),
    }) + "\n"
  );
  // Capture stderr.
  const originalErr = console.error;
  const captured = [];
  console.error = (...args) => captured.push(args.join(" "));
  try {
    await checkAndEmit(root);
  } finally {
    console.error = originalErr;
  }
  const line = captured.find((l) => l.includes("recurrence-check: suppressed") && l.includes("meta-test-suppress-marker"));
  assert.ok(line, "stderr diagnostic must include the suppressing finding id + the key");
  assert.ok(line.includes(existingHash), "stderr diagnostic must include the hashed key");
});

await test("checkAndEmit: a duplicate write is dedup-suppressed on the next session", async () => {
  // Simulates the cross-process race window: two SessionStart processes
  // both pass the unlocked pre-filter and both call writeEntry. The first
  // call lands; the second call lands too (a duplicate). The NEXT
  // checkAndEmit run dedupes against the now-present existing finding via
  // the permanent-for-non-archived filter — self-healing on the next
  // session, with a stderr diagnostic on the suppressing line.
  const now = Date.now();
  const sid = "11111111-2222-3333-4444-555555555555";
  const prefix = "race-prefix";
  writeEntries([
    makeEntry(now - 5 * 60000, prefix, "rule-no-new-artifact-types", sid),
    makeEntry(now - 3 * 60000, prefix, "rule-no-new-artifact-types", sid),
    makeEntry(now - 1 * 60000, prefix, "rule-no-new-artifact-types", sid),
  ]);
  // First run: emits 1 finding.
  const first = await checkAndEmit(root);
  assert.strictEqual(first.findings_emitted, 1);
  // Second run: pre-filter catches the now-present existing finding → 0 emitted,
  // but a stderr diagnostic line is logged for the suppressed key.
  const captured = [];
  const originalErr = console.error;
  console.error = (...args) => captured.push(args.join(" "));
  try {
    const second = await checkAndEmit(root);
    assert.strictEqual(second.findings_emitted, 0, "second run must dedup-suppress");
  } finally {
    console.error = originalErr;
  }
  assert.ok(captured.some((l) => l.includes("recurrence-check: suppressed")), "stderr suppression diagnostic must fire");
  // Exactly one finding on disk — the second run deduped the duplicate.
  const lines = readFileSync(join(root, "meta-state.jsonl"), "utf8").trim().split("\n").filter(Boolean);
  const findingLines = lines.map((l) => JSON.parse(l)).filter((e) => e.entry_kind === "finding");
  assert.strictEqual(findingLines.length, 1, "exactly one finding line on disk after self-heal");
});

await test("checkAndEmit: 6 parallel Promise.all calls within one process serialize on writeEntryIfAbsent → exactly one finding", async () => {
  // Single-process serialized race: 6 parallel checkAndEmit calls. The
  // writeEntryIfAbsent path holds withRegistryLock + enqueue, so within a
  // process the calls serialize; only the first wins per recurrence_key,
  // the others see the locked-re-check suppression and return
  // { written: false, suppressed_by }.
  const now = Date.now();
  const sid = "11111111-2222-3333-4444-555555555555";
  const prefix = "parallel-prefix";
  writeEntries([
    makeEntry(now - 5 * 60000, prefix, "rule-no-new-artifact-types", sid),
    makeEntry(now - 3 * 60000, prefix, "rule-no-new-artifact-types", sid),
    makeEntry(now - 1 * 60000, prefix, "rule-no-new-artifact-types", sid),
  ]);
  const results = await Promise.all(
    Array.from({ length: 6 }, () => checkAndEmit(root)),
  );
  const total = results.reduce((s, r) => s + (r.findings_emitted ?? 0), 0);
  assert.strictEqual(total, 1, "6 parallel calls must produce exactly one finding");

  const lines = readFileSync(join(root, "meta-state.jsonl"), "utf8").trim().split("\n").filter(Boolean);
  const findingLines = lines.map((l) => JSON.parse(l)).filter((e) => e.entry_kind === "finding");
  assert.strictEqual(findingLines.length, 1, "exactly one finding line on disk");
});

await test("checkAndEmit: dry-run via env var", async () => {
  const now = Date.now();
  const sid = "11111111-2222-3333-4444-555555555555";
  writeEntries([
    makeEntry(now - 5 * 60000, "a", "rule-no-new-artifact-types", sid),
    makeEntry(now - 3 * 60000, "a", "rule-no-new-artifact-types", sid),
    makeEntry(now - 1 * 60000, "a", "rule-no-new-artifact-types", sid),
  ]);
  process.env.GATE_RECURSION_DRY_RUN = "1";
  try {
    const result = await checkAndEmit(root);
    assert.strictEqual(result.findings_emitted, 0);
    assert.strictEqual(result.checked_groups, 1);
    assert.strictEqual(existsSync(join(root, "meta-state.jsonl")), false);
  } finally {
    delete process.env.GATE_RECURSION_DRY_RUN;
  }
});

await test("checkAndEmit: secret-shaped prefix → hashed recurrence_key, no raw prefix in finding JSON", async () => {
  const now = Date.now();
  const sid = "11111111-2222-3333-4444-555555555555";
  const secretPrefix = "curl https://api.example.com?token=eyJhbGciOiJIUzI1NiJ9";
  writeEntries([
    makeEntry(now - 5 * 60000, secretPrefix, "rule-no-new-artifact-types", sid),
    makeEntry(now - 3 * 60000, secretPrefix, "rule-no-new-artifact-types", sid),
    makeEntry(now - 1 * 60000, secretPrefix, "rule-no-new-artifact-types", sid),
  ]);
  const result = await checkAndEmit(root);
  assert.strictEqual(result.findings_emitted, 1);

  const lines = readFileSync(join(root, "meta-state.jsonl"), "utf8").trim().split("\n").filter(Boolean);
  assert.strictEqual(lines.length, 1);
  const findingJson = lines[0];
  // Whole-finding grep: no raw secret fragment.
  assert.ok(!findingJson.includes("eyJhbGciOiJIUzI1NiJ9"), "raw token must NOT appear in finding JSON");
  assert.ok(!findingJson.includes("api.example.com"), "raw URL host must NOT appear in finding JSON");
  assert.ok(!findingJson.includes("token="), "raw `token=` fragment must NOT appear in finding JSON");
  // Also: id contains no prefix fragment (it's hash-derived).
  const finding = JSON.parse(findingJson);
  assert.ok(!finding.id.includes("curl"), "id must not contain `curl`");
  assert.ok(!finding.id.includes("eyJ"), "id must not contain token fragment");
  // description has no sample_commands / durationMin / raw URL.
  assert.ok(!finding.description.includes("curl"), "description must not contain the raw prefix");
  assert.ok(!finding.description.includes("durationMin"));
  assert.ok(!finding.description.includes("sample"));
});

await test("checkAndEmit: evidence_code_ref derived from rule record (not the detector path)", async () => {
  const now = Date.now();
  const sid = "11111111-2222-3333-4444-555555555555";
  // Seed a rule record with a known evidence_code_ref.
  mkdirSync(root, { recursive: true });
  writeFileSync(
    join(root, "meta-state.jsonl"),
    JSON.stringify({
      id: "rule-no-new-artifact-types",
      entry_kind: "rule",
      affected_system: "meta",
      enforcement: "gate",
      pattern_type: "regex",
      pattern: "(create|new).*schema",
      description: "Gate-enforced rule: blocks new artifact types.",
      status: "active",
      promoted_at: new Date().toISOString(),
      promoted_by: "operator",
      evidence_code_ref: "tools/learning-loop-mastra/core/gate-logic.js#applyPromotedRules",
    }) + "\n"
  );

  // Same prefix across 3 entries — required to form a group.
  writeEntries([
    makeEntry(now - 5 * 60000, "create new schema", "rule-no-new-artifact-types", sid),
    makeEntry(now - 3 * 60000, "create new schema", "rule-no-new-artifact-types", sid),
    makeEntry(now - 1 * 60000, "create new schema", "rule-no-new-artifact-types", sid),
  ]);
  const result = await checkAndEmit(root);
  assert.strictEqual(result.findings_emitted, 1);

  const lines = readFileSync(join(root, "meta-state.jsonl"), "utf8").trim().split("\n").filter(Boolean);
  const finding = JSON.parse(lines[lines.length - 1]);
  assert.strictEqual(
    finding.evidence_code_ref,
    "tools/learning-loop-mastra/core/gate-logic.js#applyPromotedRules",
    "evidence_code_ref must come from the rule record",
  );
  assert.ok(!finding.evidence_code_ref.includes("-mcp/core/recurrence-tracker"), "must never cite the stale detector path");
});

await test("checkAndEmit: evidence_code_ref falls back to gate-logic.js when rule lacks the field", async () => {
  const now = Date.now();
  const sid = "11111111-2222-3333-4444-555555555555";
  // Seed a rule record WITHOUT evidence_code_ref.
  writeFileSync(
    join(root, "meta-state.jsonl"),
    JSON.stringify({
      id: "rule-no-new-artifact-types",
      entry_kind: "rule",
      affected_system: "meta",
      enforcement: "gate",
      pattern_type: "regex",
      pattern: "(create|new).*schema",
      description: "Gate-enforced rule: blocks new artifact types.",
      status: "active",
      promoted_at: new Date().toISOString(),
      promoted_by: "operator",
      // no evidence_code_ref
    }) + "\n"
  );

  writeEntries([
    makeEntry(now - 5 * 60000, "create new schema", "rule-no-new-artifact-types", sid),
    makeEntry(now - 3 * 60000, "create new schema", "rule-no-new-artifact-types", sid),
    makeEntry(now - 1 * 60000, "create new schema", "rule-no-new-artifact-types", sid),
  ]);
  const result = await checkAndEmit(root);
  assert.strictEqual(result.findings_emitted, 1);

  const lines = readFileSync(join(root, "meta-state.jsonl"), "utf8").trim().split("\n").filter(Boolean);
  const finding = JSON.parse(lines[lines.length - 1]);
  assert.strictEqual(
    finding.evidence_code_ref,
    "tools/learning-loop-mastra/core/gate-logic.js",
    "fallback must be the gate-rule file, not the detector",
  );
});

await test("gate_check_recurrence tool returns result JSON", async () => {
  const now = Date.now();
  const sid = "11111111-2222-3333-4444-555555555555";
  writeEntries([
    makeEntry(now - 5 * 60000, "a", "rule-no-new-artifact-types", sid),
    makeEntry(now - 3 * 60000, "a", "rule-no-new-artifact-types", sid),
    makeEntry(now - 1 * 60000, "a", "rule-no-new-artifact-types", sid),
  ]);
  const response = await gateCheckRecurrenceTool.handler({});
  const result = JSON.parse(response.content[0].text);
  assert.strictEqual(result.checked_groups, 1);
  assert.strictEqual(result.findings_emitted, 1);
});

await test("SessionStart hook runs checkAndEmit and exits 0", () => {
  const now = Date.now();
  const sid = "11111111-2222-3333-4444-555555555555";
  writeEntries([
    makeEntry(now - 5 * 60000, "a", "rule-no-new-artifact-types", sid),
    makeEntry(now - 3 * 60000, "a", "rule-no-new-artifact-types", sid),
    makeEntry(now - 1 * 60000, "a", "rule-no-new-artifact-types", sid),
  ]);
  const wrapper = new URL("../../hooks/universal/recurrence-check-on-start.js", import.meta.url).pathname;
  const result = spawnSync(process.execPath, [wrapper], {
    input: "{}",
    env: { ...process.env, GATE_ROOT: root },
    encoding: "utf8",
    timeout: 5000,
  });
  assert.strictEqual(result.status, 0, `hook must exit 0 (got ${result.status}, stderr=${result.stderr})`);
  assert.ok(result.stderr.includes("recurrence-check"));
  assert.ok(existsSync(join(root, "meta-state.jsonl")));
  // Silent-write channel: stdout must NOT contain hookSpecificOutput.additionalContext.
  assert.ok(
    !result.stdout.includes("additionalContext"),
    "SessionStart hook must NOT emit additionalContext (silent-write channel, 0 agent tokens)",
  );
});

await test("SessionStart hook fails open when checkAndEmit throws", () => {
  // Spawn the hook with a deliberately broken GATE_ROOT so the tracker
  // cannot read the registry (mkdir fails). The hook must still exit 0
  // and emit a stderr diagnostic — fail-open, not fail-closed.
  const wrapper = new URL("../../hooks/universal/recurrence-check-on-start.js", import.meta.url).pathname;
  const result = spawnSync(process.execPath, [wrapper], {
    input: "{}",
    env: {
      ...process.env,
      // Point GATE_ROOT at a path that exists but is read-only so any
      // attempt to mkdir()/writeFile() fails with EACCES/EROFS.
      GATE_ROOT: "/proc/1/cmdline",
    },
    encoding: "utf8",
    timeout: 5000,
  });
  // Exit 0 is required — a hook that blocks SessionStart on a tracker
  // regression is worse than a skipped check.
  assert.strictEqual(result.status, 0, `hook must fail open (got ${result.status})`);
  assert.ok(
    result.stderr.includes("recurrence-check: failed") || result.stderr.includes("recurrence-check"),
    "stderr must carry the fail-open diagnostic",
  );
});

await test("checkAndEmit: entries_scanned counts decision-log lines (latency-tripwire metric)", async () => {
  // The tripwire budget is about the decision-log scan, so the reported
  // count must be the log size, not the registry size. 3 entries on one
  // surface, no registry entries → entries_scanned === 3.
  const now = Date.now();
  const sid = "11111111-2222-3333-4444-555555555555";
  writeEntries([
    makeEntry(now - 5 * 60000, "a", "rule-no-new-artifact-types", sid),
    makeEntry(now - 3 * 60000, "a", "rule-no-new-artifact-types", sid),
    makeEntry(now - 1 * 60000, "a", "rule-no-new-artifact-types", sid),
  ]);
  const result = await checkAndEmit(root);
  assert.strictEqual(result.entries_scanned, 3, "entries_scanned must be the decision-log line count");
});

await test("writeEntryIfAbsent: missing recurrence_key rejects at the invariant boundary", async () => {
  // Without the guard, an undefined key would match every keyless
  // recurring-false-positive and silently suppress the write.
  await assert.rejects(
    () => writeEntryIfAbsent(root, { id: "meta-test-no-key", entry_kind: "finding" }),
    /write_entry_if_absent_identity_precondition_failed/,
  );
  // And nothing was appended.
  assert.ok(!existsSync(join(root, "meta-state.jsonl")), "no line may be written on invariant failure");
});

await test("writeEntryIfAbsent: valid finding writes once, second call suppresses", async () => {
  const finding = {
    id: "meta-test-if-absent",
    entry_kind: "finding",
    category: "gate-logic-bug",
    severity: "warning",
    affected_system: "gate-logic",
    subtype: "recurring-false-positive",
    recurrence_key: "rule-x::abc123",
    description: "direct helper coverage",
    status: "open",
    created_at: new Date().toISOString(),
  };
  const first = await writeEntryIfAbsent(root, finding);
  assert.strictEqual(first.written, true);
  const second = await writeEntryIfAbsent(root, { ...finding, id: "meta-test-if-absent-2" });
  assert.strictEqual(second.written, false);
  assert.strictEqual(second.suppressed_by.id, "meta-test-if-absent");
});
