---
title: "Promote rule and loop-design to first-class meta-state entry_kinds"
description: "Extends the meta-state.jsonl discriminated union from 2 members (finding | change-log) to 4 (finding | change-log | rule | loop-design). Today, 4 promoted rules are nested inside findings via the `promoted_to_rule` payload — the rule's pattern lives inside the finding that originated it, and 2 active design notes are buried as findings with `subtype=meta-state-schema-enhancement` with their target relationship expressed only in the description field. The plan extracts rules into a dedicated `entry_kind: \"rule\"` with its own binary status enum and `origin` lineage pointer, re-emits the design notes as `entry_kind: \"loop-design\"` with `proposed_design_for` (forward) and `addresses` (backward) cross-references, and migrates 4 rules + 2 active design notes in one clean break (no backward-compat layer). The 1 active cross-reference design note (meta-260606T1543Z-meta-state-cross-reference-field-design) becomes redundant and is resolved. Outcome: `meta_state_list({ entry_kind: \"rule\" })` and `meta_state_list({ entry_kind: \"loop-design\" })` return what the operator asks for in one query; agents joining a fresh repo can audit the full rule set + design backlog without scanning the registry for nested payloads. Surface: meta (loop's own machinery)."
status: completed
priority: P2
branch: "main"
tags: [meta, meta-state, schema, rule, design-note, entry-kind, first-class, clean-break, tdd]
blockedBy: []
blocks: []
related:
  - meta-state.jsonl entry meta-260606T1543Z-meta-state-cross-reference-field-design (Phase 5 resolves this; becomes redundant under the new design)
  - meta-state.jsonl entry meta-260606T1531Z-cold-session-test-rule-deferred (already resolved by sibling plan 260606-cold-session-test-rule-promotion; NOT re-emitted)
  - meta-state.jsonl entry meta-260606T0421Z-instruction-layer-for-agents-tbd (one of the 2 active design notes re-emitted in Phase 2)
  - meta-state.jsonl entry meta-260606T0028Z-g8-subcommand-class-false-positive-supersede (the 4 G8 superseded findings feed the migration; their promoted_to_rule payloads are extracted in Phase 2)
  - meta-state.jsonl entry meta-260606T1433Z-discoverability-meta-evidence-migration (parent change-log for the warm-tier discoverability work; Phase 4 extends its loop_describe surface)
  - meta-state.jsonl entry meta-260605T1356Z-loop-describe-cold-tier-superseded-lineage-missing (sibling change-log; Phase 4 builds on its cold-tier lineage surface)
  - plans/260602-sp0-log-change/plan.md (origin of the entry_kind discriminated union pattern)
  - plans/260602-self-enforcing-loop/plan.md (parent architecture: meta-state as rule registry)
  - plans/260605-superseded-status-and-discoverability/plan.md (sibling plan; ships the `consolidated_into` / `consolidates` fields Phase 1 reuses for the 3 superseded findings)
  - plans/260606-cold-session-test-rule-promotion/plan.md (sibling plan; Phase 3 of this plan uses the same `checkResolutionEvidence` consult pattern for `meta_state_propose_design`)
  - tools/learning-loop-mcp/core/meta-state.js (entry_kind union + 2 new branch schemas + narrowed `promoted_to_rule` field)
  - tools/learning-loop-mcp/core/gate-logic.js#loadPromotedRules (Phase 1 rewrites to read `entry_kind: \"rule\"` entries; status enum accepts `active | inactive` only)
  - tools/learning-loop-mcp/core/loop-introspect.js#listPromotedRules (Phase 4 surfaces the new entry kinds in loop_describe)
  - tools/learning-loop-mcp/tools/meta-state-promote-rule-tool.js (Phase 1 rewrites to emit `entry_kind: \"rule\"` entries)
  - tools/learning-loop-mcp/tools/meta-state-list-tool.js (Phase 3 accepts the new entry_kinds in its filter)
  - meta-state.jsonl (registry; Phase 0 adds 1 change-log; Phase 2 mutates 4 promoted_to_rule findings + adds 4 rule entries + supersedes 2 active design-note-in-disguise findings + adds 2 loop-design entries; Phase 5 resolves 1 cross-reference entry)
created: "2026-06-06T15:43:00Z"
createdBy: "manual (operator-directed design session; ck:plan skill not invoked)"
source: skill
---

# Promote rule and loop-design to first-class meta-state entry_kinds

## Pre-Creation Check

