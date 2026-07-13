import { test } from "vitest";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { z } from "zod";
import { stripEnvelope } from "../../core/envelope-stripper.js";

// Structural guardrail — locks plan 260709-1237-wire-format-coverage-guardrail's
// invariant: every reachable `ZodArray` on a handler tool schema must have a
// `z.preprocess(stripEnvelope | deepStripEnvelope, ...)` ancestor in its wrap chain.
// Walks zod-v4 schemas the same way schema-parity.js does (schema._zod.def.type).
// On any future tool that regresses, this fails loudly with `<tool>:<field>`.

const GUARD_FN_NAMES = new Set(["stripEnvelope", "deepStripEnvelope"]);

// Resolve the handler tools directory relative to this test file.
const here = dirname(fileURLToPath(import.meta.url));
const HANDLERS_DIR = join(here, "..", "..", "tools", "handlers");

/**
 * Read the export name from a handler module by parsing a stable marker line.
 * Every handler in tools/handlers/*.js exports `export const <name>Tool = { name, ... schema }`,
 * and the server.js loader pairs it with `manifest.json`. We don't need to import
 * every module here; we just need to know each field's zod schema. Since the tools'
 * `.schema` is a plain record (not a z.object), we DO need to import to read it.
 */
async function listHandlerFiles() {
  const entries = await readdir(HANDLERS_DIR);
  return entries
    .filter((f) => f.endsWith("-tool.js") && !f.endsWith(".test.js"))
    .sort();
}

/**
 * Best-effort loader: each handler module exports a single named tool const whose
 * name ends in "Tool". We probe for the most common export names.
 */
const TOOL_EXPORT_CANDIDATES = [
  "loopDescribeTool",
  "loopGetInstructionTool",
  "gateCheckTool",
  "gateOverrideTool",
  "gateCheckRecurrenceTool",
  "gateMarkPreflightTool",
  "runtimeStateRecordTool",
  "runtimeStateReadTool",
  "workflowGeneratePromptTool",
  "workflowNotifyArtifactTool",
  "workflowTriggerTool",
  "metaStateReportTool",
  "metaStateListTool",
  "metaStateResolveTool",
  "metaStatePromoteRuleTool",
  "metaStateBatchTool",
  "metaStateArchiveTool",
  "metaStateSweepTool",
  "metaStateLogChangeTool",
  "metaStatePatchTool",
  "metaStateDeriveStatusTool",
  "metaStateCheckGroundingTool",
  "metaStateRefreshFileIndexTool",
  "metaStateQueryDriftTool",
  "metaStateProposeDesignTool",
  "metaStateRelationshipsTool",
  "metaStateRelationshipValidateTool",
  "metaStateReVerifyTool",
  "metaStateSupersedeTool",
  "metaStateDispatchFindingTool",
  "metaStateConsistencyCheckTool",
  "checkRuntimeAgnosticTool",
];

async function loadToolFor(file) {
  const mod = await import(join(HANDLERS_DIR, file));
  for (const candidate of TOOL_EXPORT_CANDIDATES) {
    if (mod[candidate]?.schema) return { tool: mod[candidate], exportName: candidate };
  }
  // Fallback: find any export with a `.schema` property
  for (const key of Object.keys(mod)) {
    if (mod[key]?.schema && typeof mod[key].schema === "object") {
      return { tool: mod[key], exportName: key };
    }
  }
  return null;
}

/**
 * Walk the zod-v4 wrap chain. For each (tool, field) the chain is descended via
 * `_zod.def` carrying a `guarded` flag: true if a stripEnvelope/deepStripEnvelope
 * `z.preprocess` ancestor has been seen, false otherwise. When `array` is reached
 * and `guarded === false`, the field is recorded as unguarded.
 *
 * Type transitions handled (mirrors schema-parity.js):
 *   - `optional` / `default` / `nullable` → descend into def.innerType, preserve guard state
 *   - `pipe` → check left side (def.in): if it's a transform whose function is in
 *     GUARD_FN_NAMES, mark guarded=true for the right side; descend into def.out
 *   - `union` / `discriminatedUnion` → descend into each branch
 *   - `array` → leaf: report based on guarded flag
 *   - `object` → leave to field-level recursion (handled at call site)
 *   - other (primitives, checks, literals, transforms) → leaf: nothing to report
 */
