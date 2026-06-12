#!/usr/bin/env node
/**
 * File the master-tracker Phase A flip audit-trail entry.
 * Per the master tracker Update Protocol: edit tracker FIRST, commit, then
 * meta_state_log_change with change_target = tracker path.
 */

import { writeEntry } from "../tools/learning-loop-mcp/core/meta-state.js";

const ROOT = process.cwd();

function nowIso() {
  return new Date().toISOString();
}

function generateId(slug) {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  return `meta-${yy}${mm}${dd}T${hh}${mi}Z-${slug}`;
}

async function main() {
  const id = generateId("phase-a-master-tracker-flip");
  await writeEntry(ROOT, {
    id,
    entry_kind: "change-log",
    change_dimension: "semantic",
    change_target: "plans/reports/productization-260612-1530-master-tracker.md#Phase A",
    change_diff: {
      added: [
        "A1 resolution: Option D (re-debate from meta-surface); observations + budgets in runtime-state.jsonl",
        "A2 resolution: index-entry/claim/evidence schemas redundant; deleted in Phase 8",
        "A3 resolution: 4 active rules are the canonical capability representation; capability schema + 3 tools deleted",
        "A4 resolution: finding.description+evidence_code_ref+evidence_journal is canonical evidence; resource-budget is kind=budget-state in sidecar",
        "A5 resolution: Bridge 5 engine stays meta-surface-only; 4-kind union is the only binding target; product records stay unbound",
      ],
      removed: [],
      changed: [
        "Phase A: 5 sub-phases flipped from [ ] to [x]",
        "Each sub-phase now has a resolution body text linking to plan 260612-1700-meta-surface-re-debate",
      ],
    },
    reason: "Closes Phase A of plan 260612-1700-meta-surface-re-debate. All 5 sub-phases (A1-A5) resolved with concrete answers; the 8-phase plan shipped; the meta-surface is the only bound surface. The product surface is unbound and re-debated from the meta-surface, per AGENTS.md section 1. The bridge 5 engine (Phase B) has a clear contract: meta-surface-only. Bridge 7 (Phase F) has a clear pre-condition: this flip plus the post-meta-surface re-debate conclusions. Audit trail captured in 3 change-log entries (tool deletion, schema deletion, ledger conversion) and 1 finding entry (ledger conversion fingerprint).",
    evidence_code_ref: "plans/reports/productization-260612-1530-master-tracker.md",
    evidence_journal: "plans/260612-1700-meta-surface-re-debate/plan.md",
    affected_system: "meta",
    status: "active",
    created_at: nowIso(),
  });
  console.log(`master-tracker flip change-log: ${id}`);
}

main().catch((err) => {
  console.error("error:", err.message);
  process.exit(1);
});
