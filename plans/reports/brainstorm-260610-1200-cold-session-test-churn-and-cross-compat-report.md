# Cold-session test finding churn + cross-compat — brainstorm report

**Date**: 2026-06-10
**Author**: ck:brainstorm
**Session type**: consolidation (combines prior debugger reports)
**Source reports** (now superseded by this document):
- `debugger-260610-1040-cold-session-finding-churn-root-cause-report.md` (root cause)
- `debugger-260610-1131-cold-session-followup-answers-and-cross-compat-plan.md` (follow-up + design + turn 3 amendment)

**Status**: Approved design, ready to implement. All prior unresolved questions resolved.

---

## Problem statement

The cold-session discoverability test (`tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs`) creates **finding churn** in `meta-state.jsonl`. The registry shows 4-second ping-pong between finding creation and resolution:

```
meta-260609T1746Z  created 10:46:01  resolved 10:47:34  by auto-cold-session-test
meta-260609T1747Z  created 10:47:43  resolved 17:39:28  by auto-cold-session-test    (+9s after first was resolved)
meta-260610T0039Z  created 17:39:43  resolved 18:01:54  by auto-cold-session-test    (+15s after second was resolved)
meta-260610T0102Z  created 18:02:03  resolved 18:39:38  by auto-cold-session-test    (+9s after third)
```

11 entries with `session_id=test-cold-session-mcp-client-loading` in a 514-line registry ≈ 2.1% of all entries, almost all churn.

### Root cause (two independent bugs)

**1. Logical collision (churn).** Test 3 (L1 probe, CLI catalog) and test 5 (L2 probe, agent runtime) intentionally share `session_id=test-cold-session-mcp-client-loading` + `subtype=mcp-client-loading` so the `rule-cold-session-test-must-pass-before-resolution` evidence aggregates across both layers. The L1 probe's gap-close branch (test.cjs:582-606) finds ANY finding matching that key and resolves it — including L2 findings. L2's idempotency guard (test.cjs:828-832) only checks `status ∈ {active, reported}`, so once L1 resolves an L2 finding, L2 writes a fresh one on the next run. Net: every other test run adds a new L2 finding.

**2. TOCTOU race.** `node --test` runs top-level `test()` calls concurrently by default. Both probes read the registry, find no active finding, detect their respective gaps, and write simultaneously. Registry ends with 2 findings per `session_id+subtype` on race-loss. The shared read-then-write pattern at test.cjs:618-632 (test 3) and 817-831 (test 5) is fundamentally un-CAS-able for inserts — there is no "expected version" for a non-existent entry.

## Requirements

| Item | Concrete value |
|------|----------------|
| **Expected output** | (a) Server-side `tryClaimSessionId(root, {sessionId, subtype, runtime, layer}, builder)` atomic helper in `core/meta-state.js`. (b) Refactored cold-session test using the helper. (c) Freshness sentinel test (3-day window, loud failure) in normal `pnpm test`. (d) Cross-compat support: detect droid OR claude CLI; tag finding `description` with `runtime: <cli>; layer: L1|L2`. (e) Updated `package.json#scripts.test:cold-session` and `.gitignore`. |
| **Acceptance criteria** | 5-concurrent `tryClaimSessionId` calls with same key end with exactly 1 finding. L1's gap-close branch no longer resolves L2-layer findings. Freshness test fails loud if sentinel > 3 days old. Cross-compat: Claude-only env runs the test against claude; Droid-only runs against droid; both-CLI env runs each. The rule `rule-cold-session-test-must-pass-before-resolution` is unchanged. |
| **Scope boundary** | In scope: atomic helper, test refactor, freshness sentinel, cross-compat detection, scripts/gitignore. Out of scope: changing the rule's pattern, changing `gate-resolution-evidence.test.js`, adding pre-push hook, adding GitHub Actions, changing the bucket-D classification. |
| **Non-negotiable constraints** | (1) No new dependencies. (2) No rule update — `pattern` stays `"test-cold-session-mcp-client-loading"`. (3) Pre-commit hook stays fast (<1s). (4) File naming follows kebab-case + existing naming convention. (5) Pre-existing `pnpm test` glob must continue to match all current tests. |
| **Touchpoints** | `core/meta-state.js` (new helper, ~30 lines); `core/__tests__/meta-state.test.js` (5-concurrent race test); `__tests__/cold-session-churn-regression.test.js` (new file, L1-resolves-L2 test); `__tests__/cold-session-discoverability.test.cjs` (refactor tests 3+5, add `detectAgentCli()`, sentinel write); `__tests__/cold-session-freshness.test.js` (new file, ~15 lines); `package.json#scripts`; `.gitignore`. |

