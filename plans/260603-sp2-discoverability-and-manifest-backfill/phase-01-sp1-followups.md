---
phase: 1
title: "SP1 Operational Follow-ups (derive_status first use + SP1 change-log entry)"
status: completed
priority: P3
effort: "0.25h"
dependencies: [0]
---

# Phase 1: SP1 Operational Follow-ups

## Overview

The SP1 cook journal's "Next Steps (post-cook)" section listed 2 items that were intentionally deferred from the SP1 cook session. This phase closes them:

1. **Operational first use of `meta_state_derive_status`** on the SP1-flagged stale `reported` finding `meta-260601T1353Z-bash-gate-constraint-matcher-does-not-distinguish-heredoc-co` (the only entry from the SP1 journal's "4 stale `reported` findings" set that is still in `reported` status as of 2026-06-03).
2. **Record a change-log entry for SP1 self-modification**, mirroring SP0's Phase 5 self-log pattern (entry `meta-260602T1705Z-tools-learning-loop...meta-state-log-change-tool-js`).

This is the second of 2 phases in the plan. Phase 0 is the manifest/discoverability fix. Phase 1 is operational first use of SP1's tools to validate the SP1 → SP2 chain works on real data.

## Why This Phase Exists

The SP1 cook journal (`docs/journals/260602-sp1-derive-status-planning.md`) explicitly listed these 2 items as "Next Steps (post-cook)":

> - Operational first use: run `meta_state_derive_status` on the 4 stale `reported` findings (`meta-260601T1353Z-*` family) to verify resolver paths.
> - Record a change-log entry for SP1 self-modification (mirror SP0 Phase 5 pattern).
> - SP2 (grounding) and SP3 (drift aggregation) are now unblocked.

**Verification (2026-06-03):** both items remain undone:
- `meta_state_derive_status` has zero entries in `.claude/coordination/gate-log.jsonl` — the tool has never been called in production.
- `meta-state.jsonl` has only 1 change-log entry (SP0's); no SP1 change-log entry exists.

This phase closes them as a side-effect of the current plan (SP2 gap closure), keeping the plan coherent (SP1 → SP2 → follow-up chain) and avoiding a separate plan for ~10 minutes of operational work.

## Requirements

- Functional:
  - `meta_state_derive_status` is called on the bash-gate-constraint-matcher entry
  - The call result is captured and documented in a journal entry
  - `meta_state_log_change` is called with the SP1 self-modification args
  - The change-log entry appears in `meta-state.jsonl`
  - The journal entry follows the SP0/SP1/SP2 cook journal pattern
- Non-functional:
  - 556 + 1 = 557 tests still pass (no test changes)
  - Gate log has 1 new `meta_state_derive_status` entry
  - `meta-state.jsonl` has 21 entries (was 20)
  - Insertion order preserved (the change-log is appended at the end)

## Architecture

### Step 1.1: Operational first use of `meta_state_derive_status`

**Target finding:** `meta-260601T1353Z-bash-gate-constraint-matcher-does-not-distinguish-heredoc-co`

**Why this finding:** It is the original SP1-flagged finding from the SP1 journal's "4 stale `reported` findings" set. As of 2026-06-03:
- 1 of 3 from the family is `reported` (this one)
- 1 of 3 is `resolved` (by operator, 2026-06-02)
- 1 of 3 is `active` (sanitizeslug, with a `promoted_to_rule` link)

The bash-gate-constraint-matcher entry has a meaningful `evidence.code_ref: "tools/learning-loop-mcp/hooks/bash-gate.js"` (legacy nested form) and a journal ref. The `derive_status` call exercises:
- The legacy `entry.evidence_code_ref ?? entry.evidence?.code_ref` fallback (C-1 mitigation)
- The file-existence check (the file does exist)
- The "no test" fast path (no `evidence_test` field)
- The drift detection logic (raw_status `reported` + mechanism shipped → `drift: true`)

**Tool call:**
```js
meta_state_derive_status({
  id: "meta-260601T1353Z-bash-gate-constraint-matcher-does-not-distinguish-heredoc-co",
  // run_tests defaults to false; no evidence_test on this entry anyway
})
```

**Expected output (per the locked shape from SP1):**
```json
{
  "id": "meta-260601T1353Z-bash-gate-constraint-matcher-...",
  "raw_status": "reported",
  "derived_status": "resolved-by-mechanism",
  "derivation": {
    "kind": "mechanism-shipped",
    "signals": {
      "code_ref_exists": true,
      "code_ref_path": "tools/learning-loop-mcp/hooks/bash-gate.js",
      "test_file_exists": null,
      "test_passed": null
    },
    "checked_at": "...",
    "duration_ms": ...
  },
  "drift": true,
  "recommendation": "resolve"
}
```

**Agent action:** the result indicates the entry is drift (`drift: true`) and the recommendation is `resolve`. The agent can use this to inform a future resolve decision (not in this phase — the cook captures the result and documents it; the actual resolve is out of scope).

### Step 1.2: Record a change-log entry for SP1 self-modification

**Tool call (mirror SP0's pattern):**
```js
meta_state_log_change({
  change_dimension: "surface",
  change_target: "tools/learning-loop-mcp/tools/meta-state-derive-status-tool.js",
  change_diff: {
    added: ["meta_state_derive_status"],
    removed: [],
    changed: []
  },
  reason: "SP1 derivation query shipped. Agent can now ask 'is this finding still true?' via meta_state_derive_status({ id, run_tests? }) and get a structured derivation response (derived_status, derivation.kind, drift, recommendation). Pure function core (core/derive-status.js) reads evidence_code_ref with legacy evidence.code_ref fallback; returns 3 derived_statuses, 4 derivation kinds, 4 recommendations. Mirrors SP0's self-log pattern.",
  applies_to: {
    tools: ["meta_state_derive_status"],
    schemas: ["core/meta-state.js"]
  },
  evidence: {
    code_ref: "tools/learning-loop-mcp/tools/meta-state-derive-status-tool.js",
    journal: "plans/reports/brainstorm-260602-sp1-derive-status.md"
  }
})
```

**Expected output (per the SP0 self-log shape):**
```json
{
  "id": "meta-260603T????-sp1-derive-status-tool-js",
  "entry_kind": "change-log",
  "change_dimension": "surface",
  "change_target": "tools/learning-loop-mcp/tools/meta-state-derive-status-tool.js",
  ...
}
```

The new entry will be the 21st line in `meta-state.jsonl` (was 20 lines).

### Step 1.3: Journal entry

Create `docs/journals/260603-sp2-gap-closure-cook.md` (or similar) documenting:
- The Phase 0 manifest/discoverability patches
- The Phase 1 derive_status call and result
- The Phase 1 change-log entry id
- The 557/557 test pass count
- The 5th G8 recurrence (cook will hit it during plan creation; recorded via `meta_state_report`)

Mirror the SP0/SP1/SP2 cook journal structure (header, steps taken, deviations, success metrics, references).

## TDD Workflow

This phase has no new tests. It is operational first use of existing tools, validated by:

1. **Inspecting the gate log** for the `meta_state_derive_status` entry (id matches, status fields present)
2. **Inspecting `meta-state.jsonl`** for the new change-log entry (entry_kind: "change-log", target matches)
3. **Reading the journal entry** to confirm the result was captured

The journal entry is the "evidence" of the operational use, in the same pattern as the SP0/SP1/SP2 cook journals.

## Implementation Steps

1. **Verify the bash-gate-constraint-matcher entry exists in `meta-state.jsonl`** (it does; line 7). Note its current `status: "reported"` and `expires_at: "2026-06-02T06:53:40.789Z"` (expired but irrelevant to `derive_status`).
2. **Call `meta_state_derive_status`** on the entry. Capture the full response (text content, not just status fields).
3. **Verify the gate log** has 1 new entry: `tool: "meta_state_derive_status"`, `id: "meta-260601T1353Z-..."`, `derived_status: "resolved-by-mechanism"`, `drift: true`, `recommendation: "resolve"`.
4. **Call `meta_state_log_change`** with the SP1 self-modification args (see Step 1.2 above).
5. **Verify `meta-state.jsonl`** has 21 entries (was 20). The new entry is at the end.
6. **Write the journal entry** at `docs/journals/260603-sp2-gap-closure-cook.md` (or similar; follow the SP0/SP1/SP2 cook journal pattern).
7. **Run `pnpm test`** — confirm 557 pass, 0 fail.
8. **Run `pnpm validate:records`** — confirm 183 records, 0 errors.
9. **Run `pnpm validate:plan-loop`** — confirm passes.

## Related Code Files

- Create:
  - `docs/journals/260603-sp2-gap-closure-cook.md` (the journal entry)
- Modify:
  - `meta-state.jsonl` (1 new change-log entry appended)
- Read:
  - `.claude/coordination/gate-log.jsonl` (verify the new entry)
- Delete: none

## Success Criteria

- [ ] `pnpm test` shows 557 pass, 0 fail
- [ ] `pnpm validate:records` passes
- [ ] `pnpm validate:plan-loop` passes
- [ ] Gate log has 1 new `meta_state_derive_status` entry (id: `meta-260601T1353Z-bash-gate-constraint-matcher-...`)
- [ ] `meta-state.jsonl` has 21 entries (was 20); the new entry is `entry_kind: "change-log"` with `change_target: "tools/learning-loop-mcp/tools/meta-state-derive-status-tool.js"`
- [ ] Journal entry exists at `docs/journals/260603-sp2-gap-closure-cook.md` and follows the SP0/SP1/SP2 cook journal pattern
- [ ] The journal entry documents the `derive_status` result (`drift: true`, `recommendation: "resolve"`) and the change-log entry id
- [ ] The 5th G8 recurrence is recorded (if it recurs during this plan's cook)

## Risk Assessment

- **Risk: the bash-gate-constraint-matcher entry has expired (`expires_at: 2026-06-02T06:53:40.789Z`, in the past).** The `meta_state_list` tool would skip it on expiry, but `meta_state_derive_status` works regardless — expiry is a presentation concern, not a derivation concern. The result is still meaningful. The agent can use the result to inform a future resolve decision (out of scope for this phase).
- **Risk: the SP1 change-log entry might conflict with the existing SP0 self-log (`meta-260602T1705Z-...`).** Each entry has a unique id generated by `generateId(slug)`. The slug for SP1's entry (`sp1-derive-status-tool-js`) is distinct from SP0's slug (`meta-state-log-change-tool-js`). No collision. The append-at-end pattern in `writeEntry` preserves insertion order.
- **Risk: the `meta_state_derive_status` tool may not be running when the cook session starts.** The MCP server (`pnpm gate:server`) needs to be running for the agent to call it. The cook session can either (a) start the server first, or (b) call the tool handler directly via dynamic import (the pattern used in the SP1 acceptance test). The plan is agnostic — both are valid.
- **Risk: the `meta_state_log_change` tool may reject the SP1 args due to schema validation.** The 4 args (change_dimension, change_target, change_diff, reason) are required and present. The optional `applies_to` and `evidence` blocks are valid per the SP0 change-log schema. The reason text is > 20 chars per the schema's `.min(20)` constraint. No rejection expected.
- **Risk: the derive_status result may differ from the expected output if the file has changed since the journal was written.** The journal expected `code_ref_exists: true` for `tools/learning-loop-mcp/hooks/bash-gate.js`. If the file has been deleted or moved, the result would be `code-missing` instead of `mechanism-shipped`. This is a feature, not a bug — the test exercises the derivation logic. The cook should record the actual result, not the expected one.
- **Risk: Phase 1 changes `meta-state.jsonl` mid-cook, which the SP2 acceptance test depends on.** The SP2 acceptance test (`__tests__/sp2-check-grounding-acceptance.test.js`) uses temp dirs, not the production registry. No conflict.

## Pattern References

- `docs/journals/260602-sp0-log-change-cook.md` (or `phase-05` reference) — SP0's self-log pattern
- `docs/journals/260602-sp1-derive-status-planning.md` — the original journal listing these 2 items as "Next Steps"
- `docs/journals/260602-sp2-check-grounding-cook.md` — SP2's cook journal (the format to mirror)
- `plans/260602-sp0-log-change/phase-05-first-real-change-log-entry.md` — SP0's "first real change-log entry" phase
- `meta-260602T1705Z-tools-learning-loop-mcp-tools-meta-state-log-change-tool-js` (line 18 of `meta-state.jsonl`) — the SP0 self-log entry to mirror
