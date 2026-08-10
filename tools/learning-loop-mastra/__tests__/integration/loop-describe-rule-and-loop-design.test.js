import { test } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loopDescribeTool } from "../../tools/handlers/loop-describe-tool.js";
import { writeEntry } from "../../core/meta-state.js";

const originalEnv = process.env.GATE_ROOT;

function setupFixture() {
  const root = mkdtempSync(join(tmpdir(), "loop-describe-"));
  process.env.GATE_ROOT = root;
  writeFileSync(join(root, "meta-state.jsonl"), "", "utf8");
  return root;
}

function teardown() {
  if (originalEnv === undefined) {
    delete process.env.GATE_ROOT;
  } else {
    process.env.GATE_ROOT = originalEnv;
  }
}

async function call(args) {
  return JSON.parse((await loopDescribeTool.handler(args)).content[0].text);
}

test("loop_describe warm tier returns rules (renamed from promoted_rules) and loop_design_count", async () => {
  const root = setupFixture();
  try {
    await writeEntry(root, {
      id: "rule-test-1",
      entry_kind: "rule",
      origin: "meta-test-origin",
      enforcement: "gate",
      pattern_type: "regex",
      pattern: "test-pattern-1",
      description: "Test rule description that is at least 20 characters long.",
      status: "active",
      promoted_at: "2026-06-06T20:00:00.000Z",
      promoted_by: "operator",
    });
    await writeEntry(root, {
      id: "loop-design-test-1",
      entry_kind: "loop-design",
      title: "Test design that is at least 10 chars",
      status: "active",
      proposed_design_for: ["rule-test-1"],
      addresses: [],
      description: "Test design description that is at least 20 characters long.",
      affected_system: "mcp-tools",
      created_at: "2026-06-06T20:00:00.000Z",
      created_by: "operator",
    });

    const result = await call({ tier: "warm" });
    assert.equal(result.tier, "warm");
    assert(result.rules, "rules field missing in warm tier (should replace promoted_rules)");
    assert.equal(result.rules.length, 1);
    assert.equal(result.rules[0].rule_id, "rule-test-1");
    assert.equal(result.rule_count, 1);
    assert.equal(result.loop_design_count, 1);
    assert.equal(result.promoted_rules, undefined, "promoted_rules still present (should be renamed to rules)");
  } finally {
    teardown();
  }
});

test("loop_describe cold tier returns loop_designs list with id, title, proposed_design_for, addresses, shipped_in_plan", async () => {
  const root = setupFixture();
  try {
    await writeEntry(root, {
      id: "loop-design-test-2",
      entry_kind: "loop-design",
      title: "Test design 2 with shipped_in_plan",
      status: "active",
      proposed_design_for: ["rule-test-2"],
      addresses: ["meta-test-finding"],
      description: "Test design 2 description that is at least 20 characters long.",
      affected_system: "gate-logic",
      created_at: "2026-06-06T20:00:00.000Z",
      created_by: "operator",
      shipped_in_plan: "plans/260606-test/",
      shipped_at: "2026-06-06T21:00:00.000Z",
    });

    const result = await call({ tier: "cold" });
    assert(result.loop_designs, "loop_designs field missing in cold tier");
    assert.equal(result.loop_designs.length, 1);
    const design = result.loop_designs[0];
    assert.equal(design.id, "loop-design-test-2");
    assert.equal(design.title, "Test design 2 with shipped_in_plan");
    assert.deepEqual(design.proposed_design_for, ["rule-test-2"]);
    assert.deepEqual(design.addresses, ["meta-test-finding"]);
    assert.equal(design.shipped_in_plan, "plans/260606-test/");
    assert.equal(design.shipped_at, "2026-06-06T21:00:00.000Z");
  } finally {
    teardown();
  }
});

test("loop_describe summary tier includes rule_count and loop_design_count", async () => {
  const root = setupFixture();
  try {
    for (let i = 0; i < 2; i++) {
      await writeEntry(root, {
        id: `rule-test-${i}`,
        entry_kind: "rule",
        origin: `meta-origin-${i}`,
        enforcement: "gate",
        pattern_type: "regex",
        pattern: `pattern-${i}`,
        description: `Rule ${i} description that is at least 20 characters long.`,
        status: "active",
        promoted_at: "2026-06-06T20:00:00.000Z",
        promoted_by: "operator",
      });
    }
    for (let i = 0; i < 2; i++) {
      await writeEntry(root, {
        id: `loop-design-test-${i}`,
        entry_kind: "loop-design",
        title: `Test design ${i} with at least 10 chars`,
        status: "active",
        proposed_design_for: [`rule-test-${i}`],
        addresses: [],
        description: `Design ${i} description that is at least 20 characters long.`,
        affected_system: "mcp-tools",
        created_at: "2026-06-06T20:00:00.000Z",
        created_by: "operator",
      });
    }

    const result = await call({ tier: "summary" });
    assert.equal(result.rule_count, 2);
    assert.equal(result.loop_design_count, 2);
  } finally {
    teardown();
  }
});

test("loop_describe hot tier returns rules (renamed from promoted_rules)", async () => {
  const root = setupFixture();
  try {
    await writeEntry(root, {
      id: "rule-test-3",
      entry_kind: "rule",
      origin: "meta-test-origin-3",
      enforcement: "gate",
      pattern_type: "glob",
      pattern: "records/**/risks/*.yaml",
      description: "Rule 3 description that is at least 20 characters long.",
      status: "active",
      promoted_at: "2026-06-06T20:00:00.000Z",
      promoted_by: "operator",
    });

    const result = await call({ tier: "hot" });
    assert(result.rules, "rules field missing in hot tier (should replace promoted_rules)");
    assert.equal(result.rules[0].rule_id, "rule-test-3");
    assert.equal(result.promoted_rules, undefined, "promoted_rules still present in hot tier");
  } finally {
    teardown();
  }
});
