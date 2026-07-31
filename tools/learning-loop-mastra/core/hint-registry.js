/**
 * hint-registry.js — single source of truth for context-injection hints.
 *
 * Phase 2 of plans/260717-1826-unify-context-injection: collapses the legacy
 * DISCOVERABILITY_HINTS / PROCESS_HINTS frozen consts in
 * core/loop-introspect.js (and the LOCAL_* mirror in .factory/hooks/loop-
 * surface-inject.cjs) into one slug-keyed registry.
 *
 * Consumers: production injection projects through core/loop-introspect.js
 * builders (hooks + loop_describe); inspection projects through
 * core/hint-renderer.js + tools/scripts/hint-render.mjs (operator decision
 * 2026-07-17 — the renderer is debug tooling, not the injection path).
 * loop_get_instruction resolves directly against this registry's fixed order.
 *
 * Schema:
 *   { slug, kind: "discoverability" | "process", text, suggestion,
 *     derived_from_rule?: string | null }
 *
 * - `text` is the canonical prose injected for standalone entries.
 * - `derived_from_rule` (Phase 3): when set to a rule id, the renderer
 *   resolves `text` at render time from `rule.hint_text`; when the rule is
 *   missing/inactive the entry is skipped + a provenance warning is recorded.
 *   Standalone entries carry `derived_from_rule: null`.
 *
 * Order matters — registry order = injection order = numeric-index back-compat
 * for loop_get_instruction. Renaming rows is a breaking change.
 */

