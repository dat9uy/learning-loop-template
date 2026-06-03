---
title: "SP1: meta_state_derive_status (Derivation Query)"
description: "Implements the design in plans/reports/brainstorm-260602-sp1-derive-status.md. Adds a pure-function derivation engine + MCP tool that computes the effective status of a meta-state finding from its stored references + the current filesystem state. TDD structure preserves the 475 existing tests. 24 unit + 10 tool + 2 acceptance = 36 new tests; target total 511. Closes the verifier gap: the system can now answer \"is this finding still true?\" via a structured derivation response."
status: completed
priority: P2
branch: "main"
tags: [meta, mcp, tdd, agent-affordances, derivation, verifier, meta-state, drift-detection]
blockedBy: ["260602-sp0-log-change"]
blocks: ["260602-sp2-grounding (future)", "260602-sp3-drift (future)"]
related:
  - plans/reports/brainstorm-260602-sp1-derive-status.md
  - plans/reports/brainstorm-260602-meta-state-agent-affordances.md (parent doc)
  - plans/260602-sp0-log-change/plan.md (sibling, completed — pattern reference)
  - plans/260602-self-enforcing-loop/plan.md
  - plans/260602-meta-state-lifecycle-tidy/plan.md
  - tools/learning-loop-mcp/core/meta-state.js (META_STATE_FINDING_CATEGORIES export; metaStateFindingEntrySchema, metaStateChangeEntrySchema; readRegistry, writeEntry, updateEntry, filterEntries, checkExpiry, generateId)
  - tools/learning-loop-mcp/core/loop-introspect.js (introspection consumer)
  - tools/learning-loop-mcp/core/slugify.js (SP0 extracted util — ID-truncation context)
  - tools/learning-loop-mcp/tools/meta-state-log-change-tool.js (SP0 sibling tool — pattern reference)
  - tools/learning-loop-mcp/tools/meta-state-report-tool.js (sibling tool — pattern reference)
  - tools/learning-loop-mcp/tools/meta-state-list-tool.js (sibling tool — pattern reference)
  - tools/learning-loop-mcp/tools/manifest.json (1 line added in meta-state-* group)
  - tools/learning-loop-mcp/lib/source-ref-validator.js (acceptance-test fixture)
  - tools/learning-loop-mcp/__tests__/source-ref-validator.test.js (acceptance-test fixture)
  - meta-state.jsonl (1 change-log entry from SP0 self-log; ~18 finding entries)
created: "2026-06-02T22:00:00Z"
createdBy: "ck:plan --hard --tdd (researcher-verified; design clarifications folded in; 3 CRITICAL findings from pre-plan verification)"
source: skill
---

# SP1: `meta_state_derive_status` (Derivation Query)

## Overview

Implements the design locked in `plans/reports/brainstorm-260602-sp1-derive-status.md` (status: locked 2026-06-02). The parent doc `brainstorm-260602-meta-state-agent-affordances.md` decomposes the "agent self-management of meta-state" question into 4 sub-projects (SP0-SP3). SP0 (self-modification affordance) is shipped. **This plan ships SP1**: the derivation query that lets the agent ask "is this finding still true?" and get a structured answer.

**Core change:** the agent invokes `meta_state_derive_status({ id, run_tests? })`; the tool calls a pure derivation function with `codeContext` loaded from `resolveRoot()` + `process.env`; the function returns the locked shape `{ id, raw_status, derived_status, derivation { kind, signals, checked_at, duration_ms }, drift, recommendation }`. The function is a verifier (Pattern 2 from the parent doc): it does NOT mutate entries. The agent decides what to do with the answer.

**Why TDD:** the function shape touches the entry schema, the registry read path, and the gate-log writer. The 475 existing tests in the test surface (`core/meta-state.test.js`, `__tests__/meta-state-*.test.js`, plus 16 in `core/meta-state.test.js` as the regression-safety floor) are the contract that must not regress. Tests-first locks the contract before any code changes. SP1's TDD structure mirrors SP0's proven pattern (24 unit + 10 tool + 2 acceptance = 36 new tests).

