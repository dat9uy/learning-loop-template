/**
 * rule-delivery.js — pure I2 Rule Delivery for agent judgment.
 *
 * This is the Core seam that deterministically delivers every latest active
 * I2 Rule from the compiled projection (see `rule-index.js`). It selects the
 * full I2 set, orders native delivery by Rule id, partitions content under a
 * per-partition char budget, attaches provenance, and returns a typed
 * complete|degraded result. It does NOT encode native runtime envelopes —
 * runtime adapters own that (Runtime interface layer).
 *
 * Malformed delivery requests fail explicitly via `DeliveryRequestError`.
 * Valid requests keep every usable Rule when individual Rules or operational
 * work degrade, but an incomplete or inactive delivery is never reported as
 * successful.
 *
 * Delivery failures are logged through the shared cross-runtime decision-log
 * infrastructure (gate-decision-log.js) under a distinct producer
 * (`event_source: "rule-delivery"`) and event type (`event:
 * "delivery-failure"`). They are NOT gate decisions and NOT unexpected-match
 * events — the recurrence tracker keys delivery failures off their own
 * producer+event pair.
 *
 * ## Legacy Hint compatibility (temporary, one-way)
 *
 * While legacy Hint callers remain, `buildLegacyHintEnvelope` adapts the I2
 * Rule delivery into the legacy Hint envelope shape (slug identity, content,
 * channel, size accounting, budgets, truncation, and observed ordering). It is
 * a one-way adapter: no new runtime may consume Hint vocabulary directly, and
 * this module never reads the legacy envelope back.
 *
 * Deletion condition: the compatibility adapter (and the legacy Hint-shaped
 * rule fields it reads) is removed only after every supported runtime and
 * external caller consumes native Rule Delivery.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { appendDecisionLog } from "./gate-decision-log.js";
import { byOrderThenSlug } from "./hint-registry.js";
import { readRuleIndex } from "./rule-index.js";

/** Decision-log producer marker for Rule Delivery failures. */
export const DELIVERY_PRODUCER = "rule-delivery";

/** Decision-log event type for Rule Delivery failures. */
export const DELIVERY_FAILURE_EVENT = "delivery-failure";

/**
 * Evidence code reference used when a recurring delivery failure is promoted
 * to a Finding without a rule record of its own.
 */
export const DELIVERY_EVIDENCE_REF = "tools/learning-loop-mastra/core/rule-delivery.js";

/** Default per-partition char budget, matching the legacy startup cap. */
const DEFAULT_DELIVERY_CHAR_BUDGET = 9500;

/** Delivery channel name used when the caller does not name one. */
const NATIVE_DELIVERY_CHANNEL = "native";

const MIN_DESCRIPTION_LENGTH = 20;
const LEGACY_DERIVED_KIND = "process";
const LEGACY_DERIVED_TIER = "startup";

/**
 * Explicit malformed-request failure. `deliverI2Rules` throws this for
 * structurally invalid requests (non-array projection, bad budget, bad
 * channel) instead of silently producing an empty or partial result.
 */
// fallow-ignore-next-line unused-export -- the typed malformed-request failure is part of the delivery interface contract; caught by callers and asserted by the delivery tests
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

