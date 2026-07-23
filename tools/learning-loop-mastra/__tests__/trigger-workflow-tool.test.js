// trigger-workflow-tool.test.js — regression coverage for the post-review
// corrections that landed in plan 260722-2147 phase 5:
//   * recommended_tools may be an empty array (vacated per
//     commit 0a4ba5c — see also the file header on workflow-registry.js);
//     the handler must not crash on `[].join(", ")`, must log a fallback
//     reasoning string, and must keep the gate-log write working.
//   * unknown workflow names still short-circuit to
//     `{ triggered: false, reason: "not_found" }` with the gate-log entry.
//
// The suite also lifts coverage on `trigger-workflow-tool.js` from 0% so the
// function's CRAP score clears fallow's per-PR threshold gate.

import { test } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { workflowTriggerTool as tool } from "../tools/handlers/trigger-workflow-tool.js";

function withGateRoot(body) {
  const tempRoot = mkdtempSync(join(tmpdir(), "trigger-workflow-"));
  const previous = process.env.GATE_ROOT;
  process.env.GATE_ROOT = tempRoot;
  return (async () => {
    try {
      return await body(tempRoot);
    } finally {
      if (previous === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = previous;
    }
  })();
}

test("returns triggered:false with reason:not_found for an unknown workflow", async () => {
  await withGateRoot(async () => {
    const out = await tool.handler({ name: "definitely-not-a-workflow" });
    const payload = JSON.parse(out.content[0].text);
    assert.deepStrictEqual(payload, {
      triggered: false,
      reason: "not_found",
    });
  });
});

test("returns the success shape with an empty recommended_tools array and a fallback reasoning string", async () => {
  await withGateRoot(async () => {
    const out = await tool.handler({ name: "evidence-changed" });
    const payload = JSON.parse(out.content[0].text);
    assert.strictEqual(payload.triggered, true);
    assert.strictEqual(payload.workflow, "evidence-changed");
    assert.deepStrictEqual(payload.recommended_tools, []);
    assert.match(
      payload.reasoning,
      /recommendations vacated/,
      "fallback reasoning should explain the vacated recommendations",
    );
  });
});

test("appends a gate-log entry on the success path", async () => {
  await withGateRoot(async (tempRoot) => {
    await tool.handler({ name: "evidence-changed" });
    const logPath = join(tempRoot, ".claude", "coordination", "gate-log.jsonl");
    const { readFileSync } = await import("node:fs");
    const lines = readFileSync(logPath, "utf8").trim().split("\n").map(JSON.parse);
    const last = lines[lines.length - 1];
    assert.strictEqual(last.tool, "workflow_trigger");
    assert.strictEqual(last.workflow, "evidence-changed");
    assert.strictEqual(last.triggered, true);
    assert.deepStrictEqual(last.recommended_tools, []);
  });
});
