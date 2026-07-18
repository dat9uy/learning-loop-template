/**
 * hint-renderer.js — budget-aware channel-based projection of the hint
 * registry. Phase 2 of plans/260717-1826-unify-context-injection.
 *
 * Positioning (operator decision 2026-07-17, code-review I1): this module is
 * the INSPECTION surface, not the injection path. Production injection runs
 * through core/loop-introspect.js builders (the .claude/.factory hooks and
 * loop_describe consume those directly — they were never converted to
 * renderer clients). The renderer + tools/scripts/hint-render.mjs exist so
 * operators can preview registry content per channel and verify partition
 * budgets without starting a session.
 *
 * The registry (core/hint-registry.js) is the single source of truth. The
 * renderer projects it into per-channel delivery shapes:
 *
 *   - claude-session-start : 2 partitions (discoverability + process),
 *                            each under the 10k-char additionalContext cap.
 *   - factory-session-start: single block matching the legacy
 *                            .factory/hooks/loop-surface-inject.cjs shape.
 *   - mcp-warm             : structured JSON array of all 26 hints.
 *   - sidecar              : session-context.json payload (preserves the
 *                            buildContextPayload shape from the discoverability
 *                            hook).
 *
 * All channels share the greedy partitioning algorithm — no hint is split
 * across partitions, and every partition fits under the requested `charBudget`
 * unless a single hint exceeds it (then: own over-budget partition + warning).
 *
 * `.mastracode` is intentionally NOT a channel here (Validation 1: pull-only).
 */

import { HINT_REGISTRY, listHints, resolveHintText } from "./hint-registry.js";

/**
 * Resolve the renderable text for a registry entry.
 *
 * Delegates the standalone/rule-derived decision to the shared
 * `resolveHintText` (core/hint-registry.js). On a rule-derived miss (rule
 * not in the supplied map — missing, inactive, or scope-filtered — or no
 * `hint_text`), returns null AND emits a provenance warning tagged with the
 * rule id, so the operator can see which rule needs attention.
 *
 * Pure — `rulesById` is a precomputed map supplied by the caller (avoids I/O
 * on the SessionStart hot path).
 */
function resolveEntryText(entry, rulesById, warnings) {
  const text = resolveHintText(entry, rulesById);
  if (text === null) {
    if (warnings) {
      warnings.push(`rule-derived hint "${entry.slug}" skipped: rule "${entry.derived_from_rule}" not in supplied rulesById (missing, inactive, or scope-filtered) or has no hint_text`);
    }
    return null;
  }
  const source = (entry.derived_from_rule === null || entry.derived_from_rule === undefined)
    ? "core"
    : `rule:${entry.derived_from_rule}`;
  return { slug: entry.slug, kind: entry.kind, source, text };
}

/**
 * Greedy partition: walk entries, push each into the current partition; when
 * adding the next entry would exceed `charBudget`, close the partition and
 * start a new one. Never splits an entry. Returns `{partitions, provenance, warnings}`.
 *
 * Budget contract: every partition fits under `charBudget` UNLESS a single
 * hint exceeds it — an oversized hint is emitted as its own over-budget
 * partition (never dropped, never split) AND recorded in `warnings` so the
 * breach is visible (code-review I6: previously silent). `hint_text` has a
 * zod min(20) but no max, so this path is reachable via a verbose promoted
 * rule.
 *
 * Pure — no I/O.
 */
function greedyPartition(entriesWithSource, charBudget, warnings) {
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
    if (line.length > charBudget) {
      // Oversized single hint: own partition, visible warning (never silent).
      if (current.length > 0) {
        partitions.push(current);
        current = "";
      }
      partitions.push(line);
      if (warnings) {
        warnings.push(`hint "${e.slug}" exceeds charBudget (${line.length} > ${charBudget} chars) — emitted as its own over-budget partition`);
      }
    } else if (current.length + line.length > charBudget && current.length > 0) {
      partitions.push(current);
      current = line;
    } else {
      current += line;
    }
    provenance.push({ slug: e.slug, kind: e.kind, source: e.source });
  }
  if (current.length > 0) partitions.push(current);
  return { partitions, provenance, warnings };
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

  const disc = greedyPartition(discoverability, charBudget, warnings);
  const proc = greedyPartition(process, charBudget, warnings);

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
  const { partitions, provenance } = greedyPartition(all, 999999, warnings);
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
 * Channel: mcp-warm — structured JSON array of all hints. An inspection
 * shape for previewing what loop_describe warm tier's hint blocks carry
 * (loop_describe itself reads the builders, not this channel — see the
 * module header: this renderer is not on the injection path).
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
    return { partitions: [], provenance: [], warnings: [`unknown channel: ${channel}`] };
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
