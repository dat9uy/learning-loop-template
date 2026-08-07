/**
 * Phase 2 (plans/260717-1826-unify-context-injection): hint-registry.js is the
 * single source of truth for the 27 canonical hint rows (16 discoverability +
 * 11 process). locks invariants on shape, slugs, and ordering.
 *
 * Imports run inside `beforeAll` so the failure messages cite the real path.
 */
const assert = require("node:assert/strict");
const { resolve } = require("node:path");
const { pathToFileURL } = require("node:url");
const { mockAgentChecklistRulesById } = require("./helpers/agent-checklist-rules.cjs");

const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");
const REGISTRY_PATH = resolve(PROJECT_ROOT, "tools/learning-loop-mastra/core/hint-registry.js");

let registry;
let metaState;

beforeAll(async () => {
  registry = await import(pathToFileURL(REGISTRY_PATH).href);
  metaState = await import(pathToFileURL(resolve(PROJECT_ROOT, "tools/learning-loop-mastra/core/meta-state.js")).href);
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

  test("process entries cover the 12 expected slugs (10 rule-derived + 2 standalone) via buildProcessView", () => {
    // The rule-derived rows are no longer hand-mirrored in HINT_REGISTRY; the
    // locked 12-slug set lives in the view (merged standalones + active
    // agent-checklist rules). This hardcoded list is the deliberate drift
    // signal — a promotion/deactivation must update it consciously.
    const rules = metaState.readRegistry(PROJECT_ROOT).filter(
      (e) => e.entry_kind === "rule" && e.status === "active",
    );
    const rulesById = new Map(rules.map((r) => [r.id, r]));
    const slugs = registry.buildProcessView({ rulesById }).map((e) => e.slug);
    const expected = [
      "pnpm-test-discipline",
      "pr-body-registry-deltas",
      "flake-claim-verification",
      "runtime-agnostic-audit",
      "tool-integration-same-commit-dep",
      "fallow-gate-triage",
      "short-slug-for-risk-records",
      "import-chain-analysis-after-tool-deletion",
      "assertinvariant-at-boundary",
      "file-edit-drift-and-fingerprints",
      "required-status-checks-verify-combined-status",
      "no-plan-ids-in-stable-code-artifacts",
      "defer-needs-filing",
    ];
    assert.deepStrictEqual(slugs, expected, "process view slugs (in view order) must match the locked set");
  });

  test("HINT_REGISTRY process partition holds exactly 2 standalone rows (hand-mirror removed)", () => {
    const proc = registry.HINT_REGISTRY.filter((e) => e.kind === "process");
    assert.strictEqual(proc.length, 2, "HINT_REGISTRY holds 2 standalone process rows (mirror rows deleted)");
    for (const e of proc) {
      assert.ok(e.derived_from_rule === null, `standalone process entry ${e.slug} must have derived_from_rule === null`);
      assert.ok(e.text && e.text.length >= 50, `standalone process entry ${e.slug} must carry substantive inline text`);
    }
  });

  test("buildProcessView skips a slug collision and reports it via the warnings channel", () => {
    // A rule whose derived slug equals a standalone slug (or another rule's
    // slug) must never last-wins overwrite — it is skipped, and the skip is
    // surfaced. The promote/patch tools reject this at write time; this
    // covers pre-guard data.
    const colliding = new Map([
      ["rule-collides-standalone", { id: "rule-collides-standalone", pattern_type: "agent-checklist", hint_slug: "pnpm-test-discipline", hint_text: "[mocked hint_text for colliding rule]", hint_suggestion: "[mocked suggestion for colliding rule]" }],
      ["rule-pr-body-registry-deltas", { id: "rule-pr-body-registry-deltas", pattern_type: "agent-checklist", hint_text: "[mocked hint_text for pr-body-registry-deltas]", hint_suggestion: "[mocked suggestion for pr-body-registry-deltas]" }],
    ]);
    const warnings = [];
    const view = registry.buildProcessView({ rulesById: colliding, warnings });
    assert.ok(!view.some((e) => e.derived_from_rule === "rule-collides-standalone"),
      "colliding rule must be skipped, not overwrite the standalone row");
    const standalone = view.find((e) => e.slug === "pnpm-test-discipline");
    assert.strictEqual(standalone.derived_from_rule, null, "standalone row keeps its identity");
    assert.strictEqual(warnings.length, 1, "exactly one collision warning");
    assert.ok(warnings[0].includes("pnpm-test-discipline"), "warning names the colliding slug");
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
    const metaPath = resolve(PROJECT_ROOT, "tools/learning-loop-mastra/core/meta-state.js");
    const metaState = await import(pathToFileURL(metaPath).href);
    const disc = introspect.buildDiscoverabilityHints();
    // Pass a hermetic rulesById (shared fixture: real rule ids + hint_slug
    // overrides + hint_text/hint_suggestion) so the projection needs no
    // registry I/O and stays isolated from live registry state.
    const rulesById = mockAgentChecklistRulesById();
    const proc = introspect.buildProcessHints({ rulesById });

    // Discoverability: every entry's text appears in buildDiscoverabilityHints.
    for (const e of registry.HINT_REGISTRY.filter((x) => x.kind === "discoverability")) {
      assert.ok(disc.includes(e.text), `discoverability[${e.slug}] must surface via buildDiscoverabilityHints`);
    }
    assert.strictEqual(disc.length, 16, "buildDiscoverabilityHints must return exactly 16 entries");

    // buildProcessHints with rulesById returns the full view (rule-derived +
    // standalone). Without rulesById, the view degrades to the standalone
    // rows (no derived entries to render).
    const expectedViewLen = registry.buildProcessView({ rulesById }).length;
    assert.strictEqual(proc.length, expectedViewLen, `buildProcessHints with rulesById must return the full view (${expectedViewLen} entries)`);
    // Standalone rows in HINT_REGISTRY = 2 (test discipline + file-index drift).
    const standalone = registry.HINT_REGISTRY.filter((x) => x.kind === "process" && !x.derived_from_rule);
    assert.strictEqual(standalone.length, 2, "exactly 2 standalone process entries (test discipline + file-index drift)");
  });

  test("exports listHints({kind}) helper", () => {
    assert.strictEqual(typeof registry.listHints, "function", "listHints must be exported");
    const disc = registry.listHints({ kind: "discoverability" });
    assert.ok(Array.isArray(disc) && disc.length === 16, "listHints({kind:'discoverability'}) returns 16 entries");
    const proc = registry.listHints({ kind: "process" });
    assert.ok(Array.isArray(proc) && proc.length === 2, "listHints({kind:'process'}) returns 2 standalone rows (derived live in buildProcessView)");
    assert.strictEqual(registry.listHints({ kind: undefined }).length, 18, "listHints() with no filter returns all 18 (16 disc + 2 standalone process)");
  });

  test("exports findHintBySlug helper", () => {
    assert.strictEqual(typeof registry.findHintBySlug, "function");
    assert.ok(registry.findHintBySlug("rule-lifecycle"), "finds discoverability by slug");
    assert.ok(registry.findHintBySlug("pnpm-test-discipline"), "finds process by slug");
    assert.strictEqual(registry.findHintBySlug("not-a-real-slug"), undefined, "missing slug → undefined");
  });
});
