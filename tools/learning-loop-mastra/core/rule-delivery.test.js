import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";
import { buildProcessView, resolveHintText } from "./hint-registry.js";
import { DeliveryRequestError, deliverI2Rules } from "./rule-delivery.js";
import { buildLegacyHintEnvelope } from "./rule-delivery-compat.js";
import {
  DELIVERY_EVIDENCE_REF,
  DELIVERY_FAILURE_EVENT,
  DELIVERY_PRODUCER,
} from "./rule-delivery-logging.js";
import { deliverRulesAtStartup } from "./rule-delivery-startup.js";

function makeRule(overrides = {}) {
  return {
    id: "rule-delivery-fixture",
    entry_kind: "rule",
    internalization_level: "I2",
    pattern_type: "agent-checklist",
    pattern: JSON.stringify({
      version: 1,
      items: [{ id: "check", description: "Check the fixture" }],
    }),
    description: "An authoritative Rule description for the delivery fixture.",
    status: "active",
    promoted_at: "2026-08-13T00:00:00.000Z",
    promoted_by: "test",
    version: 0,
    ...overrides,
  };
}

function makeHintedRule(overrides = {}) {
  return makeRule({
    id: "rule-hinted-fixture",
    hint_text: "Legacy hint_text content for the compatibility envelope.",
    hint_suggestion: "A curated one-line pointer for the compatibility fixture.",
    hint_order: 10,
    ...overrides,
  });
}

// ─── native delivery: selection, ordering, budgets, provenance ──────────────

test("deliverI2Rules selects every latest active I2 Rule and orders by Rule id", () => {
  const result = deliverI2Rules({
    i2Rules: [
      makeRule({ id: "rule-zeta" }),
      makeRule({ id: "rule-alpha" }),
      makeRule({ id: "rule-beta" }),
    ],
  });

  assert.equal(result.status, "complete");
  assert.deepEqual(result.rules.map((rule) => rule.id), ["rule-alpha", "rule-beta", "rule-zeta"]);
  assert.equal(result.channel, "native");
  assert.equal(result.errors.length, 0);
  assert.equal(result.warnings.length, 0);
});

test("deliverI2Rules partitions under the char budget and never splits a Rule", () => {
  const result = deliverI2Rules({
    i2Rules: [
      makeRule({ id: "rule-long", description: "a".repeat(150) }),
      makeRule({ id: "rule-short", description: "b".repeat(50) }),
      makeRule({ id: "rule-medium", description: "c".repeat(120) }),
    ],
    charBudget: 200,
  });

  assert.equal(result.status, "complete");
  assert.ok(result.partitions.length >= 2, "content must span multiple partitions under a tight budget");
  for (const partition of result.partitions) {
    assert.ok([...partition].length <= 200, `partition must fit under the budget (${partition.length} chars)`);
  }
  // No Rule's text may be split across partitions.
  for (const rule of result.rules) {
    const marker = rule.description.slice(0, 40);
    assert.strictEqual(
      result.partitions.filter((partition) => partition.includes(marker)).length,
      1,
      `Rule ${rule.id} must appear in exactly one partition`,
    );
  }
});

test("deliverI2Rules attaches one provenance row per delivered Rule", () => {
  const result = deliverI2Rules({
    i2Rules: [makeRule({ id: "rule-alpha" }), makeRule({ id: "rule-beta" })],
    channel: "claude-session-start",
  });

  assert.deepEqual(result.provenance, [
    { rule_id: "rule-alpha", kind: "rule", source: "rule:rule-alpha", channel: "claude-session-start" },
    { rule_id: "rule-beta", kind: "rule", source: "rule:rule-beta", channel: "claude-session-start" },
  ]);
});

test("deliverI2Rules delivers the authoritative description as the partition content", () => {
  const result = deliverI2Rules({
    i2Rules: [makeRule({ id: "rule-desc", description: "The delivered content is the authoritative description." })],
  });
  assert.ok(
    result.partitions[0].includes("The delivered content is the authoritative description."),
    "partitions must carry the Rule description, not a legacy hint field",
  );
});

// ─── malformed requests fail explicitly ─────────────────────────────────────

