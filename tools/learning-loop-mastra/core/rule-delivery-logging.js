/**
 * Shared Rule Delivery failure logging.
 *
 * Delivery failures use their own producer and event pair so the recurrence
 * tracker cannot mistake them for gate decisions or unexpected matches.
 */

import { appendDecisionLog } from "./gate-decision-log.js";

/** Decision-log producer marker for Rule Delivery failures. */
export const DELIVERY_PRODUCER = "rule-delivery";

/** Decision-log event type for Rule Delivery failures. */
export const DELIVERY_FAILURE_EVENT = "delivery-failure";

/** Code location used when a recurring delivery failure becomes a Finding. */
export const DELIVERY_EVIDENCE_REF = "tools/learning-loop-mastra/core/rule-delivery.js";

/**
 * Build one shared decision-log row for a delivery failure.
 *
 * @param {object} opts
 * @param {string|null} [opts.ruleId]
 * @param {string} opts.errorCode
 * @param {string} [opts.message]
 * @param {string|null} [opts.sessionId]
 * @param {string|null} [opts.sessionTier]
 * @returns {object}
 */
function buildDeliveryFailureEntry({
  ruleId,
  errorCode,
  message = "",
  sessionId = null,
  sessionTier = null,
} = {}) {
  return {
    command_prefix: `delivery:${errorCode}`,
    rule_id: ruleId ?? DELIVERY_PRODUCER,
    decision: DELIVERY_FAILURE_EVENT,
    reason: message,
    matched_pattern: "i2-rule-delivery",
    skipped_via_override: false,
    session_id: sessionId,
    session_id_tier: sessionTier,
    event_source: DELIVERY_PRODUCER,
    event: DELIVERY_FAILURE_EVENT,
    error_code: errorCode,
  };
}

/**
 * Append a delivery failure without allowing observability to block startup.
 * The shared writer is already best-effort, but this boundary also protects
 * callers from serialization or filesystem errors raised before the writer's
 * own fail-open path.
 */
export function logDeliveryFailure(root, opts) {
  try {
    appendDecisionLog(root, buildDeliveryFailureEntry(opts));
    return true;
  } catch (error) {
    console.error(`[rule-delivery] failure log unavailable: ${error?.message ?? String(error)}`);
    return false;
  }
}
