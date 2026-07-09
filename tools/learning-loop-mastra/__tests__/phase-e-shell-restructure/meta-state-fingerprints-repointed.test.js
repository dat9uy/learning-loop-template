import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..", "..");
const META_STATE_PATH = join(PROJECT_ROOT, "meta-state.jsonl");

// 9 entries / 13 field updates verified by research. Each entry is paired with
// the post-move path its `evidence_code_ref` (for findings) or `change_target`
// (for change-logs) was repointed to. The proof line in the JSONL must
// reference the post-move path; the entry's own line works for change-logs
// (never compacted) and for findings still in the JSONL. For findings that
// were resolved and compacted (e.g. meta-260618T0558Z-..., which is now
// `status: resolved` and > 7 days old, compacted by `updateEntry` at
// `core/meta-state.js:595-601`), the change-log that documents the same
// file's repointing serves as the audit trail.
const REPOINTED_ENTRIES = [
  { id: "meta-260609T2116Z-tools-learning-loop-mcp-server-js-process-env-isolation", postMovePath: "tools/learning-loop-mastra/mastra/server.js" },
  { id: "meta-260616T2123Z-plans-reports-productization-260612-1530-master-tracker-md-p", postMovePath: "tools/learning-loop-mastra/mastra/" },
  { id: "meta-260617T0113Z-tools-learning-loop-mastra-schemas-js", postMovePath: "tools/learning-loop-mastra/mastra/schemas.js" },
  { id: "meta-260618T0557Z-tools-learning-loop-mastra-create-loop-tool-js", postMovePath: "tools/learning-loop-mastra/mastra/create-loop-tool.js" },
  { id: "meta-260618T0558Z-post-migration-sp2-grounding-marker-for-tools-learning-loop", postMovePath: "tools/learning-loop-mastra/mastra/create-loop-tool.js" },
  { id: "meta-260618T1519Z-tools-learning-loop-mastra-schema-parity-js", postMovePath: "tools/learning-loop-mastra/mastra/schema-parity.js" },
  { id: "meta-260622T1951Z-plans-260622-1810-phase-d-plan-1a-parity-tightening-plan-md", postMovePath: "tools/learning-loop-mastra/mastra/" },
  { id: "meta-260623T1039Z-plans-260622-2119-phase-d-plan-1b-review-fixups-plan-md", postMovePath: "tools/learning-loop-mastra/mastra/" },
  { id: "meta-260623T2345Z-plans-reports-productization-260612-1530-master-tracker-md", postMovePath: "tools/learning-loop-mastra/mastra/" },
];

// Find a line in the JSONL that proves the repointing of an entry. Accepts:
//  1. The entry's own line (works for change-logs which are never compacted,
//     and for findings still in the JSONL).
//  2. A change-log whose `change_target` is the post-move path. This is the
//     audit trail for findings that were resolved and compacted.
function findRepointingProof(lines, entryId, postMovePath) {
  const ownLine = lines.find((line) => line.includes(`"id":"${entryId}"`));
  if (ownLine) return ownLine;
  return lines.find((line) =>
    line.includes('"entry_kind":"change-log"') &&
    line.includes(postMovePath)
  ) || null;
}

test("9 meta-state entries have been repointed to mastra/ paths", () => {
  const content = readFileSync(META_STATE_PATH, "utf8");
  const lines = content.split("\n").filter(Boolean);
  const unrepointed = [];
  for (const { id: entryId, postMovePath } of REPOINTED_ENTRIES) {
    const proofLine = findRepointingProof(lines, entryId, postMovePath);
    assert.ok(proofLine, `entry ${entryId} not found in meta-state.jsonl (no change-log with the post-move path either)`);
    const hasPreMovePath =
      proofLine.includes("tools/learning-loop-mastra/server.js") ||
      proofLine.includes("tools/learning-loop-mastra/create-loop-tool.js") ||
      proofLine.includes("tools/learning-loop-mastra/create-loop-workflow.js") ||
      proofLine.includes("tools/learning-loop-mastra/handler-adapter.js") ||
      proofLine.includes("tools/learning-loop-mastra/schema-parity.js") ||
      proofLine.includes("tools/learning-loop-mastra/schemas.js");
    if (hasPreMovePath) {
      unrepointed.push(entryId);
    }
  }
  assert.deepStrictEqual(unrepointed, [], `entries not repointed to mastra/ paths: ${unrepointed.join(", ")}`);
});

test("repointed entries reference mastra/ paths", () => {
  const content = readFileSync(META_STATE_PATH, "utf8");
  const lines = content.split("\n").filter(Boolean);
  for (const { id: entryId, postMovePath } of REPOINTED_ENTRIES) {
    const proofLine = findRepointingProof(lines, entryId, postMovePath);
    assert.ok(proofLine, `entry ${entryId} not found in meta-state.jsonl (no change-log with the post-move path either)`);
    assert.ok(
      proofLine.includes(postMovePath),
      `entry ${entryId} must reference post-move path ${postMovePath} after repoint`
    );
  }
});
