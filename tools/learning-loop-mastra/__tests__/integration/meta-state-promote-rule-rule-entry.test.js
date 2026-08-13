import { test } from "vitest";
import assert from "node:assert/strict";
import { metaStatePromoteRuleTool } from "../../tools/handlers/meta-state-promote-rule-tool.js";
import { metaStateReportTool } from "../../tools/handlers/meta-state-report-tool.js";
import { readRegistry, writeEntry } from "../../core/meta-state.js";
import { resolveRoot } from "#lib/resolve-root.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const originalEnv = process.env.GATE_ROOT;

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

    const result = await metaStatePromoteRuleTool.handler({
      id: reportText.id,
      rule_id: "rule-test-entry-kind",
      internalization_level: "I3", evidence_code_ref: "test-rule-contract.js",
      pattern_type: "regex",
      pattern: "new\\s+schema",
    });
    const text = JSON.parse(result.content[0].text);

    assert.equal(text.promoted, true);
    assert.equal(text.rule_entry_id, "rule-test-entry-kind");

    const entries = readRegistry(tempDir);
    const ruleEntry = entries.find((e) => e.entry_kind === "rule" && e.id === "rule-test-entry-kind");
    assert.ok(ruleEntry, "rule entry should exist");
    // The on-record `origin` field is no longer written; the canonical
    // promotion edge is a citation row (source:rule, target:finding,
    // rationale:"origin"). The field stays schema-optional (inert-historical)
    // but is undefined on newly-promoted rules.
    assert.equal(ruleEntry.origin, undefined);
    assert.equal(ruleEntry.internalization_level, "I3");
    assert.equal(ruleEntry.version, 0, "newly promoted Rules start at version 0");
    assert.equal(ruleEntry.enforcement, undefined, "canonical registry rows do not persist the legacy classification");

    const citation = entries.find(
      (e) => e.entry_kind === "citation" && e.source === "rule-test-entry-kind" && e.target === reportText.id,
    );
    assert.ok(citation, "origin citation row linking rule→finding should exist");
    assert.equal(citation.rationale, "origin");

    const finding = entries.find((e) => e.id === reportText.id);
    // promoted_to_rule is no longer written on findings. The canonical
    // promotion edge is the citation row above. Finding status stays as
    // post-migration "open" (NOT legacy "active"); the lifecycle-migration
    // invariant requires 0 findings with status "active" survive the
    // migration. The dedicated regression test below asserts this on its own.
    assert.equal(finding.status, "open", "finding status should be 'open' after promotion (post-migration enum, not legacy 'active')");
  } finally {
    teardown();
  }
});

test("meta_state_promote_rule accepts the canonical I2 contract without the legacy discriminator", async () => {
  const tempDir = setup();
  try {
    const report = await metaStateReportTool.handler({
      category: "loop-anti-pattern",
      subtype: "i2-contract",
      severity: "warning",
      affected_system: "meta",
      description: "Canonical I2 promotion fixture with an authoritative Rule description.",
    });
    const source = JSON.parse(report.content[0].text);
    const result = await metaStatePromoteRuleTool.handler({
      id: source.id,
      rule_id: "rule-test-canonical-i2",
      internalization_level: "I2",
      pattern_type: "agent-checklist",
      pattern: JSON.stringify({ version: 1, items: [{ id: "i2", description: "Deliver this obligation for agent judgment" }] }),
      hint_text: "Canonical I2 delivery prose for the agent session-start surface.",
      hint_suggestion: "Deliver the canonical I2 Rule before the first agentic step.",
    });
    assert.equal(JSON.parse(result.content[0].text).promoted, true);
    const rule = readRegistry(tempDir).find((entry) => entry.id === "rule-test-canonical-i2");
    assert.equal(rule.internalization_level, "I2");
    assert.equal(rule.enforcement, undefined);
  } finally {
    teardown();
  }
});

