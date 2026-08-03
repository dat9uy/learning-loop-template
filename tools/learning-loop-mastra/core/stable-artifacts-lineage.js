/**
 * Shared lineage matcher for `rule-no-plan-ids-in-stable-code-artifacts`.
 *
 * Plan-ID / phase-number / finding-code lineage is ephemeral: it belongs in
 * plan docs, cook reports, and git history, not in stable code artifacts
 * (comments, YAML fields, string literals) or commit messages. This module is
 * the single source of truth for the detection patterns so the file-scan
 * regression test and the commit-msg hook cannot drift apart.
 *
 * Two consumers share this matcher:
 *   - __tests__/stable-artifacts-no-plan-ids.test.js (file-scan total ban)
 *   - hooks/commit-msg-stable-artifacts.js (commit-message gate)
 *
 * Durable registry ids (meta-… / rule-… / loop-design-…) are exempt by design:
 * they are durable pointers, not ephemeral lineage, and a plan date-stamp can
 * appear inside an id slug. maskDurableIds masks whole id tokens before
 * matching so the ban targets lineage REFERENCES, never a registry artifact id.
 */

// Six patterns detect plan-ID / phase-number lineage. The first three cover
// plan-ID reference forms (a bare plan path, the narrative "phase N of a plan"
// form, and a date-stamped plan id). The last three ban bare plan/phase
// ordinals and single-letter phase designators — ephemeral plan lineage even
// without a date-stamped id. The concrete reference forms observed in the
// codebase scan are catalogued in the excluded test file (see the synthetic
// true-positive list in stable-artifacts-no-plan-ids.test.js); they are kept
// out of this module so the matcher does not flag its own documentation.
const PATTERNS = [
  /\bplans?\/\d{6}-/i,
  /Phase \d+ of (plan|plans)\b/i,
  /[Pp]lan[- ]\d{6}-\d{4}/,
  /\b[Pp]lans? \d+\b/,
  /\b[Pp]hase[- ]\d+\b/,
  /\b[Pp]hase [A-E]\b/,
];

// Durable registry id token — masked before pattern matching so a finding/rule
// slug that embeds a plan date-stamp does not read as a lineage reference.
const DURABLE_ID_TOKEN = /\b(?:meta|rule|loop-design)-[0-9a-zA-Z][0-9a-zA-Z-]*/g;

function maskDurableIds(line) {
  return line.replace(DURABLE_ID_TOKEN, (m) => m.split("-")[0] + "-<id>");
}

// ── Scan scope (shared by the file-scan test and the write-boundary gate) ────
// The scan covers stable code artifacts under the loop's own tooling tree.
// Three consumers share this scope so they cannot drift apart:
//   - __tests__/stable-artifacts-no-plan-ids.test.js (file-scan total ban)
//   - hooks/commit-msg-stable-artifacts.js (commit-message gate)
//   - core/evaluate-write-gate.js (write-boundary authored-content scan)
// Scan root and extensions are module-private: the shared public seam is
// isScannableArtifactPath, so consumers cannot pick a divergent subset.
const SCAN_ROOT_REL = "tools/learning-loop-mastra";
const SCAN_EXTENSIONS = new Set([".js", ".cjs", ".mjs", ".yaml"]);

/**
 * Path-level exclusions, applied to a path relative to SCAN_ROOT_REL:
 * __tests__/** (legitimate plan-path test fixtures), *.test.js (test code uses
 * plan paths as INPUT data), *.md (docs), *.json (allowlist sidecar).
 */
function isExcludedScanPath(relFromScanRoot) {
  // Match __tests__ as the directory itself, a nested segment, or a leaf.
  if (relFromScanRoot === "__tests__") return true;
  if (relFromScanRoot.startsWith("__tests__/")) return true;
  if (relFromScanRoot.includes("/__tests__/")) return true;
  if (relFromScanRoot.endsWith(".test.js")) return true;
  if (relFromScanRoot.endsWith(".md")) return true;
  if (relFromScanRoot.endsWith(".json")) return true;
  return false;
}

/**
 * Is this repo-root-relative path inside the lineage scan scope? Accepts
 * POSIX-style separators (callers normalize before invoking).
 */
export function isScannableArtifactPath(relFromRepoRoot) {
  const rel = relFromRepoRoot.replace(/\\/g, "/").replace(/^\.\//, "");
  const prefix = SCAN_ROOT_REL + "/";
  if (!rel.startsWith(prefix)) return false;
  const relFromScanRoot = rel.slice(prefix.length);
  if (isExcludedScanPath(relFromScanRoot)) return false;
  const ext = relFromScanRoot.slice(relFromScanRoot.lastIndexOf("."));
  return SCAN_EXTENSIONS.has(ext);
}

/**
 * Find lineage matches in a block of text (a file's contents or a commit
 * message). Returns one entry per offending line with the 1-based line number
 * and the human-readable pattern source(s) that tripped, so callers can report
 * actionable diagnostics without re-running the matcher.
 *
 * @param {string} text — full file contents or commit message.
 * @returns {Array<{ line: number, content: string, patterns: string[] }>}
 */
export function findLineageMatches(text) {
  const hits = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const content = lines[i];
    const masked = maskDurableIds(content);
    const tripped = PATTERNS.filter((p) => p.test(masked)).map((p) => p.source);
    if (tripped.length) {
      hits.push({ line: i + 1, content, patterns: tripped });
    }
  }
  return hits;
}