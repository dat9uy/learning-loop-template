import { test } from "vitest";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { metaStateRelationshipsTool } from "../../tools/handlers/meta-state-relationships-tool.js";
import { resolveRoot } from "#lib/resolve-root.js";

const root = resolveRoot();

// Helper: seed a self-contained temp registry with a rule + finding + an
// origin citation (source=rule, target=finding, rationale="origin"). The
// canonical promotion edge is now a citation row; the on-record `origin`
// field is inert-historical (schema-optional, still parses) but unindexed.
function seedOriginCitationFixture(tempRoot) {
  const rule = {
    id: "rule-promoted-from-finding",
    entry_kind: "rule",
    enforcement: "gate",
    pattern_type: "regex",
    pattern: "loop-anti-pattern",
    description: "A rule promoted from a finding to gate the loop.",
    status: "active",
    promoted_at: new Date().toISOString(),
    promoted_by: "operator",
    // Inert-historical: still on disk, no longer indexed.
    origin: "meta-260615T1148Z-finding-promoted-to-rule",
    created_at: new Date().toISOString(),
  };
  const finding = {
    id: "meta-260615T1148Z-finding-promoted-to-rule",
    entry_kind: "finding",
    category: "loop-anti-pattern",
    severity: "warning",
    affected_system: "meta",
    description: "A finding that was promoted to a rule.",
    status: "open",
    created_at: new Date().toISOString(),
  };
  const citation = {
    id: "citation-origin-rule-promoted-from-finding",
    entry_kind: "citation",
    source: "rule-promoted-from-finding",
    target: "meta-260615T1148Z-finding-promoted-to-rule",
    rationale: "origin",
    recorded_at: new Date().toISOString(),
    recorded_by: "operator",
    status: "active",
    version: 0,
  };
  writeFileSync(join(tempRoot, "meta-state.jsonl"), [rule, finding].map((e) => JSON.stringify(e)).join("\n") + "\n");
  writeFileSync(join(tempRoot, "citations.jsonl"), JSON.stringify(citation) + "\n");
}

test("meta_state_relationships: inbound for rule origin", async () => {
  // The origin edge is now a citation row (source=rule, target=finding).
  // Querying the FINDING's inbound surfaces `cited_by`=[rule] — the rule
  // cites this finding as its origin. Querying the rule's inbound yields
  // nothing (the citation targets the finding, not the rule).
  const tempRoot = mkdtempSync(join(tmpdir(), "meta-state-rel-origin-"));
  const originalEnv = process.env.GATE_ROOT;
  process.env.GATE_ROOT = tempRoot;
  try {
    seedOriginCitationFixture(tempRoot);
    const result = await metaStateRelationshipsTool.handler({
      id: "meta-260615T1148Z-finding-promoted-to-rule",
      direction: "inbound",
    });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.id, "meta-260615T1148Z-finding-promoted-to-rule");
    assert.strictEqual(text.direction, "inbound");
    assert.ok(text.inbound, "inbound should be present");
    assert.ok(text.inbound.cited_by, "inbound should have cited_by");
    assert.ok(
      text.inbound.cited_by.includes("rule-promoted-from-finding"),
      "cited_by should include the originating rule"
    );
  } finally {
    if (originalEnv) process.env.GATE_ROOT = originalEnv;
    else delete process.env.GATE_ROOT;
  }
});

test("meta_state_relationships: outbound for rule entry", async () => {
  // The on-record `origin` field is inert-historical: still on disk, still
  // parses, but de-routed from CROSS_REFS so forwardRefs no longer emits it.
  // Outbound therefore does not surface `origin`; the canonical promotion
  // edge is a citation row surfaced via inbound `cited_by`.
  const tempRoot = mkdtempSync(join(tmpdir(), "meta-state-rel-outbound-"));
  const originalEnv = process.env.GATE_ROOT;
  process.env.GATE_ROOT = tempRoot;
  try {
    seedOriginCitationFixture(tempRoot);
    const result = await metaStateRelationshipsTool.handler({
      id: "rule-promoted-from-finding",
      direction: "outbound",
    });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.id, "rule-promoted-from-finding");
    assert.strictEqual(text.direction, "outbound");
    // origin is unindexed → outbound is null (no other forward refs on this rule).
    assert.strictEqual(text.outbound, null, "outbound must not surface inert-historical origin");
  } finally {
    if (originalEnv) process.env.GATE_ROOT = originalEnv;
    else delete process.env.GATE_ROOT;
  }
});

