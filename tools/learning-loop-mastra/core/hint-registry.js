/**
 * hint-registry.js — single source of truth for context-injection hints.
 *
 * Collapses the legacy DISCOVERABILITY_HINTS / PROCESS_HINTS frozen consts
 * in core/loop-introspect.js (and the LOCAL_* mirror in .factory/hooks/loop-
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
 *     derived_from_rule?: string | null,
 *     tier?: "startup" | "on-demand" }
 *
 * - `text` is the canonical prose injected for standalone entries.
 * - `derived_from_rule`: when set to a rule id, the renderer
 *   resolves `text` at render time from `rule.hint_text`; when the rule is
 *   missing/inactive the entry is skipped + a provenance warning is recorded.
 *   Standalone entries carry `derived_from_rule: null`.
 * - `tier` is the injection policy: "startup" (default when omitted) rows are
 *   auto-injected at session start / warm loop_describe; "on-demand" rows are
 *   only listed in the warm `hint_index` (slug + suggestion) and fetched in
 *   full via loop_get_instruction. The filter is applied at warm-injection
 *   sites only — cold loop_describe, the hint renderer, and
 *   loop_get_instruction always see the full registry.
 *
 * Order matters — registry order = injection order = numeric-index back-compat
 * for loop_get_instruction. Renaming rows is a breaking change.
 */

