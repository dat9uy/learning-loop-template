# Brainstorm — Meta-state refresh-fingerprint loop circuit-breaker

**Status**: APPROVED (4 design questions resolved)
**Date**: 2026-06-10
**Author**: Droid brainstorm session (post-`dac9b6ed-...` RCA)
**Addresses**: loop pathology from session `dac9b6ed-b6f7-470b-b09b-ed744fbbdff5` (163 `meta_state_refresh_fingerprint` calls, 147 returning the same `not_grounded` error)
**Related**: `meta-260610T1504Z-reopen-path-for-expired-findings-is-unclear-the-immutable-pa` (resolved 2026-06-10 in `c88de21`)

---

## Problem statement

A Droid session stuck in a 53-minute loop calling `meta_state_refresh_fingerprint` on a single entry id 163 times. 147 of those calls returned the identical error `{ error: "not_grounded", reason: "mechanism_check is not true; nothing to refresh" }`. The agent's thinking channel correctly diagnosed the loop 115+ times (e.g., *"I need to stop making the same redundant call. Let me verify the backfill using relationships instead"*) but the action channel retried with the same id every time. The user had to cancel the session manually.

### Root cause analysis (compound failure)

The session pathology is downstream of two independent bugs that compound:

**Bug A — Tool-interface gap on `meta_state_report` (line 45 of `meta-state-report-tool.js`).**
The handler spreads `mechanism_check` only if the caller passes it explicitly:
```js
...(mechanism_check !== undefined && { mechanism_check }),
```
The schema (line 57-58 of `core/meta-state.js`) describes `mechanism_check` as `z.boolean().optional()` with description *"Opt-in flag (SP2): include this finding in grounding checks. Default false."* — explicitly opt-in. But the `loop_describe` discoverability hint and the SessionStart hook surface the *evidence_code_ref* path as the natural thing for an agent to provide. Result: an agent provides `evidence_code_ref`, the finding is written without `mechanism_check`, and downstream `meta_state_check_grounding` returns `skipped` while `meta_state_refresh_fingerprint` returns `not_grounded`. The two fields are decoupled in the API but tightly coupled semantically; the tool gives no signal that they need to be coupled.

**Bug B — No idempotency circuit-breaker on `meta_state_refresh_fingerprint`.**
The tool is a pure read-then-write function with no memoization. 163 identical calls in 53 minutes produced 147 identical error responses. A `Map<id, {hash, ttl}>` with a 60-second window would have collapsed this to 1 call and surfaced the error on the first try, when the agent's context window had room to think.

**Compound effect.** Bug A creates the confusing error pattern (`not_grounded` says "nothing to refresh" but offers no actionable next step). Bug B means the agent's reflex retry cannot self-correct by re-reading the error. The combination is a 53-minute storm: 163 calls × 1 second each ≈ 163 seconds of tool time, plus 42 minutes of model thinking time on the same diagnostic.

### Empirical evidence (from session `dac9b6ed-...`)

- 163 calls to `meta_state_refresh_fingerprint` (out of 234 total tool calls = 70%)
- 147 of those returned `not_grounded`
- 1 returned `entry_not_found` (typo on the id)
- 15 succeeded (first 5 unrelated findings + 1 final retry)
- Agent's thinking channel: 115× verbatim *"I need to stop making the same redundant call. Let me verify the backfill using relationships instead."* + 4 close variants
- Agent self-diagnosed the loop explicitly at 11:31:32: *"I have a broken reflex: when the conversation is about meta-state entries and grounding, my autopilot defaults to `meta_state_refresh_fingerprint` even when you explicitly asked for `meta_state_report`."*
- The user interrupted twice (11:11:32 *"You stuck with meta-260610T1504Z for a while"*, 11:30:27 *"Write the finding in meta-state only"*) — both interventions failed to break the loop because the model reflex outpaced the operator's redirection
- The user cancelled at 11:32:02 after the agent's third attempt to call refresh *immediately after* acknowledging *"I just did it again. I need to stop. Filing the finding now with `meta_state_report`."*

---

## Design questions resolved

