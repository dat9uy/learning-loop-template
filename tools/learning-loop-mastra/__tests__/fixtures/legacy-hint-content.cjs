// Independent preservation fixture for the legacy Hint rows.
//
// Do not derive this data from core/hint-registry.js: that module is the
// implementation under test. If a Hint is intentionally revised, update this
// fixture and the corresponding preservation decision together.
const LEGACY_HINT_FIXTURE = [
  {
    slug: "internalization-rule",
    kind: "discoverability",
    tier: "on-demand",
    text: "The citation rule is canonical in AGENTS.md §2: cite the code, not the markdown — `meta_state_report({ evidence_code_ref: 'path/to/file.js:line' })` so the loop can hash and re-check it, then cite the finding via `local:meta-state:<id>` source_refs.",
    suggestion: "Prefer `local:meta-state:<id>` source_refs and set `evidence_code_ref` to a code path so the loop can re-check it.",
  },
  {
    slug: "mechanism-check",
    kind: "discoverability",
    tier: "on-demand",
    text: "When you pass `evidence_code_ref` to `meta_state_report`, `mechanism_check` is auto-defaulted to `true` (so the loop will hash and re-check the code). Pass `mechanism_check: false` explicitly to opt out — the response will include a `warnings` array explaining the tradeoff.",
    suggestion: "When you provide `evidence_code_ref`, `mechanism_check` defaults to true; pass `false` only if you intentionally want to opt out.",
  },
  {
    slug: "source-refs",
    kind: "discoverability",
    tier: "on-demand",
    text: "General source_refs guidance is canonical in AGENTS.md §2 (prefer `local:meta-state:<id>`; `local:plans/...` markdown refs are the discouraged escape hatch). Gate-verb budget-state observations are the sanctioned exception: they use the sentinel `local:meta-state:gate-verb-allowance` — intentionally non-resolving, no finding-id grep needed.",
    suggestion: "Use `local:meta-state:<id>` for citations; reserve `local:plans/...` markdown refs for the escape hatch. Gate-verb budget-state observations use the non-resolving sentinel `local:meta-state:gate-verb-allowance`.",
  },
  {
    slug: "derive-refresh",
    kind: "discoverability",
    tier: "on-demand",
    text: "Run `meta_state_derive_status({ id })` to re-check if a finding is still true. Run `meta_state_refresh_file_index({ path })` to re-hash a cited path's code in the shared fingerprint index after a refactor — one call re-grounds every finding anchored to that path.",
    suggestion: "Call `meta_state_derive_status` before resolving; call `meta_state_refresh_file_index({ path })` after refactoring cited code to re-ground the path's hash in the shared fingerprint index.",
  },
  {
    slug: "designs-no-code",
    kind: "discoverability",
    tier: "on-demand",
    text: "For designs without code, cite the change-log that records the design (`meta_state_log_change` with `change_target: '<plan-path>'`).",
    suggestion: "For design-only choices, log a change-log entry and cite its id in `source_refs`.",
  },
  {
    slug: "status-lifecycle",
    kind: "discoverability",
    tier: "on-demand",
    text: "Status vocabulary is canonical in AGENTS.md §1's kind table: `open` | `resolved` | `accepted` | `archived`; `superseded` collapsed into `resolved` + a citation row; `stale` is a derived evidence-freshness view (`isStaleView`), not a status. Closure: always close with `meta_state_resolve` — the only closure to offer. `meta_state_supersede` is an internal resolve flavor that additionally emits a change-log citation row; it is NOT an option to offer. Ops residue: the stale view is surfaced by `meta_state_query_drift` + `meta_state_sweep` (read-only) and re-grounded via `meta_state_re_verify` (stamps `last_verified_at`, no status transition — the suggestion carries the re_verify/touch split). `archived` is append-only via `archiveEntry`/`deleteEntry` (write-boundary guard on the union `metaStateEntrySchema`), restorable via `meta_state_unarchive`. The legacy `expired`/`reported`/`active`/`auto-resolved` statuses were removed; `isOpen` tolerates legacy persisted values. The `reopens` + `cascade_from` writers were dropped — new evidence appends a new finding; no operation un-closes an old one as a side-effect.",
    suggestion: "Use `meta_state_re_verify({ id, refresh: true })` to re-ground a finding with re-runnable verification.steps; use `meta_state_touch({ id })` to re-ground an aged finding whose steps are empty (operator attestation — guarded by checkGrounding, rejects on drift). Both stamp `last_verified_at` without a status transition. `stale` is a derived view, not a status — see `meta_state_query_drift`.",
  },
  {
    slug: "reopens",
    kind: "discoverability",
    tier: "on-demand",
    text: "The `reopens` writer was dropped — new findings cannot re-open a closed parent via `reopens` + cascade. The `reopens` field stays `.optional()` on the finding schema (read-only historical) and the 17 historical `reopens` edges are still queryable via `meta_state_relationships` + `meta_state_relationship_validate`. To close a stale parent, call `meta_state_resolve({ id: old_id })` on the parent directly (no cascade).",
    suggestion: "`meta_state_report` no longer accepts `reopens`; `meta_state_resolve` no longer accepts `cascade_from`. To close a stale parent, call `meta_state_resolve` on it directly. The 17 historical edges remain queryable; the read path is retained.",
  },
  {
    slug: "rule-lifecycle",
    kind: "discoverability",
    tier: "on-demand",
    text: "For rule and loop-design lifecycle, use `meta_state_list({ entry_kind: 'rule' | 'loop-design' })` or `loop_describe({ tier: 'cold' })`. The cold tier surfaces a `loop_designs` list with `id`, `title`, `proposed_design_for`, `addresses`, and `shipped_in_plan`.",
    suggestion: "Query loop-design/rule lifecycle via `meta_state_list({ entry_kind: 'rule' | 'loop-design' })` or `loop_describe({ tier: 'cold' })`.",
  },
  {
    slug: "canonical-tool",
    kind: "discoverability",
    tier: "startup",
    text: "To pick a tool, prefer the canonical MCP tool over `node -e` escape hatches or direct file I/O. The 4-question framework: what (what does it do), when (when to use vs alternatives), inputs (what it accepts), returns (what shape comes back). See `tools/learning-loop-mastra/tools/handlers/references/tool-selection-guide.md` for the intent to tool mapping.",
    suggestion: "Use the tool manifest + the tool-selection guide to pick tools; avoid `node -e` and direct file I/O to `meta-state.jsonl`.",
  },
  {
    slug: "surface-split",
    kind: "discoverability",
    tier: "startup",
    text: "AGENTS.md is the priority-1 prompt (the steering layer: shape of the loop, rules, canonical paths). The tool manifest is the deterministic tool-selection surface. `loop_describe` warm tier `discoverability_hints` is the at-start-up injection. The `learning-loop` skill is the prompt-author docs. Each surface has a distinct role; do not duplicate content across them.",
    suggestion: "AGENTS.md is the steering prompt; the tool manifest is deterministic; warm hints are at-start; the skill is prompt-author docs.",
  },
  {
    slug: "reopens-script",
    kind: "discoverability",
    tier: "on-demand",
    text: "For 'X is related to Y' prompts: (1) `meta_state_relationship_validate` to lint the prospective edge; (2) report the new finding with `meta_state_report` (the `reopens` arg was dropped — the cross-ref is no longer set on the new finding); (3) the orphan parent stays open until explicitly resolved. To close it, call `meta_state_resolve({ id: parent_id })` directly — no cascade step.",
    suggestion: "For cross-references, run `meta_state_relationship_validate`, then resolve orphan parents explicitly via `meta_state_resolve` (no cascade). The `reopens` writer + `cascade_from` arg were dropped; the read path is retained for the 17 historical edges.",
  },
  {
    slug: "loop-get-instruction",
    kind: "discoverability",
    tier: "startup",
    text: "On-demand hint lookup: use `loop_get_instruction({ key: '<slug>' | <index> })` when a hint has scrolled out of context or you need a cross-reference pattern. Warm injection carries only the startup hints; the full set rides the warm `hint_index` (slug + suggestion) and is fetched per-slug here. The meta-state / product / substrate surface split is canonical in AGENTS.md §1 — cite the correct surface.",
    suggestion: "Use `loop_get_instruction` for on-demand lookup of any hint by slug or index; warm carries the startup hints, the rest ride `hint_index`.",
  },
  {
    slug: "narrow-query",
    kind: "discoverability",
    tier: "on-demand",
    text: "Narrow query: prefer `meta_state_list({ id: [...] })` or `meta_state_list({ ref_by, ref_field })` over the unfiltered dump. The unfiltered list is for batch audit / sweep only; the narrow query is the default. Projection semantics: `meta_state_list` default = live latest-version projection (one row per id, max_by(version)). `include_all_versions: true` is audit-only — never use history as a workaround for a fresh write; if a just-written record reads stale, re-query once rather than grepping `meta-state.jsonl`. An id-filtered query that hits a terminal/archived id returns an `excluded_ids` notice naming the id + its status — pass `include_archived: true` to include it.",
    suggestion: "Use `meta_state_list({ id: [...] })` for one-call resolution of cross-reference ids; use `{ ref_by, ref_field }` for 1-hop neighborhood queries. Reserve the unfiltered list for batch audit only. Default = live latest-version projection; `include_all_versions` is audit-only, never a workaround for a fresh write; an `excluded_ids` notice on an id query means pass `include_archived: true`.",
  },
  {
    slug: "phase-a-reframe",
    kind: "discoverability",
    tier: "startup",
    text: "Orientation: the meta-surface is the only bound surface (4-kind union: finding | change-log | rule | loop-design) and the product surface is unbound. The full framing is canonical in AGENTS.md §1; the records-via-tools rule is in CLAUDE.md's Records bullet.",
    suggestion: "The meta-surface (finding | change-log | rule | loop-design) is the only bound surface; the product surface is unbound.",
  },
  {
    slug: "session-id-query",
    kind: "discoverability",
    tier: "on-demand",
    text: "For hook-emitted batches, query by `session_id` directly: `meta_state_list({ session_id: '...' })`. Do not filter `compact: true` output client-side — compact is for display, not for client-side filtering.",
    suggestion: "Hook-emitted batches: query by `session_id` via `meta_state_list`; do not client-side filter compact output.",
  },
  {
    slug: "runtime-agnostic-features",
    kind: "discoverability",
    tier: "on-demand",
    text: "Every feature must be runtime-agnostic (shim-not-fork + cross-surface-iteration). Codified as rule-runtime-agnostic-features. Audit a new feature with the check_runtime_agnostic MCP tool before shipping. The 6-item checklist is regression-tested by tools/learning-loop-mastra/__tests__/integration/runtime-agnostic.test.js.",
    suggestion: "Runtime-agnostic features: use shim-not-fork + cross-surface-iteration; audit with `check_runtime_agnostic` before shipping.",
  },
  {
    slug: "gate-verb-allowance",
    kind: "discoverability",
    tier: "on-demand",
    text: "Gate-verb allowance (bounded 30 min): the bash gate blocks executor verbs (`bash`, `eval`, `node -e`, …) unless an active `gate-verb:<verb>` observation exists. To record one deliberately: (1) gate_mark_preflight({surface:\"runtime-state\"}); (2) runtime_state_record({affected_system:\"gate-verb:<verb>\", kind:\"budget-state\", id:\"gate-verb:<verb>\", durability:\"ephemeral\", source_ref:\"local:meta-state:gate-verb-allowance\", timestamp:\"<ISO>\"}) — id MUST equal affected_system or the write is rejected (canonical_id_required), and durability must be \"ephemeral\" (gate-verb:* allowances are session-local, never committed). The source_ref is the sanctioned sentinel: intentionally non-resolving, no finding-id grep needed. The allowance expires 30 min after timestamp — a bounded, auditable window — and the promoted-rule denylist still applies during the allowance window.",
    suggestion: "Gate-verb allowance: gate_mark_preflight({surface:\"runtime-state\"}) then runtime_state_record({..., durability:\"ephemeral\"}) with id === affected_system \"gate-verb:<verb>\"; expires 30 min after timestamp; the promoted-rule denylist still applies.",
  },
  {
    slug: "pnpm-test-discipline",
    kind: "process",
    tier: "on-demand",
    order: 10,
    text: "Test discipline (deterministic parse). Iterate via `pnpm test:iter` — runs `vitest run --bail=1`, suppresses raw stdout, and prints only the parsed summary from `.test-logs/vitest-results.json` (shape numTotalTests/numFailedTests/numTotalTestSuites + testResults[].assertionResults[]; status passed/failed). One file: `pnpm test:one <path>` — a single command that runs vitest and prints the parsed summary via `bash tools/scripts/vitest-failures.sh` (vitest's json reporter writes `.test-logs/vitest-results.json` on every run regardless of stdout, so no redirect is needed; exit 0 green / 1 failed / 2 missing-or-invalid). Post-edit: `pnpm exec vitest --changed`. The bash gate blocks `vitest run`/`pnpm test` piped to `tail`/`grep` — the JSON is the source of truth, not raw stdout. Do NOT redirect vitest stdout to a /tmp log and grep it (a two-command split that evades the gate). Do NOT grep raw vitest stdout, re-read passing tests, or hand-write `python -c`/`node -e` to parse the JSON. Rule 2 (same-file-read): if you read the same file >5 times in 60s with no Edit/Write/Bash, STOP — write a one-line journal to `plans/reports/` and ask the operator.",
    suggestion: "Long-running pnpm test discipline: per-namespace log files, read-loop stop conditions.",
  },
  {
    slug: "file-edit-drift-and-fingerprints",
    kind: "process",
    tier: "on-demand",
    order: 90,
    text: "File-edit drift and fingerprints. Fingerprints in `file-index.jsonl` are load-bearing for loop grounding; `file-index.jsonl` is an UNTRACKED regen artifact (gitignored — see `.gitignore`) rebuilt by the seed step at test/pre-commit/CI time. `pnpm test` auto-seeds via the prepended `tools/learning-loop-mastra/tools/handlers/scripts/seed-file-index.mjs` step before `vitest run`, so a legitimate Edit/Write during a fix is absorbed at test time without operator action. For deliberate per-path drift acceptance with operator audit (a gate-log entry recording who/when/why), use `meta_state_refresh_file_index({path, reason})` instead — `seed-file-index.mjs` is a mechanical bulk re-seed that intentionally omits per-path gate-log entries (git history is its audit). If you edit files DURING a debug/test loop and hit a `file-index.jsonl` drift error before re-running the suite, run `node tools/learning-loop-mastra/tools/handlers/scripts/seed-file-index.mjs` once (or set `SKIP_PRESEED=1` for a single pre-commit bypass) before re-running tests. The cold-tier cache is keyed on both `meta-state.jsonl` AND `file-index.jsonl` SHAs — either change invalidates. `upsertFileIndexEntry` is a true no-op on an unchanged (key, hash) so re-seeding without code change keeps the cache warm. Do NOT call refresh per Edit/Write when the next `pnpm test` will do it; targeted scripts (`pnpm test:cold-session`, `pnpm test:debug`, `pnpm check:freshness`) do NOT run the seed step by default, so cold-session runs against a stale file-index can still surface drift at vitest time.",
    suggestion: "File-edit drift and fingerprints: `file-index.jsonl` is an UNTRACKED regen artifact (gitignored) rebuilt by the seed step; pretest seed (`pnpm test`) absorbs Edit/Write drift at test time; per-path `meta_state_refresh_file_index` for deliberate operator-audited refresh; `SKIP_PRESEED=1` escape hatch for a single pre-commit bypass. `upsertFileIndexEntry` is a true no-op on unchanged (key, hash) so re-seeding without code change keeps the cache warm. Cold-tier cache invalidates on either `meta-state.jsonl` OR `file-index.jsonl` SHA change.",
  },
];

module.exports = { LEGACY_HINT_FIXTURE };