test("meta_state_relationships: both directions for rule entry with refs", async () => {
  // The rule's outbound no longer includes origin (inert-historical,
  // unindexed). The finding's inbound includes cited_by=[rule] via the
  // origin citation. Verify both directions on the finding: outbound null
  // (no forward refs) + inbound cited_by=[rule].
  const tempRoot = mkdtempSync(join(tmpdir(), "meta-state-rel-both-"));
  const originalEnv = process.env.GATE_ROOT;
  process.env.GATE_ROOT = tempRoot;
  try {
    seedOriginCitationFixture(tempRoot);
    const result = await metaStateRelationshipsTool.handler({
      id: "meta-260615T1148Z-finding-promoted-to-rule",
      direction: "both",
    });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.direction, "both");
    assert.ok(text.inbound, "both should have inbound (cited_by from origin citation)");
    assert.ok(text.inbound.cited_by, "inbound should have cited_by");
    assert.ok(text.inbound.cited_by.includes("rule-promoted-from-finding"));
  } finally {
    if (originalEnv) process.env.GATE_ROOT = originalEnv;
    else delete process.env.GATE_ROOT;
  }
});

test("meta_state_relationships: rule with origin='' has no origin outbound", async () => {
  // Rules with origin patched to "" have no
  // outbound `origin` ref (outboundRefsOf rule: `entry.origin ? [...] : []`).
  // The rule may still have other outbound refs (e.g., applies_to_resolution);
  // verify only the origin key is absent.
  const result = await metaStateRelationshipsTool.handler({
    id: "rule-cold-session-test-must-pass-before-resolution",
    direction: "outbound",
  });
  const text = JSON.parse(result.content[0].text);
  assert.strictEqual(text.id, "rule-cold-session-test-must-pass-before-resolution");
  assert.strictEqual(text.outbound.origin, undefined, "outbound.origin must be undefined when origin is empty");
});

test("meta_state_relationships: inbound reopened_by for finding with reopens", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "meta-state-reopened-by-"));
  const originalEnv = process.env.GATE_ROOT;
  process.env.GATE_ROOT = tempRoot;
  try {
    const corePath = join(tempRoot, "meta-state.jsonl");
    // Pre-populate: parent expired + child that reopens it
    const parent = {
      id: "meta-parent-stale",
      entry_kind: "finding",
      category: "gate-logic-bug",
      severity: "warning",
      affected_system: "gate-logic",
      description: "A parent finding that is past its staleness window.",
      status: "open",
    };
    const child = {
      id: "meta-child-reopens",
      entry_kind: "finding",
      category: "gate-logic-bug",
      severity: "warning",
      affected_system: "gate-logic",
      description: "A child finding that reopens the parent.",
      status: "open",
      reopens: ["meta-parent-stale"],
    };
    const fs = await import("node:fs");
    fs.writeFileSync(corePath, [parent, child].map((e) => JSON.stringify(e)).join("\n") + "\n");

    const result = await metaStateRelationshipsTool.handler({
      id: "meta-parent-stale",
      direction: "inbound",
    });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.id, "meta-parent-stale");
    assert.strictEqual(text.direction, "inbound");
    assert.ok(text.inbound, "inbound should be present");
    assert.ok(text.inbound.reopened_by, "inbound should have reopened_by");
    assert.ok(
      text.inbound.reopened_by.includes("meta-child-reopens"),
      "reopened_by should include the child finding"
    );
  } finally {
    if (originalEnv) process.env.GATE_ROOT = originalEnv;
    else delete process.env.GATE_ROOT;
  }
});

test("meta_state_relationships: missing entry returns error", async () => {
  const result = await metaStateRelationshipsTool.handler({
    id: "non-existent-entry-id",
    direction: "both",
  });
  const text = JSON.parse(result.content[0].text);
  assert.strictEqual(text.error, "entry_not_found");
  assert.strictEqual(text.id, "non-existent-entry-id");
});
