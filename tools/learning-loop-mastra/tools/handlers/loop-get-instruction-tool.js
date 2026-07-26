import { z } from "zod";
import { stripEnvelope } from "../../core/envelope-stripper.js";
import { listHints, findHintBySlug, buildProcessView, resolveHintText } from "../../core/hint-registry.js";
import { loadPromotedRules } from "../../core/gate-logic.js";
import { resolveRoot } from "#lib/resolve-root.js";

/**
 * Rebuild the merged view per call (cheap; the MCP server is long-lived and
 * a first-call cache would never invalidate). The view is the canonical
 * source for process-slug AND process-numeric resolution. Discoverability
 * slugs/numbers still resolve against the static registry (no rule-derived
 * path).
 *
 * Numeric keys resolve against the FULL view — never against the shrunk
 * buildProcessHints() output — so a skipped rule's numeric position returns
 * an explicit `unavailable` instead of wrong content.
 */
function resolveHint(key, view, discoverabilityEntries, rulesById) {
  const entry = findEntryForKey(key, view, discoverabilityEntries);
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

/**
 * Look up the registry entry for a key. String keys resolve by slug;
 * numeric keys resolve by position (discoverability first, then the
 * process view). Process slugs are looked up in the merged view (so a
 * backfilled `hint_slug` is honored, and the mirror rows that pre-dated
 * the view migration still resolve).
 */
function findEntryForKey(key, view, discoverabilityEntries) {
  if (typeof key === "string") {
    return lookupBySlug(key, view);
  }
  if (typeof key === "number" && Number.isInteger(key) && key >= 0) {
    return lookupByIndex(key, view, discoverabilityEntries);
  }
  return null;
}

function lookupBySlug(slug, view) {
  // Discoverability uses the static registry. For process slugs, the
  // view is the canonical source (the rule's `hint_slug` may differ
  // from the rule id minus "rule-"). A slug in BOTH is fine: the view
  // row wins for process slugs, so the merge key stays consistent.
  const viewEntry = view.find((e) => e.slug === slug);
  if (viewEntry) return viewEntry;
  return findHintBySlug(slug) ?? null;
}

function lookupByIndex(index, view, discoverabilityEntries) {
  if (index < discoverabilityEntries.length) {
    return discoverabilityEntries[index];
  }
  const procIdx = index - discoverabilityEntries.length;
  return view[procIdx] ?? null;
}

export const loopGetInstructionTool = {
  name: "loop_get_instruction",
  description: "On-demand lookup for a single loop discoverability hint. Use when you need a hint that was surfaced at session start but has scrolled out of context, or when cross-referencing and you are unsure which canonical pattern applies. Pass `key` as a hint slug, a 0-based index, or an array of slugs/indices. Returns the hint text plus a one-line suggestion. **Numeric indices are session-ephemeral**: they follow the current merged view (discoverability entries, then process entries from buildProcessView). Slug keys are the stable lookup contract — they do not renumber when rules are promoted, deactivated, or re-ordered.",
  schema: {
    // Wire-format envelope stripper wraps only the array branch so string/number
    // paths stay byte-identical. See meta-260709T1316Z-recurring-mcp-wire-format-coercion-array-fields-silently-coe.
    key: z.union([
      z.string(),
      z.number().int().nonnegative(),
      z.preprocess(stripEnvelope, z.array(z.union([z.string(), z.number().int().nonnegative()]))),
    ]).describe("Hint identifier: named slug (stable), a 0-based index (session-ephemeral), or array of slugs/indices."),
  },
  handler: async ({ key }) => {
    const keys = Array.isArray(key) ? key : [key];
    // One rule load per call, resolved through the canonical root (GATE_ROOT
    // override in tests) — never from process.cwd().
    const rulesById = new Map(loadPromotedRules(resolveRoot()).map((r) => [r.id, r]));
    const view = buildProcessView({ rulesById });
    const discoverability = listHints({ kind: "discoverability" });
    const results = [];

    for (const k of keys) {
      const resolved = resolveHint(k, view, discoverability, rulesById);
      if (resolved && !resolved.unavailable) {
        // Index projection:
        //   - numeric key: echo the user's index (which IS the view position
        //     for process keys; discoverability is its own offset 0..N-1).
        //   - string slug: project against the discoverability map for
        //     discoverability slugs; against the view for process slugs
        //     (the view position is the canonical "ephemeral" answer).
        let index;
        if (typeof k === "number") {
          index = k;
        } else if (resolved.source === "discoverability") {
          index = discoverability.findIndex((e) => e.slug === k);
        } else {
          index = discoverability.length + view.findIndex((e) => e.slug === k);
        }
        results.push({
          key: k,
          index,
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
