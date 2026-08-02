// Fixture entries for meta_state_relationships snapshot tests.
// Includes a legacy finding without promoted_to_rule to exercise
// the dual-field migration logic.
//
// Phase 3: `consolidated_into` / `consolidates` were de-routed from
// CROSS_REFS. The wire-shape test exercises the new citation-sourced
// `cited_by` inbound map (replacing the named `consolidated_by`) and
// the lack of outbound `consolidated_into` / `consolidates` (the live
// edge is a citation row).

export const FINDING_FIXTURE = {
  id: "meta-test-finding",
  entry_kind: "finding",
  category: "gate-logic-bug",
  severity: "warning",
  affected_system: "meta",
  description: "Snapshot test finding fixture.",
  status: "open",
  reopens: ["meta-stale-parent"],
  promoted_to_rule: "rule-test-rule",
  created_at: "2026-06-27T00:00:00Z",
};

export const LEGACY_FINDING_FIXTURE = {
  id: "meta-legacy-finding",
  entry_kind: "finding",
  category: "gate-logic-bug",
  severity: "warning",
  affected_system: "meta",
  description: "Legacy finding without promoted_to_rule (dual-field test).",
  status: "open",
  created_at: "2026-06-27T00:00:00Z",
};

export const RULE_FIXTURE = {
  id: "rule-test-rule",
  entry_kind: "rule",
  origin: "meta-test-finding",
  enforcement: "gate",
  pattern_type: "regex",
  pattern: "^git push",
  description: "Snapshot test rule fixture.",
  status: "active",
  promoted_at: "2026-06-27T00:00:00Z",
  promoted_by: "operator",
  created_at: "2026-06-27T00:00:00Z",
};

export const RULE_FOR_LEGACY_FIXTURE = {
  id: "rule-legacy-origin",
  entry_kind: "rule",
  origin: "meta-legacy-finding",
  enforcement: "gate",
  pattern_type: "glob",
  pattern: "**/*.test.js",
  description: "Rule originating from the legacy finding (dual-field test).",
  status: "active",
  promoted_at: "2026-06-27T00:00:00Z",
  promoted_by: "operator",
  created_at: "2026-06-27T00:00:00Z",
};

export const CHANGELOG_FIXTURE = {
  id: "meta-test-changelog",
  entry_kind: "change-log",
  change_dimension: "mechanical",
  change_target: "core/meta-state.js",
  change_diff: { added: ["field-x"], removed: [], changed: [] },
  reason: "Snapshot test change-log fixture.",
  status: "active",
  created_at: "2026-06-27T00:00:00Z",
  // `consolidates` was de-routed from CROSS_REFS in Phase 3; the live
  // consolidated edge is the citation row below.
};

// Phase 3: citation row carrying the consolidated edge
// (source=finding, target=change-log, rationale="consolidated into…").
export const CITATION_FIXTURE = {
  id: "citation-test-snapshot",
  entry_kind: "citation",
  source: "meta-test-finding",
  target: "meta-test-changelog",
  rationale: "consolidated into meta-test-changelog",
  recorded_at: "2026-06-27T00:00:00Z",
  recorded_by: "operator",
  status: "active",
};

export const LOOPDESIGN_FIXTURE = {
  id: "loop-design-test",
  entry_kind: "loop-design",
  title: "Snapshot test loop design fixture",
  status: "active",
  proposed_design_for: ["rule-test-rule"],
  addresses: ["meta-test-finding"],
  description: "Snapshot test loop-design fixture.",
  affected_system: "meta",
  created_at: "2026-06-27T00:00:00Z",
  created_by: "operator",
};

export const ALL_FIXTURES = [
  FINDING_FIXTURE,
  LEGACY_FINDING_FIXTURE,
  RULE_FIXTURE,
  RULE_FOR_LEGACY_FIXTURE,
  CHANGELOG_FIXTURE,
  CITATION_FIXTURE,
  LOOPDESIGN_FIXTURE,
];