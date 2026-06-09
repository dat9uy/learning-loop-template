# Brainstorm: Resolve TTL finding via stale-flag redesign

**Date**: 2026-06-09
**Author**: brainstorm (Droid session)
**Trigger**: User asked to resolve `meta-260608T0847Z-ttl-expire-system-has-the-wrong-action-for-expiry-current-se` in light of the new cross-referencing change-log `meta-260609T1817Z-meta-state-jsonl-finding-lifecycle`.
**Status**: Open (plan not yet approved; this report is the design handoff)

---

## Problem statement

The TTL/expiry system in `tools/learning-loop-mcp/core/meta-state.js#checkExpiry` and the `meta_state_sweep` tool transitions a `status: "reported"` finding past its `expires_at` into `status: "expired"` and stamps `resolved_by: "auto-resolve"` + `resolved_at: <now>`. The original problem is never re-verified. Expired findings drop out of the active set, even when the underlying code path they describe is still broken. The TTL finding itself was auto-resolved by the very sweep it described — a recursion: the critic was silenced by the system.

The new change-log `meta-260609T1817Z-...` (status=`active`) cross-references the TTL finding and argues `expired != resolved`. The proof case is `*************************************************`: fixed in code, but the finding was auto-resolved by TTL before the fix could be referenced from a live registry.

### Verified registry state (2026-06-09 scout)

The 3 motivation findings and their cross-references were verified against the live registry before this report was finalized. Planners can trust the IDs and statuses below without re-querying:

| ID | entry_kind | status | resolved_by | expires_at | resolved_at | key field |
|---|---|---|---|---|---|---|
| `meta-260606T1500Z-closeout-script-idempotency-bug` | finding | `expired` | `auto-resolve` | `2026-06-07T08:00:00Z` | `2026-06-07T08:00:55Z` | `subtype: tool-missing`; bug already fixed in code (idempotency guard in `scripts/closeout-meta-evidence-migration.cjs`) |
| `meta-260608T0847Z-ttl-expire-system-has-the-wrong-action-for-expiry-current-se` | finding | `expired` | `auto-resolve` | `2026-06-09T01:47:56Z` | `2026-06-09T02:10:37Z` | `mechanism_check: true`, `code_fingerprint: sha256:a29f8d5df824baa8cf4db42609f5cb7ebd36bb8dc9c75b37e083638a42e86a7a` (5 version bumps) |
| `meta-260609T1817Z-meta-state-jsonl-finding-lifecycle` | change-log | `active` | — | — | — | The semantic-design entry that links the two; has no `consolidates` field yet |

The recursion case is exact: TTL finding created 2026-06-08T01:47:56Z, expired 2026-06-09T01:47:56Z, auto-resolved 2026-06-09T02:10:37Z — by its own critic'd system.

## Requirements (5-mandatory)

1. **Expected output**: a `loop-design` entry capturing the redesign intent + an implementation plan that ships the `stale` status, the `last_verified_at` / `verification` fields, a `meta_state_re_verify` MCP tool, a `meta_state_supersede` MCP tool, a sweep-tool change, and the verification-runner extraction. Plus a backfill to supersede the 2 affected findings into the new change-log.
2. **Acceptance criteria**:
   - `meta_state_sweep` no longer stamps `resolved_by: "auto-resolve"` on entries that are merely past TTL. The new `stale` transition replaces it for the reported-past-TTL and active-past-staleness-window paths.
   - `meta_state_re_verify` exists; running it on a stale entry with intact `verification.steps` and passing `expect` returns `verified: true` and the entry returns to `status: "active"`. Failure keeps the entry in `stale` and appends to `verification_history`.
   - `meta_state_supersede` exists; the 2 prior `auto-resolve`d findings (TTL, closeout) are transitioned to `status: "superseded"` with `consolidated_into` pointing to the implementation change-log, and the change-log gets `consolidates: "ttl-id,closeout-id"`.
   - The active-finding path is also covered: `status: "active"` past `STALENESS_WINDOW_MS` (default 7 days) → `stale`. This is a NEW path the original `checkExpiry` does not handle.
   - All tests pass (840+ existing + ~13 new); registry validates; server starts; `loop_describe` warm tier surfaces the new tools.
   - The cold-session-discoverability test still passes (regression guard for the meta surface).
