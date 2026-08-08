# Dedup Audit: 18 Hints vs AGENTS.md / CLAUDE.md

**Produced:** 2026-08-08 (scouting audit for plan `260808-2018-hint-injection-policy-on-demand-reclassification-gate-verb-allowance-key`, Phase 3 input).
**Scope:** the 16 discoverability + 2 process standalone hints in `tools/learning-loop-mastra/core/hint-registry.js`, cross-referenced against `AGENTS.md` and `CLAUDE.md`. Rule-derived process hints are out of scope (they come from promoted rules).

## Per-hint canonical-home assignments

| slug | counterpart location | overlap | canonical home | rationale |
|---|---|---|---|---|
| internalization-rule | AGENTS.md §2; CLAUDE.md Budget bullet | partial-dup | AGENTS.md | §2 is the authoritative citation rule; CLAUDE.md already points there; hint is a short restatement → trim hint to pointer. |
| mechanism-check | AGENTS.md §2 step 3 | partial-dup | hint | Hint owns the auto-default-true / opt-out-false mechanics; AGENTS.md only states the recommendation → keep hint canonical, trim AGENTS.md aside. |
| source-refs | AGENTS.md §2 step 2; CLAUDE.md gate-verb paragraph | partial-dup | split: AGENTS.md owns general, CLAUDE.md owns sentinel | General guidance duplicated in AGENTS.md; gate-verb sentinel duplicated in CLAUDE.md → trim both toward the hint + block message. |
| derive-refresh | AGENTS.md §2 step 3 | partial-dup | hint | AGENTS.md only mentions both tools in passing; hint owns the per-tool recipe → keep hint, trim AGENTS.md tool-name restatement. |
| designs-no-code | NONE | unique | hint | No counterpart. |
| status-lifecycle | AGENTS.md §1 finding-table row | partial-dup | split: AGENTS.md owns table, hint owns ops | AGENTS.md table has the compact vocabulary; hint owns re_verify/touch/archived operational detail → trim hint toward pointer + ops residue. |
| reopens | NONE | unique | hint | `reopens`-writer-drop + 17 historical edges; nowhere else. |
| rule-lifecycle | NONE (AGENTS.md §1 table names kinds only) | pointer-only | hint | `meta_state_list({ entry_kind })` / `loop_describe({tier:"cold"})` query recipe is unique. |
| canonical-tool | CLAUDE.md Tool-surface bullet | pointer-only | hint | 4-question framework + tool-selection-guide.md reference is unique. |
| surface-split | CLAUDE.md Discovery bullet; AGENTS.md opening | pointer-only | hint | "Each surface has a distinct role; do not duplicate" framing is unique — keep canonical (the do-not-duplicate rule). |
| reopens-script | NONE | unique | hint | Procedural companion to `reopens`; candidate to merge with `reopens` (out of scope for this plan). |
| loop-get-instruction | AGENTS.md §1 | partial-dup | split: hint owns tool pointer, AGENTS.md owns framing | `loop_get_instruction` tool pointer unique; meta-state/product/substrate framing duplicated from AGENTS.md §1 → trim hint to pointer + index framing. |
| narrow-query | CLAUDE.md Audit-trail bullet (adjacent only) | pointer-only | hint | Narrow-vs-unfiltered query recommendation is unique. |
| phase-a-reframe | AGENTS.md §1 + table; CLAUDE.md Records bullet | full-dup (worst triplication) | AGENTS.md | Bound/unbound = AGENTS.md §1; records-via-tools = CLAUDE.md; hint restates both → trim hint to one-line startup orientation pointer. |
| session-id-query | NONE | unique | hint | No counterpart. |
| runtime-agnostic-features | CLAUDE.md Tool-surface bullet | pointer-only | hint | shim-not-fork + 6-item checklist is unique; CLAUDE.md only names the tool. |
| pnpm-test-discipline | AGENTS.md §3 gate table; CLAUDE.md gate-verb paragraph | partial-dup | split: hint owns test-runner discipline, AGENTS.md §3 owns gate table, CLAUDE.md owns gate-verb | Distinct facets; overlap is only the `pnpm test:one` name → keep hint canonical, no doc trim. |
| file-edit-drift-and-fingerprints | AGENTS.md §3 | partial-dup | split: hint owns general drift, AGENTS.md §3 owns fallow-specific | AGENTS.md §3 covers desync in fallow context; hint owns broader seed/SKIP_PRESEED/cache discipline → keep hint canonical, no doc trim. |

## Unique hints (must survive dedup — no counterpart to move TO)
- `designs-no-code`, `reopens`, `reopens-script` (merge candidate, out of scope), `rule-lifecycle`, `narrow-query`, `session-id-query`, `runtime-agnostic-features`.

## Triplications (hint + AGENTS.md + CLAUDE.md) — worst overlap
1. **phase-a-reframe** (worst): restates AGENTS.md §1 (bound/unbound) + CLAUDE.md Records bullet (records-via-tools).
2. **internalization-rule** (soft): hint + AGENTS.md §2 (full rule) + CLAUDE.md Budget bullet (pointer). CLAUDE.md is pointer-only; the hint is the redundant copy.
3. **source-refs** (partial): general guidance hint + AGENTS.md §2 step 2; sentinel hint-suggestion + CLAUDE.md gate-verb paragraph.
4. **pnpm-test-discipline** (partial): `pnpm test:one` overlap across hint + CLAUDE.md gate-verb; test-gate overlap across hint + AGENTS.md §3.

## Dedup recommendation (Phase 3 action)
- **(a) Trim hint → pointer:** `internalization-rule`, `source-refs`, `status-lifecycle`, `phase-a-reframe`, `loop-get-instruction`.
- **(b) Remove entirely:** none — trimming to pointer preserves the slug/index; full removal breaks numeric-index back-compat. (`internalization-rule` and `phase-a-reframe` are the strongest candidates if pointers are later deemed unnecessary, but slugs stay regardless.)
- **(c) Keep hint canonical; trim doc:** `mechanism-check` (trim AGENTS.md §2 aside), `derive-refresh` (trim AGENTS.md §2 restatement), `surface-split` (no trim — canonical rule), `canonical-tool` (no trim), `pnpm-test-discipline` (no trim — distinct facets), `file-edit-drift-and-fingerprints` (no trim — distinct facets).
- **(d) Keep as-is (unique):** `designs-no-code`, `reopens`, `reopens-script`, `rule-lifecycle`, `narrow-query`, `session-id-query`, `runtime-agnostic-features`.

## Invariants / risks
- `HINT_REGISTRY` slugs + order are frozen (no rename/reorder/remove) — numeric-index back-compat for `loop_get_instruction`. Dedup = trim text/suggestion, never structural.
- `session-context.json` mirrors hint `suggestion` fields — a trim must propagate to the sidecar (the Phase 1 sidecar builder handles this; verify no stale copy).
- `surface-split` is the do-not-duplicate rule itself — must stay canonical; trimming it away removes the rule that mandates this audit.

## Open questions (out of scope for this plan)
- Should `reopens` and `reopens-script` merge? They share the `reopens`-writer-drop thesis but carry distinct recipes (declarative vs procedural). Merging changes `loop_get_instruction` index semantics — needs separate operator sign-off.