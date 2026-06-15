import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

/** The canonical set of supported runtimes. Append a new runtime here. */
export const SURFACES = Object.freeze([".claude", ".factory"]);

/**
 * All coordination-relative paths for a given subpath across all surfaces.
 * @example
 * getAllCoordinationPaths("hooks/bash-gate.js")
 * // => [".claude/coordination/hooks/bash-gate.js", ".factory/coordination/hooks/bash-gate.js"]
 */
export function getAllCoordinationPaths(subpath) {
  return SURFACES.map((s) => `${s}/coordination/${subpath}`);
}

/**
 * Atomic write to all surface coordination directories.
 * Uses write-temp + rename for atomicity. Missing directories are created.
 * Best-effort per surface: one failure does not abort the others.
 * @param {string} root — project root directory
 * @param {string} subpath — relative path under coordination/
 * @param {string} content — file content (string)
 */
export function writeToAllSurfaces(root, subpath, content) {
  for (const surface of SURFACES) {
    const dir = join(root, surface, "coordination", dirname(subpath));
    const realPath = join(root, surface, "coordination", subpath);
    const tmpPath = `${realPath}.tmp`;
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(tmpPath, content, "utf8");
      renameSync(tmpPath, realPath);
    } catch {
      // best-effort: swallow per-surface errors
    }
  }
}

/**
 * Read from all surface coordination directories.
 * Returns an array of { surface, content, parsed } for every surface that has the file.
 * Malformed JSON yields parsed: null. Missing files are omitted.
 * @param {string} root — project root directory
 * @param {string} subpath — relative path under coordination/
 * @param {object} options
 * @param {boolean} options.first — return the first hit only (or null if none)
 * @returns {Array|object|null}
 */
export function readFromAllSurfaces(root, subpath, options = {}) {
  const results = [];
  for (const surface of SURFACES) {
    const path = join(root, surface, "coordination", subpath);
    try {
      if (!existsSync(path)) continue;
      const content = readFileSync(path, "utf8");
      let parsed = null;
      try {
        parsed = JSON.parse(content);
      } catch {
        // malformed JSON: skip this surface
        continue;
      }
      results.push({ surface, content, parsed });
    } catch {
      // best-effort: swallow per-surface errors
    }
  }
  if (options.first) {
    return results[0] ?? null;
  }
  return results;
}