test("deliverI2Rules rejects a non-array projection explicitly", () => {
  assert.throws(() => deliverI2Rules({ i2Rules: "not-an-array" }), DeliveryRequestError);
  assert.throws(() => deliverI2Rules({ i2Rules: { rule: makeRule() } }), DeliveryRequestError);
});

test("deliverI2Rules rejects a non-positive char budget explicitly", () => {
  assert.throws(() => deliverI2Rules({ i2Rules: [], charBudget: 0 }), DeliveryRequestError);
  assert.throws(() => deliverI2Rules({ i2Rules: [], charBudget: -5 }), DeliveryRequestError);
  assert.throws(() => deliverI2Rules({ i2Rules: [], charBudget: Number.NaN }), DeliveryRequestError);
});

test("deliverI2Rules rejects a missing channel explicitly", () => {
  assert.throws(() => deliverI2Rules({ i2Rules: [], channel: "" }), DeliveryRequestError);
  assert.throws(() => deliverI2Rules({ i2Rules: [], channel: "   " }), DeliveryRequestError);
});

// ─── degradation is never reported as successful ────────────────────────────

test("deliverI2Rules keeps usable Rules and degrades when one Rule is invalid", () => {
  const result = deliverI2Rules({
    i2Rules: [
      makeRule({ id: "rule-valid" }),
      makeRule({ id: "rule-bad", description: "too short" }),
    ],
  });

  assert.equal(result.status, "degraded");
  assert.deepEqual(result.rules.map((rule) => rule.id), ["rule-valid"]);
  assert.deepEqual(
    result.errors.map(({ code, rule_id }) => ({ code, rule_id })),
    [{ code: "missing_description", rule_id: "rule-bad" }],
  );
});

test("deliverI2Rules excludes non-I2 and inactive Rules and never reports success", () => {
  const result = deliverI2Rules({
    i2Rules: [
      makeRule({ id: "rule-i3", internalization_level: "I3", evidence_code_ref: "evidence.js" }),
      makeRule({ id: "rule-inactive", status: "inactive" }),
      makeRule({ id: "rule-valid" }),
    ],
  });

  assert.equal(result.status, "degraded");
  assert.deepEqual(result.rules.map((rule) => rule.id), ["rule-valid"]);
  assert.deepEqual(
    result.errors.map(({ code, rule_id }) => ({ code, rule_id })),
    [
      { code: "not_i2", rule_id: "rule-i3" },
      { code: "inactive_rule", rule_id: "rule-inactive" },
    ],
  );
});

test("deliverI2Rules reports an empty projection as degraded, not successful", () => {
  const result = deliverI2Rules({ i2Rules: [] });
  assert.equal(result.status, "degraded");
  assert.deepEqual(result.errors.map((error) => error.code), ["no_deliverable_rules"]);
  assert.deepEqual(result.rules, []);
  assert.deepEqual(result.partitions, []);
});

test("deliverI2Rules emits an oversized Rule as its own partition with a visible warning", () => {
  const result = deliverI2Rules({
    i2Rules: [makeRule({ id: "rule-huge", description: "x".repeat(5000) })],
    charBudget: 200,
  });

  assert.equal(result.status, "complete", "content is fully delivered; oversize is a warning, not a skip");
  assert.strictEqual(result.partitions.length, 1);
  assert.ok(result.warnings.some((warning) => warning.code === "oversized_rule"));
  assert.ok(result.partitions[0].includes("x".repeat(5000)));
});

test("deliverI2Rules does not mutate the input projection", () => {
  const i2Rules = [makeRule({ id: "rule-zeta" }), makeRule({ id: "rule-alpha" })];
  deliverI2Rules({ i2Rules });
  assert.deepEqual(i2Rules.map((rule) => rule.id), ["rule-zeta", "rule-alpha"]);
});

// ─── one-way legacy Hint compatibility adapter ──────────────────────────────

