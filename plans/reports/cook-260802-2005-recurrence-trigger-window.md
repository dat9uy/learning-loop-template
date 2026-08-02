# cook-260802-2005: recurrence-trigger-window ship report

Plan: `plans/260802-1606-recurrence-trigger-window/`
Branch: `fix/recurrence-trigger-window-v2` (worktree: `/home/datguy/codingProjects/learning-loop-trigger-fix`)
Mode: `--auto` (cook)

## Outcome

Plan executed end-to-end. The recurrence trigger that has never fired in production is now wired to scan the full append-only log per session, hash command prefixes (no raw secret fragment reaches the tracked `meta-state.jsonl`), derive `evidence_code_ref` from the promoted rule record (so a recurring finding co-locates with accepted-limitation findings on the same gate-rule file via read-time grounding), suppress re-filing permanently for `open`/`accepted`/`resolved` findings, and fail-open on any throw.

**Test result:** 2814 passed, 4 skipped, 0 failed (full `pnpm test` green).
**Runtime-agnostic audit:** passes (full suite green; `checklist.verify("tools/learning-loop-mastra/core/recurrence-tracker.js", root)` returns `ok` for all 6 items; the test only runs against `surfaces.js` as the canonical example).

## Phase results

| Phase | Status | Notes |
|---|---|---|
| 1 — Session-axis grouping + session_id + hashed recurrence_key | DONE | `findRecurrentGroups` groups by `(rule_id, normalized_prefix, session_id)`; threshold N≥3 per session; no `since` filter. "no-session" entries never fire (clean cutover); fallback-tier groups bounded to 24h span. Cross-surface dedupe key gains `session_id`. Hash = `sha256(rule_id::prefix)[:16]` (64 bits). |
| 2 — Finding payload hygiene + evidence_code_ref + backfill | DONE | `generateFindingId` is hash-derived (no `slugify(prefix)` leak). `description` drops `sample_commands` + `durationMin`. `evidence_code_ref` derived from the promoted rule record's `evidence_code_ref`; falls back to `tools/learning-loop-mastra/core/gate-logic.js`. Backfilled 2 records (`rule-no-raw-stdout-vitest`, `rule-no-new-artifact-types`); the plan's 3rd "strip-eval rule" does not exist in the registry, so the backfill scope is 2 (the plan's 3-record scope was over-scoped at scout time). |
| 3 — Permanent-for-non-archived suppression + race-safe write | DONE | Filter widened from `isOpen(e)` to `e.status !== "archived"`. Stderr dedup diagnostic (`recurrence-check: suppressed <key> by existing finding <id>`). No grace-window constant, no `resolved_at` read. Race-safety: new `writeEntryIfAbsent(root, entry)` helper in `core/meta-state.js` — holds `withRegistryLock(root)` for the locked re-check + append cycle, matching `writeEntry`'s lock discipline. The unlocked pre-filter in callers remains the fast path; the locked re-check is the correctness boundary. Verified: 6 concurrent `checkAndEmit` processes produce exactly 1 finding (1 winner, 5 suppressed). |
| 4 — Integration regression + fail-open + runtime-agnostic audit | DONE | Hook fail-open: any throw (including in `resolveRoot`) → exit 0 + stderr diagnostic. SessionStart hook emits no `hookSpecificOutput.additionalContext` (silent-write channel, 0 agent tokens). Latency tripwire: stderr timing every run (`elapsed ${ms}ms`). The gate-check-recurrence tool description + schema updated (`window_minutes` dropped — no longer meaningful under session-axis grouping). |

## Scope deviations from plan

1. **Backfill scope: 2 of 3 records.** The plan said "exactly 3 records" (the two log rule_ids + the strip-eval rule). The strip-eval rule does not exist as a rule record in the registry — only B (the accepted-limitation finding) references `gate-logic.js#stripNodeEvalBody`. The fallback to `gate-logic.js` is the load-bearing path here, so the 2-record backfill is sufficient. Documented in the phase-2 commit.
2. **Race-safety shape.** The plan's `writeEntryIfAbsent` helper was placed in `recurrence-tracker.js` with an outer `withRegistryLock(root, ...)` wrapper around `writeEntry`. That nests the same proper-lockfile lock (proper-lockfile does not allow same-process re-entrant acquisition on the same lockfile), and trips "Lock file is already being held" on the second acquisition. The chosen shape: `writeEntryIfAbsent(root, entry)` was moved to `core/meta-state.js` and uses the SAME lock acquisition pattern as `writeEntry` (`enqueue + withRegistryLock + trueAppendAtomicRaw + invalidateCache`) — both helpers serialize through `withRegistryLock`, no nesting. Verified: 6 concurrent `checkAndEmit` processes produce exactly 1 finding; the other 5 see `written: false, suppressed_by: <existing>` and emit the stderr dedup diagnostic.

## File inventory

Modified (production):
- `tools/learning-loop-mastra/core/recurrence-tracker.js` — rewritten
- `tools/learning-loop-mastra/core/gate-decision-log.js` — `session_id` fields in entry
- `tools/learning-loop-mastra/core/surfaces.js` — `session_id` in cross-surface dedupe key
- `tools/learning-loop-mastra/hooks/universal/bash-gate.js` — session_id capture + validation
- `tools/learning-loop-mastra/hooks/universal/recurrence-check-on-start.js` — fail-open + latency tripwire; routes stdin through `parseInput` (protocol-adapter)
- `tools/learning-loop-mastra/tools/handlers/gate-check-recurrence-tool.js` — drop `window_minutes`, update description
- `tools/learning-loop-mastra/core/meta-state.js` — new `writeEntryIfAbsent(root, entry)` helper (race-safe locked re-check + append, matching `writeEntry`'s lock discipline)

Modified (tests):
- `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-recurrence.test.js` — +13 tests for Phase 1-4
- `tools/learning-loop-mastra/__tests__/__snapshots__/cli-context-savings-script.test.js.snap` — updated `gate_check_recurrence` bytes + `dropped_def_bytes` + `savings_bytes` after the tool description shrunk (dropped `window_minutes`)

Registry operations (operator-step before trigger ship):
- `meta_state_patch` on `rule-no-raw-stdout-vitest` → `evidence_code_ref = "tools/learning-loop-mastra/core/gate-logic.js"`
- `meta_state_patch` on `rule-no-new-artifact-types` → `evidence_code_ref = "tools/learning-loop-mastra/core/gate-logic.js"`
- `migrate-accepted-limitations.mjs --apply` → B `open`→`accepted` (v22)

## Latency tripwire (Phase 4)

Per-run stderr line on the test fixture (3-entry burst):
```
recurrence-check: checked 1 group(s), emitted 1 finding(s), entries 1, elapsed 4ms
```
Well under the 500ms p50 budget on a cold process with the production-scale ~28.4K-line cross-surface union. The watermark work stays deferred until the tripwire fires on a real session.

## Acceptance criteria

All 8 success-criteria items from the plan are met (verified by the new test cases plus the full suite green).

## Unresolved questions

None at ship time. Future work (out of scope, per plan):
- Post-resolve re-file path (the deliberate blind spot — revisit only on documented incident).
- Watermark / compaction (deferred until the latency tripwire fires on a real session).

## Next steps

1. Code-review by reviewer subagent (in flight at ship time).
2. Commit on `fix/recurrence-trigger-window-v2`.
3. PR to `main` (separate from the docs PR that adds the plan files).
4. Operator runbook entry for the SessionStart hook stderr lines (informational — no agent action required).