export const HINT_REGISTRY = Object.freeze([
  // ============================================================================
  // DISCOVERABILITY (17 rows) — meta-surface contracts, tool-selection pointers.
  // Slugs preserved verbatim from HINT_KEY_MAP so loop_get_instruction back-compat
  // survives the registry collapse.
  // ============================================================================
  {
    slug: "internalization-rule",
    kind: "discoverability",
    tier: "on-demand",
    text:
      "The citation rule is canonical in AGENTS.md §2: cite the code, not the markdown — `meta_state_report({ evidence_code_ref: 'path/to/file.js:line' })` so the loop can hash and re-check it, then cite the finding via `local:meta-state:<id>` source_refs.",
    suggestion:
      "Prefer `local:meta-state:<id>` source_refs and set `evidence_code_ref` to a code path so the loop can re-check it.",
    derived_from_rule: null,
  },
  {
    slug: "mechanism-check",
    kind: "discoverability",
    tier: "on-demand",
    text:
      "When you pass `evidence_code_ref` to `meta_state_report`, `mechanism_check` is auto-defaulted to `true` (so the loop will hash and re-check the code). Pass `mechanism_check: false` explicitly to opt out — the response will include a `warnings` array explaining the tradeoff.",
    suggestion:
      "When you provide `evidence_code_ref`, `mechanism_check` defaults to true; pass `false` only if you intentionally want to opt out.",
    derived_from_rule: null,
  },
  {
    slug: "source-refs",
    kind: "discoverability",
    tier: "on-demand",
    text:
      "General source_refs guidance is canonical in AGENTS.md §2 (prefer `local:meta-state:<id>`; `local:plans/...` markdown refs are the discouraged escape hatch). Gate-verb budget-state observations are the sanctioned exception: they use the sentinel `local:meta-state:gate-verb-allowance` — intentionally non-resolving, no finding-id grep needed.",
    suggestion:
      "Use `local:meta-state:<id>` for citations; reserve `local:plans/...` markdown refs for the escape hatch. Gate-verb budget-state observations use the non-resolving sentinel `local:meta-state:gate-verb-allowance`.",
    derived_from_rule: null,
  },
  {
    slug: "derive-refresh",
    kind: "discoverability",
    tier: "on-demand",
    text:
      "Run `meta_state_derive_status({ id })` to re-check if a finding is still true. Run `meta_state_refresh_file_index({ path })` to re-hash a cited path's code in the shared fingerprint index after a refactor — one call re-grounds every finding anchored to that path.",
    suggestion:
      "Call `meta_state_derive_status` before resolving; call `meta_state_refresh_file_index({ path })` after refactoring cited code to re-ground the path's hash in the shared fingerprint index.",
    derived_from_rule: null,
  },
  {
    slug: "designs-no-code",
    kind: "discoverability",
    tier: "on-demand",
    text:
      "For designs without code, cite the change-log that records the design (`meta_state_log_change` with `change_target: '<plan-path>'`).",
    suggestion:
      "For design-only choices, log a change-log entry and cite its id in `source_refs`.",
    derived_from_rule: null,
  },
  {
    slug: "status-lifecycle",
    kind: "discoverability",
    tier: "on-demand",
    text:
      "Status vocabulary is canonical in AGENTS.md §1's kind table: `open` | `resolved` | `accepted` | `archived`; `superseded` collapsed into `resolved` + a citation row; `stale` is a derived evidence-freshness view (`isStaleView`), not a status. Ops residue: the stale view is surfaced by `meta_state_query_drift` + `meta_state_sweep` (read-only) and re-grounded via `meta_state_re_verify` (stamps `last_verified_at`, no status transition — the suggestion carries the re_verify/touch split). `archived` is append-only via `archiveEntry`/`deleteEntry` (write-boundary guard on the union `metaStateEntrySchema`), restorable via `meta_state_unarchive`. The legacy `expired`/`reported`/`active`/`auto-resolved` statuses were removed; `isOpen` tolerates legacy persisted values. The `reopens` + `cascade_from` writers were dropped — new evidence appends a new finding; no operation un-closes an old one as a side-effect.",
    // Corrected: this suggestion previously contradicted the current
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
    tier: "on-demand",
    text:
      "The `reopens` writer was dropped — new findings cannot re-open a closed parent via `reopens` + cascade. The `reopens` field stays `.optional()` on the finding schema (read-only historical) and the 17 historical `reopens` edges are still queryable via `meta_state_relationships` + `meta_state_relationship_validate`. To close a stale parent, call `meta_state_resolve({ id: old_id })` on the parent directly (no cascade).",
    suggestion:
      "`meta_state_report` no longer accepts `reopens`; `meta_state_resolve` no longer accepts `cascade_from`. To close a stale parent, call `meta_state_resolve` on it directly. The 17 historical edges remain queryable; the read path is retained.",
    derived_from_rule: null,
  },
  {
    slug: "rule-lifecycle",
    kind: "discoverability",
    tier: "on-demand",
    text:
      "For rule and loop-design lifecycle, use `meta_state_list({ entry_kind: 'rule' | 'loop-design' })` or `loop_describe({ tier: 'cold' })`. The cold tier surfaces a `loop_designs` list with `id`, `title`, `proposed_design_for`, `addresses`, and `shipped_in_plan`.",
    suggestion:
      "Query loop-design/rule lifecycle via `meta_state_list({ entry_kind: 'rule' | 'loop-design' })` or `loop_describe({ tier: 'cold' })`.",
    derived_from_rule: null,
  },
  {
    slug: "canonical-tool",
    kind: "discoverability",
    tier: "startup",
    text:
      "To pick a tool, prefer the canonical MCP tool over `node -e` escape hatches or direct file I/O. The 4-question framework: what (what does it do), when (when to use vs alternatives), inputs (what it accepts), returns (what shape comes back). See `tools/learning-loop-mastra/tools/handlers/references/tool-selection-guide.md` for the intent to tool mapping.",
    suggestion:
      "Use the tool manifest + the tool-selection guide to pick tools; avoid `node -e` and direct file I/O to `meta-state.jsonl`.",
    derived_from_rule: null,
  },
  {
    slug: "surface-split",
    kind: "discoverability",
    tier: "startup",
    text:
      "AGENTS.md is the priority-1 prompt (the steering layer: shape of the loop, rules, canonical paths). The tool manifest is the deterministic tool-selection surface. `loop_describe` warm tier `discoverability_hints` is the at-start-up injection. The `learning-loop` skill is the prompt-author docs. Each surface has a distinct role; do not duplicate content across them.",
    suggestion:
      "AGENTS.md is the steering prompt; the tool manifest is deterministic; warm hints are at-start; the skill is prompt-author docs.",
    derived_from_rule: null,
  },
  {
    slug: "reopens-script",
    kind: "discoverability",
    tier: "on-demand",
    text:
      "For 'X is related to Y' prompts: (1) `meta_state_relationship_validate` to lint the prospective edge; (2) report the new finding with `meta_state_report` (the `reopens` arg was dropped — the cross-ref is no longer set on the new finding); (3) the orphan parent stays open until explicitly resolved. To close it, call `meta_state_resolve({ id: parent_id })` directly — no cascade step.",
    suggestion:
      "For cross-references, run `meta_state_relationship_validate`, then resolve orphan parents explicitly via `meta_state_resolve` (no cascade). The `reopens` writer + `cascade_from` arg were dropped; the read path is retained for the 17 historical edges.",
    derived_from_rule: null,
  },
  {
    slug: "loop-get-instruction",
    kind: "discoverability",
    tier: "startup",
    text:
      "On-demand hint lookup: use `loop_get_instruction({ key: '<slug>' | <index> })` when a hint has scrolled out of context or you need a cross-reference pattern. Warm injection carries only the startup hints; the full set rides the warm `hint_index` (slug + suggestion) and is fetched per-slug here. The meta-state / product / substrate surface split is canonical in AGENTS.md §1 — cite the correct surface.",
    suggestion:
      "Use `loop_get_instruction` for on-demand lookup of any hint by slug or index; warm carries the startup hints, the rest ride `hint_index`.",
    derived_from_rule: null,
  },
  {
    slug: "narrow-query",
    kind: "discoverability",
    tier: "on-demand",
    text:
      "Narrow query: prefer `meta_state_list({ id: [...] })` or `meta_state_list({ ref_by, ref_field })` over the unfiltered dump. The unfiltered list is for batch audit / sweep only; the narrow query is the default.",
    suggestion:
      "Use `meta_state_list({ id: [...] })` for one-call resolution of cross-reference ids; use `{ ref_by, ref_field }` for 1-hop neighborhood queries. Reserve the unfiltered list for batch audit only.",
    derived_from_rule: null,
  },
  {
    slug: "phase-a-reframe",
    kind: "discoverability",
    tier: "startup",
    text:
      "Orientation: the meta-surface is the only bound surface (4-kind union: finding | change-log | rule | loop-design) and the product surface is unbound. The full framing is canonical in AGENTS.md §1; the records-via-tools rule is in CLAUDE.md's Records bullet.",
    suggestion:
      "The meta-surface (finding | change-log | rule | loop-design) is the only bound surface; the product surface is unbound.",
    derived_from_rule: null,
  },
  {
    slug: "session-id-query",
    kind: "discoverability",
    tier: "on-demand",
    text:
      "For hook-emitted batches, query by `session_id` directly: `meta_state_list({ session_id: '...' })`. Do not filter `compact: true` output client-side — compact is for display, not for client-side filtering.",
    suggestion:
      "Hook-emitted batches: query by `session_id` via `meta_state_list`; do not client-side filter compact output.",
    derived_from_rule: null,
  },
  {
    slug: "runtime-agnostic-features",
    kind: "discoverability",
    tier: "on-demand",
    text:
      "Every feature must be runtime-agnostic (shim-not-fork + cross-surface-iteration). Codified as rule-runtime-agnostic-features. Audit a new feature with the check_runtime_agnostic MCP tool before shipping. The 6-item checklist is regression-tested by tools/learning-loop-mastra/__tests__/legacy-mcp/runtime-agnostic.test.js.",
    suggestion:
      "Runtime-agnostic features: use shim-not-fork + cross-surface-iteration; audit with `check_runtime_agnostic` before shipping.",
    derived_from_rule: null,
  },
  {
    // On-demand: reference material fetched via loop_get_instruction when the
    // bash gate blocks an executor verb — not session-start orientation. The
    // bash-gate block message remains the common-case entry point; this row is
    // the static canonical reference (proactive pre-block recording path).
    slug: "gate-verb-allowance",
    kind: "discoverability",
    tier: "on-demand",
    text:
      "Gate-verb allowance (bounded 30 min): the bash gate blocks executor verbs (`bash`, `eval`, `node -e`, …) unless an active `gate-verb:<verb>` observation exists. To record one deliberately: (1) gate_mark_preflight({surface:\"runtime-state\"}); (2) runtime_state_record({affected_system:\"gate-verb:<verb>\", kind:\"budget-state\", id:\"gate-verb:<verb>\", source_ref:\"local:meta-state:gate-verb-allowance\", timestamp:\"<ISO>\"}) — id MUST equal affected_system or the write is rejected (canonical_id_required). The source_ref is the sanctioned sentinel: intentionally non-resolving, no finding-id grep needed. The allowance expires 30 min after timestamp — a bounded, auditable window — and the promoted-rule denylist still applies during the allowance window.",
    suggestion:
      "Gate-verb allowance: gate_mark_preflight({surface:\"runtime-state\"}) then runtime_state_record with id === affected_system \"gate-verb:<verb>\"; expires 30 min after timestamp; the promoted-rule denylist still applies.",
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
    tier: "on-demand",
    order: 10,
    text:
      "Test discipline (deterministic parse). Iterate via `pnpm test:iter` — runs `vitest run --bail=1`, suppresses raw stdout, and prints only the parsed summary from `.test-logs/vitest-results.json` (shape numTotalTests/numFailedTests/numTotalTestSuites + testResults[].assertionResults[]; status passed/failed). One file: `pnpm test:one <path>` — a single command that runs vitest and prints the parsed summary via `bash tools/scripts/vitest-failures.sh` (vitest's json reporter writes `.test-logs/vitest-results.json` on every run regardless of stdout, so no redirect is needed; exit 0 green / 1 failed / 2 missing-or-invalid). Post-edit: `pnpm exec vitest --changed`. The bash gate blocks `vitest run`/`pnpm test` piped to `tail`/`grep` — the JSON is the source of truth, not raw stdout. Do NOT redirect vitest stdout to a /tmp log and grep it (a two-command split that evades the gate). Do NOT grep raw vitest stdout, re-read passing tests, or hand-write `python -c`/`node -e` to parse the JSON. Rule 2 (same-file-read): if you read the same file >5 times in 60s with no Edit/Write/Bash, STOP — write a one-line journal to `plans/reports/` and ask the operator.",
    suggestion:
      "Long-running pnpm test discipline: per-namespace log files, read-loop stop conditions.",
    derived_from_rule: null,
  },
  {
    // Standalone hint: file-index drift is operational, not a rule.
    slug: "file-edit-drift-and-fingerprints",
    kind: "process",
    tier: "on-demand",
    order: 90,
    text:
      "File-edit drift and fingerprints. Fingerprints in `file-index.jsonl` are load-bearing for loop grounding; `file-index.jsonl` is an UNTRACKED regen artifact (gitignored — see `.gitignore`) rebuilt by the seed step at test/pre-commit/CI time. `pnpm test` auto-seeds via the prepended `tools/learning-loop-mastra/tools/handlers/scripts/seed-file-index.mjs` step before `vitest run`, so a legitimate Edit/Write during a fix is absorbed at test time without operator action. For deliberate per-path drift acceptance with operator audit (a gate-log entry recording who/when/why), use `meta_state_refresh_file_index({path, reason})` instead — `seed-file-index.mjs` is a mechanical bulk re-seed that intentionally omits per-path gate-log entries (git history is its audit). If you edit files DURING a debug/test loop and hit a `file-index.jsonl` drift error before re-running the suite, run `node tools/learning-loop-mastra/tools/handlers/scripts/seed-file-index.mjs` once (or set `SKIP_PRESEED=1` for a single pre-commit bypass) before re-running tests. The cold-tier cache is keyed on both `meta-state.jsonl` AND `file-index.jsonl` SHAs — either change invalidates. `upsertFileIndexEntry` is a true no-op on an unchanged (key, hash) so re-seeding without code change keeps the cache warm. Do NOT call refresh per Edit/Write when the next `pnpm test` will do it; targeted scripts (`pnpm test:cold-session`, `pnpm test:debug`, `pnpm check:freshness`) do NOT run the seed step by default, so cold-session runs against a stale file-index can still surface drift at vitest time.",
    suggestion:
      "File-edit drift and fingerprints: `file-index.jsonl` is an UNTRACKED regen artifact (gitignored) rebuilt by the seed step; pretest seed (`pnpm test`) absorbs Edit/Write drift at test time; per-path `meta_state_refresh_file_index` for deliberate operator-audited refresh; `SKIP_PRESEED=1` escape hatch for a single pre-commit bypass. `upsertFileIndexEntry` is a true no-op on unchanged (key, hash) so re-seeding without code change keeps the cache warm. Cold-tier cache invalidates on either `meta-state.jsonl` OR `file-index.jsonl` SHA change.",
    derived_from_rule: null,
  },
]);

