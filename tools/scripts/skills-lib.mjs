#!/usr/bin/env node
/**
 * tools/scripts/skills-lib.mjs — shared helpers for skills CLI scripts.
 *
 * Consumed by sync-skills.mjs (DRY refactor) and normalize-skills.mjs (Phase 2).
 * Pure functions only — no file I/O for the manifest. Callers handle read/write.
 */

import { existsSync, lstatSync, statSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

import { SURFACES } from "../learning-loop-mastra/core/surfaces.js";

export { SURFACES };

/**
 * sha256 of a UTF-8 string, hex digest.
 * @param {string} content
 * @returns {string} 64-char hex
 */
export function sha256(content) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * Find the surface whose `<surface>/skills/<name>/SKILL.md` is a real dir (not
 * a symlink) and matches `entry.hash`. Used by sync-skills.mjs for F6 hash-verify.
 * Pure read; no mutation.
 * @param {string} name
 * @param {{ hash?: string }} entry
 * @param {string} repoRoot
 * @returns {string|null} the surface name (e.g. ".claude") or null if none matches
 */
export function findDetectedSurface(name, entry, repoRoot) {
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
    if (!st.isDirectory() || st.isSymbolicLink()) continue;
    const skillMd = join(dir, "SKILL.md");
    if (!existsSync(skillMd)) continue;
    if (sha256(readFileSync(skillMd, "utf8")) === entry.hash) return surface;
  }
  return null;
}

/**
 * Loop-owned extended fields for policy-known external skills. The lockfile
 * entry is replaced from this table on normalize (full replacement from
 * policy); npx's non-loop fields (e.g. `computedHash`) are not preserved on
 * the external entry -- the loop's v2 schema is canonical for externals.
 *
 * To add a 2nd external skill: append one entry here. No other code changes
 * required -- sync-skills.mjs already routes externals through delivery-based
 * fan-out, and normalize-skills picks up the new policy entry automatically.
 */
export const EXTERNAL_POLICY = Object.freeze({
  mastra: {
    source: "mastra-ai/skills",
    sourceType: "npx-skills-cli",
    delivery: "npx-per-runtime+fanout-undetected",
    skillPath: "skills/mastra/SKILL.md",
    targets: SURFACES, // [".claude", ".factory", ".mastracode"]
    maturity: null,
    external: true,
    // hash: derived in normalizeManifest (not policy)
  },
});

/**
 * Detect the canonical SHA-256 of a policy-known external skill after `npx`
 * has clobbered the manifest. `computedHash` (npx's native field) is opaque --
 * it is NOT `sha256(SKILL.md)` (Phase 1 probe verified empirically). We derive
 * the trust-anchor hash by reading the installed files.
 *
 * Heuristic: the detected surface is the one most-recently written to. We pick
 * the SKILL.md with the highest `mtimeMs` across the 3 surfaces (symlinks +
 * missing skipped -- only real-dir SKILL.md qualifies). This handles both
 * realistic npx flows without ambiguity:
 *   - `npx update` writes to .claude + .factory within ~1ms of each other;
 *     either wins (same content -> same hash).
 *   - `npx add -a claude-code` writes only to .claude; .claude's mtime is
 *     freshly bumped, .factory + .mastracode carry older mtimes from the last
 *     `pnpm skills:sync`. .claude wins even though the stale surfaces share
 *     the same old content (which would otherwise form a 2-member cluster that
 *     beats the fresh singleton under naive majority-rule).
 *   - All surfaces equal (initial sync, no npx yet) -> any wins (same content);
 *     normalize is a no-op since the manifest entry already matches.
 *
 * Caveat: mtime cannot distinguish operator-edited vs npx-installed content.
 * In this skill-management context the only writes to
 * `<surface>/skills/<n>/SKILL.md` are `npx skills add/update` and
 * `sync-skills` materializer fan-outs -- both intended channels. A manual
 * operator edit to SKILL.md would also be picked up; that's the safer default
 * (operator edits ARE the canonical content).
 *
 * Assumption: npx writes installed files with wall-clock mtime (empirically
 * verified in the 2026-07-20 probe -- detected surfaces carry the probe-run
 * timestamp, NOT an preserved upstream timestamp). If npx ever switches to
 * preserving upstream mtimes, the freshest-mtime surface would be a stale
 * one and this heuristic would pick wrong; a content-cluster approach (largest
 * byte-equal SKILL.md group) would be the robust fallback.
 *
 * @param {string} name
 * @param {string} repoRoot
 * @returns {{ hash: string|null, reason: string|null }}
 */
