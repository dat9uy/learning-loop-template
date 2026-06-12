#!/usr/bin/env node
/**
 * File Phase A audit-trail entries (post-Phase 8).
 * Phases 2, 7, 8 of plan 260612-1700-meta-surface-re-debate.
 *
 * Files 3 entries in meta-state.jsonl:
 *  1. change-log: 22 product-surface tools deleted (Phase 7)
 *  2. change-log: 8 unbound product-surface schemas deleted (Phase 8)
 *  3. finding: device-slot ledger converted from yaml to sidecar (Phase 2)
 *
 * Usage:
 *   node scripts/file-phase-a-audit-trail.mjs [--root <path>]
 */

import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { writeEntry } from "../tools/learning-loop-mcp/core/meta-state.js";

const ROOT = process.argv.includes("--root")
  ? process.argv[process.argv.indexOf("--root") + 1]
  : process.cwd();

const TOOLS_REMOVED = [
  "capability_generate",
  "capability_list_probes",
  "capability_list_verified",
  "index_extract",
  "index_search",
  "index_update_claim",
  "index_validate",
  "index_validate_plans",
  "record_create_decision",
  "record_update_decision",
  "record_create_experiment",
  "record_update_experiment",
  "record_create_risk",
  "record_update_risk",
  "record_delete",
  "record_create_observation",
  "record_update_observation",
  "workflow_convert_evidence",
  "workflow_verify_evidence",
  "workflow_external_decision",
  "workflow_candidate_to_experiment",
  "workflow_vendor_doc_assist",
];

const SCHEMAS_REMOVED = [
  "capability.schema.json",
  "claim.schema.json",
  "experiment.schema.json",
  "risk.schema.json",
  "decision.schema.json",
  "observation.schema.json",
  "resource-budget.schema.json",
  "index-entry.schema.json",
];

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
  const sidecarPath = join(ROOT, "runtime-state.jsonl");
  if (!existsSync(sidecarPath)) {
    throw new Error(`sidecar not found: ${sidecarPath}`);
  }
  const sidecarBytes = readFileSync(sidecarPath);
  const sidecarSha = "sha256:" + createHash("sha256").update(sidecarBytes).digest("hex");

  console.log(`sidecar sha256: ${sidecarSha}`);

  // 1. change-log: tool deletion
  const toolChangeId = generateId("phase-a-tools-deleted");
  await writeEntry(ROOT, {
    id: toolChangeId,
    entry_kind: "change-log",
    change_dimension: "mechanical",
    change_target: "tools/manifest.json",
    change_diff: {
      added: [],
      removed: TOOLS_REMOVED,
      changed: [
        "tools/manifest.json: 56 -> 38 tool file entries (net -22 from Phase 7 product-surface tools; +2 runtime_state_* tools added in Phase 4)",
        "agent-manifest.json: capability group removed entirely; index group removed; record_crud group removed; workflow group kept with 12 entries (5 deleted from product-surface)",
        "Cold-session test fix: cold-session-discoverability.test.cjs test 1 + test 2 replaced record_create_decision with meta_state_report + meta_state_patch (Internalization-Rule validation pathway uses meta-surface tools post-Phase 7)",
      ],
    },
    reason: "Phase A Phase 7 (plan 260612-1700-meta-surface-re-debate) - 22 product-surface tools deleted per operator adjudication 2026-06-13 (more aggressive than the plan's 13; all 7 record_crud 'survivors' also removed because they were useless post-archive). Net surface: 56 -> 38 tool files. The 5 capability_*, 3 index_*, 7 record_*, 2 record_observation, 5 workflow_* tools are all unbound product-surface. Callers query capabilities via meta_state_list({entry_kind: 'rule', affected_system: '<s>'}) directly. Cold-session test updated to use meta_state_report + meta_state_patch for Internalization-Rule validation.",
    evidence_code_ref: "tools/learning-loop-mcp/tools/manifest.json",
    evidence_journal: "plans/260612-1700-meta-surface-re-debate/phase-a-remaining-work.md",
    affected_system: "mcp-tools",
    status: "active",
    created_at: nowIso(),
  });
  console.log(`tool-deletion change-log: ${toolChangeId}`);

  // 2. change-log: schema deletion
  const schemaChangeId = generateId("phase-a-schemas-deleted");
  await writeEntry(ROOT, {
    id: schemaChangeId,
    entry_kind: "change-log",
    change_dimension: "semantic",
    change_target: "schemas/",
    change_diff: {
      added: ["schemas/_unbound/_README.md"],
      removed: SCHEMAS_REMOVED,
      changed: [
        "schemas/: 8 unbound product-surface schemas deleted; only meta-state.schema.json + runtime-state.schema.json + _unbound/ remain",
        "schemas/_unbound/_README.md: documents the 8 deletions + path-to-re-debate instructions",
        "core/schema-loader.js: removed 8 schema mappings (now only loads meta-state + runtime-state)",
      ],
    },
    reason: "Phase A Phase 8 (plan 260612-1700-meta-surface-re-debate) - 8 unbound product-surface schemas deleted. The 4-kind meta-state union stays load-bearing. Product surface is unbound and re-debated from the meta-surface. Records archived in Phase 5 to records/_unbound/<schema>/<vendor>/. The 8 unbound product-surface schemas (capability, claim, experiment, risk, decision, observation, resource-budget, index-entry) encoded product-surface concepts the meta-surface does not commit to. AGENTS.md section 1: 'The product surface is unbound and re-debated from the meta-surface.'",
    evidence_code_ref: "schemas/_unbound/_README.md",
    evidence_journal: "plans/260612-1700-meta-surface-re-debate/phase-a-remaining-work.md",
    affected_system: "meta",
    status: "active",
    created_at: nowIso(),
  });
  console.log(`schema-deletion change-log: ${schemaChangeId}`);

  // 3. finding: ledger conversion
  // The evidence_code_ref points at scripts/convert-ledger-to-sidecar.mjs;
  // the code_fingerprint must be the hash of THAT file (per the meta_state_check_grounding
  // contract: code_fingerprint = sha256(evidence_code_ref) at last successful check).
  // The sidecar hash is captured in the description text for forensics, not as
  // the grounding fingerprint.
  const evidenceCodeRef = "scripts/convert-ledger-to-sidecar.mjs";
  const evidencePath = join(ROOT, evidenceCodeRef);
  const evidenceBytes = readFileSync(evidencePath);
  const evidenceSha = "sha256:" + createHash("sha256").update(evidenceBytes).digest("hex");

  const ledgerFindingId = generateId("vnstock-device-slot-ledger-converted");
  await writeEntry(ROOT, {
    id: ledgerFindingId,
    entry_kind: "finding",
    category: "budget-check",
    severity: "warning",
    affected_system: "vnstock",
    description: `Device-slot ledger converted from yaml to runtime-state.jsonl (18 events, sidecar sha256: ${sidecarSha}, script sha256: ${evidenceSha})`,
    evidence_code_ref: evidenceCodeRef,
    evidence_journal: "plans/260612-1700-meta-surface-re-debate/plan.md",
    ledger_ref: "vnstock-device-slot",
    code_fingerprint: evidenceSha,
    status: "active",
    mechanism_check: true,
    created_at: nowIso(),
    expires_at: null,
  });
  console.log(`ledger-conversion finding: ${ledgerFindingId}`);

  console.log("\nAll 3 audit-trail entries filed.");
}

main().catch((err) => {
  console.error("error:", err.message);
  process.exit(1);
});
