---
title: "Discoverability + Meta-Evidence Migration: Code-Pointed Findings (Position D)"
description: "Closes the 2 active 2026-06-01 findings by surfacing the existing evidence_code_ref + mechanism_check workflow in loop_describe warm tier. Drops records/meta/evidence/ entirely. Internalization rule becomes 'cite the code, not the markdown.' Cold-session test (Approach 2, real subprocess spawn) is the acceptance gate. No new entry kind, no new MCP tool — the existing SP1/SP2 infrastructure is the answer."
date: "2026-06-06T00:00:00Z"
tags: [meta, discoverability, meta-state, evidence_code_ref, mechanism_check, cold-session-test, internalization, code-citation]
status: draft
session: 260606-discoverability-p2
supersedes: null
superseded_by: null
related:
  - meta-state.jsonl entry meta-260601T1339Z-the-learning-loop-has-no-mechanism-to-surface-the-internaliz (closed by this design)
  - meta-state.jsonl entry meta-260601T1339Z-agent-could-not-discover-the-meta-state-jsonl-registry-or-th (closed by this design)
  - plans/260605-superseded-status-and-discoverability/plan.md (Phase 3 closed superseded_lineage surface; this report extends discoverability further)
  - plans/260602-strict-mcp-call-rules/plan.md (origin of the SessionStart hook pattern extended here)
  - docs/journals/260606-discoverability-p2-handoff.md (prior-session handoff; framing for this work)
  - docs/observation-vs-meta-state.md (target doc for amendment)
  - docs/philosophy.md (target doc for amendment to pillar 3)
  - AGENTS.md (target doc for amendment to budget-check rule + new internalization rule)
  - tools/learning-loop-mcp/core/meta-state.js (evidence_code_ref + mechanism_check + code_fingerprint already in schema)
  - tools/learning-loop-mcp/tools/meta-state-report-tool.js (target for description amendment)
  - tools/learning-loop-mcp/tools/loop-describe-tool.js (target for discoverability_hints addition)
  - tools/learning-loop-mcp/core/loop-introspect.js (target for hint construction)
  - tools/learning-loop-mcp/core/source-ref-validator.js (target for local:meta-state:* acceptance + new error message)
  - .factory/hooks/loop-surface-inject.cjs (target for warm-tier hint surfacing on SessionStart)
  - tools/learning-loop-mcp/__tests__/ (target for new cold-session test + warm-tier hint tests)
related_findings:
  - meta-260601T1339Z-the-learning-loop-has-no-mechanism-to-surface-the-internaliz (loop-anti-pattern, active, expired)
  - meta-260601T1339Z-agent-could-not-discover-the-meta-state-jsonl-registry-or-th (loop-anti-pattern, active, expired)
---

# Discoverability + Meta-Evidence Migration: Code-Pointed Findings (Position D)

## TL;DR

The 2 active 2026-06-01 findings are closed by **surfacing the existing `evidence_code_ref` + `mechanism_check` workflow in `loop_describe` warm tier**, not by adding a new entry kind. `records/meta/evidence/` is dropped entirely. The internalization rule becomes *"cite the code, not the markdown."* A real cold-session subprocess test (Approach 2) is the acceptance gate — it spawns a fresh session with no prior context and asserts the agent uses `evidence_code_ref` (not markdown paths) when citing. Git-commit-hash extension to `evidence_code_ref` is punted to a follow-up plan.

## Problem Statement

### The 2 active findings (root cause: discoverability gap)

Both `meta-260601T1339Z-...` findings (active, `expires_at: 2026-06-03`, **expired 3 days ago**):

- **Finding 1** — agent creates record with `source_refs` to plans/docs/journals; validator says *"source ref must stay under `records/evidence`"*; agent doesn't know the WHY (internalization philosophy) or the HOW (extract → `records/meta/evidence/` → `local:` reference). Agent's natural response: bypass the boundary.
- **Finding 2** — agent can't discover `meta-state.jsonl` or `meta_state_report` MCP tool. Tried `records/meta/evidence/` (blocked by write gate) without knowing `meta_state_report` as an alternative.

Both REVERTED 2026-06-02. Operator's earlier `resolved` was premature; adoption = 0 in real sessions (G7). This design is the third attempt and the first that addresses the *discoverability* layer, not the *rule* layer.

### User-stated constraints (scoping)

