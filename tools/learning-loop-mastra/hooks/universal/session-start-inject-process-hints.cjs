#!/usr/bin/env node
/**
 * Claude Code SessionStart hook: inject PROCESS_HINTS as a system-reminder.
 *
 * Companion to session-start-inject-discoverability.cjs. That hook writes the
 * full sidecar (.claude/session-context.json, both hint sets) and injects the
 * discoverability hints; this hook injects the process hints. The split exists
 * because the SessionStart `hookSpecificOutput.additionalContext` channel is
 * capped at 10k chars and the two hint sets combined (~11.8k) exceed it; each
 * set is under the cap on its own, so both land as full system-reminders.
 *
 * Why a second hook at all: the sidecar has no in-process reader, so without
 * inline injection the agent never sees PROCESS_HINTS row #1 (the test-parsing
 * rule) unless it voluntarily calls loop_describe — the observed regression in
 * session 4760ee34 (4x `pnpm test | grep`). Injecting at SessionStart makes
 * delivery deterministic.
 *
 * Fail-open: a build error emits a degraded marker instead of crashing the
 * session start. The discoverability hook's sidecar remains the audit source
 * for the *_source flags.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { buildProcessPointers } = require("../../core/loop-introspect.js");

const PULL_PATH = "Loop steering (pull): loop_describe({tier:'warm'}) | hints: .claude/session-context.json | one: loop_get_instruction({key})";
const MAX_ADDITIONAL_CONTEXT_CHARS = 10000;
const PROJECT_ROOT = path.resolve(__dirname, "..", "..", "..", "..");

function loadNativeDelivery() {
  return readSidecarDelivery() ?? loadFallbackDelivery();
}

function readSidecarDelivery() {
  try {
    const contextPath = path.join(PROJECT_ROOT, ".claude", "session-context.json");
    const context = JSON.parse(fs.readFileSync(contextPath, "utf8"));
    if (context.i2_rule_delivery && typeof context.i2_rule_delivery === "object") {
      return context.i2_rule_delivery;
    }
  } catch { /* discoverability hook may not have run */ }
  return null;
}

function loadFallbackDelivery() {
  try {
    const { getSessionId } = require("../../core/worktree-session-id.js");
    const { deliverRulesAtStartup } = require("../../core/rule-delivery-startup.js");
    return deliverRulesAtStartup({
      root: PROJECT_ROOT,
      channel: "claude-session-start",
      sessionId: getSessionId(PROJECT_ROOT),
      sessionTier: "fallback",
    });
  } catch (error) {
    return failedFallbackDelivery(error);
  }
}

function failedFallbackDelivery(error) {
  const message = error?.message ?? String(error);
  try {
    require("../../core/rule-delivery-logging.js").logDeliveryFailure(PROJECT_ROOT, {
      ruleId: null, errorCode: "process_hook_failed", message,
    });
  } catch { /* fail-open */ }
  return {
    status: "degraded", channel: "claude-session-start", rules: [], partitions: [],
    provenance: [], errors: [{ code: "process_hook_failed", message }], warnings: [],
  };
}

function formatNativeDelivery(delivery) {
  const lines = [
    `--- native i2 rule delivery (${delivery.status ?? "unknown"}) ---`,
  ];
  lines.push(nativeDeliveryBody(delivery));
  return lines.join("\n");
}

function nativeDeliveryBody(delivery) {
  const partitions = Array.isArray(delivery.partitions) ? delivery.partitions : [];
  return partitions.length > 0 ? partitions.join("\n") : nativeEmptyMessage(delivery);
}

function nativeEmptyMessage(delivery) {
  if (delivery.status === "complete") return "No active I2 Rules are currently registered.";
  const errors = Array.isArray(delivery.errors) ? delivery.errors : [];
  return `Native I2 Rule Delivery is degraded; inspect .claude/session-context.json i2_rule_delivery. ${errors.map((error) => error.code).join(", ")}`;
}

function buildAdditionalContext(processText, nativeText) {
  const combined = `${processText}\n\n${nativeText}`;
  if ([...combined].length <= MAX_ADDITIONAL_CONTEXT_CHARS) return combined;
  return `${processText}\n\n--- native i2 rule delivery (sidecar) ---\nNative delivery exceeds the inline SessionStart budget; the complete typed delivery is in .claude/session-context.json i2_rule_delivery.`;
}

let text;
try {
  if (process.env.SESSION_START_FORCE_PROCESS_HINTS_FAIL === "1") {
    throw new Error("forced process-hints loader failure (SESSION_START_FORCE_PROCESS_HINTS_FAIL=1)");
  }
  const pointers = buildProcessPointers({ tier: "startup" });
  const processText = `${PULL_PATH}\n${pointers.map((h, i) => `${i + 1}. ${h}`).join("\n")}`;
  text = buildAdditionalContext(processText, formatNativeDelivery(loadNativeDelivery()));
} catch (err) {
  console.error(`[session-start][process-hints] build failed: ${err.message}`);
  text = `${PULL_PATH}\nunavailable — process-hints loader degraded (${err.message}); full set in .claude/session-context.json process_hints.\n\nNative I2 Rule Delivery is available in .claude/session-context.json i2_rule_delivery.`;
}

console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: text } }));
process.exit(0);
