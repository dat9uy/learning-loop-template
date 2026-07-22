/**
 * Phase 2 (plans/260717-1826-unify-context-injection): hint-renderer.js is the
 * budget-aware channel-based projection layer. Locks invariants on greedy
 * partitioning, byte-identity across runtimes, channel coverage.
 */
const assert = require("node:assert/strict");
const { resolve } = require("node:path");
const { pathToFileURL } = require("node:url");

const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");
const RENDERER_PATH = resolve(PROJECT_ROOT, "tools/learning-loop-mastra/core/hint-renderer.js");

let renderer;
let registry;
let metaState;

beforeAll(async () => {
  renderer = await import(pathToFileURL(RENDERER_PATH).href);
  registry = await import(pathToFileURL(resolve(PROJECT_ROOT, "tools/learning-loop-mastra/core/hint-registry.js")).href);
  metaState = await import(pathToFileURL(resolve(PROJECT_ROOT, "tools/learning-loop-mastra/core/meta-state.js")).href);
});

const STD_CHAR_BUDGET = 9500;

/**
 * Real rules from the live registry — the production resolution source.
 * Code-review I8 (plans/260717-1826): earlier revisions of this file mocked
 * rulesById (or omitted it), so the "renders all hints" tests passed with
 * 9 of 27 hints absent. Tests that assert full coverage MUST use this map.
 */
function realRulesById() {
  return new Map(
    metaState.readRegistry(PROJECT_ROOT)
      .filter((e) => e.entry_kind === "rule" && e.status === "active")
      .map((r) => [r.id, r]),
  );
}

/** First-80-chars marker for the text a registry entry renders with the given rules. */
function renderedMarker(entry, rulesById) {
  const text = entry.derived_from_rule
    ? rulesById.get(entry.derived_from_rule)?.hint_text ?? ""
    : entry.text;
  return text.slice(0, 80);
}

