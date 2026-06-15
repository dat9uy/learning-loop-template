import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, appendFileSync, unlinkSync } from "node:fs";
import { basename, dirname, join } from "node:path";

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

/**
 * Append a line to all surface coordination files (true append, never overwrites).
 * Creates the parent directory if missing. Best-effort per surface: one
 * failure does not abort the others; errors are logged to stderr.
 * @param {string} root — project root directory
 * @param {string} subpath — relative path under coordination/
 * @param {string} line — content to append (a single line; "\n" is added)
 */
export function appendToAllSurfaces(root, subpath, line) {
  for (const surface of SURFACES) {
    const path = join(root, surface, "coordination", subpath);
    try {
      mkdirSync(dirname(path), { recursive: true });
      appendFileSync(path, `${line}\n`, "utf8");
    } catch (err) {
      // Log only surface + basename (PII-safe: avoids leaking user-derived subpath).
      console.error(`surfaces.appendToAllSurfaces: append to ${surface}/${basename(path)} failed: ${err.message}`);
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
 * The modifier is called once per surface with the current parsed value
 * (or null if missing/malformed) and a context object. The modifier returns
 * the new value (object to write, null/undefined to remove).
 *
 * Atomicity: each surface is atomic (write-temp + rename). Cross-surface
 * consistency is the caller's responsibility (no transaction across surfaces).
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
      console.error(`surfaces.readModifyWriteOnAllSurfaces: modifier for ${surface}/${basename(path)} threw: ${err.message}`);
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
        console.error(`surfaces.readModifyWriteOnAllSurfaces: unlink ${surface}/${basename(path)} failed: ${err.message}`);
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
      console.error(`surfaces.readModifyWriteOnAllSurfaces: write ${surface}/${basename(path)} failed: ${err.message}`);
      results.push({ surface, action: "skipped" });
    }
  }
  return results;
}
