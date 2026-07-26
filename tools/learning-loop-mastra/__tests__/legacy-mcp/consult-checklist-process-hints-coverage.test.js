/**
 * Coverage test: every active agent-checklist rule
 * must appear in `buildProcessView` (forward direction) AND every view row
 * with `derived_from_rule` must reference an active rule (inverse direction)
 * AND all view slugs must be unique AND every active agent-checklist rule
 * must carry both `hint_text` AND `hint_suggestion` (closes the silent-drop
 * gap where a rule with neither field would still 'appear' but
 * resolveHintText drops it).
 *
 * The previous H6 ordering gate (loop-describe-tool.js:121-133) performed
 * a substring check at `loop_describe({tier: warm})` time. That gate is
 * now redundant: the promote + patch tools require both fields on
 * agent-checklist rules, and the view in hint-registry.js reads them
 * unconditionally.
 *
 * This test reads the source-of-truth state directly (the registry file +
 * the hint registry), bypassing the runtime module cache, so the invariant
 * is enforced on every test run.
 */
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "vitest";
import { loadPromotedRules } from "../../core/gate-logic.js";
import { buildProcessView } from "../../core/hint-registry.js";
import { readRegistry } from "../../core/meta-state.js";

const PROJECT_ROOT = resolve(import.meta.dirname, "..", "..", "..", "..");

test("every active agent-checklist rule appears in buildProcessView (with hint_text + hint_suggestion) and back-references resolve", () => {
  const rules = loadPromotedRules(PROJECT_ROOT);
  const consultChecklistRules = rules.filter(
    (r) => r.pattern_type === "agent-checklist",
  );

  // Sanity: the registry has at least one agent-checklist rule, otherwise
  // this test would pass vacuously and stop guarding the invariant.
  assert.ok(
    consultChecklistRules.length > 0,
    "Registry must have at least one active agent-checklist rule for this test to be meaningful.",
  );

  const rulesById = new Map(consultChecklistRules.map((r) => [r.id, r]));
  const view = buildProcessView({ rulesById });
  const viewRuleIds = new Set(view.map((e) => e.derived_from_rule).filter(Boolean));

  // Forward direction: every active agent-checklist rule appears in the view
  // AND carries BOTH hint_text AND hint_suggestion (the silent-drop gap).
  const missingFromView = consultChecklistRules.filter((r) => !viewRuleIds.has(r.id));
  assert.deepStrictEqual(missingFromView, [],
    `every active agent-checklist rule must appear in buildProcessView; missing: ${missingFromView.map((r) => r.id).join(", ")}`);

  const missingHintText = consultChecklistRules.filter(
    (r) => typeof r.hint_text !== "string" || r.hint_text.length < 20,
  );
  assert.deepStrictEqual(missingHintText, [],
    `every active agent-checklist rule must carry hint_text >= 20 chars; missing: ${missingHintText.map((r) => r.id).join(", ")}`);

  const missingHintSuggestion = consultChecklistRules.filter(
    (r) => typeof r.hint_suggestion !== "string"
      || r.hint_suggestion.length < 20
      || r.hint_suggestion.length > 200
      || /[\n\r]/.test(r.hint_suggestion),
  );
  assert.deepStrictEqual(missingHintSuggestion, [],
    `every active agent-checklist rule must carry a single-line hint_suggestion (20-200 chars); missing: ${missingHintSuggestion.map((r) => r.id).join(", ")}`);

  // Inverse direction: every view row with derived_from_rule references an
  // active rule that has BOTH hint_text AND hint_suggestion populated.
  const activeRuleIds = new Set(consultChecklistRules.map((r) => r.id));
  const ruleHints = new Map(consultChecklistRules.map((r) => [r.id, r.hint_text]));
  const ruleSuggestions = new Map(consultChecklistRules.map((r) => [r.id, r.hint_suggestion]));
  for (const entry of view) {
    if (entry.derived_from_rule == null) continue; // standalone
    assert.ok(activeRuleIds.has(entry.derived_from_rule),
      `view row ${entry.slug} references rule ${entry.derived_from_rule} but rule is missing or inactive`);
    const hintText = ruleHints.get(entry.derived_from_rule);
    assert.ok(typeof hintText === "string" && hintText.length >= 20,
      `rule ${entry.derived_from_rule} (referenced by view row ${entry.slug}) must carry hint_text >= 20 chars`);
    const suggestion = ruleSuggestions.get(entry.derived_from_rule);
    assert.ok(typeof suggestion === "string" && suggestion.length >= 20,
      `rule ${entry.derived_from_rule} (referenced by view row ${entry.slug}) must carry hint_suggestion >= 20 chars`);
  }

  // Slug uniqueness: every view slug is unique (collision guard sanity).
  const seen = new Set();
  const collisions = [];
  for (const e of view) {
    if (seen.has(e.slug)) collisions.push(e.slug);
    seen.add(e.slug);
  }
  assert.deepStrictEqual(collisions, [],
    `view slugs must be unique; collisions: ${collisions.join(", ")}`);
});
