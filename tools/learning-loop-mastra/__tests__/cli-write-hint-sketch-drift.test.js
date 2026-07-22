// cli-write-hint-sketch-drift.test.js — guard for the SessionStart
// write-tool arg sketches (plans/260722-1343 Phase 3).
//
// The SessionStart banner surfaces one-line arg sketches per write tool so the
// agent can compose a JSON-args string without loading the full schema (the
// full shape is pulled on demand via `loop.mjs <tool> --schema`). The sketches
// are hand-curated in
// hooks/universal/session-start-inject-discoverability.cjs#WRITE_TOOL_SKETCHES.
//
// This test is the drift guard that the table's own comment promises. Per
// write tool, it asserts:
//   1. Every key named in the sketch (required or `?`-optional) is a real
//      property of the tool's input schema — so a sketch never tells the
//      agent to compose a field the schema does not accept.
//   2. Every schema-required top-level key appears in the sketch as a
//      non-`?` key — so a schema change that adds a required key breaks the
//      test, not the agent's first write.
// It does NOT flag the reverse (a sketch listing an optional key without
// `?`): over-hinting an optional field is harmless (the agent includes a
// valid field), while the two checks above catch the real failure modes
// (phantom keys and missing required keys).

import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import { resolveToolImportUrl } from "../core/manifest-loader.js";
import { normalizeInputSchema } from "../core/schema-normalize.js";

const require = createRequire(import.meta.url);
const { WRITE_TOOL_SKETCHES } = require("../hooks/universal/session-start-inject-discoverability.cjs");
const { CLI_WRITE_TOOLS } = require("../core/cli-tools.js");

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, "..");
const MANIFEST = JSON.parse(
  readFileSync(join(PKG_ROOT, "tools", "manifest.json"), "utf8").replace(/^\s*\/\/.*$/gm, ""),
);

// Parse a sketch like "{a,b?,operations:[{op,...}]}" into top-level keys,
// respecting nested [] / {} so inner commas do not split a key. Each key is
// the identifier before the first ':' or '[' or '{'; a trailing '?' marks it
// optional.
function parseSketchKeys(sketch) {
  const inner = sketch.replace(/^\{|\}$/g, "");
  const parts = [];
  let depth = 0;
  let buf = "";
  for (const ch of inner) {
    if (ch === "[" || ch === "{") {
      depth++;
      buf += ch;
    } else if (ch === "]" || ch === "}") {
      depth--;
      buf += ch;
    } else if (ch === "," && depth === 0) {
      parts.push(buf);
      buf = "";
    } else {
      buf += ch;
    }
  }
  if (buf.trim()) parts.push(buf);
  return parts.map((part) => {
    part = part.trim();
    let optional = false;
    if (part.endsWith("?")) {
      optional = true;
      part = part.slice(0, -1).trim();
    }
    const name = part.split(":")[0].split("[")[0].split("{")[0].trim();
    return { name, optional };
  });
}

async function loadWriteToolSchemas() {
  const out = new Map();
  for (const entry of MANIFEST) {
    const mod = await import(resolveToolImportUrl(entry.file));
    const handler = mod[entry.export];
    if (!handler || !CLI_WRITE_TOOLS.has(handler.name)) continue;
    const jsonSchema = z.toJSONSchema(normalizeInputSchema(handler.schema), {
      target: "draft-7",
      io: "input",
    });
    out.set(handler.name, {
      properties: new Set(Object.keys(jsonSchema.properties || {})),
      required: new Set(jsonSchema.required || []),
    });
  }
  return out;
}

test("every CLI_WRITE_TOOLS member has a sketch entry", async () => {
  const schemas = await loadWriteToolSchemas();
  for (const name of CLI_WRITE_TOOLS) {
    assert.ok(
      WRITE_TOOL_SKETCHES[name],
      `missing sketch for write tool ${name}; add a one-line sketch to WRITE_TOOL_SKETCHES`,
    );
    assert.ok(schemas.has(name), `no schema loaded for write tool ${name}`);
  }
});

test("every sketch key is a real schema property and every schema-required key is a non-optional sketch key", async () => {
  const schemas = await loadWriteToolSchemas();
  for (const name of CLI_WRITE_TOOLS) {
    const sketch = WRITE_TOOL_SKETCHES[name];
    const { properties, required } = schemas.get(name);
    const keys = parseSketchKeys(sketch);

    // Check 1: every named key must be a real schema property.
    for (const { name: key } of keys) {
      assert.ok(
        properties.has(key),
        `${name}: sketch key "${key}" is not a schema property; valid props: [${[...properties].join(", ")}]`,
      );
    }

    // Check 2: every schema-required key must be a non-optional sketch key.
    const sketchRequired = new Set(keys.filter((k) => !k.optional).map((k) => k.name));
    for (const key of required) {
      assert.ok(
        sketchRequired.has(key),
        `${name}: schema-required key "${key}" is missing from the sketch (or marked optional); add it as a non-? key`,
      );
    }
  }
});