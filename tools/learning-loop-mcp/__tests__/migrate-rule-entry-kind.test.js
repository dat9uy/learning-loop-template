import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { readRegistry } from "../core/meta-state.js";

function setupFixture() {
  const root = mkdtempSync(join(tmpdir(), "meta-migrate-"));
  const entries = [
    {
      id: "meta-260602T0000Z-escape-hatch-abuse-meta-taxonomy-proposal",
      entry_kind: "finding",
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      status: "resolved",
      description: "Agent proposed a new artifact type and a three-tier taxonomy. This violates the philosophy: docs/ is an escape hatch, not a home for procedural knowledge.",
      promoted_to_rule: {
        rule_id: "rule-no-new-artifact-types",
        enforcement: "gate",
        pattern_type: "regex",
        pattern: "(propose|design|create)\\s+(a|an|new|separate|own|the)?\\s*(schema|artifact|directory|convention)|new\\s+(schema|artifact|directory|convention)",
        promoted_at: "2026-06-01T22:00:13.387Z",
        promoted_by: "operator",
        refined_at: "2026-06-05T19:25:15.567Z",
        refined_by: "operator",
        refinement_reason: "G8 subcommand-class false positive (7 recurrences): bare 'create' matched CLI subcommand names.",
      },
    },
    {
      id: "meta-260606T0421Z-instruction-layer-for-agents-tbd",
      entry_kind: "finding",
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      subtype: "tool-missing",
      status: "superseded",
      consolidated_into: "PENDING-PHASE-2-LOOP-DESIGN-ID",
      description: "Instruction layer for agents: should we add a loop_get_instruction MCP tool, extend loop_describe, or embed the rules in AGENTS.md? TBD in a future session.",
      created_at: "2026-06-13T04:21:32.000Z",
    },
  ];
  writeFileSync(join(root, "meta-state.jsonl"), entries.map(JSON.stringify).join("\n") + "\n", "utf8");
  return root;
}

test("migration extracts rule entry from finding's promoted_to_rule and mutates finding to string id", () => {
  const root = mkdtempSync(join(tmpdir(), "meta-migrate-rule-"));
  const entries = [
    {
      id: "meta-260602T0000Z-escape-hatch-abuse-meta-taxonomy-proposal",
      entry_kind: "finding",
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      status: "resolved",
      description: "Agent proposed a new artifact type and a three-tier taxonomy. This violates the philosophy.",
      promoted_to_rule: {
        rule_id: "rule-no-new-artifact-types",
        enforcement: "gate",
        pattern_type: "regex",
        pattern: "(propose|design|create)\\s+(a|an|new|separate|own|the)?\\s*(schema|artifact|directory|convention)|new\\s+(schema|artifact|directory|convention)",
        promoted_at: "2026-06-01T22:00:13.387Z",
        promoted_by: "operator",
        refined_at: "2026-06-05T19:25:15.567Z",
        refined_by: "operator",
        refinement_reason: "G8 subcommand-class false positive.",
      },
    },
  ];
  writeFileSync(join(root, "meta-state.jsonl"), entries.map(JSON.stringify).join("\n") + "\n", "utf8");

  execFileSync("node", ["tools/learning-loop-mcp/scripts/migrate-rule-entry-kind.mjs", `--root=${root}`], { cwd: process.cwd() });

  const after = readRegistry(root);
  const newRule = after.find((e) => e.id === "rule-no-new-artifact-types");
  assert(newRule, "new rule entry not found");
  assert.equal(newRule.entry_kind, "rule");
  assert.equal(newRule.origin, "meta-260602T0000Z-escape-hatch-abuse-meta-taxonomy-proposal");
  assert.equal(newRule.enforcement, "gate");
  assert.equal(newRule.pattern_type, "regex");
  assert.equal(newRule.status, "active");
  assert.equal(newRule.refined_at, "2026-06-05T19:25:15.567Z");

  const sourceFinding = after.find((e) => e.id === "meta-260602T0000Z-escape-hatch-abuse-meta-taxonomy-proposal");
  assert.equal(sourceFinding.promoted_to_rule, "rule-no-new-artifact-types", "source finding not mutated to string id");
});

