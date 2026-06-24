import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readRegistry, META_STATE_FINDING_CATEGORIES } from "./meta-state.js";
import { loadPromotedRules } from "./gate-logic.js";
import { readColdTierCache, writeColdTierCache } from "./loop-introspect-cache.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MCP_ROOT = dirname(dirname(__dirname));

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
function listAllMetaCategories() {
  return [...META_STATE_FINDING_CATEGORIES];
}

const DISCOVERABILITY_HINTS = Object.freeze([
  "To cite a thing, point at the code: `meta_state_report({ evidence_code_ref: 'path/to/file.js:line' })`. The loop will hash and re-check it.",
  "When you pass `evidence_code_ref` to `meta_state_report`, `mechanism_check` is auto-defaulted to `true` (so the loop will hash and re-check the code). Pass `mechanism_check: false` explicitly to opt out — the response will include a `warnings` array explaining the tradeoff.",
  "For `source_refs`, prefer `local:meta-state:<id>` (cite a finding). Markdown refs (`local:plans/...`) are accepted for the escape hatch but discouraged.",
  "Run `meta_state_derive_status({ id })` to re-check if a finding is still true. Run `meta_state_refresh_fingerprint({ id })` to re-hash the code after a refactor.",
  "For designs without code, cite the change-log that records the design (`meta_state_log_change` with `change_target: '<plan-path>'`).",
  "Findings have 6 statuses: `reported` (24h TTL), `active` (operator-acked), `stale` (past TTL or past staleness window; re-verifiable via meta_state_re_verify), `resolved` (closed), `superseded` (consolidated into a change-log), `auto-resolved` (closed by mechanism). The legacy `expired` status was removed in plan 260611-1000-remove-expired-status; only `stale` parents are cascade-closeable.",
  "For reopens: set reopens: ['<old_stale_id>'] on the new finding at report time, then cascade-resolve the parent via meta_state_resolve({id: old_id, cascade_from: [child_id]}). The cascade closes the stale parent in 1 step.",
  "For rule and loop-design lifecycle, use `meta_state_list({ entry_kind: 'rule' | 'loop-design' })` (Phase 3) or `loop_describe({ tier: 'cold' })` (Phase 4). The cold tier surfaces a `loop_designs` list with `id`, `title`, `proposed_design_for`, `addresses`, and `shipped_in_plan`.",
  "To pick a tool, prefer the canonical MCP tool over `node -e` escape hatches or direct file I/O. The 4-question framework: what (what does it do), when (when to use vs alternatives), inputs (what it accepts), returns (what shape comes back). See `tools/learning-loop-mastra/tools/legacy/references/tool-selection-guide.md` for the intent to tool mapping.",
  "AGENTS.md is the priority-1 prompt (the steering layer: shape of the loop, rules, canonical paths). The tool manifest is the deterministic tool-selection surface. `loop_describe` warm tier `discoverability_hints` is the at-start-up injection. The `learning-loop` skill is the prompt-author docs. Each surface has a distinct role; do not duplicate content across them.",
  "For 'X is related to Y' prompts: (1) meta_state_relationship_validate to lint; (2) meta_state_report({..., reopens: ['<orphan_id>']}); (3) meta_state_resolve({id: parent, cascade_from: [new_finding_id]}) to close the stale parent in 1 step.",
  "On-demand hint lookup: use `loop_get_instruction({ key: '<slug>' | <index> })` when a hint has scrolled out of context or you need a cross-reference pattern. The meta-state registry (`meta-state.jsonl`) is the loop's self-model; `product/**` is the replaceable substrate that provokes learning; `tools/learning-loop-mastra/{core,tools,hooks}/legacy/**` and `schemas/**` are the template rules. Cite the correct surface.",
  "Narrow query: prefer `meta_state_list({ id: [...] })` or `meta_state_list({ ref_by, ref_field })` over the unfiltered dump. The unfiltered list is for batch audit / sweep only; the narrow query is the default.",
  "Phase A (2026-06-12 reframe): the meta-surface is the only bound surface. The 4-kind union (finding | change-log | rule | loop-design) is load-bearing: findings self-diagnose, change-logs audit, rules enforce, loop-designs defer. The product surface (decisions, experiments, risks, observations, capabilities) is unbound and archived. Substrate writes (product/**, records/**) are legacy carry-overs; all authoritative mutations go through meta_state_* MCP tools.",
  "For hook-emitted batches, query by `session_id` directly: `meta_state_list({ session_id: '...' })`. Do not filter `compact: true` output client-side — compact is for display, not for client-side filtering.",
  "Phase 4 (2026-06-15): Every feature must be runtime-agnostic (shim-not-fork + cross-surface-iteration). Codified as rule-runtime-agnostic-features. Audit a new feature with the check_runtime_agnostic MCP tool before shipping. The 6-item checklist is regression-tested by tools/learning-loop-mastra/__tests__/legacy-mcp/runtime-agnostic.test.js.",
]);

