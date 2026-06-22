import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { buildParitySchema } from "./schema-parity.js";

/**
 * Factory seam for the loop's tools. Pre-Phase 2 this wrapped inputSchema with
 * imperative coerce walkers; post-Phase 2 the schema is the source of truth
 * (z.coerce.* + z.preprocess envelope strippers handle wire-format quirks
 * declaratively). Legacy tools still pass a plain shape object, so the factory
 * reconstructs a ZodObject when needed.
 *
 * To keep the public JSON Schema contract unchanged, the factory overrides the
 * root schema's JSON Schema generator with a parity view that strips the
 * migration wrappers (preprocess / guarded-boolean unions) while leaving parse
 * behavior strict.
 */
function normalizeInputSchema(inputSchema) {
  if (
    inputSchema &&
    typeof inputSchema === "object" &&
    (inputSchema._def || inputSchema.def) &&
    typeof inputSchema.parse === "function"
  ) {
    return inputSchema;
  }
  return z.object(inputSchema);
}

function attachParityJSONSchema(schema) {
  const paritySchema = buildParitySchema(schema);
  const parityJSONSchema = z.toJSONSchema(paritySchema, {
    target: "draft-7",
    io: "input",
  });
  // Override zod's per-schema JSON Schema generator so the schema exposed to
  // MCP clients via `tools/list` is the parity view (z.preprocess wrappers and
  // guarded-boolean unions unwrapped). zod's `process` function in
  // node_modules/zod/v4/core/to-json-schema.js:49 checks
  // `schema._zod.toJSONSchema?.()` and uses its return value. The override IS
  // honored through Mastra's MCPServer.convertSchema → standardSchemaToJSONSchema
  // path (verified empirically by spawning the production MCP server and
  // asserting all 39 tools return real inputSchemas — see
  // plans/reports/researcher-A-260618-1418-GH-0029-pr5-shim-fix-strategies-report.md
  // §1). The new e2e regression test in mcp-tools-list-parity.test.js locks
  // this path against future regressions.
  //
  // IMPORTANT: return a clone on every call. Mastra converts tools more than
  // once (MCPServer constructor + __registerMastra), and zod's toJSONSchema
  // mutates the returned object in place (extractDefs replaces the root schema
  // with {"$ref":"#"}). Reusing the same object causes the second conversion
  // to emit only the $ref sentinel.
  schema._zod.toJSONSchema = () => JSON.parse(JSON.stringify(parityJSONSchema));
  return schema;
}

export function createLoopTool({ id, description, inputSchema, execute }) {
  const normalized = attachParityJSONSchema(normalizeInputSchema(inputSchema));
  return createTool({
    id,
    description,
    inputSchema: normalized,
    execute,
  });
}
