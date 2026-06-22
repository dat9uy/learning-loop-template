---
phase: 2
title: "per-namespace-logs"
status: pending
priority: P1
dependencies: [phase-01-runner-script]
effort: "S"
---

# Phase 2: per-namespace-logs

## Overview

Add per-glob log files in `.test-logs/` so the agent (and humans) can inspect a single namespace's progress without re-running the full suite. Gitignore the directory to keep the repo clean.

## Requirements

- **Functional:**
  - Each glob's stdout+stderr is mirrored to `.test-logs/<ns>.log` (one file per glob)
  - The log file is overwritten on each run (idempotent)
  - The directory is created on first run (no manual setup)
- **Non-functional:**
  - `.test-logs/` is gitignored (`.gitignore:1+`)
  - Log files are human-readable (no ANSI escape codes; stripped at write time)
  - The agent can `tail -f .test-logs/<ns>.log` to see live progress

## Architecture

The runner script (Phase 1) writes to `.test-logs/<ns>.log` via a `WritableStream` opened before `child_process.spawn`. The file is closed after the child process exits. Pattern: existing `.cold-session-sentinel.json` (gitignored at `.gitignore:20`).

## Related Code Files

- **Modify:** `tools/scripts/run-pnpm-test-namespaced.mjs` (Phase 1) — add log file write per glob
- **Modify:** `.gitignore` — add `.test-logs/`

## Implementation Steps

1. **In the runner script**, for each glob:
   - Open a write stream to `.test-logs/<ns>.log` (overwrite mode)
   - Pipe child stdout + stderr to both:
     - the parent process stdout (with `[<ns>]` prefix per line)
     - the log file (raw, unprefixed)
   - Close the stream on child exit
2. **Add to `.gitignore`:**
   ```
   .test-logs/
   ```
   **Note (per Red Team M21):** the existing `*.log` rule in `.gitignore:4` already covers `.test-logs/*.log` files. The directory rule is defensive (prevents accidental check-in if log files ever lose their `.log` extension). The added rule is not load-bearing.
3. **Add a "log file exists" check in the runner:** if `.test-logs/` does not exist, create it via `fs.mkdir(..., { recursive: true })`. No manual setup needed.
4. **Test:** run the suite, then `ls -la .test-logs/` — expect 9 files (one per active glob). `cat .test-logs/mcp-tools.log | head -20` — expect the spec reporter output for that namespace.
5. **Document the concurrent-run limitation** (per Red Team H10): if two `pnpm test` invocations run concurrently, log files interleave. The runner does NOT support concurrent invocations. This is documented, not solved (YAGNI for the project's single-developer / single-CI usage).

## Success Criteria

- [ ] `.test-logs/<ns>.log` exists for each of the 9 globs after `pnpm test`
- [ ] `.test-logs/` is gitignored (verify: `git check-ignore .test-logs/mcp-tools.log` exits 0)
- [ ] Log files are human-readable (no ANSI codes; raw `node --test` output)
- [ ] Re-running `pnpm test` overwrites the log files (idempotent)
- [ ] The agent can `tail -f .test-logs/mcp-tools.log` to see live progress (the Phase 4 Layer 2 hint references this)

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Log file grows unbounded over time | Low | Low | Gitignored; not in repo; user can `rm -rf .test-logs/` periodically |
| Concurrent writes to same log file (parallel globs → same ns) | None | None | Each glob has a unique `ns`; one log per glob |
| ANSI escape codes in log make it unreadable | High | Low | Strip ANSI via regex on write, OR set `FORCE_COLOR=0` in spawn env |
| `.test-logs/` accidentally checked in if `.gitignore` rule is wrong | Low | Medium | Add `git check-ignore` test; run `git status .test-logs/` after the suite to verify it's not staged |
