import { test } from "node:test";
import assert from "node:assert/strict";
import { createLoopTool } from "../create-loop-tool.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST = JSON.parse(
  readFileSync(join(__dirname, "..", "tools", "manifest.json"), "utf8"),
);

function getShape(schema) {
  if (!schema) return null;
  // Zod v4 stores object shape in def.shape; legacy plain shape objects pass through.
  if (schema.def?.shape) return schema.def.shape;
  if (schema._def?.shape) return schema._def.shape;
  if (schema.shape) return schema.shape;
  if (typeof schema === "object" && !Array.isArray(schema)) return schema;
  return null;
}

function unwrapPreprocess(schema) {
  if (!schema) return null;
  if (schema.constructor.name === "ZodPreprocess") {
    // Zod v4: preprocess stores the wrapped schema in _def.out.
    return schema._def?.out ?? schema._def?.schema ?? schema._def?.innerType;
  }
  return schema;
}

for (const { file, export: exportName } of MANIFEST) {
  test(`parity: ${exportName} inputSchema shape matches legacy`, async () => {
    const mod = await import(`#mcp/${file}`);
    const legacy = mod[exportName];
    assert(legacy, `${exportName} export missing from ${file}`);
    assert(legacy.schema, `${exportName} missing legacy.schema`);

    const factory = createLoopTool({
      id: "test",
      description: "test",
      inputSchema: legacy.schema,
      execute: async () => ({}),
    });

    assert.equal(
      factory.inputSchema.constructor.name,
      "ZodPreprocess",
      `${exportName}: factory did not wrap inputSchema with z.preprocess`,
    );

    const legacyShape = getShape(legacy.schema);
    const innerSchema = unwrapPreprocess(factory.inputSchema);
    const factoryShape = getShape(innerSchema);

    assert(
      legacyShape,
      `${exportName}: could not extract legacy shape`,
    );
    assert(
      factoryShape,
      `${exportName}: could not extract factory shape`,
    );

    assert.deepEqual(
      Object.keys(factoryShape).sort(),
      Object.keys(legacyShape).sort(),
      `${exportName} inputSchema keys mismatch`,
    );
  });
}
