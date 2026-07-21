import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readRegistry } from "../../core/meta-state.js";
import { withMcpServer } from "../with-mcp-server.js";

// All tests go through withMcpServer/callTool so the MCP-layer Zod validation
// fires. Direct handler calls bypass the schema and cannot reproduce the
// .default() injection (finding meta-260712T0053Z).
//
// Plan 260720-1955 Phase 2 relocated the branch-union patch schemas off-wire:
// the MCP-layer `patch` field is now a free-form z.record (H10), so an unknown
// or identity key no longer throws at the MCP boundary. Identity fields
// (entry_kind, status, ...) are denied at the handler as a normal result
// {patched:false, reason:"immutable_field"|"empty_patch", ...} — callTool
// returns it, it does not throw. Tests assert the result fields AND the
// registry state (entry_kind must not flip) as the load-bearing invariant.

// (a) Empty patch {} on a loop-design preserves entry_kind (no first-union-branch injection).
// Updated for meta-260717T1026Z-...empty-patch: empty patches are now rejected with
// reason "empty_patch" instead of silently no-op'ing. The registry-state invariant
// (entry_kind must not flip) is still the load-bearing check.
test("meta_state_patch empty patch {} on loop-design is rejected with reason empty_patch; entry_kind unchanged", async () => {
  await withMcpServer(async ({ callTool, tempRoot }) => {
    const design = await callTool("mastra_meta_state_propose_design", {
      title: "test-empty-patch-kind-preservation",
      description: "Empty patch must not flip entry_kind (min 20 chars)",
      proposed_design_for: ["rule-A"],
      addresses: [],
      affected_system: "mcp-tools",
    });
    const result = await callTool("mastra_meta_state_patch", {
      id: design.id,
      entry_kind: "loop-design",
      patch: {},
    });
    // Post-fix (meta-260717T1026Z): empty patches are rejected outright.
    assert.equal(result.patched, false);
    assert.equal(result.reason, "empty_patch");
    const entry = readRegistry(tempRoot).find((e) => e.id === design.id);
    assert.equal(entry.entry_kind, "loop-design", "entry_kind must not flip to 'finding'");
    // No version bump from an empty patch.
    assert.equal(entry.version, 0, "empty patch must not bump version");
  });
});

// (a-status) Rule patch schema omits status (Fix A) — schema-level verification of
// Red-team Security #1: status .default("active") on rule/loop-design was the same
// .default()-under-.partial() injection class. After Fix A the rule patch schema's
// parsed output must NOT contain a status field. Tested at the schema layer because
// the MCP-layer setup path is closed in Phase 2 (status added to IMMUTABLE_PATCH_FIELDS,
// blocking the batch-update "deactivate rule" setup path). Plan 260712-0109 Phase 1+2.
test("buildPatchSchemaFor for rule omits status (Fix A, no status re-injection)", async () => {
  const { buildPatchSchemaFor } = await import("../../core/meta-state.js");
  const ruleSchema = buildPatchSchemaFor("rule");
  // Patch contains a rule-only field (pattern_type) + description; both unknown to
  // finding schema -> union matches rule branch. Status is NOT in the patch input;
  // pre-fix this is where status .default("active") would fire.
  const result = ruleSchema.safeParse({
    pattern_type: "agent-checklist",
    description: "patch the description only (min 20 chars for schema)",
  });
  assert.equal(result.success, true, `parse must succeed, got: ${JSON.stringify(result.error?.format())}`);
  assert.equal(
    result.data.status,
    undefined,
    `status must NOT be injected on an unrelated rule patch, got: ${JSON.stringify(result.data)}`,
  );
});

// (b) entry_kind inside patch is rejected. Plan 260720-1955 Phase 2 relocated the
//     branch-union patch schemas from always-on-wire (Zod .strict() throw) to
//     at-invocation error payloads: the MCP-layer `patch` field is now a free-form
//     z.record (H10), so an unknown/identity key no longer throws at the MCP
//     boundary. The identity invariant is enforced deeper — the handler strips
//     entry_kind and returns {patched:false, reason:"immutable_field",
//     denied_fields:["entry_kind"]} instead of throwing. The registry-state
//     assertion (entry_kind must not flip) remains the load-bearing check.
test("meta_state_patch rejects entry_kind inside patch (Fix A); registry state unchanged", async () => {
  await withMcpServer(async ({ callTool, tempRoot }) => {
    const report = await callTool("mastra_meta_state_report", {
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Finding for entry_kind-in-patch rejection test (min 20 chars)",
    });
    // Post-Phase-2: entry_kind in patch is denied as an immutable_field (handler
    // return), not a Zod throw. (Pre-fix RED: the patch SUCCEEDS — entry_kind
    // matches the rule branch, flips to "rule". See red-team Failure #3: the
    // RED-state corruption is to "rule", not "finding".)
    const result = await callTool("mastra_meta_state_patch", {
      id: report.id,
      entry_kind: "finding",
      patch: { entry_kind: "rule" },
    });
    assert.equal(result.patched, false, "patch with identity field must not apply");
    assert.equal(result.reason, "immutable_field");
    assert.ok(
      Array.isArray(result.denied_fields) && result.denied_fields.includes("entry_kind"),
      `entry_kind must be listed as denied, got: ${JSON.stringify(result.denied_fields)}`,
    );
    const entry = readRegistry(tempRoot).find((e) => e.id === report.id);
    assert.equal(entry.entry_kind, "finding", "entry_kind must be unchanged after rejected patch");
  });
});

// (d) Gate-log for an empty patch records reason empty_patch (honest logging).
//     Pre-fix (meta-260712T0053Z, Fix A): empty patches silently succeeded and
//     logged fields_patched:[] — the test was locking in the silent-success bug.
//     Post-fix (meta-260717T1026Z): empty patches are rejected with reason
//     empty_patch and logged as such (no fields_patched field).
//     Gate-log path (verified gate-logging.js:53-63 + gate-logging.test.js:79):
//     <tempRoot>/.claude/coordination/gate-log.jsonl
test("meta_state_patch empty patch logs reason=empty_patch, no fields_patched", async () => {
  await withMcpServer(async ({ callTool, tempRoot }) => {
    const report = await callTool("mastra_meta_state_report", {
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Finding for honest gate-log empty_patch test (min 20 chars)",
    });
    const result = await callTool("mastra_meta_state_patch", {
      id: report.id,
      entry_kind: "finding",
      patch: {},
    });
    assert.equal(result.patched, false);
    assert.equal(result.reason, "empty_patch");
    const gateLogPath = join(tempRoot, ".claude", "coordination", "gate-log.jsonl");
    const gateLog = readFileSync(gateLogPath, "utf8").trim().split("\n").map(JSON.parse);
    const patchEntry = gateLog.filter((e) => e.tool === "meta_state_patch" && e.id === report.id).pop();
    assert.ok(patchEntry, "gate log must contain the patch entry");
    assert.equal(patchEntry.patched, false);
    assert.equal(patchEntry.reason, "empty_patch");
    assert.equal(patchEntry.fields_patched, undefined,
      `fields_patched must NOT be set for a rejected patch, got ${JSON.stringify(patchEntry.fields_patched)}`);
  });
});
