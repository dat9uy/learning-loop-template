---
phase: 3
title: "Refactor and closeout"
status: pending
priority: P1
effort: "1.5h"
dependencies: [phase-02-green-implementation]
---

# Phase 3: Refactor and closeout

## Overview

Apply all live-registry mutations: (1) create the loop-design entry that captures the redesign intent; (2) backfill the 2 affected findings via `meta_state_supersede`; (3) add the `consolidates` field to the existing change-log; (4) emit the implementation change-log; (5) flip the loop-design to `inactive` with `shipped_in_plan`; (6) write the journal entry. Then run the full test suite + smoke probes + `loop_describe` warm tier + `meta_state_relationships` verification.

## Requirements

- **Functional:** the live `meta-state.jsonl` reflects the redesign; the 2 prior `auto-resolve`d findings are properly attributed to the implementation change-log; the registry validates; the journal is written.
- **Non-functional:** all live mutations go through MCP tools (no direct file I/O); the loop-design closeout uses `meta_state_patch` (not `meta_state_propose_design`, which would return `already_exists_by_addresses_and_proposed_design_for`).

## Architecture

The closeout is 6 ordered sub-steps. The ordering matters because of the loop-design lifecycle: the loop-design must be created BEFORE the implementation change-log (so the change-log can reference it as the design-time entry that proposed this work). The `consolidates` field on the change-log is added in the same batch as the change-log write, but the change-log write must come AFTER the 2 supersede calls (because the consolidated_into id must exist when supersede validates the target).

The 2 supersede calls are NOT batched with the change-log (because `meta_state_batch` does not have a `supersede` op type — its `BATCH_OP_TYPES` is `["write", "update", "delete", "archive"]`). The supersede is a single-tool call; atomicity is per-supersede, not cross-supersede. The change-log + loop-design-closeout-patch are batched together.

## Related Code Files

### Create

- `docs/journals/260609-stale-flag-redesign.md`

### Modify (live registry)

- `meta-state.jsonl` — 1 new loop-design entry + 1 new change-log entry + 2 patched entries (2 superseded findings + 1 loop-design status flip + 1 change-log `consolidates` field)

## Implementation Steps

### Sub-step 1 — Create the loop-design entry

Call the `meta_state_propose_design` MCP tool with:

```json
{
  "title": "Stale-flag redesign: replace auto-resolve-by-clock with re-verifiable stale status",
  "description": "Replaces the broken `resolved_by: 'auto-resolve'` semantics on TTL expiry with a new `stale` status (non-terminal) plus a `meta_state_re_verify` MCP tool that re-validates stale findings via `verification.steps`. Adds a `meta_state_supersede` MCP tool as the canonical writer of `consolidated_into` (closes the `meta_state_patch` deny-list gap). Extracts `core/verification-runner.js` shared by `meta_state_check_grounding` and `meta_state_re_verify`. Backfills the 2 affected findings (TTL recursion + closeout proof case) into the new change-log. Closes the recursion where the TTL finding was auto-resolved by its own critic'd system. Also fixes the second auto-resolve-by-clock path in `meta_state_list`.",
  "proposed_design_for": [
    "tools/learning-loop-mcp/core/meta-state.js#metaStateFindingEntrySchema",
    "tools/learning-loop-mcp/core/meta-state.js#checkExpiry",
    "tools/learning-loop-mcp/core/derive-status.js#computeRecommendation",
    "tools/learning-loop-mcp/core/loop-introspect.js#summarize",
    "tools/learning-loop-mcp/tools/meta-state-sweep-tool.js",
    "tools/learning-loop-mcp/tools/meta-state-list-tool.js",
    "tools/learning-loop-mcp/tools/meta-state-check-grounding-tool.js"
  ],
  "addresses": [
    "meta-260608T0847Z-ttl-expire-system-has-the-wrong-action-for-expiry-current-se",
    "meta-260606T1500Z-closeout-script-idempotency-bug",
    "meta-260609T1817Z-meta-state-jsonl-finding-lifecycle"
  ],
  "affected_system": "mcp-tools",
  "severity_hint": "high"
}
```

Capture the returned `id` (e.g., `loop-design-stale-flag-redesign`).

### Sub-step 2 — Supersede the 2 affected findings (sequential, not batched)

For each of the 2 findings, call `meta_state_supersede`. The 2 calls are sequential (one at a time):

