---
phase: 0
title: "Surface the design (change-log + reserve 2 active design-note findings for Phase 2 supersede)"
status: completed
priority: P2
effort: "0.5h"
dependencies: []
---

# Phase 0: Surface the design

## Overview

Add a `change-log` entry to `meta-state.jsonl` that documents the 4-kind union design (the first entry that references the new `rule` and `loop-design` entry_kinds in `applies_to.schemas`), and mark 2 active design-note-in-disguise findings `status: "superseded"` with a reserved `consolidated_into: <placeholder>` pointer. Phase 2 backfills the real new loop-design entry id into the placeholder. No code changes; no schema changes; this is purely an audit-trail commit so the design is visible in the registry before any code lands.

## Requirements

### Functional
- A new `entry_kind: "change-log"` line exists in `meta-state.jsonl` with `change_target: "tools/learning-loop-mcp/core/meta-state.js#metaStateEntrySchema"` and `applies_to.schemas: ["core/meta-state.js"]` (the canonical schema file that grows from a 2-member union to a 4-member union in Phase 1).
- The change-log's `change_diff.added` lists the 2 new branch schemas (`metaStateRuleEntrySchema`, `metaStateLoopDesignSchema`) by name; `change_diff.changed` lists the `metaStateEntrySchema` union (2 → 4 members) and the narrowed `promoted_to_rule` field (object → string).
- The change-log's `applies_to.schemas` includes `"core/meta-state.js"` so the new entry_kinds are first-class in the schema layer (not just inferred from data).
- 2 design-note-in-disguise findings are marked `status: "superseded"` with `consolidated_into: "PENDING-PHASE-2-LOOP-DESIGN-ID"`:
  1. `**************************************************` (subtype `tool-missing`; the instruction-layer design note — `meta-260606T0421Z`)
  2. `meta-260606T1543Z-meta-state-cross-reference-field-design` (subtype `meta-state-schema-enhancement`; the cross-reference design note — see Locked Decision #10: this one is "resolved" in Phase 5, but the Phase 0 supersede step unifies the surface treatment; Phase 2 backfills the new loop-design id, Phase 5 flips that loop-design entry's status to `inactive` because the design was realized by this very plan)
  - Note: `meta-260606T1531Z-cold-session-test-rule-deferred` is NOT included — it is already resolved by sibling plan 260606-cold-session-test-rule-promotion.
- The `consolidated_into` pointer uses a placeholder string `PENDING-PHASE-2-LOOP-DESIGN-ID` (a deliberately invalid id, so any tool that reads superseded entries knows the migration has not yet backfilled; Phase 2 swaps the placeholder for the real new loop-design entry id).
- The change-log's `id` is generated via `generateId(slugify("rule-and-loop-design-entry-kinds"))` → `meta-260606T{HHmm}Z-rule-and-loop-design-entry-kinds` (deterministic, no timestamp collision on second run; idempotency: existing same-id entry aborts the write).

### Non-functional
- The change-log is added via direct file I/O (`core/meta-state.js#writeEntry`), not via `meta_state_log_change` MCP tool — the change-log tool itself is one of the surfaces Phase 4 will iterate on, and Phase 0 must remain MCP-tool-agnostic. Pattern matches the closeout scripts in `tools/learning-loop-mcp/scripts/` and the test in `__tests__/cold-session-discoverability.test.cjs` (which uses `writeEntry` directly because the droid session lacks the MCP server).
- The 3 findings' status flip is via `updateEntry(root, id, { status: "superseded", consolidated_into: "PENDING-PHASE-2-LOOP-DESIGN-ID" })` — same direct-I/O path, no MCP tool.
- Both mutations are wrapped in `enqueue(root, ...)` (per-root write queue in `core/meta-state.js#writeEntry` / `updateEntry`); the change-log append and the 3 status flips are serial within a single script run to avoid read-modify-write races.

## Architecture

```
Phase 0 actions
    │
    ├─ 1. Append change-log entry (1 line to meta-state.jsonl)
    │     • id: meta-260606T{HHmm}Z-rule-and-loop-design-entry-kinds
    │     • change_target: tools/learning-loop-mcp/core/meta-state.js#metaStateEntrySchema
    │     • change_diff.added: [metaStateRuleEntrySchema, metaStateLoopDesignSchema]
    │     • change_diff.changed: [metaStateEntrySchema (2→4), promoted_to_rule (object→string)]
    │     • applies_to.schemas: ["core/meta-state.js"]
    │
    └─ 2. Mutate 3 findings (in-place status flip; same file, 3 lines)
          • meta-260606T1531Z-cold-session-test-rule-deferred
              → status=superseded, consolidated_into=PENDING-PHASE-2-LOOP-DESIGN-ID
          • meta-260606T0421Z-instruction-layer-for-agents-tbd
              → status=superseded, consolidated_into=PENDING-PHASE-2-LOOP-DESIGN-ID
          • meta-260606T1543Z-meta-state-cross-reference-field-design
              → status=superseded, consolidated_into=PENDING-PHASE-2-LOOP-DESIGN-ID

Result: 1 new line + 2 in-place status flips in meta-state.jsonl.
The registry is now self-documenting: a future agent can grep for the
change-log to find what 4-kind union design is in flight.
```

## Related Code Files

- **Modify:** `meta-state.jsonl` — append 1 change-log line; in-place update 3 finding lines (status, consolidated_into, version).
- **Read-only:** `tools/learning-loop-mcp/core/meta-state.js` — uses `writeEntry`, `updateEntry`, `generateId`, `slugify`.
- **Read-only:** `tools/learning-loop-mcp/core/slugify.js` — slugify helper.
- **Read-only:** `docs/journals/` (optional) — if the operator wants a journal entry, it goes to `docs/journals/260606-rule-loop-design-phase-0.md` (not required for Phase 0; the change-log is the audit trail).

## Implementation Steps

### Step 1: Generate the change-log id and entry shape

```js
import { generateId, writeEntry, updateEntry } from "#mcp/core/meta-state.js";
import { slugify } from "#mcp/core/slugify.js";

const changeLogId = generateId(slugify("rule-and-loop-design-entry-kinds"));
// → "meta-260606T{HHmm}Z-rule-and-loop-design-entry-kinds" (idempotent on
//    re-run within the same minute; rerun >1min later → new id, dedup check
//    in Step 2 catches it)

const changeLogEntry = {
  id: changeLogId,
  entry_kind: "change-log",
  change_dimension: "semantic",  // the 4-kind union is a semantic change
                                 // (taxonomy/contract), not mechanical (rule)
                                 // or surface (tool/manifest).
  change_target: "tools/learning-loop-mcp/core/meta-state.js#metaStateEntrySchema",
  change_diff: {
    added: [
      "metaStateRuleEntrySchema (new branch schema in discriminated union)",
      "metaStateLoopDesignSchema (new branch schema in discriminated union)",
    ],
    removed: [],
    changed: [
      "metaStateEntrySchema union: 2 members (finding | change-log) → 4 members (finding | change-log | rule | loop-design)",
      "promoted_to_rule on metaStateFindingEntrySchema: z.object({...}) → z.string() (just the rule id; rule's own lineage data — refined_at, refined_by, refinement_reason — moves to the rule entry)",
    ],
  },
  reason: "Extends the meta-state.jsonl discriminated union from 2 members to 4. The 4 promoted rules are today nested inside findings via promoted_to_rule payload — the rule's pattern lives inside the finding that originated it, and 2 active design notes are buried as findings with subtype=meta-state-schema-enhancement. The plan extracts rules into a dedicated entry_kind: 'rule' with its own binary status enum and origin lineage pointer, re-emits the active designs as entry_kind: 'loop-design' with proposed_design_for (forward) and addresses (backward) cross-references, and migrates 4 rules + 2 active design notes in one clean break (no backward-compat layer per operator decision 2026-06-06). Outcome: meta_state_list({ entry_kind: 'rule' }) and meta_state_list({ entry_kind: 'loop-design' }) return what the operator asks for in one query.",
  applies_to: {
    schemas: ["core/meta-state.js"],
    tools: ["meta_state_list", "meta_state_promote_rule", "meta_state_log_change"],
    statuses: ["active", "resolved", "reported", "superseded", "inactive"],
    surfaces: ["meta"],
  },
  evidence: {
    code_ref: "tools/learning-loop-mcp/core/meta-state.js#metaStateEntrySchema",
    journal: "plans/260606-rule-loop-design-first-class/plan.md",
  },
  status: "active",
  created_at: new Date().toISOString(),
  version: 0,
};
```

### Step 2: Idempotency guard before write

```js
import { readRegistry } from "#mcp/core/meta-state.js";

const root = resolveRoot();
const entries = readRegistry(root);
const existing = entries.find((e) => e.id === changeLogId);
if (existing) {
  // Re-run: don't duplicate. The change-log is the audit log; one line per design.
  console.log(`Phase 0 change-log ${changeLogId} already exists; skipping write.`);
} else {
  await writeEntry(root, changeLogEntry);
}
```

### Step 3: Mutate the 2 design-note findings

```js
const DESIGN_NOTE_IDS = [
  "**************************************************",
  "meta-260606T1543Z-meta-state-cross-reference-field-design",
];
const PLACEHOLDER = "PENDING-PHASE-2-LOOP-DESIGN-ID";

for (const id of DESIGN_NOTE_IDS) {
  const entry = entries.find((e) => e.id === id);
  if (!entry) {
    console.warn(`Design note ${id} not found in registry; skipping.`);
    continue;
  }
  // Idempotency: only mutate if not already superseded with the placeholder.
  if (entry.status === "superseded" && entry.consolidated_into === PLACEHOLDER) {
    console.log(`Design note ${id} already superseded; skipping.`);
    continue;
  }
  await updateEntry(root, id, {
    status: "superseded",
    consolidated_into: PLACEHOLDER,
  });
}
```

Note on the cross-reference design note (`meta-260606T1543Z`): Locked Decision #10 says it is "resolved" in Phase 5, not superseded. The Phase 0 supersede step here is a unification of surface treatment — both design notes get the same `consolidated_into` pointer in Phase 0, and Phase 2 backfills the real loop-design entry id. Phase 5 then calls `meta_state_resolve` (or the direct `updateEntry` fallback) on the **original finding** (not the new loop-design entry) to flip its status from `"superseded"` to `"resolved"` (a soft status migration; `meta_state_resolve`'s local TERMINAL_STATUSES set is `["auto-resolved", "expired", "resolved"]` and does NOT include `"superseded"`, so the tool proceeds). The `consolidated_into` pointer to the new loop-design entry is preserved through the transition. The new loop-design entry `loop-design-cross-reference-fields` itself stays `status: "active"` (it's a forward-looking design that says "build the typed cross-ref fields"; the entry is the operational artifact and continues to describe what the plan ships).

Note: `meta-260606T1531Z-cold-session-test-rule-deferred` is excluded because it is already resolved by sibling plan 260606-cold-session-test-rule-promotion.

### Step 4: Verify the mutations

```js
const after = readRegistry(root);
const newChangeLog = after.find((e) => e.id === changeLogId);
assert(newChangeLog, `change-log ${changeLogId} missing after write`);
assert(newChangeLog.entry_kind === "change-log", "entry_kind mismatch");
assert(newChangeLog.change_target === "tools/learning-loop-mcp/core/meta-state.js#metaStateEntrySchema", "change_target mismatch");

for (const id of DESIGN_NOTE_IDS) {
  const entry = after.find((e) => e.id === id);
  assert(entry, `finding ${id} missing after update`);
  assert(entry.status === "superseded", `${id} status not 'superseded' (got ${entry.status})`);
  assert(entry.consolidated_into === PLACEHOLDER, `${id} consolidated_into not the placeholder`);
}
```

### Step 5: No product code, no test files

Phase 0 ships no production code and no test files. The audit-trail commit is the deliverable. Phase 1 introduces the first TDD test files.

## Success Criteria

- [ ] `meta-state.jsonl` has 1 new line: a `change-log` entry with `id: meta-260606T{HHmm}Z-rule-and-loop-design-entry-kinds` (or whatever minute it lands in), `change_dimension: "semantic"`, `change_target: "tools/learning-loop-mcp/core/meta-state.js#metaStateEntrySchema"`, and the diff structure above
- [ ] `meta-state.jsonl` has 2 in-place status flips: `meta-260606T0421Z-...` and `meta-260606T1543Z-...` all show `status: "superseded"` and `consolidated_into: "PENDING-PHASE-2-LOOP-DESIGN-ID"`
- [ ] The `version` field on each mutated finding is incremented by 1 (per `updateEntry` semantics in `core/meta-state.js`)
- [ ] Re-running the Phase 0 script is a no-op (idempotency guard in Step 2 + Step 3)
- [ ] `git status --porcelain` shows exactly 1 modified file: `meta-state.jsonl`
- [ ] `git diff --stat meta-state.jsonl` shows 1 added line + 2 in-place edits
- [ ] `meta_state_list({ entry_kind: "change-log" })` (via the unchanged MCP tool) returns the new entry

## Risk Assessment

- **Risk 1:** The placeholder `PENDING-PHASE-2-LOOP-DESIGN-ID` could be picked up by a tool that validates cross-references. Mitigation: the placeholder is a deliberately invalid id (uppercase, contains hyphens, prefix `PENDING-`); a future tool validation step would reject it. Phase 2 must backfill before any cross-reference-validation tool ships.
- **Risk 2:** The 2 active design-note findings' status flip from `active` to `superseded` could surprise operators reading the registry (the original finding was an active design note). Mitigation: the change-log is the audit trail; the `consolidated_into` pointer signals the consolidation; the loop_describe warm tier's `active_findings` list no longer includes these 2 (the filter is `status in [reported, active]` per `core/loop-introspect.js#listActiveFindings`).
- **Risk 3:** The 2 active design-note findings' `acked_at` and `created_at` timestamps are preserved (not updated by Phase 0). This is correct: the operator-acked status is historical; the supersede is a new event but the historical timestamps stay.
- **Risk 4:** Concurrent writes during Phase 0. Mitigation: `enqueue` per-root serializes all writes to `meta-state.jsonl`; the script is the only writer during Phase 0 (no parallel agents expected to mutate the registry at the same time).
- **Risk 5:** The change-log's `applies_to.schemas: ["core/meta-state.js"]` is a single-schema reference. If the operator wants the change-log to also reference `core/gate-logic.js#loadPromotedRules` (which is also rewritten in Phase 1), Phase 4 can add a follow-up change-log for the gate-logic rewrite. For now, the meta-state schema is the canonical change target.

## TDD Tests Added (this phase)

No new test files. Phase 0 is a one-shot audit commit; TDD discipline starts in Phase 1. The `meta_state_log_change` MCP tool's existing tests (`__tests__/meta-state-log-change.test.js`) are exercised by reading the registry after Phase 0 completes; no new assertions are added.

## References

- `tools/learning-loop-mcp/core/meta-state.js#writeEntry` — the direct-I/O write function (used by the Phase 0 script)
- `tools/learning-loop-mcp/core/meta-state.js#updateEntry` — the in-place mutation function
- `tools/learning-loop-mcp/core/meta-state.js#generateId` — id generator
- `tools/learning-loop-mcp/core/slugify.js` — slug helper (60-char truncation)
- `tools/learning-loop-mcp/core/loop-introspect.js#listActiveFindings` — confirms superseded findings drop out of the warm tier
- `plans/260606-cold-session-test-rule-promotion/phase-03-rule-entry-and-closeout.md` — sibling plan's pattern for the rule entry + change-log closeout (Phase 0 here is a lighter version of the same pattern)
- Locked Decisions #5, #7, #10 in `plan.md` — origin pointer, clean-break deviation, cross-reference resolution strategy