3. **Scope boundary**:
   - IN: schema widening in `core/meta-state.js#metaStateFindingEntrySchema`; sweep tool rewrite (add stale transitions, preserve `auto-resolve` for the file-modification case); new `meta_state_re_verify` tool; new `meta_state_supersede` tool; refactor of `runTest` → `core/verification-runner.js`; add `re_verify` to `derive-status.js#computeRecommendation`; cmd-allowlist in `core/patterns.json`; ~13 new TDD tests + 2 small regression/smoke tests; backfill of 2 superseded findings; 1 implementation change-log; 1 loop-design entry; 1 journal.
   - OUT: Bridge 5 (yaml→zod pipeline) — aspirational, not shipped, unrelated. TTL config field on `meta_state_report` at creation time (defer). SessionStart hook to auto-sweep on session start (defer; hot path).
4. **Non-negotiable constraints**:
   - **No `decision` records for the meta surface** (per operator — meta-state.jsonl is the only record for the meta surface; decisions are for `product` only).
   - Schema lives hand-written in `core/meta-state.js` (Bridge 5 not shipped; no yaml→zod pipeline to refactor).
   - All `records/**` writes via MCP tools; direct I/O blocked.
   - All file writes go through the gate; preflight marker required for `product/**` (not needed here — meta changes only).
   - CAS via `_expected_version` on `meta_state_patch` and `meta_state_supersede`.
   - `meta_state_re_verify` and `meta_state_supersede` use `META_STATE_VERIFY_EXEC=1` and `OPERATOR_MODE=1` env-var gates respectively (default off, mirrors the existing `OPERATOR_MODE` and `META_STATE_BATCH_LIMIT` patterns).
5. **Touchpoints** (file paths):
   - `tools/learning-loop-mcp/core/meta-state.js` (schema: status enum, new fields `last_verified_at`, `verification`, `superseded_at`, `superseded_by`)
   - `tools/learning-loop-mcp/core/derive-status.js` (add `stale` → `re_verify` recommendation branch; new `META_STATE_RECOMMENDATIONS` enum value)
   - `tools/learning-loop-mcp/core/loop-introspect.js` (add `last_verified_at` to `summarize`; update status count comment from 5 to 6)
   - `tools/learning-loop-mcp/core/check-grounding.js` (no schema change; comment only — status count)
   - `tools/learning-loop-mcp/core/patterns.json` (add `meta-state-verify-cmd-allowlist` key)
   - `tools/learning-loop-mcp/core/verification-runner.js` (NEW; extracted from `meta-state-check-grounding-tool.js#runTest`)
   - `tools/learning-loop-mcp/tools/meta-state-check-grounding-tool.js` (delegate to `verification-runner.js`)
   - `tools/learning-loop-mcp/tools/meta-state-sweep-tool.js` (new stale transitions; new `checkStaleness` helper; remove auto-resolve from stale path; new `## Stale Findings` summary section; add `stale` to its local `TERMINAL_STATUSES`)
   - `tools/learning-loop-mcp/tools/meta-state-re-verify-tool.js` (NEW)
   - `tools/learning-loop-mcp/tools/meta-state-supersede-tool.js` (NEW)
   - `tools/learning-loop-mcp/tools/manifest.json` (register 2 new tools)
   - `tools/learning-loop-mcp/server.js` (wire 2 new tools)
   - `tools/learning-loop-mcp/__tests__/meta-state-stale-flag.test.js` (NEW; 10 tests — schema, summarize, derive-status re_verify, sweep stale transition, re-verify round-trip, supersede, registry validation)
   - `tools/learning-loop-mcp/__tests__/meta-state-sweep-stale-transition.test.js` (NEW; 3 tests — reported→stale, active→stale, idempotent re-run)
   - `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` (1 added regression assertion: stale entries do NOT trigger churn)
   - `tools/learning-loop-mcp/__tests__/index-validate-smoke.test.js` (NEW; 1 smoke test: registry validates against new schema after edit)
   - `meta-state.jsonl` (2 supersede patches + 1 change-log + 1 loop-design via `meta_state_batch`)
   - `docs/journals/260609-stale-flag-redesign.md` (NEW; written in plan Phase 7)
   - `docs/registry-summary.md` (regenerated by sweep; new `## Stale Findings` section)

