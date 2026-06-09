---
phase: 3
title: "Meta-State-Mutations-and-Closeout"
status: pending
priority: P2
effort: 30m
dependencies:
  - 1
  - 2
---

# Phase 3: Meta-State Mutations + Closeout

## Overview

Apply the 6 registry mutations in the canonical order, using only MCP tools. No direct file I/O. Then verify, journal, flip plan status, and post-closeout sweep.

Mirrors `plans/260609-adopt-cross-reference-fields/phase-01-mutations.md` and `phase-03-closeout.md`. Inherits all the same hard-won lessons (CAS via `_expected_version`, single-string `consolidates`, diff assertion matches the expected mutations). For this plan, `derive_status` on the design entry returns `"active-no-signal"` (not `"active-uncertain"`) because the design has no `evidence_code_ref`.

## Requirements

- Functional: design entry has correct `proposed_design_for`, `status: inactive`, `shipped_in_plan`, `shipped_at`, `version: 2`; next-up finding is `resolved`; 3 ship change-logs are appended (Track A, Track B, design-adoption); journal written; plan status flipped.
- Non-functional: every mutation goes through an MCP tool (`meta_state_patch`, `meta_state_ack`, `meta_state_check_grounding`, `meta_state_refresh_fingerprint`, `meta_state_resolve`, `meta_state_log_change` × 3); no `node -e`; no `Edit`/`Write` to `meta-state.jsonl`; CAS via `_expected_version` on every patch; `pnpm check` exit 0.

## Architecture

Single-session, single-agent, ordered mutation sequence. Step 1 captures the current `version` of the design entry (read first to enable CAS). Steps 2 mutate the design entry (combined into 1 patch since all 4 fields are independent). Step 3 files 3 ship change-logs (Track A, Track B, design-adoption). Steps 4-7 close the next-up finding via the canonical path. Step 8 verifies. Step 9 journal + plan-status flip.

## Related Code Files

- Modify: `meta-state.jsonl#loop-design-instruction-layer` (via `meta_state_patch`, 1 call: `proposed_design_for` + `status: inactive` + `shipped_in_plan` + `shipped_at`; `version: 1 → 2`)
- Modify: `meta-state.jsonl#meta-260609T2102Z-next-up-adopt-loop-design-instruction-layer-...` (via `meta_state_resolve`, after `meta_state_ack` + `meta_state_check_grounding` + `meta_state_refresh_fingerprint` if drifted)
- Append: `meta-state.jsonl` × 3 (via `meta_state_log_change`: 1 for Track A, 1 for Track B, 1 for the design-adoption closeout)
- Create: `docs/journals/260609-adopt-instruction-layer-closeout.md`
- Modify: `plans/260609-adopt-instruction-layer/plan.md` (status: pending → completed)
- Run: `ck plan check 1 && ck plan check 2 && ck plan check 3`

## Implementation Steps

### Step 3.1: Read current state (CAS prep)

Call `meta_state_list({ entry_kind: "loop-design", id: "loop-design-instruction-layer" })` and capture:
- `version` (current is 1; expected after Step 3.2: 2)
- Confirm `proposed_design_for` is `[]` and `status` is `"active"`.

Call `meta_state_list({ entry_kind: "finding", id: "meta-260609T2102Z-next-up-adopt-loop-design-instruction-layer-status-active-si" })` and capture:
- `version` (for any future patch; ack + resolve do not require CAS)
- `status` (expected: `"reported"`)
- `expires_at` (expected: `"2026-06-10T14:02:41.798Z"`)
- `mechanism_check` (expected: `true`)
- `evidence_code_ref` (expected: `"tools/learning-loop-mcp/core/loop-introspect.js#buildDiscoverabilityHints"`)
- `code_fingerprint` (expected: freshly refreshed by Phase 1 Step 1.5)

### Step 3.2: Backfill + status flip on the design entry (1 combined patch)

Call `meta_state_patch` with:
```
{
  id: "loop-design-instruction-layer",
  entry_kind: "loop-design",
  _expected_version: <version from Step 3.1>,
  patch: {
    proposed_design_for: [
      "<change-log id from Step 3.3A — Track A ship>",
      "<change-log id from Step 3.3B — Track B ship>",
      "meta-260606T1433Z-discoverability-meta-evidence-migration"
    ],
    status: "inactive",
    shipped_in_plan: "plans/260609-adopt-instruction-layer/",
    shipped_at: "<ISO 8601 timestamp at call time>"
  }
}
```