## Evaluated approaches

### Q1 (churn): How to fix the read-then-write race

| Option | Approach | Pros | Cons | Verdict |
|--------|----------|------|------|---------|
| A | Server-side `tryClaimSessionId` atomic helper under existing `enqueue` lock | Eliminates the race at the registry core; helper is reusable for any future session-id-keyed claims; preserves rule's exact-match contract | Adds 1 new public function to `core/meta-state.js` | **Recommended** |
| B | Separate `session_id` per layer (`...-l1`, `...-l2`) with rule pattern updated to prefix regex | Slightly simpler test logic | Forces rule update (breaks exact-match contract); complicates rule tests; less reusable | Rejected — over-reach |
| C | Regression test only (asserts no churn in registry) | No code change to fix | Doesn't fix the race; just observes it | Rejected — observation, not fix |

### Q2 (cross-compat): How to support both Droid and Claude

| Option | Approach | Pros | Cons | Verdict |
|--------|----------|------|------|---------|
| D | Per-runtime `session_id` suffix (`...-droid` / `...-claude`) with rule pattern prefix regex | Clean separation in registry | Forces rule update; rule loses aggregation contract | Rejected — over-reach |
| E | Per-runtime `description` markers (`runtime: droid; layer: L1; ...`); shared `session_id`; helper filters on description | Decouples rule from helper; no rule change; no schema change; clean test fixture | Markers are convention-only (no schema validation) | **Recommended** |
| F | New `runtime` field on the finding schema | Schema-validated | Requires schema change + migration of 11 existing entries | Rejected — YAGNI, schema bloat for a single use case |

### Q3 (freshness): How to keep cold-session test from going stale

| Option | Approach | Pros | Cons | Verdict |
|--------|----------|------|------|---------|
| G | GitHub Actions nightly cron | Standard CI pattern | Project has no GitHub Actions infra; would require workflow file | Rejected — infra not available |
| H | Pre-push hook | Catches drift before push | 60-90s test would block all `git push`; users bypass with `--no-verify`; pre-push is for fast checks | Rejected — wrong shape |
| I | Freshness sentinel test in normal `pnpm test` (3-day window, fails loud) | Lives in normal test glob; no CI required; catches drift on every PR; 3-day window fits weekly cadence | Sentinel is local-state artifact (must gitignore) | **Recommended** |
| J | Separate `pnpm test:e2e` glob run on merge-to-main only | Conventional | Requires workflow file (no infra); doesn't catch "forgot for 2 weeks" | Rejected — same infra blocker as G |

## Final recommended solution

### Architecture

```
┌────────────────────────────────────────────────────────────┐
│  cold-session test (refactored)                            │
│  ┌────────────────────────────────────────────┐            │
│  │  detectAgentCli() → 'droid' | 'claude'    │            │
│  │  sessionId = "test-cold-session-mcp-       │            │
│  │              client-loading"  (shared)     │            │
│  └─────────────────┬──────────────────────────┘            │
│                    │                                       │
│  L1 probe: probeL2Gap() shared helper                      │
│  L2 probe: probeL2Gap() real droid runtime                 │
│                    │                                       │
│                    ▼                                       │
│  ┌────────────────────────────────────────────┐            │
│  │  tryClaimSessionId(root,                   │            │
│  │    { sessionId, subtype, runtime, layer }, │            │
│  │    entryBuilder)                           │            │
│  │                                            │            │
│  │  under enqueue(root, () => { ... })        │            │
│  │  filter on (sessionId, subtype, runtime    │            │
│  │    marker, layer marker)                   │            │
│  │  atomic: 1 finding per key, no race        │            │
│  └─────────────────┬──────────────────────────┘            │
│                    │                                       │
│                    ▼                                       │
│  core/meta-state.js (readRegistry, writeEntry)             │
│                    │                                       │
│                    ▼                                       │
│  meta-state.jsonl (1 finding per key, no churn)           │
│                    ▲                                       │
│                    │                                       │
│  rule-cold-session-test-must-pass-before-resolution       │
│  (UNCHANGED — still exact-match on                        │
│   session_id === "test-cold-session-mcp-client-loading")  │
└────────────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────┐
  │  cold-session-freshness.test.js (new)       │
  │  reads .cold-session-sentinel.json          │
  │  asserts age < 3 days                       │
  │  FAILS LOUD on missing/stale sentinel       │
  │  → forces agent to run pnpm test:cold-session
  └─────────────────────────────────────────────┘
```

