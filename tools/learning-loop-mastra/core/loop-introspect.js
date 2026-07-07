import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readRegistry, META_STATE_FINDING_CATEGORIES, readFileIndex, canonicalIndexKey } from "./meta-state.js";
import { loadPromotedRules } from "./gate-logic.js";
import { readColdTierCache, writeColdTierCache } from "./loop-introspect-cache.js";
import { isOpen, isStaleView } from "./stale-view.js";

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
    // manifest.json uses JSONC (line-start // comments). See tools/manifest.json
    // header for the rule; this shim only strips full-line comments.
    manifest = JSON.parse(
      readFileSync(manifestPath, "utf8")
        .replace(/^\s*\/\/.*$/gm, ""),
    );
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
  "Run `meta_state_derive_status({ id })` to re-check if a finding is still true. Run `meta_state_refresh_file_index({ path })` to re-hash a cited path's code in the shared fingerprint index after a refactor — one call re-grounds every finding anchored to that path.",
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
  "Tool integration checklist. Before wiring a new tool into CI or repo automation, consult the 4-item checklist in `rule-tool-integration-same-commit-dep`: (1) same-commit dependency — if the workflow adds `pnpm exec <tool>` / `npx <tool>` / `npm run <script>`, the tool MUST be in `devDependencies` in the SAME commit; (2) baseline flag format — `fallow <sub> --save-baseline` (audit) and `--save-regression-baseline` (regression) produce INCOMPATIBLE JSON; (3) baseline storage — `fallow` auto-creates `.fallow/.gitignore: *`; use `<root>/baselines/fallow/` (NOT `plans/<slug>/reports/fallow/`, which couples CI to a plans directory); (4) third-party Action SHA pin — when swapping `pnpm exec <tool>` for `uses: <vendor>/<tool>@<commit-sha>`, pin to commit SHA (not tag) and verify the Action provides cryptographic signature verification (e.g., fallow-rs/fallow v2: Ed25519 + SHA-256 + sentinel at `npm/fallow/scripts/{verify-binary,lazy-verify,run-binary}.js`); `fallow-rs/fallow@<commit-sha>` is the canonical example. See `tools/learning-loop-mastra/core/README.md` §Tool integration checklist.",
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
 * Build the Rec 10 (plan 260704-0301-stale-findings-dispatch-handle Phase 3)
 * session-start surfacing: a bounded top-5 list of stale dispatch candidates
 * (non-empty evidence_code_ref, severity !== "escalate", no ledger_ref,
 * non-terminal) + a list of orphan findings (INC-10: reported/active findings
 * that have a `dispatch-<id>` ledger row but no `ledger_ref` back-pointer —
 * the residue of a commit whose `ledger_ref` patch failed mid-flight).
 *
 * Read-only. Pure function over `entries` (a registry snapshot) + the caller-
 * supplied `dispatchIds` set (finding ids that have a `dispatch-<id>` ledger
 * row in runtime-state.jsonl). The caller (the SessionStart hook) reads
 * runtime-state.jsonl and passes the set; this builder does no I/O so it stays
 * unit-testable without touching the sidecar. Do NOT call
 * buildColdTierCache/writeColdTierCache here — this builder is on the
 * SessionStart hot path.
 *
 * Ranking (validation P3-W4): severity (escalate filtered out, so this is a
 * tiebreaker), then age OLDEST FIRST, then category (stable tiebreaker).
 * Top-N = 5.
 *
 * @param {object[]} entries — registry entries (readRegistry output)
 * @param {Set<string>} [dispatchIds] — finding ids that have a `dispatch-<id>` ledger row
 * @returns {{ fixable_candidates: object[], orphan_findings: object[], dispatch_protocol_prompt: string }}
 */
// Plan 260707-0812 Phase 2: terminal Set collapses to {resolved, superseded}
// (+archived runtime-applied). The 4-member version mirrored the legacy enum;
// `auto-resolved` is gone (dead write path) and the open-set lives in
// `isOpen`/`isStaleView` instead of literal status equality.
const TERMINAL_STATUSES_FOR_DISPATCH = new Set([
  "resolved",
  "superseded",
  "archived",
]);

const DISPATCH_PREFIX = "dispatch-";

/**
 * Shared tail for the stale-dispatch candidate lists: sort oldest-first,
 * take top-5, project to the dispatch summary shape. The filter chains
 * differ between fixable candidates and orphan findings (different
 * status / ledger_ref / dispatchId predicates); this helper collapses
 * only the duplicated sort + slice + map tail (DRY).
 *
 * @param {object[]} filtered — already-filtered finding entries
 * @param {(e: object) => object} mapFn — projection to the summary shape
 * @returns {object[]} — top-5 oldest-first summary entries
 */
