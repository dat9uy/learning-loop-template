// cli-context-savings.test.js — wires the CLI transport's context-savings
// dogfood invariant to a measured, regression-guarded test.
//
// Phase 1 (TDD): pure computation — parses the manifest, resolves wire bytes
// for every CLI_TOOLS member (dynamic import + z.toJSONSchema parity view,
// mirroring mastra/create-loop-tool.js:24-63), and aggregates dropped vs
// banner bytes. Phase 3 adds the byte-accuracy and floor guards in a
// dedicated describe block at the bottom of this same file (one owner for
// the invariant).
//
// Why wire bytes (not manifest stubs): manifest entries carry only
// {file, export, pathFields}, so stub bytes miss the description + inputSchema
// that MCP clients actually see on tools/list. The parity view at
// mastra/create-loop-tool.js:24-63 collapses z.preprocess wrappers and
// guarded-boolean unions so the model-visible schema matches the pre-migration
// shape. Counting stub bytes (~85 B × 30 ≈ 2.5 KB) instead of wire bytes
// (~31.8 KB measured) would silently understate the win.

import { describe, test, expect } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import { CLI_TOOLS } from "../core/cli-tools.js";
import { resolveToolImportUrl } from "../core/manifest-loader.js";
import { normalizeInputSchema } from "../core/schema-normalize.js";
import { buildParitySchema } from "../mastra/schema-parity.js";
import {
  parseManifestJsonc,
  resolveWireBytesForCliTools,
  computeCliContextSavings,
  pickPriorCtxSavingsRow,
  computeSavingsDelta,
} from "../core/cli-context-savings.js";
import { BANNER_BYTES_BUDGET } from "./banner-budget.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(__dirname, "..");
const MANIFEST_PATH = join(PKG_ROOT, "tools", "manifest.json");

function readLiveManifest() {
  const text = readFileSync(MANIFEST_PATH, "utf8");
  return { text, manifest: parseManifestJsonc(text) };
}

describe("parseManifestJsonc", () => {
  test("strips full-line // comments and parses JSON", () => {
    const text = [
      "// header comment",
      "[",
      "  { \"file\": \"tools/a-tool.js\", \"export\": \"aTool\", \"pathFields\": [] },",
      "  // mid comment",
      "  { \"file\": \"tools/b-tool.js\", \"export\": \"bTool\", \"pathFields\": [] }",
      "]",
    ].join("\n");
    const parsed = parseManifestJsonc(text);
    assert.strictEqual(parsed.length, 2);
    assert.strictEqual(parsed[0].file, "tools/a-tool.js");
    assert.strictEqual(parsed[1].export, "bTool");
  });

  test("preserves inline content (does not strip inline // comments)", () => {
    // The shim only strips FULL-LINE // comments (see mastra/server.js:34).
    // An entry whose line starts with whitespace + // would be stripped, but
    // an inline comment mid-line would not exist in this manifest format —
    // the test documents the boundary instead of asserting the failure.
    const text = "// only full-line comments\n[ ]";
    const parsed = parseManifestJsonc(text);
    assert.deepStrictEqual(parsed, []);
  });

  test("live manifest loads with the rule in the header", () => {
    const { text, manifest } = readLiveManifest();
    assert.ok(text.includes("// tools/manifest.json"), "manifest header comment must remain visible to parseManifestJsonc; if it gets dropped, real loading breaks");
    assert.ok(manifest.length > 0, "live manifest must contain at least one entry");
    for (const entry of manifest) {
      assert.ok(typeof entry.file === "string", `entry missing file: ${JSON.stringify(entry)}`);
      assert.ok(typeof entry.export === "string", `entry missing export: ${JSON.stringify(entry)}`);
    }
  });
});

