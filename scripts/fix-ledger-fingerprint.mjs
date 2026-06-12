#!/usr/bin/env node
/**
 * Fix the code_fingerprint on the ledger-conversion finding.
 * The original filing used the sidecar sha256, but the grounding check
 * expects the sha256 of evidence_code_ref (the script file).
 */

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { updateEntry, readRegistry, filterEntries } from "../tools/learning-loop-mcp/core/meta-state.js";

const ROOT = process.cwd();

async function main() {
  const evidenceCodeRef = "scripts/convert-ledger-to-sidecar.mjs";
  const evidencePath = join(ROOT, evidenceCodeRef);
  const evidenceBytes = readFileSync(evidencePath);
  const evidenceSha = "sha256:" + createHash("sha256").update(evidenceBytes).digest("hex");

  console.log(`script sha256: ${evidenceSha}`);

  // Find the existing finding
  const all = readRegistry(ROOT);
  const findings = filterEntries(all, { entry_kind: "finding", category: "budget-check", affected_system: "vnstock" });
  const finding = findings.find((e) => e.id && e.id.includes("vnstock-device-slot-ledger-converted"));
  if (!finding) {
    throw new Error("ledger-conversion finding not found");
  }
  console.log(`found finding: ${finding.id}`);
  console.log(`current code_fingerprint: ${finding.code_fingerprint}`);

  // Patch the code_fingerprint
  const result = await updateEntry(ROOT, finding.id, { code_fingerprint: evidenceSha });
  console.log(`patch result: ${result}`);

  // Verify
  const after = readRegistry(ROOT).find((e) => e.id === finding.id);
  console.log(`after code_fingerprint: ${after.code_fingerprint}`);
}

main().catch((err) => {
  console.error("error:", err.message);
  process.exit(1);
});
