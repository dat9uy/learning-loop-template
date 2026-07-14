---
phase: 2
title: "Hint Rewrite"
status: completed
priority: P2
dependencies: [1]
---

# Phase 2: Hint Rewrite

## Overview

Rewrite the stale PROCESS_HINTS row #1 (dead `.test-logs/<ns>.log` references from the removed namespaced runner) into one canonical test-discipline row covering fast-feedback run flags + the deterministic parse procedure, then mirror it byte-for-byte to `.factory/hooks/loop-surface-inject.cjs` so the parity test stays green.

## Requirements

- Functional: row #1 covers (a) run targeted not full suite — `vitest run --bail=1` (iterate), `vitest run <path>` (one file), `vitest --changed` (post-edit); (b) parse once via `bash tools/scripts/vitest-failures.sh` with the jq one-liner as fallback; (c) explicit "do NOT grep raw vitest stdout, re-read passing tests, or hand-write `python -c`/`node -e`". Keep Rule 2 (same-file-read journal stop) from the old row; drop Rule 1 (silent-command `.test-logs/<ns>.log` tail — references deleted writer).
- Non-functional: the rewritten string is byte-for-byte identical in both `loop-introspect.js` and `loop-surface-inject.cjs` (parity test `cold-session-discoverability.test.cjs:307` enforces exact equality).

## Architecture

PROCESS_HINTS is the agent's at-startup operational surface (injected by SessionStart hook + `loop_describe` warm tier). One row, not two — DRY (overlapping rows was the rejected alternative). The script reference makes the canonical parse path a single cheap command; the jq one-liner is the fallback if the script is absent in a stripped checkout.

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/loop-introspect.js` (PROCESS_HINTS row #1, line ~129)
- Modify: `.factory/hooks/loop-surface-inject.cjs` (LOCAL_PROCESS_HINTS row #1, line ~36 — currently byte-identical to canonical row #1, confirmed during scout)

## Implementation Steps

1. Draft the new row #1 string (covers run flags + parse procedure + the "do NOT" clause + retained Rule 2).
2. Replace row #1 in `loop-introspect.js` PROCESS_HINTS.
3. Replace row #1 in `.factory/hooks/loop-surface-inject.cjs` LOCAL_PROCESS_HINTS with the identical string.
4. Diff the two rows: `grep -A0` extract both and `diff` — must be empty.
5. Run the cold-session parity test: `pnpm test:cold-session`.

## Success Criteria

- [x] row #1 in both files is byte-for-byte identical (empty `diff`)
- [x] new row covers all three run flags + parse-via-script + jq fallback + the "do NOT hand-parse" clause
- [x] dead `.test-logs/<ns>.log` references gone
- [x] `pnpm test:cold-session` passes (11/11)

## Risk Assessment

- **Parity break**: any byte difference fails the cold-session test. Mitigation: copy the exact string into both files; verify with `diff` before running the test.
- **Hint bloat**: row gets long. Mitigation: keep it terse — script path + one-liner + run flags as a compact list; this is a process hint, brevity is the point.
- **Concurrent edit with tangential plans**: `260622-1810`/`260628-1337` touch the same arrays. Mitigation: only row #1 is changed here; merge conflicts would be textual and resolvable.