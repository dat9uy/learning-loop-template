// Snapshot test for meta_state_relationships wire shape.
// Verifies the reimplemented tool (dispatching via factoryFor) produces
// correct wire format. Includes a legacy finding fixture (no promoted_to_rule)
// to exercise the dual-field migration logic.

import { test } from "vitest";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  FINDING_FIXTURE, LEGACY_FINDING_FIXTURE, RULE_FIXTURE,
  RULE_FOR_LEGACY_FIXTURE, CHANGELOG_FIXTURE, LOOPDESIGN_FIXTURE, ALL_FIXTURES,
} from "./fixtures/meta-state-fixtures.js";

// Use GATE_ROOT env var to point resolveRoot at our temp dir.
// Must set before importing the tool (ES module caching means the tool
// is imported once; we set GATE_ROOT per-test via process.env).

function createTempRegistry() {
  const dir = mkdtempSync(join(tmpdir(), "snapshot-test-"));
  const lines = ALL_FIXTURES.map((e) => JSON.stringify(e)).join("\n") + "\n";
  writeFileSync(join(dir, "meta-state.jsonl"), lines, "utf8");
  return dir;
}

// Import the tool once (module-level). We set GATE_ROOT before each handler call.
const { metaStateRelationshipsTool } = await import("../../tools/handlers/meta-state-relationships-tool.js");

// --- Finding (with promoted_to_rule) ---

