/**
 * Rec 12 change-log bound-paths detection set + change_target canonicalizer.
 *
 * Plan 4: rec12-closed-loop, phase 1. The (b) detection surface for the
 * change-log gap detector — which path-prefixes SHOULD have a change-log on
 * edit + a robust canonicalizer that turns free-text `change_target` +
 * `applies_to.schemas` into a Set<repo-relative path/dir>.
 *
 * Why a sibling of `bound-artifacts.js` (decision 5, red-team M2/UQ3):
 *   - `bound-artifacts.js` is the write-gate constant (its tests pin order +
 *     enforce a no-framework-imports rule). The Rec 12 detection set is a
 *     DIFFERENT concept (which edits *should be logged*) from the gate set
 *     (which writes *are blocked*). Co-locating detection logic in
 *     `bound-artifacts.js` would blur the gate/detection boundary AND
 *     silently change write-gate behavior — out of scope.
 *
 * Canonicalizer robustness (red-team C1/C2/C3, decision 4):
 *   - Strip `#anchor` suffix (`tools/.../gate-logic.js#applyPromotedRules`
 *     → `tools/.../gate-logic.js`).
 *   - Normalize the package-rename so 104 legacy entries count as coverage
 *     instead of surfacing false gaps (the previous package name is the
 *     `OLD_PACKAGE_NAME` constant; the current is `PACKAGE_PREFIX`).
 *   - Repo-relativeize bare loop-internal schemas (tokens starting with
 *     `core/`|`tools/`|`hooks/`|`mastra/` without the `PACKAGE_PREFIX`
 *     package prefix get the prefix prepended).
 *   - Drop tokens without `/` UNLESS they exactly match the top-level
 *     allowlist (AGENTS.md, CONTRACT.md) — bare `meta-state.js` or
 *     `meta-state-finding-categories` are non-path strings (red-team M5).
 *   - Preserve trailing `/` (directory marker) for the prefix-descendant
 *     coverage rule in the gap builder.
 */

import { globMatch } from "./gate-logic.js";

/**
 * Rec 12 detection set — frozen, in the order documented in the plan.
 * Superset of `BOUND_ARTIFACTS` (the gate surface): adds docs/**,
 * tools/learning-loop-mastra/{core,tools,hooks}/**, AGENTS.md, CONTRACT.md,
 * and the three skills-mirror surfaces.
 */
export const CHANGE_LOG_BOUND_PATHS = Object.freeze([
  "docs/**",
  "tools/learning-loop-mastra/core/**",
  "tools/learning-loop-mastra/tools/**",
  "tools/learning-loop-mastra/hooks/**",
  "schemas/**",
  "AGENTS.md",
  "CONTRACT.md",
  ".claude/skills/**",
  ".factory/skills/**",
  ".mastracode/skills/**",
]);

/**
 * Top-level (no `/`) tokens that are valid file paths despite lacking a slash.
 * Each is a known repo-root file owned by the loop. Bare slugs without `/`
 * OR top-level JS/TS files (e.g. `meta-state.js`) are NOT in this set —
 * they are ambiguous (which subdir?) and dropped per red-team M5.
 */
const TOP_LEVEL_FILES = new Set([
  "AGENTS.md",
  "CONTRACT.md",
  "meta-state.jsonl",
  "runtime-state.jsonl",
  "file-index.jsonl",
]);

/** Subdirectories that signal a loop-internal path needing the package prefix. */
const LOOP_INTERNAL_SUBDIRS = ["core/", "tools/", "hooks/", "mastra/"];

/** The package prefix prepended when a bare loop-internal token is seen. */
const PACKAGE_PREFIX = "tools/learning-loop-mastra/";

/**
 * Previous package name (before rename) — held as a constant so the rename
 * logic does not embed the string in two places.
 */
const OLD_PACKAGE_NAME = "learning-loop-mcp";

/**
 * True iff `path` falls under any CHANGE_LOG_BOUND_PATHS prefix. Used by
 * the gap builder (phase 3) as the first filter (a touched path must be
 * under a Rec-12-bound prefix to be a gap candidate at all).
 */
export function isBoundPath(path) {
  if (typeof path !== "string" || path.length === 0) return false;
  return CHANGE_LOG_BOUND_PATHS.some((prefix) => globMatch(prefix, path));
}

/**
 * Strip a `#anchor` suffix from a path token. Returns the bare path.
 * Anchors are not paths; they name functions/symbols/keys within the file.
 * Examples:
 *   "tools/.../gate-logic.js#applyPromotedRules" → "tools/.../gate-logic.js"
 *   "meta-state.jsonl#finding.lifecycle" → "meta-state.jsonl"
 *   "docs/" → "docs/" (unchanged — no `#` present)
 */
function stripAnchor(token) {
  const hashIdx = token.indexOf("#");
  return hashIdx === -1 ? token : token.slice(0, hashIdx);
}

/** New package short-name (without leading `tools/`). Held for symmetry with OLD_PACKAGE_NAME. */
const NEW_PACKAGE_NAME = "learning-loop-mastra";

