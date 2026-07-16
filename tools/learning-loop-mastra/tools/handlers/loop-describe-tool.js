import { z } from "zod";
import { resolveRoot } from "#lib/resolve-root.js";
import { stripEnvelope } from "../../core/envelope-stripper.js";
import * as introspect from "../../core/loop-introspect.js";
import { readRegistry, readFileIndex } from "../../core/meta-state.js";
import { readColdTierCache, writeColdTierCache } from "../../core/loop-introspect-cache.js";
import { computeRegistryStats } from "../../core/registry-stats.js";

/**
 * Reduce a multi-sentence tool description to a one-line at-a-glance summary
 * for the warm-tier index. Caps at ~120 chars so the warm tools list stays
 * compact; the full description lives in tool-selection-guide.md. Returns the
 * empty string unchanged so callers can distinguish "no description" from
 * "truncated".
 */
function firstSentence(description) {
  if (typeof description !== "string" || description.length === 0) return description ?? "";
  const first = description.split(/(?<=\.)\s/)[0];
  return first.length <= 120 ? first : `${first.slice(0, 117)}…`;
}

export const loopDescribeTool = {
  name: "loop_describe",
  description: "Return the loop's current operational surface. **Recommended: call at session start to discover what the loop offers.** Supports tiered reads (hot/warm/cold/summary) to control context bloat. Use when you need to know what the loop offers, what rules are enforced, or what findings are active. The warm tier's `discoverability_hints` block surfaces short reminders of the loop's rules. Not for mutating state (use the `meta_state_*` or `record_*` tools instead).",
  schema: {
    tier: z.enum(["hot", "warm", "cold", "summary"]).optional()
      .describe("Read tier: hot=active rules only (~5KB), warm=active surface index (default, ~25KB — id+classifier only; full text via meta_state_list({id}) / loop_get_instruction), cold=full history (25-100KB), summary=counts only (<1KB)"),
    // Wire-format envelope stripper — accepts both bare arrays and {item:[...]}-wrapped
    // arrays so the MCP SDK's auto-coercion doesn't silently drop the category filter.
    // See meta-260709T1316Z-recurring-mcp-wire-format-coercion-array-fields-silently-coe.
    categories: z.preprocess(stripEnvelope, z.array(z.string())).optional()
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
        result.substrates = introspect.listSubstrates();
      } else if (tier === "hot") {
        result.tools = tools.map((t) => ({ name: t.name }));
        result.rules = promotedRules.map((r) => ({
          rule_id: r.rule_id,
          pattern_type: r.pattern_type,
          pattern: r.pattern,
        }));
        result.rule_count = promotedRules.length;
      } else if (tier === "warm") {
        // Warm tier is an INDEX, not a full dump. Full prose lives behind
        // per-id lookups so the active surface stays within its documented
        // 10-25KB budget (before this compaction warm returned ~117KB,
        // dominated by per-entry descriptions). See lookup_hint below.
        result.tools = tools.map((t) => ({
          name: t.name,
          description: firstSentence(t.description),
        }));
        result.record_types = recordTypes;
        result.gate_patterns = Object.keys(gatePatterns);
        result.rules = promotedRules.map((r) => ({
          rule_id: r.rule_id,
          pattern_type: r.pattern_type,
        }));
        result.active_findings = activeFindings.map((f) => ({
          id: f.id,
          category: f.category,
          status: f.status,
        }));
        result.anti_patterns = antiPatterns.map((f) => ({
          id: f.id,
          subtype: f.subtype,
          status: f.status,
        }));
        result.lookup_hint =
          "Warm tier is an index. For a finding/anti-pattern/rule's full text, call meta_state_list({id:['<id>']}); for a hint's detail, loop_get_instruction({key}); for tool when/inputs, see tools/learning-loop-mastra/tools/handlers/references/tool-selection-guide.md.";
        result.rule_count = promotedRules.length;
        result.loop_design_count = introspect.listLoopDesigns(root).length;
        result.substrates = introspect.listSubstrates();

        // No expired-status advisory; status was removed in plan 260611-1000-remove-expired-status.
        const allEntries = readRegistry(root);

        // Registry summary (Phase 7 of plan 260606)
        const lineageStart = Date.now();
        const lineageMs = Date.now() - lineageStart;
        result.registry_summary = introspect.buildRegistrySummary(allEntries, readFileIndex(root));
        // Plan 260716-1101 Tier 2 Phase C: surface compaction stats from the
        // shared core helper (NOT a shell subprocess from the MCP server).
        const registryStats = computeRegistryStats(root);
        result.registry_stats = registryStats;
        // Compaction action hook (H7 mitigation): when eligible, surface a
        // single-shot hint pointing at the shell script. Kept separate from
        // DISCOVERABILITY_HINTS so the 16-string invariant stays intact.
        if (registryStats.compaction_eligible) {
          result.compaction_action_hook = `Registry compaction eligible at ${registryStats.raw_lines} raw lines — run \`pnpm exec compact-registry.sh --full\` to drop superseded versions (keep-latest-tombstone-per-id).`;
        }
        // M5: surface readAllEntriesForLineage cost so operators can monitor
        // warm-tier latency growth as the registry grows.
        result.discoverability_hints = introspect.buildDiscoverabilityHints();
        result.process_hints = introspect.buildProcessHints();

        // H6 ordering gate: every agent-checklist rule must have a PROCESS_HINTS row.
        const processHints = result.process_hints;
        for (const rule of promotedRules) {
          if (rule.pattern_type === "agent-checklist") {
            const hasHint = processHints.some((h) => h.includes(rule.id));
            if (!hasHint) {
              warnings.push(
                `H6 ordering gate: agent-checklist rule "${rule.id}" has no corresponding PROCESS_HINTS row. ` +
                `Add a hint referencing this rule to core/loop-introspect.js PROCESS_HINTS.`,
              );
            }
          }
        }

        result.timing = { readAllEntriesForLineage_ms: lineageMs };
      } else if (tier === "cold") {
        result.tools = tools.map((t) => ({
          name: t.name,
          description: t.description,
        }));
        result.record_types = recordTypes;
        result.gate_patterns = gatePatterns;
        result.substrates = introspect.listSubstrates();
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
              registry_summary: introspect.buildRegistrySummary(allEntries, readFileIndex(root)),
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
          reopens_inverse: Object.fromEntries(inverseIndexes.reopens_inverse),
          consolidated_into_inverse: Object.fromEntries(inverseIndexes.consolidated_into_inverse),
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
        result.process_hints = introspect.buildProcessHints();
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
