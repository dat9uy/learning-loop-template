#!/usr/bin/env node
/**
 * file-260608-test-failures.mjs
 *
 * One-shot script: file 7 meta_state_report findings for the pre-existing
 * test failures surfaced by the scout closeout (plan 260608-1700). Lets the
 * next session pick these up via meta_state_list.
 *
 * Idempotency: each finding's session_id is fixed ("test-failures-260608T1800Z"),
 * and the tool's handler enforces uniqueness per session per (description, evidence_code_ref).
 */

import { metaStateReportTool } from "#mcp/tools/meta-state-report-tool.js";
import { readRegistry } from "#mcp/core/meta-state.js";
import { resolveRoot } from "#lib/resolve-root.js";

const root = resolveRoot();
const SESSION_ID = "test-failures-260608T1800Z";

// Idempotency: skip if a finding with the same session_id + evidence_code_ref already exists.
const existing = readRegistry(root);
const alreadyFiled = new Set(
  existing
    .filter((e) => e.entry_kind === "finding" && e.session_id === SESSION_ID)
    .map((e) => e.evidence_code_ref)
);

const findings = [
  {
    test: "buildInverseIndexes on real registry",
    file: "tools/learning-loop-mcp/__tests__/build-inverse-indexes.test.js:37",
    description: "Test buildInverseIndexes on real registry fails (line 37). The inverse index build is sensitive to registry content; the scout closeout (plan 260608-1700) added 134+ findings, growing the registry past test expectations. Future session should either (a) tighten the inverse-index assertion to ignore size variance, or (b) cap the registry size the inverse-index test runs against.",
    category: "loop-anti-pattern",
    subtype: "test-failure-size-sensitive",
    affected_system: "index-extractor",
    mechanism_check: true,
  },
  {
    test: "cold-tier regression: structural invariants, no fixture dependency",
    file: "tools/learning-loop-mcp/__tests__/cold-tier-regression.test.js:18",
    description: "Cold-tier regression test fails because finding meta-260606T1531Z-cold-session-test-rule-deferred is not grounded: status=drifted, drift_kind=hash_mismatch, evidence_code_ref=tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs. The cold-session test file has drifted from its stored fingerprint. Future session should either (a) refresh the fingerprint via meta_state_refresh_fingerprint, or (b) investigate whether the drift is real.",
    category: "stale-ref",
    subtype: "cold-tier-fingerprint-drift",
    affected_system: "gate-logic",
    mechanism_check: true,
  },
  {
    test: "Phase 6: summary mode reduces cold-tier size",
    file: "tools/learning-loop-mcp/__tests__/meta-state-list-compact.test.js",
    description: "Phase 6 summary-mode size assertion fails because the cold tier has grown past its expected budget. The scout closeout added 134+ findings which grew both the full registry and the cold tier. Future session should triage or archive findings to bring the cold tier back under budget.",
    category: "loop-anti-pattern",
    subtype: "cold-tier-size-overrun",
    affected_system: "index-extractor",
    mechanism_check: false,
  },
  {
    test: "compact: true on full registry returns <30KB (vs 130KB full)",
    file: "tools/learning-loop-mcp/__tests__/meta-state-list-compact.test.js",
    description: "Compact mode size budget (<30KB) is exceeded because the full registry is now >130KB. Scout closeout added 134+ findings (plan 260608-1700) plus pre-existing entries. Future session should add a meta_state_archive capability or triage stale findings.",
    category: "loop-anti-pattern",
    subtype: "registry-size-overrun",
    affected_system: "index-extractor",
    mechanism_check: false,
  },
  {
    test: "meta_state_relationships: inbound for rule origin",
    file: "tools/learning-loop-mcp/__tests__/meta-state-relationships.test.js:8",
    description: "meta_state_relationships inbound test for rule origin fails. The relationships query may not correctly trace rule<->finding refs after the dual-field unification at meta-260607T0008Z and the loop-design schema changes. Future session should investigate the relationship traversal logic.",
    category: "gate-logic-bug",
    subtype: "relationships-inbound-bug",
    affected_system: "gate-logic",
    mechanism_check: true,
  },
  {
    test: "meta_state_relationships: outbound for finding with promoted_to_rule",
    file: "tools/learning-loop-mcp/__tests__/meta-state-relationships.test.js:24",
    description: "meta_state_relationships outbound test for finding with promoted_to_rule fails. Outbound traversal from a finding to its promoted rule is broken. Future session should fix the relationship traversal.",
    category: "gate-logic-bug",
    subtype: "relationships-outbound-bug",
    affected_system: "gate-logic",
    mechanism_check: true,
  },
  {
    test: "meta_state_relationships: both directions for entry with refs",
    file: "tools/learning-loop-mcp/__tests__/meta-state-relationships.test.js:35",
    description: "meta_state_relationships both-directions test for entry with refs fails. The traversal does not return both inbound and outbound refs consistently. Future session should fix the relationship direction logic.",
    category: "gate-logic-bug",
    subtype: "relationships-bidir-bug",
    affected_system: "gate-logic",
    mechanism_check: true,
  },
];

let filed = 0;
let skipped = 0;

for (const f of findings) {
  if (alreadyFiled.has(f.file)) {
    console.log(`skipped (existing): ${f.test}`);
    skipped++;
    continue;
  }
  try {
    const result = await metaStateReportTool.handler({
      category: f.category,
      subtype: f.subtype,
      severity: "warning",
      affected_system: f.affected_system,
      description: f.description,
      evidence_code_ref: f.file,
      mechanism_check: f.mechanism_check,
      session_id: SESSION_ID,
    });
    const parsed = JSON.parse(result.content[0].text);
    if (parsed.reported) {
      console.log(`filed: ${parsed.id}  (test: ${f.test})`);
      filed++;
    } else {
      console.log(`skipped (already reported): ${f.test}`);
      skipped++;
    }
  } catch (err) {
    console.error(`FAIL: ${f.test}: ${err.message}`);
  }
}

console.log("");
console.log(`Total: ${filed} filed, ${skipped} skipped`);
