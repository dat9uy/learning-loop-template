// Phase E Plan 1, Phase 6 Step 9 — fingerprint repoint existence assertion
// (per red-team H6: cold-tier regression EXEMPTS hash_mismatch on anchor-based
// refs, so the only runtime invariant is that the new paths exist)
//
// The 7 findings repointed from core/legacy/* to core/* in Phase 6. This test
// locks the post-repoint state: every evidence_code_ref path resolves to a
// real file. If a future refactor or merge ever invalidates a repointed path,
// this test fails loud at file-existence time.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Resolve project root from this file's location: plans/<plan>/__tests__/file.js
// → ../../../<root>
const projectRoot = join(import.meta.dirname, "..", "..", "..");

const repoints = [
  {
    id: "meta-260606T1830Z-context-pollution-stale-workaround-language-audit-trail-nois",
    newRef: "tools/learning-loop-mastra/core/gate-logic.js",
  },
  {
    id: "meta-260613T1615Z-import-chain-analysis-is-the-canonical-dead-code-detection-m",
    newRef: "tools/learning-loop-mastra/core/gate-logic.js",
  },
  {
    id: "meta-260615T1148Z-the-runtime-agnostic-pattern-is-real-in-this-codebase-shim-n",
    newRef: "tools/learning-loop-mastra/core/gate-logic.js",
  },
  {
    id: "meta-260615T1920Z-the-new-stripnodeevalbody-function-in-tools-learning-loop-mc",
    newRef: "tools/learning-loop-mastra/core/gate-logic.js",
  },
  {
    id: "meta-260616T1453Z-two-more-dead-write-path-entries-in-write-path-patterns-at-t",
    newRef: "tools/learning-loop-mastra/core/gate-logic.js",
  },
  {
    id: "meta-260623T1126Z-meta-state-relationships-graph-is-unidirectional-on-reopens",
    newRef: "tools/learning-loop-mastra/core/loop-introspect.js",
  },
  {
    id: "meta-260624T1920Z-code-fingerprint-mechanism-is-o-n-per-cited-file-change-each",
    newRef: "tools/learning-loop-mastra/core/check-grounding.js",
  },
];

test("all 7 repointed evidence_code_ref paths exist on disk", () => {
  const missing = [];
  for (const r of repoints) {
    const fullPath = join(projectRoot, r.newRef);
    if (!existsSync(fullPath)) {
      missing.push({ id: r.id, expected: r.newRef, fullPath });
    }
  }
  assert.equal(
    missing.length,
    0,
    `${missing.length} repointed path(s) missing:\n` +
      missing.map((m) => `  - ${m.id} → ${m.expected}`).join("\n")
  );
});

test("meta-state.jsonl records the 7 repointed evidence_code_ref paths", () => {
  // Read the registry and confirm each id's evidence_code_ref is on the new path.
  // NOTE: only the evidence_code_ref field is checked — historical mentions of
  // `core/legacy/...` in description text are forensic continuity, not drift.
  const registryPath = join(projectRoot, "meta-state.jsonl");
  const registry = readFileSync(registryPath, "utf8");
  for (const r of repoints) {
    const lines = registry
      .split("\n")
      .filter((l) => l.startsWith(`{"id":"${r.id}"`));
    assert.ok(lines.length > 0, `registry missing entry for ${r.id}`);
    const line = lines[lines.length - 1]; // last write wins
    const refMatch = line.match(/"evidence_code_ref":"([^"]+)"/);
    assert.ok(refMatch, `${r.id} has no evidence_code_ref field`);
    const ref = refMatch[1];
    assert.ok(
      ref.startsWith(r.newRef),
      `${r.id} evidence_code_ref is not on the new path; got: ${ref}, expected prefix: ${r.newRef}`
    );
  }
});

test("fingerprint-repoint-manifest.json exists and lists all 7 ids", () => {
  const manifestPath = join(
    projectRoot,
    "plans",
    "260624-2335-phase-e-foundation",
    "reports",
    "fingerprint-repoint-manifest.json"
  );
  assert.ok(existsSync(manifestPath), `manifest not found at ${manifestPath}`);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.operations.length, 7, "manifest should have 7 operations");
  for (const r of repoints) {
    const op = manifest.operations.find((o) => o.id === r.id);
    assert.ok(op, `manifest missing op for ${r.id}`);
    assert.equal(
      op.new_ref.startsWith(r.newRef),
      true,
      `manifest new_ref for ${r.id} should start with ${r.newRef}, got ${op.new_ref}`
    );
  }
});
