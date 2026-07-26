/**
 * Phase 3 (plans/260717-1826-unify-context-injection): rule-derived process hints.
 * The 9 hand-mirrored PROCESS_HINTS rows move onto agent-checklist rule entries
 * as `hint_text`, and `buildProcessHints()` projects the registry through rule
 * lookup. Locks: schema accepts hint_text, promote-tool requires it for agent-
 * checklist, projection resolves via rulesById, byte-identity preserved.
 */
const assert = require("node:assert/strict");
const { resolve } = require("node:path");
const { pathToFileURL } = require("node:url");

const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");

let registry;
let renderer;
let metaState;
let ruleSchema;

beforeAll(async () => {
  registry = await import(pathToFileURL(resolve(PROJECT_ROOT, "tools/learning-loop-mastra/core/hint-registry.js")).href);
  renderer = await import(pathToFileURL(resolve(PROJECT_ROOT, "tools/learning-loop-mastra/core/hint-renderer.js")).href);
  metaState = await import(pathToFileURL(resolve(PROJECT_ROOT, "tools/learning-loop-mastra/core/meta-state.js")).href);
  ruleSchema = metaState.metaStateRuleEntrySchema;
});

describe("rule-derived process hints (Phase 3)", () => {
  test("metaStateRuleEntrySchema accepts hint_text (optional)", () => {
    const ok = ruleSchema.safeParse({
      id: "rule-test-hint-text-ok",
      origin: "meta-test",
      enforcement: "agent",
      pattern_type: "agent-checklist",
      pattern: JSON.stringify({ version: 1, items: [{ id: "x", description: "y" }] }),
      description: "Test rule with hint_text — must validate the new field.",
      status: "active",
      promoted_at: "2026-01-01T00:00:00.000Z",
      promoted_by: "operator",
      hint_text: "This is the long-form hint prose for SessionStart injection (min 20 chars).",
    });
    assert.strictEqual(ok.success, true, `hint_text must validate: ${ok.error?.message}`);

    const withoutHint = ruleSchema.safeParse({
      id: "rule-test-hint-text-missing",
      origin: "meta-test",
      enforcement: "agent",
      pattern_type: "agent-checklist",
      pattern: JSON.stringify({ version: 1, items: [{ id: "x", description: "y" }] }),
      description: "Test rule without hint_text — must still validate (optional).",
      status: "active",
      promoted_at: "2026-01-01T00:00:00.000Z",
      promoted_by: "operator",
    });
    assert.strictEqual(withoutHint.success, true, "hint_text is optional on rule schema");
  });

  test("rule schema rejects hint_text < 20 chars", () => {
    const result = ruleSchema.safeParse({
      id: "rule-test-short-hint",
      origin: "meta-test",
      enforcement: "agent",
      pattern_type: "agent-checklist",
      pattern: JSON.stringify({ version: 1, items: [{ id: "x", description: "y" }] }),
      description: "Short hint_text must fail validation.",
      status: "active",
      promoted_at: "2026-01-01T00:00:00.000Z",
      promoted_by: "operator",
      hint_text: "too short",
    });
    assert.strictEqual(result.success, false, "hint_text under 20 chars must fail");
  });

  // Plan 260726-0029 phase 1: hint_order / hint_suggestion / hint_slug
  // round-trip through the rule schema.
  test("rule schema accepts hint_order, hint_suggestion, hint_slug (Phase 1 fields)", () => {
    const result = ruleSchema.safeParse({
      id: "rule-test-hint-meta-ok",
      origin: "meta-test",
      enforcement: "agent",
      pattern_type: "agent-checklist",
      pattern: JSON.stringify({ version: 1, items: [{ id: "x", description: "y" }] }),
      description: "Test rule with hint metadata — must validate the new fields.",
      status: "active",
      promoted_at: "2026-01-01T00:00:00.000Z",
      promoted_by: "operator",
      hint_text: "A sufficiently long process hint for the agent-checklist rule.",
      hint_order: 42,
      hint_suggestion: "Curated one-line pointer text (between 20 and 200 chars, single line).",
      hint_slug: "custom-hint-slug",
    });
    assert.strictEqual(result.success, true, `Phase 1 fields must validate: ${result.error?.message}`);
  });

  test("rule schema rejects hint_suggestion with newline (single-line invariant)", () => {
    const result = ruleSchema.safeParse({
      id: "rule-test-suggestion-newline",
      origin: "meta-test",
      enforcement: "agent",
      pattern_type: "agent-checklist",
      pattern: JSON.stringify({ version: 1, items: [{ id: "x", description: "y" }] }),
      description: "Multi-line hint_suggestion must fail validation.",
      status: "active",
      promoted_at: "2026-01-01T00:00:00.000Z",
      promoted_by: "operator",
      hint_text: "A sufficiently long process hint for the agent-checklist rule.",
      hint_suggestion: "First line\nsecond line would manufacture fake pointer rows",
    });
    assert.strictEqual(result.success, false, "hint_suggestion with newline must fail");
  });

  test("rule schema rejects hint_suggestion over 200 chars (cap)", () => {
    const result = ruleSchema.safeParse({
      id: "rule-test-suggestion-oversize",
      origin: "meta-test",
      enforcement: "agent",
      pattern_type: "agent-checklist",
      pattern: JSON.stringify({ version: 1, items: [{ id: "x", description: "y" }] }),
      description: "Oversize hint_suggestion must fail validation.",
      status: "active",
      promoted_at: "2026-01-01T00:00:00.000Z",
      promoted_by: "operator",
      hint_text: "A sufficiently long process hint for the agent-checklist rule.",
      hint_suggestion: "x".repeat(201),
    });
    assert.strictEqual(result.success, false, "hint_suggestion over 200 chars must fail");
  });

  test("rule schema rejects hint_slug with invalid characters", () => {
    const result = ruleSchema.safeParse({
      id: "rule-test-bad-slug",
      origin: "meta-test",
      enforcement: "agent",
      pattern_type: "agent-checklist",
      pattern: JSON.stringify({ version: 1, items: [{ id: "x", description: "y" }] }),
      description: "Invalid hint_slug must fail validation.",
      status: "active",
      promoted_at: "2026-01-01T00:00:00.000Z",
      promoted_by: "operator",
      hint_text: "A sufficiently long process hint for the agent-checklist rule.",
      hint_suggestion: "Curated one-line pointer text (between 20 and 200 chars, single line).",
      hint_slug: "Has_CAPS_and_underscore",
    });
    assert.strictEqual(result.success, false, "hint_slug with non-kebab-case must fail");
  });

  test("rule schema still accepts non-agent-checklist rules without any hint metadata (additive)", () => {
    const result = ruleSchema.safeParse({
      id: "rule-test-gate-no-hint",
      origin: "meta-test",
      enforcement: "gate",
      pattern_type: "regex",
      pattern: "x",
      description: "Gate-enforced rule without any hint metadata must still validate.",
      status: "active",
      promoted_at: "2026-01-01T00:00:00.000Z",
      promoted_by: "operator",
    });
    assert.strictEqual(result.success, true, "additive change: no hint fields required on gate rules");
  });

  test("every active agent-checklist rule in the live registry carries hint_text (Phase 3 invariant)", () => {
    // Read the actual project registry to verify the backfill landed.
    const rules = metaState.readRegistry(PROJECT_ROOT).filter(
      (e) => e.entry_kind === "rule" && e.pattern_type === "agent-checklist" && e.status === "active",
    );
    assert.ok(rules.length > 0, "registry must have at least one active agent-checklist rule");
    const missing = rules.filter((r) => typeof r.hint_text !== "string" || r.hint_text.length < 20);
    assert.deepStrictEqual(missing, [], `every active agent-checklist rule must carry hint_text >= 20 chars; missing: ${missing.map((r) => r.id).join(", ")}`);
    // Plan 260726-0029 phase 1: every active agent-checklist rule also carries
    // hint_suggestion (the buildProcessView in hint-registry.js reads it
    // unconditionally for the process partition).
    const missingSuggestion = rules.filter(
      (r) => typeof r.hint_suggestion !== "string" || r.hint_suggestion.length < 20 || r.hint_suggestion.length > 200 || /[\n\r]/.test(r.hint_suggestion),
    );
    assert.deepStrictEqual(missingSuggestion, [], `every active agent-checklist rule must carry a single-line hint_suggestion (20-200 chars); missing: ${missingSuggestion.map((r) => r.id).join(", ")}`);
  });

  test("every active agent-checklist rule appears in buildProcessView (no orphans, no mirror)", () => {
    // Plan 260726-0029 phase 2: the coverage invariant is now: every active
    // agent-checklist rule appears in buildProcessView (and has BOTH
    // hint_text AND hint_suggestion populated so resolveHintText works).
    const rules = metaState.readRegistry(PROJECT_ROOT).filter(
      (e) => e.entry_kind === "rule" && e.pattern_type === "agent-checklist" && e.status === "active",
    );
    const rulesById = new Map(rules.map((r) => [r.id, r]));
    const view = registry.buildProcessView({ rulesById });
    const viewRuleIds = new Set(view.map((e) => e.derived_from_rule).filter(Boolean));

    for (const rule of rules) {
      assert.ok(viewRuleIds.has(rule.id),
        `active agent-checklist rule ${rule.id} must appear in buildProcessView`);
      assert.ok(typeof rule.hint_text === "string" && rule.hint_text.length >= 20,
        `rule ${rule.id} must carry hint_text >= 20 chars (close the silent-drop gap)`);
      assert.ok(typeof rule.hint_suggestion === "string" && rule.hint_suggestion.length >= 20,
        `rule ${rule.id} must carry hint_suggestion >= 20 chars (close the silent-drop gap)`);
    }
  });

  test("renderer ≡ builder consistency: sidecar channel with rulesById equals buildProcessHints()", () => {
    // Code-review I3 (plans/260717-1826): this test previously claimed
    // "byte-identity vs the pre-Phase-3 PROCESS_HINTS const" but never
    // referenced that const — it compared two projections of the same live
    // registry (circular). The const is now deleted. What remains worth
    // locking: the renderer and the builder resolve rule-derived text
    // through ONE shared path (resolveHintText), so both projections agree
    // given the same rules.
    const rules = metaState.readRegistry(PROJECT_ROOT).filter(
      (e) => e.entry_kind === "rule" && e.status === "active",
    );
    const rulesById = new Map(rules.map((r) => [r.id, r]));

    const { partitions } = renderer.renderHints({
      channel: "sidecar",
      charBudget: 999999,
      rulesById,
    });
    const payload = JSON.parse(partitions[0]);

    const { buildProcessHints } = require(resolve(PROJECT_ROOT, "tools/learning-loop-mastra/core/loop-introspect.js"));
    const builderProcess = buildProcessHints({ rulesById });
    assert.strictEqual(payload.process_hints.length, builderProcess.length,
      `renderer process hint count must match builder (${builderProcess.length}); got ${payload.process_hints.length}`);
    for (let i = 0; i < builderProcess.length; i++) {
      assert.strictEqual(payload.process_hints[i], builderProcess[i],
        `process hint index ${i}: renderer and builder must agree byte-for-byte`);
    }
  });

  test("resolveHintText preserves standalone and rule-derived sentinel semantics", () => {
    assert.strictEqual(
      registry.resolveHintText({ text: "standalone", derived_from_rule: null }),
      "standalone",
    );
    assert.strictEqual(
      registry.resolveHintText({ text: "standalone", derived_from_rule: undefined }),
      "standalone",
    );

    const derived = { text: "", derived_from_rule: "rule-test" };
    assert.strictEqual(
      registry.resolveHintText(derived, new Map([["rule-test", { hint_text: "derived text" }]])),
      "derived text",
    );
    assert.strictEqual(registry.resolveHintText(derived, new Map()), null);
    assert.strictEqual(registry.resolveHintText(derived, new Map([["rule-test", {}]])), null);
    assert.strictEqual(registry.resolveHintText(derived), null);
  });

  test("projection skips rule-derived entries whose rule is missing", () => {
    // Empty rulesById: buildProcessView has no rules to derive from, so the
    // process partition contains only the 2 standalone rows. No warnings —
    // the view simply omits unrenderable rows (cleaner degradation than
    // pre-Phase-2 skip+warn).
    const { partitions, warnings } = renderer.renderHints({
      channel: "sidecar",
      charBudget: 999999,
      rulesById: new Map(),
    });
    const payload = JSON.parse(partitions[0]);
    // 16 discoverability (all standalone) + 2 process (pnpm-test-discipline +
    // file-edit-drift-and-fingerprints) = 18.
    assert.strictEqual(payload.discoverability_hints.length, 16);
    assert.strictEqual(payload.process_hints.length, 2, "no rule-derived rows when rulesById is empty");
    assert.deepStrictEqual(warnings, [], "no warnings in degraded mode");
  });

  test("registry order preserved (2 standalone rows + 9 rule-derived rows in buildProcessView)", () => {
    // Plan 260726-0029 phase 2: 9 rule-derived rows are no longer in
    // HINT_REGISTRY. The 11-row order is now locked in buildProcessView.
    const processEntries = registry.HINT_REGISTRY.filter((e) => e.kind === "process");
    const standalone = processEntries.filter((e) => !e.derived_from_rule);
    assert.strictEqual(standalone.length, 2, "exactly 2 standalone process rows in registry");
    // First standalone must be pnpm-test-discipline (order: 10).
    assert.strictEqual(processEntries[0].slug, "pnpm-test-discipline");
    assert.strictEqual(processEntries[0].derived_from_rule, null);
    // Second standalone must be file-edit-drift-and-fingerprints (order: 90).
    assert.strictEqual(processEntries[1].slug, "file-edit-drift-and-fingerprints");
    assert.strictEqual(processEntries[1].derived_from_rule, null);

    // View invariant: buildProcessView produces the full view (2 + 9 rows)
    // in the locked order. The exact count is derived from the live
    // registry + the 2 standalone rows.
    const rules = metaState.readRegistry(PROJECT_ROOT).filter(
      (e) => e.entry_kind === "rule" && e.pattern_type === "agent-checklist" && e.status === "active",
    );
    const rulesById = new Map(rules.map((r) => [r.id, r]));
    const view = registry.buildProcessView({ rulesById });
    const expectedViewLen = registry.HINT_REGISTRY.filter((e) => e.kind === "process").length + rulesById.size;
    assert.strictEqual(view.length, expectedViewLen, `buildProcessView produces ${expectedViewLen} rows (2 standalones + ${rulesById.size} derived)`);
    assert.strictEqual(view[0].slug, "pnpm-test-discipline");
    assert.strictEqual(view[8].slug, "file-edit-drift-and-fingerprints");
  });
});
