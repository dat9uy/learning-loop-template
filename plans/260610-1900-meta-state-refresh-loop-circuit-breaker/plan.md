---
title: "Meta-state refresh-loop circuit-breaker"
description: "Defense in depth: idempotency cache on meta_state_refresh_fingerprint + auto-default + warning on meta_state_report. Closes the droid-session loop pathology from session dac9b6ed (163 calls / 147 identical errors in 53 minutes)."
status: pending
priority: P2
branch: "main"
tags: ["meta-state", "mcp-tools", "circuit-breaker", "tdd"]
blockedBy: []
blocks: []
created: "2026-06-10T13:39:51.618Z"
createdBy: "ck:plan"
source: skill
---

# Meta-state refresh-loop circuit-breaker

## Overview

Two structural fixes shipped together to close the 53-minute loop pathology from session `dac9b6ed-b6f7-470b-b09b-ed744fbbdff5` (163 `meta_state_refresh_fingerprint` calls, 147 returning the identical `not_grounded` error). **Phase 1** adds a process-lifetime idempotency cache to `meta_state_refresh_fingerprint` (Map keyed on `id + previous_code_fingerprint`, 60s TTL, cache only `not_grounded`, `code_missing` (no-ref case), and success). **Phase 2** auto-defaults `mechanism_check: true` on `meta_state_report` when `evidence_code_ref` is provided (via `??` to preserve explicit opt-out) and emits a `warnings` array in the response when the caller provides both `evidence_code_ref` AND `mechanism_check: false`. **Phase 3** updates the schema description, the `DISCOVERABILITY_HINTS` arrays (canonical + local hook copy), and verifies all pre-commit hooks and the cold-session test pass.

**Reference**: `plans/reports/brainstorm-260610-1900-meta-state-refresh-loop-circuit-breaker.md` (APPROVED, 4 design questions resolved). Researcher reports: `/tmp/researcher-a-cache-mechanics.md` (cache mechanics + test isolation), `/tmp/researcher-b-report-default.md` (auto-default + warning shape + discoverability).

## Phases

| Phase | Name | Status | Effort |
|-------|------|--------|--------|
| 1 | [Cache on refresh fingerprint (TDD)](./phase-01-phase-1-cache-on-refresh-fingerprint.md) | Pending | 1.5h |
| 2 | [Auto-default + warning on report (TDD)](./phase-02-phase-2-auto-default-warning-on-report.md) | Pending | 1.5h |
| 3 | [Discoverability + test verification](./phase-03-phase-3-discoverability-test-verification.md) | Pending | 0.75h |

## Touchpoints (canonical, from brainstorm + researcher reports)

- `tools/learning-loop-mcp/tools/meta-state-refresh-fingerprint-tool.js` — module-scope `_idempotencyCache` Map, `_cacheKey`, `_cacheGet`, `_cacheSet`, `_clearIdempotencyCacheForTests`, `_backdateIdempotencyCacheForTests`; cache lookup inserted between `if (!entry)` and `if (entry.mechanism_check !== true)`; cache write inserted at success, `not_grounded`, and `code_missing` (no ref) returns; `code_missing` (file gone) is NOT cached (~30 lines)
- `tools/learning-loop-mcp/tools/meta-state-report-tool.js` — `mechanism_check` stays in destructure (so the warning can read the raw caller value); `effective_mechanism_check = mechanism_check ?? Boolean(evidence_code_ref)` derived constant; spread changed to `=== true` (preserves "field absent" semantic); `warnings` array built and merged into result; tool description updated (~12 lines)
- `tools/learning-loop-mcp/core/meta-state.js` — schema description for `mechanism_check` (line 57) updated to reflect auto-default (~1 line)
- `tools/learning-loop-mcp/core/loop-introspect.js` — `DISCOVERABILITY_HINTS` array: insert 1 new hint about auto-default after the existing `evidence_code_ref` hint (~1 line)
- `.factory/hooks/loop-surface-inject.cjs` — `LOCAL_DISCOVERABILITY_HINTS` array: same hint inserted at the matching position (~1 line)
- `tools/learning-loop-mcp/__tests__/meta-state-refresh-fingerprint-tool.test.js` — add T1, T2, T3, T4; add `_clearIdempotencyCacheForTests()` to existing 3 tests' `finally` blocks (~140 lines)
- `tools/learning-loop-mcp/__tests__/meta-state-report-tool-extension.test.js` — add T5, T6, T7, T8, T9, T10; T-existing-B still passes (spread constrained to `=== true` per Researcher B Section 9.3) (~120 lines)
- `tools/learning-loop-mcp/__tests__/meta-state-report-description.test.js` — update assertion to match new tool description text (~3 lines, if the description text changes)

