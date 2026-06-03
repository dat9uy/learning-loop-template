# SP1 Derive-Status Planning Journal

**Date:** 2026-06-02
**Mode:** `ck:plan --hard --tdd`
**Plan:** `plans/260602-sp1-derive-status/plan.md` (5 phases, 36 new tests, target total 511)
**Brainstorm:** `plans/reports/brainstorm-260602-sp1-derive-status.md` (status: locked)
**Parent doc:** `plans/reports/brainstorm-260602-meta-state-agent-affordances.md`

## What This Session Did

Implemented the planning phase for SP1 (derivation query) — the second of 4 sub-projects in the agent self-management of meta-state decomposition. SP0 (self-modification affordance) shipped earlier today. SP1 adds the verifier that lets the agent ask "is this finding still true?" via `meta_state_derive_status({ id, run_tests? })`.

### Steps taken

1. **Inbound state gate verification.** The session opened with a state-change signal flagging 4 stale vnstock observations (`observation-vnstock-device-slot-ledger`, `observation-vnstock-import-reactivates-cleared-device`, `observation-vnstock-resource-budget`, `observation-vnstock-side-effect-import`). These observations are about the vnstock vendor SDK (device-slot ledger, import reactivation, budget, side-effect import). SP1 is purely about meta-state derivation with **zero vnstock touchpoints**: no vendor SDK imports, no `product/**` writes, no docker/sudo/package-manager commands, no budget check needed. Verified: observations are not relevant to this task. Proceeded without updating them (the gate verifies relevance, not freshness for unrelated observations).

2. **Cross-plan scan.** SP0 (`260602-sp0-log-change`) is `completed`. Self-enforcing-loop and meta-state-lifecycle-tidy are `completed`. SP2 (grounding) and SP3 (drift aggregation) are not started; SP1 unblocks them. No in-flight cross-plan dependencies.

