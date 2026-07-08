#!/usr/bin/env node
// One-shot bulk-fix script: replaces the broken GATE_ROOT restore pattern
// `process.env.GATE_ROOT = originalEnv;` with a guarded restore that
// `delete`s the env var when the captured originalEnv was undefined.
// Run from project root: `node tools/scripts/bulk-fix-gate-root-pattern.mjs`
//
// Why this exists: tests use `const originalEnv = process.env.GATE_ROOT;`
// (captures undefined if env not set) then restore in finally via
// `process.env.GATE_ROOT = originalEnv`. Node coerces `undefined` to the
// string `"undefined"`, polluting the env for subsequent operations and
// (with the old appendGateLog) causing `<cwd>/undefined/.claude/...`
// directories to be created.

import { readFileSync, writeFileSync } from "node:fs";
import { globSync } from "node:fs";
import { resolve } from "node:path";

const REPLACEMENT = `// Guarded restore: originalEnv may be ` +
  `undefined (Node coerces assignment of undefined to the string ` +
  `"undefined", polluting the env for subsequent callers). Use ` +
  `delete when the captured value was actually undefined.
    if (originalEnv === undefined) {
      delete process.env.GATE_ROOT;
    } else {
      process.env.GATE_ROOT = originalEnv;
    }`;

const PATTERN_RE = /^(\s*)process\.env\.GATE_ROOT = (originalEnv|originalGateRoot|origRoot|originalRoot|PREV_GATE_ROOT|prevGateRoot);\s*$/;
// Match any captured-variable name + arbitrary indent + trailing semicolon.

const files = globSync("tools/learning-loop-mastra/__tests__/legacy-mcp/**/*.{js,cjs}");
let touched = 0;
let totalReplacements = 0;

for (const file of files) {
  const original = readFileSync(file, "utf8");

  // Match lines like `      process.env.GATE_ROOT = <variable>;` with
  // arbitrary leading indent; capture the indent + variable name so we
  // preserve context.
  const lines = original.split("\n");
  let replacementsInFile = 0;
  const newLines = lines.map((line) => {
    const m = line.match(PATTERN_RE);
    if (!m) return line;
    replacementsInFile++;
    const indent = m[1];
    const variableName = m[2];
    return (
      `${indent}if (${variableName} === undefined) {\n` +
      `${indent}  delete process.env.GATE_ROOT;\n` +
      `${indent}} else {\n` +
      `${indent}  process.env.GATE_ROOT = ${variableName};\n` +
      `${indent}}`
    );
  });

  if (replacementsInFile === 0) continue;
  writeFileSync(file, newLines.join("\n"));
  touched++;
  totalReplacements += replacementsInFile;
  console.log(`✓ ${file}: ${replacementsInFile} replacement${replacementsInFile === 1 ? "" : "s"}`);
}

console.log(`\nDone: ${touched} file${touched === 1 ? "" : "s"}, ${totalReplacements} replacement${totalReplacements === 1 ? "" : "s"}`);