test("compatibility adapter preserves legacy identity, content, and observed ordering", () => {
  const i2Rules = [
    makeHintedRule({ id: "rule-late", hint_order: 30 }),
    makeHintedRule({ id: "rule-early", hint_order: 10, hint_slug: "custom-early" }),
    makeHintedRule({ id: "rule-no-order", hint_order: undefined }),
  ];

  const envelope = buildLegacyHintEnvelope({ i2Rules, channel: "claude-session-start" });

  assert.equal(envelope.status, "complete");
  // identity: hint_slug ?? id-derived slug, ordered by hint_order (absent → append-by-slug)
  assert.deepEqual(envelope.hints.map((hint) => hint.slug), ["custom-early", "late", "no-order"]);
  // content: legacy hint_text when present
  assert.equal(envelope.hints[0].text, "Legacy hint_text content for the compatibility envelope.");
  // kind/tier/shape parity with the legacy rule-derived process view
  assert.ok(envelope.hints.every((hint) => hint.kind === "process" && (hint.tier ?? "startup") === "startup"));
});

test("compatibility adapter preserves legacy drop semantics when hint_text is absent", () => {
  const envelope = buildLegacyHintEnvelope({
    i2Rules: [makeRule({ id: "rule-no-hint-text", description: "Authoritative description used as envelope content." })],
  });
  assert.equal(envelope.status, "degraded");
  assert.deepEqual(envelope.hints, []);
  assert.ok(envelope.errors.some((error) => error.code === "missing_hint_text"));
});

test("compatibility adapter skips slug collisions first-wins with a warning", () => {
  const envelope = buildLegacyHintEnvelope({
    i2Rules: [
      makeRule({ id: "rule-alpha", hint_slug: "shared", hint_text: "first content" }),
      makeRule({ id: "rule-beta", hint_slug: "shared", hint_text: "second content" }),
    ],
  });
  assert.deepEqual(envelope.hints.map((hint) => hint.slug), ["shared"]);
  assert.equal(envelope.hints[0].text, "first content");
  assert.ok(envelope.warnings.some((warning) => warning.includes('"shared"') && warning.includes("collides")));
});

test("compatibility adapter never reports an empty envelope as successful", () => {
  const envelope = buildLegacyHintEnvelope({ i2Rules: [] });
  assert.equal(envelope.status, "degraded");
  assert.deepEqual(envelope.errors.map((error) => error.code), ["no_deliverable_hints"]);
});

test("compatibility adapter rejects malformed requests explicitly", () => {
  assert.throws(() => buildLegacyHintEnvelope({ i2Rules: null }), DeliveryRequestError);
  assert.throws(() => buildLegacyHintEnvelope({ i2Rules: [], charBudget: "10k" }), DeliveryRequestError);
});

test("delivery rejects an active I2 Rule without an id instead of fabricating provenance", () => {
  const result = deliverI2Rules({
    i2Rules: [makeRule({ id: undefined })],
  });
  assert.equal(result.status, "degraded");
  assert.deepEqual(result.rules, []);
  assert.deepEqual(result.errors.map(({ code }) => code), ["invalid_rule", "no_deliverable_rules"]);
  assert.deepEqual(result.provenance, []);
});

// ─── differential: Rule Delivery + adapter vs the old hint path ─────────────

test("differential: adapter envelopes match the legacy rule-derived process view on identical fixtures", () => {
  const i2Rules = [
    makeHintedRule({ id: "rule-bravo", hint_order: 20 }),
    makeHintedRule({ id: "rule-alpha", hint_order: 10 }),
    makeHintedRule({ id: "rule-charlie", hint_order: 30 }),
    makeHintedRule({ id: "rule-delta" }),
  ];
  const rulesById = new Map(i2Rules.map((rule) => [rule.id, rule]));

  // Old hint path: buildProcessView derived rows + shared resolveHintText.
  const legacyDerived = buildProcessView({ rulesById })
    .filter((entry) => (entry.tier ?? "startup") === "startup")
    .map((entry) => ({
      slug: entry.slug,
      text: resolveHintText(entry, rulesById),
      order: entry.order,
    }))
    .filter((entry) => entry.text !== null);

  // New path: Rule Delivery + one-way compatibility adapter.
  const envelope = buildLegacyHintEnvelope({ i2Rules });

  assert.equal(envelope.hints.length, legacyDerived.length, "same derived row count");
  const newHints = envelope.hints.map((hint) => ({
    slug: hint.slug,
    text: hint.text,
    order: hint.order,
  }));
  assert.deepEqual(newHints, legacyDerived, "identity, content, and observed ordering must match the legacy path");
});