| # | Question | Decision | Rationale |
|---|---|---|---|
| 1 | Output of this brainstorm session | **Brainstorm report markdown only** (no code, no loop-design entry yet) | User will plan/cook next; loop-design entry is a separate artifact once the design is approved |
| 2 | Ship the two fixes together or separately? | **One plan, two phases** — Phase 1 cache, Phase 2 report-default | Shared mechanism_check test surface; ships faster; no half-state where refresh is cached but report still has the gap (or vice versa) |
| 3 | Include Option 3 (relax `refresh_fingerprint` to allow explicit operator opt-in)? | **Rule out** — refresh stays strict, all opt-in via report/patch | Preserves SP2 semantics; no semantic drift between "opt-in at report time" and "opt-in at refresh time"; the cache is the better circuit-breaker |
| 4 | Cache layer: tool handler or core module? | **In the tool handler** (`meta-state-refresh-fingerprint-tool.js`), ~10 lines, Map keyed on `id + previous_code_fingerprint`, 60s TTL | Matches existing `core/read-registry-cache.js` pattern (per-process, Map-based); minimal touch surface; YAGNI; the droid session pathology is a single MCP server storm, so per-process dedup is sufficient |

---

## Final recommended solution

### Phase 1 — Idempotency cache on `meta_state_refresh_fingerprint`

**File**: `tools/learning-loop-mcp/tools/meta-state-refresh-fingerprint-tool.js`
**Effort**: ~10 lines of code + ~30 lines of tests
**Approach**: In-process `Map` at module scope. Key on `id + previous_code_fingerprint`. Value is the cached result. TTL 60 seconds.

```js
// Module scope, above the export
const _idempotencyCache = new Map();
const CACHE_TTL_MS = 60_000;

function _cacheKey(id, previousFingerprint) {
  return `${id}::${previousFingerprint ?? "null"}`;
}

function _cacheGet(key) {
  const entry = _idempotencyCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.stored_at > CACHE_TTL_MS) {
    _idempotencyCache.delete(key);
    return null;
  }
  return entry;
}

function _cacheSet(key, result) {
  _idempotencyCache.set(key, { ...result, stored_at: Date.now() });
}
```

Wire-up: after the `entry` is loaded, compute `key = _cacheKey(id, entry.code_fingerprint)`. If `_cacheGet(key)` returns a hit, return the cached result with an additional `cache_hit: true` field. Otherwise, after the tool produces its final result, call `_cacheSet(key, result)`.

**Cache hit conditions**: `(id, previous_code_fingerprint)` matches. This means:
- A repeat call after the file genuinely changed will get a *cache miss* (different hash) and re-run normally.
- A repeat call within 60s with no file change will short-circuit and return the same fingerprint + a `cache_hit: true` flag.
- A repeat call after the TTL expires will re-run.

**Why a Map and not `Map<id, ...>`**: the key includes `previous_code_fingerprint` so a legitimate refresh (file changed → hash changed) is *not* a cache hit. Without the fingerprint in the key, we'd be caching on id alone and could serve stale hashes.

**Why 60s TTL**: long enough to span a typical "agent confused, retrying every few seconds" storm (the droid session averaged one call every 20s); short enough that a legit refactor that takes >60s to settle is still served fresh.

**Why module-scope, not a `Map` inside the handler**: the handler is called per request; a module-scope Map persists across calls within the same MCP server process. The Map is lost on server restart, which is correct (no staleness concern).

**Eviction**: simple LRU is unnecessary at 60s TTL. The Map will not grow unboundedly: keys expire on read, and an entry that is never re-read sits in the Map for at most 60s + the time of its last read attempt. For safety, add a `_idempotencyCache.delete(key)` in the success path... actually no, we want the entry to *survive* success. Just the TTL on read is enough. If memory ever becomes a concern, add a periodic `setInterval` cleanup — out of scope for this plan.

**Tests** (in `tools/learning-loop-mcp/__tests__/meta-state-refresh-fingerprint-tool.test.js`):
- T1: same `(id, previous_fingerprint)` within 60s returns the same result with `cache_hit: true`
- T2: same `(id, different_previous_fingerprint)` is a cache miss
- T3: TTL expiry (use a fake clock or override `_idempotencyCache` directly) re-runs
- T4: error responses (`not_grounded`, `entry_not_found`, `code_missing`) are also cached — this is the *point*: the droid session's 147 `not_grounded` responses collapse to 1

