// Snapshot test for meta_state_relationships wire shape.
// Verifies the reimplemented tool (dispatching via factoryFor) produces
// correct wire format. Includes a legacy finding fixture (no promoted_to_rule)
// to exercise the dual-field migration logic.
//
// Phase 3: `consolidated_into` / `consolidates` were de-routed from
// CROSS_REFS. The wire shape now exposes the citation-sourced `cited_by`
// generic inbound key (replacing the named `consolidated_by`) and drops
// `consolidated_into` / `consolidates` from outbound.

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
    // Phase 3: `consolidated_into` was de-routed from CROSS_REFS — no
    // longer in outbound wire shape.
    assert.strictEqual(actual.outbound.consolidated_into, undefined);
    // Phase 4: `promoted_to_rule` was retired — no longer in outbound
    // wire shape. The canonical promotion edge is the origin citation
    // row, surfaced as `cited_by` on the inbound side.
    assert.strictEqual(actual.outbound.promoted_to_rule, undefined);
    assert.deepStrictEqual(actual.outbound.reopens, ["meta-stale-parent"]);

    // Inbound: Phase 4 retired `origin_of` — the canonical promotion
    // edge is now the origin citation row. The fixture's RULE_FIXTURE
    // has `origin:"meta-test-finding"` (inert-historical) but no
    // citation row was emitted, so the finding's inbound surfaces
    // only `addressed_by` from the loop-design fixture.
    // (cited_by surfaces when an origin citation exists; see rule test.)
    assert.ok(actual.inbound, "inbound must not be null");
    assert.ok(Array.isArray(actual.inbound.addressed_by),
      "addressed_by still surfaces (loop-design address relationship unchanged)");
    assert.ok(actual.inbound.addressed_by.includes("loop-design-test"));
  } finally {
    delete process.env.GATE_ROOT;
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- Legacy finding (no promoted_to_rule — dual-field migration) ---

test("legacy finding wire shape (Phase 4 collapsed dual-field ghost-ref)", async () => {
  const dir = createTempRegistry();
  try {
    process.env.GATE_ROOT = dir;
    const result = await metaStateRelationshipsTool.handler({ id: "meta-legacy-finding", direction: "both" });
    const actual = JSON.parse(result.content[0].text);

    assert.strictEqual(actual.id, "meta-legacy-finding");
    assert.strictEqual(actual.entry_kind, "finding");

    // Phase 4 retired the dual-field `promoted_to_rule` ghost-ref. The
    // outbound wire shape no longer carries `promoted_to_rule`. The
    // canonical promotion edge is the origin citation row, surfaced
    // as `cited_by` on the rule's inbound (see rule test). Pre-
    // migration backfill via migrate-origin-supersedes-to-citations.mjs
    // restores the inbound edge.
    assert.strictEqual(actual.outbound, null,
      "Phase 4: legacy finding has null outbound (promoted_to_rule retired)");
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

    // Phase 4: rule.origin de-routed from CROSS_REFS — outbound no
    // longer carries the on-record origin field. Outbound is null
    // (applies_to_resolution is forwardOnly; origin is inert-historical).
    assert.strictEqual(actual.outbound, null);

    // Phase 4: no origin citation row in the fixture → no cited_by.
    // (The loop-design fixture has `proposed_design_for:["rule-test-rule"]`
    // which still surfaces as `proposed_design_for` in inbound —
    // loop-design `proposed_design_for` is unchanged in Phase 4.)
    assert.ok(actual.inbound, "inbound must not be null (loop-design proposed_design_for)");
    assert.ok(Array.isArray(actual.inbound.proposed_design_for));
    assert.ok(actual.inbound.proposed_design_for.includes("loop-design-test"),
      "loop-design proposed_design_for still surfaces for the rule (unchanged in Phase 4)");
  } finally {
    delete process.env.GATE_ROOT;
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- Rule with origin citation (legacy fixture reuses the same pattern) ---

test("rule inbound via origin citation (legacy fixture has rule.origin in inert-historical form)", async () => {
  const dir = createTempRegistry();
  try {
    process.env.GATE_ROOT = dir;
    // rule-legacy-origin has origin="meta-legacy-finding" on disk
    // (inert-historical; the canonical edge would be an origin citation
    // row emitted by meta_state_promote_rule post-migration).
    // Inbound is null because no citation row was emitted by the
    // fixture (legacy pre-citation data).
    const result = await metaStateRelationshipsTool.handler({ id: "rule-legacy-origin", direction: "inbound" });
    const actual = JSON.parse(result.content[0].text);

    assert.strictEqual(actual.id, "rule-legacy-origin");
    assert.strictEqual(actual.direction, "inbound");
    // No citation row → no inbound (Phase 4 collapsed the dual-field
    // ghost-ref). The on-record `origin` is inert-historical; pre-
    // migration backfill via migrate-origin-supersedes-to-citations.mjs
    // restores the inbound edge.
    assert.strictEqual(actual.inbound, null,
      "Phase 4: rule without origin citation has null inbound (no ghost-ref fallback)");
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

    // Phase 3: change-log has no outbound fields (consolidates removed;
    // the fixture does not set supersedes). outbound is null.
    assert.strictEqual(actual.outbound, null);

    assert.ok(actual.inbound);
    // Phase 3: `consolidated_by` is retired; the citation row sources
    // `cited_by` (generic). The change-log was the citation's target, so
    // `cited_by` lists the finding that cited it.
    assert.ok(Array.isArray(actual.inbound.cited_by));
    assert.ok(actual.inbound.cited_by.includes("meta-test-finding"),
      "citation row sources cited_by for the change-log (target id)");
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
