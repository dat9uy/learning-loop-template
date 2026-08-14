/**
 * Temporary one-way adapter from native I2 Rule projections to the legacy
 * startup process-Hint envelope.
 *
 * The adapter deliberately delegates membership, identity, text resolution,
 * ordering, and tier semantics to the canonical Hint registry. It does not
 * invent Hint rows for non-agent-checklist Rules and never substitutes a Rule
 * description for missing legacy hint_text.
 */

import {
  byOrderThenSlug,
  buildProcessView,
  resolveHintText,
} from "./hint-registry.js";
import {
  DEFAULT_DELIVERY_CHAR_BUDGET,
  partitionDeliveryEntries,
  validateDeliveryRequest,
  validateRuleCandidate,
} from "./rule-delivery.js";

const LEGACY_STARTUP_TIER = "startup";

/**
 * Build the legacy startup process-Hint envelope with exact legacy parity.
 *
 * @param {object} options
 * @param {Array} options.i2Rules — compiled active I2 projection
 * @param {number} [options.charBudget=9500]
 * @param {string} [options.channel="native"]
 * @returns {{ status: "complete"|"degraded", channel: string, hints: Array,
 *   partitions: Array<string>, provenance: Array, errors: Array, warnings: Array }}
 */
export function buildLegacyHintEnvelope({
  i2Rules,
  charBudget = DEFAULT_DELIVERY_CHAR_BUDGET,
  channel = "native",
} = {}) {
  validateDeliveryRequest({ i2Rules, charBudget, channel });

  const warnings = [];
  const errors = [];
  const rulesById = new Map();

  for (const rule of i2Rules) {
    const candidateError = validateRuleCandidate(rule);
    if (candidateError) {
      errors.push(candidateError);
      continue;
    }
    rulesById.set(rule.id, rule);
  }

  // This is the exact legacy membership and ordering source. Generated rows
  // are only agent-checklist Rules, and the startup tier excludes the two
  // on-demand standalone process rows.
  const processView = buildProcessView({ rulesById, warnings })
    .filter((entry) => (entry.tier ?? LEGACY_STARTUP_TIER) === LEGACY_STARTUP_TIER);

  const hints = [];
  for (const entry of processView) {
    const text = resolveHintText(entry, rulesById);
    if (text === null || typeof text !== "string" || text.trim() === "") {
      errors.push({
        code: "missing_hint_text",
        rule_id: entry.derived_from_rule ?? null,
        message: `legacy Hint ${entry.slug} has no usable hint_text`,
      });
      continue;
    }
    hints.push({ ...entry, text });
  }

  hints.sort(byOrderThenSlug);
  const partitions = partitionDeliveryEntries(
    hints.map((hint) => ({ id: hint.slug, text: hint.text })),
    charBudget,
    warnings,
  );
  const provenance = hints.map((hint) => ({
    slug: hint.slug,
    kind: hint.kind,
    source: hint.derived_from_rule == null ? "core" : `rule:${hint.derived_from_rule}`,
    channel,
  }));

  if (hints.length === 0) {
    errors.push({
      code: "no_deliverable_hints",
      rule_id: null,
      message: "no active startup process Hint is available for the legacy envelope",
    });
  }

  return {
    status: errors.length === 0 ? "complete" : "degraded",
    channel,
    hints,
    partitions,
    provenance,
    errors,
    warnings,
  };
}