describe("resolveWireBytesForCliTools", () => {
  test("returns one row per CLI_TOOLS member that the manifest exports", async () => {
    const { manifest } = readLiveManifest();
    const rows = await resolveWireBytesForCliTools(manifest, CLI_TOOLS);
    assert.ok(rows.length > 0, "live manifest + CLI_TOOLS should produce at least one wire-bytes row");
    // Every CLI_TOOLS member represented in the manifest yields a row;
    // CLI_TOOLS members whose export is missing (or whose handler module
    // throws on import) are omitted + logged — the function is
    // best-effort by manifest entry, not by CLI_TOOLS membership.
    for (const row of rows) {
      assert.ok(CLI_TOOLS.has(row.name), `non-CLI tool leaked into rows: ${row.name}`);
      assert.ok(row.bytes > 0, `tool ${row.name} must contribute positive bytes`);
      assert.ok(typeof row.bytes === "number", "bytes must be a number");
    }
  });

  test("non-CLI_TOOLS manifest entries are excluded", async () => {
    const { manifest } = readLiveManifest();
    const rows = await resolveWireBytesForCliTools(manifest, new Set());
    assert.deepStrictEqual(rows, [], "empty CLI_TOOLS → empty rows");
  });

  test("wire def equals JSON.stringify(name, description, inputSchema parity)", async () => {
    const { text, manifest } = readLiveManifest();
    void text;
    const { z } = await import("zod");
    const { buildParitySchema } = await import("../mastra/schema-parity.js");

    // Resolve a small set (one entry) and re-derive the wire bytes by hand
    // to assert the formula. Take the first CLI_TOOLS member the manifest
    // exports.
    const probeEntry = manifest.find((entry) => {
      const exportName = entry.export;
      return CLI_TOOLS.size > 0 && typeof exportName === "string";
    });
    assert.ok(probeEntry, "manifest must contain at least one entry");
    const probeMod = await import(resolveToolImportUrl(probeEntry.file));
    const probeLegacy = probeMod[probeEntry.export];
    assert.ok(probeLegacy?.name, `${probeEntry.export} must export a legacy with a name`);

    const rows = await resolveWireBytesForCliTools([probeEntry], new Set([probeLegacy.name]));
    assert.strictEqual(rows.length, 1);
    const row = rows[0];
    assert.strictEqual(row.name, probeLegacy.name);

    const paritySchema = buildParitySchema(normalizeInputSchema(probeLegacy.schema));
    const parityJson = z.toJSONSchema(paritySchema, { target: "draft-7", io: "input" });
    const expected = JSON.stringify({
      name: probeLegacy.name,
      description: probeLegacy.description,
      inputSchema: parityJson,
    });
    assert.strictEqual(
      row.bytes,
      Buffer.byteLength(expected, "utf8"),
      `wire bytes for ${row.name} must equal JSON.stringify(name, description, inputSchema parity) byte length`,
    );
  });
});

describe("computeCliContextSavings (pure)", () => {
  test("returns the delta aggregate given hand-crafted wire bytes", () => {
    const result = computeCliContextSavings({
      wireBytes: [
        { name: "alpha", bytes: 1000 },
        { name: "beta", bytes: 500 },
      ],
      bannerBytes: { readsOnly: 300, recordsViaCli: 750 },
    });
    assert.strictEqual(result.dropped_def_bytes, 1500);
    assert.strictEqual(result.per_tool.length, 2);
    assert.strictEqual(result.per_tool[0].name, "alpha", "per_tool must be sorted desc by bytes");
    assert.strictEqual(result.banner_bytes, 750, "banner_bytes = max(readsOnly, recordsViaCli)");
    assert.strictEqual(result.savings_bytes, 750);
    assert.strictEqual(result.savings_pct, 50);
    assert.strictEqual(result.cli_tool_count, 2);
    assert.strictEqual(result.cli_tool_count, result.per_tool.length, "cli_tool_count tracks counted rows, not an external set");
  });

  test("empty wire bytes → savings_bytes negative, savings_pct 0 (no NaN/÷0)", () => {
    const result = computeCliContextSavings({
      wireBytes: [],
      bannerBytes: { readsOnly: 100, recordsViaCli: 200 },
    });
    assert.strictEqual(result.dropped_def_bytes, 0);
    assert.deepStrictEqual(result.per_tool, []);
    assert.strictEqual(result.banner_bytes, 200);
    assert.strictEqual(result.savings_bytes, -200, "banner alone → savings negative");
    assert.strictEqual(result.savings_pct, 0, "empty dropped → pct must be 0, never NaN");
    assert.strictEqual(result.cli_tool_count, 0);
  });

  test("savings_pct uses 1-decimal rounding on a hand-computed fixture", () => {
    // dropped = 31800, banner = 1908 → savings = 29892 → pct = 29892 / 31800 * 100 = 94.0
    const result = computeCliContextSavings({
      wireBytes: [{ name: "all", bytes: 31800 }],
      bannerBytes: { readsOnly: 1908, recordsViaCli: 1908 },
    });
    assert.strictEqual(result.savings_bytes, 29892);
    assert.strictEqual(result.savings_pct, 94.0);
  });
});

