#!/usr/bin/env node
/**
 * tools/scripts/normalize-skills.mjs — self-healing restore-from-installed step.
 *
 * Phase 2 of plans/260720-1825-skills-manifest-self-healing-normalize-step-npx-clobber-recovery.
 *
 * Restores the v2 extended schema on the `mastra` entry after `npx skills add/update`
 * clobbers it (drops `external:true`/`delivery`/`targets`/`maturity`/`hash`,
 * changes `sourceType:"npx-skills-cli"` → `"github"`, adds opaque
 * `computedHash`). The trust-anchor `hash = sha256(SKILL.md)` is re-derived
 * from the installed files on disk -- the surface with the highest mtime
 * across the 3 surfaces (npx writes detected runtimes with wall-clock mtime;
 * see `detectExternalHash` in `skills-lib.mjs`).
 *
 * Idempotent: re-running on an already-normalized manifest is a no-op (the
 * `changed` flag from `normalizeManifest` drives write-back).
 *
 * Pure-fail-closed: malformed manifest, missing fields, or no real-dir
 * SKILL.md on any surface (cannot derive hash) → exit 2 (matches
 * sync-skills.mjs posture).
 *
 * Usage:
 *   node tools/scripts/normalize-skills.mjs                # repo-root manifest
 *   node tools/scripts/normalize-skills.mjs <tmp-root>     # fixture root
 */

import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeManifest, EXTERNAL_POLICY } from "./skills-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Data root: default = repo root (derived from the script location). An
// optional positional argv[2] overrides it — REQUIRED by the test fixtures
// (a tmp root with its own manifest) so fixtures are real and the live
// working tree is never written by this CLI.
const repoRoot = process.argv[2]
  ? resolve(process.argv[2])
  : join(__dirname, "..", "..");

const manifestPath = join(repoRoot, "skills-lock.json");

function readManifest() {
  if (!existsSync(manifestPath)) {
    console.error(`[normalize-skills] FATAL: ${manifestPath} not found`);
    process.exit(2);
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (err) {
    console.error(`[normalize-skills] FATAL: skills-lock.json parse failed: ${err.message}`);
    process.exit(2);
  }
  // Fail closed on malformed shape (matches sync-skills.mjs posture): a
  // string/array/null manifest.skills would otherwise iterate into
  // index-keyed garbage and exit 0 having done nothing.
  if (!parsed || typeof parsed !== "object" || !parsed.skills || typeof parsed.skills !== "object" || Array.isArray(parsed.skills)) {
    console.error(`[normalize-skills] FATAL: skills-lock.json malformed: .skills must be a plain object`);
    process.exit(2);
  }
  // Per-entry shape guard.
  for (const [name, entry] of Object.entries(parsed.skills)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      console.error(`[normalize-skills] FATAL: skills-lock.json malformed: .skills["${name}"] must be an object`);
      process.exit(2);
    }
  }
  return parsed;
}

// Atomic write-temp + rename (matches core/surfaces.js pid-suffixed `.tmp`
// discipline so concurrent sync-skills + normalize-skills runs cannot collide).
function atomicWriteManifest(filePath, content) {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  try {
    writeFileSync(tmpPath, content, "utf8");
    renameSync(tmpPath, filePath);
  } finally {
    try {
      if (existsSync(tmpPath)) unlinkSync(tmpPath);
    } catch {
      // tmp cleanup is best-effort.
    }
  }
}

function main() {
  const parsed = readManifest();
  const result = normalizeManifest(parsed, repoRoot);
  if (result.error) {
    console.error(`[normalize-skills] FATAL: ${result.error}`);
    process.exit(2);
  }
  if (!result.changed) {
    console.log(`[normalize-skills] no-op: skills-lock.json already normalized`);
    return;
  }
  atomicWriteManifest(manifestPath, JSON.stringify(result.manifest, null, 2));
  const restoredNames = result.restoredExternals ?? Object.keys(EXTERNAL_POLICY).filter((n) => n in parsed.skills);
  console.log(
    `[normalize-skills] normalized skills-lock.json (restored ${restoredNames.length} external entr${restoredNames.length === 1 ? "y" : "ies"}: ${restoredNames.join(", ")})`,
  );
}

main();
