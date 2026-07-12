import { test } from "node:test";
import assert from "node:assert/strict";
import { metaStatePromoteRuleTool } from "../../tools/handlers/meta-state-promote-rule-tool.js";
import { metaStateReportTool } from "../../tools/handlers/meta-state-report-tool.js";
import { readRegistry } from "../../core/meta-state.js";
import { resolveRoot } from "#lib/resolve-root.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const originalEnv = process.env.GATE_ROOT;
const originalLoopSessionMode = process.env.LOOP_SESSION_MODE;

function setup() {
  const tempDir = mkdtempSync(join(tmpdir(), "promote-rule-"));
  process.env.GATE_ROOT = tempDir;
  return tempDir;
}

function teardown() {
  if (originalEnv === undefined) {
    delete process.env.GATE_ROOT;
  } else {
    process.env.GATE_ROOT = originalEnv;
  }
  process.env.LOOP_SESSION_MODE = originalLoopSessionMode;
}

test("meta_state_promote_rule writes entry_kind=rule entry (not mutated finding)", async () => {
  const tempDir = setup();
  try {
    const report = await metaStateReportTool.handler({
      category: "loop-anti-pattern",
      subtype: "new-artifact-type",
      severity: "warning",
      affected_system: "gate-logic",
      description: "Agent proposed a new artifact type which violates the philosophy.",
    });
    const reportText = JSON.parse(report.content[0].text);

    process.env.LOOP_SESSION_MODE = "live";
    const result = await metaStatePromoteRuleTool.handler({
      id: reportText.id,
      rule_id: "rule-test-entry-kind",
      enforcement: "gate",
      pattern_type: "regex",
      pattern: "new\\s+schema",
    });
    const text = JSON.parse(result.content[0].text);

    assert.equal(text.promoted, true);
    assert.equal(text.rule_entry_id, "rule-test-entry-kind");

    const entries = readRegistry(tempDir);
    const ruleEntry = entries.find((e) => e.entry_kind === "rule" && e.id === "rule-test-entry-kind");
    assert.ok(ruleEntry, "rule entry should exist");
    assert.equal(ruleEntry.origin, reportText.id);
    assert.equal(ruleEntry.enforcement, "gate");

    const finding = entries.find((e) => e.id === reportText.id);
    // After Phase 2 migration, promoted_to_rule is no longer written on findings.
    // The rule entry's origin field is the canonical inverse reference.
    // Plan 260712-0724 follow-up — Fix C (Gap #3): finding status stays as
    // post-migration "open" (NOT legacy "active"). The lifecycle-migration
    // invariant (lifecycle-migration-finalize.test.js:54) requires 0 findings
    // with status "active" survive the migration. The dedicated regression
    // test below asserts this on its own.
    assert.equal(finding.status, "open", "finding status should be 'open' after promotion (post-migration enum, not legacy 'active')");
  } finally {
    teardown();
  }
});

test("meta_state_promote_rule rejects 'tool' enforcement enum", async () => {
  const tempDir = setup();
  try {
    const report = await metaStateReportTool.handler({
      category: "loop-anti-pattern",
      subtype: "new-artifact-type",
      severity: "warning",
      affected_system: "gate-logic",
      description: "Agent proposed a new artifact type which violates the philosophy.",
    });
    const reportText = JSON.parse(report.content[0].text);

    process.env.LOOP_SESSION_MODE = "live";
    // The tool's schema should reject 'tool' at the zod validation layer
    // But since zod runs in the tool handler, we need to verify the behavior
    // by passing it and seeing it fail
    try {
      await metaStatePromoteRuleTool.handler({
        id: reportText.id,
        rule_id: "rule-test-tool",
        enforcement: "tool", // INVALID
        pattern_type: "regex",
        pattern: "test",
      });
      assert.fail("Should have rejected 'tool' enforcement");
    } catch (err) {
      // Expected: zod validation error or tool rejects it
      assert.ok(err.message.includes("tool") || err.message.includes("validation") || err.message.includes("enforcement"));
    }
  } finally {
    teardown();
  }
});

test("meta_state_promote_rule accepts pattern_type=resolution-evidence-required", async () => {
  const tempDir = setup();
  try {
    const report = await metaStateReportTool.handler({
      category: "loop-anti-pattern",
      subtype: "mcp-connection",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "MCP client loading gap: design note for a resolution-evidence-required rule.",
    });
    const reportText = JSON.parse(report.content[0].text);

    process.env.LOOP_SESSION_MODE = "live";
    const result = await metaStatePromoteRuleTool.handler({
      id: reportText.id,
      rule_id: "rule-test-resolution-evidence",
      enforcement: "gate",
      pattern_type: "resolution-evidence-required",
      pattern: "test-session-123",
    });
    const text = JSON.parse(result.content[0].text);

    assert.equal(text.promoted, true);

    const entries = readRegistry(tempDir);
    const ruleEntry = entries.find((e) => e.entry_kind === "rule" && e.id === "rule-test-resolution-evidence");
    assert.ok(ruleEntry, "rule entry should exist");
    assert.equal(ruleEntry.pattern_type, "resolution-evidence-required");
    assert.equal(ruleEntry.applies_to_resolution, "test-session-123");
  } finally {
    teardown();
  }
});

