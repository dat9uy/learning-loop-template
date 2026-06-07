import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readRegistry, META_STATE_FINDING_CATEGORIES } from "./meta-state.js";
import { loadPromotedRules } from "./gate-logic.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MCP_ROOT = dirname(__dirname);

/**
 * Safely import a module with a timeout.
 */
async function importWithTimeout(path, timeoutMs = 1000) {
  return Promise.race([
    import(path),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Import timeout")), timeoutMs)
    ),
  ]);
}

/**
 * List all tools from manifest.json, importing each module to read its description.
 * Returns array of { name, description? }.
 * Failed imports use manifest file path as fallback.
 */
export async function listAllTools(root) {
  const manifestPath = join(MCP_ROOT, "tools", "manifest.json");
  if (!existsSync(manifestPath)) return [];

  let manifest = [];
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    return [];
  }

  const tools = [];
  let failures = 0;

  for (const mod of manifest) {
    const filePath = join(MCP_ROOT, mod.file.replace(/^\.\//, ""));
    try {
      const imported = await importWithTimeout(filePath, 1000);
      const toolConfig = imported[mod.export];
      if (toolConfig) {
        tools.push({
          name: toolConfig.name,
          description: toolConfig.description,
        });
      } else {
        tools.push({ name: mod.export, file: mod.file });
        failures++;
      }
    } catch {
      tools.push({ name: mod.export, file: mod.file });
      failures++;
    }
  }

  return { tools, degraded: failures >= 3, failures };
}

/**
 * List all record types from schemas/*.schema.json.
 */
export function listAllRecordTypes(root) {
  const schemasDir = join(root, "schemas");
  if (!existsSync(schemasDir)) return [];

  try {
    return readdirSync(schemasDir)
      .filter((f) => f.endsWith(".schema.json"))
      .map((f) => f.replace(".schema.json", ""));
  } catch {
    return [];
  }
}

/**
 * List all meta-state finding categories. Source of truth is
 * META_STATE_FINDING_CATEGORIES in core/meta-state.js (kept in sync
 * with the metaStateFindingEntrySchema zod enum).
 */
export function listAllMetaCategories() {
  return [...META_STATE_FINDING_CATEGORIES];
}

const DISCOVERABILITY_HINTS = Object.freeze([
  "To cite a thing, point at the code: `meta_state_report({ evidence_code_ref: 'path/to/file.js:line' })`. The loop will hash and re-check it.",
  "For `source_refs`, prefer `local:meta-state:<id>` (cite a finding). Markdown refs (`local:plans/...`) are accepted for the escape hatch but discouraged.",
  "Run `meta_state_derive_status({ id })` to re-check if a finding is still true. Run `meta_state_refresh_fingerprint({ id })` to re-hash the code after a refactor.",
  "For designs without code, cite the change-log that records the design (`meta_state_log_change` with `change_target: '<plan-path>'`).",
  "Findings have 5 statuses: `reported` (24h TTL), `active` (operator-acked), `resolved` (closed), `expired` (TTL elapsed), `superseded` (consolidated into a change-log).",
  "For rule and loop-design lifecycle, use `meta_state_list({ entry_kind: 'rule' | 'loop-design' })` (Phase 3) or `loop_describe({ tier: 'cold' })` (Phase 4). The cold tier surfaces a `loop_designs` list with `id`, `title`, `proposed_design_for`, `addresses`, and `shipped_in_plan`.",
]);

/**
 * Return the operator-curated discoverability hints used by loop_describe
 * warm tier and the SessionStart hook. Pure function — no I/O.
 */
export function buildDiscoverabilityHints() {
  return DISCOVERABILITY_HINTS;
}

/**
 * List all gate constraint patterns from patterns.json.
 */
export function listAllGatePatterns(root) {
  const patternsPath = join(MCP_ROOT, "core", "patterns.json");
  if (!existsSync(patternsPath)) return {};

  try {
    return JSON.parse(readFileSync(patternsPath, "utf8"));
  } catch {
    return {};
  }
}

/**
 * List active findings (reported or active status) from meta-state.
 */
export function listActiveFindings(root, { categories } = {}) {
  const entries = readRegistry(root);
  const activeStatuses = new Set(["reported", "active"]);
  let findings = entries.filter((e) => activeStatuses.has(e.status) && e.entry_kind === "finding");
  if (categories && categories.length > 0) {
    findings = findings.filter((e) => categories.includes(e.category));
  }
  return findings;
}

/**
 * List anti-pattern findings (loop-anti-pattern category, non-terminal status).
 */
export function listAntiPatterns(root, { categories } = {}) {
  const entries = readRegistry(root);
  const TERMINAL_STATUSES = new Set(["auto-resolved", "expired", "resolved"]);
  let findings = entries.filter(
    (e) => e.category === "loop-anti-pattern" && !TERMINAL_STATUSES.has(e.status)
  );
  if (categories && categories.length > 0) {
    findings = findings.filter((e) => categories.includes(e.category));
  }
  return findings;
}

/**
 * List all findings regardless of status (for cold tier audit).
 */
export function listAllFindings(root, { categories } = {}) {
  const entries = readRegistry(root);
  let findings = entries.filter((e) => e.entry_kind === "finding");
  if (categories && categories.length > 0) {
    findings = findings.filter((e) => categories.includes(e.category));
  }
  return findings;
}

/**
 * List promoted rules (active gate-enforced rules).
 * Only returns command-path rules (regex/glob) for discoverability surfaces.
 * resolution-evidence-required rules are not discoverable via command/path matching.
 *
 * Phase 4: synthesizes backward-compatible shape from both entry_kind="rule"
 * (first-class) and legacy finding entries with promoted_to_rule.
 */
export function listPromotedRules(root) {
  const rules = loadPromotedRules(root);
  return rules
    .filter((r) => r.promoted_to_rule?.pattern_type !== "resolution-evidence-required")
    .map((r) => {
      if (r.entry_kind === "rule") {
        return {
          id: r.id,
          rule_id: r.id,
          pattern_type: r.pattern_type,
          pattern: r.pattern,
          enforcement: r.enforcement,
          status: r.status,
          origin: r.origin,
          scope_predicate: r.scope_predicate,
          applies_to_resolution: r.applies_to_resolution,
          description: r.description,
        };
      }
      return {
        id: r.id,
        rule_id: r.promoted_to_rule.rule_id,
        pattern_type: r.promoted_to_rule.pattern_type,
        pattern: r.promoted_to_rule.pattern,
        enforcement: r.promoted_to_rule.enforcement,
        status: r.status,
        origin: r.promoted_to_rule.promoted_at,
      };
    });
}

/**
 * List active loop-design entries from the meta-state registry.
 * Defaults to active status only.
 */
export function listLoopDesigns(root, { statuses = ["active"] } = {}) {
  const entries = readRegistry(root);
  return entries.filter(
    (e) => e.entry_kind === "loop-design" && statuses.includes(e.status)
  );
}

/**
 * Read all entries (finding + change-log) from the meta-state registry.
 * Used by loop_describe cold tier to compute the superseded_lineage surface
 * (Phase 3 of plan 260605). Returns an array of entry objects (no filtering).
 */
export function readAllEntriesForLineage(root) {
  return readRegistry(root);
}

/**
 * Build inverse indexes from a flat array of entries.
 * Returns 4 maps for O(1) relationship lookup.
 *
 * - addresses_inverse: Map<loop-design.id, finding.id[]>
 * - supersedes_inverse: Map<change-log.id, entry.id[]>
 * - origin_inverse: Map<finding.id, rule.id[]>
 * - promoted_to_rule_inverse: Map<rule.id, finding.id[]>
 *
 * Pure function — O(N) over entries. No I/O.
 */
export function buildInverseIndexes(entries) {
  const addressesInverse = new Map();
  const supersedesInverse = new Map();
  const originInverse = new Map();
  const promotedToRuleInverse = new Map();

  for (const entry of entries) {
    // addresses: loop-design -> findings that address it
    if (entry.entry_kind === "loop-design" && Array.isArray(entry.addresses)) {
      for (const findingId of entry.addresses) {
        if (!addressesInverse.has(findingId)) addressesInverse.set(findingId, []);
        addressesInverse.get(findingId).push(entry.id);
      }
    }

    // supersedes: change-log -> entries it supersedes
    if (entry.entry_kind === "change-log" && entry.supersedes) {
      const targetId = entry.supersedes;
      if (!supersedesInverse.has(targetId)) supersedesInverse.set(targetId, []);
      supersedesInverse.get(targetId).push(entry.id);
    }

    // origin: finding -> rules that originated from it
    if (entry.entry_kind === "rule" && entry.origin) {
      const findingId = entry.origin;
      if (!originInverse.has(findingId)) originInverse.set(findingId, []);
      originInverse.get(findingId).push(entry.id);
    }

    // promoted_to_rule: rule.id -> findings that promoted it
    if (entry.promoted_to_rule && typeof entry.promoted_to_rule === "string") {
      const ruleId = entry.promoted_to_rule;
      if (!promotedToRuleInverse.has(ruleId)) promotedToRuleInverse.set(ruleId, []);
      promotedToRuleInverse.get(ruleId).push(entry.id);
    }
  }

  return {
    addresses_inverse: addressesInverse,
    supersedes_inverse: supersedesInverse,
    origin_inverse: originInverse,
    promoted_to_rule_inverse: promotedToRuleInverse,
  };
}

/**
 * Build a registry summary from all entries.
 * Returns { counts, coverage, top_references, drift }.
 * Pure function — O(N) over entries. No I/O.
 */
export function buildRegistrySummary(entries) {
  const counts = {};
  for (const entry of entries) {
    const kind = entry.entry_kind || "finding";
    const status = entry.status || "unknown";
    if (!counts[kind]) counts[kind] = {};
    counts[kind][status] = (counts[kind][status] || 0) + 1;
  }

  const resolved = entries.filter((e) => e.entry_kind === "finding" && e.status === "resolved");
  const mechanismCheckCount = resolved.filter((e) => e.mechanism_check === true).length;
  const coverage = {
    resolved_total: resolved.length,
    mechanism_check_count: mechanismCheckCount,
    mechanism_check_pct: resolved.length > 0 ? Math.round((mechanismCheckCount / resolved.length) * 100) : 0,
    broken_refs: 0,
    orphan_count: 0,
  };

  // Count broken refs (proposed_design_for pointing to non-existent ids)
  const entryIds = new Set(entries.map((e) => e.id));
  const loopDesigns = entries.filter((e) => e.entry_kind === "loop-design");
  for (const design of loopDesigns) {
    if (design.proposed_design_for) {
      for (const ref of design.proposed_design_for) {
        if (!entryIds.has(ref)) coverage.broken_refs++;
      }
    }
  }

  // Count orphan findings
  for (const entry of entries) {
    if (entry.entry_kind !== "finding") continue;
    if (entry.consolidated_into || entry.promoted_to_rule) continue;
    const hasDesign = loopDesigns.some((d) => d.addresses?.includes(entry.id));
    if (!hasDesign) coverage.orphan_count++;
  }

  // Top references: most-cited entry ids (sum of inverse-index sizes)
  const inverse = buildInverseIndexes(entries);
  const citationCounts = new Map();
  for (const map of [inverse.addresses_inverse, inverse.supersedes_inverse, inverse.origin_inverse, inverse.promoted_to_rule_inverse]) {
    for (const [id, refs] of map.entries()) {
      citationCounts.set(id, (citationCounts.get(id) || 0) + refs.length);
    }
  }
  const topReferences = Array.from(citationCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => ({ id, count }));

  // Drift: most recent active findings with mechanism_check=true
  const driftEntries = entries
    .filter((e) => e.entry_kind === "finding" && e.mechanism_check === true && e.status !== "resolved")
    .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
    .slice(0, 5)
    .map((e) => ({
      id: e.id,
      status: e.status,
      created_at: e.created_at,
      code_fingerprint: e.code_fingerprint || null,
    }));

  return {
    counts,
    coverage,
    top_references: topReferences,
    drift: driftEntries,
    last_generated_at: new Date().toISOString(),
  };
}

/**
 * Summarize a meta-state entry into a compact shape.
 * Returns id, entry_kind, status, ref fields, and a 200-char description preview.
 * Pure function — no I/O.
 */
export function summarize(entry) {
  const compact = {
    id: entry.id,
    entry_kind: entry.entry_kind,
    status: entry.status,
  };

  // Relationship fields
  if (entry.origin) compact.origin = entry.origin;
  if (entry.addresses) compact.addresses = entry.addresses;
  if (entry.consolidated_into) compact.consolidated_into = entry.consolidated_into;
  if (entry.supersedes) compact.supersedes = entry.supersedes;
  if (entry.promoted_to_rule) compact.promoted_to_rule = entry.promoted_to_rule;
  if (entry.proposed_design_for) compact.proposed_design_for = entry.proposed_design_for;

  // Metadata fields
  if (entry.created_at) compact.created_at = entry.created_at;
  if (entry.severity) compact.severity = entry.severity;
  if (entry.affected_system) compact.affected_system = entry.affected_system;
  if (entry.category) compact.category = entry.category;
  if (entry.subtype) compact.subtype = entry.subtype;
  if (entry.title) compact.title = entry.title;
  if (entry.rule_id) compact.rule_id = entry.rule_id;
  if (entry.enforcement) compact.enforcement = entry.enforcement;
  if (entry.pattern_type) compact.pattern_type = entry.pattern_type;
  if (entry.pattern) compact.pattern = entry.pattern;
  if (entry.scope_predicate) compact.scope_predicate = entry.scope_predicate;
  if (entry.applies_to_resolution) compact.applies_to_resolution = entry.applies_to_resolution;
  if (entry.shipped_in_plan) compact.shipped_in_plan = entry.shipped_in_plan;
  if (entry.shipped_at) compact.shipped_at = entry.shipped_at;
  if (entry.severity_hint) compact.severity_hint = entry.severity_hint;
  if (entry.promoted_at) compact.promoted_at = entry.promoted_at;
  if (entry.promoted_by) compact.promoted_by = entry.promoted_by;
  if (entry.refined_at) compact.refined_at = entry.refined_at;
  if (entry.refined_by) compact.refined_by = entry.refined_by;
  if (entry.refinement_reason) compact.refinement_reason = entry.refinement_reason;
  if (entry.resolution) compact.resolution = entry.resolution;
  if (entry.resolved_by) compact.resolved_by = entry.resolved_by;
  if (entry.resolved_at) compact.resolved_at = entry.resolved_at;
  if (entry.version !== undefined) compact.version = entry.version;

  // Description preview
  const desc = entry.description || "";
  if (desc.length > 200) {
    compact.description_preview = desc.slice(0, 200) + "...";
  } else {
    compact.description_preview = desc;
  }

  return compact;
}