export const HINT_REGISTRY = Object.freeze([
  // ============================================================================
  // DISCOVERABILITY (16 rows) — meta-surface contracts, tool-selection pointers.
  // Slugs preserved verbatim from HINT_KEY_MAP so loop_get_instruction back-compat
  // survives (Validation 4 of plan 260717-1826).
  // ============================================================================
  {
    slug: "internalization-rule",
    kind: "discoverability",
    text:
      "To cite a thing, point at the code: `meta_state_report({ evidence_code_ref: 'path/to/file.js:line' })`. The loop will hash and re-check it.",
    suggestion:
      "Prefer `local:meta-state:<id>` source_refs and set `evidence_code_ref` to a code path so the loop can re-check it.",
    derived_from_rule: null,
  },
  {
    slug: "mechanism-check",
    kind: "discoverability",
    text:
      "When you pass `evidence_code_ref` to `meta_state_report`, `mechanism_check` is auto-defaulted to `true` (so the loop will hash and re-check the code). Pass `mechanism_check: false` explicitly to opt out — the response will include a `warnings` array explaining the tradeoff.",
    suggestion:
      "When you provide `evidence_code_ref`, `mechanism_check` defaults to true; pass `false` only if you intentionally want to opt out.",
    derived_from_rule: null,
  },
  {
    slug: "source-refs",
    kind: "discoverability",
    text:
      "For `source_refs`, prefer `local:meta-state:<id>` (cite a finding). Markdown refs (`local:plans/...`) are accepted for the escape hatch but discouraged.",
    suggestion:
      "Use `local:meta-state:<id>` for citations; reserve `local:plans/...` markdown refs for the escape hatch.",
    derived_from_rule: null,
  },
  {
    slug: "derive-refresh",
    kind: "discoverability",
    text:
      "Run `meta_state_derive_status({ id })` to re-check if a finding is still true. Run `meta_state_refresh_file_index({ path })` to re-hash a cited path's code in the shared fingerprint index after a refactor — one call re-grounds every finding anchored to that path.",
    suggestion:
      "Call `meta_state_derive_status` before resolving; call `meta_state_refresh_file_index({ path })` after refactoring cited code to re-ground the path's hash in the shared fingerprint index.",
    derived_from_rule: null,
  },
  {
    slug: "designs-no-code",
    kind: "discoverability",
    text:
      "For designs without code, cite the change-log that records the design (`meta_state_log_change` with `change_target: '<plan-path>'`).",
    suggestion:
      "For design-only choices, log a change-log entry and cite its id in `source_refs`.",
    derived_from_rule: null,
  },
  {
    slug: "status-lifecycle",
    kind: "discoverability",
    text:
      "Findings have 4 statuses: `open` (unresolved — the canonical post-migration status), `resolved` (closed), `superseded` (consolidated into a change-log), and `archived` (schema-valid terminal status post-Plan 260731-1325; registry-size trim, append-only via `archiveEntry`/`deleteEntry` with a write-boundary guard on the union `metaStateEntrySchema`; restorable via `meta_state_unarchive`). `stale` is no longer a status — it is a derived evidence-freshness view (`isStaleView`: an open finding past the 7-day staleness window from `last_verified_at`/`created_at`, OR with drifted evidence in `file-index.jsonl`), surfaced by `meta_state_query_drift` + `meta_state_sweep` (read-only) and re-grounded via `meta_state_re_verify` (stamps `last_verified_at`, no status transition). The legacy `expired`/`reported`/`active`/`auto-resolved` statuses were removed in plans 260611-1000 and 260707-0812; `isOpen` tolerates legacy persisted values until the migration flips them. Only `stale`-view parents are cascade-closeable via `meta_state_resolve`.",
    // Fixed in Phase 2: this suggestion previously contradicted the post-260611
    // status vocabulary ("use `stale` for past-TTL findings" — `stale` is no
    // longer a persisted status). The rewrite points at `meta_state_re_verify`,
    // which IS the way to re-validate a finding past the staleness window.
    suggestion:
      "Use `meta_state_re_verify({ id, refresh: true })` to re-ground a finding with re-runnable verification.steps; use `meta_state_touch({ id })` to re-ground an aged finding whose steps are empty (operator attestation — guarded by checkGrounding, rejects on drift). Both stamp `last_verified_at` without a status transition. `stale` is a derived view, not a status — see `meta_state_query_drift`.",
    derived_from_rule: null,
  },
  {
    slug: "reopens",
    kind: "discoverability",
    text:
      "For reopens: set reopens: ['<old_stale_id>'] on the new finding at report time, then cascade-resolve the parent via meta_state_resolve({id: old_id, cascade_from: [child_id]}). The cascade closes the stale parent in 1 step.",
    suggestion:
      "Set `reopens: ['<stale_id>']` on the new finding, then cascade-resolve the stale parent.",
    derived_from_rule: null,
  },
  {
    slug: "rule-lifecycle",
    kind: "discoverability",
    text:
      "For rule and loop-design lifecycle, use `meta_state_list({ entry_kind: 'rule' | 'loop-design' })` (Phase 3) or `loop_describe({ tier: 'cold' })` (Phase 4). The cold tier surfaces a `loop_designs` list with `id`, `title`, `proposed_design_for`, `addresses`, and `shipped_in_plan`.",
    suggestion:
      "Query loop-design/rule lifecycle via `meta_state_list({ entry_kind: 'rule' | 'loop-design' })` or `loop_describe({ tier: 'cold' })`.",
    derived_from_rule: null,
  },
  {
    slug: "canonical-tool",
    kind: "discoverability",
    text:
      "To pick a tool, prefer the canonical MCP tool over `node -e` escape hatches or direct file I/O. The 4-question framework: what (what does it do), when (when to use vs alternatives), inputs (what it accepts), returns (what shape comes back). See `tools/learning-loop-mastra/tools/handlers/references/tool-selection-guide.md` for the intent to tool mapping.",
    suggestion:
      "Use the tool manifest + the tool-selection guide to pick tools; avoid `node -e` and direct file I/O to `meta-state.jsonl`.",
    derived_from_rule: null,
  },
  {
    slug: "surface-split",
    kind: "discoverability",
    text:
      "AGENTS.md is the priority-1 prompt (the steering layer: shape of the loop, rules, canonical paths). The tool manifest is the deterministic tool-selection surface. `loop_describe` warm tier `discoverability_hints` is the at-start-up injection. The `learning-loop` skill is the prompt-author docs. Each surface has a distinct role; do not duplicate content across them.",
    suggestion:
      "AGENTS.md is the steering prompt; the tool manifest is deterministic; warm hints are at-start; the skill is prompt-author docs.",
    derived_from_rule: null,
  },
  {
    slug: "reopens-script",
    kind: "discoverability",
    text:
      "For 'X is related to Y' prompts: (1) meta_state_relationship_validate to lint; (2) meta_state_report({..., reopens: ['<orphan_id>']}); (3) meta_state_resolve({id: parent, cascade_from: [new_finding_id]}) to close the stale parent in 1 step.",
    suggestion:
      "For cross-references, run `meta_state_relationship_validate`, report with `reopens`, then `meta_state_resolve({ cascade_from: [child] })`.",
    derived_from_rule: null,
  },
  {
    slug: "loop-get-instruction",
    kind: "discoverability",
    text:
      "On-demand hint lookup: use `loop_get_instruction({ key: '<slug>' | <index> })` when a hint has scrolled out of context or you need a cross-reference pattern. The meta-state registry (`meta-state.jsonl`) is the loop's self-model; `product/**` is the replaceable substrate that provokes learning; `tools/learning-loop-mastra/{tools/handlers,hooks/universal}/**` and `schemas/**` are the template rules. Cite the correct surface.",
    suggestion:
      "Use `loop_get_instruction` for on-demand lookup. Keep `meta-state.jsonl` (self-model), `product/**` (substrate), and template code separate when citing evidence.",
    derived_from_rule: null,
  },
  {
    slug: "narrow-query",
    kind: "discoverability",
    text:
      "Narrow query: prefer `meta_state_list({ id: [...] })` or `meta_state_list({ ref_by, ref_field })` over the unfiltered dump. The unfiltered list is for batch audit / sweep only; the narrow query is the default.",
    suggestion:
      "Use `meta_state_list({ id: [...] })` for one-call resolution of cross-reference ids; use `{ ref_by, ref_field }` for 1-hop neighborhood queries. Reserve the unfiltered list for batch audit only.",
    derived_from_rule: null,
  },
  {
    slug: "phase-a-reframe",
    kind: "discoverability",
    text:
      "Phase A (2026-06-12 reframe): the meta-surface is the only bound surface. The 4-kind union (finding | change-log | rule | loop-design) is load-bearing: findings self-diagnose, change-logs audit, rules enforce, loop-designs defer. The product surface (decisions, experiments, risks, observations, capabilities) is unbound and archived. Substrate writes (product/**, records/**) are legacy carry-overs; all authoritative mutations go through meta_state_* MCP tools.",
    suggestion:
      "Phase A reframe: the meta-surface (finding | change-log | rule | loop-design) is the only bound surface; the product surface is unbound.",
    derived_from_rule: null,
  },
  {
    slug: "session-id-query",
    kind: "discoverability",
    text:
      "For hook-emitted batches, query by `session_id` directly: `meta_state_list({ session_id: '...' })`. Do not filter `compact: true` output client-side — compact is for display, not for client-side filtering.",
    suggestion:
      "Hook-emitted batches: query by `session_id` via `meta_state_list`; do not client-side filter compact output.",
    derived_from_rule: null,
  },
  {
    slug: "runtime-agnostic-features",
    kind: "discoverability",
    text:
      "Phase 4 (2026-06-15): Every feature must be runtime-agnostic (shim-not-fork + cross-surface-iteration). Codified as rule-runtime-agnostic-features. Audit a new feature with the check_runtime_agnostic MCP tool before shipping. The 6-item checklist is regression-tested by tools/learning-loop-mastra/__tests__/legacy-mcp/runtime-agnostic.test.js.",
    suggestion:
      "Runtime-agnostic features: use shim-not-fork + cross-surface-iteration; audit with `check_runtime_agnostic` before shipping.",
    derived_from_rule: null,
  },

  // ============================================================================
  // PROCESS (2 standalone rows) — agent behavior under operational conditions.
  // Rule-derived process rows are NOT mirrored here; they are generated from
  // active agent-checklist rule entries at read time by
  // `buildProcessView({ rulesById })`. Promoting a rule is a single CLI call;
  // the registry itself needs no matching hand-edit.
  //
  // `order` keys the merge sort: rule-derived rows pick up `order` from
  // `rule.hint_order`; absent → append-by-slug (deterministic degraded case).
  // ============================================================================
  {
    slug: "pnpm-test-discipline",
    kind: "process",
    order: 10,
    text:
      "Test discipline (deterministic parse). Iterate via `pnpm test:iter` — runs `vitest run --bail=1`, suppresses raw stdout, and prints only the parsed summary from `.test-logs/vitest-results.json` (shape numTotalTests/numFailedTests/numTotalTestSuites + testResults[].assertionResults[]; status passed/failed). One file: `pnpm test:one <path>` — a single command that runs vitest and prints the parsed summary via `bash tools/scripts/vitest-failures.sh` (vitest's json reporter writes `.test-logs/vitest-results.json` on every run regardless of stdout, so no redirect is needed; exit 0 green / 1 failed / 2 missing-or-invalid). Post-edit: `pnpm exec vitest --changed`. The bash gate blocks `vitest run`/`pnpm test` piped to `tail`/`grep` — the JSON is the source of truth, not raw stdout. Do NOT redirect vitest stdout to a /tmp log and grep it (a two-command split that evades the gate). Do NOT grep raw vitest stdout, re-read passing tests, or hand-write `python -c`/`node -e` to parse the JSON. Rule 2 (same-file-read): if you read the same file >5 times in 60s with no Edit/Write/Bash, STOP — write a one-line journal to `plans/reports/` and ask the operator.",
    suggestion:
      "Long-running pnpm test discipline: per-namespace log files, read-loop stop conditions.",
    derived_from_rule: null,
  },
  {
    // Standalone (Phase 3): file-index drift is operational, not a rule.
    slug: "file-edit-drift-and-fingerprints",
    kind: "process",
    order: 90,
    text:
      "File-edit drift and fingerprints. Fingerprints in `file-index.jsonl` are load-bearing for loop grounding; `file-index.jsonl` is an UNTRACKED regen artifact (gitignored — see `.gitignore`) rebuilt by the seed step at test/pre-commit/CI time. `pnpm test` auto-seeds via the prepended `tools/learning-loop-mastra/tools/handlers/scripts/seed-file-index.mjs` step before `vitest run`, so a legitimate Edit/Write during a fix is absorbed at test time without operator action. For deliberate per-path drift acceptance with operator audit (a gate-log entry recording who/when/why), use `meta_state_refresh_file_index({path, reason})` instead — `seed-file-index.mjs` is a mechanical bulk re-seed that intentionally omits per-path gate-log entries (git history is its audit). If you edit files DURING a debug/test loop and hit a `file-index.jsonl` drift error before re-running the suite, run `node tools/learning-loop-mastra/tools/handlers/scripts/seed-file-index.mjs` once (or set `SKIP_PRESEED=1` for a single pre-commit bypass) before re-running tests. The cold-tier cache is keyed on both `meta-state.jsonl` AND `file-index.jsonl` SHAs — either change invalidates. `upsertFileIndexEntry` is a true no-op on an unchanged (key, hash) so re-seeding without code change keeps the cache warm. Do NOT call refresh per Edit/Write when the next `pnpm test` will do it; targeted scripts (`pnpm test:cold-session`, `pnpm test:debug`, `pnpm check:freshness`) do NOT run the seed step by default, so cold-session runs against a stale file-index can still surface drift at vitest time.",
    suggestion:
      "File-edit drift and fingerprints: `file-index.jsonl` is an UNTRACKED regen artifact (gitignored) rebuilt by the seed step; pretest seed (`pnpm test`) absorbs Edit/Write drift at test time; per-path `meta_state_refresh_file_index` for deliberate operator-audited refresh; `SKIP_PRESEED=1` escape hatch for a single pre-commit bypass. `upsertFileIndexEntry` is a true no-op on unchanged (key, hash) so re-seeding without code change keeps the cache warm. Cold-tier cache invalidates on either `meta-state.jsonl` OR `file-index.jsonl` SHA change.",
    derived_from_rule: null,
  },
]);

