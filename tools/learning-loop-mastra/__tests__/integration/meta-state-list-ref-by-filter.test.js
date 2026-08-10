import { describe, test, beforeAll, afterAll } from "vitest";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { metaStateListTool } from "../../tools/handlers/meta-state-list-tool.js";

function makeTempRoot() {
  return mkdtempSync(join(tmpdir(), "list-ref-by-"));
}

const NOW = new Date().toISOString();

const SEED_ENTRIES = [
  { id: "target-finding", entry_kind: "finding", status: "open", category: "loop-anti-pattern", severity: "warning", affected_system: "mcp-tools", description: "target finding for ref_by test (min 20 chars)", created_at: NOW },
  { id: "design-A", entry_kind: "loop-design", status: "open", title: "design A addresses target", description: "design A for ref_by test (min 20 chars)", affected_system: "mcp-tools", proposed_design_for: ["rule-test"], addresses: ["target-finding"], created_at: NOW, created_by: "test" },
  { id: "design-B", entry_kind: "loop-design", status: "open", title: "design B addresses other", description: "design B for ref_by test (min 20 chars)", affected_system: "mcp-tools", proposed_design_for: ["rule-test"], addresses: ["other-finding"], created_at: NOW, created_by: "test" },
  { id: "reopener", entry_kind: "finding", status: "open", category: "loop-anti-pattern", severity: "warning", affected_system: "mcp-tools", description: "reopener for target-finding (min 20 chars)", created_at: NOW, reopens: ["target-finding"] },
  { id: "consolidating-change", entry_kind: "change-log", status: "open", change_dimension: "semantic", change_target: "test.js", change_diff: { added: [], removed: [], changed: [] }, reason: "consolidates target-finding (min 20 chars)", created_at: NOW, consolidates: ["target-finding"] },
];

// The consolidated edge (finding → change-log) is now a citation row
// (source=finding, target=change-log). `ref_field:"citation"` queries
// `citations_inverse`, keyed by the citation's target (change-log) with the
// citation's source (finding) as the value — so `ref_by: change-log-id`
// returns the findings consolidated into that change-log.
const SEED_CITATIONS = [
  {
    id: "citation-consolidated-target-finding-into-change",
    entry_kind: "citation",
    source: "target-finding",
    target: "consolidating-change",
    rationale: "consolidated-into",
    recorded_at: NOW,
    recorded_by: "operator",
    status: "active",
    version: 0,
  },
];

describe("meta_state_list ref_by/ref_field filter", () => {
  let root;
  let originalGateRoot;

  beforeAll(() => {
    root = makeTempRoot();
    originalGateRoot = process.env.GATE_ROOT;
    process.env.GATE_ROOT = root;
    writeFileSync(join(root, "meta-state.jsonl"), SEED_ENTRIES.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
    writeFileSync(join(root, "citations.jsonl"), SEED_CITATIONS.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
  });

  afterAll(() => {
    if (originalGateRoot === undefined) {
      delete process.env.GATE_ROOT;
    } else {
      process.env.GATE_ROOT = originalGateRoot;
    }
    rmSync(root, { recursive: true, force: true });
  });

  test("ref_field=addresses returns the loop-designs that cite target-finding", async () => {
    const result = await metaStateListTool.handler({ ref_by: "target-finding", ref_field: "addresses" });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 1);
    assert.strictEqual(text.entries[0].id, "design-A");
    assert.strictEqual(text.filters_applied.ref_by, "target-finding");
    assert.strictEqual(text.filters_applied.ref_field, "addresses");
  });

  test("ref_field=reopens returns findings that re-open target-finding", async () => {
    const result = await metaStateListTool.handler({ ref_by: "target-finding", ref_field: "reopens" });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 1);
    assert.strictEqual(text.entries[0].id, "reopener");
  });

  test("ref_field=citation returns findings consolidated into a change-log", async () => {
    // The migrated consolidated edge is a citation row (source=finding,
    // target=change-log). `citations_inverse` is keyed by the citation's
    // target, so `ref_by: change-log-id, ref_field: "citation"` returns the
    // findings (sources) consolidated into that change-log.
    const result = await metaStateListTool.handler({ ref_by: "consolidating-change", ref_field: "citation" });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 1);
    assert.strictEqual(text.entries[0].id, "target-finding");
    assert.strictEqual(text.filters_applied.ref_field, "citation");
  });

  test("ref_by with no matching entries returns empty array", async () => {
    const result = await metaStateListTool.handler({ ref_by: "nonexistent", ref_field: "addresses" });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 0);
  });

  test("ref_by without ref_field returns structured error", async () => {
    const result = await metaStateListTool.handler({ ref_by: "target-finding" });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.error, "ref_pair_required");
  });

  test("ref_field without ref_by returns structured error", async () => {
    const result = await metaStateListTool.handler({ ref_field: "addresses" });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.error, "ref_pair_required");
  });

  test("ref_by + ref_field + id filter composes (AND)", async () => {
    const result = await metaStateListTool.handler({ ref_by: "target-finding", ref_field: "addresses", id: ["design-A", "design-B"] });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 1);
    assert.strictEqual(text.entries[0].id, "design-A");
  });

  test("proposed_design_for scan finds loop-designs by ref_by (flat)", async () => {
    const flatDesign = { id: "design-C", entry_kind: "loop-design", status: "open", title: "design C proposed design for target-finding", description: "design C for ref_by flat test (min 20 chars)", affected_system: "mcp-tools", proposed_design_for: ["target-finding"], addresses: [], created_at: NOW, created_by: "test" };
    const all = [...SEED_ENTRIES, flatDesign];
    writeFileSync(join(root, "meta-state.jsonl"), all.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
    const result = await metaStateListTool.handler({ ref_by: "target-finding", ref_field: "proposed_design_for" });
    const text = JSON.parse(result.content[0].text);
    assert.ok(text.count >= 1, "should find at least design-C");
    assert.ok(text.entries.some((e) => e.id === "design-C"), "design-C should be in results");
  });
});
