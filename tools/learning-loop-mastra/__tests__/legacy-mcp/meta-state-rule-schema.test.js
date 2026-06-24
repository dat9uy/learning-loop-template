import { test } from "node:test";
import assert from "node:assert/strict";
import {
  metaStateRuleEntrySchema,
  metaStateEntrySchema,
} from "../../core/legacy/meta-state.js";

const validRule = {
  id: "rule-no-new-artifact-types",
  origin: "meta-260602T0000Z-escape-hatch-abuse-meta-taxonomy-proposal",
  enforcement: "gate",
  pattern_type: "regex",
  pattern: "(propose|design|create)\\s+(a|an|new|separate|own|the)?\\s*(schema|artifact|directory|convention)|new\\s+(schema|artifact|directory|convention)",
  description: "Gate-enforced rule: blocks attempts to create new schema/artifact/directory/convention types without explicit operator approval. The rule's pattern was refined 2026-06-06 to require a context qualifier.",
  status: "active",
  promoted_at: "2026-06-01T22:00:13.387Z",
  promoted_by: "operator",
};

test("metaStateRuleEntrySchema accepts minimal valid rule entry", () => {
  const result = metaStateRuleEntrySchema.safeParse(validRule);
  assert.equal(result.success, true, JSON.stringify(result.error?.format()));
});

test("metaStateRuleEntrySchema rejects non-rule entry_kind", () => {
  const bad = { ...validRule, entry_kind: "finding" };
  assert.equal(metaStateRuleEntrySchema.safeParse(bad).success, false);
});

test("metaStateRuleEntrySchema rejects unstable id (must match rule-<slug>)", () => {
  const bad = { ...validRule, id: "meta-260606T1234Z-not-a-rule" };
  assert.equal(metaStateRuleEntrySchema.safeParse(bad).success, false);
});

test("metaStateRuleEntrySchema rejects description shorter than 20 chars", () => {
  const bad = { ...validRule, description: "too short" };
  assert.equal(metaStateRuleEntrySchema.safeParse(bad).success, false);
});

test("metaStateRuleEntrySchema accepts optional fields (scope_predicate, evidence_code_ref, code_fingerprint, refined_at, refined_by, refinement_reason, supersedes, applies_to_resolution)", () => {
  const rule = {
    ...validRule,
    scope_predicate: "project_has_learning_loop_mcp",
    evidence_code_ref: "tools/learning-loop-mastra/core/legacy/gate-logic.js#loadPromotedRules",
    code_fingerprint: "sha256:" + "a".repeat(64),
    refined_at: "2026-06-05T19:25:15.567Z",
    refined_by: "operator",
    refinement_reason: "G8 subcommand-class false positive (7 recurrences 2026-06-02..2026-06-06): bare 'create' matched CLI subcommand names. Refined pattern requires a context qualifier.",
    supersedes: "rule-old-no-new-artifact-types",
    applies_to_resolution: "meta-260606T0443Z-mcp-tools-not-loaded-into-agent-tool-list",
  };
  assert.equal(metaStateRuleEntrySchema.safeParse(rule).success, true);
});

test("metaStateRuleEntrySchema rejects invalid code_fingerprint format", () => {
  const bad = { ...validRule, code_fingerprint: "md5:" + "a".repeat(32) };
  assert.equal(metaStateRuleEntrySchema.safeParse(bad).success, false);
});

test("metaStateEntrySchema union accepts rule entry via discriminator", () => {
  const parsed = metaStateEntrySchema.parse(validRule);
  assert.equal(parsed.entry_kind, "rule");
});

test("finding status enum accepts 'resolved' and 'active' (registry compatibility)", () => {
  const finding = {
    id: "meta-260601T1353Z-test",
    entry_kind: "finding",
    category: "loop-anti-pattern",
    severity: "warning",
    affected_system: "mcp-tools",
    description: "Test finding that is resolved (already in registry)",
    status: "resolved",
    created_at: "2026-06-01T00:00:00Z",
  };
  const parsed = metaStateEntrySchema.parse(finding);
  assert.equal(parsed.status, "resolved");
});
