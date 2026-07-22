#!/usr/bin/env node
// Stateless CLI transport for the learning loop.
//
// Wraps tools/manifest.json + handler modules and reuses
// `pinRuntimeIdAtBoot()` + `normalizeInputSchema()` + `adaptLegacyHandler()`
// + `withR2Gate()` so the CLI executes the SAME code path as the MCP server
// for every CLI-portable tool — the 7 read-only tools plus the mutation
// handlers in CLI_WRITE_TOOLS (pathFields: [] → R2 passthrough). When a
// runtime sets `LOOP_RECORDS_VIA_CLI=1` in its mcp.json env, the MCP server
// drops the same set from its surface; the CLI becomes the full record
// transport (reads + portable mutation tools). MCP remains wired for
// workflow / storage / allowlist / audit + the auxiliary read-ish tools.
//
// Usage:
//   node bin/loop.mjs list
//   node bin/loop.mjs <tool> '<json-args>'
//   node bin/loop.mjs <tool> --schema    # pull the normalized input schema
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
// IMPORTANT: set LOOP_SURFACE before invoking a tool. The CLI inherits the
// MCP server's runtime-pin contract — there is no default. `list` is exempt:
// it reads no runtime records and may run before LOOP_SURFACE is configured.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { pinRuntimeIdAtBoot, isIdentityPinError } from "../core/identity-pin.js";
import { normalizeInputSchema } from "../core/schema-normalize.js";
import { adaptLegacyHandler } from "../mastra/handler-adapter.js";
import { withR2Gate } from "../mastra/with-r2-gate.js";
import { validateToolManifest } from "../core/r2/path-field-detector.js";
import { resolveToolImportUrl } from "../core/manifest-loader.js";
import { CLI_TOOLS } from "../core/cli-tools.js";
import { classifyCliError, UsageError } from "../core/cli-stderr.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(__dirname, "..", "tools", "manifest.json");

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
    if (!CLI_TOOLS.has(tool.name)) continue;
    const desc = (tool.description ?? "").split("\n")[0];
    lines.push(`${tool.name}  ${desc}`.trimEnd());
  }
  process.stdout.write(lines.join("\n") + "\n");
}

function parseJsonArg(jsonArgs) {
  try {
    return JSON.parse(jsonArgs);
  } catch (err) {
    throw new UsageError(`invalid JSON: ${err.message}`);
  }
}

function parseSchemaArgs(schema, raw) {
  try {
    return schema.parse(raw ?? {});
  } catch (err) {
    throw new UsageError(`arg validation failed: ${err.message}`);
  }
}

async function resolveToolSchema(toolName) {
  // Shared between runTool and runSchema — both paths load + validate the
  // manifest, resolve the tool's legacy handler by bare name, and normalize
  // its input schema. Extracted to eliminate the duplicate 7-line block
  // that triggered fallow's code-duplication gate (PR #75).
  const manifest = loadManifest();
  validateToolManifest(manifest);
  const legacy = await resolveToolByBareName(manifest, toolName);
  if (!legacy) {
    throw new UsageError(`tool not found in manifest: ${toolName}`);
  }
  const schema = normalizeInputSchema(legacy.schema);
  return { legacy, schema };
}

async function runTool(toolName, jsonArgs) {
  if (!CLI_TOOLS.has(toolName)) {
    throw new UsageError(`unknown tool: ${toolName}`);
  }
  const raw = parseJsonArg(jsonArgs);
  const { legacy, schema } = await resolveToolSchema(toolName);
  const args = parseSchemaArgs(schema, raw);
  const execute = withR2Gate({
    id: toolName,
    execute: adaptLegacyHandler(legacy),
    pathFields: [],
  });
  return await execute(args);
}

