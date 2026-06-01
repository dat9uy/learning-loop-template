import { z } from "zod";
import { resolveRoot } from "#lib/resolve-root.js";
import * as introspect from "#mcp/core/loop-introspect.js";

export const loopDescribeTool = {
  name: "loop_describe",
  description: "Return the loop's current operational surface. **Recommended: call at session start to discover what the loop offers.** Supports tiered reads (hot/warm/cold/summary) to control context bloat.",
  schema: {
    tier: z.enum(["hot", "warm", "cold", "summary"]).optional()
      .describe("Read tier: hot=active rules only (~5KB), warm=active surface (default, 10-25KB), cold=full history (25-100KB), summary=counts only (<1KB)"),
    categories: z.array(z.string()).optional()
      .describe("Optional filter: only return entries matching these meta-state categories"),
  },
  handler: async ({ tier = "warm", categories }) => {
    const root = resolveRoot();
    const result = { tier };
    const warnings = [];

    try {
      const { tools, degraded, failures } = await introspect.listAllTools(root);
      const recordTypes = introspect.listAllRecordTypes(root);
      const gatePatterns = introspect.listAllGatePatterns(root);
      const promotedRules = introspect.listPromotedRules(root);
      const activeFindings = introspect.listActiveFindings(root, { categories });
      const antiPatterns = introspect.listAntiPatterns(root, { categories });

      if (degraded) {
        warnings.push(`${failures} tool module imports failed; using manifest fallback`);
      }

      if (tier === "summary") {
        result.tool_count = tools.length;
        result.record_type_count = recordTypes.length;
        result.rule_count = promotedRules.length;
        result.active_finding_count = activeFindings.length;
      } else if (tier === "hot") {
        result.tools = tools.map((t) => ({ name: t.name }));
        result.promoted_rules = promotedRules.map((r) => ({
          rule_id: r.promoted_to_rule.rule_id,
          pattern_type: r.promoted_to_rule.pattern_type,
          pattern: r.promoted_to_rule.pattern,
        }));
        result.rule_count = promotedRules.length;
      } else if (tier === "warm") {
        result.tools = tools.map((t) => ({
          name: t.name,
          description: t.description,
        }));
        result.record_types = recordTypes;
        result.gate_patterns = Object.keys(gatePatterns);
        result.promoted_rules = promotedRules.map((r) => ({
          rule_id: r.promoted_to_rule.rule_id,
          pattern_type: r.promoted_to_rule.pattern_type,
          pattern: r.promoted_to_rule.pattern,
        }));
        result.active_findings = activeFindings.map((f) => ({
          id: f.id,
          category: f.category,
          status: f.status,
          description: f.description,
        }));
        result.anti_patterns = antiPatterns.map((f) => ({
          id: f.id,
          subtype: f.subtype,
          status: f.status,
          description: f.description,
        }));
      } else if (tier === "cold") {
        result.tools = tools.map((t) => ({
          name: t.name,
          description: t.description,
        }));
        result.record_types = recordTypes;
        result.gate_patterns = gatePatterns;
        result.promoted_rules = promotedRules;
        result.active_findings = activeFindings;
        result.all_findings = introspect.listAllFindings(root, { categories });
        result.anti_patterns = antiPatterns;
      }

      result.degraded = degraded || warnings.length > 0;
      if (warnings.length > 0) {
        result.warnings = warnings;
      }
    } catch (err) {
      result.degraded = true;
      result.warnings = [err.message];
      result.tools = [];
      result.promoted_rules = [];
      result.active_findings = [];
    }

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
};