- **Scope**: discoverability + meta-evidence migration. Records/observations/ stays as-is. Records/observations/archived pattern continues organically.
- **Output**: brainstorm report only. No plan. Plan is a follow-up session.
- **Acceptance**: automated cold-session test asserts an agent finds `meta_state_report` + the internalization rule without prompting.
- **Non-negotiable**: `records/meta/evidence/` can be deprecated. Internalization becomes `meta_state_report`-driven.
- **Doc amendments**: `AGENTS.md` + `docs/observation-vs-meta-state.md` + `docs/philosophy.md`.

### Why the user pushed back on Position A

A frozen-quote `excerpt` entry kind would have *formalized* the escape-hatch dependence. The quote lives in the loop, but the citation semantic still points outward at the markdown. Real internalization means the citation points at the loop's substance — **the code**, not the prose. The `code_fingerprint` (SHA-256) and `meta_state_derive_status` (re-check on demand) are already the right shape for this; they just aren't discoverable.

## Evaluated Approaches

### Position A: New `entry_kind: "excerpt"` (rejected)

Add a 3rd branch to the meta-state discriminated union. New MCP tool `meta_state_internalize`. New schema fields (`content_excerpt`, `source_artifact`, `source_artifact_kind`, `source_location`).

**Pros**: cleanest semantic for the use case ("this is a frozen quote"). No overload of `finding` or `change-log`.

**Cons (operator critique, decisive)**: encourages escape-hatch dependence. Every markdown citation becomes a "frozen quote" stored in the loop, but the loop's knowledge is still ultimately pointing OUTSIDE itself. The `excerpt` semantic *normalizes* the bad pattern instead of steering the agent to code. Adds schema, tool, tests.

### Position B: Reuse `finding` with `subtype: "internalization"` (rejected)

Extend `meta_state_report` with `persist: true` flag. Auto-promote to `status: "active"` on creation.

**Pros**: smallest schema change. Reuses finding infrastructure.

**Cons**: overloads "finding" semantically (a finding is reasoning, not content). Requires guard rails in `meta_state_derive_status` and `meta_state_query_drift` ("don't derive status for subtype=internalization"). Same escape-hatch critique as Position A.

### Position C: Reuse `change-log` with `change_dimension: "internalization"` (rejected)

Reuse change-log's existing immutable, `status: "active"`, no-TTL properties. `change_target` = source path, `change_dimension` = "internalization", `reason` = excerpt text.

**Pros**: zero schema cost.

**Cons**: overloads "change-log" (a change-log is a system modification, not content). 5 existing fields (`change_dimension`, `change_target`, `change_diff`, `reason`, `applies_to`) don't map cleanly. Severe semantic overload.

### Position D: Use existing `evidence_code_ref` + `mechanism_check` (CHOSEN)

No new entry kind. No new tool. The discoverability gap is real; the schema gap is not.

**Pros**:
- Zero schema cost.
- Existing infrastructure (`code_fingerprint` SHA-256, `meta_state_derive_status`, `meta_state_refresh_fingerprint`, `meta_state_check_grounding`) handles the "code changes" lifecycle already.
- Encourages code-pointed citations, which makes the loop self-contained.
- Discoverability fix is small (1 new `discoverability_hints` field on `loop_describe` warm tier).
- 2 active findings close via the same surface change.

**Cons**:
- Doesn't directly address the "no code yet" edge case. Mitigation: cite the change-log that records the design (option (i) below).
- The git-commit-hash extension to `evidence_code_ref` is punted. Mitigation: a future plan.

## Final Recommended Solution

### 1. Drop `records/meta/evidence/`

- Delete the directory. The 2 already-archived observations (`obs-mpef2h6z-9fefeed8` records-evidence, `obs-mpfnglt7-abac55c4` records-evidence-meta) stay archived.
- No other `records/meta/evidence/*.md` files remain in the tree (verified 2026-06-06: directory empty after the 2 archive updates).

### 2. Source-ref validator accepts `local:meta-state:<id>`

- File: `tools/learning-loop-mcp/core/source-ref-validator.js` (or wherever the validator lives — verify during cook).
- New accepted pattern: `local:meta-state:<id>` (any entry_kind, not just `finding`).
- New error message: *"source ref must be `local:meta-state:<id>` for citations; markdown refs (`local:plans/...`) are accepted for non-code references but discouraged. Use `meta_state_report` with `evidence_code_ref` to cite code."*
- Markdown refs remain accepted (escape hatch is not abolished, just discouraged).

### 3. `meta_state_report` description amended