test("meta_state_promote_rule rejects a canonical I3 Rule without evidence_code_ref", async () => {
  const tempDir = setup();
  try {
    const report = await metaStateReportTool.handler({
      category: "loop-anti-pattern",
      subtype: "i3-contract",
      severity: "warning",
      affected_system: "meta",
      description: "Canonical I3 promotion fixture that must name its evidence.",
    });
    const source = JSON.parse(report.content[0].text);
    const result = await metaStatePromoteRuleTool.handler({
      id: source.id,
      rule_id: "rule-test-canonical-i3-no-evidence",
      internalization_level: "I3",
      pattern_type: "regex",
      pattern: "dangerous-action",
    });
    const text = JSON.parse(result.content[0].text);
    assert.equal(text.promoted, false);
    assert.equal(text.reason, "evidence_code_ref_required_for_i3");
    assert.equal(readRegistry(tempDir).some((entry) => entry.id === "rule-test-canonical-i3-no-evidence"), false);
  } finally {
    teardown();
  }
});

test("meta_state_promote_rule rejects an invalid internalization level", async () => {
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

    // The tool's schema should reject 'tool' at the zod validation layer
    // But since zod runs in the tool handler, we need to verify the behavior
    // by passing it and seeing it fail
    try {
      await metaStatePromoteRuleTool.handler({
        id: reportText.id,
        rule_id: "rule-test-tool",
        internalization_level: "tool", // INVALID
        pattern_type: "regex",
        pattern: "test",
      });
      assert.fail("Should have rejected an invalid internalization level");
    } catch (err) {
      // Expected: zod validation error or tool rejects it
      assert.ok(err.message.includes("tool") || err.message.includes("validation") || err.message.includes("internalization_level"));
    }
  } finally {
    teardown();
  }
});

test("meta_state_promote_rule accepts pattern_type=determinism-checklist", async () => {
  const tempDir = setup();
  try {
    const report = await metaStateReportTool.handler({
      category: "loop-anti-pattern",
      subtype: "mcp-connection",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "MCP client loading gap: design note for a determinism-checklist rule.",
    });
    const reportText = JSON.parse(report.content[0].text);

    const result = await metaStatePromoteRuleTool.handler({
      id: reportText.id,
      rule_id: "rule-test-resolution-evidence",
      internalization_level: "I3", evidence_code_ref: "test-rule-contract.js",
      pattern_type: "determinism-checklist",
      pattern: "test-session-123",
    });
    const text = JSON.parse(result.content[0].text);

    assert.equal(text.promoted, true);

    const entries = readRegistry(tempDir);
    const ruleEntry = entries.find((e) => e.entry_kind === "rule" && e.id === "rule-test-resolution-evidence");
    assert.ok(ruleEntry, "rule entry should exist");
    assert.equal(ruleEntry.pattern_type, "determinism-checklist");
    assert.equal(ruleEntry.applies_to_resolution, "test-session-123");
  } finally {
    teardown();
  }
});

