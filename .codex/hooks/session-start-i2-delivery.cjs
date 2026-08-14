#!/usr/bin/env node
"use strict";

/**
 * Codex-owned Initial Delivery adapter.
 *
 * This file is the boundary between Codex's native SessionStart command
 * protocol and Core's protocol-neutral I2 Rule Delivery result. It owns
 * native event parsing and context-envelope encoding; Core owns selection,
 * formatting, and delivery-failure logging.
 */

const fs = require("node:fs");
const path = require("node:path");
const { deliverRulesAtStartup } = require("../../tools/learning-loop-mastra/core/rule-delivery-startup.js");
const { logDeliveryFailure } = require("../../tools/learning-loop-mastra/core/rule-delivery-logging.js");

const ADAPTER_ROOT = path.resolve(__dirname, "..", "..");
const CHANNEL = "codex-session-start";

function complete(value) {
  return { status: "complete", ...value, errors: [] };
}

function degraded(code, message) {
  return { status: "degraded", errors: [{ code, message }] };
}

function incomplete(code, message) {
  return { status: "incomplete", errors: [{ code, message }] };
}

function inactive(code, message) {
  return { status: "inactive", errors: [{ code, message }] };
}

function tomlSection(content, header) {
  const lines = content.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === header);
  if (start === -1) return "";
  const body = lines.slice(start + 1);
  const nextHeader = body.findIndex((line) => line.trimStart().startsWith("["));
  return (nextHeader === -1 ? body : body.slice(0, nextHeader)).join("\n");
}

function inspectRepositoryWiring(adapterRoot = ADAPTER_ROOT) {
  const hooksPath = path.join(adapterRoot, ".codex", "hooks.json");
  const configPath = path.join(adapterRoot, ".codex", "config.toml");
  const adapterPath = path.join(adapterRoot, ".codex", "hooks", "session-start-i2-delivery.cjs");
  const missing = [hooksPath, configPath, adapterPath].filter((file) => !fs.existsSync(file));
  return missing.length === 0
    ? complete({ hooks_path: hooksPath, config_path: configPath, adapter_path: adapterPath })
    : incomplete("wiring_incomplete", `Codex Initial Delivery wiring is incomplete: ${missing.join(", ")}`);
}

function inspectEffectiveActivation(adapterRoot = ADAPTER_ROOT) {
  const hooksPath = path.join(adapterRoot, ".codex", "hooks.json");
  const configPath = path.join(adapterRoot, ".codex", "config.toml");
  let hooks;
  let config;
  try {
    hooks = JSON.parse(fs.readFileSync(hooksPath, "utf8"));
    config = fs.readFileSync(configPath, "utf8");
  } catch (error) {
    return inactive("activation_unavailable", error.message);
  }
  const handlers = Array.isArray(hooks?.hooks?.SessionStart)
    ? hooks.hooks.SessionStart.flatMap((group) => Array.isArray(group?.hooks) ? group.hooks : [])
    : [];
  const handler = handlers.find((entry) => entry?.type === "command"
    && entry.command === "node .codex/hooks/session-start-i2-delivery.cjs");
  if (!handler || handler.async === true) {
    return inactive("initial_delivery_inactive", "Codex SessionStart adapter is missing or asynchronous");
  }
  const mcpSection = tomlSection(config, "[mcp_servers.learning-loop]");
  const envSection = tomlSection(config, "[mcp_servers.learning-loop.env]");
  const serverConfigured = /^command\s*=\s*"node"\s*$/m.test(mcpSection)
    && /args\s*=\s*\[[\s\S]*?tools\/learning-loop-mastra\/mastra\/server\.js[\s\S]*?\]/m.test(mcpSection);
  const runtimeConfigured = /^RUNTIME_ID\s*=\s*"codex"\s*$/m.test(envSection);
  const surfaceConfigured = /^LOOP_SURFACE\s*=\s*"\.codex"\s*$/m.test(envSection);
  if (!serverConfigured || !runtimeConfigured || !surfaceConfigured) {
    return inactive("initial_delivery_inactive", "Codex learning-loop MCP identity is not configured for the .codex surface");
  }
  return { status: "active", hooks_path: hooksPath, config_path: configPath, errors: [] };
}

