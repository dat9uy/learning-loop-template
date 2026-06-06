---
title: "Meta-State Scan-Readiness: 6 Relationship-First Refactors"
description: "Closes the cold-state scan-readiness gaps surfaced in the 2026-06-06 cold-tier test: 2 broken loop-design proposed_design_for refs (4 broken forward refs total), 25 of 29 findings (86%) with no incoming relationship, only 3 of 51 entries (6%) carrying mechanism_check=true, zero resolved findings drift-checkable, no inverse indexes (addresses_inverse, supersedes_inverse), and the cold tier shipping full descriptions on terminal-status findings (~12K tokens of audit-trail double-charge). 6 refactors, all reusing existing kinds, tools, and surfaces. Zero new schema, zero new MCP tools, zero new artifact types (rule-no-new-artifact-types is active). Tests-first per phase (TDD). Surface: meta (loop's own machinery)."
status: pending
priority: P2
branch: "main"
tags: [meta, meta-state, scan-readiness, relationship, inverse-index, mechanism-check, drift, token-cost, registry-summary, tdd]
blockedBy: []
blocks: []
related:
  - meta-state.jsonl entry meta-260606T2055Z-tools-learning-loop-mcp-core-meta-state-js-metastateentrysch (the 4-kind union ship; Phase 0 verifies this surface is the substrate for refactors #1-#6)
  - meta-state.jsonl entry meta-260606T1830Z-context-pollution-stale-workaround-languag (Phase 3's inverse indexes (#2) reduce this kind of cold-tier scan pollution by giving agents O(1) lookup)
  - meta-state.jsonl entry meta-260606T2102Z-agent-used-direct-file-i-o-node-e-scripts- (idempotency in meta_state_log_change is the prerequisite for Phase 7's registry_summary.md sweeper in refactor #6)
  - meta-state.jsonl entry meta-260606T2106Z-agent-called-meta-state-log-change-mcp-too (same idempotency gap, second recurrence; affects the backfill script in Phase 5)
  - meta-state.jsonl entry meta-260606T2200Z-deferred-design-concrete-adoption-of-loop-design-instruction (Phase 0 logs this; Phase 1 closure depends on it)
  - meta-state.jsonl entry meta-260606T2202Z-top-level-array-and-boolean-parameters-in-mcp-tool-schemas-g (deferred; OUT OF SCOPE for this plan, per the ask verdict)
  - plans/reports/brainstorm-260606-meta-state-scan-readiness.md (the brainstorm this plan implements)
  - plans/260606-rule-loop-design-first-class/plan.md (sibling, completed; ships the 4-kind union this plan assumes)
  - plans/260606-discoverability-and-meta-evidence-migration/plan.md (sibling, completed; ships the discoverability_hints surface Phase 2 builds on)
  - plans/260603-sp3-drift/plan.md (sibling, completed; ships meta_state_query_drift + meta_state_check_grounding; Phase 5 reuses)
  - plans/reports/brainstorm-260606-discoverability-and-meta-evidence-migration.md (sibling report; sibling scope to this one)
  - tools/learning-loop-mcp/core/meta-state.js (Phase 1 data repair; Phase 5 backfill helper; reads the registry)
  - tools/learning-loop-mcp/core/loop-introspect.js (Phase 2 buildInverseIndexes + Phase 6 summarize functions)
  - tools/learning-loop-mcp/tools/loop-describe-tool.js (Phase 2 cold-tier field; Phase 6 description_mode; Phase 7 registry_summary field)
  - tools/learning-loop-mcp/tools/meta-state-list-tool.js (Phase 3 compact:true flag)
  - tools/learning-loop-mcp/tools/meta-state-sweep-tool.js (Phase 7 registry_summary.md emit)
  - tools/learning-loop-mcp/tools/manifest.json (Phase 4 new meta_state_relationships tool registration)
  - tools/learning-loop-mcp/scripts/fix-loop-design-refs.mjs (Phase 1, new, ~30 lines)
  - tools/learning-loop-mcp/scripts/backfill-mechanism-check.mjs (Phase 5, new, ~50 lines)
  - tools/learning-loop-mcp/tools/meta-state-relationships-tool.js (Phase 4, new, ~80 lines)
  - tools/learning-loop-mcp/__tests__/ (Phase 1-7 new test files; ~30-40 new tests)
  - docs/registry-summary.md (Phase 7, new artifact)
created: "2026-06-06T15:10:00Z"
createdBy: "ck:plan"
source: skill
---

# Meta-State Scan-Readiness: 6 Relationship-First Refactors

## Pre-Creation Check

- **Plan Context at session start:** operator opened the session with the 2026-06-06 cold-state test verdict (7/10 scan-readiness score; 6 refactor proposals). Operator approved the brainstorm report (`plans/reports/brainstorm-260606-meta-state-scan-readiness.md`) and asked for a TDD-structured plan to implement it.
- **Inbound state gate:** the gate fired with 4 stale `observation-vnstock-*` records flagged, but per `260606-discoverability-and-meta-evidence-migration` Out of Scope #4 they are domain state (vnstock vendor device-slot lifecycle), not actual stale. No mutation in this plan.
- **Cross-plan scan result:** no blocking dependencies. All sibling plans relevant to this work are `status: completed`:
  - `260606-rule-loop-design-first-class/` (completed): ships the 4-kind union (`finding | change-log | rule | loop-design`); this plan assumes the new kind is first-class and refactor #1 is the only outstanding data-integrity issue from that ship.
  - `260606-cold-session-test-rule-promotion/` (completed): ships `checkResolutionEvidence` for `meta_state_resolve`; the same consult pattern is reused for `meta_state_relationships` in Phase 4.
  - `260606-discoverability-and-meta-evidence-migration/` (completed): ships the `discoverability_hints` field; this plan's Phase 6 (`description_mode: 'summary' | 'full'`) is a sibling discoverability concern.
  - `260603-sp3-drift/` (completed): ships `meta_state_query_drift` + `meta_state_check_grounding`; Phase 5 backfills the `mechanism_check` field that those tools depend on.

## Overview

The 2026-06-06 cold-tier test (run via `loop_describe({ tier: 'cold' })` over the 51-entry meta-state registry) scored the registry **7/10 for scan-readiness**. The 6 refactors in this plan are relationship-first, data-only or surface-extension moves that close the gaps and lift the score to 9/10 while reducing cold-tier token cost by ~45% (27K → 15K tokens full / 8K tokens summary mode).

**The 6 refactors (in dependency order):**

| # | Refactor | Target | Effort | Phases |
|---|---|---|---|---|
| 1 | Fix 4 broken `proposed_design_for` refs on 2 loop-design entries | `meta-state.jsonl` (data) + `scripts/fix-loop-design-refs.mjs` (new) | 0.5h | Phase 1 |
| 2 | Add `compact: true` flag to `meta_state_list` (id+status+refs only; ~4KB total) | `tools/meta-state-list-tool.js` (15-line diff) | 0.5h | Phase 2 |
| 3 | Add `addresses_inverse` + `supersedes_inverse` + `meta_state_relationships` tool | `core/loop-introspect.js#buildInverseIndexes` (new) + `tools/meta-state-relationships-tool.js` (new) + `tools/manifest.json` | 3h | Phase 3, Phase 4 |
| 4 | Backfill `mechanism_check: true` on resolved findings with `evidence.code_ref` | `scripts/backfill-mechanism-check.mjs` (new) + `core/meta-state.js` (helper) | 1h | Phase 5 |
| 5 | Add `description_mode: 'summary' \| 'full'` to `loop_describe` cold tier (lazy descriptions) | `core/loop-introspect.js#summarize` (new) + `tools/loop-describe-tool.js` (schema + branch) | 1.5h | Phase 6 |
| 6 | Generate `docs/registry-summary.md` on sweep + surface `registry_summary` field on warm tier | `tools/meta-state-sweep-tool.js` (extension) + `tools/loop-describe-tool.js` (warm field) | 2h | Phase 7 |

**Total: ~8.5h, 30-40 new tests across 7 phases.**

**Outcome:**
- 0 broken forward refs (was 4).
- 25 orphan findings → ≤10 (35% orphan rate, was 86%).
- 0 resolved findings drift-checkable → ≥10 of 16 (62% coverage, was 0%).
- Cold tier token cost: 27K → 15K full, 8K summary (45% reduction).
- O(1) relationship lookup via `meta_state_relationships`.
- Operator-visible summary artifact (`docs/registry-summary.md`).
- Scan-readiness score: 7 → 9.

## Design (locked)

### Refactor #1: fix 4 broken `proposed_design_for` refs (data)

The 2 loop-design entries shipped in `260606-rule-loop-design-first-class` wrote `proposed_design_for` values that are code symbols, not entry ids:
- `loop-design-instruction-layer` → `['loop_get_instruction', 'loop_describe']`
- `loop-design-cross-reference-fields` → `['metaStateRuleEntrySchema', 'metaStateLoopDesignSchema']`

A one-shot migration script (`scripts/fix-loop-design-refs.mjs`) walks the 2 entries, attempts to resolve each value against the registry (entry id match → keep; rule id match → keep; code symbol with no match → strip + log to `fix_log` change-log entry). Idempotent: a second run produces no changes. Emits a `change-log` entry documenting the fix.

**Lock-in decisions:**
- (a) **Data fix, not schema fix.** The schema's intent (`proposed_design_for: string[]` of entry ids) is correct. The data drifted. A schema extension would bloat the union for a 2-entry case.
- (b) **No `local:` prefix.** The 4 broken values are bare strings (no `local:` prefix). The validator doesn't reject them; the loop-describe tool just doesn't traverse them. Fix is at the data layer, not the validator.
- (c) **Strip + log, not throw.** If a value can't be resolved to an entry id AND isn't a known code symbol, strip it and append a `fix_log` line. This is safer than throwing because the registry remains loadable.

### Refactor #2: `compact: true` flag on `meta_state_list` (surface)

The list tool returns full entries (~1.6KB each, 81KB total for 51 entries). A relationship-only scan needs only `id`, `entry_kind`, `status`, and ref fields (`origin`, `addresses`, `consolidated_into`, `supersedes`, `promoted_to_rule`, `proposed_design_for`). Add an opt-in `compact: boolean` flag that projects to this shape. ~4KB total for 51 entries.

**Lock-in decisions:**
- (a) **Opt-in flag, not default change.** Existing callers see no diff. New callers opt in.
- (b) **Strip `description` and `evidence` only.** Other fields stay (status, refs, dates, severity, affected_system). The compact shape is still a useful record — just a smaller one.
- (c) **No `description_summary` projection.** That's a Phase 6 concern (lazy descriptions). Compact is *all-or-nothing* on the entry's prose, not a summary.

### Refactor #3: inverse indexes (data surface)

`loop_describe` cold tier currently returns entries with their forward refs (`consolidated_into`, `supersedes`, `addresses`, `proposed_design_for`) but no inverse lookup. An agent asking "what does this finding address?" must full-scan the 27K-token cold tier.

Add `buildInverseIndexes(entries)` in `core/loop-introspect.js`. Pure function, O(N) over entries. Returns 4 maps:
- `addresses_inverse: Map<id, id[]>` — for each `loop-design.id`, the set of findings that address it
- `supersedes_inverse: Map<id, id[]>` — for each `change-log.id`, the set of entries it supersedes
- `origin_inverse: Map<id, id[]>` — for each `finding.id`, the set of rules that originated from it
- `promoted_to_rule_inverse: Map<id, id[]>` — for each `rule.id`, the set of findings it resolved

Cold tier response includes a new `inverse_indexes` field. The size of the cold tier goes up by ~1KB (4 maps of refs only) but the relationship information is now O(1) accessible.

**Lock-in decisions:**
- (a) **Compute at read time, not cache at write time.** O(N) scan at cold-tier-read is ~1ms for 51 entries. Cache invalidation is not worth the complexity. Revisit at ~500 entries.
- (b) **4 inverse maps, not 1 super-map.** Each map has a clear semantic; combining them into a single structure would force callers to filter by direction. 4 small maps are easier to traverse and document.
- (c) **Inverse maps expose ids only, not full entries.** A "what does this id point to?" lookup is the right grain. Cross-references between entries are 2-step: look up the inverse, then `meta_state_list({ entry_kind: X, status: Y })` for the targets.

### Refactor #4: `meta_state_relationships` MCP tool (tool surface)

The new inverse indexes enable a one-shot relationship tool. `meta_state_relationships({ id, direction: 'inbound' | 'outbound' | 'both' })` returns the relationship lists for a single entry, computed via the inverse indexes.

**Lock-in decisions:**
- (a) **Separate tool, not an extension of `meta_state_list`.** `meta_state_list` filters; `meta_state_relationships` resolves. Different shape, different use case.
- (b) **3 directions: inbound, outbound, both.** Inbound = inverse maps. Outbound = forward refs on the entry. Both = union. Default: `both`.
- (c) **No 2-hop traversal.** "What addresses this design, AND what do those findings address?" is a query composer concern, not a tool concern. Tools return 1-hop; agents compose.
- (d) **Reuse `checkResolutionEvidence` consult pattern.** Like the sibling `260606-cold-session-test-rule-promotion` plan uses for `meta_state_resolve`, this tool's gate can be extended later to require operator confirmation for sensitive relationships (e.g., "show me all addresses for this design" → may need operator ack). Out of scope for this plan; noted as follow-up.

### Refactor #5: mechanism_check backfill (data)

`meta_state_check_grounding` and `meta_state_derive_status` depend on `mechanism_check: true` to run. Today, 3 of 51 entries have it (all `reported`). Of the 16 resolved findings, 0 have it. The 10-16 resolved findings with `evidence.code_ref` set are *not* drift-checkable.

A one-shot migration script (`scripts/backfill-mechanism-check.mjs`) walks `entry_kind=finding` + `status=resolved` entries; for each, if `evidence.code_ref` or `evidence_code_ref` is set, set `mechanism_check: true` and recompute `code_fingerprint` (SHA-256 of the referenced file). Emits a `change-log` entry documenting the backfill.

**Lock-in decisions:**
- (a) **Backfill only, not require on resolve.** Auto-requiring `mechanism_check` on `meta_state_resolve` adds operator friction. The 16 resolved findings predate SP2 (the schema field was added later); backfill is the right answer for them, not retroactive gating.
- (b) **Recompute `code_fingerprint` at backfill time.** Some files may have drifted since the finding was reported. The recomputed fingerprint is the new "as of backfill" baseline. The drift check uses this baseline going forward.
- (c) **Skip findings without `evidence.code_ref`.** 5-6 of the 16 resolved findings have no code reference. They stay `mechanism_check: false`. Drift-check coverage at the end: 10-12 of 16 resolved findings (60-75%).

### Refactor #6: `description_mode` on cold tier (reader surface)

Cold tier currently returns full descriptions on every entry, including 16 resolved + 5 superseded + 3 expired findings (24 entries, ~12K tokens of audit-trail prose). The warm tier already filters terminal statuses; the cold tier doesn't.

Add `description_mode: 'summary' | 'full'` to `loop_describe` schema. Cold tier defaults to `summary`; warm/hot tiers default to `full`. Summary mode returns `{ id, entry_kind, status, refs, description_preview: entry.description?.slice(0, 200) + '...' }` (200 char preview). Full mode returns the entry as today.

**Lock-in decisions:**
- (a) **`summary` is the cold-tier default.** Audit reads don't need full prose; they need relationship + headline. Full mode is opt-in.
- (b) **200 char preview, not 50 or 500.** 50 is too short to read a meaningful summary; 500 doubles the cold-tier cost. 200 is the sweet spot (~8 chars saved per entry on average vs full).
- (c) **`summarize(entry)` is a pure function in `core/loop-introspect.js`.** Reusable for Phase 7's `registry_summary` field (which renders only the summary line, not the full description).

### Refactor #7: `docs/registry-summary.md` generator (sweep surface)

A sweeper function in `meta_state_sweep` emits `docs/registry-summary.md` on every resolve/log_change. Format:
- Header: "Auto-generated by meta_state_sweep on YYYY-MM-DD. Do not edit."
- Section "Counts": table of kind × status.
- Section "Coverage": mechanism_check coverage %; broken-ref count; orphan-finding count.
- Section "Top references": 5 most-cited entry ids (sum of inverse-index sizes).
- Section "Drift": most recent N (5?) active findings with `mechanism_check=true`, sorted by `created_at` desc.

The warm tier of `loop_describe` gets a new `registry_summary` field with the same content inline (no file I/O at warm tier).

**Lock-in decisions:**
- (a) **`registry_summary.md` is auto-generated, never edited.** If a human edits it, the next sweep overwrites. The header makes this explicit.
- (b) **`registry_summary` warm-tier field is computed inline, not read from disk.** Warm tier is fast; file I/O is not. The cost is duplicated compute (warm tier + sweep both compute), but the warm tier is a fraction of cold tier and the compute is O(N).
- (c) **Sweep is idempotent on the summary file.** Running sweep twice produces the same `docs/registry-summary.md` (modulo `last_generated_at` timestamp).
- (d) **The summary does NOT include descriptions.** It's a relationship-and-coverage surface. Descriptions are surface concerns of the loop, not the registry.

## Phases

| Phase | Name | Status | Effort |
|-------|------|--------|--------|
| 0 | Scaffolding: snapshot cold-tier fixture, write TDD harness, verify all 6 file targets exist | Pending | 0.5h |
| 1 | Refactor #1: fix 4 broken `proposed_design_for` refs (TDD) | Pending | 0.5h |
| 2 | Refactor #2: `compact: true` flag on `meta_state_list` (TDD) | Pending | 0.5h |
| 3 | Refactor #3: `buildInverseIndexes` + `inverse_indexes` cold-tier field (TDD) | Pending | 1.5h |
| 4 | Refactor #4: `meta_state_relationships` MCP tool (TDD) | Pending | 1.5h |
| 5 | Refactor #5: `mechanism_check` backfill on resolved findings (TDD) | Pending | 1h |
| 6 | Refactor #6: `description_mode` on cold tier + `summarize(entry)` pure function (TDD) | Pending | 1.5h |
| 7 | Refactor #7: `docs/registry-summary.md` generator + warm-tier `registry_summary` field (TDD) | Pending | 2h |

**Total: ~9h, 30-40 new tests across 8 new test files.**

## Locked Decisions

1. **All 6 refactors ship in this single plan.** Operator-approved scope (per the prior brainstorm approval). Splitting into 2 plans is rejected: the refactors share files (`core/loop-introspect.js`, `tools/loop-describe-tool.js`) and would create merge friction.
2. **Tests-first per phase (TDD).** Each phase writes a failing test, implements the minimum to pass, then runs the test suite for the touched surface. No "ship, then add tests" anti-pattern.
3. **Pure functions over side effects.** `buildInverseIndexes`, `summarize` are pure. The migration scripts (`fix-loop-design-refs.mjs`, `backfill-mechanism-check.mjs`) are idempotent + audit-logged.
4. **No new schema, no new tool beyond `meta_state_relationships`.** This plan adds exactly 1 new MCP tool (Phase 4) because the inverse-index surface is meaningless without an `id`-keyed query. All other refactors reuse existing tools.
5. **TDD structure: red → green → refactor → acceptance.** Each phase:
   - Step 1: write the failing test (red).
   - Step 2: write the minimum code to pass (green).
   - Step 3: refactor for clarity (still green).
   - Step 4: run the cold-tier regression test (acceptance).
6. **No new artifact types** (per `rule-no-new-artifact-types`). The 6 refactors touch 0 new schema fields. `description_mode` and `compact` are tool-level flags, not schema fields.
7. **Backfill is best-effort, not all-or-nothing.** The mechanism_check backfill handles 10-12 of 16 resolved findings (those with `evidence.code_ref`); the other 4-6 stay `mechanism_check: false` with a note in the change-log. Coverage: 60-75%, not 100%.
8. **Sweep summary file path is `docs/registry-summary.md`.** Not under `meta-state.jsonl` adjacent; the file is human-readable markdown, not registry data. The sweep is the only writer; humans never edit.
9. **Phase 0 is a fixture snapshot + harness, not a code change.** The fixture (`fixtures/cold-tier-pre-refactor.json`) is the regression baseline. The harness (`__tests__/cold-tier-regression.test.cjs`) compares current cold-tier output against the fixture.
10. **The wire-format bug (`meta-260606T2202Z-...`) is OUT OF SCOPE.** Per the /ck:ask verdict in the prior session, the wire format is a separate 1-2h plan. Bundling it would conflate concerns and slow both work items.

## Resolved Decisions (Pre-Plan)

- **Q1 (operator, scope):** "let's put all of these changes in the brainstorm report first" + "I agree with the changes" → all 6 refactors in one plan, single brainstorm report.
- **Q2 (operator, target):** "All in tools/learning-loop-mcp/tools/loop-describe-tool.js + core/meta-state.js (canonical)" → refactors #2-#7 follow this pattern; refactor #1 is data-only (no target file change).
- **Q3 (operator, handoff):** "End after brainstorm" → plan is a follow-up session, not in this one. (Now being created because the operator invoked `/ck:plan` after the brainstorm.)
- **Q4 (operator, prompt-clarity design):** "let's put that into meta-state for now" → Phase 0 logs the deferred design (`meta-260606T2200Z-...`) as a finding; the surface-split hint is a follow-up scope (a future plan adopting `loop-design-instruction-layer`).
- **Q5 (operator, wire-format timing):** "Do you think it worth fixing now before planning the brainstorm?" → no, defer. Verdict: wire format is a separate 1-2h plan, not bundled.

## Out of Scope (Captured as Follow-Ups)

- **Surface-split teaching hint** (`meta-260606T2200Z-...`): deferred until the parent `loop-design-instruction-layer` is adopted. A future plan adds the 7th hint to `DISCOVERABILITY_HINTS`.
- **Wire-format bug** (`meta-260606T2202Z-...`): separate 1-2h plan. MCP wrapper parameter parsing fix.
- **N:M rule → target mapping.** `applies_to_resolution: string | string[]` for rules that gate multiple findings. Not needed today.
- **Rule deprecation via `meta_state_resolve` on the target finding.** When a rule's target finding is resolved, the rule should auto-flip to `inactive`. A future plan adds the auto-deprecation logic.
- **Per-rule grounding drift detection.** SP2's `check_grounding` works on individual findings today; extending it to also fingerprint rule entries is a small follow-up.
- **Loop-design → plan auto-promotion.** Future `meta_state_promote_design_to_plan` tool.
- **2-hop relationship traversal.** "What addresses this design, AND what do those findings address?" is a query composer concern. Tools return 1-hop; agents compose.
- **Cache invalidation for inverse indexes.** At 51 entries, O(N) per read is ~1ms. Cache is a future optimization at ~500 entries.
- **Sweep summary diff against the previous run.** A "what changed since last sweep?" section in `docs/registry-summary.md`. Not needed today; future enhancement.

## Inbound State Acknowledgement

The 4 inbound-state-gate observations (`observation-vnstock-device-slot-ledger`, `observation-vnstock-import-reactivates-cleared-device`, `observation-vnstock-resource-budget`, `observation-vnstock-side-effect-import`) are **orthogonal** to this plan. They track the vnstock vendor's device-slot lifecycle (a `product/api` concern), not the meta-state machinery. No phase mutates them. The plan's scope is the `meta` surface.

## Success Criteria

- [ ] Phase 0: cold-tier fixture is captured at `tools/learning-loop-mcp/__tests__/fixtures/cold-tier-pre-refactor.json` (the regression baseline)
- [ ] Phase 0: harness `tools/learning-loop-mcp/__tests__/cold-tier-regression.test.cjs` is in place; `npm test` runs it; current cold-tier output matches the fixture
- [ ] Phase 0: 6 target files exist (verified via `ls -la`): `core/meta-state.js`, `core/loop-introspect.js`, `tools/loop-describe-tool.js`, `tools/meta-state-list-tool.js`, `tools/meta-state-sweep-tool.js`, `tools/manifest.json`
- [ ] Phase 1: `fix-loop-design-refs.mjs` runs idempotently (snapshot before/after diff is empty on second run)
- [ ] Phase 1: post-fix cold-tier shows 0 broken `proposed_design_for` refs (was 4)
- [ ] Phase 1: 2-3 tests in `__tests__/fix-loop-design-refs.test.js` (idempotency, resolution, strip+log paths)
- [ ] Phase 2: `meta_state_list({ compact: true, include_expired: true })` returns 51 entries × ~80 bytes = ~4KB total
- [ ] Phase 2: `meta_state_list({ compact: true })` (default exclude_expired) returns the 27 non-terminal entries
- [ ] Phase 2: 3 tests in `__tests__/meta-state-list-compact.test.js` (empty registry, partial, full registry)
- [ ] Phase 3: `buildInverseIndexes(entries)` returns 4 maps; verified counts match expected (`origin_inverse` for `meta-260601T1353Z-sanitizeslug-...` = 1 = the rule `rule-short-slug-for-risk-records`)
- [ ] Phase 3: cold tier response includes `inverse_indexes` field with the 4 maps
- [ ] Phase 3: 3-4 tests in `__tests__/build-inverse-indexes.test.js` (empty, single-edge, multi-edge, orphan coverage)
- [ ] Phase 4: `meta_state_relationships` tool is registered in `tools/manifest.json` and `tools/server.js`
- [ ] Phase 4: tool returns expected inbound + outbound + both for a sample entry (e.g., `meta-260606T2055Z-...`)
- [ ] Phase 4: 3-4 tests in `__tests__/meta-state-relationships.test.js` (3 directions × 1 sample entry + edge case for missing entry)
- [ ] Phase 5: `backfill-mechanism-check.mjs` runs idempotently
- [ ] Phase 5: post-backfill: ≥10 of 16 resolved findings have `mechanism_check=true`
- [ ] Phase 5: `meta_state_query_drift` count rises (some resolved findings now report drift between report-time code and current code)
- [ ] Phase 5: 3-4 tests in `__tests__/backfill-mechanism-check.test.js` (idempotency, fingerprint recomputation, skip-no-evidence)
- [ ] Phase 6: `loop_describe({ tier: 'cold' })` (no flag) returns descriptions truncated to 200 chars
- [ ] Phase 6: `loop_describe({ tier: 'cold', description_mode: 'full' })` returns full descriptions
- [ ] Phase 6: cold-tier token count in summary mode ≤ 16K (down from 27K)
- [ ] Phase 6: 3 tests in `__tests__/loop-describe-description-mode.test.js` (summary, full, mixed)
- [ ] Phase 7: `docs/registry-summary.md` is generated with 4 sections (Counts, Coverage, Top references, Drift)
- [ ] Phase 7: `last_generated_at` field updates on re-run
- [ ] Phase 7: `loop_describe({ tier: 'warm' })` returns `registry_summary` field with the same content inline
- [ ] Phase 7: 3-4 tests in `__tests__/meta-state-sweep-summary.test.js` (idempotency, format, drift section)
- [ ] **Final regression:** the post-Phase-7 cold-tier output (summary mode) is ~8K tokens (down from 27K); the fixture test in Phase 0 is updated to the new baseline; `npm test` passes
- [ ] **No new schema:** `core/meta-state.js` schema exports are unchanged (no new fields, no new branch schemas)
- [ ] **No new artifact types:** `rule-no-new-artifact-types` still passes; the plan only adds 1 MCP tool (`meta_state_relationships`)
- [ ] **No regression on existing tests:** all existing tests still pass after the migration (the 580+ baseline from the sibling plans + 30-40 new from this plan)

## Validation Log

### Session 1 — 2026-06-06 (brainstorm → plan)

**Trigger:** operator approved the brainstorm report (`plans/reports/brainstorm-260606-meta-state-scan-readiness.md`) and invoked `/ck:plan --tdd` to plan the 6 refactors.

**Techniques applied:**
- **TDD structure per phase.** Each phase writes a failing test, implements the minimum, runs the test, then accepts.
- **Dependency ordering.** Phases ordered so each one builds on the previous (data fix → compact list → inverse indexes → relationships tool → mechanism_check backfill → description mode → registry summary).
- **Regression harness up front.** Phase 0 captures a cold-tier fixture before any code changes, so each phase can diff against the pre-refactor state.

**Questions answered (5 total):**
1. **[Scope]** All 6 in one report, or split? → All 6 in one (operator choice).
2. **[Target]** Where do inverse indexes live? → `core/loop-introspect.js` + `tools/loop-describe-tool.js` (canonical, follows existing pattern).
3. **[Handoff]** End after brainstorm, or `/ck:plan`? → End after brainstorm (operator choice). Then operator invoked `/ck:plan` separately.
4. **[Prompt-clarity design]** Where to log the surface-split teaching hint? → In meta-state as a deferred design (`meta-260606T2200Z-...`).
5. **[Wire-format timing]** Fix now, or defer? → Defer. Wire format is a separate 1-2h plan, not bundled.

**Decisions locked:** see "Locked Decisions" section above.

**Action items:**
- [x] Scaffold the plan (this file) with 7 phases (Phase 0 scaffolding + 6 refactor phases)
- [x] Map the 6 refactors to dependency-ordered phases
- [x] Define success criteria per phase (test counts, fixture comparisons, schema/registry diffs)
- [x] Cross-reference all related meta-state entries + sibling plans + target files

**Impact on phases:**
- Phase 0: regression baseline (fixture + harness + file targets verified)
- Phase 1: data fix only (4 broken refs → 0)
- Phase 2-7: code surface additions in `core/loop-introspect.js`, `tools/loop-describe-tool.js`, `tools/meta-state-list-tool.js`, `tools/meta-state-sweep-tool.js`, plus 1 new tool (`meta_state_relationships`)

## References

- `docs/philosophy.md` — meta-state as the loop's own audit log (Pillar 3)
- `docs/observation-vs-meta-state.md` — domain/meta/gate layer separation
- `plans/reports/brainstorm-260606-meta-state-scan-readiness.md` — the brainstorm this plan implements
- `plans/260606-rule-loop-design-first-class/plan.md` — sibling, completed; ships the 4-kind union
- `plans/260606-discoverability-and-meta-evidence-migration/plan.md` — sibling, completed; ships discoverability_hints
- `plans/260603-sp3-drift/plan.md` — sibling, completed; ships meta_state_query_drift
- `tools/learning-loop-mcp/core/meta-state.js` — registry I/O + schema (untouched by this plan)
- `tools/learning-loop-mcp/core/loop-introspect.js` — Phase 2 + Phase 6 additions
- `tools/learning-loop-mcp/tools/loop-describe-tool.js` — Phase 2 + Phase 6 + Phase 7 changes
- `tools/learning-loop-mcp/tools/meta-state-list-tool.js` — Phase 3 addition
- `tools/learning-loop-mcp/tools/meta-state-sweep-tool.js` — Phase 7 extension
- `tools/learning-loop-mcp/scripts/fix-loop-design-refs.mjs` — Phase 1, new
- `tools/learning-loop-mcp/scripts/backfill-mechanism-check.mjs` — Phase 5, new
- `tools/learning-loop-mcp/tools/meta-state-relationships-tool.js` — Phase 4, new
- `tools/learning-loop-mcp/__tests__/` — 8 new test files (1 harness + 6 refactor tests + 1 sweep test)
- `docs/registry-summary.md` — Phase 7, new artifact
- `meta-state.jsonl` — 51 entries at session start; Phase 1 mutates 2; Phase 5 mutates 10-16
- Rule: `rule-no-new-artifact-types` (gate-enforced; all 6 refactors respect — 0 new schema)
- Rule: `rule-short-slug-for-risk-records` (agent-enforced; unrelated to this plan)
- Rule: `rule-project-skill-boundary` (gate-enforced; unrelated to this plan)
- Rule: `rule-cold-session-test-must-pass-before-resolution` (gate-enforced; applies to `meta-260606T0443Z-...`, unrelated to this plan's scope)