test("finding wire shape (outbound + inbound)", async () => {
  const dir = createTempRegistry();
  try {
    process.env.GATE_ROOT = dir;
    const result = await metaStateRelationshipsTool.handler({ id: "meta-test-finding", direction: "both" });
    const actual = JSON.parse(result.content[0].text);

    assert.strictEqual(actual.id, "meta-test-finding");
    assert.strictEqual(actual.direction, "both");
    assert.strictEqual(actual.entry_kind, "finding");

    // Outbound
    assert.ok(actual.outbound, "outbound must not be null");
    assert.strictEqual(actual.outbound.consolidated_into, "meta-test-changelog");
    assert.strictEqual(actual.outbound.promoted_to_rule, "rule-test-rule");
    assert.deepStrictEqual(actual.outbound.reopens, ["meta-stale-parent"]);

    // Inbound: rule-test-rule.origin → origin_of, meta-test-changelog.consolidates → consolidated_by
    assert.ok(actual.inbound, "inbound must not be null");
    assert.ok(Array.isArray(actual.inbound.origin_of));
    assert.ok(actual.inbound.origin_of.includes("rule-test-rule"));
    assert.ok(Array.isArray(actual.inbound.consolidated_by));
    assert.ok(actual.inbound.consolidated_by.includes("meta-test-changelog"));
  } finally {
    delete process.env.GATE_ROOT;
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- Legacy finding (no promoted_to_rule — dual-field migration) ---

test("legacy finding wire shape (dual-field promoted_to_rule migration)", async () => {
  const dir = createTempRegistry();
  try {
    process.env.GATE_ROOT = dir;
    const result = await metaStateRelationshipsTool.handler({ id: "meta-legacy-finding", direction: "both" });
    const actual = JSON.parse(result.content[0].text);

    assert.strictEqual(actual.id, "meta-legacy-finding");
    assert.strictEqual(actual.entry_kind, "finding");

    // Dual-field migration: no promoted_to_rule on the finding, but
    // rule-legacy-origin has origin="meta-legacy-finding", so the fallback
    // should resolve promoted_to_rule to "rule-legacy-origin".
    assert.ok(actual.outbound, "outbound must not be null");
    assert.strictEqual(actual.outbound.promoted_to_rule, "rule-legacy-origin",
      "dual-field migration must resolve promoted_to_rule from origin_inverse");
  } finally {
    delete process.env.GATE_ROOT;
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- Rule ---

test("rule wire shape", async () => {
  const dir = createTempRegistry();
  try {
    process.env.GATE_ROOT = dir;
    const result = await metaStateRelationshipsTool.handler({ id: "rule-test-rule", direction: "both" });
    const actual = JSON.parse(result.content[0].text);

    assert.strictEqual(actual.id, "rule-test-rule");
    assert.strictEqual(actual.entry_kind, "rule");

    assert.ok(actual.outbound);
    assert.strictEqual(actual.outbound.origin, "meta-test-finding");

    assert.ok(actual.inbound);
    assert.ok(Array.isArray(actual.inbound.promoted_from));
    assert.ok(actual.inbound.promoted_from.includes("meta-test-finding"));
  } finally {
    delete process.env.GATE_ROOT;
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- Rule with dual-field inbound (legacy finding without promoted_to_rule) ---

test("rule inbound via dual-field migration (finding has no promoted_to_rule)", async () => {
  const dir = createTempRegistry();
  try {
    process.env.GATE_ROOT = dir;
    // rule-legacy-origin has origin="meta-legacy-finding", which has no promoted_to_rule.
    // The dual-field migration should still resolve promoted_from = ["meta-legacy-finding"].
    const result = await metaStateRelationshipsTool.handler({ id: "rule-legacy-origin", direction: "inbound" });
    const actual = JSON.parse(result.content[0].text);

    assert.strictEqual(actual.id, "rule-legacy-origin");
    assert.strictEqual(actual.direction, "inbound");
    assert.ok(actual.inbound, "inbound must not be null");
    assert.ok(Array.isArray(actual.inbound.promoted_from), "promoted_from must be an array");
    assert.ok(actual.inbound.promoted_from.includes("meta-legacy-finding"),
      "dual-field migration must resolve promoted_from from rule.origin");
  } finally {
    delete process.env.GATE_ROOT;
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- Change-log ---

test("change-log wire shape", async () => {
  const dir = createTempRegistry();
  try {
    process.env.GATE_ROOT = dir;
    const result = await metaStateRelationshipsTool.handler({ id: "meta-test-changelog", direction: "both" });
    const actual = JSON.parse(result.content[0].text);

    assert.strictEqual(actual.id, "meta-test-changelog");
    assert.strictEqual(actual.entry_kind, "change-log");

    assert.ok(actual.outbound);
    assert.ok(Array.isArray(actual.outbound.consolidates));
    assert.ok(actual.outbound.consolidates.includes("meta-test-finding"));

    assert.ok(actual.inbound);
    assert.ok(Array.isArray(actual.inbound.consolidated_by));
    assert.ok(actual.inbound.consolidated_by.includes("meta-test-finding"));
  } finally {
    delete process.env.GATE_ROOT;
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- Loop-design ---

test("loop-design wire shape", async () => {
  const dir = createTempRegistry();
  try {
    process.env.GATE_ROOT = dir;
    const result = await metaStateRelationshipsTool.handler({ id: "loop-design-test", direction: "both" });
    const actual = JSON.parse(result.content[0].text);

    assert.strictEqual(actual.id, "loop-design-test");
    assert.strictEqual(actual.entry_kind, "loop-design");

    assert.ok(actual.outbound);
    assert.ok(Array.isArray(actual.outbound.proposed_design_for));
    assert.ok(actual.outbound.proposed_design_for.includes("rule-test-rule"));
    assert.ok(Array.isArray(actual.outbound.addresses));
    assert.ok(actual.outbound.addresses.includes("meta-test-finding"));

    // Loop-design is a leaf — no inbound refs
    assert.strictEqual(actual.inbound, null);
  } finally {
    delete process.env.GATE_ROOT;
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- Error case ---

test("entry_not_found returns error", async () => {
  const dir = createTempRegistry();
  try {
    process.env.GATE_ROOT = dir;
    const result = await metaStateRelationshipsTool.handler({ id: "meta-does-not-exist", direction: "both" });
    const actual = JSON.parse(result.content[0].text);
    assert.deepStrictEqual(actual, { error: "entry_not_found", id: "meta-does-not-exist" });
  } finally {
    delete process.env.GATE_ROOT;
    rmSync(dir, { recursive: true, force: true });
  }
});
