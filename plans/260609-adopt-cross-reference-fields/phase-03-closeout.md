---
phase: 3
title: Closeout
status: completed
priority: P2
effort: 10m
dependencies:
  - 2
---

# Phase 3: Closeout

## Overview

Journal entry, plan-status flip, post-closeout sweep. Matches the closeout pattern from `plans/260609-stale-flag-redesign/phase-03-refactor-and-closeout.md`.

## Requirements

- Functional: journal at `docs/journals/260609-adopt-cross-reference-fields-closeout.md` written; `plan.md` status flipped to `completed`; `phase-01/02/03` status flipped to `completed` via `ck plan check`; post-closeout sweep shows the cold-tier query no longer surfaces the next-up finding.
- Non-functional: closeout is single-session, MCP-tool mutations for registry changes, `ck plan check` for plan state.

## Architecture

Standard closeout ritual per AGENTS.md + the recent stale-flag closeout pattern. Three steps: journal → plan-state flip → sweep.

## Related Code Files

- Create: `docs/journals/260609-adopt-cross-reference-fields-closeout.md`
- Modify: `plans/260609-adopt-cross-reference-fields/plan.md` (status field; via `ck plan check <phase-id>` for phases + manual edit for plan.md status)
- Read: `meta-state.jsonl` (post-closeout sweep)

## Implementation Steps

### Step 3.1: Write the closeout journal

Create `docs/journals/260609-adopt-cross-reference-fields-closeout.md` with the following structure (mirroring `docs/journals/260609-stale-flag-redesign-closeout.md`):

```markdown
# Journal: 260609 adopt cross-reference-fields

## Summary

[2-3 sentences: the design adopted, the 2 change-logs that constitute the ship state, the next-up finding closed, TTL pressure resolved.]

## Mutations applied

1. `meta_state_patch` on `loop-design-cross-reference-fields` (v6 → v8):
   - `proposed_design_for` backfilled: [`meta-260606T2055Z-...`, `meta-260608T1258Z-...`]
   - `status`: `active` → `inactive`
   - `shipped_in_plan`: `plans/260609-adopt-cross-reference-fields/`
   - `shipped_at`: <ISO timestamp>
2. `meta_state_ack` on `meta-260609T2102Z-next-up-adopt-loop-design-cross-reference-fields-...`: `reported` → `active`
3. `meta_state_check_grounding`: [result; "grounded" expected]
4. `meta_state_refresh_fingerprint`: [skipped if grounded; called if drifted]
5. `meta_state_resolve` on `meta-260609T2102Z-...`: `active` → `resolved`, `resolved_by: operator`
6. `meta_state_log_change`: ship change-log at `meta-<timestamp>-meta-state-jsonl-loop-design-cross-reference-fields`, `change_target: meta-state.jsonl#loop-design-cross-reference-fields`, `consolidates: "meta-260609T2102Z-next-up-adopt-loop-design-cross-reference-fields-status-acti"` (single string)

## TTL pressure closed

`expires_at: 2026-06-10T14:02:41.798Z`. The 24h TTL was real per `core/meta-state.js#checkExpiry` (transitions `status: reported` past `expires_at` to `status: stale`). Closed in <24h of `created_at: 2026-06-09T14:02:41.798Z`.

## Tool surface used

- `meta_state_patch` (the new tool from plan `260608-1015-meta-state-patch-tool-and-wire-format-fix`) — used to do the very work the design's description says the field is "operationally useful" for, closing the recursive "use the escape hatch to fix the escape hatch" loop.
- `meta_state_ack`, `meta_state_check_grounding`, `meta_state_refresh_fingerprint`, `meta_state_resolve`, `meta_state_log_change`, `meta_state_derive_status`, `meta_state_list` — canonical read + lifecycle surface.
- Zero `node -e` invocations. Zero `Edit`/`Write`/`Create` to `meta-state.jsonl`. The `meta-260606T2102Z-agent-used-direct-file-i-o-...` finding stays clean.

## Out of scope (per brainstorm)

- Sibling next-up finding `meta-260609T2102Z-next-up-adopt-loop-design-instruction-layer-...` (separate design, separate session).
- New cross-reference fields.
- Refs-to-existing-entries validation.
- Batch backfill of other loop-designs.

## Test count

`pnpm check`: <N>/<N> passing. [record actual number]
```

Adjust the ISO timestamp + test count to the actuals from Phase 1 + Phase 2.

### Step 3.2: Flip plan + phase status

Run from the project root:

```bash
cd /home/datguy/codingProjects/learning-loop-template/plans/260609-adopt-cross-reference-fields
ck plan check 1
ck plan check 2
ck plan check 3
```

Then edit `plan.md` frontmatter: `status: pending` → `status: completed`. The `ck plan check` CLI does not manage `plan.md`'s top-level status field; flip it manually per the canonical pattern (see `plans/260609-stale-flag-redesign/plan.md` line 17).

### Step 3.3: Post-closeout sweep

Call `meta_state_list({ entry_kind: "loop-design", status: "active" })`. Assert: the only active design is `loop-design-instruction-layer` (the sibling, out of scope).

Call `meta_state_list({ entry_kind: "loop-design", id: "loop-design-cross-reference-fields" })`. Confirm: `status: "inactive"`.

Call `meta_state_list({ entry_kind: "finding", id: "meta-260609T2102Z-next-up-adopt-loop-design-cross-reference-fields-status-acti" })`. Confirm: `status: "resolved"`.

Call `meta_state_query_drift({ include_grace: true })` (or analogous surface — confirm the API at runtime; the tool name is documented in the agent-manifest). If drift surfaced, investigate.

## Success Criteria

- [ ] Step 3.1 journal created with the 6 mutation steps, TTL pressure closed narrative, tool surface used, out-of-scope call-out, and test count.
- [ ] Step 3.2 `ck plan check 1/2/3` exit 0; `plan.md` status flipped to `completed`.
- [ ] Step 3.3 sweep: only 1 active loop-design remains (`loop-design-instruction-layer`); the design entry is `inactive`; the next-up finding is `resolved`; no unexpected drift.

## Risk Assessment

- **Risk**: `ck plan check` rejects because plan status is not yet `completed`. **Mitigation**: the CLI checks phase status independently of plan status; this is the documented flow.
- **Risk**: Post-closeout sweep surfaces drift because a touched file's SHA-256 changed (the design's `evidence_code_ref` points at `core/meta-state.js` which the plan did not modify). **Mitigation**: drift should be zero. If non-zero, file a follow-up finding and ship a follow-up patch.