// Process-specific rules: agent behavior under operational conditions.
// Separated from DISCOVERABILITY_HINTS (meta-surface contracts) per finding meta-260622T1713Z.
const PROCESS_HINTS = Object.freeze([
  "pnpm test discipline. `pnpm test` runs 9 namespaces / 1100+ tests in ~13s. Per-namespace logs at `.test-logs/<ns>.log` mirror progress. Rule 1 (silent-command): if a Bash call is silent for >2 min, tail `.test-logs/<ns>.log` instead of re-reading files. Rule 2 (same-file-read): if you read the same file >5 times in 60s with no Edit/Write/Bash, STOP — write a one-line journal to `plans/reports/` and ask the operator. The old 10-min claim was an agent-side `tail -60` artifact; the runner preserves the principle of observable per-namespace progress.",
  "PR-body registry deltas. Every PR that touches `meta-state.jsonl` must enumerate its deltas in the PR body: (a) sweep entries by id+reason, (b) resolved entries by id+resolution note, (c) new entries by id+initial status, (d) promoted rules by finding_id+rule_id, (e) superseded/archived entries by id+target. See `rule-pr-body-registry-deltas` in `meta-state.jsonl` for the canonical rule body and enforcement shape. The CI workflow `meta-state-pr-body-advisory.yml` surfaces the deltas in the PR's Checks tab.",
  "Runtime-agnostic audit. Before shipping a new feature, audit it against the 6-item checklist in `rule-runtime-agnostic-features` (process rule: core-in-universal-location, shims-in-sync, protocol-adapter-i/o, manifest-registered, cross-surface-iteration, parameterized-for-new-surfaces). Use the `check_runtime_agnostic` MCP tool to verify. The regression test is at `tools/learning-loop-mastra/__tests__/legacy-mcp/runtime-agnostic.test.js`.",
]);

/**
 * Return the operator-curated discoverability hints used by loop_describe
 * warm tier and the SessionStart hook. Pure function — no I/O.
 */
export function buildDiscoverabilityHints() {
  return DISCOVERABILITY_HINTS;
}

/**
 * Return operator-curated process rules (agent behavior under operational
 * conditions). Separated from discoverability hints per finding meta-260622T1713Z.
 * Pure function — no I/O.
 */
export function buildProcessHints() {
  return PROCESS_HINTS;
}

/**
 * Return runtime substrate paths + drivers used by the loop. Surfaces the
 * Mastra LibSQL storage location so agents + operators can reason about
 * persistence without re-deriving paths. Pure function — values come from
 * the project structure + `MASTRA_STORAGE_DRIVER` env var convention.
 *
 * NOTE: this is a structural snapshot, not a live probe. The actual storage
 * instance is owned by `tools/learning-loop-mastra/storage.js`; this helper
 * exists for `loop_describe` discoverability only. If the storage layout
 * ever moves, update both this and the storage factory.
 */