### Phase 2 — Auto-default + warning on `meta_state_report`

**File**: `tools/learning-loop-mcp/tools/meta-state-report-tool.js`
**Effort**: ~5 lines of code + ~30 lines of tests
**Approach**: Two coupled changes (per session discussion, Options 1 + 2 from the user's chat log):

**Change 2a — Auto-default `mechanism_check: true` when `evidence_code_ref` is present and `mechanism_check` is not explicitly set.**

```js
// Replace the current line 45 spread:
...(mechanism_check !== undefined && { mechanism_check }),

// With:
mechanism_check: mechanism_check ?? Boolean(evidence_code_ref),
```

**Why `??` and not `||`**: `mechanism_check: false` is a legitimate explicit choice (agent is documenting a non-grounded observation). `??` only fills in the default when the caller did not pass the field at all. With `||`, a `false` would be coerced to `true`, breaking the explicit-opt-out case.

**Change 2b — Emit a `warnings` field in the response when the caller passed `evidence_code_ref` but explicitly set `mechanism_check: false`.**

```js
const warnings = [];
if (evidence_code_ref && mechanism_check === false) {
  warnings.push({
    code: "evidence_without_mechanism_check",
    message: "evidence_code_ref is set but mechanism_check is false; the fingerprint will not be tracked. Pass mechanism_check: true to opt in to grounding checks.",
  });
}

return {
  content: [{ type: "text", text: JSON.stringify({
    reported: true,
    id,
    status: "reported",
    expires_at: expiresAt.toISOString(),
    ...(warnings.length > 0 && { warnings }),
  }) }],
};
```

**Why a warning, not a block**: the agent may have a legitimate reason to file a non-grounded observation (e.g., a pure-process finding with no code anchor). A warning teaches the next agent without locking out this case.

**Tests** (extend `tools/learning-loop-mcp/__tests__/meta-state-report-tool.test.js` if it exists, otherwise create it):
- T5: `evidence_code_ref` provided, `mechanism_check` omitted → entry has `mechanism_check: true`, no warning
- T6: `evidence_code_ref` provided, `mechanism_check: true` explicit → entry has `mechanism_check: true`, no warning
- T7: `evidence_code_ref` provided, `mechanism_check: false` explicit → entry has `mechanism_check: false`, response includes warning
- T8: `evidence_code_ref` omitted, `mechanism_check` omitted → entry has `mechanism_check: false` (or `null` — TBD by schema), no warning
- T9: `evidence_code_ref` omitted, `mechanism_check: true` explicit → entry has `mechanism_check: true`, no warning (escape hatch preserved)

### Combined effect

The droid session pathology collapses as follows with both phases shipped:

| Step | Today's behavior | After Phase 1 + 2 |
|---|---|---|
| Agent reads discoverability hint | "cite the code, not the markdown" | "cite the code, not the markdown" (unchanged) |
| Agent files finding with `evidence_code_ref` only | entry has `mechanism_check: null` | entry has `mechanism_check: true` (auto-default) |
| Agent reflex-retry calls `refresh_fingerprint` | 147× `not_grounded` errors over 53 minutes | 1× successful `refreshed` response, 0× retries (auto-default + correct intent) |
| Even if the agent loops (Bug B residual) | 147 cache misses | 1 cache miss + N cache hits with `cache_hit: true` |
| Even if the agent explicitly opts out | silent — no signal | response includes a structured warning |

The combined effect is **defense in depth**: the auto-default fixes the happy path (Phase 2), the warning teaches the deliberate-opt-out case (Phase 2), and the cache caps the blast radius of any model reflex that survives both (Phase 1). Each phase ships independently but together they close the loop pathology structurally.

---

## Implementation considerations and risks

### Risks

1. **Cache may hide a legit drift signal.** If a file genuinely changes and the agent calls refresh within 60s of a previous refresh, the cache will short-circuit. *Mitigation*: the cache key includes `previous_code_fingerprint`, so a hash change is a cache miss by construction. The only way to get a stale hash is if the file changes *and* the previous fingerprint was already stored — but that's the entire point of the cache: serving a result that has not been invalidated.

2. **The auto-default may surprise existing callers.** A agent that relies on `mechanism_check` being absent for non-grounded findings will now get `mechanism_check: true` automatically. *Mitigation*: (a) the warning in Change 2b teaches the deliberate-opt-out path; (b) `evidence_code_ref` is the natural opt-in signal, and any agent that wants the old behavior can pass `mechanism_check: false` explicitly.

3. **Tests for the cache may be flaky if a real MCP server is running.** *Mitigation*: the existing test pattern in `meta-state-refresh-fingerprint-tool.test.js` already uses `mkdtempSync(join(tmpdir(), ...))` + `process.env.GATE_ROOT` — a sandboxed temp dir per test. The cache is module-scope, so tests must explicitly clear `_idempotencyCache` between cases (add a `_clearCacheForTests()` export).

4. **The 60s TTL is arbitrary.** *Mitigation*: it is well below the droid session's 53-minute storm but well above the typical ~20s inter-call interval. If a future agent has a legit reason to refresh more than once per minute (unlikely — refresh is a manual operator action), the TTL is a one-line change.

### Non-goals (out of scope)

- **No session-side deduper** (the proposed Phase 0 from the prior RCA). The agent tool runtime doesn't have a per-session deduper hook, and adding one is broader than this fix. The cache is server-side and sufficient.
- **No consult-gate rule** (`rule-no-retry-same-tool-same-args-twice`). That's a separate Bridge-6 design — captured for a future plan, not this one.
- **No changes to `meta_state_check_grounding` or `meta_state_derive_status`**. Those tools have their own `skipped` semantics and are not part of this loop.
- **No changes to the `DISCOVERABILITY_HINTS` array**. The hints already teach evidence_code_ref; they don't need a refresh-specific hint because the cache makes "retrying" a no-op.

### Non-negotiable constraints

- Backward compatibility: existing callers of `meta_state_refresh_fingerprint` continue to work (the cache is transparent; existing tests must pass).
- Backward compatibility: existing callers of `meta_state_report` that pass `mechanism_check: false` explicitly continue to work; the new warning is additive.
- No new dependencies. No new schemas. No new entry kinds.
- TDD: tests written first, in the same style as the recent `260610-1535-meta-state-reopen-path` plan.
- Pre-commit hooks (`validate-records`, `extract-index`) must pass.
- Cache is in-process; no persistence to disk.

### Touchpoints (canonical, from scout)

- `tools/learning-loop-mcp/tools/meta-state-refresh-fingerprint-tool.js` — add ~10 lines for cache module-scope + get/set + wire-up; export `_clearCacheForTests` for test isolation
- `tools/learning-loop-mcp/__tests__/meta-state-refresh-fingerprint-tool.test.js` — add 4 tests (T1-T4); existing tests in this file cover the 4 error paths
- `tools/learning-loop-mcp/tools/meta-state-report-tool.js` — change 1 line in the spread + add 8 lines for warnings; total +9 lines
- `tools/learning-loop-mcp/__tests__/meta-state-report-tool.test.js` — add 5 tests (T5-T9); may not exist yet — verify during Phase 2

**Total**: ~20 lines of production code, ~60 lines of tests, 2 files modified, 0 new files, 0 new dependencies.

---

## Success metrics and validation criteria

1. **All existing tests pass** (`pnpm test` shows the same baseline + the 9 new tests).
2. **The droid session pathology is mechanically prevented**: a test that calls `meta_state_refresh_fingerprint` 100× with the same `(id, fingerprint)` returns 1 actual result + 99 cache hits, all within < 1 second total.
3. **The auto-default + warning path is testable in isolation**: T5-T9 pass with the response shape documented.
4. **No operator intervention required** to break the loop: a fresh agent in a fresh session that hits the same code path will get the auto-default + cache behavior without needing a chat intervention.
5. **Pre-commit hooks pass** (`validate-records`, `extract-index`).

---

## Next steps and dependencies

1. **Plan handoff**: invoke `/ck:plan --tdd` (or default, but TDD recommended because we're modifying existing test surfaces) to produce `plans/260610-1900-meta-state-refresh-loop-circuit-breaker/plan.md` with `phase-01-cache.md` and `phase-02-report-default.md`.
2. **Test surface verification**: confirm `__tests__/meta-state-report-tool.test.js` exists; if not, the plan's Phase 2 must include "create the test file with the 5 new tests."
3. **Loop-design entry (separate artifact, post-plan)**: once the plan ships, file `loop-design-meta-state-refresh-fingerprint-circuit-breaker` with `proposed_design_for` pointing at the two source files, `addresses` pointing at the droid session id (or the implicit compound-failure finding), and `shipped_in_plan` set to the new plan path.
4. **Resolve the droid session finding** (if you choose to file one): the "I was stuck in a refresh-fingerprint loop" is itself a `meta_state_report`-worthy observation. Use the new auto-default + warning + cache in the report so future similar loops are caught mechanically.
5. **Sequencing constraint**: Phase 1 (cache) ships first because it has no schema implication; Phase 2 (report-default) ships second because the `mechanism_check` schema description may want a one-line update to reflect the new default ("Default `true` when `evidence_code_ref` is provided; `false` otherwise") — that's a small docs change, not a schema change.

---

## Open forward decisions (deferred to a separate brainstorm)

1. **Session-side tool-call deduper** (broader than meta-state; applies to all MCP tools). Captured in this brainstorm as a non-goal but worth a future round.
2. **Consult-gate rule for retry suppression** (Bridge 6 design). Captured in this brainstorm as a non-goal; will be filed as a `loop-design` entry after this plan ships.
3. **Refresh-fingerprint entry in `DISCOVERABILITY_HINTS`**: should the warm tier explicitly teach *"calling `meta_state_refresh_fingerprint` more than twice on the same id with the same fingerprint is a no-op"*? Lean: yes, but only after the cache ships so the hint is mechanically true. Defer to a follow-up.

---

## Appendix: Why this is the right fix, not YAGNI

The YAGNI objection: "the droid session was a one-off pathology; just don't loop next time." Counter:
- The session was not a one-off. The error pattern (`not_grounded` from a finding with `mechanism_check: null`) is reproducible: any agent that reads the discoverability hint + has a code-anchored observation will hit it. The auto-default in Phase 2 makes the trap unreachable.
- The cache is the structural circuit-breaker that prevents model reflex pathologies regardless of which specific tool they target. The cost is ~10 lines and one test file; the benefit is that *any* future agent reflex that re-runs refresh 100+ times collapses to 1 call.
- The compound effect is the point. Bug A is a UX bug (silent miss); Bug B is a structural bug (no server-side dedup). Fixing only A leaves a 53-minute storm for any agent that hits B; fixing only B leaves a UX bug for any agent that hits A. Both together close the loop.

## Appendix: Why not Option 3 (relax `refresh_fingerprint`)

The user's chat log proposed 3 options: (1) auto-enable, (2) warn, (3) allow explicit refresh on any entry with `evidence_code_ref`. Option 3 was rejected because:
- It collapses two semantically distinct operations: "refresh a stored fingerprint" vs. "create and store a fingerprint for the first time." The current `updateEntry` is a no-op on a non-existent fingerprint; Option 3 would require `refresh_fingerprint` to call `updateEntry` *and* `writeEntry` conditionally, with the call site branching on whether `code_fingerprint` was set.
- The operator calling `refresh_fingerprint` *is* the opt-in, the chat log argued. But opt-in via refresh is implicit (the operator has to know they need to refresh) vs. opt-in via report (which the agent already does). Fixing the surface at report time is closer to the source.
- If the user later wants an "operator-force-refresh" escape hatch, the right shape is a `force: true` parameter that skips the `mechanism_check` guard, not a silent semantic change to the default path. That's a small follow-up plan if needed; not this one.

## Appendix: Test surface verification (deferred to plan)

The plan must verify, in its Phase 0, that:
- `tools/learning-loop-mcp/__tests__/meta-state-report-tool.test.js` exists. If not, the plan's Phase 2 will create it.
- `tools/learning-loop-mcp/__tests__/meta-state-refresh-fingerprint-tool.test.js` exists and has the 4 error-path tests. (Confirmed via scout; the file exists with the 4 base cases.)
- The pre-commit hook chain (`validate-records`, `extract-index`) is unchanged.
