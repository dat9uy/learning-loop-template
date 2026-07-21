#!/usr/bin/env node
// bin/loop.mjs — read-only CLI transport for the learning loop (Phase 2 of
// plan 260721-1933-cli-transport-phase1-read-only-slice).
//
// Stateless one-shot wrapper over tools/manifest.json + handler modules. Reuses
// `pinRuntimeIdAtBoot()` + `normalizeInputSchema()` + `adaptLegacyHandler()`
// + `withR2Gate()` so the CLI executes the SAME code path as the MCP server
// for the 7 read-only tools (pathFields: [] → R2 passthrough).
//
// Usage:
//   node bin/loop.mjs list
//   node bin/loop.mjs <tool> '<json-args>'
//
// Exit codes (repo convention per validate-registry-refs.js:240-274):
//   0 — success (result JSON written to stdout)
//   1 — handler error after args validated
//   2 — usage / caller-configuration: no/unknown tool, bad JSON, ZodError,
//       identity-pin preconditions (MISSING/INVALID/MISSING_RUNTIME_MAPPING)
//
// Wrong-root warning: when GATE_ROOT is unset the CLI reads the LOOP'S OWN
// repo (core/gate-logic.js:findProjectRoot walks up from the CLI location, not
// from cwd). A runtime embedding the CLI for a DIFFERENT repo MUST set
// GATE_ROOT, otherwise it silently reads the loop's meta-state with no error.
//
// IMPORTANT: set LOOP_SURFACE before invoking. The CLI inherits the MCP
// server's runtime-pin contract — there is no default.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { pinRuntimeIdAtBoot } from "../core/identity-pin.js";
import { normalizeInputSchema } from "../core/schema-normalize.js";
import { adaptLegacyHandler } from "../mastra/handler-adapter.js";
import { withR2Gate } from "../mastra/with-r2-gate.js";
import { validateToolManifest } from "../core/r2/path-field-detector.js";
import { resolveToolImportUrl } from "../core/manifest-loader.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(__dirname, "..", "tools", "manifest.json");

// Bare names of the tools the CLI exposes. Mirrors the 7 entries the plan
// named; the prefix is an MCP-transport concern (mastra/server.js:42,56).
const READ_ONLY_TOOLS = new Set([
  "loop_describe",
  "loop_get_instruction",
  "meta_state_list",
  "meta_state_relationships",
  "meta_state_derive_status",
  "meta_state_check_grounding",
  "runtime_state_read",
]);

function loadManifest() {
  // JSONC strip (full-line // comments only). See tools/manifest.json header
  // for the rule.
  return JSON.parse(
    readFileSync(MANIFEST_PATH, "utf8").replace(/^\s*\/\/.*$/gm, ""),
  );
}

async function resolveToolByBareName(manifest, bareName) {
  for (const entry of manifest) {
    const mod = await import(resolveToolImportUrl(entry.file));
    const legacy = mod[entry.export];
    if (legacy && legacy.name === bareName) return legacy;
  }
  return null;
}

async function runList() {
  const { listAllTools } = await import("../core/loop-introspect.js");
  // listAllTools reads tools/manifest.json from its own MCP_ROOT (resolved
  // from import.meta.url), so the `root` parameter is only forwarded to
  // downstream consumers — we don't pass it.
  const { tools } = await listAllTools();
  const lines = [];
  for (const tool of tools) {
    if (!READ_ONLY_TOOLS.has(tool.name)) continue;
    const desc = (tool.description ?? "").split("\n")[0];
    lines.push(`${tool.name}  ${desc}`.trimEnd());
  }
  process.stdout.write(lines.join("\n") + "\n");
}

async function runTool(toolName, jsonArgs) {
  if (!READ_ONLY_TOOLS.has(toolName)) {
    throw new UsageError(`unknown read-only tool: ${toolName}`);
  }
  let raw;
  try {
    raw = JSON.parse(jsonArgs);
  } catch (err) {
    throw new UsageError(`invalid JSON: ${err.message}`);
  }
  const manifest = loadManifest();
  validateToolManifest(manifest);
  const legacy = await resolveToolByBareName(manifest, toolName);
  if (!legacy) {
    throw new UsageError(`tool not found in manifest: ${toolName}`);
  }
  const schema = normalizeInputSchema(legacy.schema);
  let args;
  try {
    args = schema.parse(raw ?? {});
  } catch (err) {
    throw new UsageError(`arg validation failed: ${err.message}`);
  }
  const execute = withR2Gate({
    id: toolName,
    execute: adaptLegacyHandler(legacy),
    pathFields: [],
  });
  return await execute(args);
}

class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "UsageError";
  }
}

function isIdentityPinError(err) {
  // Match against the canonical messages from mastra/identity-errors.json
  // (the same set the MCP server catches). Pattern: starts with one of the
  // canonical prefixes.
  if (!err || typeof err.message !== "string") return false;
  return (
    err.message.startsWith("LOOP_SURFACE environment variable is not set") ||
    err.message.startsWith("LOOP_SURFACE='") ||
    err.message.startsWith("No runtime mapping for surface")
  );
}

async function main() {
  // Pin runtime identity first — same LOOP_SURFACE contract as mastra/server.js.
  // Throws synchronously on missing/invalid surface, surfacing as exit 2 in
  // the catch below (per repo convention validate-registry-refs.js:240-274).
  pinRuntimeIdAtBoot();

  const [, , subcommand, jsonArgs] = process.argv;

  if (subcommand === "list") {
    await runList();
    return;
  }

  if (!subcommand) {
    throw new UsageError(`usage: loop.mjs <list|tool> '<json-args>'`);
  }

  if (jsonArgs === undefined) {
    throw new UsageError(`missing JSON args; usage: loop.mjs <tool> '<json>'`);
  }

  const result = await runTool(subcommand, jsonArgs);
  process.stdout.write(JSON.stringify(result) + "\n");
}

main().catch((err) => {
  if (err instanceof UsageError || isIdentityPinError(err)) {
    process.stderr.write(`loop.mjs: ${err.message}\n`);
    process.exit(2);
  }
  process.stderr.write(`loop.mjs: ${err.stack || err.message}\n`);
  process.exit(1);
});