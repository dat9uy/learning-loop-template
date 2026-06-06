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
        result.loop_design_count = introspect.listLoopDesigns(root).length;
      } else if (tier === "hot") {
        result.tools = tools.map((t) => ({ name: t.name }));
        result.rules = promotedRules.map((r) => ({
          rule_id: r.rule_id,
          pattern_type: r.pattern_type,
          pattern: r.pattern,
        }));
        result.rule_count = promotedRules.length;
      } else if (tier === "warm") {
        result.tools = tools.map((t) => ({
          name: t.name,
          description: t.description,
        }));
        result.record_types = recordTypes;
        result.gate_patterns = Object.keys(gatePatterns);
        result.rules = promotedRules.map((r) => ({
          rule_id: r.rule_id,
          pattern_type: r.pattern_type,
          pattern: r.pattern,
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
        result.rule_count = promotedRules.length;
        result.loop_design_count = introspect.listLoopDesigns(root).length;
        result.discoverability_hints = introspect.buildDiscoverabilityHints();
      } else if (tier === "cold") {
        result.tools = tools.map((t) => ({
          name: t.name,
          description: t.description,
        }));
        result.record_types = recordTypes;
        result.gate_patterns = gatePatterns;
        result.rules = promotedRules;
        result.active_findings = activeFindings;
        result.all_findings = introspect.listAllFindings(root, { categories });
        result.anti_patterns = antiPatterns;
        result.loop_designs = introspect.listLoopDesigns(root).map((d) => ({
          id: d.id,
          title: d.title,
          status: d.status,
          proposed_design_for: d.proposed_design_for,
          addresses: d.addresses,
          shipped_in_plan: d.shipped_in_plan,
          shipped_at: d.shipped_at,
          severity_hint: d.severity_hint,
          affected_system: d.affected_system,
        }));

        // Superseded lineage surface (Phase 3 of plan 260605):
        // group all finding entries with status='superseded' and a consolidated_into
        // pointer by their canonical change-log entry. Orphans (consolidated_into
        // points to a non-existent change-log) are surfaced in a separate array.
        const allEntries = introspect.readAllEntriesForLineage(root);
        const changeLogMap = new Map(
          allEntries
            .filter((e) => e.entry_kind === "change-log")
            .map((cl) => [cl.id, cl]),
        );
        const superseded = allEntries.filter(
          (e) => e.entry_kind !== "change-log" && e.status === "superseded" && typeof e.consolidated_into === "string",
        );
        const groups = new Map();
        const orphans = [];
        for (const f of superseded) {
          const target = changeLogMap.get(f.consolidated_into);
          if (!target) {
            orphans.push({ id: f.id, consolidated_into: f.consolidated_into, note: "change-log not found" });
            continue;
          }
          if (!groups.has(target.id)) groups.set(target.id, { change_log: target, findings: [] });
          groups.get(target.id).findings.push(f);
        }
        const lineage = Array.from(groups.values())
          .map((g) => ({
            change_log: g.change_log,
            findings: g.findings.sort((a, b) => a.id.localeCompare(b.id)),
          }))
          .sort((a, b) => (b.change_log.created_at || "").localeCompare(a.change_log.created_at || ""));
        result.superseded_lineage = lineage;
        if (orphans.length > 0) {
          result.orphans = orphans;
        }
        result.discoverability_hints = introspect.buildDiscoverabilityHints();
      }

      result.degraded = degraded || warnings.length > 0;
      if (warnings.length > 0) {
        result.warnings = warnings;
      }
    } catch (err) {
      result.degraded = true;
      result.warnings = [err.message];
      result.tools = [];
      result.rules = [];
      result.active_findings = [];
    }

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
};
