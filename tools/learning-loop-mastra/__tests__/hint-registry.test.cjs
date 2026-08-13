/**
 * Phase 2 (plans/260717-1826-unify-context-injection): hint-registry.js is the
 * single source of truth for the canonical hint rows (17 discoverability +
 * process). locks invariants on shape, slugs, and ordering.
 *
 * Imports run inside `beforeAll` so the failure messages cite the real path.
 */
const assert = require("node:assert/strict");
const { resolve } = require("node:path");
const { pathToFileURL } = require("node:url");
const { mockAgentChecklistRulesById } = require("./helpers/agent-checklist-rules.cjs");
const { LEGACY_HINT_FIXTURE } = require("./fixtures/legacy-hint-content.cjs");

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

  test("legacy Hint content remains byte-for-byte stable", () => {
    const actual = registry.HINT_REGISTRY
      .map(({ slug, kind, tier, order, text, suggestion }) => ({
        slug,
        kind,
        tier,
        ...(order === undefined ? {} : { order }),
        text,
        suggestion,
      }));
    assert.deepStrictEqual(actual, LEGACY_HINT_FIXTURE,
      "legacy Hint identity/content/order must match the independently maintained fixture");
  });

  test("discoverability entries cover the 17 expected slugs", () => {
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
      "gate-verb-allowance",
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

    // Discoverability, unfiltered: every entry's text appears in
    // buildDiscoverabilityHints (cold tier / inspection see the full registry).
    for (const e of registry.HINT_REGISTRY.filter((x) => x.kind === "discoverability")) {
      assert.ok(disc.includes(e.text), `discoverability[${e.slug}] must surface via buildDiscoverabilityHints`);
    }
    assert.strictEqual(disc.length, 17, "buildDiscoverabilityHints (no tier) must return all 17 entries");

    // Startup-tier view: exactly the startup entries' texts are auto-injected;
    // on-demand rows are excluded but must still resolve individually via
    // findHintBySlug + resolveHintText (the loop_get_instruction path).
    const startupView = introspect.buildDiscoverabilityHints({ tier: "startup" });
    const discEntries = registry.HINT_REGISTRY.filter((x) => x.kind === "discoverability");
    const startupEntries = discEntries.filter((e) => (e.tier ?? "startup") === "startup");
    assert.strictEqual(startupView.length, startupEntries.length,
      "startup-tier view must carry exactly the startup-tier entries");
    for (const e of startupEntries) {
      assert.ok(startupView.includes(e.text), `startup view must include ${e.slug}`);
    }
    for (const e of discEntries.filter((x) => x.tier === "on-demand")) {
      assert.ok(!startupView.includes(e.text), `startup view must exclude on-demand ${e.slug}`);
      const found = registry.findHintBySlug(e.slug);
      assert.strictEqual(registry.resolveHintText(found, new Map()), e.text,
        `on-demand ${e.slug} must still resolve its full text`);
    }

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
    assert.ok(Array.isArray(disc) && disc.length === 17, "listHints({kind:'discoverability'}) returns 17 entries");
    const proc = registry.listHints({ kind: "process" });
    assert.ok(Array.isArray(proc) && proc.length === 2, "listHints({kind:'process'}) returns 2 standalone rows (derived live in buildProcessView)");
    assert.strictEqual(registry.listHints({ kind: undefined }).length, 19, "listHints() with no filter returns all 19 (17 disc + 2 standalone process)");
  });

  test("exports findHintBySlug helper", () => {
    assert.strictEqual(typeof registry.findHintBySlug, "function");
    assert.ok(registry.findHintBySlug("rule-lifecycle"), "finds discoverability by slug");
    assert.ok(registry.findHintBySlug("pnpm-test-discipline"), "finds process by slug");
    assert.strictEqual(registry.findHintBySlug("not-a-real-slug"), undefined, "missing slug → undefined");
  });
});

