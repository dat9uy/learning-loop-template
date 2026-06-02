import { describe, test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { resolveRoot } from "#lib/resolve-root.js";
import { join } from "node:path";

describe("SP0 self-modification change-log entry", () => {
  test("meta-state.jsonl contains a change-log entry matching the SP0 self-log shape", () => {
    const root = resolveRoot();
    const raw = readFileSync(join(root, "meta-state.jsonl"), "utf8");
    const lines = raw.split("\n").filter((l) => l.trim() !== "");
    const entries = lines.map((l) => JSON.parse(l));

    const sp0Entry = entries.find(
      (e) =>
        e.entry_kind === "change-log" &&
        e.change_dimension === "surface" &&
        e.change_target === "tools/learning-loop-mcp/tools/meta-state-log-change-tool.js" &&
        Array.isArray(e.change_diff?.added) &&
        e.change_diff.added.includes("meta_state_log_change")
    );

    assert.ok(sp0Entry, "Expected a change-log entry for the SP0 self-modification affordance");
    assert.strictEqual(sp0Entry.status, "active");
    assert.ok(sp0Entry.reason.length >= 20);
  });
});
