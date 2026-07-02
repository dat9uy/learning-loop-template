/**
 * R2 ownership check (F1–F8, R1 / Plan 5-Lite Phase 1).
 *
 * `checkR2Ownership({ runtime, path, allowlist, root })` decides whether a
 * given runtime may write to `path`. The decision cascade:
 *
 *   1. BOOTSTRAP_DENY_PATTERNS — hard-deny writes to `.loop/r2-allowlist.json`,
 *      `runtime-state.jsonl`, and `.gate-override` for ALL runtimes (including
 *      the one that "owns" the file). The hint names `update_r2_allowlist` as
 *      the legitimate edit path (R1 self-bootstrap defense).
 *   2. Normalize the path (`path.resolve(root, userPath)` + `path.normalize`).
 *   3. Allow if it matches `allowlist[runtime].own` OR `allowlist.universal`.
 *   4. Deny if it matches `allowlist[runtime].deny`.
 *   5. Default deny (F3).
 *
 * Glob matching reuses `core/gate-logic.js#globMatch` — it is NOT reimplemented
 * here. The locked semantics (see `__tests__/r2/glob-match.test.js`) note that
 * the double-star-slash pattern requires a slash before X, so
 * BOOTSTRAP_DENY_PATTERNS lists BOTH the bare form and the nested wildcard
 * form for each critical file.
 *
 * Performance: a single in-memory glob match per call (≤0.5ms/call, NF2).
 */

import { resolve as pathResolve, normalize as pathNormalize, relative as pathRelative, sep } from "node:path";
import { globMatch } from "../gate-logic.js";

/**
 * Static hard-deny list evaluated BEFORE the allowlist. Applies to all
 * runtimes. The hint names the `update_r2_allowlist` MCP tool as the
 * legitimate edit path for `.loop/r2-allowlist.json`; `runtime-state.jsonl`
 * and `.gate-override` are operator-controlled.
 */
// Test-only fixture consumed by ownership.test.js (Fallow's ignorePatterns excludes __tests__ consumers).
// fallow-ignore-next-line unused-export
export const BOOTSTRAP_DENY_PATTERNS = Object.freeze([
  ".loop/r2-allowlist.json",
  "**/.loop/r2-allowlist.json",
  "runtime-state.jsonl",
  "**/runtime-state.jsonl",
  ".gate-override",
  "**/.gate-override",
]);

const BOOTSTRAP_HINT =
  "Use the update_r2_allowlist MCP tool to edit .loop/r2-allowlist.json; runtime-state.jsonl and .gate-override are operator-controlled.";

/**
 * Decide whether `runtime` may write to `path`.
 *
 * @param {{ runtime: string, path: string, allowlist: object, root: string }} params
 * @returns {{ allowed: boolean, reason: string, hint?: string, normalized_path?: string }}
 */
// Decision cascade over the per-runtime allowlist + BOOTSTRAP_DENY table; the
// branch count is inherent to the R1/R6 rules. r2/ownership.test.js covers it
// (CRAP drops below threshold with coverage); cyclomatic/cognitive stay high by
// design, so suppress the complexity finding rather than split the cascade.
// fallow-ignore-next-line complexity
export function checkR2Ownership({ runtime, path: userPath, allowlist, root }) {
  // 1. BOOTSTRAP_DENY first (R1).
  for (const pattern of BOOTSTRAP_DENY_PATTERNS) {
    if (globMatch(pattern, userPath)) {
      return { allowed: false, reason: "bootstrap_deny", hint: BOOTSTRAP_HINT, normalized_path: normalize(root, userPath) };
    }
  }

  // 2. Normalize the path.
  const normalized = normalize(root, userPath);
  const rel = toRelative(root, normalized);

  // 3. Allow: own + universal.
  const runtimeEntry = allowlist[runtime];
  if (runtimeEntry && Array.isArray(runtimeEntry.own)) {
    for (const pat of runtimeEntry.own) {
      if (globMatch(pat, rel) || globMatch(pat, normalized)) {
        return { allowed: true, reason: "allow_own", normalized_path: normalized };
      }
    }
  }
  if (Array.isArray(allowlist.universal)) {
    for (const pat of allowlist.universal) {
      if (globMatch(pat, rel) || globMatch(pat, normalized)) {
        return { allowed: true, reason: "allow_universal", normalized_path: normalized };
      }
    }
  }

  // 4. Deny: explicit deny list.
  if (runtimeEntry && Array.isArray(runtimeEntry.deny)) {
    for (const pat of runtimeEntry.deny) {
      if (globMatch(pat, rel) || globMatch(pat, normalized)) {
        return { allowed: false, reason: "deny", normalized_path: normalized };
      }
    }
  }

  // 5. Default deny (F3).
  return { allowed: false, reason: "default_deny", normalized_path: normalized };
}

function normalize(root, userPath) {
  return pathNormalize(pathResolve(root, userPath));
}

function toRelative(root, normalized) {
  if (normalized === root) return ".";
  if (normalized.startsWith(root + sep)) {
    return normalized.slice(root.length + sep.length);
  }
  // Outside root: return as-is so a deny pattern can still match the absolute
  // form if needed. The R2 gate relies on path-containment (Phase 2) to throw
  // before reaching here for escapes; this is defensive.
  return normalized;
}