describe("real-manifest integration: wire-byte formula reproduces surface bytes", () => {
  // The plan anchors Phase 1's success criterion to reproducing the
  // finding's measured magnitude against the live manifest. The original
  // hand-measurement was 31.8 KB (finding meta-260722T1546Z...); since then
  // CLI_TOOLS has grown (workflows re-homed, portable six added) and the
  // empirical wire-byte total against the current manifest is ~47.6 KB
  // across 40 tools. This test pins the wire-byte formula's behavior to a
  // reasonable magnitude band rather than an exact point — what matters
  // here is that the formula counts JSON-stringify parity bytes (the
  // MCP-model-visible bytes), NOT manifest stub bytes (~2.5 KB) which
  // would indicate the parity view silently fell back. The savings_pct
  // floor in Phase 3 is the real regression guard for banner bloat /
  // tool reclassification drift.
  test("dropped_def_bytes is in the wire-byte band (rejects manifest-stub regression)", async () => {
    const { manifest } = readLiveManifest();
    const rows = await resolveWireBytesForCliTools(manifest, CLI_TOOLS);
    assert.strictEqual(
      rows.length,
      CLI_TOOLS.size,
      `every CLI_TOOLS member must yield a row; got ${rows.length}/${CLI_TOOLS.size}`,
    );
    const dropped = rows.reduce((sum, r) => sum + r.bytes, 0);
    // Lower bound = manifest-stub floor (~2.5 KB): anything smaller means
    // the parity view silently fell back to manifest entries without
    // description + inputSchema. Upper bound = generous headroom over
    // the empirical ~47.6 KB so normal schema growth (zod additions,
    // new workflow handlers) does not flake the test.
    const MIN_DROPPED = 5_000;
    const MAX_DROPPED = 200_000;
    assert.ok(
      dropped >= MIN_DROPPED && dropped <= MAX_DROPPED,
      `dropped_def_bytes ${dropped} must stay in the wire-byte band (${MIN_DROPPED}-${MAX_DROPPED}); ` +
        `smaller means the parity view fell back to manifest stubs, larger means a tool schema exploded`,
    );
  });

  test("savings_bytes + savings_pct reflect banner budget (floor pre-check)", async () => {
    const { manifest } = readLiveManifest();
    const rows = await resolveWireBytesForCliTools(manifest, CLI_TOOLS);
    const bannerBytes = Math.max(BANNER_BYTES_BUDGET, 200);
    const result = computeCliContextSavings({
      wireBytes: rows,
      bannerBytes: { readsOnly: bannerBytes, recordsViaCli: bannerBytes },
    });
    assert.strictEqual(result.cli_tool_count, rows.length, "cli_tool_count tracks counted rows, not an external set");
    assert.ok(result.savings_bytes > 0, `savings must be positive; got ${result.savings_bytes}`);
    const pct = result.savings_pct;
    assert.ok(pct > 0 && pct < 100, `savings_pct must be in (0,100); got ${pct}`);
  });
});

// =============================================================================
// Phase 3 regression guards — applied to the live manifest. Catches:
//   1. Byte-accuracy: a handler whose schema changed silently without a
//      corresponding drift test failure (the bucket-membership invariant is
//      already owned by cli-write-tool-set-drift.test.js, do not duplicate).
//   2. Savings floor: dropped bytes erode below half the observed win —
//      catches banner re-bloat or mass tool reclassification that shrinks
//      the savings. Failure message directs: shrink the banner (see the
//      banner budget test) or reclassify with a documented reason in the
//      drift test.
// =============================================================================

const SAVINGS_PCT_FLOOR = 50; // half of the observed ~94% win (plan Phase 3 §Architecture)

describe("Regression guards", () => {
  test("byte-accuracy: every CLI_TOOLS member's reported bytes match the wire-def formula", async () => {
    // Re-derive the expected byte count by hand for every CLI_TOOLS
    // member. If `resolveWireBytesForCliTools` ever drifts away from
    // JSON.stringify(name, description, parity inputSchema) the byte
    // counts will diverge and this test fails. This is the byte-accuracy
    // axis that cli-write-tool-set-drift.test.js does NOT cover (it only
    // enforces CLI_TOOLS union / MCP_RESIDUE disjoint membership, not
    // wire-byte fidelity).
    const { manifest } = readLiveManifest();
    const rows = await resolveWireBytesForCliTools(manifest, CLI_TOOLS);
    assert.strictEqual(rows.length, CLI_TOOLS.size);

    for (const row of rows) {
      // Resolve the legacy handler directly for the byte-accuracy check.
      let matched;
      for (const entry of manifest) {
        if (!entry?.export || !entry?.file) continue;
        try {
          const mod = await import(resolveToolImportUrl(entry.file));
          const legacy = mod[entry.export];
          if (legacy?.name === row.name) {
            matched = legacy;
            break;
          }
        } catch {
          continue;
        }
      }
      assert.ok(matched, `could not re-resolve handler for ${row.name} during byte-accuracy check`);
      const normalized = normalizeInputSchema(matched.schema);
      const parityJson = z.toJSONSchema(buildParitySchema(normalized), { target: "draft-7", io: "input" });
      const wire = JSON.stringify({
        name: matched.name,
        description: matched.description,
        inputSchema: parityJson,
      });
      const expected = Buffer.byteLength(wire, "utf8");
      assert.strictEqual(
        row.bytes,
        expected,
        `${row.name}: reported ${row.bytes} bytes ≠ recomputed ${expected} bytes — wire-def formula drifted`,
      );
    }
  });

  test("savings_pct floor: real-manifest delta stays ≥ SAVINGS_PCT_FLOOR against the banner budget", async () => {
    // Real-manifest savings, not just a unit test. Anchored on the
    // shared BANNER_BYTES_BUDGET so a banner that re-bloats trips this
    // guard. Failure message is operator-actionable: shrink the banner
    // (banner-budget test) or reclassify with a reason in the drift test.
    const { manifest } = readLiveManifest();
    const rows = await resolveWireBytesForCliTools(manifest, CLI_TOOLS);
    const result = computeCliContextSavings({
      wireBytes: rows,
      bannerBytes: { readsOnly: BANNER_BYTES_BUDGET, recordsViaCli: BANNER_BYTES_BUDGET },
    });
    assert.ok(
      result.savings_pct >= SAVINGS_PCT_FLOOR,
      `savings_pct ${result.savings_pct}% fell below the ${SAVINGS_PCT_FLOOR}% floor — banner re-bloated or tools reclassified. ` +
        `Action: shrink the banner (banner-budget test) or document the reclassification in cli-write-tool-set-drift.test.js (MCP_RESIDUE).`,
    );
  });
});

