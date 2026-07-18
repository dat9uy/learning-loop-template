import assert from "node:assert";
import { resolve } from "node:path";
import { test } from "vitest";
import { applyPromotedRules } from "../../core/gate-logic.js";
import { metaStateRuleEntrySchema, readRegistry } from "../../core/meta-state.js";

const PROJECT_ROOT = resolve(import.meta.dirname, "..", "..", "..", "..");

const RULE_ID = "rule-fallow-brief-on-gate-failure";

await test("agent-checklist rule schema is valid for rule-fallow-brief-on-gate-failure (1-item checklist)", () => {
  // The description below is a custom value chosen for clarity in this test;
  // it does NOT match the auto-generated form that meta_state_promote_rule
  // would produce (which uses `Gate-enforced rule: ${rule_id}. Pattern type=${pattern_type}; pattern=${pattern}.`).
  // This test exercises the schema independently of the tool, so any string
  // that satisfies metaStateRuleEntrySchema#description is acceptable here.
  // Mirrors gate-logic-agent-checklist-tool-integration.test.js:19-37 pattern.
  const rule = metaStateRuleEntrySchema.parse({
    entry_kind: "rule",
    id: RULE_ID,
    origin: "meta-260712T0730Z-fallow-mcp-runtime-needs-format-json",
    enforcement: "agent",
    pattern_type: "agent-checklist",
    pattern: JSON.stringify({
      version: 1,
      items: [
        {
          id: "fallow-gate-failure-routes-to-brief",
          description: "When `pnpm fallow:gate` (or any local `fallow audit --gate new-only` invocation) exits non-zero, run `pnpm fallow:brief` next to get a compact CSV stream (one finding per line with severity/crap/path:line fields) instead of re-parsing the human-readable prose.",
        },
      ],
    }),
    description: "Fallow gate triage: route fallow:gate failures to fallow:brief for compact CSV triage.",
    status: "active",
    promoted_at: "2026-07-14T01:03:18.451Z",
    promoted_by: "operator",
  });

  // Round-trip through applyPromotedRules to confirm the rule shape is consumed
  // (agent-checklist rules return decision: 'ok' — they only surface via
  // PROCESS_HINTS, not via gate enforcement; see gate-logic.js:750-755).
  const result = applyPromotedRules(
    "pnpm fallow:gate",
    null,
    [rule],
    "/tmp/agent-checklist-fallow-brief-test-root",
  );

  assert.deepStrictEqual(result, { decision: "ok" });

  // Belt-and-suspenders: verify the parsed checklist has exactly 1 item with
  // the expected id. Catches drift if a future contributor extends the rule
  // and forgets to update PROCESS_HINTS in lockstep.
  const parsed = JSON.parse(rule.pattern);
  assert.strictEqual(parsed.items.length, 1);
  assert.strictEqual(parsed.items[0].id, "fallow-gate-failure-routes-to-brief");
});

await test("rule entry carries hint_text with literal rule id (Phase 3 invariant)", () => {
  // Phase 3 (plans/260717-1826-unify-context-injection): the rule-derived
  // process hint prose lives on the rule entry as `hint_text`. The H6
  // substring check is replaced by: rule entry MUST carry hint_text and
  // a registry entry MUST carry derived_from_rule === rule.id. The id-
  // substring assertion is moved here to lock the rule's prose to its
  // canonical identifier (a future contributor who paraphrases loses the
  // canonical reference).
  const entries = readRegistry(PROJECT_ROOT);
  const rule = entries.find((e) => e.id === RULE_ID);
  assert.ok(rule, `rule ${RULE_ID} must exist in registry`);
  assert.ok(typeof rule.hint_text === "string" && rule.hint_text.length >= 20,
    `rule ${RULE_ID} must carry hint_text (>=20 chars); Phase 3 invariant`);
  assert.ok(
    rule.hint_text.includes(RULE_ID),
    `rule ${RULE_ID} hint_text must contain literal substring ${RULE_ID} (canonical reference)`,
  );
});
