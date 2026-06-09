---
title: "Adopt loop-design-instruction-layer (drive to inactive)"
description: >-
  Closes the active loop-design `loop-design-instruction-layer` by shipping the
  two-track audit it motivated: (A) extend `loop_describe` warm tier
  `discoverability_hints` with 2 new hints (canonical-tool-preference +
  4-question framework; AGENTS.md-vs-tool-manifest-vs-warm-tier role split);
  (B) audit the top-10 most-called tool descriptions against the 4-question
  framework (what/when/inputs/returns) and write
  `tools/learning-loop-mcp/references/tool-selection-guide.md`. The design
  then flips to `status: inactive` with `proposed_design_for` backfilled; the
  24h next-up finding `meta-260609T2102Z-next-up-adopt-loop-design-instruction-layer-...`
  is resolved before its TTL flips to `stale` (expires_at
  2026-06-10T14:02:41.798Z). All registry mutations go through MCP tools; no
  `node -e` escape hatch; the `meta-260606T2102Z-agent-used-direct-file-i-o-...`
  finding stays clean.
status: pending
priority: P2
branch: "main"
tags:
  - meta
  - mcp-tools
  - meta-state
  - discoverability
  - tool-descriptions
  - tdd
blockedBy: []
blocks: []
created: "2026-06-09T17:06:56.538Z"
createdBy: "ck:plan"
source: skill
related:
  - >-
    plans/reports/brainstorm-260609-instruction-layer.md (design source;
    full 5-persona predict verdict + 4-layer framing)
  - >-
    plans/260609-adopt-cross-reference-fields/ (sibling plan, completed;
    pattern for the meta-state mutations in Phase 3)
  - >-
    meta-260609T2102Z-next-up-adopt-loop-design-instruction-layer-status-active-si
    (target finding; 24h TTL pressure)
  - >-
    meta-260606T1433Z-discoverability-meta-evidence-migration (upstream
    change-log that shipped the original `discoverability_hints` surface;
    the new hints A4 + A5 extend this surface)
  - >-
    meta-260606T2102Z-agent-used-direct-file-i-o-... (active anti-pattern
    tracking; this plan must keep clean)
---

# Adopt loop-design-instruction-layer (drive to inactive)

## Overview

The loop-design `loop-design-instruction-layer` (v1, active since 2026-06-06, addresses 0, proposed_design_for 0) asks the open question: *should we add a `loop_get_instruction` MCP tool, extend `loop_describe`, or embed the rules in AGENTS.md?*

