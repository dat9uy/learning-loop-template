---
title: "SP3: meta_state_query_drift (Drift Aggregation Query)"
description: "Locks the SP3 design (Phase 1 only) for the meta-state agent-affordances decomposition. SP3 is the read-only drift aggregation query that joins SP1's deriveStatus + SP2's checkGrounding across the registry to surface entries whose raw_status disagrees with derived/grounded state. Phase 1 ships the read-only tool; Phase 2 (auto-mutation via auto_resolve: true) is documented as a stub for a future brainstorm after the 30-day drift-rate measurement window. TDD structure preserves the 557 existing tests (post-SP2-gap-closure). 24 unit + 24 tool + 2 acceptance + 2 grounding-mode = 52 new tests; target total 609. Surface: meta."
status: locked
created: "2026-06-05T00:00:00Z"
createdBy: "ck:brainstorm (SP3 dedicated design; consensus reached on run_grounding: false default + lean output + 4-phase structure)"
related:
  - plans/reports/brainstorm-260602-meta-state-agent-affordances.md (parent doc, SP3 section)
  - plans/reports/brainstorm-260602-sp1-derive-status.md (sibling, locked 2026-06-02)
  - plans/reports/brainstorm-260602-sp2-check-grounding.md (sibling, locked 2026-06-03)
  - plans/reports/brainstorm-260603-sp2-discoverability-and-manifest-backfill.md (immediate SP3 prerequisite, completed 2026-06-03)
  - plans/260602-sp0-log-change/plan.md (SP0 — completed, pattern reference for change-log entries)
  - plans/260602-sp1-derive-status/plan.md (SP1 — completed, pattern reference for pure-function + tool + manifest + acceptance)
  - plans/260602-sp2-check-grounding/plan.md (SP2 — completed, pattern reference for 4-phase TDD + grounding tool pair)
  - plans/260603-field-coverage/plan.md (orthogonal to SP3; blocks Approach 3 codegen which is post-SP3)
  - plans/260603-sp2-discoverability-and-manifest-backfill/plan.md (closes SP3's immediate prerequisite: agent-manifest.json drift)
  - docs/trajectory.md (Why this leap is sequenced after SP3)
  - tools/learning-loop-mcp/core/derive-status.js (SP1's pure function — joined by SP3)
  - tools/learning-loop-mcp/core/check-grounding.js (SP2's pure function — joined by SP3 when run_grounding: true)
  - tools/learning-loop-mcp/core/meta-state.js (registry read/write primitives)
  - tools/learning-loop-mcp/tools/meta-state-derive-status-tool.js (SP1 sibling tool — pattern reference)
  - tools/learning-loop-mcp/tools/meta-state-check-grounding-tool.js (SP2 sibling tool — pattern reference)
  - tools/learning-loop-mcp/tools/meta-state-refresh-fingerprint-tool.js (SP2 sibling tool — pattern reference)
  - tools/learning-loop-mcp/tools/manifest.json (registry of 50+ tools; +1 line for SP3)
  - tools/learning-loop-mcp/agent-manifest.json (grouped structure; +1 entry in meta_state group)
  - meta-state.jsonl (18 finding entries + 1 change-log entry; the registry SP3 reads from)
  - AGENTS.md (loop-affordances surface)
  - meta-state.jsonl (G8 5th recurrence 2026-06-03; G8 plan-scaffolding workaround: use Create tool directly)
---

# SP3: `meta_state_query_drift` (Drift Aggregation Query)

## Overview

SP3 is the **fourth and final** sub-project in the meta-state agent-affordances decomposition (`plans/reports/brainstorm-260602-meta-state-agent-affordances.md`). SP0 (self-modification, `meta_state_log_change`), SP1 (derivation query, `meta_state_derive_status`), and SP2 (grounding check, `meta_state_check_grounding` + `meta_state_refresh_fingerprint`) are all shipped. **SP3 ships the read-only drift aggregation query** that joins SP1's `deriveStatus` and SP2's `checkGrounding` across the entire registry, surfacing entries whose asserted status disagrees with the derived or grounded state.

**Core change:** the agent invokes `meta_state_query_drift({ filter?, run_grounding? })`; the tool calls a pure function `queryDrift(entries, codeContext)` in `core/query-drift.js`; the function calls `deriveStatus` (SP1) for every entry to produce the derivation view; if `run_grounding: true`, it also calls `checkGrounding` (SP2) to produce the grounding view; the function joins the two views and filters for drift (cases where `derived_status` says resolved but `raw_status` is active, OR `grounding.status` says drifted but `raw_status` is active). The function returns a flat list of `drift_events` with a `recommendation` field that the agent uses to decide what to do next (call `meta_state_resolve`, log a drift event, investigate).

**Why TDD:** the function shape touches the entry schema (read-only — no new fields), the registry read path (`readRegistry` + `filterEntries`), the SP1/SP2 join logic (4 cases), and the gate-log writer (drift surfacing is a "log" event, not a "resolve" event). The 557 existing tests are the contract that must not regress. Tests-first locks the contract before any code changes. SP3's TDD structure mirrors SP2's proven pattern (24 unit + 24 tool + 2 acceptance + 2 grounding-mode = 52 new tests).

**Surface:** `meta` (changes to the loop's own machinery, not `product/**`).

## Why Phase 1 Only

The parent doc separates SP3 into:
- **Phase 1 (this plan):** read-only query. The agent queries; the agent decides (call `meta_state_resolve`, log a drift event, investigate).
- **Phase 2 (deferred 30 days):** opt-in auto-mutation via `auto_resolve: true` parameter. The tool mutates drifted entries to `resolved` automatically.

The parent doc's rationale for the 30-day deferral: "auto-mutation is the highest-stakes change in the meta-state machinery. Prove the drift rate is stable first." The operator's brainstorm decision: **ship Phase 1 only**. Phase 2 is captured as a stub section in this report ("Out of Scope → Phase 2 Design") and will be a follow-up brainstorm once 30 days of drift-rate data is collected.

## Goals

1. **Surface drift events across the entire registry** in a single tool call. The agent's resolution path becomes: SP3 surfaces → SP1/SP2 explains → agent decides → `meta_state_resolve` acts.
2. **Default to derivation-only** (`run_grounding: false`) for fast queries. The cascading-failure risk (SP2 broken → SP3 broken) is the bigger concern than "missed discoverability" — keep SP3 working even when SP2 is broken.
3. **Join SP1+SP2 cleanly** when `run_grounding: true` is opted in. 4 join cases are enumerated below; the join is the new logic in SP3.
4. **Prove the join works** via 2 grounding-mode tests in the test budget. The 50+ test count is achieved without making `run_grounding: true` the default.
5. **Lock the contract for future SP3+ tools** that might want to aggregate across multiple SP1/SP2 views (e.g., a future "drift timeline" tool).

## Non-Goals

1. **Auto-mutation** of drifted entries (Phase 2 — deferred).
2. **Schema-derived tool zod** (Approach 3 — sequenced after SP3 per `docs/trajectory.md`).
3. **Multi-registry aggregation** (the meta-state is single-registry for now; future federated registries are out of scope).
4. **Drift event persistence** (drift events are computed on-demand; not stored in `meta-state.jsonl`).
5. **Continuous drift monitoring** (the agent queries on-demand; no background watcher).
6. **Filter expansion** (`category?`, `affected_system?`, `entry_kind?` filters) — deferred to a future iteration per the operator's "Minimal" filter choice.

## Locked Design Decisions

The following 14 decisions are locked (consensus reached during this brainstorm session):

| # | Decision | Value | Rationale |
|---|---|---|---|
| 1 | Phase scope | Phase 1 only (read-only); Phase 2 stub | Operator chose Phase 1 only; Phase 2 deferred to future brainstorm after drift-rate data |
| 2 | Tool name | `meta_state_query_drift` | Mirrors SP1/SP2 naming; appended to `meta_state` group |
| 3 | Tool role | Agent-callable | Mirrors `meta_state_derive_status`, `meta_state_list`; consistent with read-side |
| 4 | Input shape | `{ filter?: { status?: 'active' \| 'reported' }, run_grounding?: boolean }` | Minimal filter (status only); `run_grounding` defaults to `false` per operator debate |
| 5 | Output shape | `{ drift_count: number, drift_events: Array<{ id, raw_status, derived_status, drift_kind, recommendation }> }` | Lean: 5 fields per event, no nested SP1/SP2 outputs; agent drills in via SP1/SP2 tools |
| 6 | `drift_kind` enum | Single value: `"assertion_lags_derivation"` | Parent doc; agent drills in for source via SP1/SP2 |
| 7 | Pure function | `core/query-drift.js` exports `queryDrift(entries, codeContext) -> DriftReport` | Mirrors SP1 (`core/derive-status.js`) and SP2 (`core/check-grounding.js`); pure (no I/O) |
| 8 | Internal join | Calls `deriveStatus` (SP1) for every entry; if `run_grounding: true`, also calls `checkGrounding` (SP2) | Joins in pure function; tool wraps with I/O |
| 9 | Schemas | Hand-written zod (mirror SP0/SP1/SP2); no new JSON schema | Ship velocity; consistent with siblings; Approach 3 is post-SP3 |
| 10 | Test budget | 52 new tests, 4 phases | 24 unit + 24 tool + 2 acceptance + 2 grounding-mode = 52; baseline 557 → 609 |
| 11 | Phase structure | (0) G8 observation + scaffolding, (1) pure function TDD, (2) tool TDD (default mode), (3) manifest + acceptance + grounding-mode tests | Mirrors SP2's 4-phase pattern |
| 12 | Manifest updates | `tools/manifest.json` (+1 line at end of meta-state group); `agent-manifest.json` (+1 entry in `meta_state` group) | Mirrors SP1/SP2 pattern |
| 13 | Acceptance test | End-to-end on 3 real findings: (a) known-drifted SP1 case, (b) stable case (no drift), (c) grounding-mode test (proves join) | Mirrors SP1/SP2 acceptance test pattern |
| 14 | Out of scope | Phase 2 auto-mutation, Approach 3 codegen, expanded filter, change-log drift checks | Documented in "Out of Scope" section |

## Tool Shape

### Input

```js
meta_state_query_drift({
  filter?: {
    status?: "active" | "reported",  // default: no filter (returns both)
  },
  run_grounding?: boolean,  // default false; when true, invokes SP2's checkGrounding per entry
})
```

**Defaults:**
- `filter`: `undefined` (returns all non-terminal entries)
- `run_grounding`: `false` (derivation-only; fast; no SP2 invocation)

### Output

```json
{
  "drift_count": 2,
  "drift_events": [
    {
      "id": "meta-260601T1339Z-the-learning-loop-...",
      "raw_status": "active",
      "derived_status": "resolved-by-mechanism",
      "drift_kind": "assertion_lags_derivation",
      "recommendation": "resolve"
    },
    {
      "id": "meta-260602T1112Z-live-g8-subcommand-...",
      "raw_status": "active",
      "derived_status": "active-no-signal",
      "drift_kind": "assertion_lags_derivation",
      "recommendation": "investigate"
    }
  ]
}
```

**Field semantics:**
- `id`: the meta-state entry ID (matches `meta-state.jsonl`).
- `raw_status`: the entry's stored `status` field (e.g., `"active"`, `"reported"`).
- `derived_status`: SP1's `deriveStatus(entry).derived_status` (one of `"resolved-by-mechanism"`, `"active-no-signal"`, `"active-uncertain"`, or `"active-no-signal"` for change-log fast path).
- `drift_kind`: always `"assertion_lags_derivation"` in Phase 1. The agent calls SP1 or SP2 directly to see the source.
- `recommendation`: one of `"resolve"` (drift is real, agent should call `meta_state_resolve`), `"investigate"` (drift may be false positive, agent should drill in via SP1/SP2), `"no_action"` (drift is benign — not currently emitted in Phase 1, reserved for Phase 2).

### Recommendation Triggers

| SP1 result | SP2 result (if `run_grounding: true`) | Recommendation |
|---|---|---|
| `resolved-by-mechanism` | `grounded` (or `skipped`) | `resolve` (derivation is conclusive; ground confirms) |
| `resolved-by-mechanism` | `drifted` (hash mismatch / test failed) | `resolve` (derivation is primary; ground drift is secondary — agent should investigate ground drift via `meta_state_refresh_fingerprint`) |
| `active-no-signal` | `drifted` (hash mismatch / test failed) | `investigate` (derivation has no signal; ground is the only signal — agent should drill in via SP2) |
| `active-no-signal` | `grounded` (or `skipped`) | `no_drift` (NOT emitted; no drift to surface) |
| `active-uncertain` | any | `investigate` (derivation is uncertain; agent should drill in via SP1) |
| `code-missing` | (SP2 would also return `code_missing`) | `investigate` (the mechanism is gone; agent should verify the entry is still meaningful) |
| `code-only` | n/a | `no_drift` (NOT emitted; the file exists but has no mechanism) |
| `no-signals` (change-log) | n/a | `no_drift` (NOT emitted; change-logs are not derivable) |

The full join logic is enumerated in the pure-function spec below.

## Architecture

### Module: `core/query-drift.js` (NEW, ~80 LOC)

```js
// tools/learning-loop-mcp/core/query-drift.js
import { deriveStatus } from "./derive-status.js";
import { checkGrounding } from "./check-grounding.js";

/**
 * Pure drift-aggregation function. Joins SP1's deriveStatus + SP2's
 * checkGrounding across the registry; filters for drift events.
 *
 * Mirrors SP1 (deriveStatus) and SP2 (checkGrounding) patterns:
 * - No I/O at unit level (filesystem access via codeContext.root)
 * - Time is injected via codeContext.now (default () => Date.now())
 * - Caller (the MCP tool) provides the entries; the function does NOT
 *   call readRegistry. This is a verifier + aggregator, not a reader.
 *
 * @param {Array} entries - registry entries (caller filters for non-terminal status)
 * @param {Object} codeContext - { root, run_tests?, test_passed?, now? }
 * @returns {{ drift_count: number, drift_events: DriftEvent[] }}
 */
export function queryDrift(entries, codeContext = {}) {
  const t0 = (codeContext.now || Date.now)();
  const runGrounding = codeContext.run_grounding === true;

  const driftEvents = [];

  for (const entry of entries) {
    // SP1 derivation
    const derivation = deriveStatus(entry, codeContext);

    // Skip change-log fast path (no-signals → no drift to surface)
    if (derivation.derivation.kind === "no-signals") continue;

    // Determine if this entry is a drift candidate from SP1
    const derivationSaysResolved =
      derivation.derived_status === "resolved-by-mechanism";

    // Optionally run SP2 grounding
    let grounding = null;
    if (runGrounding && entry.evidence_code_ref) {
      grounding = checkGrounding(entry, codeContext);
    }

    // Join logic: 4 cases
    const isDrift = computeIsDrift(derivation, grounding, entry);
    if (!isDrift) continue;

    // Compute recommendation based on join result
    const recommendation = computeRecommendation(derivation, grounding);

    driftEvents.push({
      id: entry.id,
      raw_status: entry.status,
      derived_status: derivation.derived_status,
      drift_kind: "assertion_lags_derivation",
      recommendation,
    });
  }

  return {
    drift_count: driftEvents.length,
    drift_events: driftEvents,
  };
}

/**
 * Internal helper: 4-case join logic.
 * Returns true iff the entry's raw_status disagrees with the joined view.
 */
function computeIsDrift(derivation, grounding, entry) {
  const rawActive = entry.status === "active" || entry.status === "reported";
  if (!rawActive) return false; // terminal entries are not drift

  // SP1 says resolved → drift (derivation source)
  if (derivation.derived_status === "resolved-by-mechanism") return true;

  // SP2 says drifted → drift (grounding source) — only if SP2 was run
  if (grounding && grounding.status === "drifted") return true;

  return false;
}

/**
 * Internal helper: recommendation based on join result.
 */
function computeRecommendation(derivation, grounding) {
  // SP1 says resolved + SP2 says grounded (or skipped) → resolve
  if (derivation.derived_status === "resolved-by-mechanism" &&
      (!grounding || grounding.status === "grounded" || grounding.status === "skipped")) {
    return "resolve";
  }

  // SP1 says resolved + SP2 says drifted → resolve (primary = derivation; ground drift is secondary)
  if (derivation.derived_status === "resolved-by-mechanism" &&
      grounding && grounding.status === "drifted") {
    return "resolve";
  }

  // SP1 says active + SP2 says drifted → investigate (ground is the only signal)
  if (derivation.derived_status !== "resolved-by-mechanism" &&
      grounding && grounding.status === "drifted") {
    return "investigate";
  }

  // SP1 says active-uncertain → investigate
  if (derivation.derived_status === "active-uncertain") {
    return "investigate";
  }

  // Default: resolve (shouldn't reach here for the 4 join cases)
  return "investigate";
}
```

### Module: `tools/meta-state-query-drift-tool.js` (NEW, ~60 LOC)

```js
// tools/learning-loop-mcp/tools/meta-state-query-drift-tool.js
import { readRegistry, filterEntries } from "../core/meta-state.js";
import { queryDrift } from "../core/query-drift.js";
import { resolveRoot } from "../lib/resolve-root.js";
import { appendGateLog } from "../lib/gate-logging.js";

export const metaStateQueryDriftTool = {
  name: "meta_state_query_drift",
  description: "Aggregate drift events across the meta-state registry. Joins SP1's deriveStatus + SP2's checkGrounding. Read-only: the agent decides what to do with the result.",
  inputSchema: {
    type: "object",
    properties: {
      filter: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["active", "reported"] },
        },
        additionalProperties: false,
      },
      run_grounding: { type: "boolean", default: false },
    },
    additionalProperties: false,
  },
  handler: async ({ filter, run_grounding = false }) => {
    const root = resolveRoot();
    const registry = readRegistry();
    const nonTerminal = filterEntries(registry, { status: filter?.status || null });

    const codeContext = {
      root,
      run_grounding,
      run_tests: false, // SP3 never runs tests (SP1/SP2 can opt-in)
      test_passed: null,
      now: () => Date.now(),
    };

    const result = queryDrift(nonTerminal, codeContext);

    // Log the query event (drift surfacing is a "log" event, not a "resolve" event)
    appendGateLog({
      event: "meta_state_query_drift",
      filter,
      run_grounding,
      drift_count: result.drift_count,
    });

    return result;
  },
};
```

### Manifest Updates

**`tools/manifest.json`** (1 line added at end of `meta-state-*` group, mirroring SP2):
```json
{ "file": "./tools/meta-state-query-drift-tool.js", "export": "metaStateQueryDriftTool" }
```

**`agent-manifest.json`** (1 entry added to `meta_state` group):
```json
"meta_state_query_drift"
```

## Join Logic (cases enumerated)

NOTE: SP1's `derived_status` enum has 3 values (`resolved-by-mechanism`, `active-no-signal`, `active-uncertain`); SP1's `derivation.kind` enum has 4 values (adds `code-missing` and `no-signals`). The `code-missing` case is captured in the `kind`, not the `derived_status`. The join table below uses the correct field for each case.

| Case | SP1 `derivation.kind` | SP1 `derived_status` | SP2 `status` (if `run_grounding: true`) | Drift? | Recommendation |
|---|---|---|---|---|---|
| 1 | `mechanism-shipped` | `resolved-by-mechanism` | `grounded` or `skipped` (or SP2 not run) | YES | `resolve` |
| 2 | `mechanism-shipped` | `resolved-by-mechanism` | `drifted` (hash / test) | YES | `resolve` (primary = derivation) |
| 3 | `no-signals` or `mechanism-shipped` (but no resolution) | `active-no-signal` | `drifted` (hash / test) | YES | `investigate` |
| 4 | `no-signals` or `mechanism-shipped` (but no resolution) | `active-no-signal` | `grounded` or `skipped` (or SP2 not run) | NO | n/a |
| 5 | `code-only` | `active-uncertain` | any | YES | `investigate` |
| 6 | `code-missing` | `active-no-signal` | (SP2 would also return `code_missing` if it ran) | YES | `investigate` |
| 7 | `no-signals` (change-log) | `active-no-signal` | n/a | NO (change-log fast path skips in `queryDrift`) | n/a |
| 8 | `code-only` | `active-uncertain` | (no SP2 drift) | NO | n/a |

Cases 1, 2, 3, 5, 6 are drift events; cases 4, 7, 8 are not. Case 3 is the "grounding-only" drift — derivation has no signal, but ground is the only signal. Case 6 is the "mechanism gone" drift — the file referenced by `evidence_code_ref` no longer exists.

## Test Plan

### Phase 1: Pure function `queryDrift` (24 unit tests, TDD)

| # | Test | What it covers |
|---|---|---|
| T-1 to T-4 | SP1-only cases (no `run_grounding`) | The 4 cases for derivation-only: resolved, active-no-signal, active-uncertain, code-missing, code-only, no-signals |
| T-5 to T-8 | SP1+SP2 join cases | The 4 join cases enumerated above |
| T-9 to T-12 | Recommendation triggers | Each recommendation value (`resolve`, `investigate`, `no_drift`) is tested in isolation |
| T-13 to T-16 | Filter behavior | `filter.status: "active"` returns only active entries; `filter.status: "reported"` returns only reported entries; no filter returns both |
| T-17 to T-20 | Edge cases | Empty registry, single entry, large registry (100+), change-log fast path skipped |
| T-21 to T-24 | Path/semantics edge cases | Terminal status (resolved, expired) → not drift; null `evidence_code_ref`; corrupted `code_fingerprint`; non-derivable kind |

### Phase 2: `meta_state_query_drift` Tool (24 tool tests, TDD)

| # | Test | What it covers |
|---|---|---|
| T-25 to T-28 | Default mode (`run_grounding: false`) | Tool returns derivation-only drift; gate log entry created; no SP2 invocation |
| T-29 to T-32 | Filter behavior | Each `filter.status` value; no filter; invalid filter (zod rejection) |
| T-33 to T-36 | Empty / boundary registries | Empty registry → `{ drift_count: 0, drift_events: [] }`; single entry; all-terminal entries |
| T-37 to T-40 | Input validation | Missing `run_grounding` (default false); invalid types; extra fields (`additionalProperties: false`); null filter |
| T-41 to T-44 | Output shape | All 5 fields per event; `drift_count` matches `drift_events.length`; `drift_kind` always `"assertion_lags_derivation"` |
| T-45 to T-48 | Gate log integration | Every tool call appends a gate log entry; log entry shape matches the locked spec |

### Phase 3: Manifest Registration + Acceptance Test (2 acceptance + 2 grounding-mode = 4 tests)

**Acceptance tests (2):**
- AT-1: End-to-end on a real `meta-state.jsonl` finding with `derived_status: "resolved-by-mechanism"` → tool returns drift event with `recommendation: "resolve"`. Use a finding from the SP1 acceptance test (the same `meta-260601T1339Z-...` entry that demonstrates derivation).
- AT-2: End-to-end on a stable finding (no drift expected) → tool returns `{ drift_count: 0, drift_events: [] }`. Use a finding whose `evidence_code_ref` is still live and whose `raw_status` matches `derived_status`.

**Grounding-mode tests (2):**
- GM-1: With `run_grounding: true`, invoke on a real `mechanism_check: true` finding where the file's hash matches → returns NO drift event (SP2 says grounded; SP1 says active-no-signal → no drift per case 4).
- GM-2: With `run_grounding: true`, invoke on a real `mechanism_check: true` finding where the file's hash has changed (mutation between calls) → returns drift event with `recommendation: "investigate"` (SP2 says drifted; SP1 says active-no-signal → drift per case 3).

### Test Count Reconciliation

| Source | Count | Notes |
|---|---|---|
| Pre-SP3 (after SP2 gap closure) | 557 | Baseline |
| Phase 1 unit | 24 | Pure function |
| Phase 2 tool | 24 | Tool wrapper |
| Phase 3 acceptance | 2 | Real findings |
| Phase 3 grounding-mode | 2 | Join proof |
| **Total after SP3** | **609** | New total: 557 + 52 |

The "Richer" 50+ test budget is met exactly: 24 + 24 + 2 + 2 = 52. The grounding-mode tests are the "join proof" — they verify the SP1+SP2 join works without making `run_grounding: true` the default.

## Phase Structure (4 phases)

### Phase 0: G8 Observation + Plan Scaffolding
- Log the plan's existence as a meta-state change-log entry (mirror SP0 Phase 5).
- Scaffold the 4 phase files + the plan.md via Create tool (per G8 workaround).
- Document the G8 6th recurrence in `meta-state.jsonl`.

### Phase 1: Pure function `queryDrift` (TDD, 24 unit tests)
- Write `core/query-drift.js` (RED → GREEN).
- Imports `deriveStatus` from `core/derive-status.js` and `checkGrounding` from `core/check-grounding.js`.
- Unit tests cover the 4 join cases + 4 SP1-only cases + 4 recommendation triggers + 4 filter/edge cases + 4 path/semantics edge cases = 24 tests.
- All 557 existing tests must still pass.

### Phase 2: `meta_state_query_drift` Tool (TDD, 24 tool tests)
- Write `tools/meta-state-query-drift-tool.js` (RED → GREEN).
- Wire `readRegistry`, `filterEntries`, `resolveRoot`, `appendGateLog` from existing modules.
- Tool tests cover default mode, filter behavior, empty registries, input validation, output shape, gate log integration = 24 tests.
- All 557 + 24 = 581 tests must still pass.

### Phase 3: Manifest Registration + Acceptance Test (4 tests)
- Add 1 line to `tools/manifest.json` and 1 entry to `agent-manifest.json` `meta_state` group.
- Write 2 acceptance tests on real findings + 2 grounding-mode tests on real `mechanism_check: true` findings.
- All 557 + 24 + 24 + 4 = 609 tests must pass.
- Update `docs/journals/260605-sp3-cook.md` with the cook journal.

## Out of Scope

### Phase 2 Design (stub for future brainstorm)

The parent doc proposes Phase 2 as:

```js
meta_state_query_drift({
  // ... all Phase 1 fields ...
  auto_resolve?: boolean,  // NEW in Phase 2; default false
  drift_event_filter?: "all" | "derivation-only" | "grounding-only",  // NEW in Phase 2
})
```

When `auto_resolve: true`, the tool:
1. Filters drift events per `drift_event_filter`
2. Calls `meta_state_resolve` for each drift event with `recommendation: "resolve"`
3. Skips drift events with `recommendation: "investigate"`
4. Returns the same output shape + a `resolved_count` field

**The 30-day deferral rationale (parent doc):**
- Phase 2 is the highest-stakes change in the meta-state machinery (auto-mutation).
- We need 30 days of drift-rate data to prove:
  - The drift rate is stable (not spiking due to recent changes)
  - The "investigate" recommendations are rare (most drifts are clear-cut)
  - The agent's resolution decisions match the tool's recommendations (operator-trust measurement)
- After 30 days, a follow-up brainstorm locks Phase 2's design with real data.

**Follow-up plan handoff:** after the 30-day window, create a new brainstorm report (likely `plans/reports/brainstorm-260607-sp3-phase-2.md`) that re-derives the auto-mutation policy from the actual drift data.

### Approach 3 Codegen (deferred to `260603-approach-3-schema-driven-builder`)

`docs/trajectory.md` sequences Approach 3 (full schema-driven builder) after SP3 ships. The new tool's hand-written zod will be migrated to schema-derived zod in a follow-up plan. This is not SP3's concern; the locked design defers the migration to a future plan.

### Expanded Filter Shape

`category?`, `affected_system?`, `entry_kind?` filters are deferred. The operator's "Minimal" choice locks `status?` only for Phase 1. Future iterations can add fields as the registry grows.

### Change-log Drift Checks

The change-log entry kind (`entry_kind: "change-log"`) is currently a no-op in SP3 (skipped via the "no-signals" fast path). A future enhancement could surface "stale" change-log entries (entries whose referenced files have changed), but this is a separate concern from assertion-vs-derivation drift.

## Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R-1 | `run_grounding: false` default may miss grounding-source drift on opt-in entries | Low | The `run_grounding: true` parameter is exposed from day 1; agent can opt-in per query. Documented in tool description. |
| R-2 | SP2's `checkGrounding` returning a non-`grounded`/`drifted`/`skipped`/`unknown` status (corrupted state) | Low | The 4 join cases assume the locked 4-value SP2 status enum; if SP2 returns an unknown value, `computeIsDrift` defaults to "not drift" (safe default). Unit test T-24 covers this. |
| R-3 | The `queryDrift` function is called on EVERY entry, even ones with `entry_kind: "change-log"` (no signals) | Low | The `derivation.kind === "no-signals"` early-return filters them out. Unit test T-20 covers this. |
| R-4 | Gate log volume: every SP3 query creates a log entry | Low | Drift surfacing is a "log" event by design; the volume is bounded by the number of drift queries (not drift events). Documented in the gate-log integration. |
| R-5 | Test fixtures: 2 grounding-mode tests need `mechanism_check: true` entries with mutable files | Medium | Use the same temp-file pattern as SP2's acceptance tests; the SP2 fixtures can be reused. |
| R-6 | The 4-case join logic may miss a case | Medium | The 4 cases are enumerated exhaustively in the test plan (T-1 to T-12); each case has a dedicated test. |
| R-7 | Operator may want `run_grounding: true` as the default in a future iteration | Low | The parameter is exposed; a future plan can change the default. Documented in the report's "Open Questions" section. |
| R-8 | SP3's tool schema is hand-written zod; drift vs. SP1/SP2's schemas | Low | The 3 meta-state tools (SP1/SP2/SP3) have different shapes; no shared schema today. The field-coverage test covers 4 record types, not the 3 meta-state tools. Approach 3 is the post-SP3 fix. |
| R-9 | The `drift_kind` enum has only 1 value in Phase 1; an agent may expect more granular values | Low | Documented in the tool's description; future enhancement can expand the enum. The "agent drills in via SP1/SP2" pattern is the immediate workaround. |

## Open Questions

1. **Should the `drift_count` field be capped at a max value?** For very large registries, the count could be 100+. A cap (e.g., `drift_count > 50` returns `drift_count: 50, truncated: true`) would prevent tool-output bloat. **Decision: no cap in Phase 1; defer to Phase 2 if the count proves unwieldy in practice.**

2. **Should the tool return a `checked_at` timestamp per event?** SP1 returns `derivation.checked_at` and SP2 returns `grounding.checked_at`. Surfacing the joined timestamp in SP3's output is additive (1 field per event). **Decision: defer; the agent can call SP1/SP2 directly to see timestamps. Adding the field is a 1-line future change.**

3. **Should the 2 active discoverability gaps (internalization rule + meta-state.jsonl) be surfaced in the `meta_state_query_drift` output?** These gaps mean agents may not know to call SP3. **Decision: out of scope for SP3; the `loop_describe` warm tier can surface SP3's existence, but that's a separate enhancement to the `loop_describe` tool.**

4. **Should SP3 log a "drift surfacing" change-log entry per query, or only when drift_count > 0?** The current design logs every query. **Decision: keep every-query logging; the volume is bounded by the number of drift queries, not drift events.**

## Success Criteria

- [x] `core/query-drift.js` exists, exports `queryDrift`, all 24 unit tests pass
- [x] `tools/meta-state-query-drift-tool.js` exists, all 24 tool tests pass
- [x] `tools/manifest.json` has the new line; `agent-manifest.json` `meta_state` group has the new entry
- [x] 2 acceptance tests pass on real findings
- [x] 2 grounding-mode tests pass with `run_grounding: true`
- [x] All 557 existing tests still pass
- [x] `pnpm test` shows 609 pass, 0 fail
- [x] `pnpm validate:records` passes
- [x] `pnpm validate:plan-loop` passes
- [x] `core/query-drift.js` is < 100 LOC (KISS)
- [x] The 4 join cases are enumerated and tested
- [x] The recommendation triggers are documented and tested
- [x] Phase 2 auto-mutation is documented as out-of-scope with a stub section
- [x] The cook journal mirrors the SP0/SP1/SP2 cook pattern
- [x] No `ck plan create` invocations (G8 workaround: Create tool directly)

## References

### Parent + Sibling Design Docs

- `plans/reports/brainstorm-260602-meta-state-agent-affordances.md` — parent doc, SP3 section (line 230+)
- `plans/reports/brainstorm-260602-sp0-log-change.md` — SP0 locked design (sibling)
- `plans/reports/brainstorm-260602-sp1-derive-status.md` — SP1 locked design (sibling, joined by SP3)
- `plans/reports/brainstorm-260602-sp2-check-grounding.md` — SP2 locked design (sibling, optionally joined by SP3)
- `plans/reports/brainstorm-260603-sp2-discoverability-and-manifest-backfill.md` — immediate SP3 prerequisite (completed 2026-06-03)

### Code References

- `tools/learning-loop-mcp/core/derive-status.js` — SP1's pure function (joined by SP3 unconditionally)
- `tools/learning-loop-mcp/core/check-grounding.js` — SP2's pure function (joined by SP3 when `run_grounding: true`)
- `tools/learning-loop-mcp/core/meta-state.js` — registry read/write primitives (`readRegistry`, `filterEntries`)
- `tools/learning-loop-mcp/lib/resolve-root.js` — `resolveRoot` for `codeContext.root`
- `tools/learning-loop-mcp/lib/gate-logging.js` — `appendGateLog` for drift query events
- `tools/learning-loop-mcp/tools/meta-state-derive-status-tool.js` — SP1 sibling tool (pattern reference)
- `tools/learning-loop-mcp/tools/meta-state-check-grounding-tool.js` — SP2 sibling tool (pattern reference)
- `tools/learning-loop-mcp/tools/manifest.json` — tool registry (50+ tools; +1 line for SP3)
- `tools/learning-loop-mcp/agent-manifest.json` — grouped structure (+1 entry in `meta_state` group)
- `tools/learning-loop-mcp/__tests__/loop-describe.test.js` — discoverability test surface (the existing test from the 260603-sp2-discoverability plan should be extended to include `meta_state_query_drift`)

### Plan Pattern References

- `plans/260602-sp2-check-grounding/plan.md` — sibling 4-phase TDD plan (pattern reference for SP3's 4-phase structure)
- `plans/260602-sp1-derive-status/plan.md` — sibling TDD plan (pattern reference for pure-function + tool wrapper)
- `plans/260602-sp0-log-change/plan.md` — sibling TDD plan (pattern reference for change-log entries + 5-phase structure with G8 observation phase)
- `plans/260603-sp2-discoverability-and-manifest-backfill/plan.md` — gap-closure pattern (the loop-describe test extension is a sub-task of Phase 3)

### Open Loop Gaps (Context, Not Blockers)

- 2 active meta-state findings (internalization rule discoverability, meta-state.jsonl discoverability) — both are `active` in `meta-state.jsonl` and do not block SP3; surfacing them in `loop_describe` warm tier is a follow-up enhancement.
- 5th G8 subcommand-class false positive recurrence (2026-06-03) — the operator-approved workaround (Create tool directly) is the canonical plan-scaffolding method; SP3's plan uses this workaround in Phase 0.
- Phase 0.5 strict-AJV upgrade (from field-coverage Phase 0) — deferred follow-up; not blocking SP3.
- Gap-assertion record update (from field-coverage Phase 4) — deferred follow-up; requires successor assertion, out of scope for SP3.