/**
 * List registry entries filtered by kind (or all when kind is undefined).
 * Pure — no I/O.
 */
export function listHints({ kind } = {}) {
  if (kind === undefined) return HINT_REGISTRY.slice();
  return HINT_REGISTRY.filter((e) => e.kind === kind);
}

/**
 * Build the merged process-hint view from the standalone registry rows and
 * the active agent-checklist rules. The view is the canonical source for ALL
 * process-hint consumers — replaces the legacy pattern of interleaving
 * hand-mirrored `HINT_REGISTRY` rows with rule-derived ones.
 *
 * Pure — `rulesById` is a precomputed map supplied by the caller (no I/O).
 * Each generated entry carries the fields the projection paths expect:
 *   - `slug` (string) — the lookup key for `loop_get_instruction`.
 *   - `kind: "process"` — same shape as standalone rows.
 *   - `text: ""` — resolveHintText is the shared resolution path; it reads
 *     `rule.hint_text` from the rules map at inject time, just like the
 *     previous `derived_from_rule` mechanism.
 *   - `suggestion` — sourced from `rule.hint_suggestion` (required at the
 *     promote + patch tool layer for agent-checklist rules; this view
 *     reads it unconditionally — no fallback).
 *   - `derived_from_rule` — points at the originating rule id.
 *   - `order` — the merge key; lower renders earlier, undefined appends
 *     in slug order (the worktree-degraded case, deterministic).
 *
 * Collision policy: a generated slug equal to a standalone slug or another
 * generated slug is SKIPPED, never last-wins overwritten. The skip is pushed
 * onto the optional `warnings` array so callers can surface it; without one
 * the skip is silent. The promote/patch tool layers reject a colliding slug
 * at write time, so this branch only fires on data that pre-dates the guard.
 */
