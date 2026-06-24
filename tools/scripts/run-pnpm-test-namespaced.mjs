#!/usr/bin/env node
/**
 * Per-namespace `pnpm test` runner.
 *
 * Runs each test glob in parallel via `node --test`, emits `[ns] ==> start|pass|FAIL`
 * progress lines to stdout, and mirrors each glob's raw output to `.test-logs/<ns>.log`.
 *
 * Why this exists: the agent-runner interface for `pnpm test` was fragile. The
 * spec reporter streamed all output under a single unlabeled stream; long
 * silences made the agent re-read files in degenerate loops. Per-namespace
 * prefixes and per-glob log files make progress visible at any wall-clock speed.
 */

import { spawn } from "node:child_process";
import { mkdirSync, createWriteStream } from "node:fs";
import { join } from "node:path";

// Active globs (9). Two dead globs were dropped per Plan B Phase 3:
//   - tools/learning-loop-mcp/scout/*.test.js — matches 7 fixture files under
//     scout/test-fixtures/mini-codebase/__tests__/, not live runners.
//   - tools/learning-loop-mcp/evals/*.test.js — directory exists, 0 .test.js files.
//
// Plan 4 cutover followup (2026-06-24, plan 260624-1609-phase-d-plan-4-test-migration-fix):
// the 5 mcp-* globs were repointed at tools/learning-loop-mastra/{__tests__/legacy-mcp,
// core/legacy, core/legacy/lib, tools/legacy}/ and the 117 relative imports in the
// relocated test files were rewritten. archive-product-records.test.js was deleted
// (its scripts/archive-product-records.mjs entry was removed by Plan 4). All
// imports verified to resolve; the 5 namespaces now run the 118 migrated test files.
const GLOBS = [
  { ns: "mcp-tests", pattern: "tools/learning-loop-mastra/__tests__/legacy-mcp/*.test.js" },
  { ns: "mcp-core-tests", pattern: "tools/learning-loop-mastra/core/legacy/__tests__/*.test.js" },
  { ns: "mcp-core", pattern: "tools/learning-loop-mastra/core/legacy/*.test.js" },
  { ns: "mcp-lib", pattern: "tools/learning-loop-mastra/core/legacy/lib/*.test.js" },
  { ns: "mcp-tools", pattern: "tools/learning-loop-mastra/tools/legacy/*.test.js" },
  { ns: "mastra-js", pattern: "tools/learning-loop-mastra/__tests__/*.test.js" },
  { ns: "mastra-cjs", pattern: "tools/learning-loop-mastra/__tests__/*.test.cjs" },
  { ns: "claude-coord-cjs", pattern: ".claude/coordination/__tests__/*.test.cjs" },
  { ns: "factory-cjs", pattern: ".factory/hooks/__tests__/*.test.cjs" },
];

const NS_RE = /^[a-z0-9-]+$/;
const LOG_DIR = ".test-logs";

function sanitizeNs(ns) {
  if (!NS_RE.test(ns)) {
    throw new Error(`Invalid namespace "${ns}" (must match ${NS_RE.source})`);
  }
  return ns;
}

function prefixStream(stream, ns, logStream) {
  let buffer = "";
  stream.on("data", (chunk) => {
    buffer += chunk;
    let idx;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      process.stdout.write(`[${ns}] ${line}\n`);
      logStream.write(`${line}\n`);
    }
  });
  stream.on("end", () => {
    if (buffer.length > 0) {
      process.stdout.write(`[${ns}] ${buffer}`);
      logStream.write(buffer);
    }
  });
}

function runGlob({ ns, pattern }) {
  return new Promise((resolve) => {
    sanitizeNs(ns);
    const logPath = join(LOG_DIR, `${ns}.log`);
    const logStream = createWriteStream(logPath, { flags: "w" });

    logStream.on("open", () => {
      process.stdout.write(`[${ns}] ==> start\n`);

      const child = spawn(
        process.execPath,
        ["--test", "--test-timeout=30000", pattern],
        {
          stdio: ["ignore", "pipe", "pipe"],
          env: { ...process.env, FORCE_COLOR: "0" },
        },
      );

      prefixStream(child.stdout, ns, logStream);
      prefixStream(child.stderr, ns, logStream);

      child.on("close", (code) => {
        logStream.end(() => {
          if (code === 0) {
            process.stdout.write(`[${ns}] ==> pass\n`);
            resolve({ ns, ok: true });
          } else {
            process.stdout.write(`[${ns}] ==> FAIL ${code}\n`);
            resolve({ ns, ok: false, code });
          }
        });
      });

      child.on("error", (err) => {
        process.stdout.write(`[${ns}] ==> FAIL spawn ${err.message}\n`);
        logStream.end(() => resolve({ ns, ok: false, code: -1 }));
      });
    });

    logStream.on("error", (err) => {
      process.stdout.write(`[${ns}] ==> FAIL log ${err.message}\n`);
      resolve({ ns, ok: false, code: -1 });
    });
  });
}

async function main() {
  mkdirSync(LOG_DIR, { recursive: true });

  const start = Date.now();
  process.stdout.write("[suite] ==> start\n");

  // Sequential execution (not Promise.all) is intentional. Empirically, parallel
  // `node --test` processes contend on shared Mastra storage (file-backed SQLite
  // at tools/learning-loop-mastra/data/mastra-memory.db) and push the bash-gate
  // performance assertion over its 500ms threshold under WSL2 load. Sequential
  // keeps the suite deterministic and still emits per-namespace progress lines.
  const results = [];
  for (const glob of GLOBS) {
    results.push(await runGlob(glob));
  }

  const failed = results.filter((r) => !r.ok);
  const elapsed = ((Date.now() - start) / 1000).toFixed(2);

  if (failed.length === 0) {
    process.stdout.write(`[suite] ==> pass (${GLOBS.length} globs, ${elapsed}s)\n`);
    process.exit(0);
  }

  process.stdout.write(
    `[suite] ==> FAIL (${failed.length} globs failed, ${elapsed}s)\n`,
  );
  process.exit(1);
}

main().catch((err) => {
  process.stderr.write(`[suite] ==> FAIL ${err.message}\n`);
  process.exit(1);
});
