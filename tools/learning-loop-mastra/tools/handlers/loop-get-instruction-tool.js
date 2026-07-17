import { z } from "zod";
import { stripEnvelope } from "../../core/envelope-stripper.js";
import { buildDiscoverabilityHints, buildProcessHints } from "../../core/loop-introspect.js";
import { HINT_REGISTRY, findHintBySlug } from "../../core/hint-registry.js";

/**
 * Phase 2 (plans/260717-1826-unify-context-injection): HINT_KEY_MAP* and
 * HINT_SUGGESTIONS* are no longer hand-maintained parallel arrays. The slug
 * → entry resolution is derived from the registry at module-load time, and
 * the numeric-index back-compat is preserved by mapping numeric keys to the
 * position-in-kind-filtered order (Validation 4).
 *
 * The derived maps are exported for test inspection; consumers should not
 * depend on the exact shape.
 */
function buildSlugMaps() {
  const discoverability = HINT_REGISTRY.filter((e) => e.kind === "discoverability");
  const process = HINT_REGISTRY.filter((e) => e.kind === "process");
  const HINT_KEY_MAP = {};
  const HINT_KEY_MAP_PROCESS = {};
  const HINT_SUGGESTIONS = [];
  const HINT_SUGGESTIONS_PROCESS = [];
  discoverability.forEach((e, i) => { HINT_KEY_MAP[e.slug] = i; });
  process.forEach((e, i) => { HINT_KEY_MAP_PROCESS[e.slug] = i; });
  HINT_SUGGESTIONS.push(...discoverability.map((e) => e.suggestion));
  HINT_SUGGESTIONS_PROCESS.push(...process.map((e) => e.suggestion));
  return { HINT_KEY_MAP, HINT_KEY_MAP_PROCESS, HINT_SUGGESTIONS, HINT_SUGGESTIONS_PROCESS };
}

const DERIVED = buildSlugMaps();

/**
 * Resolve a hint key by searching both discoverability and process hint maps.
 * Returns { hint, suggestion, source } or null if not found.
 */
function resolveHint(key) {
  const hints = buildDiscoverabilityHints();
  const processHints = buildProcessHints();

  // String key (slug): look up directly in the registry by slug.
  if (typeof key === "string") {
    const entry = findHintBySlug(key);
    if (!entry) return null;
    // Use the canonical builder to get the inline text (Phase 2 back-compat
    // for standalone rows; Phase 3 will route rule-derived rows through
    // `rule.hint_text`).
    const list = entry.kind === "discoverability" ? hints : processHints;
    const idx = entry.kind === "discoverability"
      ? DERIVED.HINT_KEY_MAP[entry.slug]
      : DERIVED.HINT_KEY_MAP_PROCESS[entry.slug];
    return {
      hint: list[idx],
      suggestion: entry.kind === "discoverability"
        ? DERIVED.HINT_SUGGESTIONS[idx]
        : DERIVED.HINT_SUGGESTIONS_PROCESS[idx],
      source: entry.kind,
    };
  }

  // Numeric key: back-compat — index = position in kind-filtered registry order.
  if (typeof key === "number") {
    if (key >= 0 && key < hints.length) {
      return {
        hint: hints[key],
        suggestion: DERIVED.HINT_SUGGESTIONS[key],
        source: "discoverability",
      };
    }
    const procIdx = key - hints.length;
    if (procIdx >= 0 && procIdx < processHints.length) {
      return {
        hint: processHints[procIdx],
        suggestion: DERIVED.HINT_SUGGESTIONS_PROCESS[procIdx],
        source: "process",
      };
    }
    return null;
  }

  return null;
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
    const results = [];

    for (const k of keys) {
      const resolved = resolveHint(k);
      if (resolved) {
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
export const HINT_SUGGESTIONS = DERIVED.HINT_SUGGESTIONS;
export const HINT_SUGGESTIONS_PROCESS = DERIVED.HINT_SUGGESTIONS_PROCESS;