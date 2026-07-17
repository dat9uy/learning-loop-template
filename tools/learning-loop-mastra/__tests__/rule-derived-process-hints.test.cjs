/**
 * Phase 3 (plans/260717-1826-unify-context-injection): rule-derived process hints.
 * The 8 hand-mirrored PROCESS_HINTS rows move onto agent-checklist rule entries
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
      pattern: JSON.stringify({ items: [{ id: "x", description: "y" }] }),
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
      pattern: JSON.stringify({ items: [{ id: "x", description: "y" }] }),
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
      pattern: JSON.stringify({ items: [{ id: "x", description: "y" }] }),
      description: "Short hint_text must fail validation.",
      status: "active",
      promoted_at: "2026-01-01T00:00:00.000Z",
      promoted_by: "operator",
      hint_text: "too short",
    });
    assert.strictEqual(result.success, false, "hint_text under 20 chars must fail");
  });

  test("every active agent-checklist rule in the live registry carries hint_text (Phase 3 invariant)", () => {
    // Read the actual project registry to verify the backfill landed.
    const rules = metaState.readRegistry(PROJECT_ROOT).filter(
      (e) => e.entry_kind === "rule" && e.pattern_type === "agent-checklist" && e.status === "active",
    );
    assert.ok(rules.length > 0, "registry must have at least one active agent-checklist rule");
    const missing = rules.filter((r) => typeof r.hint_text !== "string" || r.hint_text.length < 20);
    assert.deepStrictEqual(missing, [], `every active agent-checklist rule must carry hint_text >= 20 chars; missing: ${missing.map((r) => r.id).join(", ")}`);
  });

  test("every rule-derived registry entry has a matching active rule with hint_text (no orphans)", () => {
    const rules = metaState.readRegistry(PROJECT_ROOT).filter(
      (e) => e.entry_kind === "rule" && e.status === "active",
    );
    const ruleIds = new Set(rules.map((r) => r.id));
    const ruleHints = new Map(rules.map((r) => [r.id, r.hint_text]));

    for (const entry of registry.HINT_REGISTRY.filter((e) => e.derived_from_rule)) {
      assert.ok(ruleIds.has(entry.derived_from_rule),
        `registry entry ${entry.slug} references rule ${entry.derived_from_rule} but rule is missing or inactive`);
      const hintText = ruleHints.get(entry.derived_from_rule);
      assert.ok(typeof hintText === "string" && hintText.length >= 20,
        `rule ${entry.derived_from_rule} (referenced by ${entry.slug}) must carry hint_text >= 20 chars`);
    }
  });

  test("byte-identity: registry + rulesById projection equals pre-Phase-3 PROCESS_HINTS order/content", () => {
    // Build the rulesById from the live registry.
    const rules = metaState.readRegistry(PROJECT_ROOT).filter(
      (e) => e.entry_kind === "rule" && e.status === "active",
    );
    const rulesById = new Map(rules.map((r) => [r.id, r]));

    // Render the sidecar channel to get a discoverability + process array.
    const { partitions } = renderer.renderHints({
      channel: "sidecar",
      charBudget: 999999,
      rulesById,
    });
    const payload = JSON.parse(partitions[0]);

    // The 10 process hints, in registry order, must match the pre-Phase-3
    // PROCESS_HINTS const in core/loop-introspect.js. The const is preserved
    // through Phase 3 (Phase 4 removes it); cross-check via introspection.
    const { buildProcessHints } = require(resolve(PROJECT_ROOT, "tools/learning-loop-mastra/core/loop-introspect.js"));
    const legacyProcess = buildProcessHints();
    assert.strictEqual(payload.process_hints.length, legacyProcess.length,
      `process hint count must match legacy PROCESS_HINTS (${legacyProcess.length}); got ${payload.process_hints.length}`);
    for (let i = 0; i < legacyProcess.length; i++) {
      assert.strictEqual(payload.process_hints[i], legacyProcess[i],
        `process hint index ${i} must match legacy PROCESS_HINTS byte-for-byte`);
    }
  });

  test("projection skips rule-derived entries whose rule is missing", () => {
    // Empty rulesById: rule-derived entries skip with warnings; standalone
    // entries still render.
    const { partitions, provenance, warnings } = renderer.renderHints({
      channel: "sidecar",
      charBudget: 999999,
      rulesById: new Map(),
    });
    const payload = JSON.parse(partitions[0]);
    // 16 discoverability (all standalone) + 2 process (pnpm-test-discipline +
    // file-edit-drift-and-fingerprints) = 18.
    assert.strictEqual(payload.discoverability_hints.length, 16);
    assert.strictEqual(payload.process_hints.length, 2, "rule-derived rows skip without rulesById");
    assert.ok(warnings.length > 0, "warnings must surface for skipped rule-derived entries");
    assert.ok(warnings.some((w) => w.includes("rule-derived") && w.includes("skipped")),
      `warnings must mention the skip reason; got: ${JSON.stringify(warnings)}`);
  });

  test("registry order preserved (8 rule-derived process rows stay at positions 2-10 in registry order)", () => {
    const processEntries = registry.HINT_REGISTRY.filter((e) => e.kind === "process");
    const standalone = processEntries.filter((e) => !e.derived_from_rule);
    const derived = processEntries.filter((e) => e.derived_from_rule);
    assert.strictEqual(standalone.length, 2, "exactly 2 standalone process rows");
    assert.strictEqual(derived.length, 8, "exactly 8 rule-derived process rows");
    // Standalone rows must be at registry positions 0 (pnpm-test-discipline) and 8 (file-edit-drift).
    assert.strictEqual(processEntries[0].slug, "pnpm-test-discipline");
    assert.strictEqual(processEntries[0].derived_from_rule, null);
    assert.strictEqual(processEntries[8].slug, "file-edit-drift-and-fingerprints");
    assert.strictEqual(processEntries[8].derived_from_rule, null);
  });
});