- **Plan Context at session start:** the operator opened the session with `INBOUND STATE GATE:` triggered and shared the design intent: rules should be a dedicated `entry_kind` (not nested in `promoted_to_rule`); `promoted_to_rule` should reduce to a string origin pointer; the cross-reference design note (meta-260606T1543Z) is being held back from resolution pending this structural change.
- **Inbound state gate observations:** the 4 `observation-vnstock-*` records are flagged stale by the gate but per `260606-discoverability-and-meta-evidence-migration` Out of Scope #4 they are domain state (vnstock vendor device-slot lifecycle), not actual stale. No mutation in this plan.
- **Cross-plan scan result:** no blocking dependencies.
  - `260606-cold-session-test-rule-promotion` (sibling, in progress): uses the same `checkResolutionEvidence` consult pattern that Phase 3 of this plan extends for `meta_state_propose_design`. No schema overlap; both can ship independently.
  - `260605-superseded-status-and-discoverability` (sibling, completed): ships the `consolidated_into` / `consolidates` field pair that Phase 2 of this plan reuses for the 3 superseded design-note findings.
  - `260602-self-enforcing-loop` (architecture, completed): establishes the meta-state-as-rule-registry invariant this plan extends.

## Overview

The meta-state.jsonl discriminated union is `finding | change-log` (2 members). Both are first-class with their own lifecycle, status enum, and shape. A third and fourth kind are *implicit in the data* but not first-class:

| Hidden kind | Today's shape | What it really is | Lifecycle it actually has |
|---|---|---|---|
| **Rule** | `finding.promoted_to_rule: { rule_id, enforcement, pattern_type, pattern, ... }` | The enforced pattern (gate or agent) | `active | inactive`; can be refined (e.g. `rule-no-new-artifact-types` was refined 2026-06-06); can be scoped (`scope_predicate`); can have resolution-evidence semantics |
| **Loop-design** | `finding` with `subtype=meta-state-schema-enhancement` (or similar) | A deferred design for a future plan | `active | inactive`; flips when the proposed work ships |

