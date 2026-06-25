import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..", "..");
const META_STATE_PATH = join(PROJECT_ROOT, "meta-state.jsonl");

// 9 entries / 13 field updates verified by research
const REPOINTED_ENTRIES = [
  "meta-260609T2116Z-tools-learning-loop-mcp-server-js-process-env-isolation",
  "meta-260616T2123Z-plans-reports-productization-260612-1530-master-tracker-md-p",
  "meta-260617T0113Z-tools-learning-loop-mastra-schemas-js",
  "meta-260618T0557Z-tools-learning-loop-mastra-create-loop-tool-js",
  "meta-260618T0558Z-post-migration-sp2-grounding-marker-for-tools-learning-loop",
  "meta-260618T1519Z-tools-learning-loop-mastra-schema-parity-js",
  "meta-260622T1951Z-plans-260622-1810-phase-d-plan-1a-parity-tightening-plan-md",
  "meta-260623T1039Z-plans-260622-2119-phase-d-plan-1b-review-fixups-plan-md",
  "meta-260623T2345Z-plans-reports-productization-260612-1530-master-tracker-md",
];

test("9 meta-state entries have been repointed to mastra/ paths", () => {
  const content = readFileSync(META_STATE_PATH, "utf8");
  const lines = content.split("\n").filter(Boolean);
  const unrepointed = [];
  for (const entryId of REPOINTED_ENTRIES) {
    const entryLine = lines.find((line) => line.includes(`"id":"${entryId}"`));
    assert.ok(entryLine, `entry ${entryId} not found in meta-state.jsonl`);
    const hasPreMovePath =
      entryLine.includes("tools/learning-loop-mastra/server.js") ||
      entryLine.includes("tools/learning-loop-mastra/create-loop-tool.js") ||
      entryLine.includes("tools/learning-loop-mastra/create-loop-workflow.js") ||
      entryLine.includes("tools/learning-loop-mastra/legacy-handler-adapter.js") ||
      entryLine.includes("tools/learning-loop-mastra/schema-parity.js") ||
      entryLine.includes("tools/learning-loop-mastra/schemas.js");
    if (hasPreMovePath) {
      unrepointed.push(entryId);
    }
  }
  assert.deepStrictEqual(unrepointed, [], `entries not repointed to mastra/ paths: ${unrepointed.join(", ")}`);
});

test("repointed entries reference mastra/ paths", () => {
  const content = readFileSync(META_STATE_PATH, "utf8");
  const lines = content.split("\n").filter(Boolean);
  for (const entryId of REPOINTED_ENTRIES) {
    const entryLine = lines.find((line) => line.includes(`"id":"${entryId}"`));
    assert.ok(entryLine, `entry ${entryId} not found in meta-state.jsonl`);
    assert.ok(
      entryLine.includes("tools/learning-loop-mastra/mastra/"),
      `entry ${entryId} must reference at least one mastra/ path after repoint`
    );
  }
});
