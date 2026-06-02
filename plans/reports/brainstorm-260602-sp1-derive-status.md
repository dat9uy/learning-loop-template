---
date: "2026-06-02T17:30:00Z"
status: locked
tags: [brainstorm, meta-state, sp1, derive-status, derivation, mcp-tool, tdd, parent-doc, verifier]
related:
  - plans/reports/brainstorm-260602-meta-state-agent-affordances.md (parent doc — SP1 section)
  - plans/reports/brainstorm-260602-sp0-log-change.md (SP0 — sibling sub-project, shipped)
  - plans/260602-sp0-log-change/plan.md (SP0 plan, completed)
  - tools/learning-loop-mcp/core/meta-state.js (META_STATE_FINDING_CATEGORIES export, schemas)
  - tools/learning-loop-mcp/core/loop-introspect.js (introspection consumer)
  - tools/learning-loop-mcp/core/slugify.js (SP0 extracted util)
  - tools/learning-loop-mcp/tools/meta-state-list-tool.js (SP0 entry_kind filter — sibling tool)
  - tools/learning-loop-mcp/tools/meta-state-log-change-tool.js (SP0 change-log tool — sibling tool)
  - meta-state.jsonl (18 finding entries + 1 change-log entry)
  - plans/260602-sp1-derive-status/plan.md (to be created on plan handoff)
supersedes: []
source: brainstorm-session
---

# SP1: `meta_state_derive_status` (Derivation Query)

> **Status: Locked 2026-06-02.** Operator-approved. This is the second of 4 sub-projects in the agent self-management of meta-state decomposition (parent doc). SP0 (self-modification affordance) is shipped. SP2 (grounding) and SP3 (drift) follow.

## Problem Statement

The agent currently has no way to ask the loop "is this finding still true?" Findings are reported with `status: reported` and a 24h TTL. After SP0's lifecycle tidy work (`260602-meta-state-lifecycle-tidy`), the auto-resolve machinery sweeps stale `reported` entries, but **the agent has no way to verify** that a finding's asserted status still matches reality. This is the verifier gap: the generator (the agent proposing resolutions) is strong, but the verifier (the system computing "is this still true?") is absent.

SP1 adds the verifier as a **pure derivation function** exposed via an MCP tool. The agent asks `meta_state_derive_status({ id })`; the loop computes `derived_status` from the finding's stored references + the current filesystem state; the agent decides what to do with the answer.

**Acceptance criteria (end-to-end on 1 known finding):** Given the finding `meta-260601T1339Z-the-learning-loop-has-no-mechanism-to-surface-the-internalization-rule-to-agents` (status: `active`, with `evidence_code_ref: "tools/learning-loop-mcp/lib/source-ref-validator.js"`), the derivation returns:

```json
{
  "id": "meta-260601T1339Z-...",
  "raw_status": "active",
  "derived_status": "resolved-by-mechanism",
  "derivation": {
    "kind": "mechanism-shipped",
    "signals": {
      "code_ref_exists": true,
      "code_ref_path": "tools/learning-loop-mcp/lib/source-ref-validator.js",
      "test_file_exists": true,
      "test_file_path": "tools/learning-loop-mcp/__tests__/source-ref-validator.test.js",
      "test_passed": null
    },
    "checked_at": "2026-06-02T...",
    "duration_ms": 0
  },
  "drift": false,
  "recommendation": "resolve"
}
```

