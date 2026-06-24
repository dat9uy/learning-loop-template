#!/usr/bin/env node
/**
 * Repoint 7 findings from core/legacy/* to core/* via meta_state_batch.
 * One atomic batch op (not 7 sequential refresh+patch calls).
 *
 * HISTORICAL: executed 2026-06-24 against meta-state.jsonl (manifest written to
 * reports/fingerprint-repoint-manifest.json). Re-running this script will FAIL:
 * after the fix for meta-260625T0255Z-... (meta_state_batch now enforces the
 * same IMMUTABLE_PATCH_FIELDS deny-list as meta_state_patch), the update ops
 * that pin `code_fingerprint` to a stale hash are rejected with
 * `reason: "immutable_field"`. Future repoints should call
 * `meta_state_refresh_fingerprint` per entry (the documented pattern), not
 * set code_fingerprint in a batch update.
 *
 * Usage (historical only): node plans/260624-2335-phase-e-foundation/scripts/repoint-fingerprints.cjs
 */
const { readFileSync, writeFileSync, mkdirSync, existsSync } = require("node:fs");
const { join } = require("node:path");
const { createHash } = require("node:crypto");

const ROOT = join(__dirname, "..", "..", "..");
const MANIFEST_PATH = join(__dirname, "..", "reports", "fingerprint-repoint-manifest.json");

// The 7 findings anchored to core/legacy/* paths
const FINDINGS = [
  {
    id: "meta-260606T1830Z-context-pollution-stale-workaround-language-audit-trail-nois",
    oldRef: "tools/learning-loop-mastra/core/legacy/gate-logic.js#splitSegments",
    newRef: "tools/learning-loop-mastra/core/gate-logic.js#splitSegments",
    file: "tools/learning-loop-mastra/core/gate-logic.js",
  },
  {
    id: "meta-260613T1615Z-import-chain-analysis-is-the-canonical-dead-code-detection-m",
    oldRef: "tools/learning-loop-mastra/core/legacy/gate-logic.js#applyPromotedRules",
    newRef: "tools/learning-loop-mastra/core/gate-logic.js#applyPromotedRules",
    file: "tools/learning-loop-mastra/core/gate-logic.js",
  },
  {
    id: "meta-260615T1148Z-the-runtime-agnostic-pattern-is-real-in-this-codebase-shim-n",
    oldRef: "tools/learning-loop-mastra/core/legacy/gate-logic.js#GLOB_SCOPE_WHITELIST",
    newRef: "tools/learning-loop-mastra/core/gate-logic.js#GLOB_SCOPE_WHITELIST",
    file: "tools/learning-loop-mastra/core/gate-logic.js",
  },
  {
    id: "meta-260615T1920Z-the-new-stripnodeevalbody-function-in-tools-learning-loop-mc",
    oldRef: "tools/learning-loop-mastra/core/legacy/gate-logic.js#stripNodeEvalBody",
    newRef: "tools/learning-loop-mastra/core/gate-logic.js#stripNodeEvalBody",
    file: "tools/learning-loop-mastra/core/gate-logic.js",
  },
  {
    id: "meta-260616T1453Z-two-more-dead-write-path-entries-in-write-path-patterns-at-t",
    oldRef: "tools/learning-loop-mastra/core/legacy/gate-logic.js#WRITE_PATH_PATTERNS",
    newRef: "tools/learning-loop-mastra/core/gate-logic.js#WRITE_PATH_PATTERNS",
    file: "tools/learning-loop-mastra/core/gate-logic.js",
  },
  {
    id: "meta-260623T1126Z-meta-state-relationships-graph-is-unidirectional-on-reopens",
    oldRef: "tools/learning-loop-mastra/core/legacy/loop-introspect.js:285",
    newRef: "tools/learning-loop-mastra/core/loop-introspect.js:285",
    file: "tools/learning-loop-mastra/core/loop-introspect.js",
  },
  {
    id: "meta-260624T1920Z-code-fingerprint-mechanism-is-o-n-per-cited-file-change-each",
    oldRef: "tools/learning-loop-mastra/core/legacy/check-grounding.js#computeFileHash",
    newRef: "tools/learning-loop-mastra/core/check-grounding.js#computeFileHash",
    file: "tools/learning-loop-mastra/core/check-grounding.js",
  },
];

function computeFileHash(filePath) {
  const fullPath = join(ROOT, filePath);
  if (!existsSync(fullPath)) {
    throw new Error(`File not found: ${fullPath}`);
  }
  const content = readFileSync(fullPath);
  return "sha256:" + createHash("sha256").update(content).digest("hex");
}

async function main() {
  // 1. Verify all files exist and compute new fingerprints
  const ops = [];
  for (const f of FINDINGS) {
    const newFingerprint = computeFileHash(f.file);
    console.log(`${f.id.slice(0, 40)}...`);
    console.log(`  old: ${f.oldRef}`);
    console.log(`  new: ${f.newRef}`);
    console.log(`  fingerprint: ${newFingerprint}`);
    ops.push({
      op: "update",
      id: f.id,
      evidence_code_ref: f.newRef,
      code_fingerprint: newFingerprint,
    });
  }

  // 2. Write the batch script output for manual review
  const manifest = {
    captured_at: new Date().toISOString(),
    operations: ops.map((op) => ({
      id: op.id,
      old_ref: FINDINGS.find((f) => f.id === op.id).oldRef,
      new_ref: op.evidence_code_ref,
      new_fingerprint: op.code_fingerprint,
    })),
    batch_shape: "flat-fields-no-patch-wrapper",
    rationale:
      "Phase E Plan 1 §6 — rename core/legacy/ → core/. Per meta-260624T1920Z-... constraint, repointed in 1 atomic batch.",
  };

  mkdirSync(join(MANIFEST_PATH, ".."), { recursive: true });
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`\nManifest written to ${MANIFEST_PATH}`);
  console.log(`Operations: ${ops.length}`);

  // 3. Output the batch call JSON for the agent to execute via MCP
  const batchCall = { operations: ops };
  console.log("\n--- BATCH CALL (for meta_state_batch MCP tool) ---");
  console.log(JSON.stringify(batchCall, null, 2));
}

main().catch((err) => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
