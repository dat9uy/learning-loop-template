// Post-unwrap purity guard for the 6 portable-six handler modules.
// Phase-1 probes proved the prerequisites against the (since-deleted)
// createLoopWorkflow modules and captured oracle fixtures; this file keeps
// the durable part of that evidence green against the re-homed handlers:
//   - U-Q2 stays scoped out: none of the 6 handlers performs file reads
//     (resolveRoot/readFileSync/findProjectRoot/fs imports)
//   - the handlers stay transport-agnostic: no @mastra imports
// Schema + behavior parity against the oracle fixtures lives in
// workflow-unwrap-parity.test.js; CLI dispatch in cli-workflow-dispatch.test.js.
import { test } from "vitest";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const HANDLERS_DIR = join(HERE, "..", "tools", "handlers");

const SIX_HANDLERS = [
  "workflow-classify-prompt-tool.js",
  "workflow-prepare-runtime-request-tool.js",
  "workflow-self-improvement-tool.js",
  "workflow-intentional-skip-tool.js",
  "workflow-report-phase-status-tool.js",
  "workflow-runtime-probe-tool.js",
];

for (const file of SIX_HANDLERS) {
  test(`portable-six purity: ${file} performs no file reads (U-Q2 stays scoped out)`, () => {
    const src = readFileSync(join(HANDLERS_DIR, file), "utf8");
    const hits = src.match(/resolveRoot|readFileSync|findProjectRoot|from\s+["']node:fs|from\s+["']fs["']|appendFile|writeFileSync/g);
    assert.strictEqual(hits, null, `${file}: file-read pattern(s) found: ${hits}`);
  });

  test(`portable-six purity: ${file} imports no @mastra transport deps`, () => {
    const src = readFileSync(join(HANDLERS_DIR, file), "utf8");
    assert.ok(!src.includes("@mastra"), `${file}: must not import @mastra (transport-agnostic handler)`);
  });
}
