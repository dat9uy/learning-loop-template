import { describe, test } from "node:test";
import assert from "node:assert";
import { metaStateListTool } from "../tools/meta-state-list-tool.js";
import { loopDescribeTool } from "../tools/loop-describe-tool.js";
import { resolveRoot } from "#lib/resolve-root.js";

const root = resolveRoot();

describe("meta_state_list compact mode", () => {
  test("compact: true on full registry returns <30KB (vs 130KB full)", async () => {
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
    // Full registry compact should be << full registry (130KB). After I1 unification
    // with `summarize`, compact adds ~250 bytes/entry (more relationship fields like
    // `category`, `title`, `enforcement`, `pattern_type`) but drops `description_preview`.
    // Threshold: < 30KB (still ~4.5x smaller than full). Plan's original "~4-12KB" was
    // a pre-unification estimate; the unified shape is the correct design per I1.
    assert.ok(
      payloadBytes < 30000,
      `Compact payload should be <30KB (vs 130KB full), got ${payloadBytes}`
    );

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
      if (entry.evidence_code_ref) {
        assert.ok(
          typeof entry.evidence_code_ref === "string",
          "compact entry evidence_code_ref must be a string when present"
        );
      }
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

  test("I1: toCompact and summarize return consistent shapes", async () => {
    // I1 regression guard: meta_state_list({ compact: true }) and
    // loop_describe({ tier: 'cold', description_mode: 'summary' }) must
    // return the same field set for the same entry id (modulo
    // description_preview, which only summarize emits). A drift between
    // the two would force every downstream consumer to special-case
    // which shape they're getting.
    const listResult = await metaStateListTool.handler({
      compact: true,
      include_expired: true,
    });
    const describeResult = await loopDescribeTool.handler({
      tier: "cold",
      description_mode: "summary",
    });
    const listText = JSON.parse(listResult.content[0].text);
    const describeText = JSON.parse(describeResult.content[0].text);

    // Build maps by id
    const compactById = new Map(listText.entries.map((e) => [e.id, e]));
    const summaryById = new Map(describeText.all_findings.map((e) => [e.id, e]));

    // Find a finding that exists in both (active_findings is the cold tier's
    // active subset; all_findings includes terminal ones)
    let commonId = null;
    for (const id of compactById.keys()) {
      if (summaryById.has(id) && compactById.get(id).entry_kind === "finding") {
        commonId = id;
        break;
      }
    }
    assert.ok(commonId, "Need at least one finding that appears in both compact and summary");

    const compactEntry = compactById.get(commonId);
    const summaryEntry = summaryById.get(commonId);

    // The two shapes should agree on the same relationship + metadata
    // fields. `summarize` emits `description_preview`; `toCompact` does not.
    const compactKeys = new Set(Object.keys(compactEntry));
    const summaryKeys = new Set(Object.keys(summaryEntry));
    summaryKeys.delete("description_preview");

    // Every field in compactEntry (except description_preview which
    // toCompact never emits) should be in summaryEntry.
    for (const key of compactKeys) {
      assert.ok(
        summaryKeys.has(key),
        `I1 drift: field '${key}' is in toCompact(${commonId}) but not summarize(${commonId})`
      );
    }
    // Conversely, every field in summaryEntry (except description_preview)
    // should be in compactEntry.
    for (const key of summaryKeys) {
      assert.ok(
        compactKeys.has(key),
        `I1 drift: field '${key}' is in summarize(${commonId}) but not toCompact(${commonId})`
      );
    }
  });
});