- File: `tools/learning-loop-mcp/tools/meta-state-report-tool.js`.
- Add to the `description` field: *"Use this to internalize external references for `source_refs`. Prefer `evidence_code_ref` (code location) over markdown paths — the loop will hash the code and re-check it on demand via `meta_state_derive_status`."*

### 4. `loop_describe({ tier: "warm" })` gets a `discoverability_hints` field

- File: `tools/learning-loop-mcp/tools/loop-describe-tool.js` + `core/loop-introspect.js`.
- New field returns 4-6 hint strings, one per "thing the agent should know about itself":
  1. **Citation**: "To cite a thing, point at the code: `meta_state_report({ evidence_code_ref: 'path/to/file.js:line' })`. The loop will hash and re-check it."
  2. **Source ref**: "For `source_refs`, prefer `local:meta-state:<id>` (cite a finding). Markdown refs (`local:plans/...`) are accepted for the escape hatch but discouraged."
  3. **Grounding**: "Run `meta_state_derive_status({ id })` to re-check if a finding is still true. Run `meta_state_refresh_fingerprint({ id })` to re-hash the code after a refactor."
  4. **No-code edge case**: "For designs without code, cite the change-log that records the design (`meta_state_log_change` with `change_target: '<plan-path>'`)."
  5. **Status lifecycle**: "Findings have 5 statuses: `reported` (24h TTL), `active` (operator-acked), `resolved` (closed), `expired` (TTL elapsed), `superseded` (consolidated into a change-log)."

### 5. SessionStart hook prints the hints

- File: `.factory/hooks/loop-surface-inject.cjs`.
- Current: calls `loop_describe({ tier: "summary" })` (counts only).
- New: calls `loop_describe({ tier: "warm" })` and prints the `discoverability_hints` array (or the relevant subset) in the session-start block.
- Tie-breaker: the existing `summary` tier is ~1KB; the `warm` tier is 10-25KB. If context budget is a concern, gate the warm-tier call on a `DROID_DEBUG` or `LOOP_VERBOSE` env var, and default to `summary`. The handoff is ambiguous on this; the cook phase can decide.

### 6. Doc amendments