### Why this design

1. **The rule doesn't change.** The rule's `pattern` is the aggregation contract; relaxing it would break the rule's exact-match contract for no benefit. Runtime/layer distinction goes in `description` markers where the rule doesn't look. Rule and helper are decoupled.
2. **The race is fixed at the source.** Moving the check-then-write inside `enqueue` eliminates the race for any caller, not just the cold-session test. Future session-id-keyed claims (e.g., for other agent probes) get atomicity for free.
3. **Cross-compat is additive.** Adding `runtime` to the helper signature is the only change to support Claude. The existing Droid path still works unchanged.
4. **Freshness is in the normal test glob.** A 3-day-old sentinel is loud-failed in `pnpm test`, so drift surfaces on the next PR. No new CI infra.
5. **Pre-commit stays fast.** No slow test added. The 60-90s test is opt-in via `pnpm test:cold-session`.

## Implementation plan (1 PR, 2 commits)

### Commit 1: Server-side atomic helper + tests (the structural fix)

| # | File | Change | Lines |
|---|------|--------|-------|
| 1 | `core/meta-state.js` | Add `tryClaimSessionId(root, {sessionId, subtype, runtime, layer}, entryBuilder)` under `enqueue` lock | +30 |
| 2 | `core/__tests__/meta-state.test.js` | Add 5-concurrent-claim race test (red → green) | +25 |
| 3 | `__tests__/cold-session-churn-regression.test.js` (new) | Add L1-resolves-L2 logical-collision test (red → green) | +30 |
| 4 | `__tests__/cold-session-discoverability.test.cjs` | Refactor tests 3 + 5 to use `tryClaimSessionId`; replace read-then-write with helper call | -5 / +10 |

**Verify after commit 1**: `pnpm test` shows 0 regressions, race test passes, L1-resolves-L2 test passes, existing `gate-resolution-evidence.test.js` still passes (rule unchanged).

### Commit 2: Freshness sentinel + cross-compat (the operational fix)

| # | File | Change | Lines |
|---|------|--------|-------|
| 1 | `__tests__/cold-session-discoverability.test.cjs` | Add `detectAgentCli()` helper; update `spawn("droid", ...)` → `spawn(cli, ...)`; tag finding `description` with `runtime: <cli>; layer: L1|L2`; write sentinel at end of pass | +25 / -5 |
| 2 | `__tests__/cold-session-freshness.test.js` (new) | Loud-fail test asserting sentinel age < 3 days; reads `tools/learning-loop-mcp/__tests__/.cold-session-sentinel.json` | +15 |
| 3 | `package.json#scripts` | Add `"test:cold-session": "node --test tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs"` | +1 |
| 4 | `.gitignore` | Add `tools/learning-loop-mcp/__tests__/.cold-session-sentinel.json` (local-state artifact) | +1 |

**No changes to**: `core/gate-logic.js`, `gate-resolution-evidence.test.js`, the rule's `pattern` field, the `enqueue` lock contract, `package.json#scripts.test`.

**Total**: ~80 lines added, 4 files modified, 2 files added, 1 `.gitignore` entry, 0 new dependencies.

## TDD scouting plan (red → green → refactor)

Run in this order; each step is independently verifiable.

1. **Red — race test** (`core/__tests__/meta-state.test.js`): 5 concurrent `tryClaimSessionId` calls with same `(sessionId, subtype, runtime, layer)`. Assert exactly 1 finding in registry, 1 unique id returned. **Expected: FAIL** (helper doesn't exist; import fails).
2. **Red — logical collision test** (`__tests__/cold-session-churn-regression.test.js`): L2 finding pre-populated. L1's gap-close branch runs. Assert L2 finding is preserved. **Expected: FAIL** (current read-then-write resolves L2's finding).
3. **Green — implement helper** (`core/meta-state.js`): add `tryClaimSessionId` per signature above. **Expected**: both red tests pass.
4. **Green — refactor tests 3 + 5** (`cold-session-discoverability.test.cjs`): replace read-then-write with `tryClaimSessionId`. Gap-close branch becomes a one-liner using the helper's `claimed: false` return path.
5. **Verify rule** (`gate-resolution-evidence.test.js`): existing tests should pass unchanged. Rule's contract is preserved.
6. **End-to-end** (post-merge): run `pnpm test:cold-session` in a real droid env. Capture before/after churn counts from `meta-state.jsonl`. Expect: 11 → ≤1 churn entries.
7. **Full suite** (`pnpm test`): expect 0 regressions. Freshness sentinel test is the only new test in the normal glob.

## Success criteria

