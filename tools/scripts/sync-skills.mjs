#!/usr/bin/env node
/**
 * tools/scripts/sync-skills.mjs — internal-skills fan-out materializer.
 *
 * Phase 2 of plans/260719-1428-central-skills-management.
 *
 * Reads the canonical source at tools/learning-loop-mastra/skills/<name>/SKILL.md
 * and fans out (byte-identical) to .claude, .factory, .mastracode via
 * core/surfaces.js#writeToAllSkills. Idempotent (re-run = no diff when mirrors
 * already match canonical).
 *
 * Manifest: skills-lock.json (Phase 1 schema). Only entries with `external:false`
 * (internal) are materialized. External entries (e.g. mastra) are skipped.
 *
 * Post-fan-out runtime parity check (red-team F5): re-read all 3 mirrors +
 * canonical; fail loudly if any pair differs. This closes the partial-fan-out
 * gap — the contract's `checkMirrorPresence` (count>=2) masks a single failed
 * surface; the materializer enforces 3-way byte-identity at runtime.
 *
 * Authoring path: edit canonical → `pnpm skills:sync` → meta_state_log_change.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { writeToAllSkills, SURFACES } from "../learning-loop-mastra/core/surfaces.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Data root: default = repo root (derived from the script location). An
// optional positional argv[2] overrides it — REQUIRED by the test fixtures
// (a tmp root with its own manifest + canonical + surfaces) so tests never
// fan out into the live working tree (review C1/C2: cwd is NOT honored —
// repoRoot must never come from process.cwd()).
const repoRoot = process.argv[2]
  ? resolve(process.argv[2])
  : join(__dirname, "..", "..");

const manifestPath = join(repoRoot, "skills-lock.json");

function readManifest() {
  if (!existsSync(manifestPath)) {
    console.error(`[sync-skills] FATAL: ${manifestPath} not found`);
    process.exit(2);
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (err) {
    console.error(`[sync-skills] FATAL: skills-lock.json parse failed: ${err.message}`);
    process.exit(2);
  }
  // Fail closed on malformed shape (review M1): a string/array/null
  // manifest.skills would otherwise iterate into index-keyed garbage and
  // exit 0 having materialized nothing. The contract validator fails
  // closed on the same input; the materializer must too.
  if (!parsed || typeof parsed !== "object" || !parsed.skills || typeof parsed.skills !== "object" || Array.isArray(parsed.skills)) {
    console.error(`[sync-skills] FATAL: skills-lock.json malformed: .skills must be a plain object`);
    process.exit(2);
  }
  // Per-entry shape guard (re-review): a null/non-object entry would crash
  // the entry.external read with a TypeError and a stack trace. Name the
  // offending key and exit 2, matching the contract's fail-closed posture.
  for (const [name, entry] of Object.entries(parsed.skills)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      console.error(`[sync-skills] FATAL: skills-lock.json malformed: .skills["${name}"] must be an object`);
      process.exit(2);
    }
  }
  return parsed;
}

function materializeOne(name, entry) {
  const canonicalRel = entry.canonicalSource;
  if (!canonicalRel) {
    console.error(`[sync-skills] WARN: ${name}: no canonicalSource; skipping`);
    return { ok: true, skipped: true };
  }
  const canonicalAbs = join(repoRoot, canonicalRel);
  if (!existsSync(canonicalAbs)) {
    console.error(`[sync-skills] FATAL: ${name}: canonical source not found at ${canonicalAbs}`);
    return { ok: false, divergent: name, reason: "canonical-missing" };
  }
  const content = readFileSync(canonicalAbs, "utf8");
  const subpath = `${name}/SKILL.md`;
  const results = writeToAllSkills(repoRoot, subpath, content);
  const failed = results.filter((r) => r.action === "failed");
  if (failed.length > 0) {
    return {
      ok: false,
      divergent: failed.map((r) => r.surface),
      reason: failed.map((r) => `${r.surface}: ${r.error}`).join("; "),
      results,
    };
  }
  return { ok: true, results };
}

function postFanOutParityCheck(name, entry) {
  // Re-read all mirrors + canonical; require 3-way byte-identity.
  const canonicalRel = entry.canonicalSource;
  if (!canonicalRel) return { ok: true };
  const canonicalAbs = join(repoRoot, canonicalRel);
  if (!existsSync(canonicalAbs)) return { ok: true };
  const canonicalBytes = readFileSync(canonicalAbs, "utf8");
  const divergent = [];
  for (const surface of SURFACES) {
    const mirrorPath = join(repoRoot, surface, "skills", name, "SKILL.md");
    if (!existsSync(mirrorPath)) {
      divergent.push(`${surface}: mirror missing`);
      continue;
    }
    const mirrorBytes = readFileSync(mirrorPath, "utf8");
    if (mirrorBytes !== canonicalBytes) {
      divergent.push(`${surface}: byte-divergence`);
    }
  }
  if (divergent.length > 0) {
    return { ok: false, divergent };
  }
  return { ok: true };
}

function main() {
  const manifest = readManifest();
  const entries = Object.entries(manifest.skills);
  if (entries.length === 0) {
    console.error(`[sync-skills] FATAL: manifest.skills is empty`);
    process.exit(2);
  }

  let totalWrote = 0;
  let totalUnchanged = 0;
  let totalFailed = 0;
  const divergent = [];

  for (const [name, entry] of entries) {
    if (entry.external === true) {
      console.log(`[sync-skills] skip ${name} (external)`);
      continue;
    }
    const result = materializeOne(name, entry);
    if (!result.ok) {
      totalFailed += 1;
      divergent.push({ name, surfaces: result.divergent, reason: result.reason });
      console.error(`[sync-skills] FAIL ${name}: ${result.reason}`);
      continue;
    }
    if (result.skipped) continue;
    totalWrote += (result.results ?? []).filter((r) => r.action === "wrote").length;
    totalUnchanged += (result.results ?? []).filter((r) => r.action === "unchanged").length;
    const parity = postFanOutParityCheck(name, entry);
    if (!parity.ok) {
      totalFailed += 1;
      divergent.push({ name, surfaces: parity.divergent, reason: "post-fan-out parity" });
      console.error(`[sync-skills] PARITY FAIL ${name}: ${parity.divergent.join(", ")}`);
      continue;
    }
    console.log(`[sync-skills] ok ${name} → ${SURFACES.join(", ")}`);
  }

  if (totalFailed > 0) {
    console.error("");
    console.error(`[sync-skills] FAIL: ${totalFailed} skill(s) diverged.`);
    for (const d of divergent) {
      console.error(`  - ${d.name}: surfaces=${JSON.stringify(d.surfaces)} reason=${d.reason}`);
    }
    process.exit(1);
  }
  console.log(`[sync-skills] done: ${totalWrote} wrote, ${totalUnchanged} unchanged.`);
}

main();