/**
 * List registry entries filtered by kind and/or injection-policy tier.
 * Both filters are optional: omitted kind → all kinds; omitted tier
 * (undefined) → NO tier filter. The tier default is deliberately undefined,
 * never "startup": loop_get_instruction's numeric resolution depends on the
 * no-filter call returning every row of a kind, so a startup default would
 * silently renumber the session-ephemeral indices. Entries without an
 * explicit `tier` field behave as "startup" when a tier filter IS supplied.
 * Pure — no I/O.
 */
export function listHints({ kind, tier } = {}) {
  let out = kind === undefined ? HINT_REGISTRY.slice() : HINT_REGISTRY.filter((e) => e.kind === kind);
  if (tier !== undefined) out = out.filter((e) => (e.tier ?? "startup") === tier);
  return out;
}

/**
 * Shared pointer-field projection for one hint entry: the slug plus its
 * one-line suggestion (falling back to text, then to a positional placeholder
 * slug). Used by both the string pointer projection (`projectToPointers`) and
 * the structured `buildHintIndex` so the two discovery surfaces cannot drift.
 * Pure — no I/O.
 */
function pointerFields(entry, index) {
  return {
    slug: entry?.slug ?? `hint-${index}`,
    suggestion: entry?.suggestion ?? entry?.text ?? "",
  };
}