**Total**: ~308 lines added, 7 files modified, 0 new files, 0 new dependencies.

## Constraints (non-negotiable, from brainstorm §Non-negotiable constraints)

1. **Backward compatibility** — existing callers of `meta_state_refresh_fingerprint` and `meta_state_report` continue to work. The cache is transparent. The new `warnings` field is additive.
2. **No new dependencies, no new schemas, no new entry kinds.**
3. **TDD: tests written first**, in the same style as the recent `260610-1535-meta-state-reopen-path` plan. Each phase begins with a failing test, then implementation, then green.
4. **Pre-commit hooks must pass** — `validate-records`, `extract-index`. No new findings created by this plan.
5. **Cache is in-process; no persistence to disk.** Lost on MCP server restart, which is correct (no cross-session staleness).
6. **No new entry kinds, no new statuses, no new tools.**

## Out of scope (per brainstorm §Non-goals)

- Session-side tool-call deduper (the proposed Phase 0 from the prior RCA). Broader than this fix.
- Consult-gate rule for retry suppression (`rule-no-retry-same-tool-same-args-twice`). Separate Bridge-6 design; captured for a future plan.
- Changes to `meta_state_check_grounding` or `meta_state_derive_status`. Those have their own `skipped` semantics; not part of this loop.
- Changes to `meta_state_refresh_fingerprint`'s core semantics (still strict on `mechanism_check: true`). The cache is the only circuit-breaker.
- Refactor of the 2 direct-`writeEntry` callers in `.factory/hooks/loop-surface-inject.cjs` (lines 148, 228). They bypass the tool handler by design; documenting that the auto-default does not apply to them is out of scope for this plan (a code comment only, added in Phase 3 if cheap).

## Plan-time decisions (locked)

| Question | Resolution | Source |
|----------|------------|--------|
| Cache key composition | `id + "::" + (entry.code_fingerprint ?? "null")`. `??` (not `\|\|`) preserves explicit-`null` semantics. | Researcher A Section 1 |
| Cache write scope | Cache `not_grounded`, `code_missing` (no ref case only), and the success response. **Do NOT cache** `code_missing` (file gone — operator can self-heal), `entry_not_found`, `context_load_failed`, `update_failed` (transient). | Researcher A Section 7.5 + red-team C7 |
| Cache hit return shape | Spread `cached.result` + `cache_hit: true`. Strip `stored_at` (implementation detail). | Researcher A Section 4 |
| Cache miss return shape | `cache_hit: false` (testable symmetry). | Researcher A Section 4 + Section 10.3 |
| Cache TTL | 60_000ms (60s). Lazy expiry on read. No periodic sweep. | Researcher A Section 3 |
| Module-scope test exports | `_clearIdempotencyCacheForTests()` and `_backdateIdempotencyCacheForTests(key, ageMs)`. Leading underscore signals "test-only." | Researcher A Sections 2 + 8 + 10.4 |
| Auto-default operator | `effective_mechanism_check = mechanism_check ?? Boolean(evidence_code_ref)`. | Researcher B Section 1 |
| Spread constraint | `...(effective_mechanism_check === true && { mechanism_check: true })`. Stores only `true`, preserves "field absent" semantic. | Researcher B Section 9.3 path (a) |
| Warning shape | Array of structured objects with `code` + `message` + `suggestion` fields. Gated on `warnings.length > 0` (no field when empty). | Researcher B Section 3 |
| Warning code value | `"evidence_without_mechanism_check"` (kebab-case, greppable). | Researcher B Section 3 |
| Tool description update | Yes — append one sentence about auto-default to `meta-state-report-tool.js:6`. | Researcher B Section 2 + 10.2 |
| Schema description update | Yes — one-line text edit to `core/meta-state.js:57`. | Researcher B Section 2 + 10.1 |
| Discoverability hint | Yes — insert one new hint into both `core/loop-introspect.js#DISCOVERABILITY_HINTS` AND `.factory/hooks/loop-surface-inject.cjs#LOCAL_DISCOVERABILITY_HINTS`. | Researcher B Section 7 + 10.3 |
| Hint position | After the `evidence_code_ref` hint (line 79 in introspect, line 14 in hook local), before the `source_refs` hint. 2nd position in both arrays. | Researcher B Section 7 |
| Hint content | `"When you pass `evidence_code_ref` to `meta_state_report`, `mechanism_check` is auto-defaulted to `true` (so the loop will hash and re-check the code). Pass `mechanism_check: false` explicitly to opt out — the response will include a `warnings` array explaining the tradeoff."` | Researcher B Section 7 |
| Test file for Phase 2 | Extend `meta-state-report-tool-extension.test.js` (do not create new file). | Researcher B Section 4 |
| T10 (extra test) | Add `mechanism_check: null` behaves as omitted (locks in `??` semantics vs future `\|\|` regression). | Researcher B Section 5 |
| Cache lookup insertion point | After `if (!entry) { return ... }` check (line 25), before `if (entry.mechanism_check !== true)` (line 33). | Researcher A Section 5 |
| Cache write insertion points | At the end of: `not_grounded` return (line 41), `code_missing` (no ref) return (line 52), success return (line 95). **NOT** at `code_missing` (file gone) return (line 72) — operator can self-heal by creating the file. | Researcher A Section 5 + red-team C7 |