(The `recommendation: "resolve"` is appropriate because `derived_status` says "mechanism shipped" but the entry's `raw_status` is still `active` — drift would be `true`; the recommendation prompts the agent to call `meta_state_resolve`.)

## Evaluated Approaches

### Approach A — Uniform baseline + opt-in tests (CHOSEN)

Pure function `deriveStatus(entry, codeContext)`:
- **Always** reads `entry.evidence_code_ref` (file exists?) and `entry.evidence_test` (file exists?)
- **Opt-in** test-runner via `codeContext.run_tests: boolean` (default false). When true, the tool spawns the test runner and populates `signals.test_passed`
- `kind` computed from the signal pattern:
  - `"mechanism-shipped"` — code_ref exists AND (test_file exists OR no test specified)
  - `"code-only"` — code_ref exists but test_file path was specified and is missing
  - `"code-missing"` — code_ref path was specified and is missing
  - `"no-signals"` — entry has neither `evidence_code_ref` nor `evidence_test`
- `derived_status` enum (3 values): `"resolved-by-mechanism"` | `"active-no-signal"` | `"active-uncertain"`
- `recommendation` enum (4 values, parent's lock): `"no_action"` | `"resolve"` | `"investigate"` | `"log_drift"`

**Trigger logic for `recommendation`:**
- `resolve` = `kind === "mechanism-shipped"` AND `raw_status` ∈ {`reported`, `active`} (the finding is now stale; mechanism shipped)
- `investigate` = `kind === "code-missing"` (no signal either way; agent should look)
- `log_drift` = `kind === "mechanism-shipped"` AND `raw_status` is terminal (e.g., `resolved` but the resolution claims something the derivation doesn't support). Note: per SP0 design, change-log entries are never terminal, so this only applies to findings.
- `no_action` = signals match the asserted status (e.g., entry is `active` and `derived_status` is `active-no-signal` — the assertion is honest)

**`drift: true` iff** `derived_status` indicates the mechanism is shipped (`resolved-by-mechanism`) but `raw_status` is not terminal. Drift is the signal that the entry needs resolution.

**Pros:** Simplest. No signal table to maintain. Works on every finding (uniform baseline). Future plans can add subtype-specific signals without breaking this.
**Cons:** Subtype-specific signals (e.g., `subtype: "tool-missing"` → check `manifest.json` registration) deferred. Acceptable per YAGNI — none of the current 18 entries have a derivation-specific need beyond code-ref + test-file existence.

### Approach B — Uniform baseline + empty subtype signal table (REJECTED for now)

Same as A, plus a `subtype → extra_signals` table seeded empty. Future plans add rows.

**Pros:** Honors the `subtype` semantic. Extensible per-subtype.
**Cons:** Two code paths for the same baseline logic. Empty table for SP1 = same as A but with indirection. Defer until a real subtype signal is needed (no current need).

### Approach C — Subtype-driven only (REJECTED)

Only run signals when `subtype` is set. Findings without subtype → `kind: "not-derivable"`.

**Pros:** Declarative.
**Cons:** Most findings don't have subtype. Most derivations return `not_derivable`. The parent doc's verifier purpose is defeated for un-typed findings.

## Final Design (Locked)

### Architecture

```
core/derive-status.js                  [NEW] pure function, no I/O
  - deriveStatus(entry, codeContext) -> DerivedStatus
  - computeKind(signals) -> Kind
  - computeDerivedStatus(kind, entry) -> DerivedStatus
  - computeRecommendation(derivedStatus, kind, rawStatus) -> Recommendation
  - computeDrift(derivedStatus, rawStatus) -> boolean

tools/meta-state-derive-status-tool.js [NEW] MCP wrapper
  - Loads codeContext from resolveRoot() and process.env
  - Calls deriveStatus(entry, codeContext)
  - Returns parent's locked shape: { id, raw_status, derived_status, derivation, drift, recommendation }
  - Registered in tools/manifest.json in the meta-state-* group

__tests__/derive-status.test.js        [NEW] pure function unit tests
__tests__/meta-state-derive-status-tool.test.js [NEW] MCP tool tests (mock filesystem)

tools/manifest.json                    [MODIFIED] 1 new line in meta-state-* group
```

### Locked Decisions

1. **Pure function lives in `core/derive-status.js`** (no I/O at unit level). MCP tool wraps with I/O.
2. **Function signature:** `deriveStatus(entry, codeContext) -> DerivedStatus`. `codeContext` is `{ root: string, run_tests?: boolean, test_runner?: string }`. Default `run_tests: false`.
3. **Output shape (parent's lock, with `evidence` → `signals` rename per operator):**
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
         test_passed?: boolean | null,  // null = not run; true/false = result
       },
       checked_at: string,  // ISO timestamp
       duration_ms: number,
     },
     drift: boolean,
     recommendation: "no_action" | "resolve" | "investigate" | "log_drift",
   }
   ```
4. **Naming convention:** `signals` (not `evidence`) for the per-check booleans. Rationale: `evidence` is reserved for `records/meta/evidence/` artifacts. `signals` is unambiguous: "what the function read from the filesystem."
5. **Change-log fast path:** Change-log entries return `{ raw_status: "active", derived_status: "active", derivation: { kind: "not-derivable", signals: {}, checked_at, duration_ms }, drift: false, recommendation: "no_action" }`. History is queryable via `meta_state_list({ entry_kind: "change-log" })` (SP0-shipped).
6. **Test-runner integration:** Opt-in via `codeContext.run_tests`. Default false. When true, the tool spawns the project's test runner (`pnpm test -- <test_file>`) and parses the exit code. Result is cached for the current process lifetime (keyed by file path + mtime).
7. **No auto-mutation:** SP1 is the verifier only. The tool never calls `meta_state_resolve` or `updateEntry`. The agent decides.
8. **Backward compat:** No changes to existing meta-state tools or schemas. SP1 is purely additive. The 475 existing tests must continue to pass.
9. **No new dependencies:** Use only `node:fs`, `node:path`, `node:child_process` (built-ins). No new npm packages.

### Test Plan

**`__tests__/derive-status.test.js` (12 unit tests, no I/O):**

1. `deriveStatus returns kind: "mechanism-shipped" when both code_ref and test_file exist`
2. `deriveStatus returns kind: "code-only" when code_ref exists but test_file is specified and missing`
3. `deriveStatus returns kind: "code-missing" when code_ref is specified and missing`
4. `deriveStatus returns kind: "no-signals" when entry has no code_ref or test_file paths`
5. `deriveStatus sets signals.test_passed to null when run_tests is false`
6. `deriveStatus returns derived_status: "resolved-by-mechanism" for kind: "mechanism-shipped"`
7. `deriveStatus returns derived_status: "active-no-signal" for kind: "code-missing" or "no-signals"`
8. `deriveStatus returns derived_status: "active-uncertain" for kind: "code-only"`
9. `deriveStatus returns recommendation: "resolve" when mechanism shipped and raw_status is reported/active`
10. `deriveStatus returns recommendation: "investigate" when code_ref is missing`
11. `deriveStatus returns recommendation: "no_action" when signals match raw_status assertion`
12. `deriveStatus sets drift: true when mechanism shipped but raw_status is not terminal`

**`__tests__/meta-state-derive-status-tool.test.js` (8 MCP tool tests):**

1. `tool reads registry, finds entry by id, calls deriveStatus with loaded codeContext`
2. `tool returns parent's locked shape on a known derivable finding (acceptance test: meta-260601T1339Z...)`
3. `tool returns kind: "not-derivable" fast path for change-log entries`
4. `tool returns error for missing entry id (not_found)`
5. `tool respects run_tests: true and populates signals.test_passed from test runner exit code`
6. `tool respects run_tests: false and sets signals.test_passed to null`
7. `tool appends a gate log line on each call (matches sibling tool pattern)`
8. `tool handles malformed codeContext gracefully (missing root resolves to default)`

**Test budget:** 20 new tests + 475 existing tests = 495 total. Plan must achieve ≥ 495 passing.

### What SP1 Does NOT Do (Out of Scope)

- **No auto-mutation** of entries. The tool never calls `meta_state_resolve` or `updateEntry`. Agent decides.
- **No SP2 (grounding check)** — `mechanism_check` field on entries, hash comparison, deep test runs are SP2.
- **No SP3 (drift query)** — aggregating derivations across many entries to find drift patterns is SP3.
- **No changes to `meta_state_resolve` behavior** — the operator/agent still calls it manually.
- **No schema migration** — `metaStateFindingEntrySchema` is unchanged. The tool reads `evidence_code_ref` and `evidence_test` (already present).
- **No changes to `loop_describe` response shape** — the new tool is discoverable via the existing tool list.
- **No subtype-specific signal table** (Approach B deferred) — none of the current 18 findings need it.
- **No test-runner integration in pure function** — test running is tool-layer concern, not pure-function concern. Function returns `null` for `test_passed`; tool computes it.

### Success Metrics

- [ ] `pnpm test` passes (full suite, ≥ 495 tests)
- [ ] `pnpm validate:records` passes (no schema changes; should be no-op)
- [ ] `pnpm validate:plan-loop` passes (no plan changes yet; will be in the plan)
- [ ] Acceptance test: `meta_state_derive_status({ id: "meta-260601T1339Z-the-learning-loop..." })` returns `derived_status: "resolved-by-mechanism"` + `recommendation: "resolve"` + `drift: true`
- [ ] Fast path: `meta_state_derive_status({ id: "<change-log-id>" })` returns `kind: "not-derivable"` no-op response
- [ ] The 4 not-derivable change-log entries in `meta-state.jsonl` (from SP0's own log) all return the fast-path response
- [ ] New tool registered in `tools/manifest.json` in the `meta-state-*` group
- [ ] `loop_describe({tier: "warm"})` shows the new tool in the MCP tool list

### Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Test runner integration is flaky in CI | Default `run_tests: false`; opt-in only. Test-runner invocation is a thin subprocess wrapper with timeout. |
| Finding IDs in the registry may not have `evidence_code_ref` or `evidence_test` (legacy entries) | `kind: "no-signals"` covers this case; `recommendation: "no_action"` is the safe default. The 18 current entries all have at least one of these fields. |
| `codeContext` loading from `resolveRoot()` may fail in edge cases | Tool returns structured error `{ error: "context_load_failed", reason }`; no throw. |
| Pure function has hidden I/O dependencies (e.g., accidentally reading `process.cwd()`) | Test isolation: all `codeContext` inputs are explicit. Unit tests never touch the filesystem. |
| `signals` naming vs the parent's `evidence` naming creates confusion for readers of the parent doc | The parent doc says "evidence" in the example shape; SP1 deviates. Add a note in `core/derive-status.js` header comment cross-referencing the rename rationale. |
| Drift detection misses cases where `derived_status: "active-no-signal"` should be considered "investigate" | Locked: `active-no-signal` → `recommendation: "no_action"` (signals say "I can't tell"); `code-missing` → `investigate` (signals say "this was definitely here, now it isn't"). The distinction matters. |
| Schema export name conflicts (e.g., `META_STATE_DERIVATION_KINDS` vs `META_STATE_FINDING_CATEGORIES`) | Use clear names: `META_STATE_DERIVATION_KINDS` (4 values) and `META_STATE_DERIVED_STATUSES` (3 values) and `META_STATE_RECOMMENDATIONS` (4 values) exported as source-of-truth constants, mirroring SP0's `META_STATE_FINDING_CATEGORIES` pattern. |

## Cross-Plan Dependencies

| Relationship | Plan | Status | Note |
|---|---|---|---|
| Builds on | SP0 (`260602-sp0-log-change`) | completed | Provides `META_STATE_FINDING_CATEGORIES`, the 7 finding categories, and the change-log entry_kind |
| Builds on | `260602-self-enforcing-loop` | completed | Provides the existing `meta_state_*` tools and the loop_describe contract |
| Required for (future) | SP2 derivation, SP3 drift aggregation | not started | SP2 reads `signals.test_passed`; SP3 calls `deriveStatus` for many entries |
| Required for (future) | `meta_state_resolve` integration with derivation | not started | A future plan may make `meta_state_resolve` warn when derivation disagrees |

## Next Steps

1. Create `plans/260602-sp1-derive-status/plan.md` via `/ck:plan` (TDD mode, matching SP0's pattern)
2. Plan phases: 0 = scaffolding, 1 = pure function (12 tests), 2 = MCP tool (8 tests), 3 = manifest registration, 4 = acceptance test on real finding
3. Red-team review after plan creation, before cook
4. Cook via `/ck:cook plan.md`
5. First real use: run `meta_state_derive_status` on the 4 stale `reported` findings (`meta-260601T1353Z-...` family) to verify the resolver path

## Open Questions Resolved This Session

1. **Q1 (change-log scope):** Findings only with no-op fast path for change-logs. **Resolved.**
2. **Q2 (naming — "evidence" vs "signal"):** Use `signals` for the per-check field. The schema's own `evidence` field on entries is unaffected. **Resolved.**
3. **Q3 (recommendation field):** Keep as `recommendation` with 4 values, per parent's lock. **Resolved.**
4. **Q4 (acceptance criteria):** End-to-end on 1 known finding (`meta-260601T1339Z-...`) returning `resolved-by-mechanism` + `resolve`. **Resolved.**
5. **Q5 (touchpoints):** 4 new files + 1 modify (manifest.json). No changes to existing schemas or tools. **Resolved.**
6. **Approach selection:** Approach A (uniform baseline + opt-in tests). **Resolved.**

## References

- Parent doc: `plans/reports/brainstorm-260602-meta-state-agent-affordances.md` — SP1 section, lines 131-170
- SP0 brainstorm: `plans/reports/brainstorm-260602-sp0-log-change.md` — sibling sub-project, status locked
- Pattern 2 (verifier > generator): parent doc, lines 49-54
- YAGNI/KISS/DRY: brainstorm skill core principles
- Anti-rationalization: "Simple projects = most wasted work from unexamined assumptions"
