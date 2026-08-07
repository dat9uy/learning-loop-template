---
phase: 4
title: "Flake diagnosis (Finding C)"
status: completed
priority: P2
effort: "0.5-1d"
dependencies: ["1"]
---

# Phase 4: Flake diagnosis (Finding C)

## Overview
Diagnose and close the two pre-existing gate-logic flakes. The finding claims they
"reproduce on HEAD," but verification shows **67/67 pass in isolation**, so the flake
is full-suite ordering/state pollution, not a consistent failure. Diagnosis-first; do
not blindly change assertions (the tests assert the secure `escalate` behavior and
pass in isolation).

## Requirements
- Functional: the two tests pass DETERMINISTICALLY in the FULL suite across repeated
  runs (no intermittent `ok`), OR the finding is closed with reproduction evidence.
- Non-functional: no test-assertion change unless the root cause proves the secure
  behavior actually changed (it has not, per isolation evidence).
- The two tests:
  1. `gate-logic-data-command-quotes.test.js` — `pnpm exec vitest run x.test.js 2>&1 |
     tail -30` → expects `escalate` (real violation, VITEST_RULE).
  2. `gate-logic-echo-prose-pipe-target.test.js` — `echo "vitest run | tail" | bash` →
     expects `escalate` (real exec-sink bypass, VITEST_RULE).

## Architecture
- Candidate root causes (full-suite-only) — red-team #3 corrected the "no in-memory
  state" claim. The live path has THREE mutable-state vectors:
  - **`promotedRulesCache`** — `const promotedRulesCache = new Map()` at
    `gate-logic.js:1363`, consumed by `loadPromotedRules` (which `applyPromotedRules`
    calls via `evaluate-bash-gate.js:192`), keyed by `root` and invalidated by
    `(mtime, size)` of `meta-state.jsonl` (`gate-logic.js:1377-1380`). Two tests
    reusing a temp `root` whose `meta-state.jsonl` rewrites collide on `(mtime, size)`
    (possible on fast SSDs with ms-resolution mtime) would serve stale rules → rule
    skipped/present wrongly → `ok` instead of `escalate`. This matches the flake
    signature exactly.
  - **`overrideCache`** — `const overrideCache = new Map()` at `gate-override.js:9`,
    keyed by `root`, 1s TTL + mtime/size invalidation (`gate-override.js:41-46`). A
    stale positive entry within the 1s TTL on a shared/recycled root skips the
    vitest rule → `ok`. (Red-team #12: the cache is keyed by `root`, so "cache-key
    collision across roots" is IMPOSSIBLE — drop that hypothesis; the vector is a
    stale entry on the SAME root within TTL.)
  - **`process.env.GATE_ROOT`** — `findProjectRoot()` reads it (`gate-logic.js:1148`).
    The two flake tests call `applyPromotedRules(cmd, null, [VITEST_RULE])` with NO
    `root`, so `root` resolves to `process.env.GATE_ROOT`. A polluter that sets
    `GATE_ROOT` to a temp dir with a `.gate-override` marker (as `gate-override.test.js`
    does, `process.env.GATE_ROOT = root` + `writeGateOverride` + `afterEach` deletion)
    can leak if cleanup runs late or the worker interleaves.
  - Also filesystem: a leftover `.gate-override` marker on a shared root within its
    `ttl_seconds` (separate from the in-memory cache).

## Related Code Files
- Read/diagnose: `tools/learning-loop-mastra/core/gate-logic.js` (`applyPromotedRules`,
  `readGateOverride`), `tools/learning-loop-mastra/core/gate-override.js`
  (`readGateOverride` cache + per-surface `.gate-override` reads)
- Read: the gate-override test files; any test writing `.gate-override` or
  `runtime-state.jsonl` or preflight markers
- Possibly modify: the polluting test (cleanup/teardown) or `applyPromotedRules`
  (isolate from override in the test path) — only after root cause is proven

## Implementation Steps (TDD / flake-claim verification)
1. **Reproduce in the full suite:** run `pnpm test` (or the gate-logic namespace) to
   a per-namespace log (per `pnpm-test-discipline`), repeated 3x. Diff the
   failing-test set vs the isolation baseline (67/67 pass). Capture the exact
   failing tests + neighbors. Do NOT bypass hooks.
2. **Bisect the polluter:** use vitest's test-order isolation (`--no-file-parallelism`,
   `--shuffle` off, then `--reporter=verbose`) or run the flake file AFTER suspected
   polluters (gate-override tests, runtime-state tests, preflight tests) to find the
   triggering test. Confirm by reordering.
3. **Prove root cause:** once a polluter is found, demonstrate the mechanism — e.g.
   a leftover `.gate-override` marker with `rule-no-raw-stdout-vitest` in `rule_ids`
   causes `applyPromotedRules` to `continue` (skip) the rule → `ok`. Verify by
   inspecting the override file left on disk after the polluter.
4. **Fix the cause:** prefer fixing the polluting test over changing gate code.
   Candidates: (a) a test TEARDOWN that clears `promotedRulesCache`/`overrideCache`
   (add a `__test__` reset hook for both Maps) and removes `.gate-override` markers
   / temp roots; (b) scope `GATE_ROOT`/override writes to a per-test temp root with
   reliable `afterEach`. If the gate itself leaks (e.g. `promotedRulesCache` keyed by
   `(mtime,size)` collides), fix the cache key (include a content hash, or clear
   between test files) — NOT a "cross-root collision" (impossible; the cache is keyed
   by `root`). Only change gate code if a proven leak has no test-side fix.
5. **Verify determinism:** re-run the full suite 3x — the two tests pass every time.
6. **If unreproducible:** after good-faith full-suite reproduction attempts the flake
   does not recur, re-verify the finding via `meta_state_re_verify({ id: "<C-finding-id>",
   refresh: true })` and resolve it with the reproduction evidence (`meta_state_resolve`
   with the isolation + full-suite logs as `source_ref`).

## Success Criteria
- [ ] Root cause identified (a specific polluter + mechanism) OR the finding closed
  with non-reproduction evidence.
- [ ] The two tests pass deterministically in the full suite across 3 repeated runs.
- [ ] No security-bypass regression introduced by the fix.
- [ ] Finding C resolved or re-verified-with-evidence in meta-state.

## Risk Assessment
- **False diagnosis (medium):** the flake may not reproduce on this machine/seed.
  Mitigation: 3x repeated full-suite runs + bisect; if non-reproducible, close with
  evidence rather than guess-fix.
- **Touching gate code to fix a test (low):** prefer test-teardown fixes; only change
  gate code if the gate leaks state (proven, not assumed).