// Plan 260722-1343 Phase 3: --schema prints the normalized input schema
// for a CLI-portable tool. Pre-pin (mirrors `list`'s exemption): the
// schema is static and reads no runtime records, so LOOP_SURFACE is not
// required. We use zod's `toJSONSchema` (draft-7) so the output matches
// the model-visible JSON Schema the MCP wire-format exposes — same
// serializer as `mastra/create-loop-tool.js` and `create-loop-workflow.js`.
import { z } from "zod";
async function runSchema(toolName) {
  if (!CLI_TOOLS.has(toolName)) {
    throw new UsageError(`unknown tool: ${toolName} (--schema is only available for CLI-portable tools)`);
  }
  const { schema } = await resolveToolSchema(toolName);
  // zod's toJSONSchema returns a plain object — drop the `_def`/`shape`
  // zod-only fields. The JSON Schema form is what the agent wants for
  // arg composition.
  const jsonSchema = z.toJSONSchema(schema, { target: "draft-7", io: "input" });
  process.stdout.write(JSON.stringify(jsonSchema, null, 2) + "\n");
}

// Sub-dispatchers — each owns one branch of the argv tree so the
// per-function cyclomatic stays low (PR #75: main() CRAP was 56 at
// cyclomatic 7 because subprocess coverage doesn't attribute back).
// `parse*` throws on invalid args (UsageError → exit 2) or returns an
// action descriptor the main switch consumes.

// `list` is a discovery/help command that reads no runtime records, so it
// is exempt from the runtime-pin contract — an operator can list the
// surface before configuring LOOP_SURFACE.
function parseListDispatch(subcommand) {
  if (subcommand === "list") return { kind: "list" };
  return null;
}

// `--schema <tool>` (or `<tool> --schema`) prints the input schema and
// exits 0. Pin-exempt for the same reason as `list`: schema is static,
// reads no runtime records.
function parseSchemaDispatch(subcommand, jsonArgs) {
  if (subcommand === "--schema") {
    if (!jsonArgs) {
      throw new UsageError(`usage: loop.mjs --schema <tool>`);
    }
    return { kind: "schema", tool: jsonArgs };
  }
  if (jsonArgs === "--schema") {
    return { kind: "schema", tool: subcommand };
  }
  return null;
}

// `<tool> '<json-args>'` is the standard invocation path. We validate
// argv shape here so `main()` stays a thin switch.
function parseToolDispatch(subcommand, jsonArgs) {
  if (!subcommand) {
    throw new UsageError(`usage: loop.mjs <list|tool|--schema> '<json-args>'`);
  }
  if (jsonArgs === undefined) {
    throw new UsageError(`missing JSON args; usage: loop.mjs <tool> '<json>'`);
  }
  return { kind: "tool", tool: subcommand, jsonArgs };
}

async function main() {
  const [, , subcommand, jsonArgs] = process.argv;
  // Plain `if` chain (not switch + ??): fallow scores cyclomatic per
  // branching construct, and a 3-arm switch with `??` chain pushes main
  // to cyclomatic 6 → CRAP 42 at 0% subprocess coverage. Three early-return
  // `if`s land at cyclomatic 4 → CRAP 20 (PR #75).
  const listAction = parseListDispatch(subcommand);
  if (listAction) {
    await runList();
    return;
  }
  const schemaAction = parseSchemaDispatch(subcommand, jsonArgs);
  if (schemaAction) {
    await runSchema(schemaAction.tool);
    return;
  }
  // parseToolDispatch throws UsageError on missing args, so reaching here
  // implies a well-formed tool invocation.
  const toolAction = parseToolDispatch(subcommand, jsonArgs);
  // Pin runtime identity before any tool execution — same LOOP_SURFACE
  // contract as mastra/server.js (no default). Throws synchronously on
  // missing/invalid surface, surfacing as exit 2 in the catch below
  // (per repo convention validate-registry-refs.js:240-274).
  pinRuntimeIdAtBoot();
  const result = await runTool(toolAction.tool, toolAction.jsonArgs);
  process.stdout.write(JSON.stringify(result) + "\n");
}

main().catch((err) => {
  // Plan 260722-1343 Phase 2: structured stderr for write-path rejections.
  // The classifier splits the non-usage branch into two shapes so the
  // agent's recovery policy can tell a real rejection from a programmer/
  // transport bug. UsageError + identity-pin stay on the existing exit-2
  // human-readable line.
  const classification = classifyCliError(err);
  if (classification === null) {
    process.stderr.write(`loop.mjs: ${err.message}\n`);
    process.exit(2);
  }
  process.stderr.write(classification.json + "\n");
  process.exit(classification.exitCode);
});