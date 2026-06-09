import { z } from "zod";
import { resolveRoot } from "#lib/resolve-root.js";
import * as introspect from "#mcp/core/loop-introspect.js";
import { readColdTierCache, writeColdTierCache } from "#mcp/core/loop-introspect-cache.js";

export const loopDescribeTool = {
  name: "loop_describe",
  description: "Return the loop's current operational surface. **Recommended: call at session start to discover what the loop offers.** Supports tiered reads (hot/warm/cold/summary) to control context bloat. Use when you need to know what the loop offers, what rules are enforced, or what findings are active. The warm tier's `discoverability_hints` block surfaces 8 short reminders of the loop's rules. Not for mutating state (use the `meta_state_*` or `record_*` tools instead).",
  schema: {
    tier: z.enum(["hot", "warm", "cold", "summary"]).optional()
      .describe("Read tier: hot=active rules only (~5KB), warm=active surface (default, 10-25KB), cold=full history (25-100KB), summary=counts only (<1KB)"),
    categories: z.array(z.string()).optional()
      .describe("Optional filter: only return entries matching these meta-state categories"),
    description_mode: z.enum(["summary", "full"]).optional().default("full")
      .describe("Cold tier only: 'summary' returns 200-char description preview; 'full' returns full descriptions. Default: 'full' (no breaking change)"),
  },
  handler: async ({ tier = "warm", categories, description_mode = "full" }) => {
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

        // Registry summary (Phase 7 of plan 260606)
        const lineageStart = Date.now();
        const allEntries = introspect.readAllEntriesForLineage(root);
        const lineageMs = Date.now() - lineageStart;
        result.registry_summary = introspect.buildRegistrySummary(allEntries);
        // M5: surface readAllEntriesForLineage cost so operators can monitor
        // warm-tier latency growth as the registry grows.
        result.timing = { readAllEntriesForLineage_ms: lineageMs };
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

        // Sidecar cache for cold tier: check cache first, fall back to compute
        const cached = readColdTierCache(root);
        let allEntries;
        let lineageMs = 0;
        let cacheHit = false;
        let builtAt = new Date().toISOString();

        if (cached.hit) {
          allEntries = cached.payload.all_entries;
          cacheHit = true;
          builtAt = cached.built_at;
        } else {
          const lineageStart = Date.now();
          allEntries = introspect.readAllEntriesForLineage(root);
          lineageMs = Date.now() - lineageStart;

          // Write cache for next call
          try {
            const payload = {
              all_entries: allEntries,
              registry_summary: introspect.buildRegistrySummary(allEntries),
              inverse_indexes: Object.fromEntries(
                Object.entries(introspect.buildInverseIndexes(allEntries)).map(([k, v]) => [k, Object.fromEntries(v)])
              ),
            };
            writeColdTierCache(root, payload);
          } catch (cacheErr) {
            warnings.push(`Cache write failed: ${cacheErr.message}`);
          }
        }

        // Superseded lineage surface (Phase 3 of plan 260605):
        // group all finding entries with status='superseded' and a consolidated_into
        // pointer by their canonical change-log entry. Orphans (consolidated_into
        // points to a non-existent change-log) are surfaced in a separate array.
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

        // Inverse indexes (Phase 3 of plan 260606)
        const inverseIndexes = introspect.buildInverseIndexes(allEntries);
        result.inverse_indexes = {
          addresses_inverse: Object.fromEntries(inverseIndexes.addresses_inverse),
          supersedes_inverse: Object.fromEntries(inverseIndexes.supersedes_inverse),
          origin_inverse: Object.fromEntries(inverseIndexes.origin_inverse),
          promoted_to_rule_inverse: Object.fromEntries(inverseIndexes.promoted_to_rule_inverse),
        };

        // Evidence-code-ref coverage (Phase 3 dual-field schema unification)
        // Structural count arrays: only ids so baseline is stable across refactors
        // that change the evidence_code_ref path but keep the same count.
        result.findings_with_evidence_code_ref = activeFindings
          .filter((f) => typeof f.evidence_code_ref === "string" && f.evidence_code_ref.length > 0)
          .map((f) => ({ id: f.id }));
        result.change_logs_with_evidence_code_ref = allEntries
          .filter((e) => e.entry_kind === "change-log" && typeof e.evidence_code_ref === "string" && e.evidence_code_ref.length > 0)
          .map((e) => ({ id: e.id }));

        // Description mode (Phase 6 of plan 260606)
        if (description_mode === "summary") {
          result.all_findings = result.all_findings.map((f) => introspect.summarize(f));
          result.active_findings = result.active_findings.map((f) => introspect.summarize(f));
          result.anti_patterns = result.anti_patterns.map((f) => introspect.summarize(f));
          result.loop_designs = result.loop_designs.map((d) => introspect.summarize(d));
          result.rules = result.rules.map((r) => introspect.summarize(r));
        }
        result.description_mode = description_mode;

        result.discoverability_hints = introspect.buildDiscoverabilityHints();
        result.cache_hit = cacheHit;
        result.built_at = builtAt;
        result.timing = { readAllEntriesForLineage_ms: lineageMs };
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
