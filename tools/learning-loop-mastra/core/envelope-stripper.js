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