- **Churn count**: `meta-state.jsonl` entries with `session_id=test-cold-session-mcp-client-loading` and `status=stale|expired|resolved` drops from 11 (current) to ≤2 (one per L1/L2, no ping-pong).
- **Race invariant**: 5 concurrent `tryClaimSessionId` calls with the same key always end with exactly 1 finding.
- **Layer isolation**: L1's gap-close branch does not resolve L2 findings (or vice versa).
- **Cross-compat**: in a Claude-only env (no droid in PATH), `pnpm test:cold-session` runs against claude; in a Droid-only env, against droid; in a both-CLI env, each runtime runs once with its own marker.
- **Freshness**: `pnpm test` fails loud if `pnpm test:cold-session` hasn't been run in 3 days.
- **Rule intact**: `rule-cold-session-test-must-pass-before-resolution` semantic behavior unchanged — still blocks `meta_state_resolve` of `meta-260606T0443Z-mcp-tools-not-loaded-into-agent-tool-list` until no active finding with the matching key exists.

## Implementation considerations

### Risk 1: `enqueue` lock scope under multi-process

`enqueue` is per-process. If `node --test` is ever run with `--test-concurrency=N` and N > 1 spawns worker processes, each gets its own lock. The insert race could still occur across processes. **Mitigation**: `pnpm test` (which the freshness test joins) is single-process. The cold-session test itself is also single-process. If a future change introduces multi-process testing, add a filesystem lock (`flock`) wrapper around the helper. Document in code comment.

### Risk 2: Schema drift on `description` markers

The `description` markers (`runtime: <cli>; layer: L1|L2`) are convention-only. If a future refactor rewrites the description, the helper's filter breaks. **Mitigation**: add a unit test that asserts every active `mcp-client-loading` finding has both `runtime:` and `layer:` markers in description. The test runs in `pnpm test` and fails loud on drift.

### Risk 3: Sentinel file drift across worktrees / clones

The sentinel file is local-state; if a developer clones the repo, no sentinel exists initially. `pnpm test` fails loud with the message "Cold-session test has never been run. Run: pnpm test:cold-session". **Mitigation**: the loud-fail message is the onboarding path. Document in AGENTS.md that a fresh clone requires running `pnpm test:cold-session` once.

### Risk 4: False-positive churn on rule aggregation

If the helper's `runtime`/`layer` filters are too loose, two runtime+layer pairs could share a key. **Mitigation**: the 5-concurrent race test (Step 1) and the L1-resolves-L2 test (Step 2) together cover this. The filters are exact-string-includes, so unintended cross-matching is detectable by reading the helper code.

## Dependencies

- **None new.** All edits use existing dependencies: `node:test`, `node:fs`, `node:child_process`, `node:assert`, `yaml` (already in package.json).
- **Pre-existing**: `core/meta-state.js` already exports `enqueue`, `readRegistry`, `writeEntry`, `updateEntry`. The new helper composes these.

## Next steps

1. Apply commit 1 in a worktree (4 files modified, 1 added, ~80 lines).
2. Run TDD steps 1-5 in order; gate each step on its assertion passing.
3. Apply commit 2 (2 files added, 2 modified, ~40 lines).
4. Run `pnpm test` — expect 0 regressions, freshness test green (sentinel will be missing → loud fail → run `pnpm test:cold-session` once to seed).
5. Run `pnpm test:cold-session` in a real env — verify churn count drops.
6. Optional: log this design as `entry_kind: loop-design` in `meta-state.jsonl` via `meta_state_propose_design` MCP tool for future traceability.

## Open questions

None. All 3 previously unresolved questions resolved in the turn 3 amendment:

1. **Rule pattern change** — RESOLVED. Rule does NOT change; runtime/layer go in `description` markers.
2. **Sentinel file location** — RESOLVED. `tools/learning-loop-mcp/__tests__/.cold-session-sentinel.json` (gitignored).
3. **Skip-or-fail on missing sentinel** — RESOLVED. Loud failure (`assert.fail` with clear message).

## Status

**Status:** DONE
**Summary:** Atomic `tryClaimSessionId` helper + description markers (no rule change) + 3-day freshness sentinel + cross-compat via `detectAgentCli()`. 1 PR, 2 commits, ~80 lines, 0 new dependencies, 0 rule changes. All previously unresolved questions resolved. TDD scouting plan in place. Ready to implement.
**Next step:** Apply commit 1 in a worktree, follow the 7-step TDD scouting plan, then apply commit 2. End-of-session handoff: this report is the canonical reference.
**Concerns/Blockers:** None.