## Evaluated approaches

### Path A — Loop-design only, no code change

- **What**: emit a `loop-design` entry with `addresses=[ttl-id, change-log-id, closeout-id]` capturing the redesign proposal. No schema/sweep/tool changes. Ship the design as "deferred" for a future plan.
- **Pros**: cheapest; machine-discoverable; redesign proposal lives in the registry's design queue; preserves operator bandwidth.
- **Cons**: bug remains. The next sweep at 24h will re-kill any future TTL-style finding the same way.
- **Verdict**: REJECTED for this round — user explicitly asked for a redesign with a plan.

### Path B — Full redesign ship (chosen)

- **What**: add `stale` status + `last_verified_at` + `verification` fields; rewrite `meta_state_sweep` to flag (not resolve) stale (for both reported-past-TTL and active-past-staleness-window paths); ship `meta_state_re_verify` MCP tool; ship `meta_state_supersede` MCP tool (closes the consolidated_into deny-list gap in `meta_state_patch`); refactor `runTest` to a shared `core/verification-runner.js`; add `re_verify` recommendation to `derive-status.js`; cmd-allowlist in `core/patterns.json`; backfill the 2 affected findings via `supersede`; ~15 TDD tests; change-log + loop-design entries.
- **Pros**: closes the recursion; preserves discoverability of the 2 prior bugs; introduces a verification step that's self-contained (reproduction in the registry); future agents can re-verify on demand; matches the proposal in both source entries; the new `meta_state_supersede` tool makes the `superseded` status operationally usable for the first time.
- **Cons**: ~10 file touches; 2 new tools with exec surface (mitigated by env-var gates + cmd-allowlist); 1 new status (terminal-set discipline must hold); 1 new `META_STATE_RECOMMENDATIONS` value; a 1-line refactor of `meta-state-check-grounding-tool.js` to delegate to the new runner.
- **Verdict**: ACCEPTED. The trade-off is favorable — fixes a real class of bug (auto-resolve-by-clock), and the design itself is small.

### Path C — Journal-only, no registry mutation

- **What**: write a narrative journal summarizing the situation. No new entries.
- **Pros**: zero risk to the registry.
- **Cons**: not machine-discoverable; the next sweep will re-kill any related finding; loses the `addresses` cross-reference that makes the redesign intent queryable.
- **Verdict**: REJECTED — registry is the product, not the journal.

## Resolved design questions (from operator + ck:predict)

These were open in the first draft of this report and are now locked:

1. **Backfill mechanism for the 2 affected findings** → new `meta_state_supersede` tool. The `meta_state_patch` tool's `IMMUTABLE_PATCH_FIELDS` set includes `consolidated_into` and `resolved_at/by` (see `tools/learning-loop-mcp/tools/meta-state-patch-tool.js#12-23`), which blocks the backfill. The supersede tool takes a narrow `id + consolidated_into + resolution` shape; the handler stamps `status: "superseded"`, `superseded_at`, `superseded_by`, and `consolidated_into` atomically. This also makes the underutilized `superseded` status usable for future agents.

