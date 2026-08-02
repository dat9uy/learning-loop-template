import { createFinding } from "./finding.js";
import { createRule } from "./rule.js";
import { createChangeLog } from "./change-log.js";
import { createLoopDesign } from "./loop-design.js";
import { deepFreeze } from "./deep-freeze.js";

export { createFinding, createRule, createChangeLog, createLoopDesign, deepFreeze };

/**
 * Dispatch by entry_kind. Default entry_kind to "finding" for legacy registry
 * rows missing it — mirrors the post-load coercion in core/meta-state.js.
 */
export function factoryFor(entry) {
  const kind = entry.entry_kind ?? "finding";
  switch (kind) {
    case "finding":     return createFinding(entry);
    case "rule":        return createRule(entry);
    case "change-log":  return createChangeLog(entry);
    case "loop-design": return createLoopDesign(entry);
    default:
      throw new Error(`Unknown entry_kind: ${kind}`);
  }
}