/**
 * Project a list of hint entries to pointer form: `${slug} — ${suggestion}`
 * lines, so injection surfaces can advertise the pull path without pushing
 * full paragraphs. The slug + suggestion pair already lives on every registry
 * entry (the test-enforced `length > 20` on `suggestion` keeps the projection
 * useful). Pure over its input; no I/O, no randomness.
 */
export function projectToPointers(entries) {
  return entries.map((entry, index) => {
    const { slug, suggestion } = pointerFields(entry, index);
    return `${slug} — ${suggestion}`;
  });
}

/**
 * Build the structured hint index: `[{slug, suggestion}]` for every registry
 * row (both tiers, both kinds) merged with the rule-derived process slugs
 * from `buildProcessView`. The index is the complete discovery surface
 * carried by warm injection: on-demand rows are discoverable here while their
 * full text stays behind loop_get_instruction.
 *
 * Registry rows come first in registry order; rule-derived slugs append in
 * view order. Slug collisions are first-wins (registry beats rule-derived) so
 * the index never carries a duplicate slug.
 * Pure — `rulesById` is a precomputed map supplied by the caller (no I/O);
 * when omitted, the index degrades to the registry rows only.
 */
export function buildHintIndex({ rulesById } = {}) {
  const index = HINT_REGISTRY.map(pointerFields);
  const seen = new Set(index.map((e) => e.slug));
  for (const entry of buildProcessView({ rulesById })) {
    if (seen.has(entry.slug)) continue;
    seen.add(entry.slug);
    index.push(pointerFields(entry, index.length));
  }
  return Object.freeze(index);
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
 * misalignment in loop_get_instruction (the code-review C2 finding).
 *
 * Pure — `rulesById` is a precomputed map supplied by the caller.
 */
export function resolveHintText(entry, rulesById) {
  if (entry.derived_from_rule == null) return entry.text;
  return rulesById?.get(entry.derived_from_rule)?.hint_text ?? null;
}