Note: the 3rd entry in `proposed_design_for` is the upstream motivation change-log (the one that shipped the original `discoverability_hints` surface that this design extends). Per `metaStateLoopDesignSchema.proposed_design_for: z.array(z.string()).min(1)`, the array must have at least 1 entry; we have 3.

Expected response: `{ patched: true, version: 2, ... }`. If `_expected_version` mismatch, re-read and retry (one retry max; second mismatch = abort and surface to operator).

### Step 3.3A: File the Track A ship change-log

Call `meta_state_log_change` with:
```
{
  change_target: "tools/learning-loop-mcp/core/loop-introspect.js#DISCOVERABILITY_HINTS",
  change_dimension: "surface",
  change_diff: {
    added: [
      "DISCOVERABILITY_HINTS[6] = 'canonical MCP tool + 4-question framework' (hint A4)",
      "DISCOVERABILITY_HINTS[7] = '4-layer role split: AGENTS.md priority-1, tool manifest, warm tier, learning-loop skill' (hint A5)",
      "DISCOVERABILITY_HINTS array size: 6 → 8"
    ],
    removed: [],
    changed: []
  },
  reason: "Track A of plan 260609-adopt-instruction-layer. Extends the discoverability_hints surface (originally shipped in meta-260606T1433Z) with 2 new hints: A4 closes the on-demand tool-selection gap by surfacing the canonical-tool-preference + 4-question framework, A5 clarifies the 4-layer role split (AGENTS.md priority-1 vs tool manifest vs warm tier vs learning-loop skill). Closes the meta-260609T2102Z-next-up-adopt-loop-design-instruction-layer-... TTL pressure (expires_at 2026-06-10T14:02:41.798Z) by adopting loop-design-instruction-layer.",
  applies_to: {
    surfaces: ["meta"],
    tools: ["loop_describe"],
    rules: [],
    statuses: ["active", "inactive"],
    schemas: ["tools/learning-loop-mcp/core/loop-introspect.js#DISCOVERABILITY_HINTS"]
  },
  evidence_code_ref: "tools/learning-loop-mcp/core/loop-introspect.js#DISCOVERABILITY_HINTS",
  evidence_journal: "docs/journals/260609-adopt-instruction-layer-closeout.md"
}
```

Record the returned change-log id for Step 3.2's `proposed_design_for[0]`.

### Step 3.3B: File the Track B ship change-log

Call `meta_state_log_change` with:
```
{
  change_target: "tools/learning-loop-mcp/agent-manifest.json#tools.meta_state_report",
  change_dimension: "surface",
  change_diff: {
    added: [
      "tools/learning-loop-mcp/references/tool-selection-guide.md (intent → tool mapping; >=12 intents + anti-pattern section)",
      "Top-10 tool descriptions: 'When to use' clause added to each (10 line edits)",
      "tools/learning-loop-mcp/__tests__/tool-description-audit.test.cjs (~30 new assertions)"
    ],
    removed: [],
    changed: [
      "tools/learning-loop-mcp/tools/*-tool.js (10 tool descriptions edited)"
    ]
  },
  reason: "Track B of plan 260609-adopt-instruction-layer. Closes the 'when to use vs alternatives' gap in the 52-tool manifest by adding 1-2 sentence 'When to use' clauses to the top-10 most-called tool descriptions, creating tools/learning-loop-mcp/references/tool-selection-guide.md (the intent-to-tool mapping referenced by Track A's hint A4), and adding a regression test file that asserts the 4-question framework. The top-10 selection: meta_state_report, meta_state_log_change, meta_state_resolve, meta_state_list, meta_state_derive_status, meta_state_patch, loop_describe, gate_check, gate_mark_preflight, record_create_decision.",
  applies_to: {
    surfaces: ["meta"],
    tools: ["meta_state_report", "meta_state_log_change", "meta_state_resolve", "meta_state_list", "meta_state_derive_status", "meta_state_patch", "loop_describe", "gate_check", "gate_mark_preflight", "record_create_decision"],
    rules: [],
    statuses: ["active", "inactive"],
    schemas: ["tools/learning-loop-mcp/agent-manifest.json"]
  },
  evidence_code_ref: "tools/learning-loop-mcp/agent-manifest.json",
  evidence_journal: "docs/journals/260609-adopt-instruction-layer-closeout.md"
}
```