export function buildProcessView({ rulesById, warnings } = {}) {
  const standalone = HINT_REGISTRY.filter((e) => e.kind === "process").map((e) => ({ ...e }));
  const derived = [];
  const seen = new Set(standalone.map((e) => e.slug));
  for (const rule of rulesById?.values() ?? []) {
    if (rule.pattern_type !== "agent-checklist") continue;
    const slug = rule.hint_slug ?? rule.id.replace(/^rule-/, "");
    if (seen.has(slug)) {
      warnings?.push(`process hint "${slug}" skipped: slug collides with a standalone slug or another rule's slug`);
      continue;
    }
    seen.add(slug);
    derived.push({
      slug,
      kind: "process",
      text: "",
      suggestion: rule.hint_suggestion,
      derived_from_rule: rule.id,
      order: rule.hint_order,
    });
  }
  return [...standalone, ...derived].sort(byOrderThenSlug);
}

/**
 * Deterministic sort: order ascending (undefined → +Infinity), tie-break
 * by slug (id-derived). `created_at` is deliberately NOT a tie-break input —
 * rules are not guaranteed to carry it. The undefined-order tail preserves
 * the degraded-worktree case as a deterministic append-by-slug.
 */
function byOrderThenSlug(a, b) {
  const ao = a.order === undefined ? Number.POSITIVE_INFINITY : a.order;
  const bo = b.order === undefined ? Number.POSITIVE_INFINITY : b.order;
  if (ao !== bo) return ao - bo;
  return a.slug.localeCompare(b.slug);
}

/**
 * Find a single registry entry by slug. Returns undefined if missing.
 * Pure — no I/O.
 */
export function findHintBySlug(slug) {
  return HINT_REGISTRY.find((e) => e.slug === slug);
}

/**
 * Resolve the renderable text for one registry entry.
 *
 * Standalone entries (`derived_from_rule: null`) → the inline `text`.
 * Rule-derived entries → `rule.hint_text` from the supplied `rulesById` map;
 * `null` when the rule is not in the map (missing, inactive, or
 * scope-filtered) or carries no `hint_text`.
 *
 * This is the single resolution path shared by core/hint-renderer.js,
 * the loop_get_instruction tool, and loop-introspect's buildProcessHints —
 * divergent skip semantics across consumers previously caused a positional
 * misalignment in loop_get_instruction (code-review C2 of
 * plans/260717-1826-unify-context-injection).
 *
 * Pure — `rulesById` is a precomputed map supplied by the caller.
 */
export function resolveHintText(entry, rulesById) {
  if (entry.derived_from_rule == null) return entry.text;
  return rulesById?.get(entry.derived_from_rule)?.hint_text ?? null;
}