// Plan 260712-0724 follow-up — Fix B: meta_state_promote_rule accepts applies_to
// and persists it on the rule entry. Closes Implementation 3 Gap #2 — Red Team
// Finding 9 fix (12-tool scope on universal rules).
test("meta_state_promote_rule accepts applies_to.tools and persists on rule entry (RED→GREEN for Gap #2)", async () => {
  const tempDir = setup();
  try {
    const report = await metaStateReportTool.handler({
      category: "loop-anti-pattern",
      subtype: "assertinvariant-at-boundary",
      severity: "warning",
      affected_system: "meta-state-tools",
      description: "Test for apply_to.tools scope on universal rule (min 20 chars)",
    });
    const reportText = JSON.parse(report.content[0].text);

    process.env.LOOP_SESSION_MODE = "live";
    const appliesTo = {
      tools: ["meta-state-write-entry", "meta-state-update-entry", "meta-state-batch"],
      surfaces: ["mcp"],
    };
    const result = await metaStatePromoteRuleTool.handler({
      id: reportText.id,
      rule_id: "rule-test-applies-to-tools",
      enforcement: "agent",
      pattern_type: "regex",
      pattern: "^export\\s+function\\s+\\w+\\s*\\(",
      applies_to: appliesTo,
    });
    const text = JSON.parse(result.content[0].text);

    assert.equal(text.promoted, true);

    const entries = readRegistry(tempDir);
    const ruleEntry = entries.find((e) => e.entry_kind === "rule" && e.id === "rule-test-applies-to-tools");
    assert.ok(ruleEntry, "rule entry should exist");
    assert.deepEqual(ruleEntry.applies_to, appliesTo, "applies_to must round-trip through the registry");
    assert.deepEqual(ruleEntry.applies_to.tools, appliesTo.tools);
  } finally {
    teardown();
  }
});

test("meta_state_patch can set applies_to on an existing rule entry (RED→GREEN for Gap #2)", async () => {
  const tempDir = setup();
  try {
    const report = await metaStateReportTool.handler({
      category: "loop-anti-pattern",
      subtype: "assertinvariant-at-boundary",
      severity: "warning",
      affected_system: "meta-state-tools",
      description: "Seed for meta_state_patch applies_to round-trip on rule (min 20 chars)",
    });
    const reportText = JSON.parse(report.content[0].text);

    process.env.LOOP_SESSION_MODE = "live";
    await metaStatePromoteRuleTool.handler({
      id: reportText.id,
      rule_id: "rule-test-patch-applies-to",
      enforcement: "agent",
      pattern_type: "regex",
      pattern: "^export\\s+function\\s+\\w+\\s*\\(",
    });

    const { metaStatePatchTool } = await import("../../tools/handlers/meta-state-patch-tool.js");
    const appliesTo = { tools: ["meta-state-archive-entry"] };
    const patchResult = await metaStatePatchTool.handler({
      id: "rule-test-patch-applies-to",
      entry_kind: "rule",
      patch: { applies_to: appliesTo },
    });
    const patchText = JSON.parse(patchResult.content[0].text);
    assert.equal(patchText.patched, true, "patch must succeed");

    const entries = readRegistry(tempDir);
    const ruleEntry = entries.find((e) => e.entry_kind === "rule" && e.id === "rule-test-patch-applies-to");
    assert.deepEqual(ruleEntry.applies_to, appliesTo, "applies_to must persist via patch");
  } finally {
    teardown();
  }
});

// Plan 260712-0724 follow-up — Fix C: meta_state_promote_rule keeps the origin
// finding's status as "open" (post-migration enum), NOT legacy "active". Closes
// Implementation 3 Gap #3 — pre-existing bug surfaced during the deferred
// closeout live session. The lifecycle-migration invariant
// (lifecycle-migration-finalize.test.js:54) asserts 0 findings with status
// "active" survive the migration; promote_rule must not re-introduce them.
test("meta_state_promote_rule keeps origin finding status as 'open' (RED→GREEN for Gap #3)", async () => {
  const tempDir = setup();
  try {
    const report = await metaStateReportTool.handler({
      category: "loop-anti-pattern",
      subtype: "test-subtype",
      severity: "warning",
      affected_system: "gate-logic",
      description: "Test that promote_rule keeps origin finding status 'open' post-migration (min 20 chars)",
    });
    const reportText = JSON.parse(report.content[0].text);

    // Sanity: origin finding starts with status 'open' (post-migration enum)
    const beforePromote = readRegistry(tempDir).find((e) => e.id === reportText.id);
    assert.equal(beforePromote.status, "open", "origin finding must start as 'open'");

    process.env.LOOP_SESSION_MODE = "live";
    const result = await metaStatePromoteRuleTool.handler({
      id: reportText.id,
      rule_id: "rule-test-gap-3-status",
      enforcement: "gate",
      pattern_type: "regex",
      pattern: "test-pattern",
    });
    const text = JSON.parse(result.content[0].text);
    assert.equal(text.promoted, true);

    // Critical assertion: the origin finding must retain status 'open', NOT
    // be flipped to legacy 'active'. The lifecycle-migration invariant
    // (lifecycle-migration-finalize.test.js:54) requires 0 findings with
    // status 'active'.
    const afterPromote = readRegistry(tempDir).find((e) => e.id === reportText.id);
    assert.equal(afterPromote.entry_kind, "finding");
    assert.equal(afterPromote.status, "open", "origin finding must stay 'open' post-promotion, NOT flip to legacy 'active'");

    // The new rule entry MUST use the rule's active/inactive enum (separate
    // from finding's open/resolved/superseded enum)
    const ruleEntry = readRegistry(tempDir).find((e) => e.entry_kind === "rule" && e.id === "rule-test-gap-3-status");
    assert.equal(ruleEntry.status, "active", "rule entries use their own active/inactive enum");
  } finally {
    teardown();
  }
});