Record the returned change-log id for Step 3.2's `proposed_design_for[1]`.

### Step 3.4: File the design-adoption closeout change-log

Call `meta_state_log_change` with:
```
{
  change_target: "meta-state.jsonl#loop-design-instruction-layer",
  change_dimension: "surface",
  change_diff: {
    added: [
      "proposed_design_for backfilled with [Track A change-log id, Track B change-log id, meta-260606T1433Z-...]",
      "status: active → inactive",
      "shipped_in_plan: plans/260609-adopt-instruction-layer/",
      "shipped_at: <ISO timestamp>"
    ],
    removed: [],
    changed: []
  },
  reason: "Adopts loop-design-instruction-layer. The design's motivation (on-demand instruction surface for agents) was addressed by NOT adding a new tool (YAGNI trap per Devil's Advocate predict) and instead shipping the 2-track audit: (A) extend loop_describe warm tier discoverability_hints; (B) audit top-10 tool descriptions + create tool-selection-guide.md. The design entry moves to status=inactive, proposed_design_for populated, shipped_in_plan set. Closes meta-260609T2102Z-next-up-adopt-loop-design-instruction-layer-... before its 24h TTL flips to status=stale.",
  applies_to: {
    surfaces: ["meta"],
    tools: ["meta_state_patch", "meta_state_log_change", "meta_state_resolve", "meta_state_ack", "meta_state_check_grounding", "loop_describe"],
    rules: [],
    statuses: ["active", "inactive", "resolved"],
    schemas: ["tools/learning-loop-mcp/core/meta-state.js#metaStateLoopDesignSchema"]
  },
  evidence_code_ref: "tools/learning-loop-mcp/core/meta-state.js#metaStateLoopDesignSchema",
  evidence_journal: "docs/journals/260609-adopt-instruction-layer-closeout.md",
  consolidates: "meta-260609T2102Z-next-up-adopt-loop-design-instruction-layer-status-active-si"
}
```

`consolidates` is a single string per `metaStateChangeEntrySchema.consolidates: z.string().optional()` (the cross-reference-fields plan caught this: arrays fail Zod).

### Step 3.5: Promote next-up finding from `reported` to `active`

Call `meta_state_ack` with:
```
{
  id: "meta-260609T2102Z-next-up-adopt-loop-design-instruction-layer-status-active-si",
  reason: "operator-acked for adoption: design ships via plan 260609-adopt-instruction-layer (Track A + Track B audits); closing the 24h next-up finding before TTL flips to stale"
}
```

### Step 3.6: Check grounding (consult-gate prerequisite for resolve)

Call `meta_state_check_grounding` with:
```
{
  id: "meta-260609T2102Z-next-up-adopt-loop-design-instruction-layer-status-active-si"
}
```

Expected: `"grounded"` because Phase 1 Step 1.5 already refreshed the fingerprint after modifying `loop-introspect.js`. If `"drifted"` (unexpected), call `meta_state_refresh_fingerprint` and re-run `check_grounding`, then proceed to Step 3.7.

### Step 3.7: Resolve the next-up finding

Call `meta_state_resolve` with:
```
{
  id: "meta-260609T2102Z-next-up-adopt-loop-design-instruction-layer-status-active-si",
  resolution: "Design adopted: loop-design-instruction-layer marked status=inactive, proposed_design_for backfilled with the 3 change-logs that delivered the design (Track A: discoverability_hints extensions; Track B: tool descriptions + selection guide; upstream: meta-260606T1433Z discoverability surface ship), shipped_in_plan set to this plan. The TTL pressure (expires_at 2026-06-10T14:02:41.798Z) is closed. The 4-layer framing (AGENTS.md priority-1 prompt, tool manifest deterministic, warm tier at-start-up, learning-loop skill prompt-author) supersedes the original 3-option design question (loop_get_instruction vs extend loop_describe vs embed in AGENTS.md) — a new loop_get_instruction tool was YAGNI per Devil's Advocate predict."
}
```

