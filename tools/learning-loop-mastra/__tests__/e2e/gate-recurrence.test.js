import assert from "node:assert";
import { test, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

import {
  findRecurrentGroups,
  checkAndEmit,
} from "../../core/recurrence-tracker.js";
import {
  hashRecurrenceKey,
  normalizePrefix,
  normalizePrefixForKey,
} from "../../core/command-recurrence.js";
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

const UNEXPECTED_PROV = {
  event_source: "bash-gate-evaluator",
  match_origin: "inert-data",
  candidate_kind: "unexpected-match",
};

function makeEntry(ts, prefix, ruleId = "rule-no-new-artifact-types", sessionId = "11111111-2222-3333-4444-555555555555", sessionTier = "real", provenance = {}) {
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
    // Explicit evaluator-produced unexpected-match provenance by default, so
    // a plain entry is a REAL recurrence candidate under the eligibility
    // filter. Callers override with a `provenance` object to exercise
    // ordinary fires, legacy (absent), contradictory pairs, or a wrong
    // producer marker. The legacy no-provenance shape is covered by dedicated
    // tests that inline plain rows.
    ...UNEXPECTED_PROV,
    ...provenance,
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
  // Re-baselined: the coarser tracker key (blankDataPayloadsForKey) blanks the
  // node -e body (quoted AND unquoted) to end, so all three forms collapse to
  // the verb-only prefix `node -e`. The eval body is data to the recurrence
  // tracker — body variants are one root-cause class, not distinct classes.
  assert.strictEqual(groups[0].command_prefix_normalized, "node -e");
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
        ...UNEXPECTED_PROV,
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
  // Re-baselined: the recurrence_key now hashes the COARSER key — the node -e
  // body is blanked to end, so the normalized prefix is `node -e` (was
  // `node -e x`). The recurrence_key is a grouping artifact; body variants of
  // one class must share a key.
  const expectedHash = hashRecurrenceKey("rule-no-new-artifact-types", "node -e");
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

  // Re-baselined: the existing finding must be keyed by the COARSER key
  // (`node -e`, not `node -e x`) so the dedup index matches the new key
  // derivation for the same root-cause class.
  const normalized = "node -e";
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
      internalization_level: "I3",
      pattern_type: "regex",
      pattern: "(create|new).*schema",
      description: "I3 action-boundary Rule: blocks new artifact types.",
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
      internalization_level: "I2",
      pattern_type: "regex",
      pattern: "(create|new).*schema",
      description: "I3 action-boundary Rule: blocks new artifact types.",
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

// --- toolchain-failure rule_id partition tests (Channel C, plans/260804-1109-channel-b-observe-defer-filing/phase-03) ---

await test("findRecurrentGroups: toolchain-failure entries group under their own rule_id (3 same-command in one session)", () => {
  const now = Date.now();
  const sid = "11111111-2222-3333-4444-555555555555";
  const prefix = "pnpm fallow:gate";
  writeEntries([
    makeEntry(now - 5 * 60000, prefix, "toolchain-failure", sid),
    makeEntry(now - 3 * 60000, prefix, "toolchain-failure", sid),
    makeEntry(now - 1 * 60000, prefix, "toolchain-failure", sid),
  ]);
  const groups = findRecurrentGroups(root);
  assert.strictEqual(groups.length, 1, "3 toolchain-failure entries in one session → 1 group");
  assert.strictEqual(groups[0].count, 3);
  assert.strictEqual(groups[0].rule_id, "toolchain-failure");
  assert.strictEqual(groups[0].command_prefix_normalized, "pnpm fallow:gate");
});

await test("findRecurrentGroups: toolchain-failure and gate-logic-bug entries do NOT collapse into each other", () => {
  // A burst of 3 of each rule_id for the SAME prefix in the SAME session
  // must produce 2 distinct groups (recurrence_key includes rule_id).
  const now = Date.now();
  const sid = "11111111-2222-3333-4444-555555555555";
  const prefix = "pnpm exec vitest run tools/some.test.js";
  writeEntries([
    makeEntry(now - 7 * 60000, prefix, "toolchain-failure", sid),
    makeEntry(now - 5 * 60000, prefix, "toolchain-failure", sid),
    makeEntry(now - 4 * 60000, prefix, "toolchain-failure", sid),
    makeEntry(now - 3 * 60000, prefix, "rule-no-new-artifact-types", sid),
    makeEntry(now - 2 * 60000, prefix, "rule-no-new-artifact-types", sid),
    makeEntry(now - 1 * 60000, prefix, "rule-no-new-artifact-types", sid),
  ]);
  const groups = findRecurrentGroups(root);
  assert.strictEqual(groups.length, 2, "toolchain-failure and gate-logic-bug must remain distinct groups");
  const tfcGroups = groups.filter((g) => g.rule_id === "toolchain-failure");
  const gateGroups = groups.filter((g) => g.rule_id === "rule-no-new-artifact-types");
  assert.strictEqual(tfcGroups.length, 1);
  assert.strictEqual(tfcGroups[0].count, 3);
  assert.strictEqual(gateGroups.length, 1);
  assert.strictEqual(gateGroups[0].count, 3);
});

await test("checkAndEmit: toolchain-failure group emits a finding with subtype recurring-false-positive", async () => {
  const now = Date.now();
  const sid = "11111111-2222-3333-4444-555555555555";
  const prefix = "pnpm run build";
  writeEntries([
    makeEntry(now - 5 * 60000, prefix, "toolchain-failure", sid),
    makeEntry(now - 3 * 60000, prefix, "toolchain-failure", sid),
    makeEntry(now - 1 * 60000, prefix, "toolchain-failure", sid),
  ]);
  const result = await checkAndEmit(root);
  assert.strictEqual(result.findings_emitted, 1, "toolchain-failure burst → 1 finding filed");
  assert.strictEqual(result.checked_groups, 1);

  const lines = readFileSync(join(root, "meta-state.jsonl"), "utf8").trim().split("\n").filter(Boolean);
  assert.strictEqual(lines.length, 1);
  const finding = JSON.parse(lines[0]);
  assert.strictEqual(finding.entry_kind, "finding");
  assert.strictEqual(finding.subtype, "recurring-false-positive");
  assert.strictEqual(finding.recurrence_key.startsWith("toolchain-failure::"), true, "recurrence_key must include the rule_id partition");
  assert.ok(!finding.recurrence_key.includes("pnpm run build"), "raw prefix must NOT appear in recurrence_key (hashed)");
});

await test("checkAndEmit: toolchain-failure finding uses a toolchain-capture evidence_code_ref when no rule record exists", async () => {
  const now = Date.now();
  const sid = "11111111-2222-3333-4444-555555555555";
  const prefix = "pnpm test:unit";
  writeEntries([
    makeEntry(now - 5 * 60000, prefix, "toolchain-failure", sid),
    makeEntry(now - 3 * 60000, prefix, "toolchain-failure", sid),
    makeEntry(now - 1 * 60000, prefix, "toolchain-failure", sid),
  ]);
  const result = await checkAndEmit(root);
  assert.strictEqual(result.findings_emitted, 1);

  const lines = readFileSync(join(root, "meta-state.jsonl"), "utf8").trim().split("\n").filter(Boolean);
  const finding = JSON.parse(lines[lines.length - 1]);
  // toolchain-failure has no rule record, so the buildFinding evidence_code_ref
  // fallback must point to the capture hook (not the gate-logic detector
  // path, which is the wrong referent for toolchain-captured findings).
  assert.strictEqual(
    finding.evidence_code_ref,
    "tools/learning-loop-mastra/hooks/universal/toolchain-failure-capture.js",
    "toolchain-failure findings must cite the capture hook in evidence_code_ref",
  );
  assert.ok(
    !finding.evidence_code_ref.includes("core/gate-logic.js"),
    "toolchain-failure must NOT cite the gate-logic detector path",
  );
});

await test("checkAndEmit: emitted finding id uses the canonical YYMMDDTHHMMSS stamp", async () => {
  const now = Date.now();
  const sid = "11111111-2222-3333-4444-555555555555";
  const prefix = "pnpm fallow:gate";
  writeEntries([
    makeEntry(now - 5 * 60000, prefix, "toolchain-failure", sid),
    makeEntry(now - 3 * 60000, prefix, "toolchain-failure", sid),
    makeEntry(now - 1 * 60000, prefix, "toolchain-failure", sid),
  ]);
  await checkAndEmit(root);

  const lines = readFileSync(join(root, "meta-state.jsonl"), "utf8").trim().split("\n").filter(Boolean);
  const finding = JSON.parse(lines[lines.length - 1]);
  assert.match(
    finding.id,
    /^meta-\d{6}T\d{6}Z-[0-9a-f]{8}$/,
    "finding id stamp must match hand-filed ids (meta-260804T1026Z-*); the digit-slice bug kept one millisecond digit and dropped the T",
  );
});

// --- cross-session slow-burn tests ---
//
// Sub-threshold-per-session failures that accumulate across >=2 REAL-tier
// sessions within a trailing 7-day window file a recurring-false-positive
// finding. Distinct-real-session requirement: >=2. Threshold: >=5
// occurrences. Window: trailing 7 days. The cross-session group is emitted
// only when no within-window single-session group already fires (avoids
// double-counting).

const SIDS_REAL = [
  "11111111-2222-3333-4444-555555555555",
  "22222222-3333-4444-5555-666666666666",
  "33333333-4444-5555-6666-777777777777",
];

await test("findRecurrentGroups: 2x in each of 3 REAL sessions (6 total, 3 sessions) within 7 days → 1 cross-session group", () => {
  // This is the motivating case: the per-session pass returns 0 (each session
  // has only 2 entries, below the per-session threshold of 3). The
  // cross-session pass must surface it.
  const now = Date.now();
  const prefix = "cross-session-slow-burn";
  writeEntries([
    makeEntry(now - 5 * 60000, prefix, "rule-no-new-artifact-types", SIDS_REAL[0]),
    makeEntry(now - 4 * 60000, prefix, "rule-no-new-artifact-types", SIDS_REAL[0]),
    makeEntry(now - 3 * 60000, prefix, "rule-no-new-artifact-types", SIDS_REAL[1]),
    makeEntry(now - 2 * 60000, prefix, "rule-no-new-artifact-types", SIDS_REAL[1]),
    makeEntry(now - 60000, prefix, "rule-no-new-artifact-types", SIDS_REAL[2]),
    makeEntry(now - 30000, prefix, "rule-no-new-artifact-types", SIDS_REAL[2]),
  ]);
  const groups = findRecurrentGroups(root);
  const cross = groups.filter((g) => g.cross_session_slow_burn === true);
  assert.strictEqual(cross.length, 1, "cross-session slow-burn must produce exactly one group");
  assert.strictEqual(cross[0].count, 6, "count must be the union across all within-window sessions");
  assert.strictEqual(cross[0].sessions_crossing_threshold, 3, "3 distinct real sessions");
  assert.strictEqual(cross[0].rule_id, "rule-no-new-artifact-types");
  assert.strictEqual(cross[0].command_prefix_normalized, normalizePrefix(prefix));
});

await test("findRecurrentGroups: 2 occurrences in 1 session only → no group (distinct-real-session threshold not met)", () => {
  const now = Date.now();
  const prefix = "single-session-no-cross";
  writeEntries([
    makeEntry(now - 5 * 60000, prefix, "rule-no-new-artifact-types", SIDS_REAL[0]),
    makeEntry(now - 4 * 60000, prefix, "rule-no-new-artifact-types", SIDS_REAL[0]),
  ]);
  const groups = findRecurrentGroups(root);
  assert.strictEqual(groups.length, 0, "single-session sub-threshold is invisible to both passes");
});

await test("findRecurrentGroups: 4 occurrences across 2 real sessions within 7 days → no group (count threshold 5 not met)", () => {
  const now = Date.now();
  const prefix = "four-across-two";
  writeEntries([
    makeEntry(now - 5 * 60000, prefix, "rule-no-new-artifact-types", SIDS_REAL[0]),
    makeEntry(now - 4 * 60000, prefix, "rule-no-new-artifact-types", SIDS_REAL[0]),
    makeEntry(now - 3 * 60000, prefix, "rule-no-new-artifact-types", SIDS_REAL[1]),
    makeEntry(now - 2 * 60000, prefix, "rule-no-new-artifact-types", SIDS_REAL[1]),
  ]);
  const groups = findRecurrentGroups(root);
  assert.strictEqual(groups.length, 0, "4 total — below the 5-occurrence threshold");
});

await test("findRecurrentGroups: 2+2 across 2 real sessions where one session is >7 days old → no group (window bound)", () => {
  const now = Date.now();
  const prefix = "window-bound-mix";
  writeEntries([
    // Old session — 8 days ago, outside the 7-day window.
    makeEntry(now - 8 * 24 * 60 * 60000, prefix, "rule-no-new-artifact-types", SIDS_REAL[0]),
    makeEntry(now - 8 * 24 * 60 * 60000 + 60000, prefix, "rule-no-new-artifact-types", SIDS_REAL[0]),
    // Fresh session — 1 minute ago.
    makeEntry(now - 60000, prefix, "rule-no-new-artifact-types", SIDS_REAL[1]),
    makeEntry(now - 30000, prefix, "rule-no-new-artifact-types", SIDS_REAL[1]),
  ]);
  const groups = findRecurrentGroups(root);
  assert.strictEqual(groups.length, 0, "out-of-window session must not count toward the distinct-session requirement");
});

await test("findRecurrentGroups: stale >7-day per-session burst (3 in X) does NOT suppress a fresh cross-session slow-burn (2+2+2 across 3 real sessions) for the same prefix", () => {
  // The stale per-session group fires (its 3-in-X shape is within the old
  // per-session pass's full-log scope). The fresh cross-session slow-burn
  // must also fire — the stale burst must NOT enter firedKeys.
  const now = Date.now();
  const prefix = "no-over-suppression-prefix";
  const staleSid = "44444444-5555-6666-7777-888888888888";
  writeEntries([
    // Stale per-session burst: 3 in the same session, 10 days ago.
    makeEntry(now - 10 * 24 * 60 * 60000, prefix, "rule-no-new-artifact-types", staleSid),
    makeEntry(now - 10 * 24 * 60 * 60000 + 60000, prefix, "rule-no-new-artifact-types", staleSid),
    makeEntry(now - 10 * 24 * 60 * 60000 + 120000, prefix, "rule-no-new-artifact-types", staleSid),
    // Fresh cross-session slow-burn: 2+2+2 across 3 distinct real sessions, today.
    makeEntry(now - 5 * 60000, prefix, "rule-no-new-artifact-types", SIDS_REAL[0]),
    makeEntry(now - 4 * 60000, prefix, "rule-no-new-artifact-types", SIDS_REAL[0]),
    makeEntry(now - 3 * 60000, prefix, "rule-no-new-artifact-types", SIDS_REAL[1]),
    makeEntry(now - 2 * 60000, prefix, "rule-no-new-artifact-types", SIDS_REAL[1]),
    makeEntry(now - 60000, prefix, "rule-no-new-artifact-types", SIDS_REAL[2]),
    makeEntry(now - 30000, prefix, "rule-no-new-artifact-types", SIDS_REAL[2]),
  ]);
  const groups = findRecurrentGroups(root);
  const perSession = groups.filter((g) => !g.cross_session_slow_burn);
  const cross = groups.filter((g) => g.cross_session_slow_burn === true);
  assert.strictEqual(perSession.length, 1, "stale per-session burst fires");
  assert.strictEqual(perSession[0].session_id, staleSid);
  assert.strictEqual(cross.length, 1, "fresh cross-session slow-burn must NOT be suppressed by stale per-session burst");
  assert.strictEqual(cross[0].count, 6);
  assert.strictEqual(cross[0].sessions_crossing_threshold, 3);
});

await test("findRecurrentGroups: A=3 within window + B=2 → only the per-session group; no cross_session_slow_burn group", () => {
  // A crossed the per-session threshold within the window → its key is in
  // firedKeys; the cross-session pass skips that key.
  const now = Date.now();
  const prefix = "per-session-takes-precedence";
  writeEntries([
    makeEntry(now - 5 * 60000, prefix, "rule-no-new-artifact-types", SIDS_REAL[0]),
    makeEntry(now - 4 * 60000, prefix, "rule-no-new-artifact-types", SIDS_REAL[0]),
    makeEntry(now - 3 * 60000, prefix, "rule-no-new-artifact-types", SIDS_REAL[0]),
    makeEntry(now - 2 * 60000, prefix, "rule-no-new-artifact-types", SIDS_REAL[1]),
    makeEntry(now - 60000, prefix, "rule-no-new-artifact-types", SIDS_REAL[1]),
  ]);
  const groups = findRecurrentGroups(root);
  assert.strictEqual(groups.length, 1, "only the per-session group — cross-session pass skipped due to firedKeys");
  assert.strictEqual(groups[0].count, 3);
  assert.notStrictEqual(groups[0].cross_session_slow_burn, true, "no cross-session group must be emitted");
});

await test("findRecurrentGroups: A=3, B=3 (both within window) → two per-session groups, no cross-session group; collapseFreshByKey yields one finding with count === 6", async () => {
  // The harder double-count guard: two per-session groups with the same
  // prefix share a recurrence_key. collapseFreshByKey merges their counts
  // (3 + 3 = 6, not 9). The cross-session pass must NOT emit a third group
  // (otherwise count would double again → 9).
  const now = Date.now();
  const prefix = "double-count-guard-prefix";
  writeEntries([
    makeEntry(now - 8 * 60000, prefix, "rule-no-new-artifact-types", SIDS_REAL[0]),
    makeEntry(now - 7 * 60000, prefix, "rule-no-new-artifact-types", SIDS_REAL[0]),
    makeEntry(now - 6 * 60000, prefix, "rule-no-new-artifact-types", SIDS_REAL[0]),
    makeEntry(now - 4 * 60000, prefix, "rule-no-new-artifact-types", SIDS_REAL[1]),
    makeEntry(now - 3 * 60000, prefix, "rule-no-new-artifact-types", SIDS_REAL[1]),
    makeEntry(now - 2 * 60000, prefix, "rule-no-new-artifact-types", SIDS_REAL[1]),
  ]);
  const groups = findRecurrentGroups(root);
  assert.strictEqual(groups.length, 2, "two per-session groups; cross-session pass must not emit a third");
  assert.ok(
    groups.every((g) => g.cross_session_slow_burn !== true),
    "no group may be a cross-session slow-burn group when both sessions crossed the per-session threshold",
  );

  // Run through checkAndEmit to confirm the merged finding reports count=6,
  // not 9 (no triple-count from a stray cross-session group).
  const result = await checkAndEmit(root);
  assert.strictEqual(result.findings_emitted, 1, "two per-session groups sharing a key merge to one finding");

  const lines = readFileSync(join(root, "meta-state.jsonl"), "utf8").trim().split("\n").filter(Boolean);
  assert.strictEqual(lines.length, 1);
  const finding = JSON.parse(lines[0]);
  const findingJson = lines[0];
  // 6 occurrences, 2 sessions crossing threshold — the dedup-merger sums
  // count to 6 (3 + 3) and increments sessions_crossing_threshold by 1
  // (initial 1 + 1).
  assert.ok(/Pattern recurred 6 time\(s\) across 2 session\(s\)/.test(finding.description), `description must report count=6 across 2 sessions (got: ${finding.description})`);
  assert.ok(!findingJson.includes("cross-session slow-burn"), "description must NOT carry the cross-session slow-burn suffix when the per-session pass already fired");
});

await test("findRecurrentGroups: 5 null-rule_id entries across 2 sessions (3+2) → 0 groups (no null:: finding)", () => {
  // Mirrors the per-session null-rule_id test, but split across 2 sessions
  // so the cross-session pass is exercised. The cross-session pass must
  // skip entries with no rule_id — otherwise a `null::` finding would be
  // filed (the literal Red-team Finding 2 defect).
  const now = Date.now();
  const entries = [];
  for (let i = 0; i < 3; i++) {
    entries.push({
      ts: new Date(now - i * 60000).toISOString(),
      command_prefix: "docker",
      rule_id: null,
      decision: "escalate",
      reason: "constraint matched",
      matched_pattern: null,
      skipped_via_override: false,
      session_id: SIDS_REAL[0],
      session_id_tier: "real",
    });
  }
  for (let i = 0; i < 2; i++) {
    entries.push({
      ts: new Date(now - 60 * 60000 - i * 60000).toISOString(),
      command_prefix: "docker",
      rule_id: null,
      decision: "escalate",
      reason: "constraint matched",
      matched_pattern: null,
      skipped_via_override: false,
      session_id: SIDS_REAL[1],
      session_id_tier: "real",
    });
  }
  writeEntries(entries);
  const groups = findRecurrentGroups(root);
  assert.strictEqual(groups.length, 0, "null-rule_id entries must not file a `null::` finding");
});

await test("findRecurrentGroups: 5 fallback-tier entries across 2 distinct fallback session_ids within 7 days → no cross-session group", () => {
  // The cross-session pass counts REAL-tier session_ids only. Two distinct
  // fallback session_ids (which would be two branches of a single worktree)
  // cannot satisfy the distinct-real-session requirement on their own.
  const now = Date.now();
  const prefix = "fallback-cross";
  writeEntries([
    makeEntry(now - 5 * 60000, prefix, "rule-no-new-artifact-types", "fallback-branchA", "fallback"),
    makeEntry(now - 4 * 60000, prefix, "rule-no-new-artifact-types", "fallback-branchA", "fallback"),
    makeEntry(now - 3 * 60000, prefix, "rule-no-new-artifact-types", "fallback-branchB", "fallback"),
    makeEntry(now - 2 * 60000, prefix, "rule-no-new-artifact-types", "fallback-branchB", "fallback"),
    makeEntry(now - 60000, prefix, "rule-no-new-artifact-types", "fallback-branchA", "fallback"),
  ]);
  const groups = findRecurrentGroups(root);
  // The per-session pass returns 0 (each fallback bucket has <= 3 entries
  // and the span bound covers them; but the threshold is 3 and branchA has 3,
  // so a single per-session group *might* fire on branchA). Either way, no
  // cross-session group with cross_session_slow_burn=true must appear.
  const cross = groups.filter((g) => g.cross_session_slow_burn === true);
  assert.strictEqual(cross.length, 0, "fallback-only distinct sessions must not produce a cross-session slow-burn group");
});

await test("findRecurrentGroups: single worktree on two branches — 3 fallback + 3 fallback with two distinct fallback session_ids within 7 days → no cross-session finding", () => {
  // The branch-switch false positive: a single worktree that switches
  // branches produces two distinct fallback session_ids. The cross-session
  // pass counts REAL-tier only; the per-session pass bounds fallback-tier
  // groups to a 24h span. Together they must NOT fire a cross-session
  // finding across two branches.
  const now = Date.now();
  const prefix = "branch-switch-fallback";
  writeEntries([
    makeEntry(now - 5 * 60000, prefix, "rule-no-new-artifact-types", "worktree-branchA", "fallback"),
    makeEntry(now - 4 * 60000, prefix, "rule-no-new-artifact-types", "worktree-branchA", "fallback"),
    makeEntry(now - 3 * 60000, prefix, "rule-no-new-artifact-types", "worktree-branchA", "fallback"),
    makeEntry(now - 2 * 60000, prefix, "rule-no-new-artifact-types", "worktree-branchB", "fallback"),
    makeEntry(now - 60000, prefix, "rule-no-new-artifact-types", "worktree-branchB", "fallback"),
    makeEntry(now - 30000, prefix, "rule-no-new-artifact-types", "worktree-branchB", "fallback"),
  ]);
  const groups = findRecurrentGroups(root);
  const cross = groups.filter((g) => g.cross_session_slow_burn === true);
  assert.strictEqual(cross.length, 0, "single-worktree branch switch must not fire a cross-session finding");
});

await test("findRecurrentGroups: 5 real-tier entries across 3 distinct real sessions (2+2+1 sub-threshold-per-session) → cross-session fires (positive control)", () => {
  // Positive control confirming real-tier session_ids count toward the
  // distinct-session requirement. Distribution is sub-threshold per
  // session (2+2+1) so the per-session pass emits no group; the
  // cross-session pass surfaces the union.
  const now = Date.now();
  const prefix = "real-tier-positive-control";
  writeEntries([
    makeEntry(now - 6 * 60000, prefix, "rule-no-new-artifact-types", SIDS_REAL[0]),
    makeEntry(now - 5 * 60000, prefix, "rule-no-new-artifact-types", SIDS_REAL[0]),
    makeEntry(now - 4 * 60000, prefix, "rule-no-new-artifact-types", SIDS_REAL[1]),
    makeEntry(now - 3 * 60000, prefix, "rule-no-new-artifact-types", SIDS_REAL[1]),
    makeEntry(now - 60000, prefix, "rule-no-new-artifact-types", SIDS_REAL[2]),
  ]);
  const groups = findRecurrentGroups(root);
  const cross = groups.filter((g) => g.cross_session_slow_burn === true);
  assert.strictEqual(cross.length, 1, "real-tier sub-threshold-per-session entries across 3 sessions must fire");
  assert.strictEqual(cross[0].count, 5);
  assert.strictEqual(cross[0].sessions_crossing_threshold, 3);
});

await test("checkAndEmit: cross-session slow-burn → files exactly one finding, description includes `cross-session slow-burn`", async () => {
  // End-to-end check: the cross-session path through collapseFreshByKey →
  // buildFinding → writeEntryIfAbsent must produce a finding whose
  // description carries the cross-session slow-burn suffix, and whose
  // recurrence_key is computed from the NORMALIZED prefix.
  const now = Date.now();
  const rawPrefix = "curl https://api.example.com?token=eyJhbGciOiJIUzI1NiJ9";
  writeEntries([
    makeEntry(now - 5 * 60000, rawPrefix, "rule-no-new-artifact-types", SIDS_REAL[0]),
    makeEntry(now - 4 * 60000, rawPrefix, "rule-no-new-artifact-types", SIDS_REAL[0]),
    makeEntry(now - 3 * 60000, rawPrefix, "rule-no-new-artifact-types", SIDS_REAL[1]),
    makeEntry(now - 2 * 60000, rawPrefix, "rule-no-new-artifact-types", SIDS_REAL[1]),
    makeEntry(now - 60000, rawPrefix, "rule-no-new-artifact-types", SIDS_REAL[2]),
    makeEntry(now - 30000, rawPrefix, "rule-no-new-artifact-types", SIDS_REAL[2]),
  ]);
  const result = await checkAndEmit(root);
  assert.strictEqual(result.findings_emitted, 1, "cross-session slow-burn → exactly one finding");

  const lines = readFileSync(join(root, "meta-state.jsonl"), "utf8").trim().split("\n").filter(Boolean);
  assert.strictEqual(lines.length, 1);
  const finding = JSON.parse(lines[0]);
  // recurrence_key is rule_id::sha256(rule_id::NORMALIZED_PREFIX)[:16].
  const expectedNormalized = normalizePrefix(rawPrefix);
  const expectedHash = hashRecurrenceKey("rule-no-new-artifact-types", expectedNormalized);
  assert.strictEqual(
    finding.recurrence_key,
    `rule-no-new-artifact-types::${expectedHash}`,
    "recurrence_key must hash the normalized prefix, not the raw prefix",
  );
  // Description must carry the cross-session slow-burn suffix AND must
  // NOT leak the raw secret.
  assert.ok(finding.description.includes("cross-session slow-burn"), "description must signal the lower-confidence cross-session source");
  assert.ok(!finding.description.includes("eyJhbGciOiJIUzI1NiJ9"), "raw token must NOT appear in description");
  assert.ok(!finding.description.includes("api.example.com"), "raw URL host must NOT appear in description");
  assert.ok(!finding.description.includes("token="), "raw `token=` fragment must NOT appear in description");
  // Whole-finding grep: no raw secret fragment anywhere.
  const findingJson = lines[0];
  assert.ok(!findingJson.includes("eyJhbGciOiJIUzI1NiJ9"), "raw token must NOT appear in finding JSON");
  assert.ok(!findingJson.includes("api.example.com"), "raw URL host must NOT appear in finding JSON");
  assert.ok(!findingJson.includes("token="), "raw `token=` fragment must NOT appear in finding JSON");
});

await test("findRecurrentGroups: malformed-ts entry is skipped by cross-session pass but does not crash", () => {
  // A malformed `ts` (NaN) entry must be silently skipped by the
  // cross-session pass (Number.isFinite guard) without breaking the
  // surrounding valid entries' grouping.
  const now = Date.now();
  const prefix = "malformed-ts-mix";
  writeEntries([
    makeEntry(now - 5 * 60000, prefix, "rule-no-new-artifact-types", SIDS_REAL[0]),
    makeEntry(now - 4 * 60000, prefix, "rule-no-new-artifact-types", SIDS_REAL[0]),
    makeEntry(now - 3 * 60000, prefix, "rule-no-new-artifact-types", SIDS_REAL[1]),
    makeEntry(now - 2 * 60000, prefix, "rule-no-new-artifact-types", SIDS_REAL[1]),
    makeEntry(now - 60000, prefix, "rule-no-new-artifact-types", SIDS_REAL[2]),
    // Now add a malformed-ts entry for the same prefix on a different session.
    {
      ts: "not-a-date",
      command_prefix: prefix,
      rule_id: "rule-no-new-artifact-types",
      decision: "escalate",
      reason: "Promoted rule matched",
      matched_pattern: "node -e",
      skipped_via_override: false,
      session_id: SIDS_REAL[2],
      session_id_tier: "real",
    },
  ]);
  const groups = findRecurrentGroups(root);
  const cross = groups.filter((g) => g.cross_session_slow_burn === true);
  assert.strictEqual(cross.length, 1, "the 5 valid entries still cross the threshold");
  assert.strictEqual(cross[0].count, 5, "malformed-ts entry must NOT be counted");
  assert.strictEqual(cross[0].sessions_crossing_threshold, 3);
});

// ─── Phase 2: coarser recurrence-key normalization ──────────────────────────
//
// The tracker key (normalizePrefixForKey) blanks data payloads the gate
// deliberately keeps visible — heredoc bodies (quoted AND unquoted) and node -e
// bodies — because the key is a grouping artifact with no bypass consequence.
// All payload variants of one root-cause class under one rule must collapse to
// a single recurrence_key (one finding per class, not one per command shape).

await test("normalizePrefixForKey: quoted heredoc bodies with different content → one key", () => {
  const a = normalizePrefixForKey("cat <<'EOF'\npnpm test a | tail\nEOF\n");
  const b = normalizePrefixForKey("cat <<'EOF'\npnpm test bbb | tail\nEOF\n");
  assert.strictEqual(a, b, "quoted heredoc body content must not split the key");
  // The operator `<<` is preserved; the delimiter word + body are blanked to
  // whitespace, and the 50-char window truncates the trailing whitespace.
  assert.strictEqual(a, "cat <<", "operator preserved, delimiter + body blanked to whitespace");
});

await test("normalizePrefixForKey: unquoted heredoc bodies (toolchain-failure path) → one key", () => {
  // toolchain-failure capture pre-strips quotes → `<<EOF` unquoted.
  const a = normalizePrefixForKey("cat <<EOF\npnpm test a | tail\nEOF\n");
  const b = normalizePrefixForKey("cat <<EOF\npnpm test bbb | tail\nEOF\n");
  assert.strictEqual(a, b, "unquoted heredoc body is also a data variant — one class");
});

await test("normalizePrefixForKey: node -e escaped-quote variants → one key", () => {
  const a = normalizePrefixForKey('node -e "console.log(\\"x\\")"');
  const b = normalizePrefixForKey('node -e "console.log(\\"yyyy\\")"');
  assert.strictEqual(a, b, "escaped-quote node -e bodies must collapse");
  assert.strictEqual(a, "node -e", "body blanked to end — verb + flag only");
});

await test("normalizePrefixForKey: >80-char truncated node -e body → still collapses", () => {
  const longBody = 'node -e "' + "x".repeat(200) + '"';
  const variant = 'node -e "' + "y".repeat(200) + '"';
  assert.strictEqual(
    normalizePrefixForKey(longBody),
    normalizePrefixForKey(variant),
    "truncated closing-quote must not split the class (blank-to-end)",
  );
});

await test("normalizePrefixForKey: varying redirect path + delimiter name → one key", () => {
  const a = normalizePrefixForKey("cat > /tmp/varying-a <<'EOF'\npnpm test x | tail\nEOF\n");
  const b = normalizePrefixForKey("cat > /tmp/other-b <<\"BOUNDARY\"\npnpm test y | tail\nBOUNDARY\n");
  assert.strictEqual(a, b, "redirect target + delimiter word are data variants — one class");
});

await test("normalizePrefixForKey: over-collapse guard — distinct trailing real command stays distinct", () => {
  const bare = normalizePrefixForKey("cat <<'EOF'\npnpm test a | tail\nEOF\n");
  const trailing = normalizePrefixForKey("cat <<'EOF'\npnpm test a | tail\nEOF\n; vitest run z | tail -10");
  assert.notStrictEqual(bare, trailing, "a real trailing command after the heredoc must not collapse into the bare class");
});

await test("findRecurrentGroups: quoted heredoc burst (different bodies) → one group", () => {
  const now = Date.now();
  const sid = "11111111-2222-3333-4444-555555555555";
  writeEntries([
    makeEntry(now - 5 * 60000, "cat <<'EOF'\npnpm test a | tail\nEOF\n", "rule-no-raw-stdout-vitest", sid),
    makeEntry(now - 3 * 60000, "cat <<'EOF'\npnpm test bbb | tail\nEOF\n", "rule-no-raw-stdout-vitest", sid),
    makeEntry(now - 1 * 60000, "cat <<'EOF'\npnpm test c | tail\nEOF\n", "rule-no-raw-stdout-vitest", sid),
  ]);
  const groups = findRecurrentGroups(root);
  assert.strictEqual(groups.length, 1, "multi-body quoted heredoc burst → one group");
  assert.strictEqual(groups[0].count, 3);
});

await test("findRecurrentGroups: unquoted heredoc burst (different bodies) → one group", () => {
  const now = Date.now();
  const sid = "11111111-2222-3333-4444-555555555555";
  writeEntries([
    makeEntry(now - 5 * 60000, "cat <<EOF\npnpm test a | tail\nEOF\n", "rule-no-raw-stdout-vitest", sid),
    makeEntry(now - 3 * 60000, "cat <<EOF\npnpm test bbb | tail\nEOF\n", "rule-no-raw-stdout-vitest", sid),
    makeEntry(now - 1 * 60000, "cat <<EOF\npnpm test c | tail\nEOF\n", "rule-no-raw-stdout-vitest", sid),
  ]);
  const groups = findRecurrentGroups(root);
  assert.strictEqual(groups.length, 1, "multi-body unquoted heredoc burst → one group (coarser key)");
});

await test("checkAndEmit: quoted + unquoted heredoc burst → exactly one finding", async () => {
  const now = Date.now();
  const sid = "11111111-2222-3333-4444-555555555555";
  writeEntries([
    makeEntry(now - 5 * 60000, "cat <<'EOF'\npnpm test a | tail\nEOF\n", "rule-no-raw-stdout-vitest", sid),
    makeEntry(now - 3 * 60000, "cat <<EOF\npnpm test bbb | tail\nEOF\n", "rule-no-raw-stdout-vitest", sid),
    makeEntry(now - 1 * 60000, "cat <<'EOF'\npnpm test c | tail\nEOF\n", "rule-no-raw-stdout-vitest", sid),
  ]);
  const result = await checkAndEmit(root);
  assert.strictEqual(result.findings_emitted, 1, "quoted AND unquoted heredoc bodies collapse to one finding");
  const lines = readFileSync(join(root, "meta-state.jsonl"), "utf8").trim().split("\n").filter(Boolean);
  assert.strictEqual(lines.length, 1);
});

await test("checkAndEmit: node -e variants under one rule → one finding", async () => {
  const now = Date.now();
  const sid = "11111111-2222-3333-4444-555555555555";
  writeEntries([
    makeEntry(now - 5 * 60000, 'node -e "a"', "rule-no-new-artifact-types", sid),
    makeEntry(now - 3 * 60000, 'node -e "b"', "rule-no-new-artifact-types", sid),
    makeEntry(now - 1 * 60000, "node -e 'c'", "rule-no-new-artifact-types", sid),
  ]);
  const result = await checkAndEmit(root);
  assert.strictEqual(result.findings_emitted, 1, "node -e body variants collapse to one finding");
});

await test("checkAndEmit: distinct real shapes → two findings", async () => {
  const now = Date.now();
  const sid = "11111111-2222-3333-4444-555555555555";
  // Shape A: heredoc false-positive class (3 bodies). Shape B: real
  // `pnpm test … | grep` (no heredoc) — identical prefix so the 3 occurrences
  // cross the per-session threshold as one distinct class (a real violation
  // shape that must NOT collapse into the heredoc class). ALL entries written
  // in ONE writeEntries call — the helper alternates surfaces and overwrites,
  // so two separate calls would clobber the first shape.
  writeEntries([
    makeEntry(now - 5 * 60000, "cat <<'EOF'\npnpm test a | tail\nEOF\n", "rule-no-raw-stdout-vitest", sid),
    makeEntry(now - 3 * 60000, "cat <<'EOF'\npnpm test b | tail\nEOF\n", "rule-no-raw-stdout-vitest", sid),
    makeEntry(now - 1 * 60000, "cat <<'EOF'\npnpm test c | tail\nEOF\n", "rule-no-raw-stdout-vitest", sid),
    makeEntry(now - 4 * 60000, "pnpm test x 2>&1 | grep FAIL", "rule-no-raw-stdout-vitest", sid),
    makeEntry(now - 2 * 60000, "pnpm test x 2>&1 | grep FAIL", "rule-no-raw-stdout-vitest", sid),
    makeEntry(now - 1 * 60000, "pnpm test x 2>&1 | grep FAIL", "rule-no-raw-stdout-vitest", sid),
  ]);
  const result = await checkAndEmit(root);
  assert.strictEqual(result.findings_emitted, 2, "two genuinely distinct shapes under one rule → two findings");
  const lines = readFileSync(join(root, "meta-state.jsonl"), "utf8").trim().split("\n").filter(Boolean);
  assert.strictEqual(lines.length, 2);
});

await test("checkAndEmit: existing same-rule finding with matching recurrence_key suppresses re-file (key equality dedup)", async () => {
  // The re-file burst mitigation for a changed key is `existingKeys` (key
  // equality) + post-ship triage — NOT a description-prefix fallback (the
  // description redacts raw commands, so no prefix is recoverable). This test
  // locks the actual suppression path: an existing finding carrying the SAME
  // recurrence_key as a fresh burst suppresses the re-file.
  const now = Date.now();
  const sid = "11111111-2222-3333-4444-555555555555";
  const prefix = "cat <<'EOF'\npnpm test a | tail\nEOF\n";
  writeEntries([
    makeEntry(now - 5 * 60000, prefix, "rule-no-raw-stdout-vitest", sid),
    makeEntry(now - 3 * 60000, "cat <<'EOF'\npnpm test bbb | tail\nEOF\n", "rule-no-raw-stdout-vitest", sid),
    makeEntry(now - 1 * 60000, "cat <<'EOF'\npnpm test c | tail\nEOF\n", "rule-no-raw-stdout-vitest", sid),
  ]);
  const normalized = normalizePrefixForKey(prefix);
  const existingKey = `rule-no-raw-stdout-vitest::${hashRecurrenceKey("rule-no-raw-stdout-vitest", normalized)}`;
  writeFileSync(
    join(root, "meta-state.jsonl"),
    JSON.stringify({
      id: "meta-test-key-dedup",
      entry_kind: "finding",
      subtype: "recurring-false-positive",
      recurrence_key: existingKey,
      status: "resolved",
      description: `Pattern recurred 3 time(s) across 1 session(s) (latest: ${sid}) under rule rule-no-raw-stdout-vitest. First seen: x. Last seen: y.`,
      created_at: new Date().toISOString(),
    }) + "\n"
  );
  const result = await checkAndEmit(root);
  assert.strictEqual(result.findings_emitted, 0, "existing same-rule finding with matching recurrence_key must suppress re-file");
});

await test("normalizePrefixForKey: herestring followed by newline + real command — command NOT blanked", () => {
  // Regression: the tracker's herestring exclusion must consume the ENTIRE
  // `<<<` operator. Emitting only one `<` re-parsed the remaining `<<` as a
  // heredoc and blanked whatever followed to end — a real `cat file` command
  // on the next line would be erased from the key, collapsing distinct
  // commands into one class.
  const cmd = "grep x <<< 'y'\ncat file";
  const out = normalizePrefixForKey(cmd);
  assert.ok(out.includes("cat file"), `real command after herestring must survive the key: ${out}`);
});

// ─── Phase 4 eligibility regression (plan 260809-1538, Phase 1 RED baseline) ──
//
// The tracker must NOT infer candidate kind from `rule_id`, `reason`, command
// prefix, or key collision. Only an EXPLICIT evaluator-produced
// `unexpected-match` event (proven inert-data origin + `bash-gate-evaluator`
// producer marker) is eligible for automatic promoted-rule recurrence filing.
// Ordinary rule fires, legacy rows without provenance, and contradictory
// provenance pairs remain telemetry-only.
//
// These were RED while `checkAndEmit` filed a finding for ANY repeated rule_id
// event; the eligibility filter makes the ordinary-fire and legacy-row
// assertions GREEN.

await test("checkAndEmit: three ordinary-rule-fire events → telemetry only, zero findings (RED)", async () => {
  const now = Date.now();
  const sid = "11111111-2222-3333-4444-555555555555";
  const prefix = "vitest run --bail=1 foo.test.js 2>&1 | tail -10";
  writeEntries([
    makeEntry(now - 5 * 60000, prefix, "rule-no-raw-stdout-vitest", sid, "real", { event_source: "bash-gate-evaluator", match_origin: "executable", candidate_kind: "ordinary-rule-fire" }),
    makeEntry(now - 3 * 60000, prefix, "rule-no-raw-stdout-vitest", sid, "real", { event_source: "bash-gate-evaluator", match_origin: "executable", candidate_kind: "ordinary-rule-fire" }),
    makeEntry(now - 1 * 60000, prefix, "rule-no-raw-stdout-vitest", sid, "real", { event_source: "bash-gate-evaluator", match_origin: "executable", candidate_kind: "ordinary-rule-fire" }),
  ]);
  const result = await checkAndEmit(root);
  assert.strictEqual(result.entries_scanned, 3);
  assert.strictEqual(result.findings_emitted, 0, "ordinary rule fires must NOT auto-file a finding");
});

await test("checkAndEmit: legacy rows without provenance → zero findings (RED)", async () => {
  // Current capture shape: no event_source / match_origin / candidate_kind.
  // Inlined (not makeEntry) because makeEntry defaults to explicit
  // unexpected-match provenance — the legacy shape is the absence of all three.
  const now = Date.now();
  const sid = "11111111-2222-3333-4444-555555555555";
  const prefix = "vitest run --bail=1 foo.test.js 2>&1 | tail -10";
  const plain = (t) => ({
    ts: new Date(t).toISOString(),
    command_prefix: prefix,
    rule_id: "rule-no-raw-stdout-vitest",
    decision: "escalate",
    reason: "Promoted rule matched",
    matched_pattern: "tail",
    skipped_via_override: false,
    session_id: sid,
    session_id_tier: "real",
  });
  writeEntries([
    plain(now - 5 * 60000),
    plain(now - 3 * 60000),
    plain(now - 1 * 60000),
  ]);
  const result = await checkAndEmit(root);
  assert.strictEqual(result.findings_emitted, 0, "historical rows lacking provenance must NOT auto-file");
});

await test("checkAndEmit: three explicit unexpected-match events → one finding (unchanged schema/key)", async () => {
  const now = Date.now();
  const sid = "11111111-2222-3333-4444-555555555555";
  const prefix = "cat <<'EOF'\nvitest run foo.test.js | tail\nEOF\n";
  writeEntries([
    makeEntry(now - 5 * 60000, prefix, "rule-no-raw-stdout-vitest", sid, "real", UNEXPECTED_PROV),
    makeEntry(now - 3 * 60000, prefix, "rule-no-raw-stdout-vitest", sid, "real", UNEXPECTED_PROV),
    makeEntry(now - 1 * 60000, prefix, "rule-no-raw-stdout-vitest", sid, "real", UNEXPECTED_PROV),
  ]);
  const result = await checkAndEmit(root);
  assert.strictEqual(result.findings_emitted, 1, "proven unexpected-match recurrences remain eligible");
  const lines = readFileSync(join(root, "meta-state.jsonl"), "utf8").trim().split("\n").filter(Boolean);
  assert.strictEqual(lines.length, 1);
  const finding = JSON.parse(lines[0]);
  assert.strictEqual(finding.subtype, "recurring-false-positive");
  assert.ok(finding.recurrence_key.startsWith("rule-no-raw-stdout-vitest::"), "recurrence_key unchanged shape");
});

await test("findRecurrentGroups: sample_commands are privacy-safe (hash + classes, no raw command_prefix)", async () => {
  // Automatic candidate recurrence samples must not expose raw inert payloads
  // through gate_check_recurrence: each sample is reduced to the provenance
  // classes plus a short opaque hash of the raw prefix. Pins the
  // privacySafeSample invariant (red-team #5) so a future revert to raw
  // command_prefix is caught.
  const now = Date.now();
  const sid = "11111111-2222-3333-4444-555555555555";
  const prefix = "cat <<'EOF'\nvitest run foo.test.js | tail\nEOF\n";
  writeEntries([
    makeEntry(now - 5 * 60000, prefix, "rule-no-raw-stdout-vitest", sid, "real", UNEXPECTED_PROV),
    makeEntry(now - 3 * 60000, prefix, "rule-no-raw-stdout-vitest", sid, "real", UNEXPECTED_PROV),
    makeEntry(now - 1 * 60000, prefix, "rule-no-raw-stdout-vitest", sid, "real", UNEXPECTED_PROV),
  ]);
  const groups = findRecurrentGroups(root);
  assert.strictEqual(groups.length, 1);
  const samples = groups[0].sample_commands;
  assert.ok(Array.isArray(samples) && samples.length > 0, "group carries sample_commands");
  const s = samples[0];
  assert.strictEqual(typeof s.prefix_hash, "string");
  assert.ok(s.prefix_hash.length > 0, "prefix_hash present");
  assert.strictEqual(s.match_origin, "inert-data");
  assert.strictEqual(s.candidate_kind, "unexpected-match");
  // No key for the raw command payload — only the structural fields above.
  assert.ok(!("command_prefix" in s), "sample must not carry the raw command_prefix field");
  const serialized = JSON.stringify(samples);
  assert.ok(!serialized.includes("vitest run foo.test.js | tail"),
    "sample_commands must not expose the raw inert payload");
});

await test("checkAndEmit: wrong producer marker with unexpected-match fields → zero findings (RED)", async () => {
  // A row carrying the flat unexpected-match fields but from a NON-evaluator
  // producer (toolchain-failure capture) is not an automatic candidate.
  const now = Date.now();
  const sid = "11111111-2222-3333-4444-555555555555";
  const prefix = "cat <<'EOF'\nvitest run foo.test.js | tail\nEOF\n";
  writeEntries([
    makeEntry(now - 5 * 60000, prefix, "rule-no-raw-stdout-vitest", sid, "real", { event_source: "toolchain-failure-capture", match_origin: "inert-data", candidate_kind: "unexpected-match" }),
    makeEntry(now - 3 * 60000, prefix, "rule-no-raw-stdout-vitest", sid, "real", { event_source: "toolchain-failure-capture", match_origin: "inert-data", candidate_kind: "unexpected-match" }),
    makeEntry(now - 1 * 60000, prefix, "rule-no-raw-stdout-vitest", sid, "real", { event_source: "toolchain-failure-capture", match_origin: "inert-data", candidate_kind: "unexpected-match" }),
  ]);
  const result = await checkAndEmit(root);
  assert.strictEqual(result.findings_emitted, 0, "wrong producer marker must be ineligible");
});

await test("checkAndEmit: contradictory pair (unexpected-match + executable origin) → zero findings (RED)", async () => {
  const now = Date.now();
  const sid = "11111111-2222-3333-4444-555555555555";
  const prefix = "cat <<'EOF'\nvitest run foo.test.js | tail\nEOF\n";
  writeEntries([
    makeEntry(now - 5 * 60000, prefix, "rule-no-raw-stdout-vitest", sid, "real", { event_source: "bash-gate-evaluator", match_origin: "executable", candidate_kind: "unexpected-match" }),
    makeEntry(now - 3 * 60000, prefix, "rule-no-raw-stdout-vitest", sid, "real", { event_source: "bash-gate-evaluator", match_origin: "executable", candidate_kind: "unexpected-match" }),
    makeEntry(now - 1 * 60000, prefix, "rule-no-raw-stdout-vitest", sid, "real", { event_source: "bash-gate-evaluator", match_origin: "executable", candidate_kind: "unexpected-match" }),
  ]);
  const result = await checkAndEmit(root);
  assert.strictEqual(result.findings_emitted, 0, "contradictory pair must normalize to unclassified");
});