test("migration emits loop-design entry from design-note finding and backfills consolidated_into", () => {
  const root = mkdtempSync(join(tmpdir(), "meta-migrate-design-"));
  const entries = [
    {
      id: "meta-260606T0421Z-instruction-layer-for-agents-tbd",
      entry_kind: "finding",
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      subtype: "tool-missing",
      status: "superseded",
      consolidated_into: "PENDING-PHASE-2-LOOP-DESIGN-ID",
      description: "Instruction layer for agents: should we add a loop_get_instruction MCP tool, extend loop_describe, or embed the rules in AGENTS.md? TBD in a future session.",
      created_at: "2026-06-13T04:21:32.000Z",
    },
  ];
  writeFileSync(join(root, "meta-state.jsonl"), entries.map(JSON.stringify).join("\n") + "\n", "utf8");

  execFileSync("node", ["tools/learning-loop-mcp/scripts/migrate-rule-entry-kind.mjs", `--root=${root}`], { cwd: process.cwd() });

  const after = readRegistry(root);
  const newDesign = after.find((e) => e.id === "loop-design-instruction-layer");
  assert(newDesign, "new loop-design entry not found");
  assert.equal(newDesign.entry_kind, "loop-design");
  assert.deepEqual(newDesign.proposed_design_for, ["loop_get_instruction", "loop_describe"]);
  assert.deepEqual(newDesign.addresses, []);

  const sourceFinding = after.find((e) => e.id === "meta-260606T0421Z-instruction-layer-for-agents-tbd");
  assert(sourceFinding, "source finding should still exist after migration (not compacted)");
  assert.equal(sourceFinding.consolidated_into, "loop-design-instruction-layer", "consolidated_into not backfilled");
});

test("migration is idempotent: re-running produces the same registry state (snapshot diff is empty)", () => {
  const root = setupFixture();
  execFileSync("node", ["tools/learning-loop-mcp/scripts/migrate-rule-entry-kind.mjs", `--root=${root}`], { cwd: process.cwd() });
  const snapshot1 = readFileSync(join(root, "meta-state.jsonl"), "utf8");

  execFileSync("node", ["tools/learning-loop-mcp/scripts/migrate-rule-entry-kind.mjs", `--root=${root}`], { cwd: process.cwd() });
  const snapshot2 = readFileSync(join(root, "meta-state.jsonl"), "utf8");

  assert.equal(snapshot1, snapshot2, "registry state changed between runs (not idempotent)");
});

test("migration recovers from partial state: pre-migrated rule + un-migrated design notes", async () => {
  const root = setupFixture();
  // Pre-migrate the rule manually
  const before = readRegistry(root);
  const finding = before.find((e) => e.id === "meta-260602T0000Z-escape-hatch-abuse-meta-taxonomy-proposal");
  const { writeEntry, updateEntry } = await import("../core/meta-state.js");
  await writeEntry(root, {
    id: "rule-no-new-artifact-types",
    entry_kind: "rule",
    origin: "meta-260602T0000Z-escape-hatch-abuse-meta-taxonomy-proposal",
    enforcement: "gate",
    pattern_type: "regex",
    pattern: "(propose|design|create)\\s+(a|an|new|separate|own|the)?\\s*(schema|artifact|directory|convention)|new\\s+(schema|artifact|directory|convention)",
    description: "Gate-enforced rule: rule-no-new-artifact-types. Pattern type=regex.",
    status: "active",
    promoted_at: "2026-06-01T22:00:13.387Z",
    promoted_by: "operator",
  });
  await updateEntry(root, "meta-260602T0000Z-escape-hatch-abuse-meta-taxonomy-proposal", { promoted_to_rule: "rule-no-new-artifact-types" });

  execFileSync("node", ["tools/learning-loop-mcp/scripts/migrate-rule-entry-kind.mjs", `--root=${root}`], { cwd: process.cwd() });

  const after = readRegistry(root);
  const newRule = after.find((e) => e.id === "rule-no-new-artifact-types");
  assert(newRule, "rule entry missing after migration");
  const ruleCount = after.filter((e) => e.entry_kind === "rule" && e.id === "rule-no-new-artifact-types").length;
  assert.equal(ruleCount, 1, "rule entry duplicated");

  const newDesign = after.find((e) => e.id === "loop-design-instruction-layer");
  assert(newDesign, "loop-design entry should be emitted");
});