2. **`STALENESS_WINDOW_MS` default** → **7 days** (matches the compaction window; less noise than 24h). Module-load env-var pattern, mirroring `META_STATE_BATCH_LIMIT` at `core/meta-state.js#383` and `tools/meta-state-batch-tool.js#6`:
   ```js
   const STALENESS_WINDOW_MS = Number(process.env.META_STATE_STALENESS_WINDOW_MS) || 7 * 24 * 60 * 60 * 1000;
   ```

3. **`verification` field shape** → **loose outer / object-form inner / cmd allowlist** (from `ck:predict` 5-persona analysis). The outer field is required `verification: object`; the inner shape is JSDoc-typed but **not zod-enforced** (mid-plan field changes are the historical source of `loop-design.proposed_design_for` drift). Inner shape (JSDoc):
   ```ts
   verification?: {
     steps: Array<{
       cmd: string,                          // must be in patterns.json#meta-state-verify-cmd-allowlist
       args?: string[],                      // default: []
       cwd?: string,                         // default: root (resolved)
       timeout_ms?: number,                  // default: 10_000
       expect?: {                            // optional; absent = exit_code 0 implies pass
         stdout_includes?: string,
         exit_code?: number,
       },
     }>,
     history?: Array<{                       // appended by tool, capped at 50 FIFO
       at: string,                           // ISO
       status: "passed" | "failed" | "error",
       signal: string,                       // exit code, stderr first line, or "ok"
     }>,
   }
   ```
   `last_verified_at` is a top-level optional ISO field, derived as `max(verification.history.at)`. The tool appends to `history` and updates `last_verified_at`; it does not recompute on every read.

4. **`meta_state_re_verify` exec surface safety** → 3 layered defenses (all 3 required):
   - **`META_STATE_VERIFY_EXEC=1` env-var gate** (default off; mirrors `OPERATOR_MODE`).
   - **`core/patterns.json#meta-state-verify-cmd-allowlist`** with default allowlist `["node", "pnpm", "npm", "git", "cat", "ls", "grep", "rg", "test", "echo"]`. Any `cmd` not in the list returns `{ verified: false, reason: "cmd_not_allowlisted" }`.
   - **`spawnSync` with `shell: false`, `timeout: 10_000` per step** (reuses the existing `runTest` precedent at `tools/learning-loop-mcp/tools/meta-state-check-grounding-tool.js#13-29`).

5. **Verification-runner refactor** → extract `core/verification-runner.js` exporting `runVerification(root, step)` returning `{ status, signal }`. Both `meta_state_check_grounding` (existing) and `meta_state_re_verify` (new) call it. This is a Phase 3.0 prerequisite; it does not change the contract of `meta_state_check_grounding`.

6. **`derive-status.js#computeRecommendation` for stale entries** → add a new recommendation value `re_verify` to the `META_STATE_RECOMMENDATIONS` enum. Branch: `kind=mechanism-shipped + status=stale → recommendation: re_verify`. This makes stale findings visibly actionable in `meta_state_query_drift` output.

7. **3 small notes folded into the plan** (operator decision): cold-session churn regression test + `index_validate` smoke test are in. The `stale_drift` follow-up drift kind is deferred to a separate plan.

## Final recommended solution

Path B with two adjustments from the original ExitSpecMode draft:

1. **Drop the "create decision record" step** (Phase 0 of the original draft). The meta-surface uses meta-state.jsonl as its decision log. The `loop-design` entry IS the design-time decision artifact. Per the operator's note and the context-pollution finding, do not introduce a `decision` record on the meta surface.
2. **Add a `loop-design` entry** (not a `change-log`) at the start of the plan to formally capture the redesign intent with `addresses=[meta-260608T0847Z-..., meta-260609T1817Z-..., meta-260606T1500Z-...]` and `proposed_design_for=[the 7 file targets in Phase 1–3]`. When the implementation change-log is written, the `loop-design` status flips to `inactive` with `shipped_in_plan` pointing to the change-log.

## Implementation phases (the plan to be approved)

### Phase 0 — Design entry (loop-design, not decision)