function validateRequest({ i2Rules, charBudget, channel }) {
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
 * Return the typed invalid-rule error for a delivery candidate, or null when
 * the candidate is a plain object. Shared by the native delivery selection and
 * the compatibility adapter so both surfaces reject malformed candidates with
 * the same error.
 */
function invalidRuleError(rule) {
  if (rule && typeof rule === "object" && !Array.isArray(rule)) return null;
  return {
    code: "invalid_rule",
    rule_id: rule?.id ?? null,
    message: "delivery candidate is not a Rule object",
  };
}

/**
 * Return the typed level/status error for a delivery candidate, or null when
 * the candidate is an active I2 Rule. Shared by the native delivery selection
 * and the compatibility adapter so both surfaces reject non-I2/inactive Rules
 * with the same codes.
 */
function activeI2RuleError(rule) {
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

/**
 * Select + validate every latest active I2 Rule from a compiled projection.
 * Rules that cannot be delivered are skipped with a typed error; the
 * survivors are returned in deterministic Rule-id order. Pure — no I/O.
 *
 * @param {Array} i2Rules — the compiled `index.i2` projection
 * @returns {{ rules: Array, errors: Array }}
 */
// fallow-ignore-next-line complexity -- the per-rule validation ladder (invalid/level/status/description) is the typed-degradation contract
function selectDeliverableRules(i2Rules) {
  const errors = [];
  const rules = [];
  const seenIds = new Set();
  for (const rule of i2Rules) {
    const invalid = invalidRuleError(rule);
    if (invalid) {
      errors.push(invalid);
      continue;
    }
    if (seenIds.has(rule.id)) continue; // index already dedupes by id; defensive
    seenIds.add(rule.id);
    const levelStatus = activeI2RuleError(rule);
    if (levelStatus) {
      errors.push(levelStatus);
      continue;
    }
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
 * Greedy partition under `charBudget`, matching the legacy size accounting
 * (`— <text>\n` lines). No entry is split across partitions; a single
 * oversized entry is emitted as its own over-budget partition and surfaced as
 * a warning so the breach is visible (never silently dropped).
 *
 * @param {Array<{ id: string, text: string }>} entries
 * @param {number} charBudget
 * @param {Array} warnings — shared warning sink
 * @returns {Array<string>}
 */
function greedyPartition(entries, charBudget, warnings) {
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
 * The input is the compiled I2 projection from `readRuleIndex(root).i2` (the
 * index owns history collapse, validation, and grounding). This module owns
 * selection, Rule-id ordering, partition budgets, provenance, and the typed
 * complete|degraded result.
 *
 * @param {object} options
 * @param {Array} options.i2Rules — compiled I2 projection
 * @param {number} [options.charBudget=9500] — per-partition char budget
 * @param {string} [options.channel="native"] — delivery channel name (provenance + envelope routing)
 * @returns {{ status: "complete"|"degraded", channel: string, rules: Array,
 *   partitions: Array<string>, provenance: Array, errors: Array, warnings: Array }}
 * @throws {DeliveryRequestError} on a malformed request
 */
// fallow-ignore-next-line unused-export -- pure I2 delivery seam; deliverRulesAtStartup consumes it in-module, runtime adapters consume it directly once they deliver natively
export function deliverI2Rules({ i2Rules, charBudget = DEFAULT_DELIVERY_CHAR_BUDGET, channel = NATIVE_DELIVERY_CHANNEL } = {}) {
  validateRequest({ i2Rules, charBudget, channel });

  const { rules, errors } = selectDeliverableRules(i2Rules);
  const warnings = [];
  const partitions = greedyPartition(
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

/**
 * Legacy Hint identity for an I2 Rule: the explicit `hint_slug` when present,
 * otherwise the id-derived slug (`rule-` prefix stripped). Mirrors the legacy
 * rule-derived process-view projection.
 */
function legacyHintSlug(rule) {
  return rule.hint_slug ?? rule.id.replace(/^rule-/, "");
}

/**
 * Map one I2 Rule to a legacy Hint envelope entry, preserving legacy
 * identity, content, dedup, and degradation semantics. Returns null (with a
 * typed error or warning pushed) when the Rule cannot enter the envelope.
 */
// fallow-ignore-next-line complexity -- the per-Rule legacy envelope mapping (invalid/level/status/slug/text) is the compatibility contract
function legacyEnvelopeForRule(rule, seenSlugs, warnings, errors) {
  const invalid = invalidRuleError(rule);
  if (invalid) {
    errors.push(invalid);
    return null;
  }
  const levelStatus = activeI2RuleError(rule);
  if (levelStatus) {
    errors.push({
      ...levelStatus,
      message: `${levelStatus.message} and cannot enter the legacy Hint envelope`,
    });
    return null;
  }
  const slug = legacyHintSlug(rule);
  if (seenSlugs.has(slug)) {
    warnings.push(`process hint "${slug}" skipped: slug collides with another rule's slug`);
    return null;
  }
  seenSlugs.add(slug);
  const text = typeof rule.hint_text === "string" && rule.hint_text.trim().length > 0
    ? rule.hint_text
    : typeof rule.description === "string" && rule.description.trim().length >= MIN_DESCRIPTION_LENGTH
      ? rule.description
      : null;
  if (text === null) {
    errors.push({
      code: "missing_description",
      rule_id: rule.id,
      message: `Rule ${rule.id} lacks both a legacy hint_text and an authoritative description for envelope content`,
    });
    return null;
  }
  return {
    slug,
    kind: LEGACY_DERIVED_KIND,
    tier: LEGACY_DERIVED_TIER,
    text,
    suggestion: rule.hint_suggestion ?? "",
    order: rule.hint_order,
    derived_from_rule: rule.id,
  };
}

/**
 * One-way legacy Hint envelope/ordering adapter.
 *
 * While legacy Hint callers remain, this adapts a compiled I2 projection into
 * the legacy Hint envelope shape so their wire contract is preserved:
 *
 *   - identity  — slug (`hint_slug` ?? id-derived)
 *   - content   — legacy `hint_text` when the rule still carries it, else the
 *                 authoritative `description` (the I2 delivered content)
 *   - ordering  — legacy observed order (`hint_order`, absent → append-by-slug)
 *   - size accounting / budgets / truncation — the shared greedy partition
 *   - channel   — passed through for per-channel envelope routing
 *
 * Slug collisions are first-wins with a warning (mirrors the legacy
 * `buildProcessView` skip, never last-wins overwrite). The adapter is one-way:
 * it never reads the legacy envelope back and no new runtime may consume Hint
 * vocabulary directly. Remove it only when every supported runtime and
 * external caller consumes native Rule Delivery.
 *
 * @param {object} options
 * @param {Array} options.i2Rules — compiled I2 projection
 * @param {number} [options.charBudget=9500]
 * @param {string} [options.channel]
 * @returns {{ status: "complete"|"degraded", channel: string, hints: Array,
 *   partitions: Array<string>, provenance: Array, errors: Array, warnings: Array }}
 * @throws {DeliveryRequestError} on a malformed request
 */
// fallow-ignore-next-line unused-export -- temporary one-way compatibility adapter; consumed by the delivery tests and by runtime adapters as they migrate from Hint vocabulary, removed once every supported runtime consumes native Rule Delivery
export function buildLegacyHintEnvelope({ i2Rules, charBudget = DEFAULT_DELIVERY_CHAR_BUDGET, channel = NATIVE_DELIVERY_CHANNEL } = {}) {
  validateRequest({ i2Rules, charBudget, channel });

  const warnings = [];
  const errors = [];
  const hints = [];
  const seenSlugs = new Set();
  for (const rule of i2Rules) {
    const hint = legacyEnvelopeForRule(rule, seenSlugs, warnings, errors);
    if (hint) hints.push(hint);
  }

  hints.sort(byOrderThenSlug);
  const partitions = greedyPartition(hints.map((h) => ({ id: h.slug, text: h.text })), charBudget, warnings);
  const provenance = hints.map((hint) => ({
    slug: hint.slug,
    kind: hint.kind,
    source: `rule:${hint.derived_from_rule}`,
    channel,
  }));

  if (hints.length === 0) {
    errors.push({
      code: "no_deliverable_rules",
      rule_id: null,
      message: "no active I2 Rule is available for the legacy Hint envelope",
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

/**
 * Build one decision-log entry for a Rule Delivery failure.
 *
 * The row carries a distinct producer (`event_source: "rule-delivery"`) and
 * event type (`event: "delivery-failure"`) so it is never mistaken for a gate
 * decision or an unexpected-match event. `command_prefix` carries the
 * `delivery:<error-code>` shape the recurrence tracker groups by; `rule_id`
 * names the failing Rule (or the `rule-delivery` producer when no single Rule
 * failed).
 *
 * Pure — no I/O.
 *
 * @param {object} opts
 * @param {string|null} [opts.ruleId]
 * @param {string} opts.errorCode
 * @param {string} [opts.message]
 * @param {string|null} [opts.sessionId]
 * @param {string|null} [opts.sessionTier]
 * @returns {object} the decision-log row
 */
// fallow-ignore-next-line unused-export -- public decision-log row builder; consumed by logDeliveryFailure in-module, asserted by the logging tests, and reusable by runtime adapters that encode delivery failures
export function buildDeliveryFailureEntry({ ruleId, errorCode, message = "", sessionId = null, sessionTier = null } = {}) {
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
 * Append one Rule Delivery failure to the shared decision log. Fail-open:
 * a logging failure never blocks the caller (appendDecisionLog is already
 * fail-open on I/O). Startup stays fail-open even when logging itself fails.
 *
 * @param {string} root — project root (absolute)
 * @param {object} opts — same shape as `buildDeliveryFailureEntry`
 */
// fallow-ignore-next-line unused-export -- public shared-logging seam; deliverRulesAtStartup consumes it in-module, runtime adapters reuse it when they log delivery failures at their Initial Delivery Point
export function logDeliveryFailure(root, opts) {
  appendDecisionLog(root, buildDeliveryFailureEntry(opts));
}

/**
 * Fold index diagnostics into delivery errors when they can hide an I2 Rule.
 * A Rule rejected at the index never reaches the projection, so without this a
 * startup delivery would report success while silently dropping an obligation.
 * I3-only grounding diagnostics are excluded (they do not affect I2 delivery).
 *
 * @param {Array} diagnostics — `readRuleIndex(root).diagnostics`
 * @returns {Array<{ code: string, rule_id: string|null, message: string }>}
 */
// fallow-ignore-next-line complexity -- maps the two I2-relevant registry diagnostics to typed delivery errors
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

/**
 * Merge delivery + index diagnostics into the startup result, distinguishing a
 * legitimate zero-I2 state from a broken registry:
 *
 *   - A cleanly-compiled registry with no active I2 Rules (no diagnostics) is
 *     a complete delivery of nothing — never a failure, so no recurrence noise
 *     fires on a normal absence of I2 obligations.
 *   - A missing `meta-state.jsonl` cannot be proven to contain no I2 Rules, so
 *     it stays a degraded `no_deliverable_rules` failure.
 *   - Any index diagnostic (a Rule rejected at validation, a malformed
 *     registry line) means the projection cannot be proven complete for I2 —
 *     degraded, with each diagnostic folded into a typed delivery error.
 */
function mergeStartupErrors(result, indexErrors, root) {
  const onlyEmptyProjection = result.errors.length === 1
    && result.errors[0].code === "no_deliverable_rules";
  if (onlyEmptyProjection && indexErrors.length === 0) {
    if (!existsSync(join(root, "meta-state.jsonl"))) return result.errors;
    return [];
  }
  return [...result.errors, ...indexErrors];
}

/**
 * Read the compiled index, deliver the I2 projection, and log every delivery
 * failure. `readRuleIndex` caches by registry mtime/size, so the two reads
 * inside one call are cheap; never cache the index here (a long-lived process
 * must see registry changes between startup invocations).
 */
// fallow-ignore-next-line complexity -- index read, delivery, and per-error logging form one fail-open startup seam
function runStartupDelivery(root, charBudget, channel, sessionId, sessionTier) {
  const index = readRuleIndex(root);
  const result = deliverI2Rules({ i2Rules: index.i2, charBudget, channel });
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
    status: errors.length === 0 ? "complete" : "degraded",
    errors,
  };
}

/**
 * Shared startup/session-start delivery seam (fail-open).
 *
 * Reads the compiled index for `root`, runs native I2 Rule Delivery, logs
 * every delivery failure through the shared decision log under the
 * `rule-delivery` producer, and returns the typed result. Startup remains
 * fail-open: a registry-read or delivery regression degrades the result AND is
 * logged through the shared decision log (never a gate decision and never an
 * unexpected-match event) instead of blocking startup. Only a structurally
 * malformed `root` fails explicitly. Runtime adapters consume this at their
 * Initial Delivery Point; this module does not encode any runtime's native
 * envelope.
 *
 * @param {object} opts
 * @param {string} opts.root — project root (absolute)
 * @param {number} [opts.charBudget=9500]
 * @param {string} [opts.channel="native"]
 * @param {string|null} [opts.sessionId] — session id for recurrence grouping
 * @param {string|null} [opts.sessionTier]
 * @returns {{ status: "complete"|"degraded", channel: string, rules: Array,
 *   partitions: Array, provenance: Array, errors: Array, warnings: Array }}
 * @throws {DeliveryRequestError} on a malformed `root`
 */
export function deliverRulesAtStartup({ root, charBudget = DEFAULT_DELIVERY_CHAR_BUDGET, channel = NATIVE_DELIVERY_CHANNEL, sessionId = null, sessionTier = null } = {}) {
  assertNonEmptyString(root, "root");
  try {
    return runStartupDelivery(root, charBudget, channel, sessionId, sessionTier);
  } catch (err) {
    const message = err?.message ?? String(err);
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