export function listSubstrates() {
  // The storage data dir is `tools/learning-loop-mastra/data/`, sibling to
  // the mastra package's `server.js`. `import.meta.url` derivation in
  // storage.js is the source of truth; the env var convention is
  // MASTRA_STORAGE_DRIVER (native | web | memory).
  const storage = {
    type: "libsql",
    id: "mastra-storage",
    path: "tools/learning-loop-mastra/data/mastra-memory.db",
    driver_env: "MASTRA_STORAGE_DRIVER",
    driver_default: "native",
    driver_options: ["native", "web", "memory"],
    note:
      "Storage is the Mastra runtime substrate (workflow stateSchema + future OM threads/messages). " +
      "Meta-state stays at `meta-state.jsonl` per the 2026-06-19 direction-clarification report §3.",
  };
  return { storage };
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
  // Anti-patterns are surfaced in reported/active states; filter out closed
  // statuses so the list does not include resolved/auto-resolved findings.
  const CLOSED_STATUSES = new Set(["auto-resolved", "resolved"]);
  let findings = entries.filter(
    (e) => e.category === "loop-anti-pattern" && !CLOSED_STATUSES.has(e.status)
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
    .filter((r) => r.pattern_type !== "resolution-evidence-required")
    .map((r) => ({
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
    }));
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
 * Used by loop_describe cold tier to compute the superseded_lineage surface.
 * Returns an array of entry objects (no filtering).
 * Checks sidecar cache first on cold-tier reads.
 */
export function readAllEntriesForLineage(root) {
  return readRegistry(root);
}

/**
 * Build the cold-tier payload and write it to the sidecar cache.
 * Returns the cache write result.
 */
function buildColdTierCache(root) {
  const allEntries = readRegistry(root);
  const payload = {
    all_entries: allEntries,
    registry_summary: buildRegistrySummary(allEntries),
    inverse_indexes: Object.fromEntries(
      Object.entries(buildInverseIndexes(allEntries)).map(([k, v]) => [k, Object.fromEntries(v)])
    ),
  };
  return writeColdTierCache(root, payload);
}

/**
 * Build inverse indexes from a flat array of entries.
 * Returns 6 maps for O(1) relationship lookup.
 *
 * - addresses_inverse: Map<loop-design.id, finding.id[]>
 * - supersedes_inverse: Map<change-log.id, entry.id[]>
 * - origin_inverse: Map<finding.id, rule.id[]>
 * - promoted_to_rule_inverse: Map<rule.id, finding.id[]>
 * - reopens_inverse: Map<finding.id, finding.id[]>
 * - consolidated_into_inverse: Map<change-log.id, finding.id[]>
 *
 * Pure function — O(N) over entries. No I/O.
 */
export function buildInverseIndexes(entries) {
  const addressesInverse = new Map();
  const supersedesInverse = new Map();
  const originInverse = new Map();
  const promotedToRuleInverse = new Map();
  const reopensInverse = new Map();
  const consolidatedIntoInverse = new Map();

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
      // Dual-field unification: rule.origin is the canonical promoted_to_rule ref.
      // Populate promoted_to_rule_inverse from the rule side so inverse indexes
      // stay complete after migration from finding.promoted_to_rule -> rule.origin.
      if (!promotedToRuleInverse.has(entry.id)) promotedToRuleInverse.set(entry.id, []);
      const ptrArr = promotedToRuleInverse.get(entry.id);
      if (!ptrArr.includes(findingId)) ptrArr.push(findingId);
    }

    // promoted_to_rule: rule.id -> findings that promoted it
    if (entry.promoted_to_rule && typeof entry.promoted_to_rule === "string") {
      const ruleId = entry.promoted_to_rule;
      if (!promotedToRuleInverse.has(ruleId)) promotedToRuleInverse.set(ruleId, []);
      promotedToRuleInverse.get(ruleId).push(entry.id);
    }

    // reopens: finding -> stale findings it re-surfaces (inverse direction).
    // The legacy 'expired' status was removed in plan 260611-1000; only stale
    // parents are cascade-closeable today.
    if (entry.entry_kind === "finding" && Array.isArray(entry.reopens)) {
      for (const staleId of entry.reopens) {
        if (!reopensInverse.has(staleId)) reopensInverse.set(staleId, []);
        reopensInverse.get(staleId).push(entry.id);
      }
    }

    // consolidated_into: the forward ref is on the change-log side
    // (`change-log.consolidates`, CSV or array of finding ids). The inverse
    // is keyed by change-log id and holds the findings it consolidates.
    // This powers `meta_state_relationships({ id: <change-log-id>, direction: 'inbound' })`
    // returning `inbound.consolidated_by`. (See meta-state.js JSDoc for the
    // canonical direction description.)
    if (entry.entry_kind === "change-log" && entry.consolidates !== undefined) {
      const ids = typeof entry.consolidates === "string"
        ? entry.consolidates.split(",").map((s) => s.trim()).filter(Boolean)
        : Array.isArray(entry.consolidates)
          ? entry.consolidates
          : [];
      if (!consolidatedIntoInverse.has(entry.id)) consolidatedIntoInverse.set(entry.id, []);
      const arr = consolidatedIntoInverse.get(entry.id);
      for (const id of ids) {
        if (!arr.includes(id)) arr.push(id);
      }
    }
  }

  return {
    addresses_inverse: addressesInverse,
    supersedes_inverse: supersedesInverse,
    origin_inverse: originInverse,
    promoted_to_rule_inverse: promotedToRuleInverse,
    reopens_inverse: reopensInverse,
    consolidated_into_inverse: consolidatedIntoInverse,
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
      const refs = design.proposed_design_for ?? [];
      for (const ref of refs) {
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
  for (const map of [inverse.addresses_inverse, inverse.supersedes_inverse, inverse.origin_inverse, inverse.promoted_to_rule_inverse, inverse.reopens_inverse, inverse.consolidated_into_inverse]) {
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
  if (entry.last_verified_at) compact.last_verified_at = entry.last_verified_at;
  if (entry.version !== undefined) compact.version = entry.version;
  if (entry.evidence_code_ref) compact.evidence_code_ref = entry.evidence_code_ref;
  if (entry.evidence_journal) compact.evidence_journal = entry.evidence_journal;
  if (entry.evidence_test) compact.evidence_test = entry.evidence_test;
  if (entry.session_id) compact.session_id = entry.session_id;

  // Description preview.
  // m3: `summarize` ALWAYS sets `description_preview` (it is the contract of
  // this pure function: any caller going through summarize gets the field,
  // full or truncated). However, callers that bypass `summarize` (e.g. the
  // cold-tier `description_mode: 'full'` branch in loop-describe-tool.js,
  // which returns raw entries) will NOT have `description_preview` set.
  // Downstream code that reads `description_preview` should fall back to
  // `description` (e.g. `entry.description ?? entry.description_preview`),
  // not the reverse, since the absent case is the raw-entry path.
  const desc = entry.description || "";
  if (desc.length > 200) {
    compact.description_preview = desc.slice(0, 200) + "...";
  } else {
    compact.description_preview = desc;
  }

  return compact;
}