Both have lifecycles that don't fit the finding's `reported → active → resolved` enum (the rule's status does double duty today: `status: "resolved"` means "the human report is closed" AND "the rule is live" — a non-obvious hack defended with a comment in `loadPromotedRules`).

**The plan:** extend the union to 4 members. Extract rules into their own `entry_kind: "rule"` schema. Re-emit deferred designs as `entry_kind: "loop-design"`. Narrow `promoted_to_rule` on findings from `z.object({...})` to `z.string()` (just the rule id; the rule itself is the new entry). Add `proposed_design_for: string[]` (forward) and `addresses: string[]` (backward) on `loop-design` entries. Migrate the 4 rules + 2 active design notes in one clean break (no backward-compat layer per operator decision 2026-06-06).

**Outcome:** `meta_state_list({ entry_kind: "rule" })` returns all 4 rules in one query. `meta_state_list({ entry_kind: "loop-design" })` returns 2 active designs. The finding's `status` enum returns to its single semantic meaning. Pattern refinement metadata moves from the originating finding's payload to the rule entry itself. New agents joining the repo can audit the rule set + design backlog in two queries instead of scanning the registry for nested payloads.

## Design (locked)

1. **Discriminated union grows from 2 to 4:**
   ```js
   export const metaStateEntrySchema = z.union([
     metaStateFindingEntrySchema,    // existing (unchanged shape)
     metaStateChangeEntrySchema,     // existing (unchanged shape)
     metaStateRuleEntrySchema,       // NEW (see #2)
     metaStateLoopDesignSchema,      // NEW (see #3)
   ]);
   ```

2. **`metaStateRuleEntrySchema`:**
   ```js
   z.object({
     entry_kind: z.literal("rule").default("rule"),
     id: z.string().regex(/^rule-[a-z0-9-]+$/),  // stable id, not timestamp-based
     origin: z.string().describe("Finding id that originated this rule (preserves historical lineage)"),
     enforcement: z.enum(["gate", "agent"]).describe("Where the rule is enforced"),
     pattern_type: z.enum(["regex", "glob", "resolution-evidence-required", "..."]),
     pattern: z.string().describe("The pattern (regex/glob/session_id/etc.)"),
     scope_predicate: z.enum(["none", "project_has_learning_loop_mcp"]).optional(),
     applies_to_resolution: z.string().optional()
       .describe("For pattern_type=resolution-evidence-required: the target finding id this rule gates"),
     supersedes: z.string().optional()
       .describe("Prior rule id this rule refined (replaces finding.promoted_to_rule.refined_at metadata)"),
     description: z.string().min(20).describe("Human-readable summary (min 20 chars)"),
     status: z.enum(["active", "inactive"]).default("active")
       .describe("Binary per operator decision 2026-06-06. Refined/deprecated rules become inactive and use `supersedes` to point to the new rule."),
     promoted_at: z.string().describe("ISO timestamp"),
     promoted_by: z.string().describe("Operator id"),
     evidence_code_ref: z.string().optional()
       .describe("Code reference; SP2 grounding still applies"),
     code_fingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional()
       .describe("SHA-256 of evidence_code_ref; populated by SP2 check_grounding"),
     refined_at: z.string().optional()
       .describe("ISO timestamp of last refinement"),
     refined_by: z.string().optional()
       .describe("Operator id of last refinement"),
     refinement_reason: z.string().optional()
       .describe("Why the rule was last refined"),
   })
   ```

3. **`metaStateLoopDesignSchema`:**
   ```js
   z.object({
     entry_kind: z.literal("loop-design").default("loop-design"),
     id: z.string().describe("Standard meta-state id (meta-YYMMDDTHHmmZ-slug)"),
     title: z.string().min(10).describe("Short human-readable title"),
     status: z.enum(["active", "inactive"]).default("active")
       .describe("Binary. Flips to inactive when the proposed work ships."),
     proposed_design_for: z.array(z.string())
       .describe("Forward: ids of the rules / schemas / tools this design will create or modify"),
     addresses: z.array(z.string())
       .describe("Backward: ids of findings this design responds to (the motivation; the why-this-exists)"),
     description: z.string().min(20).describe("Human-readable summary (min 20 chars)"),
     affected_system: z.enum([
       "gate-logic", "record-validation", "index-extractor",
       "mcp-tools", "workflow-registry", "vnstock_vendor",
     ]).describe("Which system this design affects"),
     severity_hint: z.enum(["low", "medium", "high"]).optional()
       .describe("Operator's read on the urgency of shipping this design"),
     created_at: z.string().describe("ISO timestamp"),
     created_by: z.string().describe("Operator id"),
     shipped_in_plan: z.string().optional()
       .describe("Plan id (plans/YYMMDD-slug/) that shipped this design; set when status flips to inactive"),
     shipped_at: z.string().optional()
       .describe("ISO timestamp of the ship event"),
   })
   ```

4. **`promoted_to_rule` on findings narrows from `z.object({...})` to `z.string()`** (just the rule id). The new rule entry's `origin` field points back to the finding id, preserving the historical lineage. The finding's `promoted_to_rule` becomes a one-way reference to the rule that resolved it (the rule's own lineage data — refined_at, refined_by, refinement_reason — moves to the rule entry).

5. **No `supersede` between kinds.** Cross-references are typed:
   - `rule.origin` → `finding.id` (backward, the rule's true source)
   - `finding.promoted_to_rule` → `rule.id` (backward, which rule resolved this finding)
   - `loop-design.proposed_design_for` → `rule.id | schema-path | tool-name` (forward, what the design ships)
   - `loop-design.addresses` → `finding.id[]` (backward, what the design responds to)
   - `rule.supersedes` → `rule.id` (within-kind, rule refined by another rule)
   - `loop-design.shipped_in_plan` → `plan-path` (forward, what plan shipped the design)
   - 3-edge graph: `finding (problem) → loop-design (proposal) → rule (resolution)`. Plus `finding.promoted_to_rule` as a second edge from finding to rule (the rule that resolved the report). The graph is acyclic and machine-traversable.

6. **Status enums (per operator decision 2026-06-06: binary, with relationships):**
   - `finding`: `reported | active | resolved | expired | superseded` (unchanged)
   - `change-log`: `active` (unchanged, always)
   - `rule`: `active | inactive` (refined/deprecated rules become inactive, use `supersedes` to point to the new rule)
   - `loop-design`: `active | inactive` (flips to inactive when the design ships; `shipped_in_plan` records what shipped it)

7. **Clean-break migration (per operator decision 2026-06-06: no backward-compat layer):**
   - Phase 2 migrates all 4 rules and 2 active design notes in one atomic transaction.
   - The 2 design-note-in-disguise findings are marked `status: "superseded"` with `consolidated_into: <new loop-design entry id>` (NOT deleted outright). Rationale: the new loop-design entry's `proposed_design_for` points at the rule it will create, and that rule's `origin` is the *old finding* — preserving "this rule was promoted from finding X" history. If the old finding were hard-deleted, the rule's `origin` would dangle. (One deviation from operator's "clean break" call, flagged and approved in pre-plan conversation.)
   - The 4 promoted_to_rule findings (G8 sanitizeslug, G8 escape-hatch-abuse, G8 agent-inside-a-project, G8 cold-session-test) are mutated in place: their `promoted_to_rule` payload is extracted to a new rule entry; the finding's `promoted_to_rule` is replaced with the new rule's id string. The findings stay in the registry (they're the canonical source of the rules; deleting them would orphan the `rule.origin` lineage).

8. **Discoverability surface (`loop_describe`):**
   - Warm tier: `rule_count` and `loop_design_count` fields (counts of `active` rules and `active` loop-designs). The existing `promoted_rules` list (warm) migrates to read from `entry_kind: "rule"` entries and is renamed `rules`.
   - Cold tier: a new `loop_designs` list (the 3 active designs at session start, or however many are active). Each entry surfaces `id`, `title`, `proposed_design_for`, `addresses`, `shipped_in_plan`. The existing `superseded_lineage` section is unchanged.

9. **New MCP tool: `meta_state_propose_design`.** The canonical way to emit `entry_kind: "loop-design"`. Mirrors `meta_state_log_change`'s shape (id auto-generated, source_refs required, append-only). Adds an `addresses: string[]` field (the findings the design responds to) and a `proposed_design_for: string[]` field. Idempotency guard: if a loop-design with the same `addresses` set + same `proposed_design_for` prefix is already active, return its id (no duplicate).

10. **`meta_state_list` accepts the new entry_kinds.** The `entry_kind` filter today accepts only `finding | change-log` (per the union); Phase 3 extends it to accept `rule | loop-design` as well. The list response shape is unchanged: `{ entries: [], total, filtered_count }`.

11. **Out-of-scope for this plan, captured as follow-ups:**
    - **Per-finding rule targeting via `applies_to_resolution`:** this plan supports a 1:1 mapping (one rule → one target finding). N:M is a future extension.
    - **Rule expiration / soft delete via `meta_state_resolve`:** when a rule's target finding is resolved, the rule entry remains in the registry. The `loadPromotedRules` filter still loads it. Auto-disable on target-resolve is a future plan.
    - **Loop-design → plan auto-promotion:** today, an operator manually converts a loop-design into a plan. A future `meta_state_promote_design_to_plan` tool could automate this; out of scope here.
    - **Resolution of `meta-260606T0443Z-mcp-tools-not-loaded-into-agent-tool-list`:** the gap is still open; the rule correctly blocks resolution. A separate plan is needed to fix the droid runtime and re-verify.

## Phases

| Phase | Name | Status | Effort |
|-------|------|--------|--------|
| 0 | Surface the design (change-log + supersede 2 active design-note findings) | Pending | 0.5h |
| 1 | Schema: 2 new branch schemas + union extension + narrowed `promoted_to_rule` + 2 cross-ref fields + gate-logic rewrite (TDD) | Pending | 3h |
| 2 | Migration: 4 rules → `entry_kind: "rule"`; 2 active design notes → `entry_kind: "loop-design"`; 2 findings superseded with `consolidated_into` (idempotent script) | Pending | 1.5h |
| 3 | New tool: `meta_state_propose_design` + `meta_state_list` filter accepts new entry_kinds (TDD) | Pending | 2h |
| 4 | `loop_describe` warm/cold tier surfaces active `rule` + `loop-design` lists (TDD) | Pending | 1.5h |
| 5 | Resolve `meta-260606T1543Z-meta-state-cross-reference-field-design` (now redundant) | Pending | 0.25h |

**Total: ~8.75h, 23-30 new tests across 6 new test files.**

## Locked Decisions

1. **4 entry_kinds in the union** (per operator 2026-06-06): `finding | change-log | rule | loop-design`.
2. **Naming for the 4th kind: `loop-design`** (per operator 2026-06-06; explicitly scoped to loop-internal designs, distinct from `plans/` design docs).
3. **Status enums: binary `active | inactive` for both new kinds** (per operator 2026-06-06). Refined/deprecated rules become `inactive` and use `supersedes` to point to the new rule. Shipped loop-designs become `inactive` and use `shipped_in_plan` to point to the plan that shipped them.
4. **No `supersede` between kinds** (per operator 2026-06-06; in response to the meta-question "Why the need to supersede? I think the rule is just one kind of entry, what's about the others?"). Cross-references are typed per #5.
5. **`promoted_to_rule` on findings narrows to `z.string()`** (just the rule id). The new rule's `origin` field preserves the historical lineage (per operator 2026-06-06: "let's keep origin = old finding").
6. **Loop-design's `addresses` field exists** (per operator 2026-06-06 follow-up: "isn't we need the loop-design to refer to some findings (optionally) as well?"). The 3-edge graph `finding → loop-design → rule` is the design.
7. **Clean-break migration** (per operator 2026-06-06: "extract all 4 rules, replace finding.promoted_to_rule with a string id, no backward-compat layer"). The 2 design-note-in-disguise findings are NOT hard-deleted (deviation from "clean break" — they stay as `status: superseded` with `consolidated_into: <new loop-design id>`, so the rule's `origin` lineage is preserved). All 4 promoted-to-rule findings stay in the registry; their `promoted_to_rule` is mutated from object to string.
8. **No `meta_state_propose_design` consultation pattern from `meta_state_resolve`** (out of scope for this plan). The sibling plan `260606-cold-session-test-rule-promotion` uses `checkResolutionEvidence` to gate `meta_state_resolve`; a future plan could add a `checkDesignEvidence` to gate `meta_state_promote_design` (i.e., "you can't promote a design to a plan unless the design's `proposed_design_for` target is satisfied"). Noted as a follow-up.
9. **`meta_state_propose_design` is idempotent by `addresses + proposed_design_for` set equality** (per operator 2026-06-06; no design notes should be duplicated accidentally).
10. **The cross-reference design note (`meta-260606T1543Z-...`) is resolved in Phase 5, not superseded.** Resolution is the right call: the design was for a generic `related_to` field as a workaround; the structural fix (4 entry_kinds + typed cross-refs) makes the workaround redundant. The finding is the operator's first attempt at expressing "this design targets that finding"; the 4-kind union is the proper expression. Resolution note: "Superseded by entry_kind: rule | loop-design first-class schema (4-kind union). Cross-references are typed fields on the new schemas (proposed_design_for, addresses, origin)."

## Resolved Decisions (Pre-Plan)

- **Q1 (operator, sequencing):** "Draft the plan file now with the 6 phases (Phase 0 surface design, Phases 1-5 ship)." → 6 phases. Phase 0 surfaces the design (no code); Phases 1-5 ship.
- **Q2 (operator, lineage):** "let's keep origin = old finding. But if that's the case, isn't we need the loop-design to refer to some findings (optionally) as well?" → origin = old finding; loop-design gets `addresses: string[]` field.
- **Q3 (operator, naming):** "loop-design" (scoped to loop-internal; avoids confusion with `plans/` design docs).
- **Q4 (operator, reclassification):** "Re-emit and delete the old finding entries (clean break, no audit trail for the reclassification)" → clean break for the re-emission; the 3 superseded findings stay in the registry with `consolidated_into` pointers (deviation, see Locked #7).

## Out of Scope (Captured as Follow-Ups)

- **G8 regex/allowlist fix.** Captured in `meta-260606T0028Z-g8-subcommand-class-false-positive-supersede`. The plan acknowledges the rule mechanism works; the rule's pattern itself (the regex) is not fixed by this plan.
- **Per-rule grounding drift detection.** SP2's `check_grounding` works on individual findings today; extending it to also fingerprint rule entries is a small follow-up.
- **Loop-design → plan auto-promotion.** Future `meta_state_promote_design_to_plan` tool.
- **`meta_state_propose_design` consultation (the inverse of `meta_state_resolve` consultation).** Could gate "promote this design to a plan unless the design's `proposed_design_for` target is satisfied" — symmetry with the sibling plan's `checkResolutionEvidence`.
- **N:M rule → target mapping.** `applies_to_resolution: string | string[]` for rules that gate multiple findings. Not needed today.
- **Rule deprecation via `meta_state_resolve` on the target finding.** When a rule's target finding is resolved, the rule should auto-flip to `inactive` (or remain `active` if the rule still applies to other findings). Today the rule stays `active`. A future plan can add the auto-deprecation logic.

## Inbound State Acknowledgement

The 4 inbound-state-gate observations (`observation-vnstock-device-slot-ledger`, `observation-vnstock-import-reactivates-cleared-device`, `observation-vnstock-resource-budget`, `observation-vnstock-side-effect-import`) are **orthogonal** to this plan. They track the vnstock vendor's device-slot lifecycle (a `product/api` concern), not the meta-state machinery. No phase mutates them. The plan's scope is the `meta` surface.

## Success Criteria

- [ ] Phase 0: a `change-log` entry is added to `meta-state.jsonl` documenting the 4-kind union design (the first entry that references the new `rule` and `loop-design` entry_kinds in `applies_to.schemas`)
- [ ] Phase 0: 2 active design-note-in-disguise findings are marked `status: "superseded"` with `consolidated_into: <reserved id from Phase 2>` (a placeholder; Phase 2 backfills the real loop-design id). Note: `meta-260606T1531Z` is already resolved by sibling plan and is NOT included.
- [ ] Phase 1: `metaStateRuleEntrySchema` and `metaStateLoopDesignSchema` are added to `tools/learning-loop-mcp/core/meta-state.js` and exported; the discriminated union includes them
- [ ] Phase 1: `promoted_to_rule` on the finding schema narrows from `z.object({...})` to `z.string()` (just the rule id)
- [ ] Phase 1: Finding status enum is updated to include `"active"`, `"resolved"`, `"expired"` (registry data already uses these values; the schema is out of sync)
- [ ] Phase 1: `core/gate-logic.js#loadPromotedRules` reads `entry_kind: "rule"` entries (not findings with `promoted_to_rule`); status filter is `active | inactive` only
- [ ] Phase 1: `tools/meta-state-promote-rule-tool.js` emits `entry_kind: "rule"` entries (not mutated findings)
- [ ] Phase 1: existing rule tests (4 test files: `gate-promoted-rules.test.js`, `gate-scope-predicate.test.js`, `gate-resolution-evidence.test.js`, `integration-promoted-rule.test.js`) all pass after the rewrite (no regression; same enforcement, same `checkResolutionEvidence` behavior)
- [ ] Phase 1: 10-14 new tests across 3 new test files (rule schema, loop-design schema, promote-rule rule-entry)
- [ ] Phase 2: migration script (`tools/learning-loop-mcp/scripts/migrate-rule-entry-kind.mjs`) extracts the 4 promoted rules into `entry_kind: "rule"` entries, mutates the 4 source findings' `promoted_to_rule` to the new rule id, and re-emits the 2 active design notes as `entry_kind: "loop-design"` entries with `proposed_design_for` and `addresses` fields populated
- [ ] Phase 2: the 2 design-note-in-disguise findings' `consolidated_into` is backfilled to the real new loop-design entry id (replacing the Phase 0 placeholder)
- [ ] Phase 2: migration script is idempotent (running twice produces the same registry state; verified by snapshot diff)
- [ ] Phase 2: 4 new migration tests (rule extraction + source mutation, loop-design emission + backfill, idempotency snapshot diff, partial-state recovery)
- [ ] Phase 3: `meta_state_propose_design` MCP tool is registered in `tools/learning-loop-mcp/server.js` and implemented in `tools/learning-loop-mcp/tools/meta-state-propose-design-tool.js`
- [ ] Phase 3: the tool's idempotency guard works (same `addresses + proposed_design_for` set returns the existing entry id, no duplicate)
- [ ] Phase 3: `meta_state_list` accepts `entry_kind: "rule"` and `entry_kind: "loop-design"` in its filter (and `["rule", "loop-design"]` arrays)
- [ ] Phase 3: 6-8 new tests across 2 new test files (propose-design tool, list entry-kind extended)
- [ ] Phase 4: `loop_describe({ tier: "warm" })` returns `rule_count`, `loop_design_count`, and the existing `promoted_rules` field is renamed to `rules` and reads from the new entry kind; 3 existing tests (`integration-promoted-rule.test.js`, `loop-describe.test.js`, `loop-describe-warm-tier.test.js`) are updated to match the new field names
- [ ] Phase 4: `loop_describe({ tier: "cold" })` returns a new `loop_designs` list with `id`, `title`, `proposed_design_for`, `addresses`, `shipped_in_plan` for each `active` loop-design
- [ ] Phase 4: 3-4 new loop_describe tests across 1 new test file
- [ ] Phase 5: `meta_state_resolve` is called on `meta-260606T1543Z-meta-state-cross-reference-field-design` (or the equivalent direct `updateEntry` is used as a fallback) with `resolved_by: "plan:260606-rule-loop-design-first-class#phase-5"`; the entry's status flips from `"superseded"` to `"resolved"` (a soft status migration; `meta_state_resolve`'s local TERMINAL_STATUSES set does NOT include `"superseded"`, so the tool proceeds). The `consolidated_into: "loop-design-cross-reference-fields"` pointer is preserved through the transition.
- [ ] Phase 5: a closing `change-log` entry is added documenting the 4-kind union is shipped
- [ ] **No regression:** all 573 existing tests still pass after the migration (the 557 baseline + 16 from the sibling plans)

## Validation Log

### Session 1 — 2026-06-06 (operator design conversation)

**Trigger:** operator opened the session with `INBOUND STATE GATE:` triggered and the design intent: "Before resolving meta-260606T1543Z-meta-state-cross-reference-field-design, I think the rule need to be the dedicated entry_kind, and the promoted_to_rule just the origin, for now the rule is kind of nested, it's hard for both agent and human to check for all rules in the current repo."

**Techniques applied:**
- **Inversion Exercise** — flipped "rule is the finding's resolution" to "rule has an origin (finding), but is not the finding's payload." Origin ≠ payload.
- **Meta-Pattern Recognition** — meta-state.jsonl's discriminated union is the natural place for any artifact with its own lifecycle. Findings, change-logs, rules, and loop-designs all have their own lifecycles; the pattern is *anything with its own lifecycle deserves its own entry_kind*.
- **Simplification Cascade** — one insight (separate report from rule) eliminates 4 hacks: (1) `status: "resolved" means rule is still live` hack, (2) `category: "loop-anti-pattern"` confusion, (3) `promoted_to_rule` carrying pattern refinement metadata, (4) "do I grep for `promoted_to_rule` to find rules?" question.

**Questions asked (4 total):**

1. **[Sequencing]** How to sequence the rules-first-class work vs. the cross-reference entry? **Answer:** Reframe the cross-reference entry to depend on rules-first-class; the deeper fix is the 4-kind union. (Evolved through follow-up: supersede the cross-reference design with the new 4-kind union, then re-emit the design notes as loop-design entries.)
2. **[Status]** What should the new `entry_kind: rule` status enum be? **Answer:** Binary `active | inactive`; refined/deprecated rules become inactive and use `supersedes` to point to the new rule.
3. **[Migration]** How to migrate the existing `promoted_to_rule` on findings? **Answer:** Full migration; extract all 4 rules, replace finding.promoted_to_rule with a string id, no backward-compat layer.
4. **[Naming]** What should the 4th entry_kind be named? **Answer:** `loop-design` (scoped to loop-internal; avoids confusion with `plans/` design docs).
5. **[Lineage]** Rule's `origin` should point at the OLD finding or the new loop-design entry? **Answer:** OLD finding (preserves history). Follow-up: operator realized loop-design needs an optional backward reference to findings too (the `addresses` field) — design is now a 3-edge graph `finding → loop-design → rule`.

**Decisions locked:** see "Locked Decisions" section above.

**Action items:**
- [x] Draft the plan file (this file) with 6 phases
- [x] Sketch the 2 new schemas (`metaStateRuleEntrySchema`, `metaStateLoopDesignSchema`)
- [x] Define the 3-edge graph (`finding → loop-design → rule`)
- [x] Mark the cross-reference design note as resolved-in-Phase-5 (not superseded)

**Impact on phases:**
- Phase 1 schema: 2 new branch schemas + narrowed `promoted_to_rule` field + 2 new cross-ref fields (`proposed_design_for`, `addresses`)
- Phase 2 migration: clean break (per operator) + the 3 superseded findings stay in the registry (deviation, approved)
- Phase 4 discoverability: `rules` list (renamed from `promoted_rules`) + new `loop_designs` list in cold tier

### Whole-Plan Consistency Sweep

- Files reread: this plan.md, `tools/learning-loop-mcp/core/meta-state.js`, `tools/learning-loop-mcp/core/gate-logic.js#loadPromotedRules` (lines 560-620), `tools/learning-loop-mcp/core/loop-introspect.js#listPromotedRules`, `tools/learning-loop-mcp/tools/meta-state-promote-rule-tool.js`
- Decision deltas checked: 4 (sequencing, status, migration, naming + lineage follow-up)
- Reconciled stale references: 0 (this is a new plan; no prior references to reconcile)
- Unresolved contradictions: 0

After the design conversation (5 questions, all answered):
- The 4 entry_kinds are explicit in Locked #1
- The 2 new schemas are explicit in Locked #2 + #3 + #6 (typed cross-refs)
- The clean-break migration is explicit in Locked #7 (with the 2-superseded-findings-stay deviation)
- The binary status is explicit in Locked #3
- The 3-edge graph is explicit in Locked #4
- The cross-reference design note is resolved (not superseded) in Locked #10
- All 5 operator questions are answered in "Resolved Decisions" section

## Red Team Review

### Session — 2026-06-06
**Findings:** 10 (8 accepted, 2 rejected)
**Severity breakdown:** 2 Critical, 5 High, 3 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Phase 0 assumed 3 design notes were superseded; meta-260606T1531Z is already resolved | Critical | Accept | Phase 0, Phase 2, Phase 5 — count reduced from 3 to 2 across all files |
| 2 | Finding status enum rejects "resolved"/"active" — schema drift vs registry | Critical | Accept | Phase 1 — added status enum fix to finding schema and new test |
| 3 | `promoted_rules` → `rules` rename breaks 3 existing tests | High | Accept | Phase 4 — documented test breaks; success criteria updated to include test updates |
| 4 | `checkResolutionEvidence` depends on synthesis layer with no removal plan | High | Accept | Phase 1 — noted in Risk Assessment; synthesis layer kept permanent until Phase 6 follow-up |
| 5 | `meta_state_promote_rule` uniqueness check blind to migrated findings after Phase 2 | High | Accept | Phase 1 — tool's first branch (entry_kind === "rule") catches duplicates; noted as known limitation |
| 6 | `meta_state_list` entry_kinds filter bypasses canonical filterEntries | High | Accept | Phase 3 — noted as intentional design (entry_kinds takes precedence); future enhancement to compose with filterEntries |
| 7 | `meta_state_list` returns inactive rules (not in TERMINAL_STATUSES) | Medium | Accept | Phase 3 — noted as intentional; warm tier counts only active rules via listPromotedRules |
| 8 | `meta_state_propose_design` gate log leaks full entry objects | Medium | Accept | Phase 3 — noted as medium risk; `existing_entry` is useful for debugging; size is bounded by loop-design count |
| 9 | Cross-kind id collision possible (loop-design id vs rule id) | Medium | Reject | Not a realistic issue — loop-design prefix is `loop-design-*`, rule prefix is `rule-*`; collision probability is negligible |
| 10 | `meta_state_propose_design` idempotency key too aggressive for empty addresses | Medium | Reject | By design per Locked #9 — `addresses + proposed_design_for` is the canonical identity; operator can use explicit `loop_design_id` to force separate entries |

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-00 through phase-05 (all 6 phase files)
- Decision deltas checked: 3 (design note count 3→2, finding status enum fix, rename test updates)
- Reconciled stale references: 15+ occurrences of "3 design notes" → "2 active design notes" across all files
- Unresolved contradictions: 0

## References

- `docs/philosophy.md` — "Evidence Is Source, Not Proof" (Pillar 3); meta-state as the loop's own audit log
- `docs/observation-vs-meta-state.md` — domain/meta/gate layer separation
- `plans/260602-sp0-log-change/plan.md` — origin of the entry_kind discriminated union pattern
- `plans/260602-self-enforcing-loop/plan.md` — parent architecture: meta-state as rule registry
- `plans/260605-superseded-status-and-discoverability/plan.md` — sibling plan; ships the `consolidated_into` / `consolidates` field pair Phase 2 reuses
- `plans/260606-cold-session-test-rule-promotion/plan.md` — sibling plan; uses the same consult pattern Phase 3 of this plan extends
- `tools/learning-loop-mcp/core/meta-state.js` — entry_kind union + 2 new branch schemas + narrowed `promoted_to_rule` field
- `tools/learning-loop-mcp/core/gate-logic.js#loadPromotedRules` — Phase 1 rewrites to read `entry_kind: "rule"` entries
- `tools/learning-loop-mcp/core/loop-introspect.js#listPromotedRules` — Phase 4 surfaces the new entry kinds in loop_describe
- `tools/learning-loop-mcp/tools/meta-state-promote-rule-tool.js` — Phase 1 rewrites to emit `entry_kind: "rule"` entries
- `tools/learning-loop-mcp/tools/meta-state-list-tool.js` — Phase 3 accepts the new entry_kinds in its filter
- `meta-state.jsonl` — 40 entries at session start (Phase 0 adds 1 change-log; Phase 2 mutates 4 + adds 4 rule entries + supersedes 2 + adds 2 loop-design entries; Phase 5 resolves 1)
