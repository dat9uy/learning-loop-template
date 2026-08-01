// core/cli-context-savings.js — pure computation for the CLI transport's
// context-savings dogfood measurement.
//
// Why wire bytes, not manifest stubs: tools/manifest.json entries carry only
// {file, export, pathFields} — no name, no description, no schema. Stub bytes
// from manifest entries ~85 B × 30 tools ≈ 2.5 KB and miss every byte the
// model actually sees on tools/list. The finding
// meta-260722T1546Z... measured 31.8 KB (94% savings once banner bytes are
// netted) and that magnitude is wire bytes. This module re-derives the
// same wire bytes for every CLI_TOOLS member so a regression guard can lock
// the delta against drift.
//
// The wire-def formula is the parity view assembled at
// mastra/create-loop-tool.js:24-63: buildParitySchema() collapses
// z.preprocess / guarded-boolean-union wrappers, z.toJSONSchema(...) emits
// draft-7 input JSON Schema, and the counted bytes are
// byteLength(JSON.stringify({name, description, inputSchema: parityJson})).
//
// Fidelity boundary (intentional, not a bug): the counted `name` is
// legacy.name (the handler export), NOT the MCP-surface `mastra_<name>` the
// server registers at mastra/server.js:43,74-76, and parityJson does NOT
// carry `legacy.parityJsonSchemaHints` (per-field draft-7 hints merged at
// create-loop-tool.js:39-45). Both are constant per-tool offsets — ~8 B name
// prefix × N tools, plus a few bytes on the one hinted tool (meta_state_patch)
// — so they do not affect regression detection or savings_pct. Excluding them
// keeps the ledger time-series comparable across formula revisions. The
// helper validated name=legacy.name; live MCP-wire parity is owned by
// mcp-tools-list-parity.test.js, not this helper.
//
// Pure functions only — no MCP server spawn, no ledger writes, no CLI
// surface. The hook import boundary lives in the caller (script + test),
// because the hook is a .cjs file and importing it from this ESM core
// pulls the gate deps we explicitly want to keep out.
//
// Cross-canonical regex note: parseManifestJsonc repeats the strip-full-line-
// //-comments rule from mastra/server.js:34 and bin/loop.mjs:54. If the
// canonical regex ever grows (e.g. trailing-comma support), all three sites
// must update together. A shared core/jsonc.js is out of scope here.

import { z } from "zod";
import { buildParitySchema } from "../mastra/schema-parity.js";
import { normalizeInputSchema } from "./schema-normalize.js";
import { resolveToolImportUrl } from "./manifest-loader.js";

/**
 * Strip full-line `//` comments from a JSONC document and parse the result.
 * Mirrors the canonical regex at mastra/server.js:34 / bin/loop.mjs:54.
 *
 * @param {string} text — raw JSONC text
 * @returns {Array<object>} — parsed manifest entries
 */
export function parseManifestJsonc(text) {
  const json = text.replace(/^\s*\/\/.*$/gm, "");
  return JSON.parse(json);
}

/**
 * Resolve the wire-byte size of every CLI_TOOLS member that the manifest
 * exports. Wire bytes = byteLength(JSON.stringify({name, description, inputSchema}))
 * where name = legacy.name and inputSchema is the parity view's draft-7 JSON
 * Schema (see mastra/create-loop-tool.js:24-63). NOTE: this excludes the MCP
 * `mastra_` name prefix and `parityJsonSchemaHints` — see the fidelity
 * boundary in the file header.
 *
 * Best-effort: a handler whose dynamic import throws is logged to stderr
 * and excluded; a CLI_TOOLS member whose manifest entry is missing (e.g.
 * a member whose tool is registered under a different export) is likewise
 * omitted. The caller (test, script) treats the row list as "what we
 * successfully counted" rather than "every member".
 *
 * @param {Array<{file: string, export: string, pathFields?: string[]}>} manifest
 * @param {Set<string>} cliTools — tool names keyed on handler.legacy.name
 * @returns {Promise<Array<{name: string, bytes: number}>>}
 */
export async function resolveWireBytesForCliTools(manifest, cliTools) {
  const rows = [];
  const seen = new Set();
  for (const entry of manifest) {
    const row = await resolveOneEntry(entry, cliTools, seen);
    if (row) rows.push(row);
  }
  return rows;
}

async function resolveOneEntry(entry, cliTools, seen) {
  const { file, export: exportName } = entry;
  if (!file || !exportName) return null;
  let mod;
  try {
    mod = await import(resolveToolImportUrl(file));
  } catch (err) {
    console.error(`cli-context-savings: dynamic import of ${file} failed: ${err?.message ?? err}`);
    return null;
  }
  const legacy = mod[exportName];
  if (!legacy || !legacy.name) return null;
  if (!cliTools.has(legacy.name) || seen.has(legacy.name)) return null;
  seen.add(legacy.name);
  return wireBytesForLegacy(legacy);
}

