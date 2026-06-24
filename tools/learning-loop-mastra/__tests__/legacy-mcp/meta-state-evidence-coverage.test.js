import { test } from "node:test";
import assert from "node:assert";
import { readRegistry } from "../../core/legacy/meta-state.js";
import { resolveRoot } from "#lib/resolve-root.js";
import {
  metaStateFindingEntrySchema,
  metaStateChangeEntrySchema,
  metaStateRuleEntrySchema,
  metaStateLoopDesignSchema,
} from "../../core/legacy/meta-state.js";

const root = resolveRoot();

// ── T-1: nested evidence.code_ref must be 0 ──────────────────────────────
test("T-1: 0 entries carry nested evidence.code_ref", () => {
  const entries = readRegistry(root);
  const nested = entries.filter((e) => e.evidence?.code_ref !== undefined);
  assert.strictEqual(
    nested.length,
    0,
    `Expected 0 entries with nested evidence.code_ref, found ${nested.length}: ` +
      nested.map((e) => e.id).join(", ")
  );
});

// ── T-2: all active findings with mechanism_check have a ref ─────────────
test("T-2: all active findings with mechanism_check=true have a code_ref", () => {
  const entries = readRegistry(root);
  const activeFindings = entries.filter(
    (e) =>
      e.entry_kind === "finding" &&
      (e.status === "active" || e.status === "reported") &&
      e.mechanism_check === true
  );
  const orphans = activeFindings.filter(
    (e) => !e.evidence_code_ref && !e.evidence?.code_ref
  );
  assert.strictEqual(
    orphans.length,
    0,
    `Expected 0 active findings missing code_ref, found ${orphans.length}: ` +
      orphans.map((e) => e.id).join(", ")
  );
});

// ── T-3: 3 of 4 union branches expose evidence_code_ref top-level ────────
test("T-3: 3 of 4 union branches expose evidence_code_ref top-level", () => {
  const stub = { evidence_code_ref: "x.js" };

  // finding schema — already has top-level evidence_code_ref
  const finding = metaStateFindingEntrySchema.safeParse({
    entry_kind: "finding",
    category: "loop-anti-pattern",
    severity: "warning",
    affected_system: "mcp-tools",
    description: "A test finding for evidence coverage test",
    evidence_code_ref: "x.js",
  });
  assert.ok(finding.success, "finding schema accepts evidence_code_ref");

  // change-log schema — currently fails (uses nested evidence block)
  const changeLog = metaStateChangeEntrySchema.safeParse({
    entry_kind: "change-log",
    change_dimension: "semantic",
    change_target: "test",
    change_diff: { added: [], removed: [], changed: [] },
    reason: "A test change-log for evidence coverage test",
    status: "active",
    created_at: new Date().toISOString(),
    evidence_code_ref: "x.js",
  });
  assert.ok(changeLog.success, "change-log schema accepts evidence_code_ref");

  // rule schema — already has top-level evidence_code_ref
  const rule = metaStateRuleEntrySchema.safeParse({
    entry_kind: "rule",
    id: "rule-test-evidence-coverage",
    origin: "meta-260607T0008Z-dual-field-schema-risk",
    enforcement: "agent",
    pattern_type: "regex",
    pattern: "test",
    description: "A test rule for evidence coverage test",
    promoted_at: new Date().toISOString(),
    promoted_by: "test",
    evidence_code_ref: "x.js",
  });
  assert.ok(rule.success, "rule schema accepts evidence_code_ref");

  // loop-design schema — does NOT have evidence_code_ref (by design)
  const loopDesign = metaStateLoopDesignSchema.safeParse({
    entry_kind: "loop-design",
    id: "loop-design-test-evidence-coverage",
    title: "Test design for evidence coverage",
    proposed_design_for: ["test"],
    addresses: [],
    description: "A test loop-design for evidence coverage test",
    affected_system: "mcp-tools",
    created_at: new Date().toISOString(),
    created_by: "test",
  });
  assert.ok(loopDesign.success, "loop-design schema does not require evidence_code_ref");
});
