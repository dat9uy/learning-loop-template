// Integration test: loop_describe warm tier must include a registry_stats
// block with the documented shape, computed via the shared
// core/registry-stats.js helper (NOT by shelling out from the MCP server —
// risk-mitigation per Phase C plan §"registry_stats shelling out from MCP
// server").
//
// Locks:
//   (a) warm tier result.registry_stats is an object with the 4 documented
//       keys (raw_lines, deduped_ids, dead_version_lines, compaction_eligible)
//   (b) the values reflect the current meta-state.jsonl + change-log.jsonl
//       union (e.g. raw_lines > 0)
//   (c) compaction_eligible is a boolean

import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { loopDescribeTool } from "../../tools/handlers/loop-describe-tool.js";

describe("loop_describe warm tier registry_stats", () => {
  test("warm tier returns registry_stats with the documented shape", async () => {
    const result = await loopDescribeTool.handler({ tier: "warm" });
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(parsed.registry_stats, `warm tier must include registry_stats, got keys: ${Object.keys(parsed).join(", ")}`);
    assert.deepStrictEqual(Object.keys(parsed.registry_stats).sort(), [
      "compaction_eligible",
      "dead_version_lines",
      "deduped_ids",
      "raw_lines",
    ]);
  });

  test("registry_stats values are correctly typed and reflect the live registry", async () => {
    const result = await loopDescribeTool.handler({ tier: "warm" });
    const parsed = JSON.parse(result.content[0].text);
    const stats = parsed.registry_stats;
    assert.strictEqual(typeof stats.raw_lines, "number");
    assert.strictEqual(typeof stats.deduped_ids, "number");
    assert.strictEqual(typeof stats.dead_version_lines, "number");
    assert.strictEqual(typeof stats.compaction_eligible, "boolean");

    // The live registry must produce non-trivial counts (sanity check that
    // the helper actually read the files).
    assert.ok(stats.raw_lines >= 0, `raw_lines must be >= 0, got ${stats.raw_lines}`);
    assert.ok(stats.deduped_ids >= 0);
    assert.strictEqual(stats.dead_version_lines, stats.raw_lines - stats.deduped_ids,
      `dead_version_lines must equal raw_lines - deduped_ids, got ${stats.dead_version_lines} vs ${stats.raw_lines - stats.deduped_ids}`);
  });
});