test("differential: partition size accounting and truncation match the legacy greedy split", () => {
  const i2Rules = [
    makeHintedRule({ id: "rule-alpha", hint_order: 10, hint_text: "s".repeat(120) }),
    makeHintedRule({ id: "rule-beta", hint_order: 20, hint_text: "t".repeat(120) }),
  ];
  const budget = 150;
  const envelope = buildLegacyHintEnvelope({ i2Rules, charBudget: budget });

  // The legacy greedy split pushes each 120-char line into its own partition
  // when the prefix + separator would overflow the budget.
  assert.equal(envelope.partitions.length, 2);
  for (const partition of envelope.partitions) {
    assert.ok([...partition].length <= budget, "adapter partitions must obey the legacy char budget");
  }
});

test("differential: dedup, degradation, and provenance match the legacy rule-derived process view", () => {
  const i2Rules = [
    makeHintedRule({ id: "rule-alpha", hint_order: 10, hint_slug: "shared" }),
    makeHintedRule({ id: "rule-beta", hint_order: 20, hint_slug: "shared" }),
    makeHintedRule({ id: "rule-gamma", hint_order: 30 }),
    // A rule with no hint_text AND no usable description — dropped by both paths.
    makeRule({ id: "rule-bad", description: "short" }),
  ];
  const rulesById = new Map(i2Rules.map((rule) => [rule.id, rule]));

  // Old hint path: startup-tier buildProcessView derived rows, deduped (first-wins slug),
  // with unrenderable rows dropped via resolveHintText.
  const legacyDerived = buildProcessView({ rulesById })
    .filter((entry) => (entry.tier ?? "startup") === "startup")
    .map((entry) => ({ slug: entry.slug, text: resolveHintText(entry, rulesById), order: entry.order }))
    .filter((entry) => entry.text !== null);

  // New path: Rule Delivery + one-way compatibility adapter.
  const envelope = buildLegacyHintEnvelope({ i2Rules, channel: "claude-session-start" });

  // Dedup + degradation parity: same surviving slugs, same content, same order.
  assert.deepEqual(
    envelope.hints.map((hint) => ({ slug: hint.slug, text: hint.text, order: hint.order })),
    legacyDerived,
    "identity, content, observed order, and dedup must match the legacy path",
  );
  assert.ok(envelope.warnings.some((warning) => warning.includes('"shared"') && warning.includes("collides")));
  assert.equal(envelope.status, "degraded", "a dropped Rule must degrade the envelope");
  assert.ok(envelope.errors.some((error) => error.code === "missing_hint_text" && error.rule_id === "rule-bad"));

  // Provenance parity: one provenance row per surviving slug, source = rule id.
  assert.deepEqual(
    envelope.provenance.map((p) => p.slug),
    envelope.hints.map((hint) => hint.slug),
  );
  assert.ok(envelope.provenance.every((p) => p.source.startsWith("rule:") && p.channel === "claude-session-start"));
  assert.deepEqual(
    envelope.provenance.map((p) => p.slug),
    legacyDerived.map((entry) => entry.slug),
    "provenance slugs must mirror the legacy surviving set",
  );
});

// ─── startup seam: fail-open + decision-log logging ─────────────────────────

function writeRegistry(root, lines) {
  writeFileSync(join(root, "meta-state.jsonl"), lines.join("\n") + "\n");
}

