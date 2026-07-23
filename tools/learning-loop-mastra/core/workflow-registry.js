import { globMatch } from "./gate-logic.js";

// `recommended_tools` is vacated pending a real index/capability subsystem.
// The previous values — index_extract, index_validate, capability_generate —
// referenced tools that were deleted in plan 260612-1700-meta-surface-re-debate
// (13 product-surface MCP tools deleted) or never shipped. The handlers
// (trigger-workflow-tool.js, notify-artifact-tool.js) guard with `?? []` so
// the field is REQUIRED on each entry (field removal would crash `def.recommended_tools.join(...)`)
// but may be empty. Adding back future tools is a deliberate registry edit.
export const WORKFLOW_REGISTRY = {
  "evidence-changed": {
    triggers: ["records/*/evidence/**"],
    change_types: ["created", "updated"],
    recommended_tools: []
  },
  "capability-changed": {
    triggers: ["records/*/capabilities/**"],
    change_types: ["created", "updated"],
    recommended_tools: []
  },
  "index-changed": {
    triggers: ["records/*/index/**"],
    change_types: ["created", "updated"],
    recommended_tools: []
  }
};

/**
 * Evaluate a file change against the workflow registry.
 * @param {string} path - File path that changed
 * @param {string} change_type - "created", "updated", or "deleted"
 * @returns {{ matched: string[], recommendations: string[] }}
 */
export function evaluateTriggers(path, change_type) {
  const normalized = path.replace(/^\.\//, "");
  const matched = [];
  const recommendations = [];

  for (const [name, def] of Object.entries(WORKFLOW_REGISTRY)) {
    const triggerMatch = def.triggers.some((t) => globMatch(t, normalized));
    const typeMatch = def.change_types.includes(change_type);
    if (triggerMatch && typeMatch) {
      matched.push(name);
      recommendations.push(...(def.recommended_tools ?? []));
    }
  }

  const deduped = [...new Set(recommendations)];
  return { matched, recommendations: deduped };
}
