import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { buildParitySchema } from "./schema-parity.js";
import { verifyRuntimeToken } from "../core/identity/verify-runtime-token.js";
import { checkR2Ownership, loadAllowlist } from "../core/r2/ownership.js";
import { collectPathFields } from "../core/r2/path-field-detector.js";
import { resolveInsideRoot, PathContainmentError } from "../core/path-containment.js";

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

// Module-level cache; initialized via initR2Gate() at server boot.
let _allowlist = null;
let _projectRoot = null;

/**
 * Pin the project root + allowlist for the R2 gate. Called once at server boot.
 * @param {object} opts
 * @param {string} opts.root — project root (from findProjectRoot()).
 * @param {string} opts.allowlistPath — path to .loop/r2-allowlist.json.
 */
export function initR2Gate({ root, allowlistPath }) {
  _projectRoot = root;
  _allowlist = loadAllowlist(allowlistPath);
  if (!_allowlist) {
    // Fail-closed: no allowlist = no writes (per Plan 5 Phase 2 NF3).
    throw new Error(`r2-allowlist missing or invalid; aborting server boot (fail-closed). path=${allowlistPath}`);
  }
}

/**
 * Test-only: reset gate state.
 */
export function _resetR2GateForTests() {
  _allowlist = null;
  _projectRoot = null;
}

export function createLoopTool({ id, description, inputSchema, execute }) {
  const normalized = attachParityJSONSchema(normalizeInputSchema(inputSchema));
  const pathFields = collectPathFields(normalized);
  return createTool({
    id,
    description,
    inputSchema: normalized,
    execute: async (args, context) => {
      // Phase 1 (LIM-3): every tool call MUST prove caller identity.
      // The verifier reads the token from <surface>/coordination/runtime-id-token.json
      // (file-only transport; no env-only fallback for hardening reasons).
      //
      // SECURITY: `expectedRuntimeId` MUST only resolve from the verified
      // Ed25519 token's runtime_id. Do NOT add `MASTRA_RESOURCE_ID` to the
      // fallback chain — that re-opens the spoofing gap closed by Plan 5
      // (a Claude Code session could otherwise impersonate droid by setting
      // MASTRA_RESOURCE_ID=droid). See interface/CONTRACT.md Req #4.
      const tokenB64 = context?.requestContext?.get?.("runtime_id_token")
        ?? process.env.RUNTIME_ID_TOKEN;
      const expectedRuntimeId = context?.requestContext?.get?.("runtime_id")
        ?? process.env.RUNTIME_ID;
      const decision = await verifyRuntimeToken({
        tokenB64: typeof tokenB64 === "string" && tokenB64.length > 0 ? tokenB64 : undefined,
        expectedRuntimeId: expectedRuntimeId ?? undefined,
      });
      if (decision.decision !== "ok") {
        // Surface as a structured error envelope so callers can route on `error`.
        throw new Error(`caller-identity:${decision.decision}:${decision.reason ?? "no-reason"}`);
      }
      // Phase 2 (R2): every path-bearing input is checked against the per-runtime
      // allowlist. Order: path containment (Phase 3) → R2 ownership.
      if (_allowlist && _projectRoot && pathFields.length > 0) {
        for (const f of pathFields) {
          const v = args?.[f];
          if (typeof v !== "string") continue;
          let absPath;
          try {
            absPath = resolveInsideRoot(v, _projectRoot);
          } catch (err) {
            if (err instanceof PathContainmentError) {
              throw new Error(`path-containment:${err.code}:${v}`);
            }
            throw err;
          }
          const r2 = checkR2Ownership(decision.runtime_id, absPath, _allowlist, _projectRoot);
          if (!r2.ok) {
            throw new Error(
              `cross_runtime_write_denied:${r2.reason}:runtime=${decision.runtime_id}:path=${r2.path ?? v}:hint=${r2.hint ?? ""}`
            );
          }
        }
      }
      return execute(args, context);
    },
  });
}