function parseSessionStart(raw) {
  let input;
  try {
    input = JSON.parse(raw);
  } catch (error) {
    return degraded("invalid_hook_input", error.message);
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return degraded("invalid_hook_input", "Codex SessionStart input must be an object");
  }
  if (input.hook_event_name !== "SessionStart") {
    return { ...degraded("invalid_hook_event", "Codex Initial Delivery only accepts SessionStart events"), input };
  }
  if (typeof input.cwd !== "string" || input.cwd.trim() === "") {
    return { ...degraded("invalid_hook_input", "Codex SessionStart input requires a non-empty cwd"), input };
  }
  if (typeof input.session_id !== "string" || input.session_id.trim() === "") {
    return { ...degraded("invalid_hook_input", "Codex SessionStart input requires a non-empty session_id"), input };
  }
  if (!["startup", "resume", "clear", "compact"].includes(input.source)) {
    return { ...degraded("invalid_hook_input", "Codex SessionStart input has an unsupported source"), input };
  }
  return complete({ input });
}

function deliveryRoot(cwd) {
  let current = path.resolve(cwd);
  while (true) {
    if (fs.existsSync(path.join(current, "meta-state.jsonl")) || fs.existsSync(path.join(current, ".git"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(cwd);
    current = parent;
  }
}

function formatDelivery(delivery) {
  const partitions = Array.isArray(delivery.partitions) ? delivery.partitions : [];
  if (partitions.length > 0) return partitions.join("\n");
  if (delivery.status === "complete") return "No active I2 Rules are currently registered.";
  const codes = Array.isArray(delivery.errors) ? delivery.errors.map((error) => error.code).join(", ") : "unknown";
  return `Codex Initial Delivery is degraded: ${codes}`;
}

function formatContext(result) {
  const statuses = `wiring=${result.wiring.status}; activation=${result.activation.status}; delivery=${result.delivery.status}`;
  return `--- Codex Initial Delivery (${statuses}) ---\n${formatDelivery(result.delivery)}`;
}

function logAdapterFailure(root, error, input) {
  try {
    logDeliveryFailure(root, {
      ruleId: null,
      errorCode: error.code,
      message: error.message,
      sessionId: input?.session_id ?? null,
      sessionTier: input?.source ?? null,
    });
  } catch { /* Startup must remain fail-open even when logging fails. */ }
}

function runCodexInitialDelivery(raw, adapterRoot = ADAPTER_ROOT) {
  const wiring = inspectRepositoryWiring(adapterRoot);
  const activation = inspectEffectiveActivation(adapterRoot);
  const event = parseSessionStart(raw);
  const root = typeof event.input?.cwd === "string" ? deliveryRoot(event.input.cwd) : ADAPTER_ROOT;
  if (wiring.status !== "complete") logAdapterFailure(root, wiring.errors[0], event.input);
  if (activation.status !== "active") logAdapterFailure(root, activation.errors[0], event.input);
  if (wiring.status !== "complete" || activation.status !== "active" || event.status !== "complete") {
    if (event.status !== "complete") logAdapterFailure(root, event.errors[0], event.input);
    const errors = [
      ...(wiring.status === "complete" ? [] : wiring.errors),
      ...(activation.status === "active" ? [] : activation.errors),
      ...(event.status === "complete" ? [] : event.errors),
    ];
    const delivery = {
      status: activation.status === "inactive" ? "inactive" : "incomplete",
      channel: CHANNEL, rules: [], partitions: [], provenance: [], warnings: [], errors,
    };
    return { wiring, activation, event, delivery };
  }

  const delivery = deliverRulesAtStartup({
    root,
    channel: CHANNEL,
    sessionId: event.input.session_id,
    sessionTier: event.input.source,
  });
  return { wiring, activation, event, delivery };
}

function encodeSessionStartContext(result) {
  return {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: formatContext(result),
    },
  };
}

if (require.main === module) {
  let output;
  try {
    output = encodeSessionStartContext(runCodexInitialDelivery(fs.readFileSync(0, "utf8")));
  } catch (error) {
    const delivery = {
      status: "degraded", channel: CHANNEL, rules: [], partitions: [], provenance: [], warnings: [],
      errors: [{ code: "adapter_failed", message: error?.message ?? String(error) }],
    };
    output = encodeSessionStartContext({
      wiring: degraded("adapter_failed", delivery.errors[0].message),
      activation: inactive("adapter_failed", delivery.errors[0].message),
      delivery,
    });
  }
  process.stdout.write(`${JSON.stringify(output)}\n`);
}

module.exports = {
  CHANNEL,
  encodeSessionStartContext,
  inspectEffectiveActivation,
  inspectRepositoryWiring,
  parseSessionStart,
  runCodexInitialDelivery,
};