describe("hint renderer", () => {
  test("exports renderHints()", () => {
    assert.strictEqual(typeof renderer.renderHints, "function");
  });

  test("claude-session-start channel with real rules: 2 partitions, each under budget, all 27 hints", () => {
    const rulesById = realRulesById();
    const { partitions, provenance, warnings } = renderer.renderHints({
      channel: "claude-session-start",
      charBudget: STD_CHAR_BUDGET,
      rulesById,
    });
    assert.ok(Array.isArray(partitions), "partitions must be array");
    // Current content sizes render as exactly 2 partitions (disc ≈ 5.0k,
    // proc ≈ 7.8k at review time). The durable invariant is the per-partition
    // budget below; the count locks the current shape so silent growth past
    // the budget is a visible test change, not a silent harness truncation.
    assert.strictEqual(partitions.length, 2, "claude-session-start must emit exactly 2 partitions at current content sizes");
    for (const [i, p] of partitions.entries()) {
      assert.ok([...p].length <= STD_CHAR_BUDGET,
        `partition ${i} length ${[...p].length} must stay under ${STD_CHAR_BUDGET}`);
    }
    assert.ok(partitions[0].includes("meta_state_report"), "partition 0 contains discoverability content");
    assert.ok(partitions[1].includes("pnpm test"), "partition 1 contains process content");
    // Rule-derived content must be present (not silently skipped).
    assert.ok(partitions[1].includes("mergeStateStatus"),
      "partition 1 must carry rule-derived hint_text (required-status-checks row)");
    assert.deepStrictEqual(warnings, [], "no skips expected with the live registry");
    assert.strictEqual(provenance.length, 27, "provenance covers all 27 hints");
    for (const p of provenance) {
      assert.ok(typeof p.slug === "string");
      assert.ok(["discoverability", "process"].includes(p.kind));
      assert.ok(typeof p.source === "string");
    }
  });

  test("claude-session-start without rulesById: rule-derived rows skip with warnings (degraded mode)", () => {
    const { partitions, provenance, warnings } = renderer.renderHints({
      channel: "claude-session-start",
      charBudget: STD_CHAR_BUDGET,
    });
    // 9 rule-derived entries skip → 18 rendered (16 disc + 2 standalone process).
    assert.strictEqual(provenance.length, 18, "degraded render covers standalone hints only");
    assert.strictEqual(warnings.length, 9, "one warning per skipped rule-derived entry");
    assert.ok(warnings.every((w) => w.includes("skipped")), "warnings name the skip");
    assert.ok(partitions[1].includes("pnpm test"), "standalone process rows still render");
  });

  test("factory-session-start channel renders one block carrying every hint", () => {
    const rulesById = realRulesById();
    const { partitions, warnings } = renderer.renderHints({
      channel: "factory-session-start",
      charBudget: 999999,
      rulesById,
    });
    assert.strictEqual(partitions.length, 1, "factory channel emits a single partition");
    const text = partitions[0];
    // Every registry entry's rendered text (standalone inline text or the
    // rule's hint_text) must appear — a real per-hint coverage assertion,
    // replacing the previous loop that asserted the same length check 5 times.
    for (const e of registry.HINT_REGISTRY) {
      const marker = renderedMarker(e, rulesById);
      assert.ok(marker.length > 0, `no rendered text for ${e.slug}`);
      assert.ok(text.includes(marker), `factory block must carry hint ${e.slug}`);
    }
    assert.deepStrictEqual(warnings, [], "no skips expected with the live registry");
  });

  test("sidecar channel preserves session-context.json shape", () => {
    // Mock rulesById with hint_text for each rule-derived entry so the renderer
    // can resolve them. Without this, Phase-3-derived entries would skip +
    // warn (their inline text is empty pre-Phase-3).
    const rulesById = new Map(
      registry.HINT_REGISTRY
        .filter((e) => e.derived_from_rule)
        .map((e) => [e.derived_from_rule, { hint_text: `[mocked hint_text for ${e.slug}]` }])
    );

    const { partitions } = renderer.renderHints({
      channel: "sidecar",
      charBudget: 999999,
      rulesById,
    });
    assert.strictEqual(partitions.length, 1, "sidecar channel emits a single partition");
    const parsed = JSON.parse(partitions[0]);
    // Shape parity with session-start-inject-discoverability.cjs#buildContextPayload.
    for (const key of [
      "discoverability_hints",
      "discoverability_hints_source",
      "process_hints",
      "process_hints_source",
    ]) {
      assert.ok(key in parsed, `sidecar payload must include ${key}`);
    }
    assert.ok(Array.isArray(parsed.discoverability_hints) && parsed.discoverability_hints.length === 16);
    assert.ok(Array.isArray(parsed.process_hints) && parsed.process_hints.length === 11,
      `process_hints must include 11 entries (resolved via rulesById); got ${parsed.process_hints.length}`);
    assert.strictEqual(parsed.discoverability_hints_source, "core");
    assert.strictEqual(parsed.process_hints_source, "core");
  });

  test("mcp-warm channel emits structured array (no cap)", () => {
    const rulesById = new Map(
      registry.HINT_REGISTRY
        .filter((e) => e.derived_from_rule)
        .map((e) => [e.derived_from_rule, { hint_text: `[mocked hint_text for ${e.slug}]` }])
    );
    const { partitions } = renderer.renderHints({
      channel: "mcp-warm",
      charBudget: 999999,
      rulesById,
    });
    assert.strictEqual(partitions.length, 1, "mcp-warm emits a single partition");
    const arr = JSON.parse(partitions[0]);
    assert.ok(Array.isArray(arr) && arr.length === 27, "mcp-warm channel returns 27-hint structured array");
  });

  test("greedy partitioning: no hint is split across partitions", () => {
    const rulesById = new Map(
      registry.HINT_REGISTRY
        .filter((e) => e.derived_from_rule)
        .map((e) => [e.derived_from_rule, { hint_text: `[mocked hint_text for ${e.slug}]` }])
    );
    const { partitions } = renderer.renderHints({
      channel: "claude-session-start",
      charBudget: 4000, // tighter than 10k to stress the splitter
      rulesById,
    });
    // Every rendered hint must appear IN ONE partition (not split).
    // Pre-Phase-3 rule-derived rows have empty inline text; with rulesById
    // supplied we still test the 16 discoverability + 2 standalone process rows.
    for (const e of registry.HINT_REGISTRY) {
      const substring = (e.text || `[mocked hint_text for ${e.slug}]`).slice(0, 80);
      const found = partitions.filter((p) => p.includes(substring));
      assert.strictEqual(found.length, 1, `hint ${e.slug} must appear in exactly 1 partition (got ${found.length})`);
    }
  });

  test("forced-degrade loader produces a marker string, not throw", () => {
    // The registry is hard-coded; the renderer must not throw even when
    // slicing registry text — defensive coverage.
    const result = renderer.renderHints({
      channel: "claude-session-start",
      charBudget: STD_CHAR_BUDGET,
    });
    assert.ok(result && result.partitions);
  });

  test("unknown channel returns an empty result, not throw", () => {
    const { partitions, provenance } = renderer.renderHints({
      channel: "no-such-channel",
      charBudget: STD_CHAR_BUDGET,
    });
    assert.ok(Array.isArray(partitions));
    assert.ok(Array.isArray(provenance));
  });

  test("provenance lists every hint's slug + kind + source per rendered hint", () => {
    const rulesById = new Map(
      registry.HINT_REGISTRY
        .filter((e) => e.derived_from_rule)
        .map((e) => [e.derived_from_rule, { hint_text: `[mocked hint_text for ${e.slug}]` }])
    );
    const { provenance } = renderer.renderHints({
      channel: "claude-session-start",
      charBudget: STD_CHAR_BUDGET,
      rulesById,
    });
    // 16 discoverability + 11 process = 27 source rows
    assert.strictEqual(provenance.length, 27, "provenance must include one row per hint");
    const slugs = new Set(provenance.map((p) => p.slug));
    assert.strictEqual(slugs.size, 27, "provenance slug count must equal registry size");
  });

  test("byte-identity: claude-session-start partition 0 ≠ factory-session-start body shape, but both carry same hints", () => {
    const rulesById = realRulesById();
    const claude = renderer.renderHints({ channel: "claude-session-start", charBudget: STD_CHAR_BUDGET, rulesById });
    const factory = renderer.renderHints({ channel: "factory-session-start", charBudget: 999999, rulesById });
    // Different partitioning: claude is 2 partitions, factory is 1.
    assert.notStrictEqual(claude.partitions.length, factory.partitions.length);
    // Concatenation parity: EVERY hint (all 27) appears in both renders.
    const claudeJoined = claude.partitions.join("\n");
    const factoryJoined = factory.partitions.join("\n");
    for (const e of registry.HINT_REGISTRY) {
      const marker = renderedMarker(e, rulesById);
      assert.ok(claudeJoined.includes(marker),
        `claude concatenation must carry hint ${e.slug}`);
      assert.ok(factoryJoined.includes(marker),
        `factory concatenation must carry hint ${e.slug}`);
    }
  });

  test("oversized single hint gets its own over-budget partition plus a warning (I6)", () => {
    // A single hint larger than charBudget must never be dropped or split —
    // it is emitted as its own partition and the breach is surfaced.
    const rulesById = realRulesById();
    const { partitions, warnings } = renderer.renderHints({
      channel: "claude-session-start",
      charBudget: 200, // far below the smallest hint line
      rulesById,
    });
    assert.ok(
      warnings.some((w) => w.includes("exceeds charBudget")),
      `oversize breach must be warned; got: ${JSON.stringify(warnings.slice(0, 3))}`,
    );
    // No hint content is lost: every hint still appears in some partition.
    const joined = partitions.join("\n");
    for (const e of registry.HINT_REGISTRY) {
      assert.ok(joined.includes(renderedMarker(e, rulesById)),
        `hint ${e.slug} must survive oversize partitioning`);
    }
  });
});