describe("computeCliContextSavings: bannerBytes number branch", () => {
  // The script always passes an object {readsOnly, recordsViaCli}; the number
  // branch is a defensive fallback for callers that have a single banner
  // measurement. Pin it so it is not dead, untested code.
  test("a bare number bannerBytes is used directly as banner_bytes", () => {
    const result = computeCliContextSavings({
      wireBytes: [{ name: "alpha", bytes: 1000 }],
      bannerBytes: 250,
    });
    assert.strictEqual(result.banner_bytes, 250, "number bannerBytes is used as-is");
    assert.strictEqual(result.savings_bytes, 750);
    assert.strictEqual(result.savings_pct, 75);
    assert.strictEqual(result.cli_tool_count, 1);
  });
});

describe("pickPriorCtxSavingsRow", () => {
  test("filters to ctx-savings- ids and returns the most recent by timestamp", () => {
    const rows = [
      { id: "delivery-abc-1", timestamp: "2026-07-27T02:00:00.000Z", value: 1 },
      { id: "ctx-savings-2026-07-27T01-00-00-000Z-100", timestamp: "2026-07-27T01:00:00.000Z", value: 40000 },
      { id: "ctx-savings-2026-07-27T01-19-20-500Z-200", timestamp: "2026-07-27T01:19:20.500Z", value: 44664 },
      { id: "ctx-savings-2026-07-27T00-30-00-000Z-300", timestamp: "2026-07-27T00:30:00.000Z", value: 38000 },
    ];
    const prior = pickPriorCtxSavingsRow(rows);
    assert.strictEqual(prior?.id, "ctx-savings-2026-07-27T01-19-20-500Z-200");
    assert.strictEqual(prior?.value, 44664);
  });

  test("non-array input → null (no throw)", () => {
    assert.strictEqual(pickPriorCtxSavingsRow(undefined), null);
    assert.strictEqual(pickPriorCtxSavingsRow(null), null);
  });

  test("no ctx-savings rows → null", () => {
    const rows = [
      { id: "delivery-abc-1", timestamp: "2026-07-27T02:00:00.000Z", value: 1 },
      { id: "vnstock", timestamp: "2026-07-24T06:10:54.250Z", value: null },
    ];
    assert.strictEqual(pickPriorCtxSavingsRow(rows), null);
  });

  test("missing timestamp sorts as empty string (does not throw on malformed rows)", () => {
    const rows = [
      { id: "ctx-savings-b", value: 10 },
      { id: "ctx-savings-a", timestamp: "2026-07-27T01:00:00.000Z", value: 20 },
    ];
    const prior = pickPriorCtxSavingsRow(rows);
    // The row with a real timestamp sorts after the empty-timestamp row (DESC).
    assert.strictEqual(prior?.id, "ctx-savings-a");
  });
});

describe("computeSavingsDelta", () => {
  test("current minus prior value", () => {
    assert.strictEqual(computeSavingsDelta(44664, { value: 40000 }), 4664);
  });

  test("first run (no prior row) → null", () => {
    assert.strictEqual(computeSavingsDelta(44664, null), null);
  });

  test("prior row with non-numeric value → null", () => {
    assert.strictEqual(computeSavingsDelta(44664, { value: null }), null);
    assert.strictEqual(computeSavingsDelta(44664, { value: NaN }), null);
    assert.strictEqual(computeSavingsDelta(44664, { value: "n/a" }), null);
    assert.strictEqual(computeSavingsDelta(44664, {}), null);
  });

  test("negative delta when savings shrank (regression signal)", () => {
    assert.strictEqual(computeSavingsDelta(30000, { value: 44664 }), -14664);
  });
});
