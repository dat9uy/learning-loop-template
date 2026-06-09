#!/usr/bin/env node
/**
 * Batch resolve meta-260608T1746Z-test-file-tools-* false-positive findings.
 *
 * These entries were filed by the first test-codebase-scout closeout run
 * (before the `__tests__` exclusion for bucket-C was added). They flag
 * test files that legitimately import core functions (writeEntry/readRegistry)
 * to test them — a correct and necessary pattern for unit tests.
 *
 * Idempotent: skips already-terminal entries.
 */

import { readRegistry } from "#mcp/core/meta-state.js";
import { metaStateResolveTool } from "#mcp/tools/meta-state-resolve-tool.js";
import { resolveRoot } from "#lib/resolve-root.js";

const root = resolveRoot();
const entries = readRegistry(root);
const targetIds = entries
  .filter((e) => e.id.startsWith("meta-260608T1746Z-test-file-tools-"))
  .map((e) => e.id);

let resolved = 0;
let skipped = 0;
let failed = 0;

for (const id of targetIds) {
  try {
    const result = await metaStateResolveTool.handler({
      id,
      resolution:
        "False positive from test-codebase-scout run. Bucket-C classifier flagged test files that legitimately exercise internal core functions (writeEntry/readRegistry/etc). The closeout script's `__tests__` exclusion was added after this batch. Root cause: scout run 260608-1746Z preceded the `if (inv.file.includes('/__tests__/')) continue;` guard in closeout-260608-1700-test-scout.mjs.",
      resolved_by: "operator",
    });
    const text = JSON.parse(result.content[0].text);
    if (text.resolved) {
      resolved++;
    } else if (text.reason === "already_terminal") {
      skipped++;
    } else {
      console.error(`[resolve] FAIL ${id}: ${text.reason}`);
      failed++;
    }
  } catch (err) {
    console.error(`[resolve] ERROR ${id}: ${err.message}`);
    failed++;
  }
}

console.log(`[resolve] Done: ${resolved} resolved, ${skipped} skipped (already terminal), ${failed} failed`);
if (failed > 0) process.exit(1);
