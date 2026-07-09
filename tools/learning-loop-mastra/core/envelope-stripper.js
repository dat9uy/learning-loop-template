/**
 * MCP envelope stripping utilities.
 *
 * Two distinct envelope forms exist in the MCP ecosystem:
 *
 * 1. `stripEnvelope(v)` — strips single-key {item: X} envelopes (SDK form).
 *    Used by per-field `z.preprocess(stripEnvelope, ...)` in legacy workflows.
 *
 * 2. `stripMcpContentEnvelope(v)` — strips MCP tool-result envelopes
 *    { content: [{ type: "text", text: JSON.stringify(inner) }] }.
 *    Used by `createLoopWorkflow` factory-level preprocess so agent
 *    callers wrapping input in tool-result form are handled transparently.
 *
 * Both forms are fail-closed: malformed input falls through to the raw value.
 */

/**
 * Check if a value is an MCP SDK envelope: {item: X}.
 * An envelope is a non-array object with exactly one key named "item".
 */
function isEnvelope(v) {
  return v && typeof v === "object" && !Array.isArray(v) &&
    Object.keys(v).length === 1 && "item" in v;
}

/**
 * Strip MCP SDK {item: X} envelopes, returning the inner value.
 * Undefined-safe: returns undefined for undefined input so that
 * optional-after-preprocess works correctly (z.preprocess + .optional()).
 *
 * Without the undefined guard, z.preprocess would return undefined for
 * undefined input, and the inner union/optional would fail on undefined
 * instead of skipping validation as optional fields should.
 */
export const stripEnvelope = (v) => {
  if (v === undefined) return undefined;
  return isEnvelope(v) ? v.item : v;
};

/**
 * Recursively strip MCP SDK {item: X} envelopes anywhere in the tree.
 *
 * Used for top-level array fields (e.g. meta_state_batch `operations`)
 * and nested arrays (change_diff.added, loop-design.proposed_design_for)
 * that the MCP wire layer coerces into {item: [...]} form. Single-level
 * stripEnvelope covers one level; this covers every level.
 *
 * Fail-closed: only exact single-key `item` envelopes unwrap. All other
 * shapes pass through unchanged. After unwrapping, the inner value is
 * recursed into so {item: {item: X}} and {item: {a: {item: [...]}}}
 * both fully flatten. Undefined-safe.
 */
export const deepStripEnvelope = (v) => {
  if (v === undefined) return undefined;
  if (Array.isArray(v)) return v.map(deepStripEnvelope);
  if (v && typeof v === "object") {
    if (isEnvelope(v)) return deepStripEnvelope(v.item);
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      out[k] = deepStripEnvelope(val);
    }
    return out;
  }
  return v;
};

/**
 * Strip MCP content envelope: { content: [{ type: "text", text: JSON.stringify(inner) }] }
 * Fail-closed: malformed JSON falls back to raw input.
 */
export const stripMcpContentEnvelope = (v) => {
  if (
    v &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    Array.isArray(v.content) &&
    v.content[0] &&
    typeof v.content[0].text === "string"
  ) {
    try {
      return JSON.parse(v.content[0].text);
    } catch {
      return v;
    }
  }
  return v;
};
