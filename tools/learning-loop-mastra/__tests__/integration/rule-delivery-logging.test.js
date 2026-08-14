import assert from "node:assert/strict";
import { test, beforeEach, afterEach } from "vitest";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  DELIVERY_FAILURE_EVENT,
  DELIVERY_PRODUCER,
  logDeliveryFailure,
} from "../../core/rule-delivery-logging.js";
import { readDecisionLog } from "../../core/gate-decision-log.js";
import { checkAndEmit, findRecurrentGroups } from "../../core/recurrence-tracker.js";
import { deliverRulesAtStartup } from "../../core/rule-delivery-startup.js";
import { SURFACES } from "../../core/surfaces.js";

let root;

beforeEach(() => {
  root = join(tmpdir(), `rule-delivery-logging-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(root, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function decisionLogPath(surface) {
  return join(root, surface, "coordination", ".gate-decision.log");
}

function writeDecisionLog(entries, surfaces = SURFACES) {
  for (const surface of surfaces) {
    mkdirSync(join(root, surface, "coordination"), { recursive: true });
    writeFileSync(decisionLogPath(surface), entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
  }
}

function deliveryFailure({ ts, ruleId, errorCode, sessionId, sessionTier = "real", message = "" } = {}) {
  return {
    command_prefix: `delivery:${errorCode}`,
    rule_id: ruleId ?? DELIVERY_PRODUCER,
    decision: DELIVERY_FAILURE_EVENT,
    reason: message,
    matched_pattern: "i2-rule-delivery",
    skipped_via_override: false,
    session_id: sessionId ?? null,
    session_id_tier: sessionTier,
    event_source: DELIVERY_PRODUCER,
    event: DELIVERY_FAILURE_EVENT,
    error_code: errorCode,
    ...(ts ? { ts } : {}),
  };
}

const SID = "11111111-2222-3333-4444-555555555555";

// ─── shared decision-log seam ───────────────────────────────────────────────

await test("delivery failures append through the shared decision log with a distinct producer + event type", () => {
  logDeliveryFailure(root, {
    ruleId: "rule-alpha",
    errorCode: "missing_description",
    message: "Rule rule-alpha lacks an authoritative description",
    sessionId: SID,
    sessionTier: "real",
  });

  const entries = readDecisionLog(root);
  assert.equal(entries.length, 1);
  const entry = entries[0];
  assert.equal(entry.event_source, DELIVERY_PRODUCER);
  assert.equal(entry.event, DELIVERY_FAILURE_EVENT);
  assert.equal(entry.decision, DELIVERY_FAILURE_EVENT);
  assert.equal(entry.rule_id, "rule-alpha");
  assert.equal(entry.command_prefix, "delivery:missing_description");
  assert.equal(entry.error_code, "missing_description");
  // Never shaped as a gate decision or unexpected-match event.
  assert.notEqual(entry.event_source, "bash-gate-evaluator");
  assert.notEqual(entry.candidate_kind, "unexpected-match");
});

// ─── recurrence: group by producer, error code, and Rule id ─────────────────

await test("findRecurrentGroups groups 3 delivery-failure entries in one session by (rule, error code)", () => {
  const now = Date.now();
  writeDecisionLog([
    deliveryFailure({ ts: new Date(now - 5 * 60000), ruleId: "rule-alpha", errorCode: "missing_description", sessionId: SID }),
    deliveryFailure({ ts: new Date(now - 3 * 60000), ruleId: "rule-alpha", errorCode: "missing_description", sessionId: SID }),
    deliveryFailure({ ts: new Date(now - 1 * 60000), ruleId: "rule-alpha", errorCode: "missing_description", sessionId: SID }),
  ]);

  const groups = findRecurrentGroups(root);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].count, 3);
  assert.equal(groups[0].rule_id, "rule-alpha");
  assert.equal(groups[0].command_prefix_normalized, "delivery:missing_description");
});

await test("findRecurrentGroups separates delivery failures by error code and Rule id", () => {
  const now = Date.now();
  writeDecisionLog([
    // 3 × missing_description for rule-alpha
    deliveryFailure({ ts: new Date(now - 5 * 60000), ruleId: "rule-alpha", errorCode: "missing_description", sessionId: SID }),
    deliveryFailure({ ts: new Date(now - 4 * 60000), ruleId: "rule-alpha", errorCode: "missing_description", sessionId: SID }),
    deliveryFailure({ ts: new Date(now - 3 * 60000), ruleId: "rule-alpha", errorCode: "missing_description", sessionId: SID }),
    // 3 × no_deliverable_rules for a different rule id
    deliveryFailure({ ts: new Date(now - 2 * 60000), ruleId: "rule-beta", errorCode: "no_deliverable_rules", sessionId: SID }),
    deliveryFailure({ ts: new Date(now - 1 * 60000), ruleId: "rule-beta", errorCode: "no_deliverable_rules", sessionId: SID }),
    deliveryFailure({ ts: new Date(now - 0 * 60000), ruleId: "rule-beta", errorCode: "no_deliverable_rules", sessionId: SID }),
  ]);

  const groups = findRecurrentGroups(root);
  assert.equal(groups.length, 2, "delivery failures must group by (error code, Rule id)");
  const byRule = new Map(groups.map((group) => [group.rule_id, group]));
  assert.equal(byRule.get("rule-alpha").count, 3);
  assert.equal(byRule.get("rule-alpha").command_prefix_normalized, "delivery:missing_description");
  assert.equal(byRule.get("rule-beta").count, 3);
  assert.equal(byRule.get("rule-beta").command_prefix_normalized, "delivery:no_deliverable_rules");
});

await test("findRecurrentGroups never collapses delivery failures with unexpected-match events", () => {
  const now = Date.now();
  const prefix = "pnpm test";
  const unexpectedMatch = (ts) => ({
    ts,
    command_prefix: prefix,
    rule_id: "rule-alpha",
    decision: "ok",
    reason: "inert-data match",
    matched_pattern: null,
    skipped_via_override: false,
    session_id: SID,
    session_id_tier: "real",
    event_source: "bash-gate-evaluator",
    match_origin: "inert-data",
    candidate_kind: "unexpected-match",
  });
  writeDecisionLog([
    deliveryFailure({ ts: new Date(now - 5 * 60000), ruleId: "rule-alpha", errorCode: "missing_description", sessionId: SID }),
    deliveryFailure({ ts: new Date(now - 4 * 60000), ruleId: "rule-alpha", errorCode: "missing_description", sessionId: SID }),
    deliveryFailure({ ts: new Date(now - 3 * 60000), ruleId: "rule-alpha", errorCode: "missing_description", sessionId: SID }),
    unexpectedMatch(new Date(now - 3 * 60000)),
    unexpectedMatch(new Date(now - 2 * 60000)),
    unexpectedMatch(new Date(now - 1 * 60000)),
  ]);

  const groups = findRecurrentGroups(root);
  const deliveryGroups = groups.filter((group) => group.command_prefix_normalized.startsWith("delivery:"));
  const gateGroups = groups.filter((group) => !group.command_prefix_normalized.startsWith("delivery:"));
  assert.equal(deliveryGroups.length, 1, "delivery failures form their own group");
  assert.equal(gateGroups.length, 1, "unexpected-match events form their own group");
  assert.ok(deliveryGroups[0].delivery_failure === true, "delivery group must carry the delivery_failure marker");
  assert.ok(gateGroups[0].delivery_failure !== true, "unexpected-match group must not carry the delivery_failure marker");
});

await test("findRecurrentGroups keeps delivery producer identity separate from same-shaped gate events", () => {
  const now = Date.now();
  const deliveryRows = [
    deliveryFailure({ ts: new Date(now - 5 * 60000), ruleId: "rule-alpha", errorCode: "missing_description", sessionId: SID }),
    deliveryFailure({ ts: new Date(now - 4 * 60000), ruleId: "rule-alpha", errorCode: "missing_description", sessionId: SID }),
    deliveryFailure({ ts: new Date(now - 3 * 60000), ruleId: "rule-alpha", errorCode: "missing_description", sessionId: SID }),
  ];
  const gateRows = deliveryRows.map((entry) => ({
    ...entry,
    decision: "ok",
    event_source: "bash-gate-evaluator",
    event: "unexpected-match",
    candidate_kind: "unexpected-match",
    match_origin: "inert-data",
  }));
  writeDecisionLog([...deliveryRows, ...gateRows]);

  const groups = findRecurrentGroups(root);
  assert.equal(groups.length, 2, "producer identity must be part of recurrence grouping");
  assert.equal(groups.filter((group) => group.delivery_failure === true).length, 1);
  assert.equal(groups.filter((group) => group.delivery_failure !== true).length, 1);
});

await test("findRecurrentGroups requires the delivery producer+event pair (wrong producer is telemetry-only)", () => {
  const now = Date.now();
  writeDecisionLog([
    {
      ts: new Date(now - 5 * 60000),
      command_prefix: "delivery:missing_description",
      rule_id: "rule-alpha",
      decision: "delivery-failure",
      reason: "x",
      matched_pattern: "i2-rule-delivery",
      skipped_via_override: false,
      session_id: SID,
      session_id_tier: "real",
      // wrong producer — a gate decision row with a delivery-shaped prefix
      event_source: "bash-gate-evaluator",
      event: "unexpected-match",
    },
    deliveryFailure({ ts: new Date(now - 4 * 60000), ruleId: "rule-alpha", errorCode: "missing_description", sessionId: SID }),
    deliveryFailure({ ts: new Date(now - 3 * 60000), ruleId: "rule-alpha", errorCode: "missing_description", sessionId: SID }),
    deliveryFailure({ ts: new Date(now - 2 * 60000), ruleId: "rule-alpha", errorCode: "missing_description", sessionId: SID }),
  ]);

  const groups = findRecurrentGroups(root);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].count, 3, "the wrong-producer row must stay telemetry-only");
});

// ─── recurrence: findings at the existing threshold ─────────────────────────

await test("checkAndEmit promotes a recurrent delivery failure to a Finding", async () => {
  const now = Date.now();
  writeDecisionLog([
    deliveryFailure({ ts: new Date(now - 5 * 60000), ruleId: "rule-alpha", errorCode: "missing_description", sessionId: SID }),
    deliveryFailure({ ts: new Date(now - 3 * 60000), ruleId: "rule-alpha", errorCode: "missing_description", sessionId: SID }),
    deliveryFailure({ ts: new Date(now - 1 * 60000), ruleId: "rule-alpha", errorCode: "missing_description", sessionId: SID }),
  ]);

  const result = await checkAndEmit(root);
  assert.equal(result.findings_emitted, 1);
  assert.equal(result.checked_groups, 1);

  const lines = readFileSync(join(root, "meta-state.jsonl"), "utf8").trim().split("\n").filter(Boolean);
  assert.equal(lines.length, 1);
  const finding = JSON.parse(lines[0]);
  assert.equal(finding.entry_kind, "finding");
  assert.equal(finding.subtype, "recurring-false-positive");
  assert.ok(finding.recurrence_key.startsWith("rule-alpha::"), "recurrence_key must partition by the failing Rule id");
  assert.equal(finding.evidence_code_ref, "tools/learning-loop-mastra/core/rule-delivery.js");
  assert.equal(finding.affected_system, "meta");
  assert.ok(finding.description.includes("Rule Delivery failed"), "finding must describe the delivery failure");
});

await test("checkAndEmit dedupes a delivery-failure finding against an existing recurring-false-positive", async () => {
  const now = Date.now();
  writeDecisionLog([
    deliveryFailure({ ts: new Date(now - 5 * 60000), ruleId: "rule-alpha", errorCode: "missing_description", sessionId: SID }),
    deliveryFailure({ ts: new Date(now - 3 * 60000), ruleId: "rule-alpha", errorCode: "missing_description", sessionId: SID }),
    deliveryFailure({ ts: new Date(now - 1 * 60000), ruleId: "rule-alpha", errorCode: "missing_description", sessionId: SID }),
  ]);

  // First run files the finding.
  const first = await checkAndEmit(root);
  assert.equal(first.findings_emitted, 1);
  // Second run must dedupe against the now-present finding.
  const second = await checkAndEmit(root);
  assert.equal(second.findings_emitted, 0);

  const lines = readFileSync(join(root, "meta-state.jsonl"), "utf8").trim().split("\n").filter(Boolean);
  assert.equal(lines.length, 1);
});

// ─── startup seam end-to-end ────────────────────────────────────────────────

await test("startup delivery failures log through the decision log and the recurrence tracker promotes them", async () => {
  // A registry whose I2 Rule is rejected at the index → startup delivery is
  // degraded and logs a delivery-failure row.
  writeFileSync(
    join(root, "meta-state.jsonl"),
    JSON.stringify({
      id: "rule-broken",
      entry_kind: "rule",
      internalization_level: "I2",
      pattern_type: "agent-checklist",
      pattern: JSON.stringify({ version: 1, items: [] }),
      description: "too short",
      status: "active",
      promoted_at: "2026-08-13T00:00:00.000Z",
      promoted_by: "test",
      version: 0,
    }) + "\n",
  );

  const result = deliverRulesAtStartup({ root, sessionId: SID, sessionTier: "real" });
  assert.equal(result.status, "degraded");
  const entries = readDecisionLog(root);
  // Two honest delivery failures: the invalid Rule (rejected at the index)
  // AND the empty I2 projection it leaves behind.
  assert.equal(entries.length, 2);
  assert.ok(entries.every((entry) => entry.event_source === DELIVERY_PRODUCER));
  assert.deepEqual(
    new Set(entries.map((entry) => entry.rule_id)),
    new Set(["rule-broken", DELIVERY_PRODUCER]),
  );

  // Recur across three startup delivery attempts (same session) and promote.
  const decisionLogLines = readFileSync(decisionLogPath(".claude"), "utf8").trim().split("\n").filter(Boolean);
  const oneEntry = JSON.parse(decisionLogLines[0]);
  const repeated = [0, 1, 2].map((i) => ({ ...oneEntry, ts: new Date(Date.now() - (3 - i) * 60000).toISOString() }));
  writeDecisionLog(repeated, [".claude"]);

  const emitted = await checkAndEmit(root);
  assert.equal(emitted.findings_emitted, 1);
  const finding = JSON.parse(
    readFileSync(join(root, "meta-state.jsonl"), "utf8").trim().split("\n").filter(Boolean).at(-1),
  );
  assert.equal(finding.evidence_code_ref, "tools/learning-loop-mastra/core/rule-delivery.js");
});
