/**
 * Shared mock fixture for the active agent-checklist rules that feed the
 * process-hint view. Single source for every test that needs a hermetic
 * rulesById — previously each test file hand-copied the slug list, so a
 * rule promotion meant editing three places (the same mirror hazard the
 * view derivation removed from production code).
 *
 * The entries mirror the LIVE rule ids and divergent hint_slug overrides
 * (two rules' slugs do not derive from their id), so mock-based tests
 * exercise the hint_slug path instead of silently assuming id → slug.
 * hint_order mirrors production so the mocked view order matches the live
 * merged order.
 *
 * The locked slug-SET assertion (the deliberate drift signal) stays inline
 * in hint-registry.test.cjs — this module is the fixture, not the invariant.
 */

const MOCK_AGENT_CHECKLIST_RULES = [
  { id: "rule-pr-body-registry-deltas", hint_order: 20 },
  { id: "rule-runtime-agnostic-features", hint_slug: "runtime-agnostic-audit", hint_order: 30 },
  { id: "rule-tool-integration-same-commit-dep", hint_order: 40 },
  { id: "rule-fallow-brief-on-gate-failure", hint_slug: "fallow-gate-triage", hint_order: 50 },
  { id: "rule-short-slug-for-risk-records", hint_order: 60 },
  { id: "rule-import-chain-analysis-after-tool-deletion", hint_order: 70 },
  { id: "rule-assertinvariant-at-boundary", hint_order: 80 },
  { id: "rule-required-status-checks-verify-combined-status", hint_order: 100 },
  { id: "rule-no-plan-ids-in-stable-code-artifacts", hint_order: 110 },
];

/** Slug the view derives for a rule — same derivation as buildProcessView. */
function deriveSlug(rule) {
  return rule.hint_slug ?? rule.id.replace(/^rule-/, "");
}

/**
 * Build a hermetic rulesById map: each entry carries pattern_type, hint_text,
 * and hint_suggestion so buildProcessView / resolveHintText render it without
 * registry I/O. The marker text embeds the derived slug for per-hint
 * partition assertions.
 */
function mockAgentChecklistRulesById() {
  return new Map(
    MOCK_AGENT_CHECKLIST_RULES.map((rule) => {
      const slug = deriveSlug(rule);
      return [
        rule.id,
        {
          id: rule.id,
          pattern_type: "agent-checklist",
          hint_text: `[mocked hint_text for ${slug}]`,
          hint_suggestion: `[mocked hint_suggestion for ${slug}]`,
          ...(rule.hint_slug ? { hint_slug: rule.hint_slug } : {}),
          hint_order: rule.hint_order,
        },
      ];
    }),
  );
}

module.exports = { MOCK_AGENT_CHECKLIST_RULES, deriveSlug, mockAgentChecklistRulesById };