The brainstorm (see `plans/reports/brainstorm-260609-instruction-layer.md`) reframed the question via a 5-persona predict + context-engineering analysis. The verdict: **no new tool** (YAGNI trap — Devil's Advocate STOP trigger: "agent must remember to use a tool that teaches it which tools to use" is a circular dependency). The real surface is the existing 4-layer split:

1. **AGENTS.md** = priority-1 prompt (steering: shape, rules, canonical paths)
2. **Tool manifest (52 tools)** = deterministic tool-selection surface
3. **`loop_describe` warm tier `discoverability_hints`** = at-start-up injection
4. **`learning-loop` skill + `references/learning-loop-rules.md`** = prompt-author docs

The on-demand gap is real but tiny. The right answer is to make the tool manifest and warm tier good enough that no on-demand lookup is needed.

Per operator direction: "do as much as possible to keep this inactive ... mark as 'done' because if we don't make sure the agent could figure the tool out, other design would be built on the shaky foundation."

## Phases

| Phase | Name | Status | Effort |
|-------|------|--------|--------|
| 1 | [Track A: Warm-Tier `discoverability_hints` Audit](./phase-01-track-a-warm-tier-audit.md) | Pending | 45m |
| 2 | [Track B: Tool Description + Selection Guide](./phase-02-track-b-tool-description-audit.md) | Pending | 90m |
| 3 | [Meta-State Mutations + Closeout](./phase-03-meta-state-mutations-and-closeout.md) | Pending | 30m |

## Why Now (TTL pressure)

`core/meta-state.js#checkExpiry` transitions `status: reported` past `expires_at: 2026-06-10T14:02:41.798Z` to `status: stale` (per the stale-flag redesign; non-terminal but degrades the next-up signal to "re-verify, not adopt"). The cold-tier regression test surfaces stale next-ups as needs-attention. Inaction is materially worse than resolving.

## Dependencies

- Blocked by: nothing. `meta_state_patch` (the CRUD-coverage tool the design was originally deferred for) shipped in `260608-1015-meta-state-patch-tool-and-wire-format-fix`.
- Blocks: nothing. Sibling `260609-adopt-cross-reference-fields` is already completed.

## Touchpoints (MCP tools + code files)

### MCP tools (canonical path)
- `meta_state_patch` — backfill `proposed_design_for` + status flip on the design entry (CAS via `_expected_version`)
- `meta_state_ack` — promote the next-up finding from `reported` to `active` (required before `meta_state_resolve`)
- `meta_state_check_grounding` — verify the next-up finding's `evidence_code_ref` still resolves
- `meta_state_refresh_fingerprint` — re-compute SHA-256 if `check_grounding` reports drift
- `meta_state_resolve` — close the next-up finding (consults `rule-no-orphaned-evidence`)
- `meta_state_log_change` × 3 — append 3 ship change-logs (one for Track A, one for Track B, one for the design-adoption closeout with `consolidates`)
- `meta_state_derive_status` — post-ship drift check on the design entry
- `meta_state_list` — read-back verification

### Code files
- Modify: `tools/learning-loop-mcp/core/loop-introspect.js#DISCOVERABILITY_HINTS` (add 2 new hints A4 + A5; total 6 → 8)
- Modify: `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` (4-6 new assertions for A4 + A5 + warm tier size budget)
- Modify: 10 individual `tools/learning-loop-mcp/tools/*-tool.js` files (top-10 tool descriptions: append "When to use" sentence to each `description` field)
- Create: `tools/learning-loop-mcp/references/tool-selection-guide.md` (intent → tool mapping; ~50-80 lines)
- Create: `tools/learning-loop-mcp/__tests__/tool-description-audit.test.cjs` (4-question framework assertion; ~30 tests)
- Append: `docs/journals/260609-adopt-instruction-layer-closeout.md`

### Registry mutations
- Modify: `meta-state.jsonl#loop-design-instruction-layer` (via `meta_state_patch`, 1 call: `status: active → inactive` + `shipped_in_plan` + `shipped_at` + `proposed_design_for` backfill; `version: 1 → 2`)
- Modify: `meta-state.jsonl#meta-260609T2102Z-next-up-adopt-loop-design-instruction-layer-...` (via `meta_state_resolve`, after `meta_state_ack` + `meta_state_check_grounding`)
- Append: `meta-state.jsonl` × 3 change-logs (Track A ship + Track B ship + design-adoption ship with `consolidates`)

## Success Criteria (overall)

- [ ] Track A: 2 new hints A4 + A5 present in `DISCOVERABILITY_HINTS` (now 8 entries); 4-6 new test assertions pass in `cold-session-discoverability.test.cjs`; warm tier size budget test still passes.
- [ ] Track B: `tools/learning-loop-mcp/references/tool-selection-guide.md` exists with intent → tool mapping covering at least 12 common intents; top-10 tool descriptions in individual `*-tool.js` files have a "When to use" sentence; new test file `tool-description-audit.test.cjs` passes (~30 assertions for the 4-question framework).
- [ ] Phase 3: `meta_state_list({ entry_kind: "loop-design", id: "loop-design-instruction-layer" })` returns `status: "inactive"`, `proposed_design_for: [2-3 ship change-log ids]`, `shipped_in_plan: "plans/260609-adopt-instruction-layer/"`, `version: 2`.
- [ ] Phase 3: next-up finding `meta-260609T2102Z-...` has `status: "resolved"`, `resolved_by: "operator"`.
- [ ] Phase 3: 3 ship change-logs filed (Track A, Track B, design-adoption), each with `consolidates` or `applies_to` linking to the design entry.
- [ ] `pnpm check` passes (target: 898 baseline + 4 from Phase 1 + ~30 from Phase 2 = ~932 tests).
- [ ] Zero direct file I/O to `meta-state.jsonl` (only MCP tools).
- [ ] `meta_state_derive_status({ id: "loop-design-instruction-layer" })` returns `derived_status: "active-no-signal"` and `drift: false` (the design entry has no `evidence_code_ref`; deriveStatus returns "active-no-signal" when there are no signals).
- [ ] `loop_describe({ tier: "warm" })` cold-session test still passes (the `rule-cold-session-test-must-pass-before-resolution` consult-gate is satisfied — actually a no-op since the gate only fires on resolve, but verify).
- [ ] Journal `docs/journals/260609-adopt-instruction-layer-closeout.md` written.

## Out of Scope (YAGNI)

- New `loop_get_instruction` MCP tool
- Auto-deriving AGENTS.md from structured source
- Per-tool deep-dive beyond the top 10 most-called
- Reframing AGENTS.md sections to match the "priority-1 prompt" terminology (operator may do this in a follow-up; out of scope to keep the audit focused)
- Closing the sibling `loop-design-meta-state-registry-sqlite-migration-trajectory-parked` design (still parked per `trajectory.md` pre-conditions)
- Any change to the 4-kind union or the cross-reference-fields design
- Bumping the warm tier size budget (new hints are <300 bytes each; budget is ~5KB)

## Risk Assessment

- **Risk**: 24h TTL elapses between phases. **Mitigation**: all 3 phases in one session, total budget <2.5h.
- **Risk**: Warm tier size budget exceeded by new hints. **Mitigation**: Track A test locks the budget; new hints are <300 bytes each.
- **Risk**: Tool description edits introduce new ambiguity. **Mitigation**: Track B test catches regressions via 4-question assertion (regex check for "Use when" / "vs" / "instead of").
- **Risk**: `rule-no-orphaned-evidence` consult-gate blocks `meta_state_resolve`. **Mitigation**: Phase 1 Step 1.5 proactively refreshes the next-up finding's fingerprint (its `evidence_code_ref` points to `loop-introspect.js#buildDiscoverabilityHints` which Phase 1 modifies). Phase 3 Step 3.6 runs `meta_state_check_grounding` which should return "grounded".
- **Risk**: Agent attempts `node -e` escape hatch. **Mitigation**: AGENTS.md canonical-rule reminder; Phase 3 explicitly forbids it; the `meta-260606T2102Z` finding stays clean as a check.
- **Risk**: Top-10 tool selection is wrong (the wrong tools are audited). **Mitigation**: base on the gate-log audit if available, else on `inputSchema` complexity + description length; Phase 2 documents the selection rationale in the plan.
- **Risk**: `meta_state_log_change` returns duplicate (the `meta-260606T2106Z` gap). **Mitigation**: idempotency guard — re-read `meta-state.jsonl` and confirm no entry with same `change_target` + `reason` exists before calling; if the tool doesn't have a built-in guard, do the guard in the agent.
- **Risk**: Test isolation breaks — the cold-session test uses GATE_ROOT-isolated temp dirs (per existing pattern); Track A must preserve this.

## Validation Log

### Session 1 — 2026-06-09 (whole-plan consistency sweep, pre-validation)

**Trigger:** Post-draft sweep per ck:plan skill step 9. Caught 3 internal contradictions; all reconciled before /ck:plan validate was run.

**Sweep results:**
- **Files reread:** plan.md, phase-01-track-a-warm-tier-audit.md, phase-02-track-b-tool-description-audit.md, phase-03-meta-state-mutations-and-closeout.md
- **Contradictions found:** 3
- **Contradictions reconciled:** 3

**Contradictions + resolutions:**

1. **Number of change-logs**. plan.md `MCP tools` bullet said `meta_state_log_change × 2` (Track A + Track B), but `Success Criteria` and Phase 3's Implementation Steps ship **3** change-logs (Track A + Track B + design-adoption closeout with `consolidates`). The cross-reference-fields plan ships the same pattern. **Fix:** plan.md `MCP tools` bullet → `× 3`; plan.md `Registry mutations` bullet → `× 3 change-logs (Track A ship + Track B ship + design-adoption ship with consolidates)`.
2. **Test count arithmetic**. plan.md `Success Criteria` said `898 + ~36 new = ~934`. Phase 1 says `898 + 4 = 902`; Phase 2 says `902 + ~30 = ~932`. The `~36` is wrong (4 + 30 = 34, not 36); the `~934` is wrong (898 + 34 = 932, not 934). **Fix:** plan.md `Success Criteria` → `898 baseline + 4 from Phase 1 + ~30 from Phase 2 = ~932`; Phase 3 Step 3.9 and Step 3.9 success criterion → `~932`.
3. **No other contradictions.** Cross-checked: design id `loop-design-instruction-layer` consistent across all 4 files; finding id `meta-260609T2102Z-next-up-adopt-loop-design-instruction-layer-...` consistent; `consolidates` is single-string everywhere (the cross-reference-fields lesson is preserved); `meta_state_patch` response shape is `{patched: true, version: 2}` (no `updated: true` stray); `derive_status` pin to `active-uncertain + drift: false` consistent; no `node -e` escape hatch anywhere.

**Unresolved:** none.

### Session 2 — 2026-06-10 (validation interview, post-verification pass)

**Trigger:** `/ck:plan validate` per skill step 2.5 (Standard tier: Fact Checker + Contract Verifier).

**Verification Results**
- **Tier:** Standard (3 phases)
- **Claims checked:** ~25
- **Verified:** 18 | **Failed:** 4 | **Unverified:** 3

**Failures**

1. **[Fact Checker — Phase 2]** `agent-manifest.json` has no per-tool `description` fields. Tools are listed as string arrays in `groups.*.tools`. Actual descriptions live in individual `tools/learning-loop-mcp/tools/*-tool.js` files. Phase 2's Step 2.3 (editing 10 tool descriptions in `agent-manifest.json`) and the test file (`tool-description-audit.test.cjs` reading descriptions from `agent-manifest.json`) are both based on a false premise.
2. **[Fact Checker — Phase 1]** `cold-session-discoverability.test.cjs` test 2 asserts `warm.discoverability_hints.length === 6`. Adding 2 new hints makes it 8. The plan does not explicitly mention updating this existing assertion.
3. **[Contract Verifier — Phase 3]** The actual `meta-260609T2102Z-next-up-...` finding's `evidence_code_ref` is `tools/learning-loop-mcp/core/loop-introspect.js#buildDiscoverabilityHints` (not `meta-state.js#metaStateLoopDesignSchema` as the plan's Risk Assessment claims). Phase 1 modifies `loop-introspect.js`, so `meta_state_check_grounding` will return `drifted`.
4. **[Contract Verifier — Phase 3]** The `loop-design-instruction-layer` entry has NO `evidence_code_ref` field. `deriveStatus` returns `"active-no-signal"` (not `"active-uncertain"`) when there are no signals. The plan's success criteria expects `"active-uncertain"`.

