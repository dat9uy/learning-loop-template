# Brainstorm — Meta-state relationship modeling: agent affordance + legacy migration

**Status**: APPROVED (operator-confirmed, 2026-06-10)
**Source session**: `c319eb97-a5d7-44ee-a7e1-fe39e56baf6e` (meta-state refresh-loop circuit-breaker plan)
**Related plan**: `plans/260610-1535-meta-state-reopen-path/` (status: completed as of 2026-06-10; closed in this same session)

## Problem statement

The 2026-06-10 session bug exposed two distinct gaps in the meta-state relationship modeling, neither of which is closed by the existing `reopen-path` plan (it shipped the *mechanism* but did not ship the *agent affordance* or the *legacy migration*).

**Gap 1 — Agent uses description-prose instead of structured fields.**
When the operator said "add the new finding about the cold-session note, relation with `meta-260608T1522Z` and `meta-260608T1618Z`", the agent:
- Created the new finding via `meta_state_report` with a description that *mentions* the two prior IDs in prose.
- Did **not** set `reopens: ['...1522Z', '...1618Z']` on the new entry — even though the field exists in the schema and the discoverability hint points at it.
- Did **not** use `meta_state_relationships` to verify the relationship, or `meta_state_resolve({cascade_from})` to close the parents.

Root cause: `meta_state_report`'s handler (`tools/learning-loop-mcp/tools/meta-state-report-tool.js`) destructures only 8 fields. The `reopens` field is in the schema but the handler silently drops it on input. The agent has no path to set it even when it tries.

**Gap 2 — 13 legacy `expired` findings cannot be transitioned to `stale`.**
The 13 `expired` findings predate the `stale` status redesign (`plans/260609-stale-flag-redesign/`, completed). The `stale` status is in the enum (`core/meta-state.js:43`) and `checkExpiry()` (line 491) returns `"stale"` for past-TTL `reported` entries — but only for `reported`. There is no path from `expired` to `stale`: `meta_state_resolve` rejects `expired` as already-terminal (unless `cascade_from` is provided with a reopens child), and `meta_state_sweep` does not touch `expired`. The 13 legacy entries cannot be re-verified via `meta_state_re_verify` because that tool operates on `stale`, not `expired`.

These two gaps are co-occurring symptoms of the same root: **the structural relationship surface exists in code, but the loop's affordances (tool handlers, prompt hints, consultation gates) do not yet push the agent to use it, and the legacy data cannot be migrated to the new lifecycle.**

## Why this is a real problem, not bikeshedding

The loop's self-model is the substrate that the operator queries via `loop_describe({tier: "cold"})` and `meta_state_relationships`. When the agent stuffs cross-references into `description` prose, the inverse-indexes (`addresses_inverse`, `reopens_inverse`, etc.) miss them. The queryable self-model becomes a partial model.

Concretely:
- `meta_state_relationships({id: 'meta-260608T1522Z...', direction: "inbound"})` returns `reopened_by: []` even though the new `meta-260610T2301Z` is conceptually re-surfacing it.
- `buildInverseIndexes(entries).reopens_inverse.get('meta-260608T1522Z...')` is undefined.
- The cold-tier `top_references` does not count the actual reuse of prior findings.
- Operator querying "is finding X still relevant?" gets a partial answer.

## Non-negotiable constraints

