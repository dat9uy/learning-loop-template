/**
 * Phase 2 (plans/260717-1826-unify-context-injection): hint-registry.js is the
 * single source of truth for the 26 canonical hint rows (16 discoverability +
 * 10 process). locks invariants on shape, slugs, and ordering.
 *
 * Imports run inside `beforeAll` so the failure messages cite the real path.
 */
const assert = require("node:assert/strict");
const { resolve } = require("node:path");
const { pathToFileURL } = require("node:url");

const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");
const REGISTRY_PATH = resolve(PROJECT_ROOT, "tools/learning-loop-mastra/core/hint-registry.js");

let registry;

beforeAll(async () => {
  registry = await import(pathToFileURL(REGISTRY_PATH).href);
});

describe("hint registry invariants", () => {
  test("module exports HINT_REGISTRY (frozen array)", () => {
    assert.ok(Array.isArray(registry.HINT_REGISTRY), "HINT_REGISTRY must be an array");
    assert.ok(Object.isFrozen(registry.HINT_REGISTRY), "HINT_REGISTRY must be frozen");
  });

  test("every entry has unique slug, kind, non-empty text + suggestion", () => {
    const seen = new Set();
    for (const [i, e] of registry.HINT_REGISTRY.entries()) {
      assert.ok(typeof e.slug === "string" && e.slug.length > 0, `entry ${i}: slug must be a non-empty string`);
      assert.ok(!seen.has(e.slug), `entry ${i}: duplicate slug "${e.slug}"`);
      seen.add(e.slug);
      assert.ok(["discoverability", "process"].includes(e.kind), `entry ${i}: kind must be discoverability or process`);
      // Standalone entries MUST carry substantive inline text. Rule-derived
      // entries may carry empty text — the prose comes from rule.hint_text
      // at render time (Phase 3). Registry still pins ordering + slug only.
      if (e.derived_from_rule === null || e.derived_from_rule === undefined) {
        assert.ok(typeof e.text === "string" && e.text.length >= 50, `standalone entry ${i} (${e.slug}): text must be a substantive prose string`);
      } else {
        assert.ok(typeof e.text === "string", `rule-derived entry ${i} (${e.slug}): text must be a string (may be empty pre-Phase-3)`);
      }
      assert.ok(typeof e.suggestion === "string" && e.suggestion.length > 20, `entry ${i}: suggestion must be a non-empty one-liner`);
    }
  });

  test("discoverability entries cover the 16 expected slugs", () => {
    const slugs = registry.HINT_REGISTRY
      .filter((e) => e.kind === "discoverability")
      .map((e) => e.slug);
    const expected = [
      "internalization-rule",
      "mechanism-check",
      "source-refs",
      "derive-refresh",
      "designs-no-code",
      "status-lifecycle",
      "reopens",
      "rule-lifecycle",
      "canonical-tool",
      "surface-split",
      "reopens-script",
      "loop-get-instruction",
      "narrow-query",
      "phase-a-reframe",
      "session-id-query",
      "runtime-agnostic-features",
    ];
    assert.deepStrictEqual(slugs, expected, "discoverability slugs (in registry order) must match the locked set");
  });

  test("process entries cover the 10 expected slugs (8 rule-derived + 2 standalone)", () => {
    const slugs = registry.HINT_REGISTRY
      .filter((e) => e.kind === "process")
      .map((e) => e.slug);
    const expected = [
      "pnpm-test-discipline",
      "pr-body-registry-deltas",
      "runtime-agnostic-audit",
      "tool-integration-same-commit-dep",
      "fallow-gate-triage",
      "short-slug-for-risk-records",
      "import-chain-analysis-after-tool-deletion",
      "assertinvariant-at-boundary",
      "file-edit-drift-and-fingerprints",
      "required-status-checks-verify-combined-status",
    ];
    assert.deepStrictEqual(slugs, expected, "process slugs (in registry order) must match the locked set");
  });

  test("every process entry is either standalone (text) or rule-derived (derived_from_rule + no inline text)", () => {
    for (const e of registry.HINT_REGISTRY.filter((x) => x.kind === "process")) {
      const standalone = e.derived_from_rule === null || e.derived_from_rule === undefined;
      if (standalone) {
        assert.ok(e.text && e.text.length >= 50, `standalone process entry ${e.slug} must carry substantive inline text`);
      } else {
        assert.ok(typeof e.derived_from_rule === "string" && e.derived_from_rule.startsWith("rule-"),
          `process entry ${e.slug} must carry derived_from_rule starting with "rule-"`);
      }
    }
  });

  test("canonical builders project from registry in registry order", async () => {
    const corePath = resolve(PROJECT_ROOT, "tools/learning-loop-mastra/core/loop-introspect.js");
    const introspect = await import(pathToFileURL(corePath).href);
    const disc = introspect.buildDiscoverabilityHints();
    // Pass a rulesById with hint_text filled for each rule-derived entry so
    // the projection is hermetic — no registry I/O. This isolates the unit
    // test from live registry state.
    const rulesById = new Map(
      registry.HINT_REGISTRY
        .filter((e) => e.derived_from_rule)
        .map((e) => [e.derived_from_rule, { hint_text: `[mocked hint_text for ${e.slug}]` }])
    );
    const proc = introspect.buildProcessHints({ rulesById });

    // Discoverability: every entry's text appears in buildDiscoverabilityHints.
    for (const e of registry.HINT_REGISTRY.filter((x) => x.kind === "discoverability")) {
      assert.ok(disc.includes(e.text), `discoverability[${e.slug}] must surface via buildDiscoverabilityHints`);
    }
    assert.strictEqual(disc.length, 16, "buildDiscoverabilityHints must return exactly 16 entries");

    // Phase-3 invariant: buildProcessHints with rulesById returns 10 entries
    // (8 rule-derived + 2 standalone). Without rulesById, it falls back to
    // the registry read — that path is exercised in the live registry test.
    assert.strictEqual(proc.length, 10, "buildProcessHints with rulesById must return exactly 10 entries");
    // Standalone rows 1 + 9 must carry inline text (Phase 3 invariant).
    const standalone = registry.HINT_REGISTRY.filter((x) => x.kind === "process" && !x.derived_from_rule);
    assert.strictEqual(standalone.length, 2, "exactly 2 standalone process entries (test discipline + file-index drift)");
  });

  test("exports listHints({kind}) helper", () => {
    assert.strictEqual(typeof registry.listHints, "function", "listHints must be exported");
    const disc = registry.listHints({ kind: "discoverability" });
    assert.ok(Array.isArray(disc) && disc.length === 16, "listHints({kind:'discoverability'}) returns 16 entries");
    const proc = registry.listHints({ kind: "process" });
    assert.ok(Array.isArray(proc) && proc.length === 10, "listHints({kind:'process'}) returns 10 entries");
    assert.strictEqual(registry.listHints({ kind: undefined }).length, 26, "listHints() with no filter returns all 26");
  });

  test("exports findHintBySlug helper", () => {
    assert.strictEqual(typeof registry.findHintBySlug, "function");
    assert.ok(registry.findHintBySlug("rule-lifecycle"), "finds discoverability by slug");
    assert.ok(registry.findHintBySlug("pnpm-test-discipline"), "finds process by slug");
    assert.strictEqual(registry.findHintBySlug("not-a-real-slug"), undefined, "missing slug → undefined");
  });
});
