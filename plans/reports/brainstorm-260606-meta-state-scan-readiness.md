---
title: "Meta-State Scan-Readiness: Relationship-First Refactors"
description: "Closes the cold-state scan-readiness gaps surfaced in the 2026-06-06 cold-tier test: 2 broken loop-design proposed_design_for refs, 86% orphan findings with no incoming relationship, ~6% mechanism_check coverage on resolved findings, no inverse indexes, and a cold tier that pays for the audit trail twice. 6 refactors, all reusing existing kinds/tools. No new schema, no new MCP tool, no new artifact type (rule-no-new-artifact-types is active)."
date: "2026-06-06T00:00:00Z"
tags: [meta, meta-state, scan-readiness, relationship, inverse-index, mechanism-check, drift, token-cost, registry-summary]
status: draft
session: 260606-cold-state-test
supersedes: null
superseded_by: null
related:
  - meta-state.jsonl entry meta-260606T2055Z-tools-learning-loop-mcp-core-meta-state-js-metastateentrysch (the 4-kind discriminated union ship — this report extends that surface)
  - meta-state.jsonl entry meta-260606T1830Z-context-pollution-stale-workaround-languag (inverse indexes (#2) reduce cold-tier scan pollution by giving agents O(1) lookup)
  - meta-state.jsonl entry meta-260606T2102Z-agent-used-direct-file-i-o-node-e-scripts- (idempotency in meta_state_log_change is the precondition for the registry_summary.md sweeper in #6)
  - meta-state.jsonl entry meta-260606T2106Z-agent-called-meta-state-log-change-mcp-too (same idempotency gap, second recurrence — prerequisite for any auto-summarization)
  - plans/reports/brainstorm-260606-discoverability-and-meta-evidence-migration.md (sibling report: closes the discoverability_hints surface; this report extends the surface with relationship indexes)
  - plans/reports/brainstorm-260602-meta-state-lifecycle-tidy.md (T1 wired splitSegments + stripMessageFlags; cold-tier cost reduction in #5 is the natural follow-up)
  - plans/reports/brainstorm-260602-sp0-log-change.md (change-log kind is the substrate for #6 registry_summary.md generation)
  - plans/reports/brainstorm-260602-sp1-derive-status.md (mechanism_check schema field is reused in #3 backfill)
  - plans/reports/brainstorm-260602-sp2-check-grounding.md (code_fingerprint SHA-256 is the substrate for #3 mechanism_check backfill)
  - plans/260606-rule-loop-design-first-class/plan.md (the 4-kind union ship is the prerequisite for #1 broken-ref fix)
  - tools/learning-loop-mcp/tools/loop-describe-tool.js (target for #2 inverse indexes + #5 lazy description expansion)
  - tools/learning-loop-mcp/core/meta-state.js (target for #1 broken-ref repair + #3 mechanism_check backfill helper)
  - tools/learning-loop-mcp/core/loop-introspect.js (target for #2 buildInverseIndexes function)
  - tools/learning-loop-mcp/tools/meta-state-list-tool.js (target for #4 compact:true flag)
  - tools/learning-loop-mcp/tools/meta-state-log-change-tool.js (target for #6 sweep orchestrator)
  - tools/learning-loop-mcp/tools/meta-state-sweep-tool.js (target for #6 registry_summary.md emit)
  - tools/learning-loop-mcp/__tests__/ (target for #1-#6 unit tests + cold-tier token-cost regression test)
related_findings:
  - meta-260606T1830Z-context-pollution-stale-workaround-languag (loop-anti-pattern, reported, mechanism_check=true)
  - meta-260606T2102Z-agent-used-direct-file-i-o-node-e-scripts- (loop-anti-pattern, reported, mechanism_check=true)
  - meta-260606T2106Z-agent-called-meta-state-log-change-mcp-too (loop-anti-pattern, reported, mechanism_check=true)
  - meta-260606T1500Z-closeout-script-idempotency-bug (loop-anti-pattern, reported)
---

# Meta-State Scan-Readiness: Relationship-First Refactors

## TL;DR

The 2026-06-06 cold-tier test scored the meta-state registry **7/10 for scan-readiness**. Strong: 0 broken legacy refs, all 4 rules carry `origin` → finding, G8 lineage consolidates cleanly. Weak: 2 broken `proposed_design_for` refs on the new loop-design kind, 25 of 29 findings (86%) have zero incoming relationship, only 3 of 51 entries carry `mechanism_check=true`, no inverse indexes (`addresses_inverse`, `supersedes_inverse`), and the cold tier ships full descriptions for terminal-status findings (audit-trail double-charge: ~12K tokens of resolved/superseded/expired prose).

This report ships **6 relationship-first refactors** that close those gaps. Zero new schema, zero new MCP tools, zero new artifact types (rule-no-new-artifact-types is active). All targets are `core/meta-state.js`, `core/loop-introspect.js`, `tools/loop-describe-tool.js`, `tools/meta-state-list-tool.js`, and `tools/meta-state-sweep-tool.js`. Expected gain: scan-readiness 7→9, cold tier token cost −45% (~27K → ~15K tokens).

## Problem Statement

### Cold-state test results (2026-06-06, 51 entries)

| Metric | Value | Verdict |
|---|---|---|
| Total entries | 51 | — |
| By kind | finding 29, change-log 16, rule 4, loop-design 2 | 4-kind union working |
| By status | active 23, resolved 16, superseded 5, reported 4, expired 3 | expected distribution |
| Broken legacy forward refs | 0 | good |
| Broken `proposed_design_for` (new loop-design) | 4 (2 entries × 2 fields each) | **broken** |
| Findings with no incoming relationship | 25 of 29 (86%) | **orphan-heavy** |
| Entries with `mechanism_check=true` | 3 of 51 (6%) | **drift-thin** |
| Resolved findings with `mechanism_check=true` | 0 of 16 | **regression-blind** |
| Warm-tier relevant entries | 27 of 51 (53%) | warm tier signal density is fine |
| Cold-tier cost | ~27K tokens | **audit-trail double-charge** |
| Drift query (active filter) | empty | mechanism checks where applied work |

### The 4 broken `proposed_design_for` refs (root cause: schema intent vs data shape)

`meta-260606T2055Z-...` shipped the 4-kind discriminated union (finding | change-log | rule | loop-design). The `loop-design` schema declares `proposed_design_for` as an array of entry ids. The 2 emitted loop-design entries wrote the values as **code symbols** (`loop_get_instruction`, `loop_describe`, `metaStateRuleEntrySchema`, `metaStateLoopDesignSchema`). Those aren't entry ids; they're function/schema names. Result: 4 broken forward refs in the brand-new kind. A reader can't traverse "what does this design ship?" without manual lookup.

### The 25 orphan findings (root cause: audit tail with no inbound link)

`meta_state_list` returns a flat list. A fresh agent asking "what does rule-X supersede?" or "what does this finding address?" must full-scan the 27K-token cold tier. The 25 orphan findings are the *resolved* tail (G8 recurrences, expired heredoc bugs, brainstorm-rejection notes) — correctly *terminal*, but reachable only by full scan. The relationship contract is half-built: rules have `origin` → finding, but no inverse `addresses_inverse` exists for "which designs / rules / change-logs touch this finding?"

### The 6% mechanism_check coverage (root cause: schema was added in SP2 but never backfilled)

SP2 (`brainstorm-260602-sp2-check-grounding.md`) shipped `code_fingerprint` SHA-256 + `meta_state_check_grounding`. The schema supports `mechanism_check=true` on any finding. But backfill is manual: only the 3 entries reported in this session (escape-hatch-abuse, tool-retry-loop, stale-workaround-language) carry the flag. The 16 resolved findings with `evidence.code_ref` are *not* drift-checkable.

### The 12K-token cold-tier double-charge (root cause: description attached to every entry)

The cold tier returns full descriptions on every entry, including the 16 resolved findings whose status already says "closed." A reader at the cold tier re-reads the audit trail in prose. Splitting `id + status + refs` (always) from `description + evidence` (lazy, behind a flag) cuts cost without losing relationship information.

## User-stated constraints (from session)

- **Scope**: all 6 refactors in one report. Reuse existing kinds/tools. No new schema, no new MCP tools, no new artifact types.
- **Output**: brainstorm report at `plans/reports/brainstorm-260606-meta-state-scan-readiness.md`. No plan yet (operator decision: end after brainstorm, like the 2026-06-06 discoverability report).
- **Acceptance**: each refactor named, scoped, with concrete file targets + trade-off + acceptance test.
- **Non-negotiable**: rule-no-new-artifact-types respected. Backward compatibility preserved (existing fields not renamed; new fields are opt-in).
- **Touchpoints**: `core/meta-state.js`, `core/loop-introspect.js`, `tools/loop-describe-tool.js`, `tools/meta-state-list-tool.js`, `tools/meta-state-sweep-tool.js`, `__tests__/`.

## Evaluated Approaches

### Refactor #1: broken `proposed_design_for` — fix data or fix schema?

**Position A: fix the data (rewrite the 2 loop-design entries).** Edit the JSONL via a one-shot migration script that resolves the 4 symbol names to real entry ids (or empty arrays if no entry exists yet). 1 commit, 0 schema cost.

**Position B: extend the schema to accept code symbols as an alternate value type.** Add `proposed_design_for_symbols: z.array(z.string()).optional()` to `metaStateLoopDesignSchema`. 1 commit, schema cost.

**Position C: leave the data; document that `proposed_design_for` is "code pointers" not "entry ids".** Update the schema docstring + add a runtime warning. 0 commits to data; relies on reader discipline.

**Chosen: A.** The schema's intent (entry ids) is correct. The data drifted. Position B bloats the schema for a 2-entry case. Position C leaves the broken-ref state unfixed. A one-shot migration script (`scripts/fix-loop-design-refs.mjs`) that resolves the 4 symbols → real ids (or strips them with a `fix_log` change-log entry) is the lowest-cost, highest-clarity move.

### Refactor #2: relationship coverage — build inverse indexes

**Position A: add `addresses_inverse` + `supersedes_inverse` to `loop_describe` cold tier.** Pure compute at read time. O(N) scan over entries to build the map. No schema change. ~1KB extra in cold tier.

**Position B: store inverse indexes as a derived cache file (`meta-state-index.json`).** Pre-computed at every `meta_state_log_change` / `meta_state_resolve`. O(1) read. Adds a cache file + invalidation concern.

**Position C: build a query tool (`meta_state_relationships({ id, direction })`).** New MCP tool. Returns inbound/outbound relationship lists for a given entry. 1 schema addition; 1 new tool.

**Chosen: A + C (paired).** Position A is the cheapest scan improvement and is enough for `loop_describe` audit reads. Position C is the right shape for an agent asking "what addresses this finding?" without re-scanning. Both are pure-read concerns. The cost of Position B (cache invalidation) exceeds the benefit at 51 entries; if the registry grows past ~500 entries, revisit.

### Refactor #3: mechanism_check backfill on resolved findings

**Position A: write a one-shot migration script.** Scan all `entry_kind=finding` entries with `status=resolved` and either `evidence.code_ref` or `evidence_code_ref` set; set `mechanism_check=true`. 1 commit, 0 schema cost.

**Position B: require mechanism_check on every resolve.** Modify `meta_state_resolve` to refuse the call unless `mechanism_check` is set (or operator-confirmed skip). 1 commit, but adds operator friction.

**Position C: add a "drift-coverage" loop_describe field that lists resolved findings missing the flag.** Pure surface change. 0 data changes; surfaces the gap.

**Chosen: A + C (paired).** A is the immediate fix (10–16 entries get the flag). C is the discoverability surface (operator sees coverage at `loop_describe` warm tier). Position B adds friction without enough benefit; the registry already has 0 broken legacy refs, so operator discipline is good.

### Refactor #4: `compact: true` flag on `meta_state_list`

**Position A: add a `compact` boolean to `meta_state_list` schema.** When true, return only `id`, `entry_kind`, `status`, and ref fields (`origin`, `addresses`, `consolidated_into`, `supersedes`, `promoted_to_rule`, `proposed_design_for`). Strip `description` and `evidence`. 1 schema addition, 1 handler branch.

**Position B: add a separate tool `meta_state_list_compact`.** New MCP tool. 1 schema + 1 tool.

**Position C: change the default behavior to compact and add `verbose: true`.** Breaking change to existing callers.

**Chosen: A.** Opt-in compact flag is backward-compatible. Default behavior unchanged. Existing callers see no diff. The compact shape is exactly what relationship-first scanning needs: 51 entries × ~80 bytes = ~4KB instead of 27K tokens.

### Refactor #5: lazy-expand descriptions on cold tier

**Position A: split each entry into a "summary" shape (id + status + refs + first 200 chars of description) for cold tier.** Cold tier calls a `summarize(entry)` function. Full description available via `meta_state_list({ id: '...' })` on demand.

**Position B: move descriptions to a separate `meta-state-descriptions.json` keyed by id.** Cold tier reads only refs + status. Descriptions are lazy-loaded by id. Saves ~12K tokens on cold tier; adds file I/O per id lookup.

**Position C: add a `description_mode: 'summary' | 'full' | 'none'` flag to `loop_describe`.** Default `summary`; cold tier defaults to `summary`; `full` opt-in.

**Chosen: C.** Position A is the right shape; Position C makes it configurable. The summary mode is the default for cold tier (audit use case); full mode for the rare case an agent needs prose. 0 schema cost; 1 function in `core/loop-introspect.js`.

### Refactor #6: `registry_summary.md` generator

**Position A: add a sweeper function to `meta_state_sweep` that emits `docs/registry-summary.md` on every resolve/log_change.** Auto-generated, committed by operator. Markdown only; no schema cost. ~2KB output.

**Position B: build the summary on-demand inside `loop_describe` warm tier as a new field `registry_summary`.** Pure compute; no file artifact.

**Position C: separate `meta_state_summary` MCP tool.** Returns the markdown. Opt-in.

**Chosen: A + B (paired).** A gives operators a version-controlled artifact they can read at PR time. B makes the summary reachable from the warm tier (lowest-friction discovery). The markdown format mirrors the table in the "Cold-state test results" section of this report: kind × status counts, broken-ref count, mechanism_check coverage, top 5 most-referenced entries.

## Final Recommended Solution

### Refactor #1 — fix 4 broken `proposed_design_for` refs

- **File**: `tools/learning-loop-mcp/scripts/fix-loop-design-refs.mjs` (new, one-shot, idempotent).
- **Logic**: scan 2 loop-design entries; for each value in `proposed_design_for` that is not a known entry id, attempt resolution: if it matches a rule id (`rule-*`) or another entry id, replace; else strip and append a `fix_log` line.
- **Follow-up**: emit a `change-log` entry recording the fix (so the audit trail captures the patch).
- **Acceptance test**: cold tier re-run shows 0 broken `proposed_design_for` refs.
- **File targets**:
  - `tools/learning-loop-mcp/scripts/fix-loop-design-refs.mjs` (new, ~30 lines)
  - `meta-state.jsonl` (data edit, 2 entries × ≤2 fields)
  - `__tests__/fix-loop-design-refs.test.js` (idempotency test)

### Refactor #2 — inverse indexes + relationships tool

- **File**: `tools/learning-loop-mcp/core/loop-introspect.js` — add `buildInverseIndexes(entries)`.
  - Returns `{ addresses_inverse: Map<id, id[]>, supersedes_inverse: Map<id, id[]>, promoted_to_rule_inverse: Map<id, id[]>, origin_inverse: Map<id, id[]> }`.
  - O(N) over entries; pure function.
- **File**: `tools/learning-loop-mcp/tools/loop-describe-tool.js` — add `inverse_indexes` field to cold tier response.
- **File**: `tools/learning-loop-mcp/tools/meta-state-relationships-tool.js` (new) — `meta_state_relationships({ id, direction: 'inbound' | 'outbound' | 'both' })`. Returns the relationship lists for one entry.
- **Acceptance test**: `meta_state_relationships({ id: 'meta-260606T2055Z-...' })` returns 2 inbound (the 2 rules that have `origin` → 260606T2055Z) + 1 outbound (`supersedes` → prior change-log).
- **File targets**:
  - `core/loop-introspect.js#buildInverseIndexes` (new function, ~40 lines)
  - `tools/loop-describe-tool.js` (cold tier field, ~10 lines)
  - `tools/meta-state-relationships-tool.js` (new, ~80 lines)
  - `tools/manifest.json` (register new tool)
  - `__tests__/meta-state-relationships.test.js` (5 test cases)

### Refactor #3 — backfill `mechanism_check` on resolved findings

- **File**: `tools/learning-loop-mcp/scripts/backfill-mechanism-check.mjs` (new, one-shot).
- **Logic**: scan all `entry_kind=finding` + `status=resolved` entries; if `evidence.code_ref` or `evidence_code_ref` is set and `mechanism_check` is missing, set `mechanism_check: true` and recompute `code_fingerprint` (SHA-256 of the referenced file).
- **Follow-up**: emit a `change-log` entry with `change_dimension=mechanical`, `change_target=meta-state.jsonl#mechanism_check-backfill`, `applies_to: { tools: ['meta_state_derive_status', 'meta_state_check_grounding'] }`.
- **Acceptance test**: `meta_state_query_drift({ filter: { status: 'active' } })` count rises from 0 to N (where N = number of newly drift-checkable resolved findings that have since drifted).
- **File targets**:
  - `tools/learning-loop-mcp/scripts/backfill-mechanism-check.mjs` (new, ~50 lines)
  - `meta-state.jsonl` (data edit, 10–16 entries)
  - `__tests__/backfill-mechanism-check.test.js` (idempotency + fingerprint computation test)

### Refactor #4 — `compact: true` flag on `meta_state_list`

- **File**: `tools/learning-loop-mcp/tools/meta-state-list-tool.js` — add `compact: z.boolean().optional().default(false)` to schema; in handler, project entries to `{ id, entry_kind, status, origin, addresses, consolidated_into, supersedes, promoted_to_rule, proposed_design_for }` when true.
- **Acceptance test**: `meta_state_list({ compact: true, include_expired: true })` returns 51 entries × ~80 bytes = ~4KB total. Verify relationship fields are populated for the entries that have them.
- **File targets**:
  - `tools/meta-state-list-tool.js` (schema + handler, ~15 lines diff)
  - `__tests__/meta-state-list-compact.test.js` (3 test cases: empty, partial, full registry)

### Refactor #5 — lazy-expand descriptions on cold tier

- **File**: `tools/learning-loop-mcp/core/loop-introspect.js` — add `summarize(entry)` function: returns `{ id, entry_kind, status, refs, description_preview: entry.description?.slice(0, 200) + (entry.description?.length > 200 ? '...' : '') }`.
- **File**: `tools/learning-loop-mcp/tools/loop-describe-tool.js` — add `description_mode: z.enum(['summary', 'full']).optional().default('summary')` to schema. Cold tier defaults to `summary`; warm/hot tiers default to `full`.
- **Acceptance test**: `loop_describe({ tier: 'cold' })` (no flag) returns descriptions truncated to 200 chars; `loop_describe({ tier: 'cold', description_mode: 'full' })` returns full descriptions. Token count of summary mode for 51 entries ≈ 8KB (vs 27KB full).
- **File targets**:
  - `core/loop-introspect.js#summarize` (new function, ~15 lines)
  - `tools/loop-describe-tool.js` (schema + cold tier branch, ~20 lines diff)
  - `__tests__/loop-describe-description-mode.test.js` (3 test cases: summary, full, mixed)

### Refactor #6 — `registry_summary.md` generator

- **File**: `tools/learning-loop-mcp/tools/meta-state-sweep-tool.js` — extend `meta_state_sweep` to optionally emit `docs/registry-summary.md` (path configurable, default `docs/registry-summary.md`).
- **File**: `tools/learning-loop-mcp/tools/loop-describe-tool.js` — add `registry_summary` field to warm tier (computed inline; not file I/O).
- **Format** of `docs/registry-summary.md`:
  - Header: "Auto-generated by meta_state_sweep on YYYY-MM-DD. Do not edit."
  - Section "Counts": table of kind × status.
  - Section "Coverage": mechanism_check coverage %; broken-ref count.
  - Section "Top references": 5 most-cited entry ids (by `addresses_inverse.size` + `supersedes_inverse.size` + `origin_inverse.size`).
- **Acceptance test**: `meta_state_sweep({ apply: false, emit_summary: true })` returns the markdown body; commit it to `docs/registry-summary.md`; verify it renders correctly.
- **File targets**:
  - `tools/meta-state-sweep-tool.js` (handler extension, ~40 lines)
  - `tools/loop-describe-tool.js` (warm tier field, ~15 lines)
  - `__tests__/meta-state-sweep-summary.test.js` (idempotency + format test)

## Implementation Considerations

### Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Breaking change to existing callers | low | All 6 refactors are opt-in (new flags/fields) or data-only (no API change). |
| Backfill script creates duplicate entries | medium | Use deterministic id generation in the script + idempotency guard (same pattern as `closeout-meta-evidence-migration.cjs` fix). |
| `registry_summary.md` drifts from registry | medium | Auto-generated; never edited; `meta_state_sweep` is the only writer. Add a `last_generated_at` field + drift check. |
| Cold tier token cost not actually reduced | low | Token measurement is mechanical: count chars in cold-tier response before/after #5. Acceptance test compares both. |
| New `meta_state_relationships` tool duplicates `meta_state_query_drift` | low | `meta_state_query_drift` returns aggregate drift; `meta_state_relationships` returns per-entry relationships. Different surface, different use case. |

### Trade-offs accepted

- **Compute at read time vs cache at write time (#2)**: chose compute. At 51 entries, O(N) per cold-tier read is ~1ms. Cache invalidation is not worth the complexity. Revisit at ~500 entries.
- **Schema change vs data change (#1)**: chose data. The 2 broken entries are the only outliers; rewriting them is cheaper than extending the schema.
- **Compact list vs full list (#4)**: chose opt-in flag. Default behavior unchanged. New callers opt in; existing callers see no diff.

### Trade-offs rejected

- **Bigger schema (new entry kind, new tool)**: violates rule-no-new-artifact-types + bloats the union. All 6 refactors reuse existing surface.
- **Rewrite `meta_state_promote_rule` for idempotency** (related to meta-260606T2106Z): out of scope for scan-readiness; belongs to a separate "registry-mutation idempotency" plan.
- **Cold-tier pagination** (per-page): rejected for v1; full cold tier at 15K tokens is well within budget. Revisit at ~1000 entries.

## Success Metrics

| Metric | Before | Target |
|---|---|---|
| Broken forward refs (any kind) | 4 | 0 |
| Findings with no incoming relationship | 25 of 29 (86%) | ≤10 of 29 (35%) |
| Mechanism_check coverage on resolved findings | 0 of 16 | ≥10 of 16 (62%) |
| Cold tier token cost (full descriptions) | ~27K | ~15K (45% reduction) |
| Cold tier token cost (summary mode) | n/a | ~8K (default after #5) |
| O(1) relationship lookup | not available | available via `meta_state_relationships` |
| Operator-visible summary artifact | not available | `docs/registry-summary.md` committed per sweep |
| Scan-readiness score (1–10) | 7 | 9 |

## Validation Plan

1. **Pre-#1 cold-tier regression test**: snapshot the current cold-tier JSON to a fixture file (`fixtures/cold-tier-pre-refactor.json`). Each refactor re-runs the cold tier and asserts the new response matches the new expected shape.
2. **Post-#1 acceptance**: `meta_state_relationships({ id: 'meta-260606T2055Z-...' })` returns expected inbound + outbound lists. `loop_describe({ tier: 'cold' })` shows 0 broken `proposed_design_for`.
3. **Post-#3 acceptance**: `meta_state_query_drift({ filter: { status: 'active' } })` returns ≥1 entry that the previous run missed.
4. **Post-#5 acceptance**: token count of `loop_describe({ tier: 'cold' })` is ≤ 16K; `loop_describe({ tier: 'cold', description_mode: 'full' })` is ≤ 28K (allow 1K drift from refactor noise).
5. **Post-#6 acceptance**: `docs/registry-summary.md` is generated, has the expected 3 sections, and the `last_generated_at` field updates on re-run.

## Next Steps

1. **Operator review** of this report. If approved, the 6 refactors become a follow-up plan (`/ck:plan` with TDD mode, per the inverse-index coverage gap).
2. **No plan in this session** (operator decision: end after brainstorm, matching the 2026-06-06 discoverability report pattern).
3. **Follow-up journal entry** (`/ck:journal`): record that scan-readiness is now a tracked property of the registry, not a one-shot audit.
4. **Linked active findings**: 4 reported findings (context-pollution, escape-hatch-abuse, tool-retry-loop, closeout-script-idempotency) will be referenced by the follow-up plan and may move to `active` once a plan exists.

## References

- `meta-state.jsonl` (51 entries, 4 kinds — the substrate)
- `tools/learning-loop-mcp/core/meta-state.js#metaStateEntrySchema` (the 4-kind union)
- `tools/learning-loop-mcp/core/loop-introspect.js` (target for inverse indexes + summarize)
- `tools/learning-loop-mcp/tools/loop-describe-tool.js` (target for cold-tier summary mode + registry_summary field)
- `tools/learning-loop-mcp/tools/meta-state-list-tool.js` (target for compact flag)
- `tools/learning-loop-mcp/tools/meta-state-sweep-tool.js` (target for registry_summary.md emit)
- `tools/learning-loop-mcp/tools/meta-state-check-grounding-tool.js` (existing drift surface to be backfilled)
- `tools/learning-loop-mcp/core/query-drift.js` (existing drift aggregate to benefit from #3 backfill)
- `tools/learning-loop-mcp/__tests__/` (target for 6 new test files)
- `docs/registry-summary.md` (new artifact from #6)
- Rule: `rule-no-new-artifact-types` (gate-enforced; all 6 refactors respect)
- Rule: `rule-short-slug-for-risk-records` (agent-enforced; unrelated to this report)