## Risks (per brainstorm + researchers' findings + red team)

1. **Stale hash on silent file change** — if the file at `evidence_code_ref` changes between calls without any other registry write, the cache returns the old hash for 60s. **Mitigation**: document the trade-off in the tool's `description` field ("For drift detection, use `meta_state_check_grounding`"). The droid-session storm is the case where the file is NOT changing, so the cache is correct. (Researcher A Section 6.)
2. **Auto-default surprises callers that relied on `mechanism_check: undefined`** — the field is now stored as `true` when `evidence_code_ref` is set. **Mitigation**: (a) the warning in Phase 2 teaches the deliberate-opt-out path; (b) `evidence_code_ref` is the natural opt-in signal, and any agent that wants the old behavior passes `mechanism_check: false` explicitly. (Researcher B Section 10.4.)
3. **T-existing-B breakage** — pre-existing test at `meta-state-report-tool-extension.test.js:60-69` asserts `entry.mechanism_check === undefined` when both fields are omitted. **Mitigation**: the plan constrains the spread to `=== true`, so the field is absent when neither is provided. T-existing-B still passes. (Researcher B Section 9.3 path (a).)
4. **Direct-`writeEntry` callers bypass the auto-default** — `.factory/hooks/loop-surface-inject.cjs:148,228` write entries with `evidence_code_ref` and no `mechanism_check`. The auto-default does not apply. **Mitigation**: the registry will have a mix of "tool-handler findings" (with `mechanism_check: true` defaulted) and "hook findings" (with `mechanism_check` absent). The hook is intentional and bypasses the tool; documenting the asymmetry is sufficient. (Researcher B Section 10.9.)
5. **Test isolation with module-scope cache** — existing 3 tests in `meta-state-refresh-fingerprint-tool.test.js` will share the module-scope cache. **Mitigation**: add `_clearIdempotencyCacheForTests()` to the `finally` block of each existing test. Tests use unique ids per test, so cross-contamination is unlikely; the explicit clear is defensive. (Researcher A Section 10.8.)
6. **Cache grows unbounded if TTL is bypassed** — N/A. Lazy expiry on read evicts expired entries. No periodic sweep needed. (Researcher A Section 3.)
7. **`mechanism_check: null` regression to `\|\|` semantics** — a future refactor that "simplifies" to `\|\|` will silently flip `false` to the default. **Mitigation**: T6 and T7 lock `??` semantics in. T10 (additional) explicitly tests `null` behavior. (Researcher B Section 10.5.)
8. **Temporal asymmetry between pre-Phase-2 and post-Phase-2 findings** — old findings (filed before Phase 2 ships) have `mechanism_check` absent; new findings (filed after Phase 2 ships) have `mechanism_check: true` auto-defaulted when `evidence_code_ref` is provided. The same `evidence_code_ref` value produces different `mechanism_check` values depending on when the finding was filed. **Effect**: cold-tier `drift` and `mechanism_check_pct` coverage metrics will see a non-organic jump after this plan ships; consult-gate `rule-no-orphaned-evidence` will scan more findings (potentially surfacing pre-existing drift). **Mitigation**: out of scope to backfill; documented in the change-log for the plan. (Red-team H3.)
9. **Auto-default interacts with consult-gate** — every new tool-handler finding with `evidence_code_ref` will have `mechanism_check: true`, which puts it in scope for `rule-no-orphaned-evidence`. An agent that files a finding with `evidence_code_ref` and immediately calls `meta_state_resolve` (without first calling `meta_state_check_grounding`) will be blocked by the rule. **Mitigation**: discoverability hint and tool description should teach "call `meta_state_check_grounding` (which auto-records the fingerprint) before resolving."
10. **`cache_hit` field name collision with `loop_describe`** — `meta_state_refresh_fingerprint` (after Phase 1) returns `cache_hit: true|false`, as does `loop_describe({ tier: "cold" })` (for the cold-tier sidecar cache, see `tools/learning-loop-mcp/tools/loop-describe-tool.js:111, 203`). The two caches are independent. **Mitigation**: agents that introspect `cache_hit` should disambiguate by tool name; future tools should consider `idempotency_hit` to avoid the collision. (Red-team C6.)