Expected response: `{ resolved: true, resolved_by: "operator" }`. If the consult-gate `rule-no-orphaned-evidence` blocks, see Risk Assessment in plan.md (the design's `evidence_code_ref` is stable; refresh_fingerprint in Step 3.6 should have handled drift).

### Step 3.8: Read-back verification

Call `meta_state_list({ entry_kind: "loop-design", id: "loop-design-instruction-layer" })`.

Assert (all must hold):
- `status === "inactive"`
- `proposed_design_for.length === 3`
- `proposed_design_for[0]` is the Track A change-log id (from Step 3.3A)
- `proposed_design_for[1]` is the Track B change-log id (from Step 3.3B)
- `proposed_design_for[2] === "meta-260606T1433Z-discoverability-meta-evidence-migration"`
- `shipped_in_plan === "plans/260609-adopt-instruction-layer/"`
- `shipped_at` is a valid ISO 8601 timestamp ≤ now
- `version === 2` (baseline 1 + 1 patch)

Call `meta_state_list({ entry_kind: "finding", id: "meta-260609T2102Z-next-up-adopt-loop-design-instruction-layer-status-active-si" })`.

Assert (all must hold):
- `status === "resolved"`
- `resolved_at` is a valid ISO 8601 timestamp ≤ now
- `resolved_by === "operator"`
- `resolution` contains the phrase "YAGNI" (the substantive closeout narrative)

Call `meta_state_derive_status({ id: "loop-design-instruction-layer" })`.

Assert:
- `derived_status === "active-no-signal"`: PASS (the design entry has no `evidence_code_ref` or `evidence_test`; deriveStatus returns "active-no-signal" when there are no signals)
- `drift === false`: PASS (drift is only true when derived_status is "resolved-by-mechanism" and the raw status is not terminal)

### Step 3.9: Run full check

```bash
cd /home/datguy/codingProjects/learning-loop-template
pnpm check 2>&1 | tail -20
```

Assert: exit code 0, all ~932 tests pass (898 baseline + 4 from Phase 1 + ~30 from Phase 2 + 0 new from Phase 3 — Phase 3 is mutations only).

### Step 3.10: Confirm diff matches expected mutations

Run `git diff meta-state.jsonl` and confirm the diff contains at least these expected changes:

1. The design entry line: shows the new `proposed_design_for` array (3 entries) + `status: inactive` + `shipped_in_plan` + `shipped_at` + `version: 2`.
2. The next-up finding line: shows `status: "resolved"`, `resolved_at`, `resolved_by: "operator"`, `resolution` text. (May also show the `code_fingerprint` updated by Phase 1 Step 1.5.)
3-5. 3 appended lines: the Track A change-log, the Track B change-log, the design-adoption change-log.

No *unexpected* lines should change. If any line unrelated to these 5 categories changed, an escape-hatch was used — file a finding and abort.

### Step 3.11: Write the closeout journal

Create `docs/journals/260609-adopt-instruction-layer-closeout.md` with the following structure (mirroring `docs/journals/260609-adopt-cross-reference-fields-closeout.md`):

```markdown
# Journal: 260609 adopt instruction-layer

## Summary

[2-3 sentences: the design adopted, the 2 audit tracks that constitute the ship state, the next-up finding closed, TTL pressure resolved, the 4-layer framing replacing the original 3-option question.]

## Mutations applied

1. `meta_state_patch` on `loop-design-instruction-layer` (v1 → v2):
   - `proposed_design_for` backfilled: [Track A change-log id, Track B change-log id, `meta-260606T1433Z-...`]
   - `status`: `active` → `inactive`
   - `shipped_in_plan`: `plans/260609-adopt-instruction-layer/`
   - `shipped_at`: <ISO timestamp>
2. `meta_state_log_change` × 3: Track A ship (discoverability_hints A4 + A5), Track B ship (tool-selection guide + top-10 tool descriptions), design-adoption closeout (consolidates the next-up finding)
3. `meta_state_ack` on `meta-260609T2102Z-next-up-adopt-loop-design-instruction-layer-...`: `reported` → `active`
4. `meta_state_check_grounding`: [result; "grounded" expected]
5. `meta_state_refresh_fingerprint`: [skipped if grounded; called if drifted]
6. `meta_state_resolve` on `meta-260609T2102Z-...`: `active` → `resolved`, `resolved_by: operator`

## TTL pressure closed

`expires_at: 2026-06-10T14:02:41.798Z`. The 24h TTL was real per `core/meta-state.js#checkExpiry` (transitions `status: reported` past `expires_at` to `status: stale`). Closed in <24h of `created_at: 2026-06-09T14:02:41.790Z`.

## Framing shift: 3-option question → 4-layer split

The original design question (loop_get_instruction tool vs extend loop_describe vs embed in AGENTS.md) was reframed by the 5-persona predict + context-engineering analysis to a 4-layer split:
- **AGENTS.md** = priority-1 prompt (steering)
- **Tool manifest** = deterministic tool-selection surface
- **`loop_describe` warm tier `discoverability_hints`** = at-start-up injection
- **`learning-loop` skill + `references/learning-loop-rules.md`** = prompt-author docs

A new `loop_get_instruction` MCP tool was YAGNI per Devil's Advocate: "agent must remember to use a tool that teaches it which tools to use" is a circular dependency.

## Tool surface used

- `meta_state_patch` (the new tool from plan `260608-1015-meta-state-patch-tool-and-wire-format-fix`) — used to do the very work the design motivates (backfilling cross-references on existing entries).
- `meta_state_ack`, `meta_state_check_grounding`, `meta_state_refresh_fingerprint`, `meta_state_resolve`, `meta_state_log_change` × 3, `meta_state_derive_status`, `meta_state_list` — canonical read + lifecycle surface.
- Zero `node -e` invocations. Zero `Edit`/`Write`/`Create` to `meta-state.jsonl`. The `meta-260606T2102Z-agent-used-direct-file-i-o-...` finding stays clean.

## Code changes (Phases 1 + 2)

- `tools/learning-loop-mcp/core/loop-introspect.js#DISCOVERABILITY_HINTS`: 6 → 8 entries (added hints A4 + A5)
- `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs`: 4 new assertions for A4 + A5 + size budget
- `tools/learning-loop-mcp/tools/*-tool.js`: 10 tool descriptions edited (added "When to use" sentence)
- `tools/learning-loop-mcp/references/tool-selection-guide.md`: created (intent → tool mapping; >=12 intents)
- `tools/learning-loop-mcp/__tests__/tool-description-audit.test.cjs`: created (~30 assertions for 4-question framework)

## Out of scope (per brainstorm)

- New `loop_get_instruction` MCP tool
- Reframing AGENTS.md sections to "priority-1 prompt" terminology (operator may do in a follow-up)
- Per-tool deep-dive beyond the top 10
- Closing the parked SQLite migration design

## Test count

`pnpm check`: <N>/<N> passing. [record actual number from Step 3.9]
```

### Step 3.12: Flip plan + phase status

Run from the project root:

```bash
cd /home/datguy/codingProjects/learning-loop-template/plans/260609-adopt-instruction-layer
ck plan check 1
ck plan check 2
ck plan check 3
```

Then edit `plan.md` frontmatter: `status: pending` → `status: completed`. The `ck plan check` CLI does not manage `plan.md`'s top-level status field; flip it manually per the canonical pattern (see `plans/260609-stale-flag-redesign/plan.md` line 17).

### Step 3.13: Post-closeout sweep

Call `meta_state_list({ entry_kind: "loop-design", status: "active" })`. Assert: the only active design is `loop-design-meta-state-registry-sqlite-migration-trajectory-parked` (parked per trajectory.md; not in scope).

Call `meta_state_list({ entry_kind: "loop-design", id: "loop-design-instruction-layer" })`. Confirm: `status: "inactive"`.

Call `meta_state_list({ entry_kind: "finding", id: "meta-260609T2102Z-next-up-adopt-loop-design-instruction-layer-status-active-si" })`. Confirm: `status: "resolved"`.

Call `meta_state_query_drift({ include_grace: true })` (or analogous surface). If drift surfaced, investigate.

## Success Criteria

- [ ] Step 3.1 read captured `version: 1` and confirmed `proposed_design_for: []` + `status: "active"`.
- [ ] Step 3.2 patch response: `patched: true, version: 2`.
- [ ] Step 3.3A log_change response: a new change-log id (recorded for Step 3.2's `proposed_design_for[0]`).
- [ ] Step 3.3B log_change response: a new change-log id (recorded for Step 3.2's `proposed_design_for[1]`).
- [ ] Step 3.4 log_change response: a new change-log id for the design-adoption closeout with `consolidates: "meta-260609T2102Z-next-up-adopt-loop-design-instruction-layer-status-active-si"` (single string per schema).
- [ ] Step 3.5 ack response: `status: "active"`, `acked_at` populated.
- [ ] Step 3.6 check_grounding response: `status: "grounded"` (or `drifted` → refresh + re-check → grounded).
- [ ] Step 3.7 resolve response: `status: "resolved"`, `resolved_by: "operator"`.
- [ ] Step 3.8 all read-back assertions pass; `derived_status === "active-no-signal"` AND `drift === false`.
- [ ] Step 3.9 `pnpm check` exit 0; test count is ~932.
- [ ] Step 3.10 `git diff meta-state.jsonl` shows exactly 6 expected mutations (1 patch on the design entry, 1 resolve on the next-up finding, 3 appended change-log lines, 1 ack-driven `acked_at` field on the next-up finding).
- [ ] Step 3.11 journal created with the 6 mutation steps, TTL pressure closed narrative, 4-layer framing shift, tool surface used, code changes summary, out-of-scope call-out, and test count.
- [ ] Step 3.12 `ck plan check 1/2/3` exit 0; `plan.md` status flipped to `completed`.
- [ ] Step 3.13 sweep: only 1 active loop-design remains (`loop-design-meta-state-registry-sqlite-migration-trajectory-parked`); the design entry is `inactive`; the next-up finding is `resolved`; no unexpected drift.
- [ ] Zero `node -e` invocations during this phase.
- [ ] Zero `Edit`/`Write`/`Create` to `meta-state.jsonl` during this phase.

## Risk Assessment

- **Risk**: CAS mismatch on the design entry (Phase 1 + 2 of this plan mutate other files; the design entry's `version` should still be 1 because no prior patch touched it). **Mitigation**: Step 3.1 captures the version; one retry; second mismatch = abort + operator surface.
- **Risk**: `meta_state_resolve` consult-gate blocks on `rule-no-orphaned-evidence`. **Mitigation**: Step 3.6 before Step 3.7. The next-up finding's `evidence_code_ref` is `tools/learning-loop-mcp/core/loop-introspect.js#buildDiscoverabilityHints` which Phase 1 modifies; Phase 1 Step 1.5 proactively refreshes the fingerprint so drift is resolved before Phase 3.
- **Risk**: Step 3.3A/B/3.4 `meta_state_log_change` returns duplicate (the `meta-260606T2106Z` gap). **Mitigation**: idempotency guard — re-read `meta-state.jsonl` and confirm no entry with same `change_target` + `reason` exists before calling.
- **Risk**: 24h TTL elapses during Step 3.1-3.13. **Mitigation**: all steps in one session; total phase <30 min.
- **Risk**: The `consolidates` single-string schema is wrong (we pass an array). **Mitigation**: cross-reference-fields plan caught this exact bug; this plan uses the single-string form per the canonical pattern.
- **Risk**: 6 git diff mutations is the wrong count (Phase 1 + 2's code edits to `core/loop-introspect.js` and `agent-manifest.json` are separate from the meta-state diff; this assertion is for `meta-state.jsonl` only). **Mitigation**: Step 3.10's diff is on `meta-state.jsonl`, not the code files. The 6 mutations are: 1 patch on the design entry, 1 ack (acks don't write new lines; ack populates `acked_at` on the existing finding line — that may be 0 net new lines depending on how the tool writes), 1 resolve on the next-up finding, 3 appended change-log lines. The ack may not add a new line; if it modifies the existing line in place, the count is 5 net changes. **Update**: Step 3.10 asserts "the diff matches the expected mutations" — list the actual changes after the run, don't hardcode a count.

## Hand-off

After Step 3.13, the plan is complete. The 2 active loop-designs in `meta_state_list` are now:
- `loop-design-instruction-layer` → `inactive` (this plan)
- `loop-design-meta-state-registry-sqlite-migration-trajectory-parked` → `active` (parked per `trajectory.md`)

The `loop-design-cross-reference-fields` is also `inactive` (per `260609-adopt-cross-reference-fields`). All 2 originally-active loop-designs are now either `inactive` (shipped) or `active` (parked).

