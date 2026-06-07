import { describe, test } from "node:test";
import assert from "node:assert";
import { metaStateListTool } from "../tools/meta-state-list-tool.js";
import { resolveRoot } from "#lib/resolve-root.js";

const root = resolveRoot();

describe("meta_state_list compact mode", () => {
  test("compact: true on full registry returns ~4KB (was ~85KB)", async () => {
    const result = await metaStateListTool.handler({
      compact: true,
      include_expired: true,
    });
    const text = JSON.parse(result.content[0].text);
    assert.ok(text.count > 0, "Should have entries");
    assert.strictEqual(text.compact, true);

    const payloadBytes = Buffer.byteLength(
      JSON.stringify(text.entries),
      "utf8"
    );
    // Full registry compact should be ~4-12KB (plan says 53 entries × ~80 bytes; actual is ~110 bytes/entry)
    assert.ok(payloadBytes < 15000, `Compact payload should be <15KB, got ${payloadBytes}`);

    // Verify all entries have only compact fields
    for (const entry of text.entries) {
      assert.ok(entry.id, "compact entry must have id");
      assert.ok(entry.entry_kind, "compact entry must have entry_kind");
      assert.ok(entry.status, "compact entry must have status");
      assert.strictEqual(
        entry.description,
        undefined,
        "compact entry must NOT have description"
      );
      assert.strictEqual(
        entry.evidence,
        undefined,
        "compact entry must NOT have evidence"
      );
      assert.strictEqual(
        entry.evidence_code_ref,
        undefined,
        "compact entry must NOT have evidence_code_ref"
      );
    }
  });

  test("compact: true default excludes terminal entries", async () => {
    const result = await metaStateListTool.handler({
      compact: true,
    });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.include_expired, false);

    const terminalStatuses = new Set(["auto-resolved", "expired", "resolved"]);
    const hasTerminal = text.entries.some((e) => terminalStatuses.has(e.status));
    assert.strictEqual(
      hasTerminal,
      false,
      "compact default should not include terminal entries"
    );
  });

  test("compact: false returns full entries with descriptions", async () => {
    const result = await metaStateListTool.handler({
      compact: false,
      include_expired: true,
    });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.compact, false);

    const fullEntries = text.entries.filter((e) => e.description);
    assert.ok(
      fullEntries.length > 0,
      "Non-compact mode should include entries with descriptions"
    );
  });

  test("compact entry preserves ref fields", async () => {
    const result = await metaStateListTool.handler({
      compact: true,
      include_expired: true,
    });
    const text = JSON.parse(result.content[0].text);

    // Find entries with ref fields
    const withRefs = text.entries.filter(
      (e) =>
        e.origin ||
        e.addresses ||
        e.consolidated_into ||
        e.supersedes ||
        e.promoted_to_rule ||
        e.proposed_design_for
    );
    assert.ok(
      withRefs.length > 0,
      "Some entries should have ref fields in compact mode"
    );
  });
});
