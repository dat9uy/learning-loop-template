import { globMatch } from "./gate-logic.js";

export const WORKFLOW_REGISTRY = {
  "evidence-changed": {
    triggers: ["records/*/evidence/**"],
    change_types: ["created", "updated"],
    recommended_tools: ["index_extract", "index_validate"]
  },
  "capability-changed": {
    triggers: ["records/*/capabilities/**"],
    change_types: ["created", "updated"],
    recommended_tools: ["index_validate", "capability_generate"]
  },
  "index-changed": {
    triggers: ["records/*/index/**"],
    change_types: ["created", "updated"],
    recommended_tools: ["index_validate"]
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
      recommendations.push(...def.recommended_tools);
    }
  }

  const deduped = [...new Set(recommendations)];
  return { matched, recommendations: deduped };
}
