import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, appendFileSync, unlinkSync } from "node:fs";
import { basename, dirname, join } from "node:path";

/**
 * Cross-surface helper — the single source of truth for runtime iteration.
 *
 * To add a new runtime (e.g. Cursor, Aider), append one entry to SURFACES.
 * No other code changes are required: every helper in this module iterates
 * SURFACES, so existing call sites pick up the new runtime automatically.
 *
 * Cross-surface atomicity: per-surface operations are atomic (write-temp +
 * rename for writes, single readFileSync for reads). Cross-surface
 * consistency is the caller's responsibility — there is no transaction
 * spanning surfaces.
 */
export const SURFACES = Object.freeze([".claude", ".factory", ".mastracode"]);

/**
 * Section-aware path generator. Returns the per-surface path for a given
 * section (e.g. "coordination", "skills") and subpath.
 *
 * @example
 * getAllSurfacePaths("coordination", "hooks/bash-gate.js")
 * // => [".claude/coordination/hooks/bash-gate.js", ".factory/coordination/hooks/bash-gate.js", ".mastracode/coordination/hooks/bash-gate.js"]
 *
 * @param {string} section — section name (e.g. "coordination", "skills")
 * @param {string} subpath — relative path under the section
 * @returns {string[]} per-surface paths
 */
export function getAllSurfacePaths(section, subpath) {
  return SURFACES.map((s) => `${s}/${section}/${subpath}`);
}

/**
 * Back-compat wrapper around getAllSurfacePaths("coordination", subpath).
 * Preserves the legacy signature for callers that only know about coordination.
 * @param {string} subpath
 * @returns {string[]}
 */
export function getAllCoordinationPaths(subpath) {
  return getAllSurfacePaths("coordination", subpath);
}

/**
 * Atomic write-temp + rename for every surface, scoped to a section.
 * Best-effort per surface: one failure does not abort the others.
 * Returns a per-surface result array (red-team fix: surface errors are no
 * longer swallowed silently — callers can detect partial-mirror failure).
 *
 * @param {string} root — project root directory
 * @param {string} section — section name (e.g. "coordination", "skills")
 * @param {string} subpath — relative path under the section
 * @param {string} content — file content (string)
 * @returns {Array<{ surface: string, action: "wrote" | "failed", error?: string }>}
 */
export function writeToAllSurfacesSection(root, section, subpath, content) {
  const results = [];
  for (const surface of SURFACES) {
    const dir = join(root, surface, section, dirname(subpath));
    const realPath = join(root, surface, section, subpath);
    const tmpPath = `${realPath}.tmp`;
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(tmpPath, content, "utf8");
      renameSync(tmpPath, realPath);
      results.push({ surface, action: "wrote" });
    } catch (err) {
      results.push({ surface, action: "failed", error: err?.message ?? String(err) });
    }
  }
  return results;
}

/**
 * Back-compat wrapper around writeToAllSurfacesSection(root, "coordination", subpath, content).
 * Returns void to preserve the legacy contract; new callers should use
 * writeToAllSurfacesSection directly (it returns per-surface results).
 *
 * @param {string} root
 * @param {string} subpath
 * @param {string} content
 */
export function writeToAllSurfaces(root, subpath, content) {
  writeToAllSurfacesSection(root, "coordination", subpath, content);
}

/**
 * Skills-section write helper. Returns per-surface results so callers can
 * detect partial-mirror failure (the `learning-loop` mirror fan-out is a
 * critical path; the validator's parity test is the byte-identity backstop).
 *
 * @param {string} root
 * @param {string} subpath — relative path under <surface>/skills/
 * @param {string} content
 * @returns {Array<{ surface: string, action: "wrote" | "failed", error?: string }>}
 */
