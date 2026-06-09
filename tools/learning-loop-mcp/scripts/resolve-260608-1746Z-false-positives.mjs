#!/usr/bin/env node
/**
 * Batch resolve meta-260608T1746Z false-positive findings.
 *
 * These entries were filed by the test-codebase-scout closeout script
 * (closeout-260608-1700-test-scout.mjs) and are overwhelmingly false
 * positives:
 *   - D3 "removed-tool" flags on legitimate library/core imports (#mcp/core/,
 *     #lib/, yaml, zod, ajv, etc.)
 *   - D1 schema-drift flags on inline test fixture strings in
 *     scout-dangling-detector.test.js
 *   - D3 flag on removedTool fixture import in scout-dangling-detector.test.js
 *     (intentional test of the D3 detector itself)
 *
 * This script resolves them in bulk with a canonical resolution reason.
 * Idempotent: skips already-terminal entries.
 */

import { readRegistry } from "#mcp/core/meta-state.js";
import { metaStateResolveTool } from "#mcp/tools/meta-state-resolve-tool.js";
import { resolveRoot } from "#lib/resolve-root.js";

const root = resolveRoot();
const entries = readRegistry(root);
const targetIds = entries
  .filter((e) => e.id.startsWith("meta-260608T1746Z-test-tools-learning-loop-mcp-tests-"))
  .map((e) => e.id);

let resolved = 0;
let skipped = 0;
let failed = 0;

for (const id of targetIds) {
  try {
    const result = await metaStateResolveTool.handler({
      id,
      resolution:
        "False positive from test-codebase-scout run. D3 detector flagged legitimate library/core imports (yaml, zod, ajv, #mcp/core/, #lib/) before the D3 scope-narrowing fix; D1 detector flagged inline test fixture strings that intentionally exercise the detector. Root causes fixed in dangling-detector.js D3 scope narrowing (commit 1598c95).",
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
