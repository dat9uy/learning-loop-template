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

import { readFileSync, existsSync, lstatSync, readdirSync, unlinkSync } from "node:fs";
import { createHash } from "node:crypto";
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

function sha256(content) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

// Phase 3 external fan-out (delivery: "npx-per-runtime+fanout-undetected").
// The detected runtime gets real files from `npx skills add --copy`; the
// undetected runtimes get a byte-identical tree fanned out from the detected
// copy. This closes the `.mastracode` (and `.factory` if undetected) gap
// without re-bypassing the provider flow.
//
// F6 hash-verify (load-bearing): the source surface is the one whose
// `<surface>/skills/<name>/SKILL.md` sha256 matches `entry.hash`. A real-dir
// skill whose hash does NOT match the manifest is not a trusted source —
// refuse to fan out from it (defense-in-depth against a tampered detected
// copy or a stale manifest). Missing detected copy → explicit failure
// (not a silent skip), so an empty install is visible.

function findDetectedSurface(name, entry, repoRoot) {
  if (!entry || typeof entry.hash !== "string" || entry.hash.length !== 64) return null;
  for (const surface of SURFACES) {
    const dir = join(repoRoot, surface, "skills", name);
    if (!existsSync(dir)) continue;
    let st;
    try {
      st = lstatSync(dir);
    } catch {
      continue;
    }
    // A symlink is not a detected copy (it's the legacy .agents mechanism or
    // a yet-undetected surface). Only a real dir qualifies as the npx source.
    if (!st.isDirectory() || st.isSymbolicLink()) continue;
    const skillMd = join(dir, "SKILL.md");
    if (!existsSync(skillMd)) continue;
    if (sha256(readFileSync(skillMd, "utf8")) === entry.hash) return surface;
  }
  return null;
}

// Recursively collect real-file relative paths under dir (symlinks skipped —
// external fan-out materializes real files only).
function collectTreeFiles(dir) {
  const out = [];
  (function walk(d, rel) {
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const rp = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory() && !e.isSymbolicLink()) walk(join(d, e.name), rp);
      else if (e.isFile() && !e.isSymbolicLink()) out.push(rp);
    }
  })(dir, "");
  return out;
}

function fanOutExternal(name, entry, repoRoot) {
  const source = findDetectedSurface(name, entry, repoRoot);
  if (!source) {
    return {
      ok: false,
      divergent: [name],
      reason: "no-detected-copy (F6: no surface has a real-dir SKILL.md sha256 matching manifest.hash)",
    };
  }
  const sourceDir = join(repoRoot, source, "skills", name);

  // Remove legacy symlinks at undetected surfaces BEFORE any write. The old
  // `.agents` mechanism left `<surface>/skills/<name>` as a symlink to
  // `.agents/skills/<name>`; writing through it would mutate the soon-to-be-
  // retired source. Probe 2 (2026-07-20) confirmed `npx skills add --copy`
  // atomically replaces the symlink at the detected surface, but the
  // undetected surfaces still carry the legacy symlink until we clear it.
  for (const surface of SURFACES) {
    if (surface === source) continue;
    const dest = join(repoRoot, surface, "skills", name);
    try {
      if (existsSync(dest) && lstatSync(dest).isSymbolicLink()) unlinkSync(dest);
    } catch (err) {
      return { ok: false, divergent: [surface], reason: `unlink legacy symlink: ${err.message}` };
    }
  }

  // Walk the detected tree; fan out each file via writeToAllSkills (atomic
  // write-temp+rename + skipUnchanged idempotence + pid-suffixed tmp). The
  // source surface is a true no-op (skipUnchanged sees byte-equal content);
  // undetected surfaces receive real files. Reusing the engine keeps the
  // cross-surface write contract identical to the internal fan-out.
  const relFiles = collectTreeFiles(sourceDir);
  if (relFiles.length === 0) {
    return { ok: false, divergent: [source], reason: "detected copy has no real files" };
  }
  let wrote = 0;
  let unchanged = 0;
  const failed = {};
  for (const rel of relFiles) {
    const content = readFileSync(join(sourceDir, rel), "utf8");
    const results = writeToAllSkills(repoRoot, `${name}/${rel}`, content);
    for (const r of results) {
      if (r.action === "wrote") wrote += 1;
      else if (r.action === "unchanged") unchanged += 1;
      else if (r.action === "failed") (failed[r.surface] ??= []).push(`${rel}: ${r.error}`);
    }
  }
  const failedSurfaces = Object.keys(failed);
  if (failedSurfaces.length > 0) {
    return {
      ok: false,
      divergent: failedSurfaces,
      reason: failedSurfaces.map((s) => `${s}: ${failed[s].join("; ")}`).join(" | "),
    };
  }
  return { ok: true, source, wrote, unchanged };
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
      // Phase 3: external skills with `fanout-undetected` delivery are fanned
      // out from the detected npx copy to undetected runtimes. External skills
      // without that delivery (e.g. a future global-only install) are skipped.
      if (typeof entry.delivery === "string" && entry.delivery.includes("fanout-undetected")) {
        const result = fanOutExternal(name, entry, repoRoot);
        if (!result.ok) {
          totalFailed += 1;
          divergent.push({ name, surfaces: result.divergent, reason: result.reason });
          console.error(`[sync-skills] FAIL ${name}: ${result.reason}`);
          continue;
        }
        console.log(`[sync-skills] ok ${name} (external fan-out from ${result.source}) → ${SURFACES.join(", ")}`);
      } else {
        console.log(`[sync-skills] skip ${name} (external, no fan-out)`);
      }
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