export function writeToAllSkills(root, subpath, content) {
  return writeToAllSurfacesSection(root, "skills", subpath, content);
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

/**
 * Append a line to all surface coordination files (true append, never overwrites).
 * Creates the parent directory if missing. Best-effort per surface: one
 * failure does not abort the others; errors are logged to stderr.
 * @param {string} root
 * @param {string} subpath
 * @param {string} line
 */
export function appendToAllSurfaces(root, subpath, line) {
  for (const surface of SURFACES) {
    const path = join(root, surface, "coordination", subpath);
    try {
      mkdirSync(dirname(path), { recursive: true });
      appendFileSync(path, `${line}\n`, "utf8");
    } catch (err) {
      // Log only surface + basename (PII-safe: avoids leaking user-derived subpath).
      console.error(`surfaces.appendToAllSurfaces: append to ${surface}/${basename(path)} failed: ${sanitizeErrorMessage(err, path)}`);
    }
  }
}

/**
 * Read JSONL from all surface coordination files, with dedup and sort.
 * Each line of each surface's file is parsed as JSON; malformed lines
 * are skipped. Entries are deduped across surfaces by ts + command_prefix
 * + rule_id + decision (matches the decision log's existing key and avoids
 * dropping distinct decisions that share the first three fields).
 * @param {string} root
 * @param {string} subpath
 * @param {object} options
 * @param {boolean} options.dedupe — default true
 * @param {string|number} options.since — ISO timestamp or epoch ms; default 0 (no filtering)
 * @param {"asc"|"none"} options.sort — default "asc"
 * @returns {Array}
 */
export function readJsonlFromAllSurfaces(root, subpath, options = {}) {
  const { dedupe = true, since = 0, sort = "asc" } = options;
  const sinceMs = typeof since === "string" ? new Date(since).getTime() : since;
  const seen = new Set();
  const entries = [];

  for (const surface of SURFACES) {
    const path = join(root, surface, "coordination", subpath);
    let content;
    try {
      if (!existsSync(path)) continue;
      content = readFileSync(path, "utf8");
    } catch {
      continue;
    }

    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let parsed;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        continue;
      }
      if (sinceMs && new Date(parsed.ts).getTime() < sinceMs) continue;
      if (dedupe) {
        const key = `${parsed.ts}::${parsed.command_prefix ?? ""}::${parsed.rule_id ?? ""}::${parsed.decision ?? ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
      }
      entries.push(parsed);
    }
  }

  if (sort === "asc") {
    entries.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  }
  return entries;
}

/**
 * Per-surface read-modify-write with caller's modifier function.
 *
 * WARNING — atomicity: each surface is atomic (write-temp + rename).
 * Cross-surface consistency is the caller's responsibility; there is
 * NO transaction across surfaces. Callers that need cross-surface
 * atomicity must serialize calls (e.g. via a mutex) at a higher level.
 *
 * The modifier is called once per surface with the current parsed value
 * (or null if missing/malformed) and a context object. The modifier returns
 * the new value (object to write, null/undefined to remove).
 *
 * @param {string} root
 * @param {string} subpath
 * @param {function} modifier — (currentValue) => newValue | null
 * @param {object} [options]
 * @param {boolean} [options.removeOnNull=false] — if true, modifier returning
 *   null/undefined DELETES the existing file. Default false: no-op (safer).
 *   Override only when the caller's semantic explicitly is "remove on null".
 * @returns {Array<{ surface, action: "wrote" | "removed" | "skipped" }>}
 */
export function readModifyWriteOnAllSurfaces(root, subpath, modifier, options = {}) {
  const { removeOnNull = false } = options;
  const results = [];
  for (const surface of SURFACES) {
    const path = join(root, surface, "coordination", subpath);
    let current = null;
    try {
      if (existsSync(path)) {
        const content = readFileSync(path, "utf8");
        try {
          current = JSON.parse(content);
        } catch {
          current = null;
        }
      }
    } catch {
      // Treat as missing.
    }

    let newValue;
    try {
      newValue = modifier(current);
    } catch (err) {
      // Log only surface + basename (PII-safe: avoids leaking user-derived subpath).
      console.error(`surfaces.readModifyWriteOnAllSurfaces: modifier for ${surface}/${basename(path)} threw: ${sanitizeErrorMessage(err, path)}`);
      results.push({ surface, action: "skipped" });
      continue;
    }

    if (newValue == null) {
      if (!removeOnNull) {
        // Default: no-op on null (safer than unlink). Caller opts in to unlink via options.removeOnNull.
        results.push({ surface, action: "skipped" });
        continue;
      }
      try {
        if (existsSync(path)) unlinkSync(path);
        results.push({ surface, action: "removed" });
      } catch (err) {
        console.error(`surfaces.readModifyWriteOnAllSurfaces: unlink ${surface}/${basename(path)} failed: ${sanitizeErrorMessage(err, path)}`);
        results.push({ surface, action: "skipped" });
      }
      continue;
    }

    const content = typeof newValue === "string" ? newValue : JSON.stringify(newValue, null, 2);
    const tmpPath = `${path}.tmp`;
    try {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(tmpPath, content, "utf8");
      renameSync(tmpPath, path);
      results.push({ surface, action: "wrote" });
    } catch (err) {
      console.error(`surfaces.readModifyWriteOnAllSurfaces: write ${surface}/${basename(path)} failed: ${sanitizeErrorMessage(err, path)}`);
      results.push({ surface, action: "skipped" });
    }
  }
  return results;
}

/**
 * Strip the absolute path from an error message when it matches the file we
 * were operating on. Keeps diagnostic context (code, syscall) without leaking
 * user-derived paths. Falls back to the original message if no match.
 *
 * @param {Error} err
 * @param {string} path
 * @returns {string}
 */
function sanitizeErrorMessage(err, path) {
  const msg = err?.message ?? String(err);
  const idx = msg.indexOf(path);
  if (idx >= 0) {
    return msg.slice(0, idx) + "<path>" + msg.slice(idx + path.length);
  }
  return msg;
}