**Interview questions asked:** 4
**Key decisions confirmed:**
1. Tool descriptions: edit 10 individual `*-tool.js` files (not `agent-manifest.json`).
2. Cold-session test: update `=== 6` to `=== 8`.
3. Fingerprint drift: proactively refresh after Phase 1 (Step 1.5).
4. Derive status: expect `"active-no-signal"` and `drift: false`.

**Propagation:** All 4 decisions propagated to affected phase files. Phase 1: added Step 1.5 (fingerprint refresh), updated Step 1.3 (length assertion), updated success criteria. Phase 2: updated Step 2.3 (individual tool files), updated test file code, updated Related Code Files, updated success criteria. Phase 3: updated Step 3.1 (actual evidence_code_ref), updated Step 3.6 (grounded expected), updated Step 3.8 (active-no-signal), updated Step 3.10 (diff assertion), updated Risk Assessment.

### Whole-Plan Consistency Sweep

- **Files reread:** plan.md, phase-01-track-a-warm-tier-audit.md, phase-02-track-b-tool-description-audit.md, phase-03-meta-state-mutations-and-closeout.md
- **Decision deltas checked:** 4
- **Reconciled stale references:** 6
  1. `agent-manifest.json` → individual `*-tool.js` files (4 occurrences across plan.md, phase-02)
  2. `=== 6` → `=== 8` (1 occurrence in phase-01)
  3. `meta-state.js#metaStateLoopDesignSchema` → `loop-introspect.js#buildDiscoverabilityHints` (2 occurrences in phase-03, 1 in plan.md Risk Assessment)
  4. `active-uncertain` → `active-no-signal` (2 occurrences in phase-03, 1 in plan.md Success Criteria)
  5. `check_grounding` flow simplified (Phase 1 refresh makes drift unlikely; phase-03 updated)
  6. Test file `manifest.tools` access → `extractDescription` from tool files (phase-02)
- **Unresolved contradictions:** 0

