import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { normalizeInputSchema } from "../core/schema-normalize.js";
import { buildParitySchema } from "./schema-parity.js";
import { withR2Gate } from "./with-r2-gate.js";

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
 *
 * `normalizeInputSchema` lives in core/schema-normalize.js (Phase 1 of plan
 * 260721-1933) so transport-agnostic consumers (the read-only CLI) can reuse
 * it without importing @mastra/core.
 */

function attachParityJSONSchema(schema, parityHints) {
  const paritySchema = buildParitySchema(schema);
  const parityJSONSchema = z.toJSONSchema(paritySchema, {
    target: "draft-7",
    io: "input",
  });
  // Plan 260717-1145 Phase 2: inject model-visible JSON-schema hints (draft-7
  // constraints like minProperties) on top of the parity view. Zod v4's
  // z.object() has no .min(1) that renders as minProperties, and .refine is
  // dropped by toJSONSchema, so the steering layer must be applied here.
  // Generation-only: this never affects .parse() — the override is on the
  // converted JSON schema object, while runtime validation uses the real Zod
  // schema. Deep-merges per-field so existing property constraints are
  // preserved (e.g. a `minLength: 20` already declared on `description` is
  // not clobbered by injecting `patch: { minProperties: 1 }`).
  if (parityHints && typeof parityHints === "object") {
    for (const [field, hint] of Object.entries(parityHints)) {
      const propSchema = parityJSONSchema?.properties?.[field];
      if (!propSchema || !hint || typeof hint !== "object") continue;
      Object.assign(propSchema, hint);
    }
  }
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

export function createLoopTool({ id, description, inputSchema, execute, pathFields = [], parityHints }) {
  const normalized = attachParityJSONSchema(normalizeInputSchema(inputSchema), parityHints);
  // R2 write-gate is the single write-authorization point for every loop tool.
  // Tools with pathFields: [] (no write-path args) short-circuit to allow;
  // tools that declare write-path args are ownership-checked per runtime.
  const gatedExecute = withR2Gate({ id, execute, pathFields });
  return createTool({
    id,
    description,
    inputSchema: normalized,
    execute: gatedExecute,
  });
}
