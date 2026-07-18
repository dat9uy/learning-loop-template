/**
 * Cold-source coverage test: every active agent-checklist rule must carry
 * a `hint_text` field AND have a matching registry entry with
 * `derived_from_rule` === rule.id. This is the Phase-3 invariant that
 * replaces the legacy H6 PROCESS_HINTS-substring check (the rule owns
 * the prose; the registry entry references the rule).
 *
 * The previous H6 ordering gate (loop-describe-tool.js:121-133) performed
 * a substring check at `loop_describe({tier: warm})` time. Phase 3 of
 * plans/260717-1826-unify-context-injection deletes that gate (covered by
 * construction: the promote tool now requires hint_text on agent-checklist
 * rules, and the registry entry's derived_from_rule is added alongside).
 *
 * This test reads the source-of-truth state directly (the registry file +
 * the hint registry), bypassing the runtime module cache, so the invariant
 * is enforced on every test run.
 */
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "vitest";
import { loadPromotedRules } from "../../core/gate-logic.js";
import { HINT_REGISTRY } from "../../core/hint-registry.js";
import { readRegistry } from "../../core/meta-state.js";

const PROJECT_ROOT = resolve(import.meta.dirname, "..", "..", "..", "..");

test("every active agent-checklist rule has matching hint_text AND registry entry with derived_from_rule", () => {
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

  // Phase 3 invariant (forward direction): every active agent-checklist rule
  // carries non-empty hint_text AND has a registry entry whose
  // derived_from_rule matches its id.
  const ruleIds = new Set(consultChecklistRules.map((r) => r.id));
  const ruleHints = new Map(consultChecklistRules.map((r) => [r.id, r.hint_text]));
  const registryByRule = new Map(
    HINT_REGISTRY
      .filter((e) => e.derived_from_rule)
      .map((e) => [e.derived_from_rule, e]),
  );

  const missingHintText = consultChecklistRules.filter(
    (r) => typeof r.hint_text !== "string" || r.hint_text.length < 20,
  );
  assert.deepStrictEqual(missingHintText, [],
    `every active agent-checklist rule must carry hint_text >= 20 chars; missing: ${missingHintText.map((r) => r.id).join(", ")}`);

  const missingDerived = consultChecklistRules.filter((r) => !registryByRule.has(r.id));
  assert.deepStrictEqual(missingDerived, [],
    `every active agent-checklist rule must have a registry entry with derived_from_rule === rule.id; missing: ${missingDerived.map((r) => r.id).join(", ")}`);

  // Inverse direction (no orphan derived entries): every entry with
  // derived_from_rule must reference an active rule that has hint_text.
  for (const entry of HINT_REGISTRY.filter((e) => e.derived_from_rule)) {
    assert.ok(ruleIds.has(entry.derived_from_rule),
      `registry entry ${entry.slug} references rule ${entry.derived_from_rule} but rule is missing or inactive`);
    const hintText = ruleHints.get(entry.derived_from_rule);
    assert.ok(typeof hintText === "string" && hintText.length >= 20,
      `rule ${entry.derived_from_rule} (referenced by ${entry.slug}) must carry hint_text >= 20 chars`);
  }
});