```js
// Call 1
meta_state_supersede({
  id: "meta-260608T0847Z-ttl-expire-system-has-the-wrong-action-for-expiry-current-se",
  consolidated_into: "<implementation change-log id from sub-step 3>",
  resolution: "Redesigned: TTL/active-past-staleness-window now transition to status='stale' (non-terminal) instead of status='expired' + resolved_by='auto-resolve'. The new meta_state_re_verify tool re-validates via verification.steps. See change-log <id> for the full ship narrative.",
  _expected_version: 5  // current version of the TTL finding (read from the live entry)
})

// Call 2
meta_state_supersede({
  id: "meta-260606T1500Z-closeout-script-idempotency-bug",
  consolidated_into: "<implementation change-log id from sub-step 3>",
  resolution: "Bug was fixed in code (idempotency guard in scripts/closeout-meta-evidence-migration.cjs) but the finding was auto-resolved by TTL. Now properly attributed to the stale-flag redesign change-log. The TTL recursion that silenced this finding is the exact bug the redesign fixes.",
  _expected_version: 1  // current version of the closeout finding
})
```

For the `_expected_version` of each finding, read the current version from the live `meta-state.jsonl` (use the `meta_state_query_drift` tool or `meta_state_list` with `entry_kinds: ["finding"]` and the specific id filter — the workspace's tool surface does not have an id-specific filter, so just read the entry by id from the list output).

Verify the result: each call returns `{ superseded: true, status: "superseded", consolidated_into: <change_log_id>, ... }`.

### Sub-step 3 — Emit the implementation change-log + add `consolidates` to the existing change-log in one batch

Use `meta_state_batch` to write 2 operations atomically:

```json
{
  "operations": [
    {
      "op": "write",
      "entry": {
        "id": "meta-260609T<HHMM>Z-stale-flag-redesign-shipped",
        "entry_kind": "change-log",
        "change_dimension": "semantic",
        "change_target": "tools/learning-loop-mcp/core/meta-state.js#metaStateFindingEntrySchema + meta_state_sweep + meta_state_list + meta_state_re_verify + meta_state_supersede",
        "change_diff": {
          "added": [
            "metaStateFindingEntrySchema: status='stale' enum value (non-terminal)",
            "metaStateFindingEntrySchema: optional last_verified_at, verification, superseded_at, superseded_by fields",
            "core/verification-runner.js: new module exporting runVerification(root, step) with cmd-allowlist + shell:false + 10s timeout",
            "tools/meta-state-re-verify-tool.js: meta_state_re_verify MCP tool (META_STATE_VERIFY_EXEC=1 gate)",
            "tools/meta-state-supersede-tool.js: meta_state_supersede MCP tool (OPERATOR_MODE=1 gate; canonical writer of consolidated_into)",
            "core/derive-status.js: META_STATE_RECOMMENDATIONS gains 're_verify' value; computeRecommendation adds stale -> re_verify branch",
            "core/loop-introspect.js#summarize: includes last_verified_at",
            "core/patterns.json: meta-state-verify-cmd-allowlist (default: node/pnpm/npm/git/cat/ls/grep/rg/test/echo)",
            "tools/meta-state-sweep-tool.js: checkStaleness helper for active-past-STALENESS_WINDOW_MS; local TERMINAL_STATUSES gains 'stale'; registry-summary.md gains '## Stale Findings' section",
            "tools/meta-state-list-tool.js: removed auto-resolve-by-clock path; past-TTL entries now transition to 'stale' via checkExpiry (no resolved_at/resolved_by stamp)",
            "tools/meta-state-check-grounding-tool.js: runTest now delegates to core/verification-runner.js#runVerification (1-line refactor)"
          ],
          "removed": [
            "core/meta-state.js#checkExpiry: returned 'expired' for reported-past-TTL (replaced with 'stale')",
            "tools/meta-state-sweep-tool.js#handler: stamped resolved_at/resolved_by on stale transitions (replaced with no-stamp)",
            "tools/meta-state-list-tool.js#handler: stamped resolved_at/resolved_by on past-TTL transitions (replaced with no-stamp)"
          ],
          "changed": [
            "core/meta-state.js#TERMINAL_STATUSES: exported (was const); 'stale' is NOT added to this set (terminal-set discipline)",
            "core/derive-status.js#TERMINAL_RAW_STATUSES: unchanged; 'stale' is NOT added (stale is not terminal)",
            "tools/manifest.json: 2 new entries (meta_state_re_verify, meta_state_supersede)"
          ]
        },
        "reason": "Replaces the broken auto-resolve-by-clock semantics on TTL expiry with a re-verifiable stale status. Closes the recursion where meta-260608T0847Z-ttl-expire-system-... was auto-resolved by the very sweep it described. The 2 affected findings (TTL + closeout proof case) are backfilled to status=superseded with consolidated_into pointing at this change-log. ~16 new tests across 4 new test files + 1 added regression assertion in cold-session-discoverability.test.cjs.",
        "applies_to": {
          "tools": [
            "meta_state_sweep",
            "meta_state_list",
            "meta_state_re_verify",
            "meta_state_supersede",
            "meta_state_check_grounding",
            "meta_state_resolve"
          ],
          "surfaces": ["meta"],
          "rules": [],
          "statuses": ["stale", "superseded"],
          "schemas": [
            "tools/learning-loop-mcp/core/meta-state.js",
            "tools/learning-loop-mcp/core/derive-status.js",
            "tools/learning-loop-mcp/core/loop-introspect.js",
            "tools/learning-loop-mcp/core/patterns.json"
          ]
        },
        "evidence_code_ref": "tools/learning-loop-mcp/core/meta-state.js#metaStateFindingEntrySchema",
        "evidence_journal": "docs/journals/260609-stale-flag-redesign.md",
        "status": "active",
        "created_at": "<now ISO>",
        "version": 0
      }
    },
    {
      "op": "update",
      "id": "meta-260609T1817Z-meta-state-jsonl-finding-lifecycle",
      "consolidates": "meta-260608T0847Z-ttl-expire-system-has-the-wrong-action-for-expiry-current-se,meta-260606T1500Z-closeout-script-idempotency-bug"
    }
  ]
}
```

Verify the result: `{ applied: 2, failed_at: null }`.

### Sub-step 4 — Flip the loop-design to `inactive` with `shipped_in_plan`

The `meta_state_propose_design` tool's idempotency check returns `already_exists_by_addresses_and_proposed_design_for` if a matching active entry exists, so we use `meta_state_patch` to flip the status:

```json
{
  "id": "<loop-design id from sub-step 1>",
  "entry_kind": "loop-design",
  "patch": {
    "status": "inactive",
    "shipped_in_plan": "plans/260609-stale-flag-redesign",
    "shipped_at": "<now ISO>"
  },
  "_expected_version": 0
}
```

Verify: returns `{ patched: true, version: 1, ... }`.

### Sub-step 5 — Write the journal entry

Create `docs/journals/260609-stale-flag-redesign.md` with the structure:

```markdown
# Stale-flag redesign: journal

**Date**: 2026-06-09
**Author**: ck:cook
**Plan**: plans/260609-stale-flag-redesign/plan.md
**Status**: Shipped

## The recursion

The TTL finding `meta-260608T0847Z-ttl-expire-system-...` documented a
bug: when a `status: "reported"` finding passes its `expires_at`, the
sweep tool transitions it to `status: "expired"` with
`resolved_by: "auto-resolve"`. The finding disappears from the active
set. The original problem is never re-verified.

The TTL finding was itself auto-resolved at 2026-06-09T02:10:37Z by
the very system it described — a recursion: the critic was silenced
by the system.

## The proof case

`meta-260606T1500Z-closeout-script-idempotency-bug` (a real bug, fixed
in code) was auto-resolved by TTL at 2026-06-07T08:00:55Z. The bug
fix shipped but the finding was lost. A 2026-06-09 agent only
rediscovered it via `derive_status` drift=false, not via active
finding lookup.

## The fix

Replaces `resolved_by: "auto-resolve"` on TTL expiry with a new
`stale` status (non-terminal). The new `meta_state_re_verify` MCP
tool re-validates stale findings via `verification.steps`. The new
`meta_state_supersede` MCP tool is the canonical writer of
`consolidated_into` (closes the `meta_state_patch` deny-list gap).

Also fixes the second auto-resolve-by-clock path in `meta_state_list`
(every list call was stamping `resolved_by: "auto-resolve"` on
past-TTL entries — now transitions to `stale` instead).

## Test results

(N = number of new tests; P = pass; F = fail)

- meta-state-stale-flag.test.js: 10 new tests, 10P/0F
- meta-state-sweep-stale-transition.test.js: 3 new tests, 3P/0F
- cold-session-discoverability.test.cjs: 1 added assertion, 1P/0F
- index-validate-smoke.test.js: 1 new test, 1P/0F

Total: ~840 existing + 15 new = ~855 passing, 0 failing.

## Registry changes

- 1 new loop-design entry (now `inactive`, `shipped_in_plan` set)
- 1 new change-log entry (the implementation change-log)
- 1 patched change-log entry (added `consolidates` field)
- 2 superseded findings (TTL + closeout; both `consolidated_into`
  points at the implementation change-log)

## Future work (deferred to follow-up plans)

- TTL config field on `meta_state_report` at creation time
  (per-finding TTL, not the 7-day default).
- Pattern-based verification templates.
- `meta_state_sweep` SessionStart hook to auto-sweep on session start.
- `stale_drift` drift kind in `meta_state_query_drift`.
```

### Sub-step 6 — Final verification

Run in order:

1. **`pnpm test 2>&1 | tail -30`** — expect: all tests pass (count > 840).

2. **`node tools/learning-loop-mcp/server.js &`** — start the server; expect: `learning-loop-mcp: registered N of N tools` where N has increased by 2. Kill after smoke check.

3. **`loop_describe({ tier: "warm" })`** — verify the 2 new tools appear in the tool list.

4. **`meta_state_relationships({ id: "<implementation change-log id>", direction: "outbound" })`** — verify `consolidates: [ttl-id, closeout-id]` is present.

5. **`meta_state_query_drift()`** — verify the 2 backfilled findings no longer appear as drift (they are now `superseded`).

6. **`meta_state_list({ entry_kind: "finding", status: "superseded" })`** — verify the 2 findings are listed with their `consolidated_into` field.

7. **`meta_state_list({ entry_kind: "loop-design" })`** — verify the stale-flag-redesign entry shows `status: "inactive"`, `shipped_in_plan: "plans/260609-stale-flag-redesign"`.

8. **`meta_state_list({ entry_kind: "change-log", status: "active" })`** — verify the implementation change-log is in the active set with `applies_to.statuses: ["stale", "superseded"]`.

9. **`git status`** — verify all changed files are in the expected set (the implementation change-log and journal are added; no other files should show as untracked; the meta-state.jsonl shows ~5 changed lines).

10. **Commit** — `git add -A && git commit -m "feat(meta): stale-flag redesign + re_verify + supersede MCP tools"` (the pre-commit hook runs `pnpm validate:records && pnpm extract:index`; both must pass).

## Success Criteria

- [ ] The 2 affected findings (`meta-260608T0847Z-...` and `meta-260606T1500Z-...`) are now `status: "superseded"` with `consolidated_into` pointing at the implementation change-log.
- [ ] The existing change-log `meta-260609T1817Z-...` has a `consolidates` field listing the 2 findings.
- [ ] The implementation change-log is `status: "active"` and surfaces in `meta_state_list({ entry_kind: "change-log" })`.
- [ ] The loop-design entry is `status: "inactive"` with `shipped_in_plan: "plans/260609-stale-flag-redesign"`.
- [ ] `docs/journals/260609-stale-flag-redesign.md` exists and is well-formed.
- [ ] `pnpm test` passes (~855 tests, 0 fail).
- [ ] `loop_describe({ tier: "warm" })` lists `meta_state_re_verify` and `meta_state_supersede`.
- [ ] `meta_state_relationships` on the implementation change-log returns the 2 superseded finding ids in the `consolidates` field.
- [ ] `meta_state_query_drift` no longer reports the 2 backfilled findings as drift.
- [ ] Single commit on `main` with the full plan's work.

## Risk Assessment

- **Risk**: the `meta_state_batch` for the change-log + patch fails (e.g., the change-log id collides with an existing one). **Mitigation**: use a timestamped id (`meta-260609T<HHMM>Z-stale-flag-redesign-shipped`) and run a pre-flight `meta_state_list` to confirm the id is free.

- **Risk**: the `meta_state_propose_design` for the loop-design entry returns `already_exists_by_addresses_and_proposed_design_for` (because addresses+proposed_design_for match an existing entry from a prior brainstorming attempt). **Mitigation**: run a pre-flight `meta_state_list({ entry_kind: "loop-design" })` to check for an existing match; if found, skip the propose step and use `meta_state_patch` to update the existing entry instead.

- **Risk**: the loop-design closeout patch (`status: "inactive"`) might fail CAS if a concurrent writer is in flight. **Mitigation**: the workspace has no concurrent registry writers (single-agent mode); the CAS is a safety net, not a hard requirement.

- **Risk**: the pre-commit hook (`pnpm validate:records && pnpm extract:index`) might fail on the modified `meta-state.jsonl` if the schema validation is strict. **Mitigation**: `index_validate` is part of Phase 1's T1 test and the smoke test (Phase 1.4); both pass before this sub-step. The pre-commit hook's `validate:records` runs against `schemas/*.schema.json`, not `meta-state.jsonl`, so the registry change is unaffected.
