/**
 * hint-renderer.js — budget-aware channel-based projection of the hint
 * registry. Phase 2 of plans/260717-1826-unify-context-injection.
 *
 * The registry (core/hint-registry.js) is the single source of truth. The
 * renderer projects it into per-channel delivery shapes:
 *
 *   - claude-session-start : 2 partitions (discoverability + process),
 *                            each under the 10k-char additionalContext cap.
 *                            The two .cjs hooks that hand-partitioned the
 *                            10k cap are reduced to renderer clients.
 *   - factory-session-start: single block matching the legacy
 *                            .factory/hooks/loop-surface-inject.cjs shape.
 *   - mcp-warm             : structured JSON array of all 26 hints (used by
 *                            loop_describe warm tier's discoverability_hints).
 *   - sidecar              : session-context.json payload (preserves the
 *                            buildContextPayload shape from the discoverability
 *                            hook).
 *
 * All channels share the greedy partitioning algorithm — no hint is split
 * across partitions, and every partition fits under the requested `charBudget`.
 *
 * `.mastracode` is intentionally NOT a channel here (Validation 1: pull-only).
 */

import { HINT_REGISTRY, listHints } from "./hint-registry.js";

/**
 * Resolve the renderable text for a registry entry.
 *
 * For standalone entries (`derived_from_rule === null`): use the inline text.
 * For rule-derived entries (Phase 3): look up the rule in the supplied
 * `rulesById` map. If the rule exists with `hint_text`, use that. Otherwise
 * skip the entry (return null) AND emit a provenance warning tagged with the
 * missing-rule id, so the operator can see which rule needs backfilling.
 *
 * Pure — `rulesById` is a precomputed map supplied by the caller (avoids I/O
 * on the SessionStart hot path). When the rule resolution is exhaustive and the
 * rule is healthy, `rulesById` is a no-op for standalone entries.
 */
function resolveEntryText(entry, rulesById, warnings) {
  const slug = entry.slug;
  if (entry.derived_from_rule === null || entry.derived_from_rule === undefined) {
    return { slug: entry.slug, kind: entry.kind, source: "core", text: entry.text };
  }
  const rule = rulesById?.get(entry.derived_from_rule);
  if (!rule || !rule.hint_text) {
    if (warnings) {
      warnings.push(`rule-derived hint "${entry.slug}" skipped: rule "${entry.derived_from_rule}" missing or has no hint_text`);
    }
    return null;
  }
  return {
    slug: entry.slug,
    kind: entry.kind,
    source: `rule:${entry.derived_from_rule}`,
    text: rule.hint_text,
  };
}

/**
 * Greedy partition: walk entries, push each into the current partition; when
 * adding the next entry would exceed `charBudget`, close the partition and
 * start a new one. Never splits an entry. Returns `{partitions, provenance}`.
 *
 * Pure — no I/O.
 */
function greedyPartition(entriesWithSource, charBudget) {
  const partitions = [];
  const provenance = [];
  let current = "";

  for (const e of entriesWithSource) {
    if (e === null) continue; // rule-derived skipped
    // Each entry is rendered with leading "— " separator for visual grouping
    // in the sidecar payload and the additionalContext text. We count
    // approximate bytes by JS string length (decoded chars). For ASCII-heavy
    // prose this is identical to byte length; for non-ASCII it slightly
    // undercounts — acceptable for the budget assertion (we stay under the
    // harness cap with margin to spare).
    const line = `— ${e.text}\n`;
    if (current.length + line.length > charBudget && current.length > 0) {
      partitions.push(current);
      current = line;
    } else {
      current += line;
    }
    provenance.push({ slug: e.slug, kind: e.kind, source: e.source });
  }
  if (current.length > 0) partitions.push(current);
  return { partitions, provenance };
}

/**
 * Channel: claude-session-start — 2 partitions (discoverability first,
 * process second). Each partition ≤ charBudget. The renderer produces the
 * full body; the adapter layers a thin JSON envelope around each partition.
 */
