#!/usr/bin/env node
/**
 * One-time cleanup: remove duplicate discoverability change-log entry.
 * The closeout script created a duplicate before the idempotency fix was applied.
 * This script keeps the first entry (meta-260606T1433Z) and removes the second.
 */

const { readFileSync, writeFileSync, renameSync } = require("node:fs");
const { resolveRoot } = require("../../lib/resolve-root.js");

const root = resolveRoot();
const path = require("node:path").join(root, "meta-state.jsonl");

const lines = readFileSync(path, "utf8").split("\n").filter((l) => l.trim() !== "");

const seen = new Set();
const deduped = [];
let removed = 0;

for (const line of lines) {
  try {
    const entry = JSON.parse(line);
    if (
      entry.entry_kind === "change-log" &&
      entry.change_target === "tools/learning-loop-mcp/tools/loop-describe-tool.js#buildDiscoverabilityHints" &&
      entry.consolidates === "meta-260601T1339Z-the-learning-loop-has-no-mechanism-to-surface-the-internaliz,meta-260601T1339Z-agent-could-not-discover-the-meta-state-jsonl-registry-or-th"
    ) {
      if (seen.has(entry.change_target)) {
        removed++;
        continue;
      }
      seen.add(entry.change_target);
    }
    deduped.push(line);
  } catch {
    deduped.push(line);
  }
}

if (removed > 0) {
  const tmpPath = path + ".tmp";
  writeFileSync(tmpPath, deduped.join("\n") + "\n", "utf8");
  renameSync(tmpPath, path);
  console.log(`Removed ${removed} duplicate change-log entry(s)`);
} else {
  console.log("No duplicates found");
}
