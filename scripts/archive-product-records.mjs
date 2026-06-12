#!/usr/bin/env node
/**
 * Archive product-surface records to records/_unbound/.
 * Phase 5 of plan 260612-1700-meta-surface-re-debate.
 *
 * Usage:
 *   node scripts/archive-product-records.mjs [--root <path>]
 */

import { readdirSync, statSync, renameSync, mkdirSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname, basename } from "node:path";

const SCHEMAS = ["decision", "experiment", "risk", "claim", "evidence", "index", "observation", "capability"];

function findFiles(dir, pattern) {
  const results = [];
  function walk(current) {
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && pattern.test(entry.name)) {
        results.push(fullPath);
      }
    }
  }
  walk(dir);
  return results;
}

function getRelativePath(fullPath, root) {
  if (fullPath.startsWith(root)) {
    return fullPath.slice(root.length + 1);
  }
  return fullPath;
}

export async function archiveProductRecords({ root = process.cwd() } = {}) {
  const recordsDir = join(root, "records");
  const unboundDir = join(root, "records", "_unbound");

  // Find all yaml/md files under records/ excluding records/_unbound/
  const allFiles = findFiles(recordsDir, /\.(yaml|md)$/);
  const filesToArchive = allFiles.filter((f) => !f.includes("records/_unbound/") && !f.includes(".gitkeep"));

  let archived = 0;
  const log = [];

  for (const filePath of filesToArchive) {
    const relPath = getRelativePath(filePath, root);
    // Parse path: records/<vendor>/<schema>/filename.ext OR records/observations/filename.ext
    const parts = relPath.split("/");
    if (parts.length < 3) continue; // not in records/ structure

    let vendor, schema, filename;
    if (parts[1] === "observations") {
      // Special case: records/observations/file.yaml -> records/_unbound/observation/_/file.yaml
      vendor = "_";
      schema = "observation";
      filename = parts.slice(2).join("/");
    } else if (parts.length >= 4) {
      vendor = parts[1];
      schema = parts[2];
      filename = parts.slice(3).join("/");
    } else {
      continue;
    }

    const destDir = join(unboundDir, schema, vendor);
    const destPath = join(destDir, filename);

    // Idempotency: skip if already archived
    if (existsSync(destPath)) {
      log.push({ action: "skip", source: relPath, reason: "already_archived" });
      continue;
    }

    mkdirSync(destDir, { recursive: true });
    // If filename contains subdirectories, create them too
    const destSubDir = dirname(destPath);
    if (destSubDir !== destDir) {
      mkdirSync(destSubDir, { recursive: true });
    }
    renameSync(filePath, destPath);
    archived++;
    log.push({ action: "archive", source: relPath, dest: getRelativePath(destPath, root) });
  }

  // Write README
  const readmePath = join(unboundDir, "_README.md");
  const readmeContent = `# Archived Product-Surface Records

## Why

These records were archived during Phase A of the meta-surface re-debate (plan 260612-1700-meta-surface-re-debate).
The product surface is unbound and being re-debated from the meta-surface.

## What

- **Source**: records/<vendor>/{decisions,experiments,risks,claims,evidence,index,capabilities,observations}/
- **Destination**: records/_unbound/<schema>/<vendor>/
- **Count**: ${archived} files archived

## Gate Behavior

records/_unbound/** falls through to decision: 'ok' in the write gate.
It is NOT blocked by records/observations/** or WRITE_PATH_PATTERNS.

## How to Re-debate

1. Move files back to records/<vendor>/<schema>/
2. Reinstate the corresponding schema in schemas/
3. Update manifests to re-register tools
`;
  writeFileSync(readmePath, readmeContent, "utf8");

  return { archived, total: filesToArchive.length, log };
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  let root = process.cwd();

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--root" && args[i + 1]) {
      root = args[i + 1];
      i++;
    }
  }

  archiveProductRecords({ root })
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error("Error:", err.message);
      process.exit(1);
    });
}