- **`AGENTS.md`**: add a new "Internalization rule" section (between "Budget-Check Rule" and "Side-Effect Import Rule"):
  > **Internalization Rule (source_refs)**
  >
  > To cite something in a record's `source_refs`:
  > 1. Prefer code-pointed findings: call `meta_state_report` with `evidence_code_ref: 'path/to/file.js:line'` and `mechanism_check: true`. The loop hashes the code and re-checks via `meta_state_derive_status`.
  > 2. If the citation has no code (pure design), log a change-log via `meta_state_log_change` and cite the change-log id from `source_refs`.
  > 3. As a last resort, `local:plans/...` / `local:docs/...` markdown refs are accepted but discouraged.
  >
  > Update the existing "Budget-Check Rule" parenthetical that mentions `meta_state_report` (no change needed; it's still accurate).

- **`docs/observation-vs-meta-state.md`**: add a new section "Internalization via Code-Pointed Findings" after the "Three Layers" table. Cite the rule from `AGENTS.md`. Replace any language that says "extract content → `records/meta/evidence/`" with the new flow.

- **`docs/philosophy.md`**: amend pillar 3 ("Evidence Is Source, Not Proof") with a new sentence: *"Internalize by pointing at the code, not by quoting the markdown. A code-pointed finding with `mechanism_check: true` is durable; a markdown citation is the escape hatch."*

### 7. Cold-session test (Approach 2, real subprocess spawn)

- New file: `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs`
- Pattern reference: `.factory/hooks/__tests__/loop-surface-inject-real-spawn.test.cjs` (the spawnAndCall chicken-egg fix's real-spawn test).
- Test logic:
  1. Spawn a fresh `droid` subprocess with `--no-config` + minimal stdin (real cold session, no prior context).
  2. Send a fixed prompt: *"Create a decision record that cites `plans/260605-superseded-status-and-discoverability/plan.md` for the resolution path. Use `record_create_decision`."*
  3. Capture the agent's tool-call log via subprocess stdout.
  4. Assert (in order):
     - The agent called `mcp__learning_loop_mcp__meta_state_report` *before* `record_create_decision`.
     - The `meta_state_report` call has `evidence_code_ref` set to a `.js` file path (not a `.md` path).
     - The `meta_state_report` call has `mechanism_check: true`.
     - The agent's `record_create_decision` call has `source_refs: ["local:meta-state:meta-<id>"]`.
     - The agent did NOT call any tool that writes to `records/meta/evidence/` (proves deprecation stuck).
     - The agent did NOT use `local:plans/...` in `source_refs` (proves the code-pointed rule is followed).
  5. The test runs in CI on every PR. Fails if any assertion breaks.
- **Trade-off**: spawns a real subprocess per CI run, requires `droid` CLI in CI env, ~30-60s per test. Pattern proven by the existing real-spawn test.
- **Mitigation for flakiness**: the test should have a generous timeout (60s), retry once on transient subprocess failure, and assert on the FINAL tool-call sequence (not the order, since some agents may interleave).

### 8. Mark the 2 active findings resolved

After the code + test land, call `meta_state_resolve` on:
- `meta-260601T1339Z-the-learning-loop-has-no-mechanism-to-surface-the-internaliz`
- `meta-260601T1339Z-agent-could-not-discover-the-meta-state-jsonl-registry-or-th`

Add a `meta_state_log_change` entry with `consolidates: <2 ids>` and a `reason` describing the resolution.

## Implementation Considerations and Risks

### Implementation surface (concrete file list)

| File | Change |
|---|---|
| `tools/learning-loop-mcp/core/source-ref-validator.js` | accept `local:meta-state:*`; new error message |
| `tools/learning-loop-mcp/tools/meta-state-report-tool.js` | description amendment |
| `tools/learning-loop-mcp/tools/loop-describe-tool.js` | add `discoverability_hints` to warm tier |
| `tools/learning-loop-mcp/core/loop-introspect.js` | new `buildDiscoverabilityHints()` function |
| `.factory/hooks/loop-surface-inject.cjs` | print hints on session start |
| `AGENTS.md` | new "Internalization Rule" section |
| `docs/observation-vs-meta-state.md` | new "Internalization via Code-Pointed Findings" section |
| `docs/philosophy.md` | pillar 3 amendment |
| `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` | new test (real subprocess spawn) |
| `tools/learning-loop-mcp/__tests__/loop-describe-warm-tier.test.js` | new test (asserts hints present) |
| `meta-state.jsonl` | mark 2 findings resolved + add 1 change-log entry |
| `records/meta/evidence/` | delete directory |

### Risks

1. **Cold-session test may flake in CI** if `droid` CLI is missing or hangs. Mitigation: graceful skip with `if (!existsSync('droid')) test.skip()`. Pattern reference: the real-spawn test handles this via `path` resolution.
2. **The `summary` → `warm` tier change in the SessionStart hook** may bloat context. Mitigation: gate on env var, default to `summary`. Open sub-decision for the cook phase.
3. **Some agents may still bypass** the rule via markdown refs (the escape hatch is still accepted). The validator's new error message guides but doesn't enforce. The cold-session test asserts the *desired* behavior, but a misbehaving agent could still cite markdown. This is the same risk as the existing 2 findings: the gate is meta-only, the agent does the work.
4. **The "no code yet" edge case** (pure design) requires the agent to remember to call `meta_state_log_change` first. The discoverability_hint about this is the only signal. Risk: the agent cites the change-log id but didn't actually log the change. Mitigation: the hint text is explicit ("cite the change-log that records the design").

## Success Metrics and Validation Criteria

### Primary: the cold-session test passes

The test in `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` must pass in CI. This is the canonical acceptance gate per the user's stated requirement: *"Automated: a cold-session test that asserts an agent finds meta_state_report + the internalization rule without prompting."*

### Secondary: the unit test for warm-tier hints

`tools/learning-loop-mcp/__tests__/loop-describe-warm-tier.test.js` asserts:
- The warm-tier output contains a `discoverability_hints` array.
- The array includes the citation hint, the source-ref hint, the grounding hint, the no-code hint, and the status-lifecycle hint.
- The citation hint mentions `meta_state_report` by name.
- The source-ref hint mentions the `local:meta-state:<id>` pattern.
- The grounding hint mentions `meta_state_derive_status`.

### Tertiary: the 2 active findings are marked resolved

- `meta-260601T1339Z-the-learning-loop-has-no-mechanism-to-surface-the-internaliz` → `status: resolved` via `meta_state_resolve`.
- `meta-260601T1339Z-agent-could-not-discover-the-meta-state-jsonl-registry-or-th` → `status: resolved` via `meta_state_resolve`.
- One `meta_state_log_change` entry with `consolidates: <2 ids>` and `reason: "Discoverability gap closed by Position D: code-pointed findings via existing evidence_code_ref + mechanism_check. See plans/reports/brainstorm-260606-discoverability-and-meta-evidence-migration.md"`.

### Anti-metric: the discoverability gap doesn't regress

- After the fix, the meta-state `query_drift` filter (or a new one) can check for "agent cited `local:plans/...` without first calling `meta_state_report`" — drift events of this kind should be 0.
- A future SP (SP4?) could add this as a queryable check.

## Open Questions / Follow-ups

1. **Git-commit-hash extension to `evidence_code_ref`** (operator's hint, punted). Extend the syntax to `path/to/file.js@commit_hash#L100-L120`. Captured as a follow-up plan. YAGNI for now; the existing SHA-256 fingerprint catches content changes.
2. **The 4 stale vnstock observations** (gate-flagged, not in scope of this report). They are domain state per `docs/observation-vs-meta-state.md`. The gate's date-based staleness check fires on them, but no actual state has changed (no new vendor activity since 2026-05-18). They stay as-is.
3. **`summary` vs `warm` tier in SessionStart hook** — context bloat vs discoverability. Open sub-decision for the cook phase.
4. **Records-cite-markdown fallback** — the validator still accepts `local:plans/...` for escape-hatch cases. Should a follow-up plan tighten this? YAGNI for now; the discoverability hint is the primary signal.
5. **The 2 archived observations** (`obs-mpef2h6z-9fefeed8`, `obs-mpfnglt7-abac55c4`) reference meta-state entries `meta-260529T1509Z-...` that pre-date the entry_kind extension. They are correct as historical audit trail; no action needed.

## Next Steps and Dependencies

### Immediate (cook phase in a follow-up session)

1. Read this report.
2. Run `/ck:plan --tdd` to produce `plan.md` with the 11 file changes from the Implementation Surface table.
3. Cook the plan in 3 phases:
   - Phase 1: schema + validator + meta_state_report description (small, ~2h)
   - Phase 2: discoverability_hints + loop_describe + SessionStart hook (~3h)
   - Phase 3: cold-session test + warm-tier test (~4h; real subprocess setup is the expensive part)
4. Run `meta_state_resolve` on the 2 active findings.
5. Add 1 `meta_state_log_change` entry with `consolidates: <2 ids>`.

### Dependencies

- The cook phase depends on the `droid` CLI being available in the CI environment for the cold-session test. If unavailable, the test should skip gracefully (not fail).
- The doc amendments are non-blocking; they can land in any phase or after the code lands.

### What NOT to do

- Don't add a new entry kind (Position A was rejected).
- Don't add a `meta_state_internalize` MCP tool.
- Don't extend `evidence_code_ref` to include git-commit-hash in this plan (punted).
- Don't touch the 4 stale vnstock observations in this plan (out of scope, no state change).

## References

- `meta-state.jsonl` lines 1-2 (the 2 active findings)
- `docs/journals/260606-discoverability-p2-handoff.md` (prior-session handoff)
- `docs/journals/260601-bridge-2-candidate-to-experiment-closeout.md` (origin journal for both findings)
- `plans/260605-superseded-status-and-discoverability/plan.md` (Phase 3 closed superseded_lineage; this report extends discoverability further)
- `plans/260602-strict-mcp-call-rules/plan.md` (origin of the SessionStart hook pattern)
- `docs/philosophy.md` pillar 3 (target for amendment)
- `docs/observation-vs-meta-state.md` (target for amendment)
- `AGENTS.md` § Budget-Check Rule (target for new Internalization Rule)
- `tools/learning-loop-mcp/core/meta-state.js` (evidence_code_ref + mechanism_check + code_fingerprint already in schema)
- `tools/learning-loop-mcp/tools/meta-state-report-tool.js` (target for description amendment)
- `tools/learning-loop-mcp/tools/loop-describe-tool.js` (target for discoverability_hints)
- `tools/learning-loop-mcp/core/loop-introspect.js` (target for hint construction)
- `.factory/hooks/loop-surface-inject.cjs` (target for warm-tier hint surfacing)
- `.factory/hooks/__tests__/loop-surface-inject-real-spawn.test.cjs` (pattern reference for real-spawn test)

## Sign-Off

- Session: 2026-06-06 ~03:30-04:30 (UTC+7)
- Operator: dat9uy
- Status: Design accepted. Plan is a follow-up session.
- Next session command: read this report → `/ck:plan --tdd` → cook in 3 phases.
