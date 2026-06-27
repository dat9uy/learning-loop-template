import { createFinding } from "./finding.js";
import { createRule } from "./rule.js";
import { createChangeLog } from "./change-log.js";
import { createLoopDesign } from "./loop-design.js";
import { readRegistry } from "../meta-state.js";
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

/**
 * Validate cross-references: every outbound ref must point at an existing entry.
 * Returns { orphans: [{ from, to, field }] }.
 */
export function validateCrossRefs(root) {
  const entries = Array.isArray(root) ? root : readRegistry(root);
  const orphans = [];
  for (const entry of entries) {
    const factory = factoryFor(entry);
    for (const ref of factory.outboundRefs()) {
      const target = entries.find(
        (e) => e.id === ref.id && (e.entry_kind ?? "finding") === ref.kind,
      );
      if (!target) {
        orphans.push({ from: entry.id, to: ref.id, field: ref.field });
      }
    }
  }
  return { orphans };
}

/**
 * Alias for validateCrossRefs(root).orphans.
 */
export function findOrphans(root) {
  return validateCrossRefs(root).orphans;
}

/**
 * Build outbound refs for every entry in the registry.
 * Returns a Map<id, Array<{ kind, id, field }>>.
 */
export function outboundRefsAll(root) {
  const entries = Array.isArray(root) ? root : readRegistry(root);
  const graph = new Map();
  for (const entry of entries) {
    const factory = factoryFor(entry);
    graph.set(entry.id, factory.outboundRefs());
  }
  return graph;
}