/**
 * Normalize the package rename. Idempotent: tokens already under the new
 * name pass through unchanged. The replace target preserves length: the
 * old `OLD_PACKAGE_NAME + "/"` substring is swapped for `NEW_PACKAGE_NAME + "/"`
 * (same shape), so the leading `tools/` prefix is preserved on a full
 * `tools/OLD/...` token.
 */
function normalizeMcpRename(token) {
  const oldSubstr = OLD_PACKAGE_NAME + "/";
  if (!token.includes(oldSubstr)) return token;
  const newSubstr = NEW_PACKAGE_NAME + "/";
  return token.replace(
    new RegExp(oldSubstr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
    newSubstr,
  );
}

/**
 * Repo-relativeize a bare loop-internal token. If the token already starts
 * with the package prefix, return unchanged. Otherwise, if it starts with
 * one of the loop-internal subdirs (`core/`, `tools/`, `hooks/`, `mastra/`),
 * prepend the prefix.
 *
 * The early `startsWith(PACKAGE_PREFIX)` guard is load-bearing: a token
 * already under the package (e.g. `tools/learning-loop-mastra/...` after
 * the mcp→mastra rename) must NOT be re-prefixed (which would yield
 * `tools/learning-loop-mastra/tools/learning-loop-mastra/...`).
 *
 * Examples:
 *   "tools/learning-loop-mastra/agent-manifest.json" → unchanged (already prefixed)
 *   "core/meta-state.js" → "tools/learning-loop-mastra/core/meta-state.js"
 *   "hooks/lib/x.js" (already prefixed) → unchanged
 *   "docs/x.md" → unchanged (docs is not a loop-internal subdir)
 */
function repoRelativeize(token) {
  if (token.startsWith(PACKAGE_PREFIX)) return token;
  for (const sub of LOOP_INTERNAL_SUBDIRS) {
    if (token.startsWith(sub)) {
      return PACKAGE_PREFIX + token;
    }
  }
  return token;
}

/**
 * Keep-rule: a token survives iff (a) it contains `/` (a relative path), OR
 * (b) it exactly matches a known top-level file in the allowlist (AGENTS.md,
 * CONTRACT.md, meta-state.jsonl, runtime-state.jsonl, file-index.jsonl).
 * Bare slugs without `/` (e.g. "meta-state-finding-categories",
 * "loop-design-schema-as-source-of-truth-bridge-5-derive-tool-schemas-from")
 * AND bare `*.js`/`.ts` filenames without `/` (e.g. "meta-state.js") are
 * dropped — they are ambiguous or non-paths (red-team M5).
 */
function isKeptToken(token) {
  if (token.includes("/")) return true;
  return TOP_LEVEL_FILES.has(token);
}

/**
 * Canonicalize a single token: strip anchor → normalize rename →
 * repo-relativeize → keep-rule. Returns the canonical token or null if
 * the token is dropped.
 */
function canonicalizeToken(rawToken) {
  if (typeof rawToken !== "string") return null;
  const trimmed = rawToken.trim();
  if (trimmed.length === 0) return null;
  const withoutAnchor = stripAnchor(trimmed);
  const renamed = normalizeMcpRename(withoutAnchor);
  const repoRel = repoRelativeize(renamed);
  return isKeptToken(repoRel) ? repoRel : null;
}

/**
 * Split a compound `change_target` on ` + ` (the registry's compound
 * delimiter — Plan 3 + prior rec-12 evidence shows real entries use this
 * exact whitespace).
 */
function splitCompound(target) {
  return target.split(/\s*\+\s*/);
}

/**
 * Canonicalize a change-log entry's free-text `change_target` (split on
 * ` + `) + `applies_to.schemas` (array) into a Set<repo-relative path/dir>.
 *
 * The set contains paths (e.g. `"docs/loop-engine.md"`) and directory
 * markers (e.g. `"docs/"`). Both forms participate in the gap builder's
 * prefix-descendant coverage rule.
 *
 * @param {object} entry — change-log entry with optional `change_target` and
 *                         `applies_to.schemas`
 * @returns {Set<string>} — canonicalized repo-relative paths/dirs
 */
export function canonicalizeChangeTarget(entry) {
  const result = new Set();
  if (!entry || typeof entry !== "object") return result;

  // change_target — may be compound ("a + b + c") or a single token.
  if (typeof entry.change_target === "string" && entry.change_target.length > 0) {
    for (const raw of splitCompound(entry.change_target)) {
      const canon = canonicalizeToken(raw);
      if (canon !== null) result.add(canon);
    }
  }

  // applies_to.schemas — array of path tokens (or bare loop-internal tokens
  // that need repo-relativeization per red-team C3).
  const schemas = entry?.applies_to?.schemas;
  if (Array.isArray(schemas)) {
    for (const raw of schemas) {
      const canon = canonicalizeToken(raw);
      if (canon !== null) result.add(canon);
    }
  }

  return result;
}