1. **No new entry kinds.** The 4-member discriminated union is frozen.
2. **JSONL remains the only writer.** No SQLite migration in this round.
3. **Backward compat.** Existing entries without `reopens` (e.g., the 13 legacy `expired` ones) must validate and be migratable.
4. **Operator remains the authority on self-learning.** No auto-sweep that migrates `expired` to `stale` without an operator tool call. (Per the user's explicit answer in the 260610-2100 brainstorm session: "(a) Leave them, agent migrates on touch via the new tool".)
5. **KISS.** The plan for `260610-1535` already shipped `reopens` and `cascade_from`. This plan layers *affordance* on top of that, not parallel mechanism.

## Evaluated approaches

### Approach A — Minimal: 2 small tools + 1 prompt hint (RECOMMENDED)

**What it ships:**
1. `meta_state_report` handler: destructure `reopens: z.array(z.string()).optional()` and persist to entry. (~8 lines.)
2. `meta_state_report` description update: add the `reopens` callout.
3. New tool: `meta_state_migrate_expired_to_stale` — single-id operator transition. Schema `{ id: z.string() }`, validates `entry_kind === 'finding'` + `status === 'expired'` + past-TTL, stamps `last_verified_at: now`, `version: entry.version + 1`, `status: 'stale'`, `expires_at: null`. Returns the new entry shape. (~40 lines + tests.)
4. New tool: `meta_state_relationship_validate` — read-only lint. Input `{ description: z.string(), entry_id?: z.string() }`. Scans description for finding-id patterns. If any referenced id is `expired` or `stale` and the new entry does not declare a structural field referencing it, return `{ warned: true, orphans: [...], suggestion: 'pass reopens: [...]' }`. Pure read; safe to call repeatedly. (~50 lines + tests.)
5. Add an 11th discoverability hint about reopens + migration (per `ck:context-engineering` decision: tool descriptions first, hint array second, no replacement of existing hints). Canonical `core/loop-introspect.js` already ships 10 hints (the 9 pre-existing + the 260610-1535 `reopens` hint at line 97); the new hint lands at index 10. The `.factory/hooks/loop-surface-inject.cjs` mirror is currently at 6 hints (drifted since 260610-1535 missed the backfill) and must backfill hints #7–#10 from canonical before adding the 11th.
6. `meta_state_resolve` cascade branch: delegates to `meta_state_migrate_expired_to_stale` (one primitive, two callers). The cascade is a state-machine transition, not a resolve — so it sidesteps the `resolution-evidence-required` consult-gate. Normal `meta_state_resolve` paths still go through the gate.
7. E2E use case test: the cold-session scenario from session c319eb97, replayed with the new affordance, asserting `reopens` populated, `reopens_inverse` populated, and `meta_state_relationships` returning the correct inbound.

**Pros:**
- Closes both gaps in 1 plan.
- ~280 lines added (matches the existing plan's complexity budget).
- E2E test gives the agent a concrete scenario to follow.
- Backwards compatible (`.optional()` on the zod schema; the migrate tool only acts on `expired`).

**Cons:**
- `meta_state_migrate_expired_to_stale` is a single-id tool. Bulk migration of the 13 needs a loop (the agent runs it 13 times). Operator chose this explicitly.
- `meta_state_relationship_validate` is advisory (warn, not block). If the agent ignores warnings, the gap reappears. Mitigation: warm-tier hint + tool description should make ignoring it costly.

### Approach B — Bridge-1-style: full agent extraction

Auto-detect related findings from description text via LLM, populate `reopens` automatically. This is the `Bridge 1` (Doc → candidate assertion) ambition: "humans hand-author evidence from doc reading; no candidate-extraction tool."

**Pros:** Closes the agentic gap forever.

**Cons:** Bridge 1 is explicitly "Not shipped" per `docs/trajectory.md`. Adopting it here would be the entire Bridge 1 project, not a side fix. The user said "this is agentic, not deterministic" — Approach B inverts that.

**Verdict:** Reject. Wrong abstraction level for this gap.

### Approach C — Big bang: super-tool with consult-gate

Replace `meta_state_report` with a `meta_state_record` super-tool that takes `entry_kind`, all fields, and applies consult-gates that block the call when `description` references an id but no structural field is set.

**Pros:** Hard enforcement.

**Cons:** Violates KISS. The user explicitly said "this is agentic, not deterministic; warn only". A hard block would cause agent retries on perfectly valid reports. Also renames a 4-week-old stable tool surface.

**Verdict:** Reject. Hard-blocking when the user wants warn-only is the wrong knob.

### Rejected alternative — Fold into plan 260610-1535 as Phase 5

**Pros:** one plan, less plan sprawl.

**Cons:** plan 260610-1535 is already 4 phases with 12 locked decisions and ~280 lines of approved scope. Bolting on migration + consult-gate changes its scope and would require a re-brainstorm. Plan sprawl is a feature here — atomic scope per plan. 260610-1535 is *done*; reopening it for adjacent work muddies the audit trail.

**Verdict:** Reject. New plan, new directory.

### Rejected alternative — Pure deterministic relationship routing

The agent extracts the relationship from description text and routes deterministically. **Cons:** relationship intent is genuinely ambiguous from prose; routing needs context. Operator confirmed in this brainstorm that routing stays agentic. **Verdict:** Reject.

### Rejected alternative — Auto-sweep migrates `expired` to `stale`

Zero-touch cleanup. **Cons:** operator-capture risk per `AGENTS.md`; the operator is the authority on what the loop is allowed to learn about itself. **Verdict:** Reject.

### Rejected alternative — Fold `relationship_validate` into `meta_state_report` response

Extend `meta_state_report` to return `{warnings: [...], orphans: [...], unknown_refs: [...]}` after a successful write, instead of a separate tool. **Pros:** one less MCP tool, no separate `readRegistry` call, response is a natural extension. **Cons:** the lint needs to be re-runnable post-write for self-check (the report's "Plan-time decision" on `entry_id` self-check), and the warnings are not action-blocking. A response-only shape is not re-callable. **Verdict:** Reject. The standalone tool is the right surface for a re-runnable lint.

### Rejected alternative — Make `migrate_expired_to_stale` a guarded `meta_state_patch`

`meta_state_patch` already has CAS semantics and the patchability matrix; a thin wrapper could enforce `entry.status === "expired"` and call `patch({status: "stale", expires_at: null, last_verified_at: now, _expected_version})`. **Pros:** one less MCP tool, reuses CAS, no new audit-log path. **Cons:** the precondition (status === expired AND past-TTL) is exactly the kind of state-machine guard that `meta_state_patch` is explicitly *not* — patch is a generic field-mutation primitive. Adding guards to patch would bloat it. **Verdict:** Reject. The new tool is a state-machine transition (its own primitive); patch stays generic.

### Naming consistency (decision)

The peer verb family is: `meta_state_re_verify` (verb), `meta_state_check_grounding` (verb), `meta_state_refresh_fingerprint` (verb), `meta_state_sweep` (verb), `meta_state_archive` (verb). The proposed `meta_state_migrate_expired_to_stale` reads as a noun phrase, not a verb. Two alternatives were considered:

- `meta_state_reopen_expired` — verb-led, matches the family. Loses the destination (`stale`).
- `meta_state_revive_expired` — verb-led, slightly less specific. Loses the destination.

**Decision: keep `meta_state_migrate_expired_to_stale`.** The destination is load-bearing for the operator's mental model (the tool is *for* the new lifecycle, not just a status bump) and the name is unambiguous in a way the verb-only alternatives are not. The deviation from the verb family is documented here.

## Deprecation note (lifecycle of `expired`)

`expired` is the legacy terminal status, kept in the schema enum (`core/meta-state.js:43`) for backward compat. The operator-curated discoverability hint at `core/loop-introspect.js:96` already calls it out: *"expired (legacy — kept for backward compat; new TTL semantics use stale)"*. `TERMINAL_STATUSES` (`core/meta-state.js:7`) includes `expired` and **deliberately excludes** `stale` so the new status remains re-verifiable.

**This plan does not remove `expired` from the enum.** Removing it is a schema-breaking change that would (a) require a `readRegistry` coercion fallback for any in-flight historical reads (the loop already does this for other legacy coercions; see `__tests__/meta-state-schema.test.js:397-412` "readRegistry coerces legacy entries"), (b) warrant its own plan + change-log entry, and (c) be premature while any `expired` entry still lives in the registry.

**This plan ships the migration tool. The 13 legacy `expired` entries are the catalyst for that tool, not the trigger for enum removal.** When 0 `expired` entries remain in the registry, a *future* plan may propose enum removal as a separate schema-breaking change.

### Lifecycle confirmation (locked at brainstorm time)

The full state machine for `entry_kind: "finding"`:

```
reported ──(operator ack)─────────────────────────────▶ active
   │
   └─(past expires_at, never acked)───────────────────▶ stale
                                                          │
                                                          ├─(meta_state_re_verify, all steps pass)──▶ active
                                                          │
                                                          ├─(operator meta_state_resolve)────────────▶ resolved
                                                          │
                                                          ├─(operator meta_state_supersede)──────────▶ superseded
                                                          │
                                                          └─(meta_state_sweep past STALENESS_WINDOW_MS)─▶ derived-stale (cosmetic; status field stays stale)

active ──(operator meta_state_resolve)────────────────▶ resolved
active ──(operator meta_state_supersede)──────────────▶ superseded

expired ──(operator meta_state_migrate_expired_to_stale)─▶ stale   ← THIS PLAN
                (one-way, no rollback; `expired` is terminal-locked,
                 `stale` is the new open re-verifiable state)
```

**Key invariants:**

1. `expired` is the legacy terminal. `stale` is the new re-verifiable open. They are not on the same axis.
2. The migration tool is **one-way**: `expired` → `stale` only. No `stale` → `expired` reverse (downgrade would re-lock a now-re-verifiable entry).
3. The migration tool **clears `expires_at`** (24h TTL no longer applies) and **stamps `last_verified_at: now`** (freshness anchor for the new 7-day `STALENESS_WINDOW_MS` at `core/meta-state.js:9`).
4. The cascade branch in `meta_state_resolve` is **not a resolve** — it is a delegated `meta_state_migrate_expired_to_stale` triggered as a side effect of a child's reopen. One primitive, two callers. The new finding's reopen is `active` or `resolved`; the parent emerges as a fresh `stale` ready for operator re-verify.
5. After migration, `resolved` is reachable from `stale` (or `active`), **not** from `expired` directly. This is the semantic that makes the migration a real bridge, not a rename.

## Final recommended solution (Approach A)

### Concrete changes

| File | Change | Lines |
|------|--------|-------|
| `tools/learning-loop-mcp/tools/meta-state-report-tool.js` | Destructure + persist `reopens`. Update description. | +8 / -0 |
| `tools/learning-loop-mcp/tools/meta-state-migrate-expired-to-stale-tool.js` (new) | Single-id `expired` → `stale` operator tool. Reuses `checkExpiry()` (`core/meta-state.js:482-492`) for the past-TTL precondition instead of re-implementing the math. | +60 / -0 |
| `tools/learning-loop-mcp/tools/meta-state-relationship-validate-tool.js` (new) | Read-only lint that warns when description references orphan ids. | +80 / -0 |
| `tools/learning-loop-mcp/tools/meta-state-resolve-tool.js` | Cascade branch **delegates to** `meta_state_migrate_expired_to_stale` (not a resolve). The migration primitive is a state-machine transition and does not pass through the `resolution-evidence-required` consult-gate. Normal resolves still go through the gate. | +6 / -2 |
| `tools/learning-loop-mcp/core/loop-introspect.js` | Add 11th hint about reopens + migration (index 10; canonical already has 10). Add `meta_state_migrate_expired_to_stale` + `meta_state_relationship_validate` to discovery tool listing. | +5 / -0 |
| `.factory/hooks/loop-surface-inject.cjs` | Backfill hints #7–#10 (currently drifted; hook has 6, canonical has 10) **and** add the 11th hint. Hook lands at 11 to match canonical. | +30 / -0 |
| `tools/learning-loop-mcp/agent-manifest.json` | Add 2 new tools to `meta_state` group. | +2 / -0 |
| `__tests__/meta-state-report-tool-extension.test.js` | T11–T13: `reopens` round-trip, omitted, invalid rejection. | +35 / -0 |
| `__tests__/meta-state-migrate-expired-to-stale-tool.test.js` (new) | 5 scenarios: happy, wrong status, wrong kind, not-past-TTL, missing entry. Asserts reuse of `checkExpiry()` (not re-implemented TTL math). | +90 / -0 |
| `__tests__/meta-state-relationship-validate-tool.test.js` (new) | 4 scenarios: orphan id + no field, orphan id + field set, no ids, mixed. | +70 / -0 |
| `__tests__/loop-describe-warm-tier.test.js` | Bump hint count 10 → 11. Add substring assertion for the new hint. | +3 / -1 |
| `__tests__/cold-session-discoverability.test.cjs` | Same hint-count bump (10 → 11). | +2 / -1 |
| `__tests__/meta-state-resolve-cascade.test.js` (or existing) | Assert cascade of `expired` writes `stale` via the migration primitive; assert cascade does NOT pass through `resolution-evidence-required` gate. | +20 / -0 |
| `__tests__/meta-state-reopen-e2e-cold-session.test.cjs` (new) | E2E use case: gated on `GATE_ROOT` override OR `if (process.env.SKIP_REAL_REGISTRY_TESTS !== '1') return;` after asserting the 2 fixture IDs do not already exist in the live registry. Replay the session-bug scenario, assert `reopens` + `reopens_inverse` + `meta_state_relationships` all reflect the relationship. | +75 / -0 |

**Total: ~440 lines added, 5 files modified, 4 files added, 0 new dependencies.**

### E2E use case (cold-session)

The plan ships a test that reproduces the cold-session scenario from session c319eb97 as the canonical agent test:
1. Setup: pre-create 2 `expired` findings (`meta-260608T1522Z...`, `meta-260608T1618Z...`) with the exact descriptions from the live registry.
2. Action: agent (test mode) calls `meta_state_relationship_validate({ description: '...new finding description with both ids...' })`. Returns `warned: true, orphans: [...]`.
3. Agent follows the suggestion: calls `meta_state_report({ ..., reopens: ['...1522Z', '...1618Z'] })`.
4. For each expired finding, agent calls `meta_state_migrate_expired_to_stale({id: '...'})`.
5. Agent calls `meta_state_relationships({id: '...1522Z', direction: "inbound"})` → returns `reopened_by: ['<new_finding_id>']`.
6. Assertions: `reopens_inverse` has both old ids mapped to the new id; `loop_describe({tier: "cold"})` includes the new finding in `top_references`.

This gives the agent a concrete "what to do when the user says X is related to Y" script.

### Live-registry fixtures (E2E test)

The E2E test needs the 2 specific `expired` findings that the original session-bug scenario used. Both must be enumerated for the test to be unambiguous:

| ID | Original description (live registry) | Notes |
|---|---|---|
| `meta-260608T1522Z-cold-session-discoverability-...` | (read from `meta-state.jsonl` at test setup; do not hard-code in test) | The 260610-1535 E2E test already references this id; the new test reuses it. |
| `meta-260608T1618Z-cold-session-discoverability-...` | (read from `meta-state.jsonl` at test setup) | Same precedent. |

**Test isolation strategy**:
- The test runs only when the operator opts in via `META_STATE_E2E=1` (gating matches 260610-1535's `SKIP_REAL_REGISTRY_TESTS=1` opt-out pattern, with the opposite default).
- Before the test mutates the live registry, it asserts that the 2 IDs do not already exist. If they do, the test aborts with a clear "live registry already has these ids; rerun with `META_STATE_E2E=1` to allow mutation, or update the test to use temp copies via `GATE_ROOT`".
- After the test, it cleans up the 3 entries it created (2 expired fixtures restored, 1 new finding removed).

This is the same shape as 260610-1535 Phase 4's gated integration test. The ID enumeration is the only addition; the gating pattern is reused.

### Backlog policy

No bulk migration of the existing 13 expired findings. They will be migrated one-by-one as the agent touches them via the new tool. The plan records this decision in its decisions section. (Per the user's explicit answer in the brainstorm session.)

**Completion criterion**: the plan is **complete** when 0 `expired` entries remain in the registry. The operator still chooses *when* to migrate each one, but the plan's bar is *all gone*. The new tool is the only mechanism (no auto-sweep). A `loop_describe` warm-tier warning surfaces the backlog while it persists: when `expired_count > 0` or `expired.oldest_age > 7d`, the warm tier emits a `pending_expired_migration` advisory line in the `discoverability_hints` block.

## Scope boundary (out of scope)

- `addresses` and `source_refs` on `meta_state_report` input. Per the user's answer, only `reopens`. (Both fields are settable via `meta_state_propose_design` and schema-level patches respectively, but the report tool stays minimal.)
- Bulk archive tool for `expired` findings. (The user wants individual migration on touch.)
- `meta_state_sweep` auto-migration of `expired` to `stale`. (Operator authority on self-learning.)
- New consult-gate that blocks report when relationship is missing. (Warn only.)
- Adding `reopens` to `summarize()` compact view. (YAGNI for this round; can be a 1-line change at `core/loop-introspect.js:392` if needed later.)

## Success metrics

- [ ] `meta_state_report({reopens: [...]})` persists `reopens` on the entry; cold-tier `reopens_inverse` reflects it.
- [ ] `meta_state_migrate_expired_to_stale({id})` works on the 13 currently-expired findings (one-by-one, operator-confirmed).
- [ ] **`expired` count in the registry reaches 0 after the backfill** (this is the deprecation milestone; a future plan may then propose enum removal).
- [ ] `meta_state_relationship_validate` returns a `warned: true` for the cold-session scenario from c319eb97 with both old ids as `orphans`.
- [ ] All 930 existing tests pass; new tests bring total to ~970.
- [ ] `pnpm test:cold-session` passes (the L2 probe flakiness aside).
- [ ] No regressions to `meta_state_resolve` operator gate; the normal-resolve path still runs through the `resolution-evidence-required` consultation. The cascade path bypasses it (because it delegates to a state-machine transition, not a resolve).
- [ ] E2E cold-session replay test passes; documents the agent's script for "X is related to Y" prompt patterns.
- [ ] The 11th discoverability hint (reopens + migration) is present in **both** `core/loop-introspect.js` and the `.factory/hooks/loop-surface-inject.cjs` mirror; hint count assertion bumps from 10 to 11 in both `cold-session-discoverability.test.cjs` and `loop-describe-warm-tier.test.js`.
- [ ] The hook-mirror is backfilled to match the canonical list (current drift: hook is missing hints #7–#10 from `loop-introspect.js`); the next session-start hint count test catches a stale hook.

## Risks + mitigations

| Risk | Mitigation |
|------|-----------|
| `meta_state_relationship_validate` ignores by agent | Warm-tier hint + tool description + E2E test makes the script a pattern the agent is graded on. |
| `expired` → `stale` migration in `meta_state_resolve` cascade is a semantic shift | Document the shift in the tool description; treat `stale` as the new "open" terminal (re-verify via `meta_state_re_verify`). The cascade delegates to the migration primitive and sidesteps the consult-gate; normal resolves still go through it. |
| `reopens` schema accepts arbitrary strings | Validate each entry on the report side: each id must exist in the registry. If not, return `warned: true` with `unknown_refs: [...]`. |
| 13 `expired` findings pile up because no agent touches them | Add a `loop_describe` warm-tier warning when `expired_count > 0` and `expired` oldest is > 7 days. Operator sees it every session. |

## Next steps

1. Operator approves this brainstorm.
2. Run `/ck:plan --tdd` with this report as context. Produces `plans/260610-2100-meta-state-relationship-modeling/plan.md` with the 5-phase TDD layout.
3. Phase 1: `reopens` field on `meta_state_report` (TDD red → green).
4. Phase 2: `meta_state_relationship_validate` (TDD red → green).
5. Phase 3: `meta_state_migrate_expired_to_stale` (TDD red → green).
6. Phase 4: E2E cold-session replay test + discoverability hint.
7. Phase 5: `meta_state_resolve` cascade `stale` shift + final test sweep.
8. **Backfill milestone**: confirm `expired` count = 0 in the registry before plan close. The migration tool exists; the backlog is operator-side work. If non-zero at close, plan is not complete.
9. After all phases ship: commit + close plan + journal.

## Open questions for operator (resolved at brainstorm time, captured for plan-time reference)

1. **Plan structure**: independent new plan at `plans/260610-2100-meta-state-relationship-modeling/`, or fold migration + consult-gate into `260610-1535` as Phase 5? **Decision: independent.** 260610-1535 is closed; reopening it muddies the audit trail.
2. **E2E test scope**: real-registry gated (matches 260610-1535 phase 4 pattern with `SKIP_REAL_REGISTRY_TESTS=1` opt-out), or pure unit test with temp `GATE_ROOT`? **Decision: real-registry gated** — the E2E test is the proving ground; gating it matches the precedent and gives the agent a real-registry script to follow.
3. **Hint surface**: 11th hint in both `core/loop-introspect.js` AND `.factory/hooks/loop-surface-inject.cjs` mirror, or only the canonical (and let the hook drift again)? **Decision: both surfaces.** The hook has been drifting; the next session-start hint count test will catch a stale hook. Bump in both places.

## Decisions log

Two tables: brainstorm-time (operator-confirmed) and plan-time (derived at plan-time, may be revisited if the plan red-teams itself).

### Brainstorm-time (operator-confirmed, locked)

| Question | Resolution | Source |
|----------|------------|--------|
| Which relationship fields on `meta_state_report`? | `reopens` only. `addresses` and `source_refs` have their own tools. | User answer 1 |
| Routing rule for "X is related to Y"? | Agentic. The agent reads related records, confirms with operator, calls the right MCP tool. No deterministic consult-gate. | User answer 2 |
| How to clean up legacy `expired` findings? | Don't bulk-migrate. Agent migrates on touch via the new tool. The 13 backlog persists; the loop-design circuit-breaker is the E2E use case. | User answer 3 |
| Should consult-gate block missing relationship? | Warn only. No hard block. The deterministic part is *validation*, not creation. | User answer 4 |
| Where to add the prompt hint? | Tool description first (zero extra context cost). Hint array second (testable). | ck:context-engineering |
| Backlog policy for the 13 currently-expired findings? | Leave them. Migrate one-by-one on touch. | User answer 1 (re-confirmed) |

### Plan-time (derived, may be revisited at plan time)

| Question | Resolution | Source |
|----------|------------|--------|
| Hint count delta | 10 → 11 (not 9 → 10). Canonical `core/loop-introspect.js` already has 10 (260610-1535 shipped the 9th `reopens` hint at line 97, plus 1 more in 260610-1535's subsequent additions). | Scout (gap #1) |
| Cascade resolve semantic for `expired` parent | Cascade branch **delegates to** `meta_state_migrate_expired_to_stale` (one primitive, two callers). It is not a resolve — the parent emerges as a fresh `stale` ready for `meta_state_re_verify`. | Plan-time decision |
| Cascade does NOT pass through `resolution-evidence-required` consult-gate | The migration primitive is a state-machine transition, not a resolve, so it sidesteps the gate. Normal `meta_state_resolve` paths still go through the gate. The gate's input shape is unchanged. | Scout (gap #9) |
| Migration tool direction | **One-way**: `expired` → `stale` only. No `stale` → `expired` reverse. Clears `expires_at`; stamps `last_verified_at: now` (freshness anchor for `STALENESS_WINDOW_MS` = 7 days, `core/meta-state.js:9`). | Plan-time decision |
| `expired` enum deprecation | `expired` stays in the schema enum (backward compat). Removal is a future, separate schema-breaking change. Plan's bar is `expired` count = 0 in the registry, not enum removal. | Plan-time decision |
| Plan completion milestone | Plan is complete when `expired` count = 0 in the registry, *not* when the migration tool ships. The tool is the means; the empty backlog is the end. | Plan-time decision |
| Hook-mirror backfill scope | Plan backfills hints #7–#10 currently missing from `.factory/hooks/loop-surface-inject.cjs` (canonical has 10, hook has 6), plus the new 11th hint. Hook lands at 11 to match canonical. | Scout (gap #3) |
| Should `meta_state_relationship_validate` accept `entry_id` for self-check? | Yes. Optional. Lets the agent call it after `meta_state_report` to confirm the entry it just wrote is well-formed. | Plan-time decision |
| Why `migrate_expired_to_stale` is a separate tool, not a `meta_state_report` response extension | The lint needs to be re-runnable post-write (for self-check); a response-only shape is not re-callable. | Scout (gap #6) |
| Why `migrate_expired_to_stale` is a separate tool, not a guarded `meta_state_patch` | The precondition (status === expired AND past-TTL) is a state-machine guard; patch is a generic field-mutation primitive that should not carry guards. | Scout (gap #7) |
| Naming deviation from peer verb family | Kept `meta_state_migrate_expired_to_stale` (noun phrase) over `meta_state_reopen_expired` (verb). The destination is load-bearing for the operator's mental model. | Scout (gap #11) |
| TTL math in `migrate_expired_to_stale` | Reuses `checkExpiry()` from `core/meta-state.js:482-492` instead of re-implementing past-TTL check. | Scout (gap #2) |
| E2E test gating | Gated on `META_STATE_E2E=1` opt-in; asserts the 2 fixture IDs do not already exist in the live registry; cleans up after. Reuses 260610-1535 Phase 4 pattern. | Scout (gap #8, #12) |
