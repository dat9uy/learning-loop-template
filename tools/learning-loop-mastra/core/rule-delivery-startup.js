/**
 * Imperative startup/session-start orchestration for native I2 Rule Delivery.
 * Pure selection and formatting remain in rule-delivery.js; shared logging
 * remains in rule-delivery-logging.js.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { readRuleIndex } from "./rule-index.js";
import {
  DEFAULT_DELIVERY_CHAR_BUDGET,
  DeliveryRequestError,
  deliverI2Rules,
  validateDeliveryRequest,
} from "./rule-delivery.js";
import { buildLegacyHintEnvelope } from "./rule-delivery-compat.js";
import { logDeliveryFailure } from "./rule-delivery-logging.js";

function indexDiagnosticsToDeliveryErrors(diagnostics) {
  const errors = [];
  for (const diagnostic of Array.isArray(diagnostics) ? diagnostics : []) {
    if (diagnostic.code === "grounding_unresolved") continue;
    if (diagnostic.code === "invalid_rule") {
      errors.push({
        code: "invalid_rule",
        rule_id: diagnostic.rule_id ?? null,
        message: Array.isArray(diagnostic.issues) && diagnostic.issues.length > 0
          ? diagnostic.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")
          : diagnostic.message ?? "Rule failed index validation",
      });
      continue;
    }
    errors.push({
      code: diagnostic.code,
      rule_id: diagnostic.rule_id ?? null,
      message: diagnostic.message ?? "Registry could not be fully compiled",
    });
  }
  return errors;
}

function mergeStartupErrors(result, indexErrors, root) {
  const onlyEmptyProjection = result.errors.length === 1
    && result.errors[0].code === "no_deliverable_rules";
  if (onlyEmptyProjection && indexErrors.length === 0) {
    // A missing registry cannot prove that no I2 Rule exists. A present and
    // clean registry can prove a legitimate zero-I2 state.
    if (!existsSync(join(root, "meta-state.jsonl"))) return result.errors;
    return [];
  }
  return [...result.errors, ...indexErrors];
}

function runStartupDelivery(root, charBudget, channel, sessionId, sessionTier) {
  const index = readRuleIndex(root);
  const result = deliverI2Rules({ i2Rules: index.i2, charBudget, channel });
  const legacyHintDelivery = buildLegacyHintEnvelope({
    i2Rules: index.i2,
    charBudget,
    channel,
  });
  const errors = mergeStartupErrors(
    result,
    indexDiagnosticsToDeliveryErrors(index.diagnostics),
    root,
  );
  for (const error of errors) {
    logDeliveryFailure(root, {
      ruleId: error.rule_id,
      errorCode: error.code,
      message: error.message,
      sessionId,
      sessionTier,
    });
  }
  return {
    ...result,
    legacy_hint_delivery: legacyHintDelivery,
    status: errors.length === 0 ? "complete" : "degraded",
    errors,
  };
}

/**
 * Read the compiled projection, deliver native I2 Rules, and log every
 * failure. Operational failures degrade visibly; only malformed arguments
 * fail explicitly.
 */
export function deliverRulesAtStartup({
  root,
  charBudget = DEFAULT_DELIVERY_CHAR_BUDGET,
  channel = "native",
  sessionId = null,
  sessionTier = null,
} = {}) {
  if (typeof root !== "string" || root.trim() === "") {
    throw new DeliveryRequestError("root must be a non-empty string");
  }
  validateDeliveryRequest({ i2Rules: [], charBudget, channel });

  try {
    return runStartupDelivery(root, charBudget, channel, sessionId, sessionTier);
  } catch (error) {
    const message = error?.message ?? String(error);
    logDeliveryFailure(root, {
      ruleId: null,
      errorCode: "startup_check_failed",
      message,
      sessionId,
      sessionTier,
    });
    return {
      status: "degraded",
      channel,
      rules: [],
      partitions: [],
      provenance: [],
      warnings: [],
      errors: [{ code: "startup_check_failed", rule_id: null, message }],
    };
  }
}