function top5OldestFirst(filtered, mapFn) {
  return filtered
    .sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""))
    .slice(0, 5)
    .map(mapFn);
}

export function buildStaleDispatchHints(entries, dispatchIds = new Set()) {
  // Fixable candidates: stale findings, non-empty evidence_code_ref,
  // severity !== "escalate", no ledger_ref, non-terminal.
  // Sort oldest-first: the operator is more likely to recognize and triage
  // long-queued stale entries before newly-staled ones (validation P3-W4).
  const candidates = top5OldestFirst(
    entries
      .filter((e) => e.entry_kind === "finding")
      // Phase 2: source the fixable-candidate filter from the derived view
      // (`isStaleView`) rather than literal `status === "stale"`. Tolerates
      // legacy `stale` entries pre-migration and stays correct after the
      // migration flips them to `open`.
      .filter((e) => isStaleView(e))
      .filter((e) => typeof e.evidence_code_ref === "string" && e.evidence_code_ref.length > 0)
      .filter((e) => e.severity !== "escalate")
      .filter((e) => !e.ledger_ref)
      .filter((e) => !TERMINAL_STATUSES_FOR_DISPATCH.has(e.status)),
    (e) => ({
      id: e.id,
      category: e.category,
      severity: e.severity,
      evidence_code_ref: e.evidence_code_ref,
      affected_system: e.affected_system,
      description: e.description?.slice(0, 200) ?? "",
      created_at: e.created_at,
    }),
  );

  // Orphan findings (INC-10): a dispatch-<id> ledger row exists for this
  // finding (dispatchIds.has(e.id)) but the finding is still reported/active
  // AND its `ledger_ref` back-pointer was never set — the commit's CAS patch
  // failed mid-flight. Surface them so the operator can re-invoke the
  // dispatch tool's same-coords no-op path to heal the back-pointer.
  // `ledger_ref` set to anything (even a stale value) means the back-pointer
  // exists; the pure-orphan condition is `!ledger_ref` (the failed-patch case).
  const orphanFindings = top5OldestFirst(
    entries
      .filter((e) => e.entry_kind === "finding")
      // Phase 2: orphan-findings filter uses `isOpen` instead of literal
      // active|reported; this stays correct through the migration and matches
      // the post-Phase-4 canonical set.
      .filter((e) => isOpen(e))
      .filter((e) => dispatchIds.has(e.id))
      .filter((e) => !e.ledger_ref),
    (e) => ({
      id: e.id,
      category: e.category,
      severity: e.severity,
      affected_system: e.affected_system,
      status: e.status,
      description: e.description?.slice(0, 200) ?? "",
      created_at: e.created_at,
    }),
  );

  return {
    fixable_candidates: candidates,
    orphan_findings: orphanFindings,
    dispatch_protocol_prompt:
      "Rec 10 dispatch protocol (plan 260704-0301-stale-findings-dispatch-handle):\n" +
      "1. Agent calls meta_state_dispatch_finding({id, stage:'prepare'}) → returns issue body.\n" +
      "2. Agent runs `gh issue create --repo <private-repo>` (check exit code).\n" +
      "3. Agent calls meta_state_dispatch_finding({id, stage:'commit', issue_number, issue_url, repo, delegated_to}) → writes ledger + patches ledger_ref.\n" +
      "Authority boundary: agent proposes; operator dispatches (commit is OPERATOR_MODE-gated). Dispatch to a private issue tracker (not the public template repo).\n" +
      "If a finding appears in orphan_findings (dispatch row exists but ledger_ref is unset), re-invoke meta_state_dispatch_finding with stage:'commit' and the original coords to heal the back-pointer.",
  };
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
 * Apply an optional `categories` allow-list filter to a finding array.
 * Returns the input unchanged when the filter is empty/undefined. Shared by
 * the three findings listers (`listActiveFindings`, `listAllFindings`,
 * `listAntiPatterns`) to avoid duplicating the allow-list predicate.
 */
function filterByCategories(findings, categories) {
  if (!categories || categories.length === 0) return findings;
  return findings.filter((e) => categories.includes(e.category));
}

/**
 * List active findings (open or open-equivalent status) from meta-state.
 * Plan 260707-0812 Phase 2: filter is `isOpen(e)` instead of literal
 * reported|active. `open` is the canonical post-migration status; legacy
 * `active`/`reported`/`stale` are tolerated by `isOpen` pre-migration.
 */
export function listActiveFindings(root, { categories } = {}) {
  const entries = readRegistry(root);
  return filterByCategories(
    entries.filter((e) => isOpen(e) && e.entry_kind === "finding"),
    categories,
  );
}

/**
 * List anti-pattern findings (loop-anti-pattern category, non-terminal status).
 */
export function listAntiPatterns(root, { categories } = {}) {
  const entries = readRegistry(root);
  // Anti-patterns are surfaced in open states; filter out closed statuses so
  // the list does not include resolved/superseded findings. `archived` is
  // excluded by the `isOpen` check (it tolerates null but not `archived`).
  const CLOSED_STATUSES = new Set(["resolved", "superseded"]);
  return filterByCategories(
    entries.filter(
      (e) => e.category === "loop-anti-pattern" && !CLOSED_STATUSES.has(e.status)
    ),
    categories,
  );
}

/**
 * List all findings regardless of status (for cold tier audit).
 */
export function listAllFindings(root, { categories } = {}) {
  const entries = readRegistry(root);
  return filterByCategories(
    entries.filter((e) => e.entry_kind === "finding"),
    categories,
  );
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
    registry_summary: buildRegistrySummary(allEntries, readFileIndex(root)),
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
  const state = newIndexState();
  for (const entry of entries) {
    indexAddresses(entry, state);
    indexSupersedes(entry, state);
    indexOrigin(entry, state);
    indexPromotedToRule(entry, state);
    indexReopens(entry, state);
    indexConsolidatedInto(entry, state);
  }
  return state.export();
}

function newIndexState() {
  return {
    addresses_inverse: new Map(),
    supersedes_inverse: new Map(),
    origin_inverse: new Map(),
    promoted_to_rule_inverse: new Map(),
    reopens_inverse: new Map(),
    consolidated_into_inverse: new Map(),
    export() {
      return {
        addresses_inverse: this.addresses_inverse,
        supersedes_inverse: this.supersedes_inverse,
        origin_inverse: this.origin_inverse,
        promoted_to_rule_inverse: this.promoted_to_rule_inverse,
        reopens_inverse: this.reopens_inverse,
        consolidated_into_inverse: this.consolidated_into_inverse,
      };
    },
  };
}

function pushToIndex(index, key, value) {
  if (!index.has(key)) index.set(key, []);
  index.get(key).push(value);
}

function pushUnique(index, key, value) {
  if (!index.has(key)) index.set(key, []);
  const arr = index.get(key);
  if (!arr.includes(value)) arr.push(value);
}

function indexAddresses(entry, state) {
  // addresses: loop-design -> findings that address it
  if (entry.entry_kind !== "loop-design" || !Array.isArray(entry.addresses)) return;
  for (const findingId of entry.addresses) {
    pushToIndex(state.addresses_inverse, findingId, entry.id);
  }
}

function indexSupersedes(entry, state) {
  // supersedes: change-log -> entries it supersedes
  if (entry.entry_kind !== "change-log" || !entry.supersedes) return;
  pushToIndex(state.supersedes_inverse, entry.supersedes, entry.id);
}

function indexOrigin(entry, state) {
  // origin: finding -> rules that originated from it
  if (entry.entry_kind !== "rule" || !entry.origin) return;
  const findingId = entry.origin;
  pushToIndex(state.origin_inverse, findingId, entry.id);
  // Dual-field unification: rule.origin is the canonical promoted_to_rule ref.
  // Populate promoted_to_rule_inverse from the rule side so inverse indexes
  // stay complete after migration from finding.promoted_to_rule -> rule.origin.
  // DEDUPED: rule.origin contributes once even if a finding also declares
  // promoted_to_rule pointing at this rule (synthetic fixture for the
  // migration period). The inverse direction (`indexPromotedToRule`) does NOT
  // dedup, so a dual-field entry produces 2 refs — test fixture locks this.
  pushUnique(state.promoted_to_rule_inverse, entry.id, findingId);
}

function indexPromotedToRule(entry, state) {
  // promoted_to_rule: rule.id -> findings that promoted it
  if (!entry.promoted_to_rule || typeof entry.promoted_to_rule !== "string") return;
  pushToIndex(state.promoted_to_rule_inverse, entry.promoted_to_rule, entry.id);
}

function indexReopens(entry, state) {
  // reopens: finding -> stale findings it re-surfaces (inverse direction).
  // The legacy 'expired' status was removed in plan 260611-1000; only stale
  // parents are cascade-closeable today.
  if (entry.entry_kind !== "finding" || !Array.isArray(entry.reopens)) return;
  for (const staleId of entry.reopens) {
    pushToIndex(state.reopens_inverse, staleId, entry.id);
  }
}

function indexConsolidatedInto(entry, state) {
  // consolidated_into: the forward ref is on the change-log side
  // (`change-log.consolidates`, CSV or array of finding ids). The inverse
  // is keyed by change-log id and holds the findings it consolidates.
  // This powers `meta_state_relationships({ id: <change-log-id>, direction: 'inbound' })`
  // returning `inbound.consolidated_by`. (See meta-state.js JSDoc for the
  // canonical direction description.)
  if (entry.entry_kind !== "change-log" || entry.consolidates === undefined) return;
  const ids = typeof entry.consolidates === "string"
    ? entry.consolidates.split(",").map((s) => s.trim()).filter(Boolean)
    : Array.isArray(entry.consolidates)
      ? entry.consolidates
      : [];
  if (!state.consolidated_into_inverse.has(entry.id)) {
    state.consolidated_into_inverse.set(entry.id, []);
  }
  const arr = state.consolidated_into_inverse.get(entry.id);
  for (const id of ids) {
    if (!arr.includes(id)) arr.push(id);
  }
}

/**
 * Build a registry summary from all entries.
 * Returns { counts, coverage, top_references, drift }.
 * Pure function — O(N) over entries. No I/O.
 */
export function buildRegistrySummary(entries, fileIndex) {
  return {
    counts: computeCounts(entries),
    coverage: computeCoverage(entries),
    top_references: computeTopReferences(entries),
    drift: computeDriftEntries(entries, fileIndex),
    last_generated_at: new Date().toISOString(),
  };
}

// Bucket entries by (kind, status). Unknown kinds default to "finding" so the
// bucket stays the same shape as legacy registries with implicit kind.
function computeCounts(entries) {
  const counts = {};
  for (const entry of entries) {
    const kind = entry.entry_kind || "finding";
    const status = entry.status || "unknown";
    if (!counts[kind]) counts[kind] = {};
    counts[kind][status] = (counts[kind][status] || 0) + 1;
  }
  return counts;
}

// Coverage = mechanism_check adoption on resolved findings + broken refs
// (loop-design.proposed_design_for pointing to non-existent ids) + orphan
// findings (no consolidated_into, no promoted_to_rule, no addressing design).
function computeCoverage(entries) {
  const resolved = entries.filter((e) => e.entry_kind === "finding" && e.status === "resolved");
  const mechanismCheckCount = resolved.filter((e) => e.mechanism_check === true).length;
  const entryIds = new Set(entries.map((e) => e.id));
  const loopDesigns = entries.filter((e) => e.entry_kind === "loop-design");
  return {
    resolved_total: resolved.length,
    mechanism_check_count: mechanismCheckCount,
    mechanism_check_pct: resolved.length > 0 ? Math.round((mechanismCheckCount / resolved.length) * 100) : 0,
    broken_refs: countBrokenRefs(loopDesigns, entryIds),
    orphan_count: countOrphanFindings(entries, loopDesigns),
  };
}

function countBrokenRefs(loopDesigns, entryIds) {
  let count = 0;
  for (const design of loopDesigns) {
    if (!design.proposed_design_for) continue;
    const refs = design.proposed_design_for ?? [];
    for (const ref of refs) {
      if (!entryIds.has(ref)) count++;
    }
  }
  return count;
}

function countOrphanFindings(entries, loopDesigns) {
  let count = 0;
  for (const entry of entries) {
    if (entry.entry_kind !== "finding") continue;
    if (entry.consolidated_into || entry.promoted_to_rule) continue;
    const hasDesign = loopDesigns.some((d) => d.addresses?.includes(entry.id));
    if (!hasDesign) count++;
  }
  return count;
}

// Top 5 most-cited entry ids across all 6 inverse-index maps. Citation = sum
// of inverse-index sizes for the entry.
function computeTopReferences(entries) {
  const inverse = buildInverseIndexes(entries);
  const citationCounts = new Map();
  for (const map of [
    inverse.addresses_inverse,
    inverse.supersedes_inverse,
    inverse.origin_inverse,
    inverse.promoted_to_rule_inverse,
    inverse.reopens_inverse,
    inverse.consolidated_into_inverse,
  ]) {
    for (const [id, refs] of map.entries()) {
      citationCounts.set(id, (citationCounts.get(id) || 0) + refs.length);
    }
  }
  return Array.from(citationCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => ({ id, count }));
}

// Drift: 5 most-recent non-resolved mechanism_check findings. F12: display the
// index-authoritative fingerprint (file-index.jsonl), falling back to the
// vestigial per-record field. `fileIndex` is optional — callers with a root
// pass readFileIndex(root); callers without it pass nothing (fallback).
function computeDriftEntries(entries, fileIndex) {
  return entries
    .filter((e) => e.entry_kind === "finding" && e.mechanism_check === true && e.status !== "resolved")
    .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
    .slice(0, 5)
    .map((e) => ({
      id: e.id,
      status: e.status,
      created_at: e.created_at,
      code_fingerprint: (fileIndex && fileIndex.get(canonicalIndexKey(e.evidence_code_ref))) ?? e.code_fingerprint ?? null,
    }));
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