Create `meta-260609T<HHMM>Z-stale-flag-redesign` as a `loop-design` entry via `meta_state_propose_design` MCP tool. `addresses` points to the 3 motivation findings; `proposed_design_for` lists the 7 file targets. `severity_hint: high` (recursion risk).

### Phase 1 — Schema additions (zod-only, no yaml pipeline)

Edit `core/meta-state.js`:
- `metaStateFindingEntrySchema.status` (line 42): add `"stale"` to enum.
- Add 3 optional fields: `last_verified_at` (ISO string), `verification` (object, JSDoc-typed per Resolved Q3), `superseded_at` (ISO string), `superseded_by` (string).
- **Do not** add `stale` to `TERMINAL_STATUSES` in `core/meta-state.js` (line 7), `core/derive-status.js` (line 22, `TERMINAL_RAW_STATUSES`), or `core/loop-introspect.js` (line 139). `stale` is non-terminal; it can re-transition to `active`.
- **Do** add `stale` to `meta-state-sweep-tool.js`'s local `TERMINAL_STATUSES` (line 6) — the sweep should not re-process stale entries.
- Update the status count comment in `loop-introspect.js#summarize` (line 95) from 5 to 6.
- Add `last_verified_at` to `summarize()` in `loop-introspect.js` so `meta_state_relationships` and `loop_describe({tier:"cold"})` surface it.

### Phase 2 — Sweep tool change + derive-status re_verify branch

Edit `meta-state-sweep-tool.js`:
- For entries with `status: "reported"` past `expires_at`: transition to `"stale"`. Do NOT stamp `resolved_at` / `resolved_by`.
- For entries with `status: "active"` past `STALENESS_WINDOW_MS` (default 7 days, env-var-configurable): transition to `"stale"`.
- Preserve `auto-resolve` for the file-modification case (active finding whose `evidence_code_ref` file mtime > `last_verified_at`).
- Add a new `checkStaleness` helper alongside `checkExpiry`; the sweep loop calls both, in that order, and dedupes by entry id.
- Add a `## Stale Findings` section to the emitted `docs/registry-summary.md`.

Edit `core/derive-status.js`:
- Add `"re_verify"` to `META_STATE_RECOMMENDATIONS` enum (line 16).
- Add a new branch in `computeRecommendation`: `kind=mechanism-shipped + status=stale → recommendation: re_verify`. This is what makes stale findings visibly actionable in `meta_state_query_drift` output.

### Phase 3 — `meta_state_re_verify` tool (with verification-runner extraction)

Phase 3.0 — Extract `core/verification-runner.js`:
- New file exporting `runVerification(root, step)` that takes one step object and returns `{ status: "passed" | "failed" | "error", signal: string }`.
- `shell: false`, `timeout: 10_000`, `cmd` allowlist enforced.
- Reuse the existing `runTest` body from `meta-state-check-grounding-tool.js#runTest` as the starting point; generalize the args/expect handling.

Phase 3.1 — `meta_state_re_verify` tool:
- File: `tools/meta-state-re-verify-tool.js`.
- Schema: `{ id: string, _expected_version?: number }`.
- Handler: read entry, validate entry_kind, gate on `META_STATE_VERIFY_EXEC=1`, iterate `verification.steps` calling `runVerification` for each, append to `verification_history` (FIFO cap 50), update `last_verified_at` on any pass, transition `stale → active` on full pass (all steps passed), keep `stale` on any failure. CAS-safe.
- Register in `manifest.json` and wire into `server.js`.

Phase 3.2 — Delegate `meta_state_check_grounding` to the new runner:
- Replace the inline `runTest` in `meta-state-check-grounding-tool.js` with a call to `core/verification-runner.js#runVerification` for the pnpm-test invocation. No behavior change for `meta_state_check_grounding`; this is purely a refactor.

