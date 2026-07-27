// core/cli-context-savings.js — pure computation for the CLI transport's
// context-savings dogfood measurement (plans/260726-1953).
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
// draft-7 input JSON Schema, and the model-visible wire-def bytes are
// byteLength(JSON.stringify({name, description, inputSchema: parityJson})).
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
 * exports. Wire bytes = byteLength(JSON.stringify(name, description, inputSchema))
 * where inputSchema is the parity view's draft-7 JSON Schema — the same bytes
 * MCP clients receive on tools/list (see mastra/create-loop-tool.js:24-63).
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
    const { file, export: exportName } = entry;
    if (!file || !exportName) continue;
    let mod;
    try {
      mod = await import(resolveToolImportUrl(file));
    } catch (err) {
      console.error(`cli-context-savings: dynamic import of ${file} failed: ${err?.message ?? err}`);
      continue;
    }
    const legacy = mod[exportName];
    if (!legacy || !legacy.name) continue;
    if (!cliTools.has(legacy.name)) continue;
    if (seen.has(legacy.name)) continue;
    seen.add(legacy.name);
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
      rows.push({ name: legacy.name, bytes: Buffer.byteLength(wire, "utf8") });
    } catch (err) {
      console.error(`cli-context-savings: wire-def assembly for ${legacy.name} failed: ${err?.message ?? err}`);
    }
  }
  return rows;
}

/**
 * Reduce wire-byte rows + banner variants to the savings aggregate.
 *
 * @param {object} args
 * @param {Array<{name: string, bytes: number}>} args.wireBytes
 * @param {Set<string>} args.cliTools
 * @param {{readsOnly: number, recordsViaCli: number} | {readsOnly: number, recordsViaCli: number} & number} args.bannerBytes
 *   — Either an object with both variants or a single number; the script
 *   caller computes the bytes via createRequire(hook) and passes the pair.
 * @returns {{dropped_def_bytes: number, per_tool: Array<{name, bytes}>, banner_bytes: number, savings_bytes: number, savings_pct: number, cli_tool_count: number}}
 */
export function computeCliContextSavings({ wireBytes, cliTools, bannerBytes }) {
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
    cli_tool_count: cliTools.size,
  };
}