function findUnguardedArraysInField(toolName, fieldName, schema, path = [], guarded = false) {
  const hits = [];
  if (!schema || typeof schema !== "object" || !schema._zod) return hits;

  const def = schema._zod.def;
  const type = def.type;

  // If a pipe is at this position, the LEFT side is the preprocess transform,
  // the RIGHT side is the schema the value is piped into.
  if (type === "pipe") {
    const inDef = def.in?._zod?.def;
    let childGuarded = guarded;
    if (inDef?.type === "transform" && GUARD_FN_NAMES.has(inDef.transform?.name)) {
      childGuarded = true;
    }
    hits.push(...findUnguardedArraysInField(toolName, fieldName, def.out, [...path, "pipe.out"], childGuarded));
    return hits;
  }

  if (type === "optional" || type === "default" || type === "nullable") {
    hits.push(...findUnguardedArraysInField(toolName, fieldName, def.innerType, [...path, type], guarded));
    return hits;
  }

  if (type === "union" || type === "discriminatedUnion") {
    const options = def.options || [];
    // In a union, each branch must individually be guarded if it ends in an array.
    // Per plan: "an array in any option must itself be guarded (per-option preprocess)".
    for (const opt of options) {
      hits.push(...findUnguardedArraysInField(toolName, fieldName, opt, [...path, "union.opt"], guarded));
    }
    return hits;
  }

  if (type === "array") {
    if (!guarded) {
      hits.push({ tool: toolName, field: fieldName, path: path.join(".") || "." });
    }
    return hits;
  }

  // Primitives, strings, numbers, booleans, transforms, enums, literals, etc.
  return hits;
}

function walkSchema(toolName, schema) {
  const hits = [];
  for (const [fieldName, fieldSchema] of Object.entries(schema || {})) {
    if (!fieldSchema || !fieldSchema._zod) continue;
    hits.push(...findUnguardedArraysInField(toolName, fieldName, fieldSchema, ["root"], false));
  }
  return hits;
}

test("every handler tool schema: no reachable ZodArray without stripEnvelope/deepStripEnvelope preprocess ancestor", async () => {
  const files = await listHandlerFiles();
  assert.ok(files.length > 0, "should enumerate handler files");

  const allHits = [];
  const loadedTools = [];

  for (const file of files) {
    const loaded = await loadToolFor(file);
    if (!loaded) {
      // Skip files that look like tools but don't expose a .schema property.
      // Common for utility scripts under handlers/ (none today, defensive only).
      continue;
    }
    loadedTools.push({ file, exportName: loaded.exportName, toolName: loaded.tool.name });
    allHits.push(...walkSchema(loaded.tool.name, loaded.tool.schema));
  }

  // Sanity: list at least one tool loaded so the assertion is meaningful.
  assert.ok(loadedTools.length > 0, "should load at least one handler tool");

  if (allHits.length > 0) {
    const summary = allHits
      .map((h) => `  ${h.tool}:${h.field} (path: ${h.path})`)
      .join("\n");
    assert.fail(
      `Found ${allHits.length} unguarded array field(s) on handler tool schemas.\n` +
      `Wire-format coercion from the MCP SDK will silently drop these fields.\n` +
      `Wrap each with z.preprocess(stripEnvelope, ...) or z.preprocess(deepStripEnvelope, ...).\n` +
      `${summary}\n` +
      `Loaded tools: ${loadedTools.map((t) => `${t.toolName}(${t.exportName})`).join(", ")}`,
    );
  }
});

// Negative control — pointing the guardrail at a known-bad schema should fail.
// Done as a self-contained synthetic schema so we don't have to mutate production code.
test("synthetic schema with a bare z.array is correctly flagged as unguarded", () => {
  // Mirror the pre-patch shape of loop_describe.categories.
  const synthetic = {
    categories: z.array(z.string()).optional(),
  };
  const hits = walkSchema("synthetic_tool", synthetic);
  assert.equal(hits.length, 1, "should detect one unguarded array");
  assert.equal(hits[0].field, "categories");
  assert.equal(hits[0].tool, "synthetic_tool");
});

test("synthetic schema with z.preprocess(stripEnvelope, z.array(...)) is correctly flagged as guarded", () => {
  const synthetic = {
    categories: z.preprocess(stripEnvelope, z.array(z.string())).optional(),
  };
  const hits = walkSchema("synthetic_tool", synthetic);
  assert.equal(hits.length, 0, "should report no unguarded arrays");
});

test("synthetic schema with z.preprocess(deepStripEnvelope, z.array(opSchema)) is correctly flagged as guarded", async () => {
  // `deepStripEnvelope` was added by the prior wire-format batch fix; load it
  // dynamically so this test remains runnable on branches that haven't shipped
  // that helper yet.
  const envelopeMod = await import("../../core/envelope-stripper.js");
  const deepStripEnvelope = envelopeMod.deepStripEnvelope;
  assert.ok(deepStripEnvelope, "envelope-stripper.js must export deepStripEnvelope for this assertion");
  const opSchema = z.object({ op: z.literal("write"), entry: z.record(z.string(), z.unknown()) });
  const synthetic = {
    operations: z.preprocess(deepStripEnvelope, z.array(opSchema).min(1).max(100)),
  };
  const hits = walkSchema("synthetic_tool", synthetic);
  assert.equal(hits.length, 0, "deepStripEnvelope should also count as guarded");
});

test("synthetic schema with array branch in union without preprocess is correctly flagged", () => {
  // Mirror the pre-patch shape of loop_get_instruction.key: union with bare array.
  const synthetic = {
    key: z.union([
      z.string(),
      z.number().int().nonnegative(),
      z.array(z.union([z.string(), z.number().int().nonnegative()])),
    ]),
  };
  const hits = walkSchema("synthetic_tool", synthetic);
  assert.equal(hits.length, 1, "should detect one unguarded array inside union");
  assert.equal(hits[0].field, "key");
});
