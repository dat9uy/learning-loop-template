/**
 * Adapt a legacy tool handler (which returns `{ content: [{ type: "text", text: JSON.stringify(result) }] }`)
 * to Mastra's `execute` contract (which returns the result object directly).
 *
 * The legacy tool config has `name`, `description`, and `schema` (a plain shape object
 * or ZodObject). createLoopTool handles wire-format coercion via z.preprocess, so the
 * adapted handler receives already-coerced args and only needs output normalization.
 *
 * @param {{ handler: (args: any) => Promise<any> }} legacy
 * @returns {(args: any) => Promise<any>}
 */
export function adaptLegacyHandler(legacy) {
  return async (args) => {
    const result = await legacy.handler(args);
    if (
      result &&
      typeof result === "object" &&
      Array.isArray(result.content) &&
      result.content[0] &&
      typeof result.content[0].text === "string"
    ) {
      return JSON.parse(result.content[0].text);
    }
    return result;
  };
}