function readDecisionLog(root) {
  const path = join(root, ".claude", "coordination", ".gate-decision.log");
  try {
    return readFileSync(path, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

test("deliverRulesAtStartup logs a degraded Rule through the shared decision log and stays fail-open", () => {
  const root = mkdtempSync(join(tmpdir(), "rule-delivery-startup-"));
  try {
    // A Rule rejected at the index (short description) never reaches the I2
    // projection — the startup seam must surface the dropped obligation as a
    // delivery failure instead of reporting complete.
    writeRegistry(root, [
      JSON.stringify(makeRule({ id: "rule-valid" })),
      JSON.stringify(makeRule({ id: "rule-bad", description: "too short" })),
    ]);

    const result = deliverRulesAtStartup({ root });

    assert.equal(result.status, "degraded");
    assert.deepEqual(result.rules.map((rule) => rule.id), ["rule-valid"]);
    const entries = readDecisionLog(root);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].event_source, DELIVERY_PRODUCER);
    assert.equal(entries[0].event, DELIVERY_FAILURE_EVENT);
    assert.equal(entries[0].rule_id, "rule-bad");
    assert.equal(entries[0].command_prefix, "delivery:invalid_rule");
    assert.equal(entries[0].error_code, "invalid_rule");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("deliverRulesAtStartup is fail-open when the registry is unreadable", () => {
  const root = mkdtempSync(join(tmpdir(), "rule-delivery-missing-registry-"));
  try {
    const result = deliverRulesAtStartup({ root });
    assert.equal(result.status, "degraded");
    assert.deepEqual(result.rules, []);
    const entries = readDecisionLog(root);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].event, DELIVERY_FAILURE_EVENT);
    assert.equal(entries[0].error_code, "no_deliverable_rules");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("deliverRulesAtStartup does not log when delivery is complete", () => {
  const root = mkdtempSync(join(tmpdir(), "rule-delivery-complete-"));
  try {
    writeRegistry(root, [JSON.stringify(makeRule({ id: "rule-valid" }))]);
    const result = deliverRulesAtStartup({ root });
    assert.equal(result.status, "complete");
    assert.equal(readDecisionLog(root).length, 0, "a complete delivery logs no failures");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("deliverRulesAtStartup treats a cleanly-empty I2 registry as a complete zero-I2 state", () => {
  const root = mkdtempSync(join(tmpdir(), "rule-delivery-zero-i2-"));
  try {
    // Registry present and cleanly compiled, but no active I2 Rules.
    writeRegistry(root, [
      JSON.stringify({
        id: "meta-some-finding",
        entry_kind: "finding",
        status: "open",
        severity: "warning",
        affected_system: "meta",
        description: "A finding that is not an I2 Rule obligation.",
        created_at: "2026-08-13T00:00:00.000Z",
      }),
    ]);
    const result = deliverRulesAtStartup({ root });
    assert.equal(result.status, "complete", "a clean zero-I2 registry must not degrade delivery");
    assert.deepEqual(result.rules, []);
    assert.equal(readDecisionLog(root).length, 0, "no failure may be logged for a legitimate zero-I2 state");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("deliverRulesAtStartup logs an unexpected registry-read failure through the shared decision log", () => {
  const root = mkdtempSync(join(tmpdir(), "rule-delivery-throw-"));
  const outsideRoot = mkdtempSync(join(tmpdir(), "rule-delivery-throw-outside-"));
  try {
    // An I3 evidence reference outside the root makes readRuleIndex throw a
    // containment failure — the startup seam must degrade AND log it (every
    // delivery failure is logged, never silently dropped).
    writeRegistry(root, [
      JSON.stringify({
        id: "rule-outside-evidence",
        entry_kind: "rule",
        internalization_level: "I3",
        pattern_type: "regex",
        pattern: "fixture",
        description: "An I3 Rule whose evidence reference is outside the root.",
        status: "active",
        promoted_at: "2026-08-13T00:00:00.000Z",
        promoted_by: "test",
        version: 0,
        evidence_code_ref: join(outsideRoot, "evidence.js"),
      }),
    ]);
    const result = deliverRulesAtStartup({ root });
    assert.equal(result.status, "degraded");
    assert.deepEqual(result.errors.map((error) => error.code), ["startup_check_failed"]);
    const entries = readDecisionLog(root);
    assert.equal(entries.length, 1, "the unexpected failure must be logged, not dropped");
    assert.equal(entries[0].event, DELIVERY_FAILURE_EVENT);
    assert.equal(entries[0].error_code, "startup_check_failed");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outsideRoot, { recursive: true, force: true });
  }
});