function detectExternalHash(name, repoRoot) {
  let best = null;
  for (const surface of SURFACES) {
    const dir = join(repoRoot, surface, "skills", name);
    const skillMd = join(dir, "SKILL.md");
    if (!existsSync(skillMd)) continue;
    let st;
    try {
      st = lstatSync(dir);
    } catch {
      continue;
    }
    if (!st.isDirectory() || st.isSymbolicLink()) continue;
    let statSkill;
    try {
      statSkill = statSync(skillMd);
    } catch {
      continue;
    }
    const hash = sha256(readFileSync(skillMd, "utf8"));
    if (!best || statSkill.mtimeMs > best.mtime) {
      best = { surface, hash, mtime: statSkill.mtimeMs };
    }
  }
  if (!best) return { hash: null, reason: "no real-dir SKILL.md found on any surface" };
  return { hash: best.hash, reason: null };
}

/**
 * Deep-equal for plain JSON values (object/array/scalar/null).
 * @param {*} a
 * @param {*} b
 * @returns {boolean}
 */
function jsonEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (typeof a !== "object") return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => jsonEqual(v, b[i]));
  }
  if (Array.isArray(b)) return false;
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  return ak.every((k) => jsonEqual(a[k], b[k]));
}

function entryEqual(a, b) {
  return jsonEqual(a, b);
}

/**
 * Pure: take a parsed manifest + repo root, return the normalized manifest
 * (v2 extended schema restored for policy-known externals; internal entries
 * + version preserved verbatim; unknown entries copied verbatim) + a
 * `changed` flag indicating whether any field differs from the input.
 *
 * Surgical: only loop-owned fields + hash are touched on policy-known externals.
 * Internal entries and unknown externals are byte-copied (no normalization).
 *
 * Errors are returned in `error` (string). On error, `changed` is false and
 * `manifest` is the input (no mutation).
 *
 * @param {object} parsed
 * @param {string} repoRoot
 * @returns {{ manifest: object, changed: boolean, error?: string, restoredExternals?: string[] }}
 */
export function normalizeManifest(parsed, repoRoot) {
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !parsed.skills ||
    typeof parsed.skills !== "object" ||
    Array.isArray(parsed.skills)
  ) {
    return { manifest: parsed, changed: false, error: ".skills must be a plain object" };
  }
  // Per-entry shape guard (fail-loud, matching sync-skills.mjs).
  for (const [name, entry] of Object.entries(parsed.skills)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return { manifest: parsed, changed: false, error: `.skills["${name}"] must be an object` };
    }
  }

  // Preserve unknown top-level keys (e.g. a future `$schema` or `meta` field)
  // by spreading the parsed manifest first, then forcing version:2 and
  // rebuilding skills. Without this, normalize would silently drop any
  // top-level field outside {version, skills} on every heal.
  const next = { ...parsed, version: 2, skills: {} };
  const restoredExternals = [];
  let changed = parsed.version !== 2;

  // Process policy-known externals first (replace from policy + re-derive hash).
  for (const [name, policy] of Object.entries(EXTERNAL_POLICY)) {
    if (!(name in parsed.skills)) continue;
    const detected = detectExternalHash(name, repoRoot);
    if (detected.reason) {
      return {
        manifest: parsed,
        changed: false,
        error: `normalize ${name}: ${detected.reason}`,
      };
    }
    const replaced = { ...policy, hash: detected.hash };
    next.skills[name] = replaced;
    if (!entryEqual(parsed.skills[name], replaced)) {
      changed = true;
      restoredExternals.push(name);
    }
  }

  // Copy internal entries + unknown entries verbatim (no normalization).
  for (const [name, entry] of Object.entries(parsed.skills)) {
    if (name in next.skills) continue; // already handled (policy-external)
    next.skills[name] = { ...entry };
  }

  return { manifest: next, changed, restoredExternals };
}
