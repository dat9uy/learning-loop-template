import { metaStateRuleEntrySchema } from "../meta-state.js";
import { checkResolutionEvidence, projectHasLearningLoopMcp } from "../gate-logic.js";
import { deepFreeze } from "./deep-freeze.js";
import { forwardRefs, inverseRefs } from "./relationship-graph.js";

export function createRule(data) {
  // status:"archived" is schema-valid on the rule enum (deleteEntry
  // appends tombstones for non-change-log kinds).
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
      // Phase 4: `rule.supersedes` predicate is now derived from the
      // `citations_inverse` map (the on-record `supersedes` field is
      // inert-historical). `parsed.supersedes` is retained for legacy
      // on-disk value reads; the predicate is sourced from citations
      // via the graph layer (see `inverseRefs`).
      // Legacy predicate (preserved for callers that pass the on-record
      // field): if a value is present, it still matches.
      if (parsed.supersedes && parsed.supersedes === other.data?.id) return true;
      return false;
    },

    outboundRefs(entries) {
      // Delegate to the centralized graph. Single source of truth.
      // Phase 4: `origin` + `supersedes` were de-routed from CROSS_REFS,
      // so outboundRefs for a rule entry now returns [] for the
      // relationship fields (only `applies_to_resolution` remains as a
      // forwardOnly field).
      return forwardRefs(parsed, entries);
    },

    inboundRefs(root) {
      // Phase 4: the dual-field ghost-ref for `promoted_to_rule` is
      // removed. The canonical promotion edge is now a citation row
      // (source:rule, target:finding, rationale:"origin"); inverseRefs
      // surfaces the citing finding via the citation's `target` field
      // substitution. The rule's on-record `origin` field is
      // inert-historical; `promoted_to_rule_inverse` is also retired
      // (its only source was rule.origin, which is now a citation).
      return inverseRefs(parsed.id, root);
    },
  });
}
