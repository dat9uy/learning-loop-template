import assert from "node:assert";
import { test, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { checkAndEmit, findRecurrentGroups } from "../../core/recurrence-tracker.js";

/**
 * L2 event-class contract (plan 260809-1538, Phase 1 RED baseline → shipped).
 *
 * The recurrence tracker must NOT infer candidate kind from `rule_id`, reason,
 * command prefix, or key collision. Only an EXPLICIT, evaluator-produced
 * `unexpected-match` event (proven inert-data origin + trusted producer marker)
 * is eligible for automatic promoted-rule recurrence filing. Ordinary rule
 * fires and unclassified/legacy rows are telemetry.
 *
 * The eligibility assertions were RED against the pre-Phase-4 tracker (which
 * filed a finding for ANY repeated rule_id event) and are GREEN since the
 * recurrence-candidate filter shipped.
 */

let root;

beforeEach(() => {
  root = join(tmpdir(), `cmd-class-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

const SID = "11111111-2222-3333-4444-555555555555";
const VITEST_READER = "vitest run --bail=1 foo.test.js 2>&1 | tail -10";
const INERT_VITEST = "cat <<'EOF'\nvitest run foo.test.js | tail\nEOF\n";

const ORDINARY = { event_source: "bash-gate-evaluator", match_origin: "executable", candidate_kind: "ordinary-rule-fire" };
const UNEXPECTED = { event_source: "bash-gate-evaluator", match_origin: "inert-data", candidate_kind: "unexpected-match" };

// Provenance-aware synthetic decision-log entry. Defaults match the current
// capture shape (no provenance) so a test can exercise legacy rows by passing
// no overrides.
function makeEvent(ts, prefix, overrides = {}) {
  return {
    ts: new Date(ts).toISOString(),
    command_prefix: prefix,
    rule_id: "rule-no-raw-stdout-vitest",
    decision: "escalate",
    reason: "Promoted rule matched",
    matched_pattern: "tail",
    skipped_via_override: false,
    session_id: SID,
    session_id_tier: "real",
    ...overrides,
  };
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

await test("three ordinary-rule-fire events → telemetry only, zero emitted findings", async () => {
  const now = Date.now();
  writeEntries([
    makeEvent(now - 5 * 60000, VITEST_READER, ORDINARY),
    makeEvent(now - 3 * 60000, VITEST_READER, ORDINARY),
    makeEvent(now - 1 * 60000, VITEST_READER, ORDINARY),
  ]);
  const groups = findRecurrentGroups(root);
  assert.strictEqual(groups.length, 0, "ordinary fires must not enter a recurrence group — telemetry only");
  const result = await checkAndEmit(root);
  assert.strictEqual(result.entries_scanned, 3);
  assert.strictEqual(result.findings_emitted, 0, "ordinary rule fires must NOT auto-file a finding");
});

await test("three explicit unexpected-match events → one recurrence candidate", async () => {
  const now = Date.now();
  writeEntries([
    makeEvent(now - 5 * 60000, INERT_VITEST, UNEXPECTED),
    makeEvent(now - 3 * 60000, INERT_VITEST, UNEXPECTED),
    makeEvent(now - 1 * 60000, INERT_VITEST, UNEXPECTED),
  ]);
  const result = await checkAndEmit(root);
  assert.strictEqual(result.findings_emitted, 1, "proven unexpected-match recurrences remain eligible");
});

await test("legacy rows without provenance → telemetry only, zero findings", async () => {
  const now = Date.now();
  // Current capture shape: no event_source / match_origin / candidate_kind.
  writeEntries([
    makeEvent(now - 5 * 60000, VITEST_READER),
    makeEvent(now - 3 * 60000, VITEST_READER),
    makeEvent(now - 1 * 60000, VITEST_READER),
  ]);
  const result = await checkAndEmit(root);
  assert.strictEqual(result.findings_emitted, 0, "historical rows lacking provenance must NOT auto-file");
});

await test("contradictory pair (unexpected-match + executable origin) → unclassified, zero findings", async () => {
  const now = Date.now();
  writeEntries([
    makeEvent(now - 5 * 60000, INERT_VITEST, { event_source: "bash-gate-evaluator", match_origin: "executable", candidate_kind: "unexpected-match" }),
    makeEvent(now - 3 * 60000, INERT_VITEST, { event_source: "bash-gate-evaluator", match_origin: "executable", candidate_kind: "unexpected-match" }),
    makeEvent(now - 1 * 60000, INERT_VITEST, { event_source: "bash-gate-evaluator", match_origin: "executable", candidate_kind: "unexpected-match" }),
  ]);
  const result = await checkAndEmit(root);
  assert.strictEqual(result.findings_emitted, 0, "contradictory pair must normalize to unclassified");
});

await test("contradictory pair (ordinary-rule-fire + inert-data origin) → unclassified, zero findings", async () => {
  const now = Date.now();
  writeEntries([
    makeEvent(now - 5 * 60000, INERT_VITEST, { event_source: "bash-gate-evaluator", match_origin: "inert-data", candidate_kind: "ordinary-rule-fire" }),
    makeEvent(now - 3 * 60000, INERT_VITEST, { event_source: "bash-gate-evaluator", match_origin: "inert-data", candidate_kind: "ordinary-rule-fire" }),
    makeEvent(now - 1 * 60000, INERT_VITEST, { event_source: "bash-gate-evaluator", match_origin: "inert-data", candidate_kind: "ordinary-rule-fire" }),
  ]);
  const result = await checkAndEmit(root);
  assert.strictEqual(result.findings_emitted, 0, "inverse contradiction must normalize to unclassified");
});

await test("wrong producer marker with unexpected-match fields → zero findings", async () => {
  // A row carrying the flat unexpected-match fields but from a NON-evaluator
  // producer is not automatically trusted — only the evaluator producer path
  // marks an automatic candidate.
  const now = Date.now();
  writeEntries([
    makeEvent(now - 5 * 60000, INERT_VITEST, { event_source: "toolchain-failure-capture", match_origin: "inert-data", candidate_kind: "unexpected-match" }),
    makeEvent(now - 3 * 60000, INERT_VITEST, { event_source: "toolchain-failure-capture", match_origin: "inert-data", candidate_kind: "unexpected-match" }),
    makeEvent(now - 1 * 60000, INERT_VITEST, { event_source: "toolchain-failure-capture", match_origin: "inert-data", candidate_kind: "unexpected-match" }),
  ]);
  const result = await checkAndEmit(root);
  assert.strictEqual(result.findings_emitted, 0, "wrong producer marker must be ineligible");
});

await test("mixed origin / unclassified kind → zero findings", async () => {
  const now = Date.now();
  writeEntries([
    makeEvent(now - 5 * 60000, INERT_VITEST, { event_source: "bash-gate-evaluator", match_origin: "mixed", candidate_kind: "unclassified" }),
    makeEvent(now - 3 * 60000, INERT_VITEST, { event_source: "bash-gate-evaluator", match_origin: "mixed", candidate_kind: "unclassified" }),
    makeEvent(now - 1 * 60000, INERT_VITEST, { event_source: "bash-gate-evaluator", match_origin: "mixed", candidate_kind: "unclassified" }),
  ]);
  const result = await checkAndEmit(root);
  assert.strictEqual(result.findings_emitted, 0, "mixed/unknown provenance must stay telemetry-only");
});

await test("cross-surface same-identity provenance disagreement fails closed (no finding)", async () => {
  // Same dedup identity (ts/prefix/rule/decision/session) on two surfaces but
  // with DIFFERENT provenance. Surface-order dedup must not select a winner:
  // disagreement downgrades to unknown → no automatic finding.
  const now = Date.now();
  const ts = [now - 5 * 60000, now - 3 * 60000, now - 1 * 60000];
  const mk = (t, prov) => makeEvent(t, INERT_VITEST, prov);
  mkdirSync(join(root, ".claude", "coordination"), { recursive: true });
  mkdirSync(join(root, ".factory", "coordination"), { recursive: true });
  // Distinct per-identity timestamps (i-based disambiguation) so each
  // ts/prefix/rule/decision/session identity has ONE conflicting pair across
  // the two surfaces — the cross-surface reader dedupes by exact identity, so
  // an ms collision would otherwise collapse the three into one row whose
  // surface winner already won before the disagreement check runs.
  writeFileSync(decisionLogPath(".claude"), ts.map((t, i) => JSON.stringify(mk(t + i, UNEXPECTED))).join("\n") + "\n");
  writeFileSync(decisionLogPath(".factory"), ts.map((t, i) => JSON.stringify(mk(t + i, ORDINARY))).join("\n") + "\n");
  const result = await checkAndEmit(root);
  assert.strictEqual(result.findings_emitted, 0, "cross-surface provenance disagreement must fail closed");
});

await test("toolchain-failure events remain on their own branch (unchanged semantics)", async () => {
  const now = Date.now();
  writeEntries([
    makeEvent(now - 5 * 60000, "pnpm test:unit", { rule_id: "toolchain-failure", event_source: "toolchain-failure-capture" }),
    makeEvent(now - 3 * 60000, "pnpm test:unit", { rule_id: "toolchain-failure", event_source: "toolchain-failure-capture" }),
    makeEvent(now - 1 * 60000, "pnpm test:unit", { rule_id: "toolchain-failure", event_source: "toolchain-failure-capture" }),
  ]);
  const result = await checkAndEmit(root);
  assert.strictEqual(result.findings_emitted, 1, "toolchain-failure recurrence must retain current semantics");
});
