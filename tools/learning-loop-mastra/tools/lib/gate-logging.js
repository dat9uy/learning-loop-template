// Re-exports the canonical gate-logging helpers from `#lib/gate-logging.js`
// (which lives at `tools/lib/gate-logging.js`, OUTSIDE fallow's analysis root
// of `tools/learning-loop-mastra/`) and adds the `replyWithLog` helper that
// meta-state handlers use for early-return-with-log responses.
//
// Why this file lives inside `tools/learning-loop-mastra/tools/lib/`:
// `fallow`'s `dupes-mode: mild` clone detector scopes analysis to its `root:`
// and does not follow `#lib/*` npm-import aliases that resolve outside that
// root. The previous commit's `logToolCall` extraction therefore could not
// suppress the duplicated "log + content-array return" pattern flagged
// across meta-state-re-verify-tool / meta-state-supersede-tool /
// meta-state-ship-loop-design-tool. Re-exporting the canonical helpers from
// a file INSIDE fallow's root, AND adding `replyWithLog`, lets fallow see
// the helper as the deduplicator once the call-sites use it.

import { appendGateLog, logToolCall } from "#lib/gate-logging.js";
import { readRegistry } from "../../core/meta-state.js";
export { appendGateLog, logToolCall };

/**
 * Log a tool call AND return the MCP-shaped success-content response for it.
 * Collapses the `logToolCall(...) + return { content: [{ type: "text", text:
 * JSON.stringify(body) }] }` pair that was duplicated across every
 * early-return block in the meta-state handler files.
 *
 * @param {string} root - project root; absolute path.
 * @param {string} tool - the MCP tool name (e.g., "meta_state_ship_loop_design").
 * @param {object} body - the structured outcome to log AND serialize into the response.
 * @returns {{content: Array<{type: string, text: string}>}} MCP content-array response.
 */
export function replyWithLog(root, tool, body) {
  logToolCall(root, tool, body);
  return { content: [{ type: "text", text: JSON.stringify(body) }] };
}

/**
 * Read the registry and find the entry with the given id. Single source for
 * the `readRegistry(root).find((e) => e.id === id)` pattern that was
 * duplicated across meta-state-re-verify-tool / meta-state-supersede-tool /
 * meta-state-ship-loop-design-tool.
 *
 * @param {string} root - project root; absolute path.
 * @param {string} id - the meta-state entry id to look up.
 * @returns {object|undefined} the entry if found, undefined otherwise.
 */
export function loadEntry(root, id) {
  return readRegistry(root).find((e) => e.id === id);
}