describe("hint registry injection-policy tier", () => {
  test("gate-verb-allowance is the 17th discoverability row (index 16), tier on-demand", () => {
    const disc = registry.listHints({ kind: "discoverability" });
    assert.strictEqual(disc[16].slug, "gate-verb-allowance", "appended at discoverability index 16 (append-only)");
    assert.strictEqual(disc[16].tier, "on-demand");
    assert.strictEqual(disc[16].kind, "discoverability");
    assert.ok(disc[16].text.length >= 50, "text must be substantive prose");
    assert.ok(disc[16].suggestion.length > 20, "suggestion must be a one-liner");
  });

  test("the 4 startup keepers carry explicit tier:'startup'; the 12 reference rows are on-demand", () => {
    const keepers = ["canonical-tool", "surface-split", "loop-get-instruction", "phase-a-reframe"];
    const moved = [
      "internalization-rule", "mechanism-check", "source-refs", "derive-refresh",
      "designs-no-code", "status-lifecycle", "reopens", "rule-lifecycle",
      "reopens-script", "narrow-query", "session-id-query", "runtime-agnostic-features",
    ];
    for (const slug of keepers) {
      assert.strictEqual(registry.findHintBySlug(slug)?.tier, "startup",
        `${slug} must carry explicit tier:"startup" (survives any future default flip)`);
    }
    for (const slug of moved) {
      assert.strictEqual(registry.findHintBySlug(slug)?.tier, "on-demand",
        `${slug} must be on-demand (reference material fetched via loop_get_instruction)`);
    }
  });

  test("listHints tier filter: startup = the 4 keepers, on-demand = 13 reference rows", () => {
    const startup = registry.listHints({ kind: "discoverability", tier: "startup" });
    assert.deepStrictEqual(startup.map((e) => e.slug),
      ["canonical-tool", "surface-split", "loop-get-instruction", "phase-a-reframe"],
      "startup tier = the 4 keepers in registry order");
    const onDemand = registry.listHints({ kind: "discoverability", tier: "on-demand" });
    assert.deepStrictEqual(onDemand.map((e) => e.slug), [
      "internalization-rule", "mechanism-check", "source-refs", "derive-refresh",
      "designs-no-code", "status-lifecycle", "reopens", "rule-lifecycle",
      "reopens-script", "narrow-query", "session-id-query", "runtime-agnostic-features",
      "gate-verb-allowance",
    ], "on-demand tier = the 12 reference rows + gate-verb-allowance in registry order");
    assert.strictEqual(registry.listHints({ kind: "discoverability" }).length, 17,
      "unfiltered discoverability stays at 17");
  });

  test("both standalone process rows are on-demand (process startup set is empty)", () => {
    assert.deepStrictEqual(registry.listHints({ kind: "process", tier: "startup" }), [],
      "no standalone process row auto-injects at startup");
    const onDemand = registry.listHints({ kind: "process", tier: "on-demand" });
    assert.deepStrictEqual(onDemand.map((e) => e.slug),
      ["pnpm-test-discipline", "file-edit-drift-and-fingerprints"],
      "both standalone process rows moved on-demand");
  });

  test("listHints tier param defaults to undefined (no filter), never startup", () => {
    // loop_get_instruction's numeric resolution depends on the no-filter
    // default returning ALL rows; a startup default would silently shrink the
    // list and renumber the numeric indices.
    const unfiltered = registry.listHints({ kind: "discoverability" });
    const explicitUndefined = registry.listHints({ kind: "discoverability", tier: undefined });
    assert.strictEqual(unfiltered.length, explicitUndefined.length, "omitted tier === explicit undefined tier");
    assert.strictEqual(unfiltered.length, 17, "no-filter returns all 17 discoverability rows");
  });

  test("numeric indices 0-15 unchanged (append-only invariant)", () => {
    const disc = registry.listHints({ kind: "discoverability" });
    assert.strictEqual(disc[0].slug, "internalization-rule");
    assert.strictEqual(disc[10].slug, "reopens-script");
    assert.strictEqual(disc[12].slug, "narrow-query");
  });

  test("findHintBySlug + resolveHintText resolve gate-verb-allowance (unfiltered lookup)", () => {
    const entry = registry.findHintBySlug("gate-verb-allowance");
    assert.ok(entry, "slug lookup must find the on-demand row");
    const text = registry.resolveHintText(entry, new Map());
    assert.ok(typeof text === "string" && text.length >= 50, "standalone text resolves (not null)");
    assert.strictEqual(text, entry.text);
  });

  test("gate-verb-allowance text carries the full allowance incantation + constraints", () => {
    const { text } = registry.findHintBySlug("gate-verb-allowance");
    assert.ok(text.includes('gate_mark_preflight({surface:"runtime-state"})'), "preflight call");
    assert.ok(text.includes("runtime_state_record({"), "record call");
    assert.ok(text.includes("<verb>"), "verb placeholder");
    assert.ok(text.includes('affected_system:"gate-verb:<verb>"'), "affected_system shape");
    assert.ok(text.includes("id MUST equal affected_system"), "canonical-id rule");
    assert.ok(text.includes('source_ref:"local:meta-state:gate-verb-allowance"'), "sentinel source_ref");
    assert.ok(text.includes("non-resolving"), "sentinel noted as non-resolving");
    assert.ok(text.includes("30 min"), "expiry");
    assert.ok(
      text.includes("the promoted-rule denylist still applies during the allowance window"),
      "denylist constraint preserved",
    );
  });

  test("gate-verb-allowance incantation matches the gate block message (single source)", () => {
    // The hint is the static reference; the bash-gate block message is the
    // dynamic emitter. The shared substrings must appear in both so the two
    // surfaces cannot silently diverge.
    const { readFileSync } = require("node:fs");
    const gateSrc = readFileSync(
      resolve(PROJECT_ROOT, "tools/learning-loop-mastra/core/evaluate-bash-gate.js"),
      "utf8",
    );
    for (const shared of [
      'gate_mark_preflight({surface:"runtime-state"})',
      "runtime_state_record({affected_system:",
      "local:meta-state:gate-verb-allowance",
      "id MUST equal affected_system",
    ]) {
      assert.ok(gateSrc.includes(shared), `gate block message must carry: ${shared}`);
    }
  });

  test("buildHintIndex covers all registry slugs + rule-derived process slugs", () => {
    const rulesById = mockAgentChecklistRulesById();
    const index = registry.buildHintIndex({ rulesById });
    const slugs = index.map((e) => e.slug);
    // Every registry row (17 discoverability + 2 standalone process) is indexed.
    for (const e of registry.HINT_REGISTRY) {
      assert.ok(slugs.includes(e.slug), `hint_index must include registry slug ${e.slug}`);
    }
    // Rule-derived process slugs merge in so the index is the complete
    // discovery surface.
    const viewSlugs = registry.buildProcessView({ rulesById }).map((e) => e.slug);
    for (const slug of viewSlugs) {
      assert.ok(slugs.includes(slug), `hint_index must include process-view slug ${slug}`);
    }
    // Shape: every entry carries slug + suggestion; no duplicates.
    assert.strictEqual(new Set(slugs).size, slugs.length, "no duplicate slugs in hint_index");
    for (const e of index) {
      assert.ok(typeof e.slug === "string" && e.slug.length > 0, "slug present");
      assert.ok(typeof e.suggestion === "string" && e.suggestion.length > 0, `suggestion present for ${e.slug}`);
    }
  });

  test("buildHintIndex without rulesById still covers the full registry", () => {
    const index = registry.buildHintIndex();
    assert.strictEqual(index.length, 19,
      "degraded (no rules) index = all 19 registry rows (17 discoverability + 2 process), both tiers");
    assert.strictEqual(index.length, registry.HINT_REGISTRY.length,
      "degraded (no rules) index = registry rows only");
  });
});
