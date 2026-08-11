#!/usr/bin/env node
// Stateless CLI transport for the learning loop — the single record surface.
//
// Wraps tools/manifest.json + handler modules and reuses
// `pinRuntimeIdAtBoot()` + `normalizeInputSchema()` + `adaptLegacyHandler()`
// + `withR2Gate()` so the CLI executes the SAME code path as the MCP server
// for every CLI-portable tool — the CLI_READ_TOOLS set plus the mutation
// handlers in CLI_WRITE_TOOLS (pathFields: [] → R2 passthrough). The CLI is
// the full record transport (reads + portable mutation tools) in every
// runtime; MCP carries only the irreducible residue (see core/cli-tools.js +
// cli-write-tool-set-drift.test.js).
//
// Usage:
//   node bin/loop.mjs list
//   node bin/loop.mjs <tool> '<json-args>'
//   node bin/loop.mjs <tool> --args-file <path>   # read JSON args from a file
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

// Detects the bare-key shape (`{surface:"x"}` — an unquoted key after `{` or
// `,`). Runs only on the JSON.parse SyntaxError path, so valid JSON never
// reaches it; a match means the caller very likely wrote JS-object literal
// syntax and the fix is quoting the keys.
function looksLikeBareKeyJson(raw) {
  return /[{,]\s*[A-Za-z_][A-Za-z0-9_]*\s*:/.test(raw);
}

function parseJsonArg(jsonArgs) {
  try {
    return JSON.parse(jsonArgs);
  } catch (err) {
    if (err instanceof SyntaxError && looksLikeBareKeyJson(jsonArgs)) {
      // Quote the bare keys to show the caller the exact fixed shape.
      const fixed = jsonArgs.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3');
      throw new UsageError(
        `invalid JSON: ${err.message}\nhint: JSON requires quoted keys — use ${fixed} not ${jsonArgs}`,
      );
    }
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

// --schema prints the normalized input schema
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

// Read the JSON payload file. Mirrors the inline path: anything other
// than a clean UTF-8 read is a UsageError (exit 2) so the agent sees a
// caller-side problem, not a handler error. We do not print file
// contents to keep error messages free of payload leakage.
function loadArgsFile(path) {
  let content;
  try {
    content = readFileSync(path, "utf8");
  } catch (err) {
    throw new UsageError(`cannot read args file ${path}: ${err.code ?? err.message}`);
  }
  if (content.trim() === "") {
    throw new UsageError(`empty args file: ${path}`);
  }
  return content;
}

// Validate the operands of `<tool> --args-file <path>`. Kept under
// cyclomatic 4 (CRAP 20 at 0% subprocess coverage) like main() — the
// file form is exercised via subprocess tests fallow cannot attribute.
function requireArgsFilePath(subcommand, path, argc) {
  if (!path) {
    throw new UsageError(`usage: loop.mjs ${subcommand} --args-file <path>`);
  }
  if (argc > 5) {
    throw new UsageError(`too many arguments for --args-file; usage: loop.mjs <tool> --args-file <path>`);
  }
  // A path that looks like a flag (e.g. `--args-file --schema`) is a
  // caller mistake, not a file to open — reject it explicitly instead of
  // surfacing a confusing "cannot read" for a file named like the flag.
  if (path.startsWith("--")) {
    throw new UsageError(`--args-file path must not be a flag; usage: loop.mjs <tool> --args-file <path>`);
  }
  return path;
}

// Resolve the file-backed invocation shape. Accepts exactly:
//   loop.mjs <tool> --args-file <path>
// Rejects everything else (extra args, missing path, unknown tool,
// flag-shaped path) with a usage error so callers never see a silent
// dispatch — one accepted shape keeps the contract small.
function resolveArgsFileAction(argv) {
  const subcommand = argv[2];
  if (argv[3] !== "--args-file") {
    return null;
  }
  const path = requireArgsFilePath(subcommand, argv[4], argv.length);
  if (!CLI_TOOLS.has(subcommand)) {
    throw new UsageError(`unknown tool: ${subcommand}`);
  }
  return { kind: "args-file", tool: subcommand, path };
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
  // File-backed form. Resolved before parseToolDispatch so it takes
  // precedence over the inline JSON branch.
  const argsFileAction = resolveArgsFileAction(process.argv);
  if (argsFileAction) {
    pinRuntimeIdAtBoot();
    const content = loadArgsFile(argsFileAction.path);
    const result = await runTool(argsFileAction.tool, content);
    process.stdout.write(JSON.stringify(result) + "\n");
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
  // structured stderr for write-path rejections.
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