function renderClaudeSessionStart(entries, charBudget, rulesById) {
  const warnings = [];
  const discoverability = listHints({ kind: "discoverability" })
    .map((e) => resolveEntryText(e, rulesById, warnings));
  const process = listHints({ kind: "process" })
    .map((e) => resolveEntryText(e, rulesById, warnings));

  const disc = greedyPartition(discoverability, charBudget);
  const proc = greedyPartition(process, charBudget);

  return {
    partitions: [...disc.partitions, ...proc.partitions],
    provenance: [...disc.provenance, ...proc.provenance],
    warnings,
  };
}

/**
 * Channel: factory-session-start — single combined block. Matches the legacy
 * `.factory/hooks/loop-surface-inject.cjs` shape (counts header + both hint
 * sections in one stdout stream). The adapter layer is responsible for
 * prepending the counts header.
 */
function renderFactorySessionStart(entries, _charBudget, rulesById) {
  const warnings = [];
  const all = HINT_REGISTRY
    .map((e) => resolveEntryText(e, rulesById, warnings));
  const { partitions, provenance } = greedyPartition(all, 999999);
  return { partitions, provenance, warnings };
}

/**
 * Channel: sidecar — session-context.json payload. Preserves the
 * buildContextPayload shape from session-start-inject-discoverability.cjs.
 */
function renderSidecar(entries, _charBudget, rulesById) {
  const warnings = [];
  const discoverability = listHints({ kind: "discoverability" })
    .map((e) => resolveEntryText(e, rulesById, warnings))
    .filter((e) => e !== null);
  const process = listHints({ kind: "process" })
    .map((e) => resolveEntryText(e, rulesById, warnings))
    .filter((e) => e !== null);
  const payload = {
    discoverability_hints: discoverability.map((e) => e.text),
    discoverability_hints_source: "core",
    process_hints: process.map((e) => e.text),
    process_hints_source: "core",
  };
  return {
    partitions: [JSON.stringify(payload)],
    provenance: [
      ...discoverability.map((e) => ({ slug: e.slug, kind: e.kind, source: e.source })),
      ...process.map((e) => ({ slug: e.slug, kind: e.kind, source: e.source })),
    ],
    warnings,
  };
}

/**
 * Channel: mcp-warm — structured JSON array of all hints. Consumed by
 * loop_describe warm tier's `discoverability_hints` and `process_hints`
 * blocks. The renderer flattens to one combined array here for the
 * delivery-shape unit test (loop_describe itself fans this out).
 */
function renderMcpWarm(entries, _charBudget, rulesById) {
  const warnings = [];
  const all = HINT_REGISTRY
    .map((e) => resolveEntryText(e, rulesById, warnings))
    .filter((e) => e !== null);
  const arr = all.map((e) => ({
    slug: e.slug,
    kind: e.kind,
    source: e.source,
    text: e.text,
  }));
  return {
    partitions: [JSON.stringify(arr)],
    provenance: all.map((e) => ({ slug: e.slug, kind: e.kind, source: e.source })),
    warnings,
  };
}

const CHANNELS = {
  "claude-session-start": renderClaudeSessionStart,
  "factory-session-start": renderFactorySessionStart,
  "sidecar": renderSidecar,
  "mcp-warm": renderMcpWarm,
};

/**
 * Public entry. Routes to the registered channel renderer.
 *
 * @param {object} options
 * @param {string} options.channel — one of the registered channel names.
 * @param {number} [options.charBudget=9500] — soft byte cap per partition.
 * @param {Map<string, {hint_text: string}>} [options.rulesById] — precomputed
 *   map of active rule.id → rule entry. Used to resolve rule-derived
 *   `text` from `rule.hint_text`. Optional; when omitted, rule-derived
 *   entries are skipped + warnings surface via `result.warnings`.
 * @returns {{partitions: string[], provenance: object[], warnings?: string[]}}
 */
export function renderHints({ channel, charBudget = 9500, rulesById } = {}) {
  const fn = CHANNELS[channel];
  if (!fn) {
    return { partitions: [], provenance: [] };
  }
  return fn(HINT_REGISTRY, charBudget, rulesById);
}

/**
 * Return the list of registered channels. The CLI + tests use this to
 * validate `--channel <name>` arguments and to keep the test inventory in
 * sync with the implementation.
 */
export function listChannels() {
  return Object.keys(CHANNELS);
}
