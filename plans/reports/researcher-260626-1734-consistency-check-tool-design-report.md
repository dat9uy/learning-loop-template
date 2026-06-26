# Research Report: `meta_state_consistency_check` Tool Design

Researcher: researcher (subagent)
Date: 2026-06-26
Mode: ck-plan --deep
Target finding: `meta-260614T1236Z-no-automated-registry-consistency-check-exists-to-detect-ent` (`meta-state.jsonl:114`)

## 1. Invariant Spec

The target finding description lists four invariants explicitly. Reading the surrounding schemas, lifecycle tools, and core code surfaces a wider set. Below is the complete spec the check must enforce, partitioned by what is documented in the finding vs. what is implicit in the existing code.

### 1.1 Invariants explicitly stated in the finding (`meta-state.jsonl:114`)

| # | Status | Required audit fields |
|---|--------|----------------------|
| F-1 | `active` | MUST NOT carry `resolved_at` or `resolution` |
| F-2 | `archived` | MUST carry `archived_at`, `archived_by`, `archived_reason` |
| F-3 | `resolved` | MUST carry `resolved_by` (and `resolved_at` — set together by `meta_state_resolve`) |
| F-4 | `superseded` | MUST carry `consolidated_into` |

### 1.2 Implicit invariants the check should also enforce

These are derivable from the existing schema, lifecycle tools, and the find-and-fix gap from session 06085a38 (the precedent the finding cites). Each is enforced today only by tool-side discipline, not by any registry-layer probe.

