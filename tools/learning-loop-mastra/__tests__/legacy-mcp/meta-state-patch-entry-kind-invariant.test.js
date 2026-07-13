import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readRegistry } from "../../core/meta-state.js";
import { withMcpServer } from "../with-mcp-server.js";

// All tests go through withMcpServer/callTool so the MCP-layer Zod union
// validation fires. Direct handler calls bypass the schema and cannot
// reproduce the .default() injection (finding meta-260712T0053Z).
//
// Harness behavior (verified with-mcp-server.js:88-101): callTool does
// JSON.parse(result.content[0].text) with no isError check. When the MCP
// SDK rejects invalid args (Fix A's .strict() rejects entry_kind as unknown),
// it returns {isError:true, content:[{text:"Tool validation failed..."}]}
// (non-JSON) -> callTool throws SyntaxError from JSON.parse. Tests that
// expect rejection MUST wrap callTool in try/catch and assert the REGISTRY
// STATE as the primary check, not the callTool return value.

// (a) Empty patch {} on a loop-design preserves entry_kind (no first-union-branch injection).
test("meta_state_patch empty patch {} on loop-design preserves entry_kind", async () => {
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
    assert.equal(result.patched, true);
    assert.equal(result.entry_kind, "loop-design");
    const entry = readRegistry(tempRoot).find((e) => e.id === design.id);
    assert.equal(entry.entry_kind, "loop-design", "entry_kind must not flip to 'finding'");
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
    pattern_type: "consult-checklist",
    description: "patch the description only (min 20 chars for schema)",
  });
  assert.equal(result.success, true, `parse must succeed, got: ${JSON.stringify(result.error?.format())}`);
  assert.equal(
    result.data.status,
    undefined,
    `status must NOT be injected on an unrelated rule patch, got: ${JSON.stringify(result.data)}`,
  );
});

// (b) entry_kind inside patch is rejected (Fix A). callTool THROWS SyntaxError on the
//     non-JSON MCP validation error — assert registry state as the primary check.
test("meta_state_patch rejects entry_kind inside patch (Fix A); registry state unchanged", async () => {
  await withMcpServer(async ({ callTool, tempRoot }) => {
    const report = await callTool("mastra_meta_state_report", {
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Finding for entry_kind-in-patch rejection test (min 20 chars)",
    });
    // After Fix A: patch:{entry_kind:"rule"} -> .strict() rejects as unknown key ->
    // MCP SDK returns isError text -> callTool throws SyntaxError from JSON.parse.
    // (Pre-fix RED: the patch SUCCEEDS — entry_kind matches the rule branch, flips to "rule".
    //  See red-team Failure #3: the RED-state corruption is to "rule", not "finding".)
    await assert.rejects(
      callTool("mastra_meta_state_patch", {
        id: report.id,
        entry_kind: "finding",
        patch: { entry_kind: "rule" },
      }),
      // Accept any rejection (SyntaxError from JSON.parse, or a thrown Zod error).
      // The registry-state assertion below is the load-bearing check.
    );
    const entry = readRegistry(tempRoot).find((e) => e.id === report.id);
    assert.equal(entry.entry_kind, "finding", "entry_kind must be unchanged after rejected patch");
  });
});

// (d) Gate-log fields_patched for an empty patch is [] (honest logging). The handler
//     logs Object.keys(effectivePatch) at patch-tool.js:142. Pre-fix: .default() injects
//     entry_kind -> fields_patched:["entry_kind"]. Post-fix: no injection -> [].
//     Gate-log path (verified gate-logging.js:53-63 + gate-logging.test.js:79):
//     <tempRoot>/.claude/coordination/gate-log.jsonl
test("meta_state_patch empty patch logs fields_patched:[] not ['entry_kind']", async () => {
  await withMcpServer(async ({ callTool, tempRoot }) => {
    const report = await callTool("mastra_meta_state_report", {
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Finding for honest gate-log fields_patched test (min 20 chars)",
    });
    await callTool("mastra_meta_state_patch", {
      id: report.id,
      entry_kind: "finding",
      patch: {},
    });
    const gateLogPath = join(tempRoot, ".claude", "coordination", "gate-log.jsonl");
    const gateLog = readFileSync(gateLogPath, "utf8").trim().split("\n").map(JSON.parse);
    const patchEntry = gateLog.filter((e) => e.tool === "meta_state_patch" && e.id === report.id).pop();
    assert.ok(patchEntry, "gate log must contain the patch entry");
    assert.deepEqual(patchEntry.fields_patched, [],
      `fields_patched must be [] for empty patch, got ${JSON.stringify(patchEntry.fields_patched)}`);
  });
});
