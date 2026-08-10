// core/schema-normalize.js — transport-agnostic seam for handler input schemas.
//
// `normalizeInputSchema` lives here so non-Mastra consumers (the read-only
// CLI) can reuse it without importing the MCP transport's deps.
//
// Boundary contract: this file imports ONLY zod. `mastra/with-r2-gate.js`
// (the MCP-only write-authorization sibling) intentionally stays out of
// scope — it is a shell concern the CLI does not need. (`core/schema-parity.js`
// is no longer MCP-only; it lives in core as a sibling primitive.)
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