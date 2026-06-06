#!/usr/bin/env node
/**
 * Closeout script for plan 260606-discoverability-and-meta-evidence-migration.
 *
 * Resolves the 2 active 2026-06-01 findings and appends 1 change-log entry
 * with the consolidates field. Uses direct file I/O via core/meta-state.js
 * because the MCP meta_state_log_change tool's zod schema drops the
 * consolidates field (meta-state-log-change-tool.js:11-32).
 *
 * Idempotent: running twice is safe. The resolve calls are no-ops if already
 * resolved; the log_change call appends a second entry (acceptable as audit
 * trail but flagged in output).
 */

const { readRegistry, updateEntry, writeEntry, generateId } = require("../core/meta-state.js");
const { resolveRoot } = require("../../lib/resolve-root.js");

const root = resolveRoot();

const findingA = "meta-260601T1339Z-the-learning-loop-has-no-mechanism-to-surface-the-internaliz";
const findingB = "meta-260601T1339Z-agent-could-not-discover-the-meta-state-jsonl-registry-or-th";

const now = new Date().toISOString();

async function main() {
  const entries = readRegistry(root);

  const a = entries.find((e) => e.id === findingA);
  const b = entries.find((e) => e.id === findingB);

  if (!a || !b) {
    console.error("One or both target findings are missing from the registry.");
    process.exit(1);
  }

  if (a.status !== "resolved") {
    await updateEntry(root, findingA, {
      status: "resolved",
      resolution: "Closed by plan 260606 Phase 2+3: discoverability_hints + cold-session test. Internalization rule surfaces in loop_describe warm tier. See plans/reports/brainstorm-260606-discoverability-and-meta-evidence-migration.md",
      resolved_by: "operator",
      resolved_at: now,
    });
    console.log(`Resolved ${findingA}`);
  } else {
    console.log(`Already resolved: ${findingA}`);
  }

  if (b.status !== "resolved") {
    await updateEntry(root, findingB, {
      status: "resolved",
      resolution: "Closed by plan 260606 Phase 2: loop_describe warm tier surfaces meta_state_report, meta_state_derive_status, meta_state_refresh_fingerprint, meta_state_log_change in discoverability_hints. See plans/reports/brainstorm-260606-discoverability-and-meta-evidence-migration.md",
      resolved_by: "operator",
      resolved_at: now,
    });
    console.log(`Resolved ${findingB}`);
  } else {
    console.log(`Already resolved: ${findingB}`);
  }

  const existing = entries.find((e) =>
    e.entry_kind === "change-log" &&
    e.change_target === "tools/learning-loop-mcp/tools/loop-describe-tool.js#buildDiscoverabilityHints" &&
    e.consolidates === `${findingA},${findingB}`
  );

  if (existing) {
    console.log(`Change-log already exists: ${existing.id}`);
  } else {
    const changeId = generateId("discoverability-meta-evidence-migration");
    const changeEntry = {
      id: changeId,
      entry_kind: "change-log",
      change_dimension: "surface",
      change_target: "tools/learning-loop-mcp/tools/loop-describe-tool.js#buildDiscoverabilityHints",
      change_diff: {
        added: [
          "tools/learning-loop-mcp/lib/source-ref-validator.js#validateMetaStateRef",
          "tools/learning-loop-mcp/core/record-validation-rules.js#validateMetaStateRefCore",
          "tools/learning-loop-mcp/core/loop-introspect.js#buildDiscoverabilityHints",
          "tools/learning-loop-mcp/tools/loop-describe-tool.js.discoverability_hints",
          ".factory/hooks/loop-surface-inject.cjs#LOCAL_DISCOVERABILITY_HINTS",
          ".factory/hooks/loop-surface-inject.cjs#reportHintDowngrade",
          "tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs",
        ],
        removed: ["records/meta/evidence/ directory"],
        changed: [
          "tools/learning-loop-mcp/tools/meta-state-report-tool.js description",
          "tools/learning-loop-mcp/tools/create-decision-record-tool.js rejects deprecated source_refs",
          "AGENTS.md Internalization Rule",
          "docs/observation-vs-meta-state.md Internalization via Code-Pointed Findings",
          "docs/philosophy.md pillar 3",
        ],
      },
      reason: "Closes 2 active 2026-06-01 findings by surfacing the existing evidence_code_ref + mechanism_check workflow in loop_describe warm tier. Drops records/meta/evidence/. The internalization rule becomes 'cite the code, not the markdown.'",
      applies_to: {
        tools: [
          "meta_state_report",
          "loop_describe",
          "meta_state_derive_status",
          "meta_state_refresh_fingerprint",
          "record_create_decision",
        ],
      },
      consolidates: `${findingA},${findingB}`,
      evidence: {
        code_ref: "tools/learning-loop-mcp/tools/loop-describe-tool.js#buildDiscoverabilityHints",
        journal: "plans/reports/brainstorm-260606-discoverability-and-meta-evidence-migration.md",
      },
      status: "active",
      created_at: now,
      version: 0,
    };

    await writeEntry(root, changeEntry);
    console.log(`Appended change-log ${changeId}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