## Success criteria (per brainstorm §Success Metrics + researcher additions)

- [ ] All existing tests pass (`pnpm test` shows the same baseline + 10 new tests).
- [ ] The droid-session pathology is mechanically prevented: a test that calls `meta_state_refresh_fingerprint` 100× with the same `(id, fingerprint)` returns 1 actual result + 99 cache hits, all within < 1 second total. (T4 in Phase 1, sequential loop.)
- [ ] The auto-default + warning path is testable in isolation: T5-T10 pass with the response shape documented. (Phase 2.)
- [ ] The cache key includes `previous_code_fingerprint`, so a legitimate refresh (file changed → hash changed) is NOT a cache hit. (T2 in Phase 1.)
- [ ] The `code_missing` (file gone) path is NOT cached (operator can self-heal by creating the file). T-storm-test verifies the asymmetric carve-out.
- [ ] No operator intervention required to break the loop: a fresh agent in a fresh session that hits the same code path gets the auto-default + cache behavior without needing a chat intervention.
- [ ] Pre-commit hooks pass (`pnpm validate:records && pnpm extract:index`).
- [ ] Cold-session discoverability test still passes (`pnpm test:cold-session`). The 5 hint-count assertions across 2 files (`cold-session-discoverability.test.cjs:426,445`; `loop-describe-warm-tier.test.js:11,64,69`) are updated from `9` to `10`.
- [ ] No regressions — existing tests pass without modification (T-existing-B preserved by spread constraint). Backward-compat audit on the 7 call sites in `__tests__/` confirms no full-object equality assertions break.
- [ ] No `chore` or `docs` commit prefixes (per CLAUDE.md §Git).
- [ ] No new dependencies.

## Dependencies

No new dependencies. All edits use existing `zod`, `node:test`, `node:assert`, `node:fs`, `node:path`, `node:os`.

**Cross-plan**:
- `plans/260610-1535-meta-state-reopen-path/` — separate scope (reopen path for expired findings). Touches `core/loop-introspect.js` and `tools/meta-state-patch-tool.js`, not the refresh or report tools. No conflict. Phase 3 of THAT plan added one line to `DISCOVERABILITY_HINTS` (line 88 of `core/loop-introspect.js`), so the position of our new hint (after the existing `evidence_code_ref` hint at line 79) is independent.
- `plans/260610-meta-state-patch-wire-format-recursion/` — **completed**, separate scope. Touches `tool-registry.js#coerceParamsToSchema`, not the report or refresh tool handlers. No conflict.
- `plans/260610-1203-cold-session-churn-and-cross-compat-fix/` — **completed**. No registry schema interaction. No conflict.

## Next step

After approval, run Phase 1 (TDD red → green for cache + tests T1-T4). Cache first because it has no schema implication.