3. **Pre-plan verification (researcher #1).** Spawned a `worker` subagent to verify the locked design against the actual codebase. The verification report surfaced **3 CRITICAL findings + 10 lower-severity findings**, all folded into the plan as "Design Clarifications":

   - **C-1 (CRITICAL):** the design reads `entry.evidence_code_ref` (top-level, per the SP0 zod schema), but 8 of 18 existing findings store the code_ref in a nested `evidence: { code_ref, journal }` shape (per the pre-SP0 write path). **Mitigation:** pure function reads `entry.evidence_code_ref ?? entry.evidence?.code_ref` (legacy fallback).

   - **C-2 (CRITICAL):** the acceptance-test entry ID in the design is the full 84-char slug; the actual ID is truncated to 60 chars per `core/slugify.js:slice(0, 60)`. **Mitigation:** acceptance test uses `entries.find(e => e.description.includes("internalization rule"))` (SP0's `sp0-change-log-self-log.test.js` pattern) rather than hardcoding the ID.

   - **C-3 (CRITICAL):** the change-log fast path uses `kind: "not-derivable"` and `derived_status: "active"`, neither in the locked 4+3 enums. **Mitigation:** **reuse locked values** (no lock change) — fast path returns `kind: "no-signals"` and `derived_status: "active-no-signal"`. Semantically defensible (change-logs have no `evidence_code_ref`).

   Plus 7 lower-severity findings (H-1 through L-3) all addressed in the plan with concrete mitigations (test additions, code comments, contract clarifications). The 12 added unit tests + 2 added tool tests = 14 new tests beyond the design's 20 bring the total to 36 new (24 unit + 10 tool + 2 acceptance = 511 passing).

4. **Codebase analysis.** Read the SP0 plan + 5 phase files (the proven pattern), `core/meta-state.js` (registry + schemas), `core/slugify.js` (ID truncation context), 3 sibling tool files (the wrapper pattern), `tools/manifest.json` (registration convention), `tools/lib/gate-logging.js` (gate log pattern), `tools/lib/resolve-root.js` (root resolution). Confirmed: SP1's structure mirrors SP0 exactly.

5. **Plan creation.** Wrote `plan.md` + 5 phase files (`phase-00` through `phase-04`) via the `Create` tool (AGENTS.md fallback for the G8 subcommand-class false positive on `ck plan create`). Plan structure:
   - Phase 0: G8 observation + scaffolding (operational, no code)
   - Phase 1: Pure function `deriveStatus` (TDD, 24 unit tests)
   - Phase 2: MCP tool `meta_state_derive_status` (TDD, 10 tool tests)
   - Phase 3: Manifest registration (1 line modify)
   - Phase 4: Acceptance test on real finding + first real use (2 smoke tests)

6. **Whole-plan consistency sweep.** Reconciled test counts (36 new / 511 total, not 34 / 509 as initially drafted). All references to the test count are now consistent across `plan.md` and the 5 phase files. No unresolved contradictions.

### Notable design refinements (not in the brainstorm)

- **L-1 (LOW):** the brainstorm's acceptance test example shows `drift: false` for a case where the drift definition says it should be `true`. Treated as a typo in the brainstorm; the plan asserts `drift: true` for `raw_status: "active"` + `derived_status: "resolved-by-mechanism"`. The 4 unit tests in T-12 (drift: true when mechanism shipped + raw_status non-terminal), T-19 (drift: false when mechanism shipped + raw_status terminal), T-20 (drift: false when kind is code-missing/code-only) lock in the drift semantics.

- **H-1 (HIGH):** `log_drift` recommendation trigger is the converse of the drift boolean. The plan keeps the locked 4-value enum (no lock change) but locks in the trigger with a unit test using a terminal-status entry. SP3 (drift aggregation) is where drift patterns actually surface.

- **H-2 (HIGH):** the function claims "pure" but calls `new Date()` internally. The plan injects `codeContext.now: () => number` (default `() => Date.now()`), making the function deterministic given inputs. The 3 unit tests T-14, T-15, T-16 lock in the determinism.

- **H-3 (HIGH):** the test-runner integration boundary between pure function and tool was undefined. The plan defines: `codeContext.test_passed?: boolean | null` is an input to the pure function (passed through to `signals.test_passed`); the tool computes it via subprocess + cache. The 2 unit tests T-17, T-18 lock in the boundary.

## What This Session Did NOT Do

- No edits to `meta-state.jsonl` (no new entries recorded; G8 did not recur).
- No code changes (planning only; cook will implement).
- No `/ck:cook` invocation.
- No `ck plan create` invocation (G8 fallback used).
- No schema migration. The function reads `entry.evidence_code_ref ?? entry.evidence?.code_ref` (legacy fallback) without modifying the schema. The 15 legacy entries (per the SP0 readRegistry coercion) plus 3 newer entries with the new shape load correctly.

## Cross-Plan Status (cumulative, 2026-06-02)

- **SP0 (Self-Modification Affordance) — SHIPPED.** `plans/260602-sp0-log-change/plan.md` (status: completed). 5 phases, 36 new tests (475 → 511... wait, that's now SP1's number; SP0 shipped with 25 new tests, 475 passing).
- **SP1 (Derivation Query) — PLAN WRITTEN.** This plan. 5 phases, 36 new tests, target 511 passing. Pending cook.
- **SP2 (Grounding Check) — design unchanged, plan not started.** Blocked on SP1's `signals.test_passed` field.
- **SP3 (Drift Query) — design unchanged, plan not started.** Blocked on SP1 (aggregation consumer).

## Implementation Session (2026-06-03)

**Cook command:** `/ck:cook --tdd plans/260602-sp1-derive-status/`

All 4 implementation phases executed with TDD (RED → GREEN). Baseline recorded: 475 existing tests.

### Phase 1: Pure Function `deriveStatus`
- Created `core/derive-status.js` with `deriveStatus(entry, codeContext)` — deterministic given inputs, no subprocess.
- Exported source-of-truth constants: `META_STATE_DERIVATION_KINDS`, `META_STATE_DERIVED_STATUSES`, `META_STATE_RECOMMENDATIONS`.
- Implemented all mitigations from the plan: C-1 (legacy fallback `entry.evidence_code_ref ?? entry.evidence?.code_ref`), C-3 (change-log fast path reuses locked enums), H-2 (`now` injection), H-3 (`test_passed` pass-through), M-3 (path semantics).
- Created `__tests__/derive-status.test.js` with 25 tests (24 from plan + 1 export assertion). All GREEN.

### Phase 2: MCP Tool `meta_state_derive_status`
- Created `tools/meta-state-derive-status-tool.js` with agent-callable handler (no `OPERATOR_MODE` check).
- Tool loads `codeContext` from `resolveRoot()`, computes `test_passed` via `spawnSync("pnpm", ["test", "--", path])` with per-process cache (key: `absolute_path:mtimeMs`).
- Returns structured errors: `entry_not_found`, `context_load_failed`.
- Appends gate log on every call.
- Created `__tests__/meta-state-derive-status-tool.test.js` with 10 tests. All GREEN.
- Fixed latent bug in env restoration: `process.env.GATE_ROOT = undefined` coerces to string `"undefined"`; corrected to `delete process.env.GATE_ROOT` when original was undefined.

### Phase 3: Manifest Registration
- Added 1 line to `tools/manifest.json` at end of `meta-state-*` group (after `meta-state-log-change-tool`).
- JSON syntax validated; `loop-describe` test suite passes with 46 tools registered.

### Phase 4: Acceptance Tests
- Created `__tests__/sp1-derive-status-acceptance.test.js` with 2 smoke tests:
  1. **Real finding:** `source-ref-validator` entry (found by description substring per C-2 mitigation). Asserts `derived_status: "resolved-by-mechanism"`, `kind: "mechanism-shipped"`, `recommendation: "resolve"`, `drift: true` (correcting the brainstorm's typo of `drift: false`).
  2. **Change-log fast path:** SP0 self-log entry. Asserts `kind: "no-signals"`, `derived_status: "active-no-signal"`, `drift: false`, `recommendation: "no_action"`.
- Both tests use temp dirs with `GATE_ROOT` to avoid mutating production state.

### Final verification
- `pnpm test`: 512 tests pass (475 existing + 37 new), 0 failures
- `pnpm validate:records`: 183 records validated, 0 errors
- `pnpm validate:plan-loop`: 72 plans checked, 0 violations

### Commits
- `8772d35` `feat(meta): deriveStatus pure function + meta_state_derive_status MCP tool`
- `0683245` `test(meta): 36 derive_status tests (24 unit + 10 tool + 2 acceptance)`
- `125eb75` `docs(plans): mark SP1 derive-status plan and all phases completed`

### Next Steps (post-cook)
- Operational first use: run `meta_state_derive_status` on the 4 stale `reported` findings (`meta-260601T1353Z-*` family) to verify resolver paths.
- Record a change-log entry for SP1 self-modification (mirror SP0 Phase 5 pattern).
- SP2 (grounding) and SP3 (drift aggregation) are now unblocked.

## References

- `plans/reports/brainstorm-260602-sp1-derive-status.md` (locked design)
- `plans/reports/brainstorm-260602-meta-state-agent-affordances.md` (parent doc, SP1 section)
- `plans/260602-sp0-log-change/plan.md` (sibling, completed — pattern reference)
- `plans/260602-sp0-log-change/reports/red-team-260602-sp0.md` (SP0 red-team report)
- `tools/learning-loop-mcp/core/meta-state.js` (registry + schemas)
- `tools/learning-loop-mcp/core/slugify.js` (ID truncation)
- `tools/learning-loop-mcp/tools/meta-state-log-change-tool.js` (sibling tool — pattern reference)
- `meta-state.jsonl` (1 change-log entry from SP0; ~18 finding entries — 8 with nested `evidence.code_ref`)
- `tools/learning-loop-mcp/lib/source-ref-validator.js` (acceptance-test fixture)
- `tools/learning-loop-mcp/__tests__/source-ref-validator.test.js` (acceptance-test fixture)
- `/tmp/sp1-verification-report.md` (pre-plan verification report, 3 CRITICAL + 7 lower findings, all folded into the plan)
