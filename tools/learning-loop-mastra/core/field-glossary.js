/**
 * Shared field vocabulary for meta-state contracts.
 *
 * Tool schemas keep their invocation-critical shape and constraints, while
 * repeated field prose lives here and is available through loop_describe's
 * cold tier when an agent needs the full contract.
 */
const FIELD_GLOSSARY = Object.freeze({
  id: {
    meaning: "Stable identifier of an existing entry.",
    format: "string; finding ids use meta-..., rules use rule-..., designs use loop-design-...",
    example: "meta-260719T2120Z-example",
  },
  entry_kind: {
    meaning: "The schema branch selected for an entry or patch.",
    format: "finding | rule | loop-design | change-log",
    example: "finding",
  },
  status: {
    meaning: "Lifecycle state; lifecycle transitions use the dedicated tools.",
    format: "finding: open | resolved | superseded; rule/design: active | inactive",
    example: "open",
  },
  affected_system: {
    meaning: "Runtime or subsystem affected by the entry.",
    format: "one value from the affected-system enum",
    example: "meta-state-tools",
  },
  evidence_code_ref: {
    meaning: "Code location used for grounding and drift checks.",
    format: "repo-relative path with optional :line or #anchor",
    example: "tools/learning-loop-mastra/core/meta-state.js:625",
  },
  evidence_journal: {
    meaning: "Path to a related technical journal or evidence record.",
    format: "repo-relative markdown path",
    example: "plans/reports/debug-260720-context.md",
  },
  evidence_test: {
    meaning: "Test that demonstrates the behavior or regression.",
    format: "repo-relative test path",
    example: "tools/learning-loop-mastra/__tests__/runtime-state-fingerprint.test.js",
  },
  code_ref: {
    meaning: "Optional code reference with a separately tracked fingerprint.",
    format: "repo-relative path or anchored code reference",
    example: "tools/learning-loop-mastra/core/runtime-state.js:94",
  },
  ledger_ref: {
    meaning: "Pointer to a runtime-state sidecar audit event.",
    format: "local:meta-state:<entry-id> or runtime ledger pointer",
    example: "local:meta-state:meta-260719T2120Z-example",
  },
  source_ref: {
    meaning: "Source reference for a runtime-state record's governing finding.",
    format: "local:meta-state:<finding-id>",
    example: "local:meta-state:meta-260719T2120Z-sessionstart-steering-injection-is-push-dependent-and-silent",
  },
  mechanism_check: {
    meaning: "Opt into file-grounding checks for evidence_code_ref.",
    format: "boolean; defaults true when evidence_code_ref is supplied",
    example: "true",
  },
  verification: {
    meaning: "Self-contained reproduction and verification steps for a finding.",
    format: "JSON object with verification metadata and steps",
    example: "{\"steps\":[{\"cmd\":\"pnpm test:one ...\"}]}",
  },
  reopens: {
    meaning: "Stale finding ids re-surfaced by this new finding.",
    format: "array of meta-/rule-/loop-design- entry ids",
    example: "[\"meta-260719T2120Z-old\"]",
  },
  addresses: {
    meaning: "Finding ids that motivate a deferred loop design.",
    format: "array of entry-id references",
    example: "[\"meta-260719T2120Z-gap\"]",
  },
  proposed_design_for: {
    meaning: "Rules, schemas, or tools a deferred design proposes to create or modify.",
    format: "array of entry-id references",
    example: "[\"rule-runtime-agnostic-features\"]",
  },
  applies_to: {
    meaning: "Scope selectors that narrow a rule or change impact.",
    format: "object with tools, surfaces, rules, statuses, and/or schemas arrays",
    example: "{\"tools\":[\"meta_state_patch\"]}",
  },
  change_diff: {
    meaning: "Structured list of paths or fields added, removed, or semantically changed.",
    format: "object with added, removed, and changed string arrays",
    example: "{\"changed\":[\"patch schema delivery\"]}",
  },
  operation_envelope: {
    meaning: "Audited magnitude metadata emitted for an atomic batch.",
    format: "object with kind, target, pre_count, post_count, and content_hash",
    example: "{\"kind\":\"closeout\",\"target\":\"drift\"}",
  },
  session_id: {
    meaning: "Idempotency key for hook-emitted findings or delivery observations.",
    format: "provider/session identifier string",
    example: "b96b96c3-0808-4a40-8a2b-466b84a50975",
  },
});

export function getFieldGlossaryEntry(field) {
  return FIELD_GLOSSARY[field] ?? null;
}

export function listFieldGlossary() {
  return Object.fromEntries(Object.entries(FIELD_GLOSSARY).map(([field, entry]) => [field, { ...entry }]));
}
