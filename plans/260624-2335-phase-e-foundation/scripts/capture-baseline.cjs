#!/usr/bin/env node
/**
 * Capture the pre-rename baseline for Phase E Plan 1.
 * Writes a deterministic JSON manifest to reports/pre-rename-baseline.json.
 * Idempotent: running twice produces byte-identical output.
 */
const { execSync } = require("node:child_process");
const { writeFileSync, mkdirSync } = require("node:fs");
const { join } = require("node:path");

const ROOT = join(__dirname, "..", "..", "..");
const OUT = join(__dirname, "..", "reports", "pre-rename-baseline.json");

function run(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: "utf8" }).trim();
}

// 1. Files containing core/legacy substring
const grepFilesCmd = [
  "grep -rl 'core/legacy'",
  "tools/learning-loop-mastra/ AGENTS.md .claude/ .factory/ tools/scripts/",
  "2>/dev/null",
  "| grep -v 'plans/260624-2335-phase-e-foundation'",
  "| grep -v 'docs/journals/260624-'",
  "| sort",
].join(" ");

let filesWithRefs;
try {
  filesWithRefs = run(grepFilesCmd).split("\n").filter(Boolean);
} catch {
  filesWithRefs = [];
}

// 2. Raw substring match count
const rawCountCmd = [
  "grep -r 'core/legacy'",
  "tools/learning-loop-mastra/ AGENTS.md .claude/ .factory/ tools/scripts/",
  "2>/dev/null",
  "| grep -v 'plans/260624-2335-phase-e-foundation'",
  "| grep -v 'docs/journals/260624-'",
  "| wc -l",
].join(" ");

const rawCount = Number(run(rawCountCmd));

// 3. FCIS baseline (should be 0)
let fcisCount;
try {
  fcisCount = Number(
    run(
      "grep -rE \"from\\s+['\\\"]@mastra\" tools/learning-loop-mastra/core/legacy/ 2>/dev/null | wc -l"
    )
  );
} catch {
  fcisCount = 0;
}

// 4. Core/legacy file listing
let coreFiles;
try {
  coreFiles = run("ls tools/learning-loop-mastra/core/legacy/")
    .split("\n")
    .filter(Boolean)
    .sort();
} catch {
  coreFiles = [];
}

const manifest = {
  captured_at: "2026-06-25",
  file_count: filesWithRefs.length,
  raw_substring_matches: rawCount,
  fcis_violations: fcisCount,
  core_legacy_files: coreFiles,
  files_with_refs: filesWithRefs,
};

mkdirSync(join(__dirname, "..", "reports"), { recursive: true });
writeFileSync(OUT, JSON.stringify(manifest, null, 2) + "\n");

console.log(`Baseline written to ${OUT}`);
console.log(`  Files with refs: ${filesWithRefs.length}`);
console.log(`  Raw matches: ${rawCount}`);
console.log(`  FCIS violations: ${fcisCount}`);
console.log(`  Core/legacy files: ${coreFiles.length}`);
