import { metaStateRuleEntrySchema } from "../meta-state.js";
import { checkResolutionEvidence, projectHasLearningLoopMcp } from "../gate-logic.js";
import { deepFreeze } from "./deep-freeze.js";
import { inboundFromLoopDesign } from "./inbound-from-loop-design.js";

export function createRule(data) {
  const parsed = metaStateRuleEntrySchema.parse(data);
  return deepFreeze({
    kind: "rule",
    data: parsed,
    schema: metaStateRuleEntrySchema,

    isActive()           { return parsed.status === "active"; },
    isConsultChecklist() { return parsed.pattern_type === "consult-checklist"; },

    matches(command, filePath) {
      if (parsed.pattern_type === "consult-checklist" || parsed.pattern_type === "resolution-evidence-required") {
        return false;
      }
      if (parsed.pattern_type === "regex" && command) {
        try {
          return new RegExp(parsed.pattern).test(command);
        } catch {
          return false;
        }
      }
      // Glob matching is implemented in `gate-logic.globMatch` (canonical gate
      // evaluation path). The factory's matches() is a parallel reference impl
      // for regex only; glob is intentionally rejected here so callers route
      // through the canonical evaluator rather than this stub.
      return false;
    },

    appliesTo(root) {
      if (!parsed.scope_predicate || parsed.scope_predicate === "none") return true;
      if (parsed.scope_predicate === "project_has_learning_loop_mcp") {
        return projectHasLearningLoopMcp(root);
      }
      return true;
    },

    async checkResolutionEvidence(root) {
      return checkResolutionEvidence(parsed, root);
    },

    supersedes(other) {
      return parsed.supersedes === other.data?.id;
    },

    outboundRefs() {
      const refs = [];
      if (parsed.origin) {
        refs.push({ kind: "finding", id: parsed.origin, field: "origin" });
      }
      if (parsed.supersedes) {
        refs.push({ kind: "rule", id: parsed.supersedes, field: "supersedes" });
      }
      if (parsed.applies_to_resolution) {
        refs.push({ kind: "finding", id: parsed.applies_to_resolution, field: "applies_to_resolution" });
      }
      return refs;
    },

    inboundRefs(root) {
      const refs = [];
      const seenPromotedFrom = new Set();

      // Dual-field migration: rule.origin is the canonical promoted_to_rule ref.
      // Always report this, even if the finding no longer exists in the registry
      // (matches buildInverseIndexes behavior at loop-introspect.js:328-330).
      if (parsed.origin) {
        refs.push({ kind: "finding", id: parsed.origin, field: "promoted_to_rule" });
        seenPromotedFrom.add(parsed.origin);
      }

      for (const entry of root) {
        const kind = entry.entry_kind ?? "finding";
        // Direct: finding.promoted_to_rule === this rule (avoid duplicate from dual-field)
        if (kind === "finding" && entry.promoted_to_rule === parsed.id && !seenPromotedFrom.has(entry.id)) {
          refs.push({ kind: "finding", id: entry.id, field: "promoted_to_rule" });
          seenPromotedFrom.add(entry.id);
        }
        if (kind === "rule" && entry.supersedes === parsed.id) {
          refs.push({ kind: "rule", id: entry.id, field: "supersedes" });
        }
        if (kind === "loop-design") refs.push(...inboundFromLoopDesign(entry, parsed));
      }
      return refs;
    },
  });
}
