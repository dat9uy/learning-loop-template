import { z } from "zod";
import { stripEnvelope } from "../../core/envelope-stripper.js";
import { listHints, findHintBySlug, resolveHintText } from "../../core/hint-registry.js";
import { loadPromotedRules } from "../../core/gate-logic.js";
import { resolveRoot } from "#lib/resolve-root.js";

/**
 * Phase 2 (plans/260717-1826-unify-context-injection): HINT_KEY_MAP* and
 * HINT_SUGGESTIONS* are no longer hand-maintained parallel arrays. The slug
 * → entry resolution is derived from the registry at module-load time, and
 * the numeric-index back-compat is preserved by mapping numeric keys to the
 * position-in-kind-filtered order (Validation 4).
 *
 * Code-review C2 fix (plans/260717-1826): resolution is anchored to the
 * FIXED registry order, never to the shrinkable buildProcessHints() output.
 * When a rule-derived entry's rule is missing/inactive, the old code indexed
 * the shrunk array with fixed registry positions — every lookup after the
 * skipped position returned the next entry's hint with this entry's
 * suggestion. Now: numeric index = registry position (stable), slug =
 * registry lookup, text = resolveHintText (same shared path as the
 * renderer), suggestion = the same registry entry's suggestion. A key whose
 * rule is unavailable returns an explicit error instead of wrong content.
 *
 * The derived maps are exported for test inspection; consumers should not
 * depend on the exact shape.
 */
function buildSlugMaps() {
  const discoverability = listHints({ kind: "discoverability" });
  const process = listHints({ kind: "process" });
  const HINT_KEY_MAP = {};
  const HINT_KEY_MAP_PROCESS = {};
  discoverability.forEach((e, i) => { HINT_KEY_MAP[e.slug] = i; });
  process.forEach((e, i) => { HINT_KEY_MAP_PROCESS[e.slug] = i; });
  return { HINT_KEY_MAP, HINT_KEY_MAP_PROCESS };
}

const DERIVED = buildSlugMaps();

const DISCOVERABILITY_ENTRIES = listHints({ kind: "discoverability" });
const PROCESS_ENTRIES = listHints({ kind: "process" });

/**
 * Resolve a hint key against the fixed registry order.
 * Returns { hint, suggestion, source } on success, { unavailable, entry }
 * when the entry exists but its rule cannot supply text, or null when the
 * key is unknown.
 */
function resolveHint(key, rulesById) {
  let entry = null;
  if (typeof key === "string") {
    entry = findHintBySlug(key);
  } else if (typeof key === "number" && Number.isInteger(key) && key >= 0) {
    if (key < DISCOVERABILITY_ENTRIES.length) {
      entry = DISCOVERABILITY_ENTRIES[key];
    } else {
      const procIdx = key - DISCOVERABILITY_ENTRIES.length;
      if (procIdx < PROCESS_ENTRIES.length) entry = PROCESS_ENTRIES[procIdx];
    }
  }
  if (!entry) return null;

  const text = resolveHintText(entry, rulesById);
  if (text === null) {
    return {
      unavailable:
        `rule "${entry.derived_from_rule}" missing, inactive, scope-filtered, ` +
        `or has no hint_text — the hint is not renderable in this session`,
      entry,
    };
  }
  return { hint: text, suggestion: entry.suggestion, source: entry.kind };
}

export const loopGetInstructionTool = {
  name: "loop_get_instruction",
  description: "On-demand lookup for a single loop discoverability hint. Use when you need a hint that was surfaced at session start but has scrolled out of context, or when cross-referencing and you are unsure which canonical pattern applies. Pass `key` as a hint slug, a 0-based index, or an array of slugs/indices. Returns the hint text plus a one-line suggestion.",
  schema: {
    // Wire-format envelope stripper wraps only the array branch so string/number
    // paths stay byte-identical. See meta-260709T1316Z-recurring-mcp-wire-format-coercion-array-fields-silently-coe.
    key: z.union([
      z.string(),
      z.number().int().nonnegative(),
      z.preprocess(stripEnvelope, z.array(z.union([z.string(), z.number().int().nonnegative()]))),
    ]).describe("Hint identifier: named slug, a 0-based index, or array of slugs/indices."),
  },
  handler: async ({ key }) => {
    const keys = Array.isArray(key) ? key : [key];
    // One rule load per call, resolved through the canonical root (GATE_ROOT
    // override in tests) — never from process.cwd().
    const rulesById = new Map(loadPromotedRules(resolveRoot()).map((r) => [r.id, r]));
    const results = [];

    for (const k of keys) {
      const resolved = resolveHint(k, rulesById);
      if (resolved && !resolved.unavailable) {
        results.push({
          key: k,
          index: typeof k === "number"
            ? k
            : (resolved.source === "discoverability"
              ? DERIVED.HINT_KEY_MAP[k]
              : DERIVED.HINT_KEY_MAP_PROCESS[k]),
          hint: resolved.hint,
          suggestion: resolved.suggestion,
          source: resolved.source,
        });
      } else if (resolved && resolved.unavailable) {
        results.push({ key: k, error: `Hint unavailable for key "${k}": ${resolved.unavailable}` });
      } else {
        results.push({ key: k, error: `Unknown hint key: ${k}` });
      }
    }

    return {
      content: [{ type: "text", text: JSON.stringify({ count: results.length, results }, null, 2) }],
    };
  },
};

// Re-export the derived maps for test introspection. Production code should
// not depend on these — use the slug via `findHintBySlug` from the registry.
export const HINT_KEY_MAP = DERIVED.HINT_KEY_MAP;
export const HINT_KEY_MAP_PROCESS = DERIVED.HINT_KEY_MAP_PROCESS;
