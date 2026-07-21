// core/schema-normalize.js — transport-agnostic seam for handler input schemas.
//
// Phase 1 of plans/260721-1933-cli-transport-phase1-read-only-slice lifts
// `normalizeInputSchema` out of mastra/create-loop-tool.js so the Phase-2
// read-only CLI can reuse it without importing the MCP transport's deps.
//
// Boundary contract: this file imports ONLY zod. MCP-only siblings
// (mastra/schema-parity.js, mastra/with-r2-gate.js) intentionally stay
// out of scope — they are JSON-schema-generation / write-authorization
// concerns that belong to the MCP transport. The CLI does not need them.
//
// Behavior is byte-identical to the original inline function (extracted
// verbatim from mastra/create-loop-tool.js:18-28):
//   - already-zod schemas (have `_def`/`def` + `parse`) are returned by identity
//   - plain shape objects are wrapped in z.object(...)

import { z } from "zod";

export function normalizeInputSchema(inputSchema) {
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