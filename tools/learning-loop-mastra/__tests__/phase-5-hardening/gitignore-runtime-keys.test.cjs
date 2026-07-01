#!/usr/bin/env node
// Plan 5 Phase 1 — lock-step test asserting the runtime identity keys
// + tokens are excluded from git tracking (per Plan 5 red-team Finding 6).
//
// The MCP server MUST never commit a private Ed25519 seed. The .gitignore
// is the single source of truth; this test re-verifies the assertion on
// every CI run so a future refactor that drops the entries fails fast.

const { execFileSync } = require("node:child_process");
const assert = require("node:assert");

const paths = [
  ".claude/runtime-private-key.bin",
  ".factory/runtime-private-key.bin",
  ".mastracode/runtime-private-key.bin",
  ".claude/coordination/runtime-id-token.json",
  ".factory/coordination/runtime-id-token.json",
  ".mastracode/coordination/runtime-id-token.json",
];

let failed = 0;
for (const p of paths) {
  try {
    execFileSync("git", ["check-ignore", p], { stdio: "pipe" });
    console.log(`✓ gitignored: ${p}`);
  } catch (err) {
    // git check-ignore returns 1 for "not ignored" → that's the failure.
    failed += 1;
    console.error(`✗ NOT gitignored: ${p}`);
  }
}

if (failed > 0) {
  console.error(`\nFAIL: ${failed} runtime identity paths are not gitignored.`);
  console.error("Add the missing entries to .gitignore (see Plan 5 Phase 1 Step 5).");
  process.exit(1);
}
console.log("\nAll runtime identity paths are gitignored. ✓");