function wireBytesForLegacy(legacy) {
  try {
    // Mirror bin/loop.mjs's runSchema path: a plain shape object must be
    // wrapped via normalizeInputSchema first, otherwise buildParitySchema
    // (which only handles zod schemas with a `_zod` def) returns the shape
    // as-is and z.toJSONSchema would emit object-literal syntax instead of
    // draft-7 JSON Schema.
    const normalized = normalizeInputSchema(legacy.schema);
    const paritySchema = buildParitySchema(normalized);
    const parityJson = z.toJSONSchema(paritySchema, { target: "draft-7", io: "input" });
    const wire = JSON.stringify({
      name: legacy.name,
      description: legacy.description,
      inputSchema: parityJson,
    });
    return { name: legacy.name, bytes: Buffer.byteLength(wire, "utf8") };
  } catch (err) {
    console.error(`cli-context-savings: wire-def assembly for ${legacy.name} failed: ${err?.message ?? err}`);
    return null;
  }
}

/**
 * Reduce wire-byte rows + banner variants to the savings aggregate.
 *
 * `cli_tool_count` is the number of rows actually counted (perTool.length),
 * NOT the input CLI_TOOLS set size — so a handler that fails to resolve
 * shrinks both dropped bytes and the count consistently, instead of masking
 * the regression behind the input-set size. The script's --record path
 * enforces `rows.length === CLI_TOOLS.size` before writing a ledger row, so a
 * partial resolution is loud rather than silently mis-recorded.
 *
 * @param {object} args
 * @param {Array<{name: string, bytes: number}>} args.wireBytes
 * @param {{readsOnly: number, recordsViaCli: number} | number} args.bannerBytes
 *   — Either an object with both variants or a single number; the script
 *   caller computes the bytes via createRequire(hook) and passes the pair.
 * @returns {{dropped_def_bytes: number, per_tool: Array<{name, bytes}>, banner_bytes: number, savings_bytes: number, savings_pct: number, cli_tool_count: number}}
 */
export function computeCliContextSavings({ wireBytes, bannerBytes }) {
  const perTool = [...wireBytes].sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name));
  const dropped = perTool.reduce((sum, r) => sum + r.bytes, 0);
  const bannerMax = typeof bannerBytes === "number"
    ? bannerBytes
    : Math.max(bannerBytes.readsOnly ?? 0, bannerBytes.recordsViaCli ?? 0);
  const savings = dropped - bannerMax;
  // Guard against divide-by-zero on an empty CLI_TOOLS intersect: when no
  // tools ride the CLI, dropped is 0 and savings is -banner, but pct is
  // defined as 0 (no win to measure) rather than NaN.
  const pct = dropped > 0 ? Math.round((savings / dropped) * 1000) / 10 : 0;
  return {
    dropped_def_bytes: dropped,
    per_tool: perTool,
    banner_bytes: bannerMax,
    savings_bytes: savings,
    savings_pct: pct,
    cli_tool_count: perTool.length,
  };
}

/**
 * Select the immediately-prior ctx-savings ledger row from a
 * `runtime_state_read` result set. Filters to `ctx-savings-` ids, sorts by
 * `timestamp` DESC, and returns the most recent row (or null). Pure — no I/O.
 *
 * Extracted from measure-cli-context.mjs so the prior-row selection is
 * unit-testable without writing to the ledger (the plan's "tests never write
 * the ledger" rule still holds; this function only inspects an
 * already-fetched row array).
 *
 * @param {Array<{id?: string, timestamp?: string, value?: number}>} rows
 * @returns {{id: string, timestamp: string, value: number} | null}
 */
export function pickPriorCtxSavingsRow(rows) {
  if (!Array.isArray(rows)) return null;
  const ctx = rows
    .filter((r) => r && typeof r.id === "string" && r.id.startsWith("ctx-savings-"))
    .sort((a, b) => String(b?.timestamp ?? "").localeCompare(String(a?.timestamp ?? "")));
  return ctx[0] ?? null;
}

/**
 * Compute the ledger row's `delta` field: current savings_bytes minus the
 * prior row's `value`, or null when there is no finite prior (first run, or a
 * prior row with a non-numeric value).
 *
 * @param {number} currentSavingsBytes
 * @param {{value?: number} | null} priorRow
 * @returns {number | null}
 */
export function computeSavingsDelta(currentSavingsBytes, priorRow) {
  if (!priorRow || !Number.isFinite(priorRow.value)) return null;
  return currentSavingsBytes - priorRow.value;
}
