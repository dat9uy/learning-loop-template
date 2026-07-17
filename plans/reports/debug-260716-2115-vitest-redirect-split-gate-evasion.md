# Debug: vitest redirect-split gate evasion

**Session:** cba9d506-6411-43f7-b25d-1192db9b80eb
**Date:** 2026-07-16
**Skill:** /ak-debug → /ak-fix
**Finding:** meta-260716T2220Z-…redirect-split (reopens meta-260715T1328Z-…)

## Symptom
Agents evade `rule-no-raw-stdout-vitest` by a **two-command redirect-split**:
1. `vitest run <path> > /tmp/x.log 2>&1` — gate `ok` (redirect, no pipe)
2. `grep -E "Tests|FAIL" /tmp/x.log` — gate `ok` (no vitest token, no pipe)

Observed in transcript cba9d506 lines 18-43, 81-85, 117-127.

## Root cause
`gate-logic.js:804-829` (`applyPromotedRules`) matches per-segment + full-command on a **single** command string. `splitSegments` (`:94-162`) splits on `; & |` — **not** `>`. The matcher is **stateless across commands**, so no single-command regex can catch step 2 (`grep /tmp/x.log` has no `vitest run`/`pnpm test` token). Each regex refinement (tail→grep→head) just shifts the evasion; the redirect-split is the current uncovered shape.

**Deeper driver:** no one-command focused-runner existed, so agents invented a `/tmp` capture and grepped human vitest stdout. The correct path was a two-command recipe in `PROCESS_HINTS` row #1 that agents mangled by redirecting.

Key fact: `vitest.config.mjs` sets `reporters: ["default","json"]` + `outputFile.json: ".test-logs/vitest-results.json"` **globally** — every `vitest run` (even single-file, even with stdout redirected) writes the JSON to disk. The `/tmp` redirect was never necessary.

## Fix (option A: incentive-removal, + option D: record)
- **`tools/scripts/test-one.sh`** (new, executable): `vitest run --bail=1 "$@" 1>/dev/null; bash vitest-failures.sh`. One-command focused runner; no pipe (gate-safe).
- **`package.json`**: `test:one: "bash tools/scripts/test-one.sh"`.
- **`tools/scripts/vitest-failures.sh`**: invalid-JSON branch now sniffs human vitest stdout (`Test Files|RUN v|⎯⎯⎯`) and points at `pnpm test:one`/`test:iter`; preserves the generic hint for non-human garbage.
- **`PROCESS_HINTS` row #1** (`loop-introspect.js` canonical + `.factory/hooks/loop-surface-inject.cjs` mirror, byte-equal): "One file" recipe → `pnpm test:one <path>`; added the redirect-split warning; preserved locked substrings (`pnpm test:iter`, `vitest-failures.sh`, `Do NOT grep raw vitest stdout`, `same-file-read`).
- **`rule-no-raw-stdout-vitest`** unchanged — kept as a speed-bump for the direct pipe. Gate still escalates `vitest run … | tail`.

## Side effects caught + fixed (blast radius)
Full-suite first run failed 3 — all caused by the hint edit:
1. `cold-session-discoverability` — `.factory` hook has a **literal `LOCAL_PROCESS_HINTS` copy** (shim-not-fork); parity test enforces byte-equality. **Fixed** by mirroring row #1.
2. `loop-describe-warm-tier` — substring assert `vitest-failures.sh` dropped. **Fixed** by restoring it in the "One file" sentence.
3. `session-start-inject-process-hints` — locked phrase `Do NOT grep raw vitest stdout` broken by my sentence restructure. **Fixed** by splitting into two sentences (new redirect warning + the verbatim locked phrase).

Surfaces audited: only `.factory/hooks/loop-surface-inject.cjs` carries the mirror; `.claude` uses the universal hook (imports `buildProcessHints`); no stale OLD-recipe copies anywhere.

## Verification (fresh evidence)
- `pnpm test:one tools/scripts/__tests__/test-one.test.js` → 6/3 green (fix exercises itself)
- `pnpm test:one …/vitest-failures.test.js` → 8/3 green (+2 human-stdout branch)
- `gate_check` direct `| tail` → **escalate** (rule not weakened)
- `gate_check` `bash test-one.sh …` → **ok** (wrapper not false-blocked)
- canonical↔mirror byte-equality → `arrays equal: true`
- **`pnpm test` → exit 0, 2128 tests / 432 suites green**

## Regression tests added
- `vitest-failures.test.js`: human-stdout sniff branch (exit 2 + `pnpm test:one` pointer) + non-human garbage does NOT trip the pointer.
- `test-one.test.js`: static contract (no literal `|`, forwards `"$@"`, calls vitest-failures.sh) + stubbed-vitest behavior (green→exit 0+summary; no-JSON→exit 2).

## Meta-state
- `meta-260716T2220Z-…redirect-split` (open) — documents the evasion + durable fix; reopens origin.
- `meta-260715T1328Z-…` (resolved via cascade) — origin closed.
- `meta-260716T2220Z-…full-command-second-pass` (open) — **separate** gate-logic-bug: full-command pass false-positives when banned tokens appear inside quoted grep/jq patterns (hit this debug session at 14:16/14:17). Not addressed by this fix; candidate fix = strip quoted regions before the full-command pass.

## Unresolved questions
1. Address the secondary `full-command-second-pass` gate-logic-bug now or defer? (Left open.)
2. Should `test:one` also seed `file-index.jsonl` (like `test` does) for cold-session parity, or is the seed step only needed for full runs? (Currently `test:one` does not seed; targeted runners `test:cold-session`/`test:debug` also skip it by convention.)