Phase 3.3 — `core/patterns.json` allowlist:
- Add `meta-state-verify-cmd-allowlist: ["node", "pnpm", "npm", "git", "cat", "ls", "grep", "rg", "test", "echo"]`.
- Reference this allowlist from `verification-runner.js#runVerification`.

### Phase 4 — `meta_state_supersede` tool

File: `tools/meta-state-supersede-tool.js`. Schema: `{ id: string, consolidated_into: string, resolution?: string, _expected_version?: number }`. Handler: gate on `OPERATOR_MODE=1`, read entry, validate entry_kind=finding, validate `consolidated_into` is an existing change-log id, atomically patch `status: "superseded" + superseded_at: now + superseded_by: "operator" + consolidated_into + resolution`. CAS-safe. Register in `manifest.json` and wire into `server.js`.

### Phase 5 — TDD tests (TDD-first per project convention)

Create the test files in this order (TDD = red, green, refactor per file):

- `__tests__/meta-state-stale-flag.test.js` (10 tests):
  1. schema accepts `status: "stale"` and rejects unknown values
  2. schema accepts `last_verified_at`, `verification`, `superseded_at`, `superseded_by` (presence; inner shape not enforced)
  3. `summarize` includes `last_verified_at` when present
  4. `summarize` description count comment is now 6 (status enum width)
  5. `deriveStatus` on stale + mechanism-shipped → recommendation: `re_verify`
  6. `computeRecommendation` enum includes `re_verify`
  7. `checkExpiry` returns `null` for stale entries (they don't re-expire)
  8. `TERMINAL_STATUSES` in `core/meta-state.js` does NOT include `stale`
  9. `verification-runner.runVerification` rejects cmd not in allowlist
  10. `meta_state_re_verify` round-trip: stale + passing steps → active; stale + failing step → stays stale + history appended

- `__tests__/meta-state-sweep-stale-transition.test.js` (3 tests):
  1. reported past `expires_at` → `stale` (no resolved_at/resolved_by stamp)
  2. active past `STALENESS_WINDOW_MS` → `stale`
  3. re-run is idempotent (stale entries are not re-processed; `stale` is in the local `TERMINAL_STATUSES`)

- `__tests__/cold-session-discoverability.test.cjs` (1 added assertion):
  - Assert: stale entries do NOT trigger the test's idempotency-key churn loop. The 4 L2 auto-cold-session-test churn entries in the live registry (status=`expired`) should not re-create under the new model.

- `__tests__/index-validate-smoke.test.js` (NEW; 1 test):
  - Read live `meta-state.jsonl`, validate against the new schema; assert 0 errors. (The schema widening is additive, so this is cheap insurance.)

### Phase 6 — Backfill: supersede 2 affected findings + add `consolidates` to the change-log

- `meta_state_supersede({ id: "meta-260608T0847Z-...", consolidated_into: "<implementation change-log id from Phase 7>" })`
- `meta_state_supersede({ id: "meta-260606T1500Z-...", consolidated_into: "<implementation change-log id from Phase 7>" })`
- `meta_state_patch({ id: "meta-260609T1817Z-...", patch: { consolidates: "meta-260608T0847Z-...,meta-260606T1500Z-..." } })` — `consolidates` is a top-level change-log field, not deny-listed, so patch is the right tool here.

All 3 operations in a single `meta_state_batch` call for atomicity.

### Phase 7 — Implementation change-log + loop-design closeout

- `meta_state_log_change` for the implementation: `meta-260609T<HHMM>Z-stale-flag-redesign-shipped` (status=`active`). `applies_to.tools` includes `meta_state_sweep`, `meta_state_re_verify`, `meta_state_supersede`, `meta_state_check_grounding`. `applies_to.statuses` includes `stale`. `applies_to.rules` is empty.
- `meta_state_propose_design` update: set the Phase 0 `loop-design` to `inactive` with `shipped_in_plan: meta-260609T<HHMM>Z-stale-flag-redesign-shipped` + `shipped_at: now`. Per `meta_state_propose_design` shape, this is a re-proposal (the original goes inactive by supersession); the tool's idempotency check will see the existing addresses+proposed_design_for and return `already_exists_by_addresses_and_proposed_design_for`, so the plan uses `meta_state_patch` to flip `status: "inactive"` and stamp `shipped_in_plan` + `shipped_at` instead.

### Phase 8 — Verify + journal

- Run all meta-state + gate tests (target: 840+ existing + ~15 new = ~855 passing).
- Smoke-probe server starts; manifest includes `meta_state_re_verify` and `meta_state_supersede`.
- `index_validate` confirms registry is well-formed.
- `loop_describe({ tier: "warm" })` surfaces the 2 new tools.
- `meta_state_relationships` on the implementation change-log shows `consolidates: [ttl-id, closeout-id]`.
- `meta_state_query_drift` shows the 2 superseded findings as no-longer-drifted.
- Journal: `docs/journals/260609-stale-flag-redesign.md` summarizing the decision + the recursion case + the proof case + test results.

## Pre-implementation constraints discovered (for `ck:plan`)

The planner should treat the following as non-negotiable constraints when generating the implementation plan:

1. **Terminal-set discipline**: `stale` MUST be added only to `meta-state-sweep-tool.js`'s local `TERMINAL_STATUSES`. It MUST NOT be added to `core/meta-state.js#7`, `core/derive-status.js#22` (`TERMINAL_RAW_STATUSES`), or `core/loop-introspect.js#139`. The `derive-status.js#computeDrift` function (line 142) explicitly checks `TERMINAL_RAW_STATUSES`; adding `stale` there would suppress drift detection on stale entries, which is the opposite of what we want.

2. **Two stale-transition paths, not one**: The current `checkExpiry` only handles `status: "reported" past expires_at`. The new design adds a second path: `status: "active" past STALENESS_WINDOW_MS`. The sweep tool must call both helpers and dedupe.

3. **`supersede` tool reuses `meta_state_patch`'s deny-list semantics** but with `superseded_at` and `superseded_by` allowed (they are not in the deny-list). The new tool is the canonical writer of `consolidated_into` for findings; the change-log's `consolidates` field is still written by `meta_state_patch` (it's a different field on a different branch).

4. **`meta_state_resolve` should remain untouched**. The `meta_state_resolve` tool already gates on `TERMINAL_STATUSES = ["auto-resolved", "expired", "resolved"]` (line 7 of `meta-state-resolve-tool.js`). Adding `stale` to that set would be wrong — operators should be able to resolve a stale finding. Leave the tool alone.

5. **No `meta_state_re_verify`-driven auto-transition from `reported` to `stale`**: The re-verify tool only operates on `stale` entries. A `reported` finding must first be swept to `stale` before re-verify is meaningful (otherwise the clock is still ticking and the next sweep will re-flag it). The schema and tool must enforce this.

6. **History cap is a tool responsibility, not a schema responsibility**: The 50-entry FIFO cap on `verification_history` is enforced in the tool handler (in-memory trim before write). The schema accepts any-length array. This is a 2-line change and avoids a v2 migration.

7. **Backward compat for existing registry entries**: All schema changes are additive (new enum value, new optional fields, new tool, new field in `deriveStatus` output). The 491-line `meta-state.jsonl` parses unchanged. The only data migration is the 2-finding backfill in Phase 6.

8. **The verification-runner refactor (Phase 3.0) MUST ship before the re-verify tool (Phase 3.1) and the grounding delegation (Phase 3.2)**: It is a hard prerequisite. TDD for the runner goes in the meta-state-stale-flag.test.js file (test 9 above).

9. **TDD ordering**: Tests are written first per the project convention (`__tests__` are the design surface). The plan's test list in Phase 5 IS the design surface; implementation must follow.

10. **Single plan, single commit, single PR**: Per project convention, all phases ship in one plan and one PR. No sub-PRs. The implementation change-log and the loop-design closeout are in the same commit as the code changes.

## Risks + mitigations

- **Risk**: widening the status enum breaks existing entries with a non-stale status. **Mitigation**: enum widening is backward-compatible (no entry has `status: "stale"` today; missing `status` is allowed).
- **Risk**: `meta_state_re_verify` is an injection surface (runs shell from registry-stored strings). **Mitigation**: `spawnSync` with `shell: false`, 10s timeout, env-var gate `META_STATE_VERIFY_EXEC=1` (default off), pattern-blacklist reusing `core/patterns.json`.
- **Risk**: changing sweep behavior is observable in production telemetry. **Mitigation**: the change-log itself is the announcement; document the behavioral delta in the change-log's `reason` field.
- **Risk**: changing the 2 superseded findings' status from `expired` to `superseded` alters the audit trail's interpretation. **Mitigation**: the change-log's `consolidates` field names them; `meta_state_relationships` (1-hop) returns the lineage.

## Success metrics + validation criteria

1. **Quantitative**: `meta_state_sweep` produces 0 entries with `resolved_by: "auto-resolve"` and a stale-transition (delta vs. pre-fix = ~5/day, matching the TTL finding's scale-game estimate). Future runs of `meta_state_query_drift` no longer report the 2 backfilled findings as drift (they are now `superseded`).
2. **Qualitative**: a fresh agent reading `loop_describe` warm tier + `meta_state_list({ entry_kind: "loop-design" })` finds the `stale-flag-redesign` design with `addresses` pointing at the 3 motivation findings, and `shipped_in_plan` pointing at the implementation change-log. A `meta_state_relationships` query on the implementation change-log returns the 2 superseded finding ids in the `consolidates` field.
3. **Regression guard**: ~15 new TDD tests pass (10 in `meta-state-stale-flag.test.js` + 3 in `meta-state-sweep-stale-transition.test.js` + 1 added assertion in `cold-session-discoverability.test.cjs` + 1 new in `index-validate-smoke.test.js`); the cold-session discoverability test still passes; the manifest includes both new tools.
4. **Safety guard**: A `meta_state_re_verify` call with a `cmd` not in the allowlist returns `{ verified: false, reason: "cmd_not_allowlisted" }` without spawning. A test asserts `shell: false` in the `spawnSync` options.

## Next steps + dependencies

- **Depends on**: nothing (Bridge 6 territory; no other plan in flight).
- **Unblocks**: future TTL-style findings can be re-verified rather than auto-killed; the registry's `last_verified_at` field becomes the source of truth for "is this still true?" (a primitive the SP1 `derive_status` did not expose — it could only read code, not run reproduction steps). The `meta_state_supersede` tool makes the `superseded` status operationally usable for the first time.
- **Deferred follow-ups** (out of scope here, captured for the next plan):
  - TTL config field on `meta_state_report` at creation time (per-finding TTL, not the 7-day default).
  - Pattern-based verification templates (e.g., "verify a `gate-logic-bug` by running the gate with the example command") — defer until `meta_state_re_verify` ships and operators populate a few `verification.steps` arrays.
  - `meta_state_sweep` cadence: today sweep is operator-triggered; consider a SessionStart hook to auto-sweep on session start. Defer to a separate plan; SessionStart hook is a hot path.
  - `stale_drift` drift kind in `meta_state_query_drift` to surface "stale entries that were auto-resolved anyway" (the very class the TTL finding describes). Defer; needs a separate plan.

## Open questions for the operator

- None blocking. All clarifications integrated:
  - No decision records on the meta surface.
  - Journal comes from the plan (Phase 8).
  - Backfill mechanism: `meta_state_supersede` (operator decision Q1).
  - `STALENESS_WINDOW_MS` default: 7 days (operator decision Q2).
  - Verification shape: loose outer / object-form inner / cmd allowlist (operator decision Q3, refined by `ck:predict` 5-persona analysis).
  - 2 small tests folded into this plan (operator decision Q4).
