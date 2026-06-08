#!/usr/bin/env node
import { readRegistry, updateEntry } from "#mcp/core/meta-state.js";
import { computeFileHash } from "#mcp/core/check-grounding.js";
import { stripEvidenceAnchor } from "#mcp/core/gate-logic.js";
import { resolveRoot } from "#lib/resolve-root.js";
import { join, isAbsolute } from "node:path";

const root = resolveRoot();
const entries = readRegistry(root);
const findings = entries.filter((e) => e.entry_kind === "finding" && e.mechanism_check === true);

let refreshed = 0;
for (const f of findings) {
  const codeRef = typeof f.evidence_code_ref === "string" ? f.evidence_code_ref : null;
  if (!codeRef) continue;

  const stripped = stripEvidenceAnchor(codeRef);
  const absPath = isAbsolute(stripped) ? stripped : join(root, stripped);

  let currentHash;
  try {
    currentHash = computeFileHash(absPath);
  } catch {
    console.log(`SKIP ${f.id}: file not found at ${absPath}`);
    continue;
  }

  if (currentHash !== f.code_fingerprint) {
    const result = await updateEntry(root, f.id, { code_fingerprint: currentHash });
    if (result === null) {
      console.log(`SKIP ${f.id}: entry not found (race?)`);
    } else if (result === "version_mismatch") {
      console.log(`SKIP ${f.id}: version mismatch (race?)`);
    } else {
      console.log(`REFRESH ${f.id}: ${f.code_fingerprint} -> ${currentHash}`);
      refreshed++;
    }
  }
}

console.log(`Done. Refreshed ${refreshed} fingerprints.`);
