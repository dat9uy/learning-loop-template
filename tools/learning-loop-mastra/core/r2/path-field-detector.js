/**
 * Path-field detector (R3 / Plan 5-Lite Phase 1).
 *
 * Declares which tool args carry WRITE paths so the R2 gate can enforce
 * per-runtime ownership on their VALUES (not on the arg names). Most legacy
 * tools write to FIXED internal paths resolved from non-path args (ids,
 * structured data) — they declare `pathFields: []` and the gate short-
 * circuits to allow for them.
 *
 * `detectPathFields({ tool, args })`:
 *   - Reads `tool.pathFields` (string[]). Each entry is a dotted path into
 *     `args` (e.g. `"metadata.file"` descends into `args.metadata.file`).
 *   - Recursively scans declared paths up to depth 3 (max 3 segments). A
 *     declared path with 4+ segments is ignored (documented limitation —
 *     operators can declare explicit single-segment pathFields for deeper
 *     structures, or refactor the tool's arg shape).
 *   - Leaf values may be a string (one path) or an array of strings
 *     (each element is a path). Arrays of objects are scanned one level
 *     deeper for the remaining segments.
 *   - Default-deny at runtime: if `pathFields` is undefined, throws
 *     `path_fields_undefined_for_tool` (loud failure — the manifest must
 *     declare `pathFields` for every tool at boot).
 *   - Explicit opt-out: `pathFields: []` returns an empty Set (gate allows).
 *
 * `validateToolManifest(manifest)`:
 *   - Throws `path_fields_undefined_for_tool` (naming the offending entry)
 *     if ANY manifest entry lacks a `pathFields` array. Called by
 *     `mastra/server.js` after the manifest is parsed.
 */

const MAX_DEPTH = 3;

/**
 * Collect path-bearing values from `args` along the declared `pathFields`.
 *
 * @param {{ pathFields: string[] }} tool
 * @param {Record<string, unknown>} args
 * @returns {Set<string>} set of write-path string values
 * @throws {Error} path_fields_undefined_for_tool if tool.pathFields is not an array
 */
export function detectPathFields({ tool, args }) {
  const fields = tool?.pathFields;
  if (!Array.isArray(fields)) {
    throw new Error("path_fields_undefined_for_tool");
  }
  const out = new Set();
  for (const field of fields) {
    if (typeof field !== "string") continue;
    const segments = field.split(".");
    if (segments.length > MAX_DEPTH) continue; // depth limit
    collect(args, segments, 0, out);
  }
  return out;
}

function collect(value, segments, depth, out) {
  if (value == null) return;
  if (depth === segments.length) {
    // reached the declared leaf
    addLeaf(value, out);
    return;
  }
  const seg = segments[depth];
  if (Array.isArray(value)) {
    // arrays descend one more level for the next segment on each element
    for (const el of value) {
      if (el == null || typeof el !== "object") continue;
      collect(el[seg], segments, depth + 1, out);
    }
    return;
  }
  if (typeof value !== "object") return;
  collect(value[seg], segments, depth + 1, out);
}

function addLeaf(value, out) {
  if (typeof value === "string") {
    out.add(value);
  } else if (Array.isArray(value)) {
    for (const v of value) {
      if (typeof v === "string") out.add(v);
    }
  }
  // non-string, non-array leaves are ignored
}

/**
 * Validate that every manifest entry declares a `pathFields` array.
 *
 * @param {Array<{ file: string, export: string, pathFields?: string[] }>} manifest
 * @throws {Error} path_fields_undefined_for_tool naming the offending entry
 */
export function validateToolManifest(manifest) {
  for (const entry of manifest) {
    if (!Array.isArray(entry.pathFields)) {
      throw new Error(
        `path_fields_undefined_for_tool: ${entry.file} (export ${entry.export}) — every manifest entry MUST declare a pathFields string[] (use [] for "no write-path args")`,
      );
    }
  }
}