/**
 * Pure I2 Rule Delivery for agent judgment.
 *
 * This module selects and formats the compiled I2 projection. Startup I/O is
 * in rule-delivery-startup.js, legacy Hint compatibility is in
 * rule-delivery-compat.js, and decision-log writes are in
 * rule-delivery-logging.js.
 */

/** Default per-partition character budget, matching the legacy startup cap. */
export const DEFAULT_DELIVERY_CHAR_BUDGET = 9500;

const MIN_DESCRIPTION_LENGTH = 20;

/** Explicit malformed-request failure. */
export class DeliveryRequestError extends Error {
  constructor(message, { code = "delivery_request_invalid" } = {}) {
    super(message);
    this.name = "DeliveryRequestError";
    this.code = code;
  }
}

function assertNonEmptyString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new DeliveryRequestError(`${name} must be a non-empty string`);
  }
}

/** Validate the structural request shared by native and compatibility paths. */
export function validateDeliveryRequest({ i2Rules, charBudget, channel }) {
  if (!Array.isArray(i2Rules)) {
    throw new DeliveryRequestError(
      "i2Rules must be an array of compiled I2 Rule projection entries",
      { code: "delivery_request_invalid_i2_rules" },
    );
  }
  if (typeof charBudget !== "number" || !Number.isFinite(charBudget) || charBudget <= 0) {
    throw new DeliveryRequestError(
      `charBudget must be a positive finite number, got ${JSON.stringify(charBudget)}`,
      { code: "delivery_request_invalid_char_budget" },
    );
  }
  assertNonEmptyString(channel, "channel");
}

/**
 * Return a typed error for a malformed/non-deliverable Rule candidate.
 * Compiled projections normally satisfy this invariant; the check remains at
 * the delivery boundary so direct callers cannot turn malformed data into a
 * successful delivery with undefined identity or provenance.
 */
export function validateRuleCandidate(rule) {
  if (!rule || typeof rule !== "object" || Array.isArray(rule)) {
    return {
      code: "invalid_rule",
      rule_id: rule?.id ?? null,
      message: "delivery candidate is not a Rule object",
    };
  }
  if (typeof rule.id !== "string" || rule.id.trim() === "") {
    return {
      code: "invalid_rule",
      rule_id: null,
      message: "delivery candidate has no valid Rule id",
    };
  }
  if (rule.entry_kind !== "rule") {
    return {
      code: "invalid_rule",
      rule_id: rule.id,
      message: `delivery candidate ${rule.id} is not a Rule entry`,
    };
  }
  if (rule.internalization_level !== "I2") {
    return {
      code: "not_i2",
      rule_id: rule.id,
      message: `Rule ${rule.id} is not an active I2 Rule and cannot be delivered`,
    };
  }
  if (rule.status !== "active") {
    return {
      code: "inactive_rule",
      rule_id: rule.id,
      message: `Rule ${rule.id} is ${rule.status ?? "unknown"} and cannot be delivered as an active obligation`,
    };
  }
  return null;
}

function selectDeliverableRules(i2Rules) {
  const errors = [];
  const rules = [];
  const seenIds = new Set();
  for (const rule of i2Rules) {
    const candidateError = validateRuleCandidate(rule);
    if (candidateError) {
      errors.push(candidateError);
      continue;
    }
    if (seenIds.has(rule.id)) continue; // index already dedupes by id; defensive
    seenIds.add(rule.id);
    if (
      typeof rule.description !== "string"
      || rule.description.trim().length < MIN_DESCRIPTION_LENGTH
    ) {
      errors.push({
        code: "missing_description",
        rule_id: rule.id,
        message: `Rule ${rule.id} lacks an authoritative description (min ${MIN_DESCRIPTION_LENGTH} chars) for delivery`,
      });
      continue;
    }
    rules.push(rule);
  }
  rules.sort(compareRuleId);
  return { rules, errors };
}

/** Native delivery order: deterministic ascending Rule id. */
function compareRuleId(left, right) {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

/**
 * Shared greedy partitioner for native Rules and the legacy compatibility
 * envelope. No entry is split; an oversized entry remains visible in its own
 * over-budget partition with a structured warning.
 */
export function partitionDeliveryEntries(entries, charBudget, warnings) {
  const partitions = [];
  let current = "";
  for (const entry of entries) {
    const line = `— ${entry.text}\n`;
    if (line.length > charBudget) {
      if (current.length > 0) {
        partitions.push(current);
        current = "";
      }
      partitions.push(line);
      warnings.push({
        code: "oversized_rule",
        rule_id: entry.id,
        message: `Rule ${entry.id} exceeds charBudget (${line.length} > ${charBudget} chars) — emitted as its own over-budget partition`,
      });
    } else if (current.length + line.length > charBudget && current.length > 0) {
      partitions.push(current);
      current = line;
    } else {
      current += line;
    }
  }
  if (current.length > 0) partitions.push(current);
  return partitions;
}

/**
 * Deliver every latest active I2 Rule for agent judgment.
 *
 * @param {object} options
 * @param {Array} options.i2Rules — compiled I2 projection
 * @param {number} [options.charBudget=9500]
 * @param {string} [options.channel="native"]
 * @returns {{ status: "complete"|"degraded", channel: string, rules: Array,
 *   partitions: Array<string>, provenance: Array, errors: Array, warnings: Array }}
 */
export function deliverI2Rules({
  i2Rules,
  charBudget = DEFAULT_DELIVERY_CHAR_BUDGET,
  channel = "native",
} = {}) {
  validateDeliveryRequest({ i2Rules, charBudget, channel });

  const { rules, errors } = selectDeliverableRules(i2Rules);
  const warnings = [];
  const partitions = partitionDeliveryEntries(
    rules.map((rule) => ({ id: rule.id, text: rule.description })),
    charBudget,
    warnings,
  );

  if (rules.length === 0) {
    errors.push({
      code: "no_deliverable_rules",
      rule_id: null,
      message: "no active I2 Rule is available for delivery",
    });
  }

  const provenance = rules.map((rule) => ({
    rule_id: rule.id,
    kind: "rule",
    source: `rule:${rule.id}`,
    channel,
  }));

  return {
    status: errors.length === 0 ? "complete" : "degraded",
    channel,
    rules,
    partitions,
    provenance,
    errors,
    warnings,
  };
}
