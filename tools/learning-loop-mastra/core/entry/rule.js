import { metaStateRuleEntrySchema } from "../meta-state.js";
import { checkResolutionEvidence, projectHasLearningLoopMcp } from "../gate-logic.js";
import { deepFreeze } from "./deep-freeze.js";
import { forwardRefs, inverseRefs } from "./relationship-graph.js";

export function createRule(data) {
  const parsed = metaStateRuleEntrySchema.parse(data);
  return deepFreeze({
    kind: "rule",
    data: parsed,
    schema: metaStateRuleEntrySchema,

    isActive()           { return parsed.status === "active"; },
    isAgentChecklist()   { return parsed.pattern_type === "agent-checklist"; },

    matches(command, filePath) {
      if (parsed.pattern_type === "agent-checklist" || parsed.pattern_type === "determinism-checklist") {
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

    outboundRefs(entries) {
      // Delegate to the centralized graph. Plan 260730-0240 single source of truth.
      return forwardRefs(parsed, entries);
    },

    inboundRefs(root) {
      // Inverse via the graph. Replaces the previous bespoke dual-field
      // dedup loop (seenPromotedFrom Set + manual entry-kind dispatch).
      const refs = inverseRefs(parsed.id, root);
      // Dual-field migration ghost-ref: rule.origin is the canonical
      // promoted_to_rule ref. Always emit it even when the finding no
      // longer exists in root (matches the legacy behavior locked by
      // `meta-state-relationships-snapshot.test.js`). Dedup against the
      // graph's inverseRefs result so a finding that IS in root AND has
      // promoted_to_rule is counted once.
      if (parsed.origin) {
        const seen = new Set(
          refs.filter((r) => r.field === "promoted_to_rule").map((r) => r.id)
        );
        if (!seen.has(parsed.origin)) {
          refs.push({ kind: "finding", id: parsed.origin, field: "promoted_to_rule" });
        }
      }
      return refs;
    },
  });
}