// meta_state_promote_rule accepts applies_to and persists it on the rule
// entry — the 12-tool scope on universal rules.
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

    const appliesTo = {
      tools: ["meta-state-write-entry", "meta-state-update-entry", "meta-state-batch"],
      surfaces: ["mcp"],
    };
    const result = await metaStatePromoteRuleTool.handler({
      id: reportText.id,
      rule_id: "rule-test-applies-to-tools",
      internalization_level: "I2",
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

    await metaStatePromoteRuleTool.handler({
      id: reportText.id,
      rule_id: "rule-test-patch-applies-to",
      internalization_level: "I2",
      pattern_type: "regex",
      pattern: "^export\\s+function\\s+\\w+\\s*\\(",
    });

    await writeEntry(tempDir, {
      id: "rule-test-patch-applies-to-prior",
      entry_kind: "rule",
      internalization_level: "I2",
      pattern_type: "agent-checklist",
      pattern: JSON.stringify({ version: 1, items: [{ id: "prior", description: "Prior Rule for patch lineage" }] }),
      description: "Prior Rule for the material applies_to patch lineage.",
      status: "active",
      promoted_at: new Date().toISOString(),
      promoted_by: "operator",
    });

    const { metaStatePatchTool } = await import("../../tools/handlers/meta-state-patch-tool.js");
    const appliesTo = { tools: ["meta-state-archive-entry"] };
    const patchResult = await metaStatePatchTool.handler({
      id: "rule-test-patch-applies-to",
      entry_kind: "rule",
      patch: { applies_to: appliesTo, supersedes: "rule-test-patch-applies-to-prior" },
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

// meta_state_promote_rule keeps the origin finding's status as "open"
// (post-migration enum), NOT legacy "active". The lifecycle-migration
// invariant (lifecycle-migration-finalize.test.js:54) asserts 0 findings
// with status "active" survive the migration; promote_rule must not
// re-introduce them.
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

    const result = await metaStatePromoteRuleTool.handler({
      id: reportText.id,
      rule_id: "rule-test-gap-3-status",
      internalization_level: "I3", evidence_code_ref: "test-rule-contract.js",
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

test("preview:true on agent-checklist without hint_text reaches the preview branch (I5 regression)", async () => {
  // Code-review I5 (plans/260717-1826): the hint_text-required gate used to run
  // BEFORE the preview branch, so `preview:true` on an agent-checklist rule
  // without hint_text was rejected — contradicting the documented preview
  // contract ("test pattern matches without activating"). Preview creates no
  // rule, so no injection prose is required.
  const tempDir = setup();
  try {
    const report = await metaStateReportTool.handler({
      category: "loop-anti-pattern",
      subtype: "new-artifact-type",
      severity: "warning",
      affected_system: "gate-logic",
      description: "Preview-mode agent-checklist promotion must not require hint_text.",
    });
    const reportText = JSON.parse(report.content[0].text);

    const result = await metaStatePromoteRuleTool.handler({
      id: reportText.id,
      rule_id: "rule-test-preview-no-hint",
      internalization_level: "I2",
      pattern_type: "agent-checklist",
      pattern: JSON.stringify({ version: 1, items: [{ id: "x", description: "y" }] }),
      preview: true,
    });
    const text = JSON.parse(result.content[0].text);
    assert.equal(text.preview, true, "preview must reach the preview branch");
    assert.notEqual(text.reason, "hint_text_required_for_agent_checklist",
      "preview must not be rejected for missing hint_text");
  } finally {
    teardown();
  }
});

test("activation on agent-checklist without hint_text is still rejected (gate intact)", async () => {
  const tempDir = setup();
  try {
    const report = await metaStateReportTool.handler({
      category: "loop-anti-pattern",
      subtype: "new-artifact-type",
      severity: "warning",
      affected_system: "gate-logic",
      description: "Activation-mode agent-checklist promotion must require hint_text.",
    });
    const reportText = JSON.parse(report.content[0].text);

    const result = await metaStatePromoteRuleTool.handler({
      id: reportText.id,
      rule_id: "rule-test-activation-needs-hint",
      internalization_level: "I2",
      pattern_type: "agent-checklist",
      pattern: JSON.stringify({ version: 1, items: [{ id: "x", description: "y" }] }),
    });
    const text = JSON.parse(result.content[0].text);
    assert.equal(text.promoted, false);
    assert.equal(text.reason, "hint_text_required_for_agent_checklist");
  } finally {
    teardown();
  }
});

test("activation on agent-checklist with malformed pattern JSON is rejected with named reason", async () => {
  const tempDir = setup();
  try {
    const report = await metaStateReportTool.handler({
      category: "loop-anti-pattern",
      subtype: "new-artifact-type",
      severity: "warning",
      affected_system: "gate-logic",
      description: "Activation-mode agent-checklist promotion must reject malformed pattern JSON.",
    });
    const reportText = JSON.parse(report.content[0].text);

    const result = await metaStatePromoteRuleTool.handler({
      id: reportText.id,
      rule_id: "rule-test-malformed-checklist-pattern",
      internalization_level: "I2",
      pattern_type: "agent-checklist",
      pattern: "[not-json",
      hint_text: "A sufficiently long process hint for this agent-checklist rule.",
      hint_suggestion: "Curated one-line pointer text (between 20 and 200 chars, single line).",
    });
    const text = JSON.parse(result.content[0].text);
    assert.equal(text.promoted, false);
    assert.equal(text.reason, "pattern_invalid_agent_checklist_shape");
    assert.ok(Array.isArray(text.problems) && text.problems.length > 0);

    const entries = readRegistry(tempDir);
    assert.ok(
      !entries.some((e) => e.entry_kind === "rule" && e.id === "rule-test-malformed-checklist-pattern"),
      "no rule entry may be written for a malformed pattern",
    );
  } finally {
    teardown();
  }
});

test("activation on agent-checklist with wrong-shape pattern JSON is rejected", async () => {
  const tempDir = setup();
  try {
    const report = await metaStateReportTool.handler({
      category: "loop-anti-pattern",
      subtype: "new-artifact-type",
      severity: "warning",
      affected_system: "gate-logic",
      description: "Activation-mode agent-checklist promotion must reject wrong-shape pattern JSON.",
    });
    const reportText = JSON.parse(report.content[0].text);

    const result = await metaStatePromoteRuleTool.handler({
      id: reportText.id,
      rule_id: "rule-test-wrong-shape-checklist-pattern",
      internalization_level: "I2",
      pattern_type: "agent-checklist",
      pattern: JSON.stringify({ version: 1 }),
      hint_text: "A sufficiently long process hint for this agent-checklist rule.",
      hint_suggestion: "Curated one-line pointer text (between 20 and 200 chars, single line).",
    });
    const text = JSON.parse(result.content[0].text);
    assert.equal(text.promoted, false);
    assert.equal(text.reason, "pattern_invalid_agent_checklist_shape");
  } finally {
    teardown();
  }
});

test("activation on agent-checklist with well-formed pattern JSON promotes", async () => {
  const tempDir = setup();
  try {
    const report = await metaStateReportTool.handler({
      category: "loop-anti-pattern",
      subtype: "new-artifact-type",
      severity: "warning",
      affected_system: "gate-logic",
      description: "Activation-mode agent-checklist promotion accepts a well-formed JSON pattern.",
    });
    const reportText = JSON.parse(report.content[0].text);

    const result = await metaStatePromoteRuleTool.handler({
      id: reportText.id,
      rule_id: "rule-test-well-formed-checklist-pattern",
      internalization_level: "I2",
      pattern_type: "agent-checklist",
      pattern: JSON.stringify({ version: 1, items: [{ id: "step-one", description: "Do step one" }] }),
      hint_text: "A sufficiently long process hint for this agent-checklist rule.",
      hint_suggestion: "Curated one-line pointer text (between 20 and 200 chars, single line).",
    });
    const text = JSON.parse(result.content[0].text);
    assert.equal(text.promoted, true, JSON.stringify(text));
  } finally {
    teardown();
  }
});

// Agent-checklist promotion requires hint_suggestion (the buildProcessView
// in hint-registry.js reads it unconditionally). Mirrors the existing
// hint_text requirement.
test("activation on agent-checklist without hint_suggestion is rejected (mirror of hint_text gate)", async () => {
  const tempDir = setup();
  try {
    const report = await metaStateReportTool.handler({
      category: "loop-anti-pattern",
      subtype: "new-artifact-type",
      severity: "warning",
      affected_system: "gate-logic",
      description: "Activation-mode agent-checklist promotion must require hint_suggestion.",
    });
    const reportText = JSON.parse(report.content[0].text);

    const result = await metaStatePromoteRuleTool.handler({
      id: reportText.id,
      rule_id: "rule-test-needs-hint-suggestion",
      internalization_level: "I2",
      pattern_type: "agent-checklist",
      pattern: JSON.stringify({ version: 1, items: [{ id: "step-one", description: "Do step one" }] }),
      hint_text: "A sufficiently long process hint for this agent-checklist rule.",
      // hint_suggestion omitted on purpose
    });
    const text = JSON.parse(result.content[0].text);
    assert.equal(text.promoted, false);
    assert.equal(text.reason, "hint_suggestion_required_for_agent_checklist");
  } finally {
    teardown();
  }
});

test("activation on agent-checklist with multi-line hint_suggestion is rejected (single-line invariant)", async () => {
  const tempDir = setup();
  try {
    const report = await metaStateReportTool.handler({
      category: "loop-anti-pattern",
      subtype: "new-artifact-type",
      severity: "warning",
      affected_system: "gate-logic",
      description: "Activation-mode agent-checklist promotion must reject multi-line hint_suggestion.",
    });
    const reportText = JSON.parse(report.content[0].text);

    const result = await metaStatePromoteRuleTool.handler({
      id: reportText.id,
      rule_id: "rule-test-multiline-suggestion",
      internalization_level: "I2",
      pattern_type: "agent-checklist",
      pattern: JSON.stringify({ version: 1, items: [{ id: "step-one", description: "Do step one" }] }),
      hint_text: "A sufficiently long process hint for this agent-checklist rule.",
      hint_suggestion: "First line\nSecond line would manufacture fake pointer rows.",
    });
    const text = JSON.parse(result.content[0].text);
    assert.equal(text.promoted, false);
    assert.equal(text.reason, "hint_suggestion_required_for_agent_checklist");
  } finally {
    teardown();
  }
});

test("activation on agent-checklist with hint_slug that collides with a standalone registry slug is rejected", async () => {
  const tempDir = setup();
  try {
    const report = await metaStateReportTool.handler({
      category: "loop-anti-pattern",
      subtype: "new-artifact-type",
      severity: "warning",
      affected_system: "gate-logic",
      description: "Activation-mode agent-checklist promotion must reject hint_slug colliding with a standalone slug.",
    });
    const reportText = JSON.parse(report.content[0].text);

    const result = await metaStatePromoteRuleTool.handler({
      id: reportText.id,
      rule_id: "rule-test-collision-standalone",
      internalization_level: "I2",
      pattern_type: "agent-checklist",
      pattern: JSON.stringify({ version: 1, items: [{ id: "step-one", description: "Do step one" }] }),
      hint_text: "A sufficiently long process hint for this agent-checklist rule.",
      hint_suggestion: "Curated one-line pointer text (between 20 and 200 chars, single line).",
      hint_slug: "pnpm-test-discipline", // collides with standalone registry slug
    });
    const text = JSON.parse(result.content[0].text);
    assert.equal(text.promoted, false);
    assert.equal(text.reason, "hint_slug_collides_with_standalone");
  } finally {
    teardown();
  }
});

test("activation on agent-checklist persists hint_order / hint_suggestion / hint_slug on the rule entry", async () => {
  const tempDir = setup();
  try {
    const report = await metaStateReportTool.handler({
      category: "loop-anti-pattern",
      subtype: "new-artifact-type",
      severity: "warning",
      affected_system: "gate-logic",
      description: "Activation-mode agent-checklist promotion persists the new hint metadata fields.",
    });
    const reportText = JSON.parse(report.content[0].text);

    const result = await metaStatePromoteRuleTool.handler({
      id: reportText.id,
      rule_id: "rule-test-persists-hint-meta",
      internalization_level: "I2",
      pattern_type: "agent-checklist",
      pattern: JSON.stringify({ version: 1, items: [{ id: "step-one", description: "Do step one" }] }),
      hint_text: "A sufficiently long process hint for this agent-checklist rule.",
      hint_suggestion: "Curated one-line pointer text (between 20 and 200 chars, single line).",
      hint_order: 75,
      hint_slug: "custom-hint-slug",
    });
    const text = JSON.parse(result.content[0].text);
    assert.equal(text.promoted, true, JSON.stringify(text));

    const entries = readRegistry(tempDir);
    const ruleEntry = entries.find((e) => e.entry_kind === "rule" && e.id === "rule-test-persists-hint-meta");
    assert.ok(ruleEntry, "rule entry should exist");
    assert.equal(ruleEntry.hint_suggestion, "Curated one-line pointer text (between 20 and 200 chars, single line).");
    assert.equal(ruleEntry.hint_order, 75);
    assert.equal(ruleEntry.hint_slug, "custom-hint-slug");
  } finally {
    teardown();
  }
});
