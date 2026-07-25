// core/workflow-input-schema.js — shared U-Q1 unwrap contract for plain
// handler modules re-homed out of createLoopWorkflow.
//
// createLoopWorkflow wraps every workflow input schema with
//   z.preprocess(stripMcpContentEnvelope, normalizeSchema(inputSchema))
// (mastra/create-loop-workflow.js:77-79) so MCP-path callers wrapping args in
// the content envelope are handled transparently. Plain manifest handlers
// (createLoopTool) do NOT get that wrap — this helper bakes the same
// normalization into each unwrapped handler's schema so MCP-path parity and
// envelope stripping survive the unwrap without per-tool duplication.
//
// Scope: TOP-LEVEL (content) envelope only. Per-field SDK {item: X} strips
// (e.g. self_improvement.proposed_changes' z.preprocess(stripEnvelope, ...))
// are NOT covered — copy those wrappers verbatim into the handler's schema.
//
// stripMcpContentEnvelope is a no-op on plain JSON (the CLI input form), so
// the helper is safe for both transports.

import { z } from "zod";
import { stripMcpContentEnvelope } from "./envelope-stripper.js";
import { normalizeInputSchema } from "./schema-normalize.js";

export function wrapWorkflowInputSchema(inputSchema) {
  return z.preprocess(stripMcpContentEnvelope, normalizeInputSchema(inputSchema));
}
