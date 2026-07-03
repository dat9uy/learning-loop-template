import { readRegistry } from "../learning-loop-mastra/core/meta-state.js";

/**
 * Look up a meta-state entry by id, returning either the entry or a
 * ready-to-return `entry_not_found` MCP response.
 *
 * Shared by meta_state_derive_status, meta_state_check_grounding, and
 * meta_state_relationships — all three used to repeat the same 8-line
 * readRegistry + find + 404-response block. Caller pattern:
 *
 *   const { entry, notFoundResponse } = findEntryOrNotFound(root, id);
 *   if (notFoundResponse) return notFoundResponse;
 *   // ... use `entry`
 *
 * @param {string} root
 * @param {string} id
 * @returns {{ entry: object | null,
 *             notFoundResponse: { content: Array<{ type: string, text: string }> } | null }}
 */
export function findEntryOrNotFound(root, id) {
  const entries = readRegistry(root);
  const entry = entries.find((e) => e.id === id) ?? null;
  if (entry) return { entry, notFoundResponse: null };
  return {
    entry: null,
    notFoundResponse: {
      content: [{ type: "text", text: JSON.stringify({ error: "entry_not_found", id }) }],
    },
  };
}