| # | Rule | Source |
|---|------|--------|
| I-1 | `status: resolved` MUST carry `resolved_at` | `meta-state-resolve-tool.js:153-159` (atomic patch sets `status`, `resolved_at`, `resolved_by`, optional `resolution`) |
| I-2 | `status: resolved` MUST NOT carry `acked_at` (terminal supersedes operator-ack timestamp) | `meta-state-resolve-tool.js:153-159` does not preserve `acked_at` when transitioning to terminal; the only other `acked_at` site is `meta-state-ack-tool.js:55` on the reported→active path |
| I-3 | `status: archived` MUST carry `archived_at` (same atomic patch as F-2) | `core/meta-state.js:476-482` (`archiveEntry`) and `meta-state-archive-tool.js:111` |
| I-4 | `status: superseded` MUST carry `superseded_at` and `superseded_by` | `meta-state-supersede-tool.js:44-51` (atomic patch: `status`, `superseded_at`, `superseded_by`, `consolidated_into`, optional `resolution`) |
| I-5 | `status: active` MUST carry `acked_at` (operator-ack timestamp) | `meta-state-ack-tool.js:55` sets `status: "active"` together with `acked_at`; no other path sets `active` |
| I-6 | `status: active` MUST NOT carry `consolidated_into` (that field is the inverse of a change-log's `consolidates`, set only on `superseded`) | `metaStateFindingEntrySchema.consolidated_into` `.describe()` line 75-76 |
| I-7 | `status: auto-resolved` MUST carry `resolution` (closed-by-mechanism requires a reason) | `META_STATE_DERIVATION_KINDS` and `computeDrift` flow; auto-resolve always sets a resolution note in the sweep |
| I-8 | `status: reported` SHOULD carry `expires_at` (24h TTL set by `writeEntry`) | `core/meta-state.js:619-627` (`checkExpiry` reads `expires_at`; `meta-state-report-tool.js` sets it on write) |
| I-9 | Change-log entries (`entry_kind: "change-log"`) MUST have `status: "active"` (immutable audit log) | `metaStateChangeEntrySchema.status: z.literal("active").default("active")` (`meta-state.js:153`) |
| I-10 | `superseded_by` on a `superseded` entry MUST be `"operator"` (tool-side enforced default) | `meta-state-supersede-tool.js:47` hardcodes `superseded_by: "operator"` |
| I-11 | A `resolved` entry MAY carry `resolution` (optional, but `resolved_by` is required) | F-3 + `meta-state-resolve-tool.js:158` |
| I-12 | `consolidated_into` value, when present, MUST reference an existing change-log id | Mirrors `meta-state-supersede-tool.js:35-40` validation (defense-in-depth; the check is read-only and may downgrade this to "report" without blocking) |

### 1.3 Out of scope (do NOT check)

- Cross-entry referential integrity beyond I-12 (e.g., `reopens` array contents). The dedicated `meta_state_relationship_validate` tool already covers this.
- TTL/expires_at timing. The sweep tool owns staleness transitions.
- SP1 derivation (mechanism-shipped) — the `meta_state_query_drift` tool already covers this.
- SP2 grounding (code_fingerprint hash match) — `meta_state_check_grounding` owns this.

The check is structurally orthogonal: it inspects a single entry's `status` value against the audit-trail fields on the same entry, not external state.

## 2. Core Function Design

### 2.1 Location

New file: `tools/learning-loop-mastra/core/consistency-check.js` (mirrors the `query-drift.js` and `derive-status.js` layout at `core/`).

The function must live in `core/` (not in the tool layer) for the same reasons as `queryDrift`:
- Pure (no I/O, no subprocess)
- Testable in isolation from the MCP tool harness
- Reusable by future surface variants (the existing `deriveStatus` is also consumed by SP3)

### 2.2 Signature

```js
// core/consistency-check.js
export function consistencyCheck(entries)
```

Follows the `queryDrift(entries, codeContext = {})` shape but takes no `codeContext` because consistency is purely structural (no filesystem reads, no derived state). The function is filter-agnostic; the tool layer is responsible for any pre-filtering (matching SP3's contract at `core/query-drift.js:20`).

### 2.3 Output shape

```js
{
  drift_count: <number>,
  drift_events: [
    {
      id: <string>,
      entry_kind: <"finding" | "change-log" | "rule" | "loop-design">,
      status: <raw status string>,
      invariant_id: <"F-1" | "F-2" | ... | "I-N">,
      message: <human-readable description of the breach>,
      // Optional: which audit fields are present or missing
      present_fields: <string[]>,
      missing_fields: <string[]> | <null>,
      forbidden_fields: <string[]> | <null>,
    },
    ...
  ],
}
```

Mirrors the `queryDrift` event shape: lean, no nested derivation, one event per `(entry, invariant)` pair. If a single entry breaches multiple invariants, emit one event per breach. This is consistent with SP3's "lean drift event shape" pattern (`__tests__/legacy-mcp/query-drift.test.js:36-49`).

### 2.4 Algorithm

For each entry in the registry:
1. Skip if `entry_kind === "rule"` or `entry_kind === "loop-design"`. Rule statuses are binary (`active` / `inactive`) with no audit-trail fields beyond `promoted_at` / `refined_at`; loop-design statuses are binary with `shipped_at` / `shipped_in_plan`. These branches have their own (much smaller) invariant set that the find-and-fix gap didn't surface. **Decision deferred** — see Section 5.
2. Run the invariant tests for `entry_kind === "finding"` (F-1..F-4, I-1..I-8, I-10, I-11, I-12).
3. Run the invariant test for `entry_kind === "change-log"` (I-9).
4. Collect all breaches as `drift_events`.

### 2.5 Exports

```js
// core/consistency-check.js
export const META_STATE_CONSISTENCY_INVARIANTS = [
  // Ordered list, referenced by invariant_id field
];
export function consistencyCheck(entries) { ... }
```

`META_STATE_CONSISTENCY_INVARIANTS` is exported so introspection layers (e.g. `core/loop-introspect.js`) and tests can derive the canonical invariant list from one source — mirrors the `META_STATE_DERIVATION_KINDS` pattern at `core/derive-status.js:8`.

## 3. MCP Tool Design

### 3.1 Handler shape

New file: `tools/learning-loop-mastra/tools/legacy/meta-state-consistency-check-tool.js`. Mirrors `meta-state-query-drift-tool.js:17-64` (read-only, calls `resolveRoot`, `readRegistry`, `appendGateLog`).

```js
export const metaStateConsistencyCheckTool = {
  name: "meta_state_consistency_check",
  description: "Detect drift between entry `status` and audit fields. Read-only: the agent decides what to do with the result. Mirrors the `meta_state_query_drift` shape (lean events, no mutation).",
  schema: {
    // No filter argument in v1: the check is meant to walk the entire registry
    // to catch drift wherever it appears. If filters prove useful in practice,
    // add `filter: { status, entry_kind }` in a follow-up.
  },
  handler: async ({}) => {
    let root;
    try {
      root = resolveRoot();
    } catch (err) {
      return {
        content: [{ type: "text", text: JSON.stringify({
          error: "context_load_failed",
          reason: err.message,
        }) }],
      };
    }
    const registry = readRegistry(root);
    const result = consistencyCheck(registry);
    appendGateLog(root, {
      event: "meta_state_consistency_check",
      drift_count: result.drift_count,
    });
    return result;
  },
};
```

### 3.2 Schema

The tool is a probe (no inputs). No `z.object()` body required — the existing `meta-state-check-grounding-tool.js` (in `tools/legacy/`) and `meta-state-derive-status-tool.js` both accept arguments, so this is a deviation. If the MCP server requires a non-empty schema, an empty `z.object({})` body is the fallback (verify against `tools/learning-loop-mastra/tools/manifest.json` consumers if needed).

### 3.3 Manifest entry

Insert in `tools/learning-loop-mastra/tools/legacy/manifest.json`. The manifest has no explicit ordering convention (file lists appear roughly in registration order, with later additions appended). Insert at the end (after `check-runtime-agnostic-tool.js:32`):

```json
{ "file": "./tools/meta-state-consistency-check-tool.js", "export": "metaStateConsistencyCheckTool" }
```

This matches the pattern of every other read-only meta-state tool. No reordering of existing entries is required.

### 3.4 Gate log

Every call appends one `gate-log.jsonl` line with shape:

```json
{ "event": "meta_state_consistency_check", "drift_count": <number> }
```

Mirrors `meta-state-query-drift-tool.js:55-60`. No `tool` field on the event key (matches the SP3 tool pattern; some legacy tools use `tool: "name"` — either is acceptable since gate-log readers are permissive).

## 4. Test Plan (TDD order)

### 4.1 Core function tests — `tools/learning-loop-mastra/core/__tests__/consistency-check.test.js`

Mirror `query-drift.test.js` style: temp registry, hand-crafted entries, pure-function assertions.

TDD order (each test fails first, then is satisfied by the smallest change):

1. **C-1**: Empty registry → `{ drift_count: 0, drift_events: [] }` (locks the no-mutation, no-crash contract; mirrors `query-drift.test.js:282-286`)
2. **C-2**: Finding with `status: "active"` and `resolved_at: "2026-..."` + `resolution: "..."` → 1 drift event with `invariant_id: "F-1"` and `forbidden_fields: ["resolved_at", "resolution"]` (this is the exact pattern from session 06085a38 — the test that catches the original bug)
3. **C-3**: Finding with `status: "archived"` missing `archived_at` → 1 drift with `invariant_id: "F-2"` and `missing_fields: ["archived_at", "archived_by", "archived_reason"]`
4. **C-4**: Finding with `status: "archived"` carrying all three archive fields → 0 drift (positive control)
5. **C-5**: Finding with `status: "resolved"` missing `resolved_by` → 1 drift with `invariant_id: "F-3"` and `missing_fields: ["resolved_by"]` (and per I-1, also `missing_fields: ["resolved_at"]` if missing — emit as 2 events or 1 with multiple missing fields; see Section 5)
6. **C-6**: Finding with `status: "superseded"` missing `consolidated_into` → 1 drift with `invariant_id: "F-4"`
7. **C-7**: Finding with `status: "active"` missing `acked_at` → 1 drift with `invariant_id: "I-5"`
8. **C-8**: Finding with `status: "active"` carrying `consolidated_into` → 1 drift with `invariant_id: "I-6"`
9. **C-9**: Finding with `status: "auto-resolved"` missing `resolution` → 1 drift with `invariant_id: "I-7"`
10. **C-10**: Change-log with `status: "superseded"` → 1 drift with `invariant_id: "I-9"` (locks the change-log terminal-status guard)
11. **C-11**: Change-log with `status: "active"` → 0 drift
12. **C-12**: Finding breaching 3 invariants → 3 drift events (one event per invariant; locks the emit-per-breach design)
13. **C-13**: Rule entry (`entry_kind: "rule"`) → 0 drift in v1 (locks the deferred-to-follow-up decision; if a future change adds rule invariants, this test should be updated, not removed)
14. **C-14**: Loop-design entry → 0 drift in v1 (same as C-13)
15. **C-15**: 100+ mixed entries → performance smoke test (mirrors `query-drift.test.js:297-317`)
16. **C-16**: `META_STATE_CONSISTENCY_INVARIANTS` exported and contains at least the 4 explicit invariant ids (F-1..F-4) — guards against the export being deleted accidentally

### 4.2 Tool tests — `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-consistency-check-tool.test.js`

Mirror `meta-state-query-drift-tool.test.js` style: temp dir, `GATE_ROOT` env, real tool handler invocation, `readFileSync` on `gate-log.jsonl`.

TDD order:

1. **T-1**: Empty registry → handler returns `{ drift_count: 0, drift_events: [] }`
2. **T-2**: Seeded registry with one F-1 breach → handler returns 1 drift event with `invariant_id: "F-1"`
3. **T-3**: Every call appends exactly 1 gate-log entry with shape `{ event: "meta_state_consistency_check", drift_count: N }` (mirrors `query-drift-tool.test.js:507-521`)
4. **T-4**: `context_load_failed` path — handler returns the `content: [{ type: "text", text: JSON.stringify({ error: "context_load_failed", reason: ... }) }]` shape when `resolveRoot` throws (mirrors `meta-state-query-drift-tool.js:30-40`; force by clearing `GATE_ROOT`)
5. **T-5**: Read-only — handler invocation does NOT modify `meta-state.jsonl` (compare mtime + length before/after; guards against accidental write)
6. **T-6**: Registry with mixed findings + change-logs and 3 breaches → handler returns exactly 3 events in stable order (ordering test — explicit `Array.prototype.sort` of `invariant_id` to avoid platform-specific iteration order)
7. **T-7**: Lean event shape — each event has exactly `{ id, entry_kind, status, invariant_id, message, present_fields, missing_fields, forbidden_fields }` (mirrors `query-drift-tool.test.js:399-428`)
8. **T-8**: `drift_count === drift_events.length` (mirrors `query-drift-tool.test.js:430-453`)

## 5. Edge Cases + Open Questions

### 5.1 Edge cases the design must handle

- **F-1 + I-1 co-occurrence**: A single entry with `status: "active"` AND `resolved_at` will breach both F-1 (forbidden) and could be misread as breaching I-1 (which expects `status: "resolved"`). The check must only apply I-1 to entries with `status: "resolved"`, and only F-1 to entries with `status: "active"`. This is already implicit in the per-status invariant table but worth a test (extends C-2).
- **`resolution` on `status: "active"`**: F-1 says "MUST NOT carry `resolved_at` or `resolution`". An `active` entry with `resolution` set is a breach of F-1 (resolution is forbidden for active). Test: extend C-2 to add a `resolution` field and assert 1 event with `forbidden_fields: ["resolved_at", "resolution"]`.
- **Null audit fields**: The Zod schemas declare `resolved_at: z.string().nullable().optional()`. An entry with `status: "resolved"` and `resolved_at: null` is a breach of I-1. The check should treat `null` as "missing" (use `!== null && !== undefined` predicate, or a small helper `isSet(v)`).
- **Archived entries past the 7-day compaction window**: `core/meta-state.js:438` compacts terminal entries older than 7 days. The check is read-only and observes the live registry at the moment of invocation, so this is not its concern — but tests should use a stable registry snapshot.
- **`auto-resolved` set by `meta_state_sweep`**: The sweep tool sets `status: "auto-resolved"` with `resolution`. If the sweep sets only `status` and forgets `resolution`, I-7 catches it. Worth a test using the actual `meta_state_sweep_tool` if feasible, or a hand-crafted finding with `status: "auto-resolved"` and `resolution: null`.
- **Change-log compaction immunity**: `core/meta-state.js:432-435` notes change-logs are never compacted. I-9 applies to all change-logs in the registry, including long-lived ones — make sure the test covers a "old" change-log (created_at > 7d ago) carrying a non-`active` status.
- **Rule and loop-design branches**: The check intentionally skips these in v1. If a future bug surfaces in those branches (e.g., a `rule` entry with `status: "inactive"` but no `supersedes`), the check should be extended — not retrofitted now per YAGNI.

### 5.2 Open questions (require operator or repo evidence)

- **OQ-1**: Should the check call into `META_STATE_CONSISTENCY_INVARIANTS` for the test or hardcode the list? Recommend export + use in tests; matches `META_STATE_DERIVATION_KINDS` precedent at `core/derive-status.js:8`.
- **OQ-2**: One event per `(entry, invariant)` breach, or one event per entry with a `breached_invariants: [...]` array? The SP3 lean-shape precedent (`core/query-drift.js:48-54`) supports per-event granularity. Recommend per-breach events.
- **OQ-3**: Should the check validate `consolidated_into` (I-12) by reading other entries, or just report it as "dangling reference" without resolution? Reading is O(N^2) worst case. Recommend: emit a "soft" drift event with `invariant_id: "I-12"` and `message: "consolidated_into references id not found in registry"`. Operator decides what to do.
- **OQ-4**: Should the tool emit a gate-log entry even on `context_load_failed`? The query-drift and derive-status tools do not (early-return from the handler before `appendGateLog`). Recommend: do not log on early-return to match the existing pattern.
- **OQ-5**: Should the finding description's "remediation" hint (test under `tools/learning-loop-mcp/__tests__/`) be implemented instead of / in addition to the MCP tool? The finding offers both options. Recommend: implement the MCP tool as the primary surface; the test is a cheaper defense-in-depth and can be added later as a separate work item. The MCP tool is observable in the running system; a test only runs in CI.
- **OQ-6**: Does the MCP server require a non-empty `schema` body? Verify by reading `tools/learning-loop-mastra/interface/` (the `mcp-server` factory) to see if a tool with `schema: {}` is accepted. If not, use `z.object({})`.
- **OQ-7**: Should the v1 tool also work over `core/inbound-state.js` (the operational sidecar)? The finding is scoped to the registry. Recommend: no; keep the tool registry-only. Inbound state has its own consistency rules (likely different).

## 6. Architectural Fit

- **Mirrors existing pattern**: `consistencyCheck(entries)` + `metaStateConsistencyCheckTool` is a textbook copy of `queryDrift` + `metaStateQueryDriftTool`. A reviewer familiar with SP3 needs no new abstractions to follow the design.
- **No new dependencies**: Uses `readRegistry` (already exported from `core/meta-state.js:368`), `resolveRoot`, `appendGateLog` — all the same building blocks the other read-only tools use.
- **YAGNI**: No filter argument in v1; no I-12 hard enforcement; no rule/loop-design branch checks. Each is a follow-up if real drift surfaces.
- **KISS**: One file in `core/`, one file in `tools/legacy/`, one manifest entry, one line in `metaStateConsistencyCheckTool` description, one gate-log shape.
- **DRY**: Invariant list lives in one exported constant. The finding's remediation language ("OR") is satisfied by the MCP tool alone; the test-only option is rejected to avoid parallel implementations.

## Unresolved Questions (for the user / planning session)

1. **OQ-1, OQ-2, OQ-3, OQ-6, OQ-7** above (5 open design questions).
2. Should this tool be in the gate-decision path (e.g., trip the consult-gate when `drift_count > 0`)? The current design is a probe, not a gate. Recommend defer.
3. Is the v1 scope (finding + change-log branches only) acceptable, with rule / loop-design deferred? Matches YAGNI but excludes two entry kinds from registry-consistency defense.
4. Should `meta_state_consistency_check` be a recurring sweep (added to `meta_state_sweep_tool`) or only available on-demand? The current design is on-demand; the sweep integration is a separate work item.