**Surface:** `meta` (changes to the loop's own machinery, not `product/**`).

## Design Clarifications (Folded In From Pre-Plan Verification)

The locked design was verified against the actual codebase (the `worker` subagent produced a structured verification report — see "Pre-Plan Verification" section below). Three CRITICAL findings and 7 lower-severity findings were identified. The plan folds in the following clarifications to address them. **No lock changes are required** (the locked enums are preserved; the clarifications are documentation/contract refinements).

| # | Finding | Plan resolution |
|---|---|---|
| C-1 | `entry.evidence_code_ref` is the design's notation, but the 8 of 18 existing findings store the code_ref in a nested `evidence: { code_ref, journal }` shape (per SP0's pre-SP0 write path). | Pure function reads `entry.evidence_code_ref ?? entry.evidence?.code_ref` (legacy fallback). Pure function reads `entry.evidence_test` (top-level only; no legacy equivalent in the 8 findings). |
| C-2 | Acceptance-test entry ID is the full 84-char slug; actual ID is truncated to 60 chars per `core/slugify.js:slice(0, 60)`. | Acceptance test uses `entries.find(e => e.description.includes("internalization rule"))` (SP0's `sp0-change-log-self-log.test.js` pattern) rather than hardcoding the ID. The test is robust to future slugify changes. |
| C-3 | Change-log fast-path uses `kind: "not-derivable"` and `derived_status: "active"`, neither in the locked 4+3 enums. | **Reuse existing values** (no lock change): fast path returns `kind: "no-signals"` and `derived_status: "active-no-signal"`. Semantically defensible — change-logs have no `evidence_code_ref` field, so "no signals" is accurate. The fast path is distinguished from a regular no-signals finding by `recommendation: "no_action"` + a code-comment in the function cross-referencing the rationale. |
| H-1 | `log_drift` recommendation trigger (`kind === "mechanism-shipped"` AND `raw_status` is terminal) is the **converse** of the drift boolean. The example in the brainstorm shows a "log_drift" case but the function cannot detect resolution-claim semantics. | Keep `log_drift` in the enum (4 values, parent's lock). The trigger is preserved as documented. The plan's Phase 4 acceptance test includes a unit test for the log_drift case using a terminal-status entry to lock in the trigger. SP3 (drift aggregation) is the place where drift patterns actually surface; SP1 just computes per-entry derivation. |
| H-2 | Function claims "pure" but calls `new Date()` and `Date.now()` internally, making it non-deterministic. | Inject `codeContext.now: () => number` (default `() => Date.now()`). Capture `const t0 = codeContext.now()` at function start. The function is "deterministic given inputs (incl. injected `now` and `codeContext.root`)." |
| H-3 | Test-runner integration boundary between pure function and tool is undefined. | Contract: `codeContext.test_passed?: boolean \| null` is an input to the pure function. The function passes it through into `signals.test_passed`. The tool computes it (via subprocess + cache) and passes it in. Default `null` when not provided. This keeps the function pure (no subprocess) and makes the merge explicit. |
| H-4 | `test_file_path` derivation (when no `evidence_test` is set on the entry) is not specified. The acceptance-test entry has no `evidence_test` field. | Update acceptance criterion: drop `test_file_path` from the expected output. The pure function's `signals.test_file_exists` is `true` only when `entry.evidence_test` is set AND the file exists; otherwise `null` (or `false` if path is set but missing). The function does not auto-derive a test file from the code_ref. |
| M-1 | `codeContext` shape under-specified for the MCP tool layer. | Pure function's `codeContext` is a test seam (caller-controlled, internal abstraction). MCP tool's schema is `{ id: string, run_tests?: boolean }` (agent-controllable, only `run_tests` is exposed). The tool builds the internal `codeContext` from `resolveRoot()` + the agent's `run_tests` opt-in. |
| M-2 | Drift converse tests missing. | Add 3 unit tests (T-18, T-19, T-20). |
| M-3 | Path semantics not covered (relative, absolute, spaces, traversal, non-string). | Add 4 unit tests (T-21, T-22, T-23, T-24). |
| M-4 | Success metric "4 not-derivable change-log entries" is unsatisfiable — only 1 exists in the JSONL. | Change to "the change-log entry in `meta-state.jsonl` (from SP0's self-log)" (singular). The 1 entry is enough to verify the fast path. |
| L-1 | Acceptance test example shows `drift: false` for a case where drift definition says it should be `true`. | Treat the example as having a typo; document in the plan: for an entry with `raw_status: "active"` and `derived_status: "resolved-by-mechanism"`, the function returns `drift: true` and `recommendation: "resolve"`. The plan's Phase 4 acceptance test locks in this behavior. |
| L-2 | `signals` naming rationale asserted but not documented in code. | Add a header comment in `core/derive-status.js` explaining the rename from `evidence` to `signals`. |
| L-3 | 475-test floor claim is from a snapshot. | Phrase the success metric as a delta: "All existing tests still pass; new total = previous total + 36 (24 unit + 10 tool + 2 acceptance)." Run `pnpm test` at plan-creation time and record the actual baseline. |

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 0 | [G8 Observation + Plan Scaffolding](./phase-00-g8-observation-and-scaffolding.md) | pending |
| 1 | [Pure Function `deriveStatus` (TDD, 24 unit tests)](./phase-01-pure-function-derive-status.md) | pending |
| 2 | [`meta_state_derive_status` Tool (TDD, 10 tool tests)](./phase-02-derive-status-tool.md) | pending |
| 3 | [Manifest Registration](./phase-03-manifest-registration.md) | pending |
| 4 | [Acceptance Test on Real Finding + First Real Use](./phase-04-acceptance-test.md) | pending |

## Cross-Plan Dependencies

| Relationship | Plan | Status | Note |
|---|---|---|---|
| Builds on | `260602-sp0-log-change` | completed | Provides `META_STATE_FINDING_CATEGORIES`, the discriminated union (`entry_kind`), and the `meta_state_log_change` tool. The pure function reads from the SP0 union (finding branch only). |
| Builds on | `260602-self-enforcing-loop` | completed | Provides the 5 existing meta-state tools + the `loop_describe` discovery surface. |
| Builds on | `260602-meta-state-lifecycle-tidy` | completed | Provides `readRegistry`, `writeEntry`, `updateEntry`, `checkExpiry`, `filterEntries`, `generateId`. The pure function uses `readRegistry` (via the tool wrapper, not directly). |
| Required for (future) | SP2 grounding | not started | SP2 reads `signals.test_passed` from the derivation output. |
| Required for (future) | SP3 drift aggregation | not started | SP3 calls `deriveStatus` for many entries to find drift patterns. |
| Required for (future) | `meta_state_resolve` integration | not started | A future plan may make `meta_state_resolve` warn when derivation disagrees with asserted status. |

## Resolved Decisions (from locked design + verification)

1. **Role:** `meta_state_derive_status` is agent-callable (matches `meta_state_list`).
2. **No auto-mutation:** the tool never calls `meta_state_resolve` or `updateEntry`. The agent decides.
3. **Pure function core (no subprocess):** `deriveStatus(entry, codeContext) -> DerivedStatus`. Lives in `core/derive-status.js`. MCP tool wraps it with I/O.
4. **Output shape (parent's lock, with `evidence` → `signals` rename per operator):**
   ```js
   {
     id: string,
     raw_status: string,
     derived_status: "resolved-by-mechanism" | "active-no-signal" | "active-uncertain",
     derivation: {
       kind: "mechanism-shipped" | "code-only" | "code-missing" | "no-signals",
       signals: {
         code_ref_exists?: boolean,
         code_ref_path?: string,
         test_file_exists?: boolean,
         test_file_path?: string,
         test_passed?: boolean | null,
       },
       checked_at: string,  // ISO timestamp
       duration_ms: number,
     },
     drift: boolean,
     recommendation: "no_action" | "resolve" | "investigate" | "log_drift",
   }
   ```
5. **`derivation.kind` (4 values, locked):** `mechanism-shipped` | `code-only` | `code-missing` | `no-signals`. The change-log fast path uses `"no-signals"` (reuses the locked value; semantically accurate — change-logs have no `evidence_code_ref` field).
6. **`derived_status` (3 values, locked):** `resolved-by-mechanism` | `active-no-signal` | `active-uncertain`. The change-log fast path uses `"active-no-signal"`.
7. **`recommendation` (4 values, parent's lock):** `no_action` | `resolve` | `investigate` | `log_drift`. All 4 values are tested.
8. **Drift detection:** `drift: true` iff `derived_status === "resolved-by-mechanism"` AND `raw_status` is not terminal. Documented in the function header.
9. **Change-log fast path:** `kind: "no-signals"`, `derived_status: "active-no-signal"`, `drift: false`, `recommendation: "no_action"`. The function's header comment cross-references the rationale (reuses locked enums; the alternative of extending enums was a lock change).
10. **Test-runner integration:** opt-in via `codeContext.run_tests`. Default false. When true, the tool spawns the project's test runner (`pnpm test -- <test_file>`) and parses the exit code. Result is cached for the current process lifetime (keyed by file path + mtime).
11. **`now` injection:** `codeContext.now: () => number` (default `() => Date.now()`). The function captures `t0` at start and computes `duration_ms = codeContext.now() - t0` at end. The function is deterministic given inputs.
12. **`test_passed` boundary:** `codeContext.test_passed?: boolean | null` is passed through to `signals.test_passed`. The pure function does not run subprocesses. The tool computes it.
13. **Naming convention:** `signals` (not `evidence`) for the per-check booleans. Rationale documented in the function header.
14. **Backward compat:** no changes to existing meta-state tools or schemas. The 475 existing tests must continue to pass. 36 new tests are added (24 unit + 10 tool + 2 acceptance).
15. **No new dependencies:** use only `node:fs`, `node:path`, `node:child_process` (built-ins). No new npm packages.
16. **Acceptance-test ID lookup:** use description-substring match, not hardcoded ID (per C-2 mitigation).

## Architecture (TDD-Relevant)

```
core/derive-status.js                  [NEW] pure function, no subprocess
  - deriveStatus(entry, codeContext) -> DerivedStatus
  - computeKind(signals, entry) -> Kind
  - computeDerivedStatus(kind) -> DerivedStatus
  - computeRecommendation(derivedStatus, kind, rawStatus) -> Recommendation
  - computeDrift(derivedStatus, rawStatus) -> boolean
  - META_STATE_DERIVATION_KINDS         [export] 4-value source-of-truth array
  - META_STATE_DERIVED_STATUSES         [export] 3-value source-of-truth array
  - META_STATE_RECOMMENDATIONS          [export] 4-value source-of-truth array
  - TERMINAL_RAW_STATUSES               [internal] {"auto-resolved", "expired", "resolved"}

tools/meta-state-derive-status-tool.js [NEW] MCP wrapper
  - Loads codeContext from resolveRoot() and process.env
  - Computes codeContext.test_passed (via subprocess + cache) when run_tests: true
  - Calls deriveStatus(entry, codeContext)
  - Returns parent's locked shape
  - Appends a gate log line on each call

__tests__/derive-status.test.js        [NEW] 24 unit tests (12 original + 12 added)
__tests__/meta-state-derive-status-tool.test.js [NEW] 10 tool tests (8 original + 2 added)
__tests__/sp1-derive-status-acceptance.test.js [NEW] 2 acceptance smoke tests

tools/manifest.json                    [MODIFIED] 1 new line in meta-state-* group
```

## Test Plan (Consolidated)

| File | New | Total after |
|---|---|---|
| `__tests__/derive-status.test.js` (new) | 24 (12 core + 12 added) | 24 |
| `__tests__/meta-state-derive-status-tool.test.js` (new) | 10 (8 core + 2 added) | 10 |
| `__tests__/sp1-derive-status-acceptance.test.js` (new) | 2 (acceptance smoke tests) | 2 |
| **Total new tests** | | **36** |
| **Existing tests (regression-safety floor)** | | 475 (preserved unchanged) |
| **Project total after plan** | | **511** |

The 12 added unit tests are all derived from the pre-plan verification report's risk table (R-01, R-05, R-06, R-08, R-03, R-10). The 2 added tool tests are T-9 (id-only lookup locks in the id-based contract) and T-10 (gate-log line on the change-log fast path). The 2 acceptance smoke tests in Phase 4 verify the end-to-end behavior on a real finding and a real change-log entry from `meta-state.jsonl`.

## What This Plan Does NOT Do (Out of Scope)

- No auto-mutation of entries (the tool never calls `meta_state_resolve` or `updateEntry`).
- No SP2 (grounding check) — `mechanism_check` field on entries, hash comparison, deep test runs are SP2.
- No SP3 (drift query) — aggregating derivations across many entries to find drift patterns is SP3.
- No changes to `meta_state_resolve` behavior — the operator/agent still calls it manually.
- No schema migration — `metaStateFindingEntrySchema` is unchanged. The function reads `entry.evidence_code_ref ?? entry.evidence?.code_ref` (legacy fallback) without modifying the schema.
- No changes to `loop_describe` response shape — the new tool is discoverable via the existing tool list.
- No subtype-specific signal table (Approach B in the brainstorm was rejected as YAGNI) — none of the current 18 findings need it.
- No test-runner integration in the pure function — test running is tool-layer concern. Function accepts `codeContext.test_passed` as input; tool computes it.

## Pre-Plan Verification

The locked design was verified against the actual codebase by a `worker` subagent in the planning session. The verification report (3 CRITICAL + 7 lower-severity findings) is the basis for the "Design Clarifications" section above. The verification report is not committed to the repo (it lives in `/tmp/sp1-verification-report.md`); the findings are folded into this plan directly.

## Success Metrics

- [ ] `pnpm test` passes (full suite, ≥ 511 tests; 475 existing + 36 new)
- [ ] `pnpm validate:records` passes (no schema changes; should be no-op)
- [ ] `pnpm validate:plan-loop` passes
- [ ] Pure function returns the locked shape on all 24 unit tests
- [ ] MCP tool returns the locked shape on all 10 tool tests
- [ ] Acceptance smoke tests pass (real finding + change-log fast path)
- [ ] **Acceptance test:** `meta_state_derive_status({ id: <lookup-by-description> })` returns `derived_status: "resolved-by-mechanism"`, `kind: "mechanism-shipped"`, `recommendation: "resolve"`, `drift: true` (note: `drift: true`, correcting the brainstorm example's typo of `drift: false`)
- [ ] **Change-log fast path:** `meta_state_derive_status({ id: <change-log entry> })` returns `kind: "no-signals"`, `derived_status: "active-no-signal"`, `drift: false`, `recommendation: "no_action"`
- [ ] **Path semantics:** absolute paths treated as absolute, relative paths joined with `codeContext.root`, non-string inputs handled defensively
- [ ] New tool registered in `tools/manifest.json` in the `meta-state-*` group (at the end, per SP0's red-team MEDIUM-1 fix)
- [ ] `loop_describe({tier: "warm"})` shows the new tool in the MCP tool list
- [ ] Gate log line written on every call (success and fast-path)

## Risks

| Risk | Mitigation |
|---|---|
| Pure function reads `evidence_code_ref` but legacy entries use nested `evidence.code_ref` (8 of 18 findings) | C-1: function reads `entry.evidence_code_ref ?? entry.evidence?.code_ref`. Unit test T-13 locks in the fallback. |
| Acceptance-test ID is the full slug, but the actual ID is truncated to 60 chars | C-2: acceptance test uses `entries.find(e => e.description.includes("internalization rule"))` (SP0 pattern). |
| Change-log fast-path uses `kind: "not-derivable"` not in the locked 4-value enum | C-3: reuse `"no-signals"` (semantically accurate). No lock change. Code comment cross-references the rationale. |
| `log_drift` trigger is the converse of the drift boolean (H-1) | Keep the locked 4-value enum. Unit test locks in the trigger. SP3 (drift aggregation) is where drift patterns actually surface. |
| Function claims "pure" but calls `new Date()` (H-2) | H-2: inject `codeContext.now`. Unit tests T-14, T-15 lock in the determinism. |
| Test-runner integration boundary between pure function and tool is undefined (H-3) | H-3: `codeContext.test_passed` input, passed through. Unit tests T-16, T-17 lock in the boundary. |
| `test_file_path` derivation when `evidence_test` is not set (H-4) | H-4: function does not auto-derive. `signals.test_file_exists` is `true` only when `evidence_test` is set AND the file exists. Acceptance test updates the expected output to drop `test_file_path`. |
| `codeContext` shape under-specified for the tool layer (M-1) | M-1: pure function's `codeContext` is a test seam; MCP tool's schema is `{ id, run_tests? }`. Documented in Phase 2. |
| Drift converse tests missing (M-2) | M-2: 3 unit tests (T-18, T-19, T-20). |
| Path semantics not covered (M-3) | M-3: 4 unit tests (T-21, T-22, T-23, T-24). |
| Success metric "4 not-derivable change-log entries" is unsatisfiable (M-4) | M-4: change to "the change-log entry" (singular). |
| Acceptance test example shows `drift: false` for a case that should be `drift: true` (L-1) | L-1: treat as typo. Phase 4 acceptance test asserts `drift: true` for `raw_status: "active"` + `derived_status: "resolved-by-mechanism"`. |
| `signals` naming rationale not documented in code (L-2) | L-2: header comment in `core/derive-status.js` cross-references the parent's `evidence` → `signals` rename. |
| 475-test floor claim is from a snapshot (L-3) | L-3: run `pnpm test` at plan-creation time, record actual baseline. |
| Test-runner integration is flaky in CI | Default `run_tests: false`; opt-in only. Test-runner invocation is a thin subprocess wrapper with timeout (e.g., 30s). |
| Finding IDs in the registry may not have `evidence_code_ref` or `evidence_test` (legacy entries) | `kind: "no-signals"` covers this case; `recommendation: "no_action"` is the safe default. The 18 current entries all have at least one of these fields (per the verification report). |
| `codeContext` loading from `resolveRoot()` may fail in edge cases | Tool returns structured error `{ error: "context_load_failed", reason }`; no throw. |
| Pure function has hidden I/O dependencies (e.g., accidentally reading `process.cwd()`) | Test isolation: all `codeContext` inputs are explicit. Unit tests use `mkdtempSync` for `root`. |
| Schema export name conflicts (e.g., `META_STATE_DERIVATION_KINDS` vs `META_STATE_FINDING_CATEGORIES`) | Use clear names matching the SP0 pattern. No conflict. |
| G8 subcommand-class false positive recurs on `ck plan create` | Phase 0 records a fresh meta-state entry documenting the recurrence; smoke test in `g8-subcommand-class-entry.test.js` continues to pass. The plan files are scaffolded via the `Create` tool (AGENTS.md fallback). |
