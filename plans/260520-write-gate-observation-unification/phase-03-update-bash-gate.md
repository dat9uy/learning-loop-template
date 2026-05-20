---
phase: 3
title: "Update Bash Gate"
status: completed
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 3: Update Bash Gate

## Overview

Teach `bash-coordination-gate.cjs` to detect file writes to `records/**` via Bash redirects (`>`, `>>`, heredoc `<<`, `tee`) and check `write-path` observations before allowing. This closes the heredoc bypass where agents create blocked files with `cat <<'EOF' > records/evidence/foo.md` after the write gate blocks them.

## Requirements

- Functional: Detect writes to `records/**` in Bash commands.
- Functional: If write detected, require matching `write-path` observation.
- Functional: If observation found, check staleness via `checkObservationStaleness()`.
- Functional: Fresh observation → allow (exit 0).
- Functional: Stale observation → escalate with `inbound_gate: true`.
- Functional: No observation → block with `observation_required: true`.
- Functional: Non-records commands unaffected (existing constraint pattern logic runs first or in parallel).
- Non-functional: Execution time remains under 100ms.

## Architecture

### Detection Patterns

Detect file writes to `records/**` via these Bash patterns:

```javascript
const PATH_WRITE_PATTERNS = [
  />{1,2}\s*records\/[^\s;&|]+/,           // redirect to records/
  /<<['"]?\w+['"]?\s*>\s*records\//,      // heredoc to records/
  /\btee\b.*records\/[^\s;&|]+/,           // tee to records/
];
```

Extract the target path from the command. Strip quotes and normalize `./` prefixes. Use the same `toRelative` logic as the write gate.

### Flow

```
Input: Bash tool call with command
  |
  +--> Match constraint pattern (docker, sudo, etc.) --------+
  |                                                         |
  +--> Extract path writes to records/** -------------------+
  |                                                         |
  v                                                         v
Constraint matched?                      Path write found?
  |                                      |
  +--YES--> existing logic               +--YES--> is records/observations/** ?
  |  (budget, observation, staleness)     |            |
  |  --> store result                     |            +--YES--> block unconditionally
  +--NO--> constraintResult = null        |            |
                                          |            +--NO--> is records/evidence/** ?
                                          |                      |
                                          |                      +--NO--> allow (other records/**)
                                          |                      |
                                          |                      +--YES--> read observations
                                          |                                Find matching write-path obs
                                          |                                  |
                                          |                                  +--NO--> block (observation_required)
                                          |                                  |
                                          |                                  +--YES--> check staleness
                                          |                                            |
                                          |                                            +--FRESH--> allow
                                          |                                            |
                                          |                                            +--STALE--> escalate
                                          +--NO--> pathResult = null

  |
  v
Evaluate both results:
  - side-effect-import blocks unconditionally
  - If either blocks → exit 2 (constraint reason takes priority if both fail)
  - If both pass (or neither applies) → exit 0
```

### Ordering

Path-write detection runs independently of constraint pattern matching. Both checks execute on every Bash command. This means a `docker run` command that also writes to `records/evidence/foo.md` is evaluated for BOTH risks. If either check blocks, the command is blocked (constraint reason takes priority when both fail). This is safer than the sequential fallback because high-risk constrained commands can also accidentally modify records.

### Code Changes

In `bash-coordination-gate.cjs`:

1. Add `extractRecordsPath(command)` function that returns the first `records/**` path found in the command, or `null`.
2. Restructure `main()` to run both checks independently:
   - Run `matchConstraintPattern(command)` and store the result.
   - Run `extractRecordsPath(command)` and store the result.
   - Initialize `exitCode = 0`, `output = null`.
3. If `constraintMatch` is not null:
   - Run existing logic (side-effect-import block, budget check, observation check, staleness check).
   - If any step blocks/escalates, set `exitCode = 2` and `output = result`.
4. If `extractRecordsPath` returns a path:
   - If path matches `records/observations/**` → set `exitCode = 2`, `output = { decision: 'block', reason: 'records/observations/** is blocked unconditionally' }`.
   - Else if path matches `records/evidence/**` → read observations and find matching `write-path` observation with `pathMatchesObservation()`.
     - If no match → set `exitCode = 2`, `output = { decision: 'block', observation_required: true, constraint_type: 'write-path' }`.
     - If match → check staleness with `checkObservationStaleness([obs], coordDir)`.
       - Stale → set `exitCode = 2`, `output = { decision: 'escalate', inbound_gate: true }`.
       - Fresh → leave exitCode at 0 (or keep current value if constraint check already set it to 2).
   - Else (other `records/**` paths like `records/claims/**`) → allow without observation.
5. After both checks, if `exitCode === 2`, output the result. If constraint and path both produced results, constraint result takes priority.
6. If `exitCode === 0`, exit 0.

## Related Code Files

- Modify: `.claude/coordination/hooks/bash-coordination-gate.cjs`
- Read for context: `.claude/coordination/hooks/lib/gate-utils.cjs`

## Implementation Steps

1. Read current `bash-coordination-gate.cjs`.
2. Add `extractRecordsPath` helper after `findProjectRoot`:
   - Use `PATH_WRITE_PATTERNS` regexes to match `> records/...`, `>> records/...`, heredoc redirect, `tee records/...`.
   - Strip quotes (`"` and `'`) from extracted path.
   - Strip `./` prefix if present.
   - Return relative path or `null`.
3. Add `import { pathMatchesObservation }` from `gate-utils.cjs`.
4. Restructure `main()` flow:
   - Move the existing constraint check logic into a helper or restructure inline so it populates a `constraintResult` object without calling `process.exit`.
   - After constraint logic, run `extractRecordsPath(command)`.
   - If path found:
     - If path matches `records/observations/**` → set `pathResult = { decision: 'block', hard_block: true }`.
     - Else if path matches `records/evidence/**` → read observations and run `pathMatchesObservation(path, observations)`.
       - If no match → `pathResult = { decision: 'block', observation_required: true, constraint_type: 'write-path' }`.
       - If match → `checkObservationStaleness([obs], coordDir)`.
         - Stale → `pathResult = { decision: 'escalate', inbound_gate: true }`.
         - Fresh → `pathResult = null`.
     - Else (other `records/**`) → `pathResult = null`.
   - If no path found, `pathResult = null`.
5. Combine results:
   - If `constraintResult` has a hard block (`side-effect-import` or `records/observations/**`) → output it and exit 2.
   - Else if `constraintResult` blocks/escalates → output it and exit 2.
   - Else if `pathResult` blocks/escalates → output it and exit 2.
   - Else → exit 0.
6. Run existing bash gate tests for regressions.

## Success Criteria

- [ ] Bash `cat <<'EOF' > records/evidence/foo.md` with no observation → blocked (exit 2, observation_required: true).
- [ ] Bash `cat <<'EOF' > records/evidence/foo.md` with fresh `write-path` observation → allowed (exit 0).
- [ ] Bash `cat <<'EOF' > records/evidence/foo.md` with stale observation → escalated (exit 2, inbound_gate: true).
- [ ] Bash `cat <<'EOF' > records/observations/foo.yaml` with fresh observation → blocked unconditionally (exit 2).
- [ ] Bash `echo x | tee records/evidence/foo.md` with fresh observation → allowed.
- [ ] Bash `ls -la` → allowed (exit 0) (unaffected).
- [ ] Bash `docker run ubuntu` → escalated (exit 2) (existing constraint logic unaffected).
- [ ] Bash `cat <<'EOF' > docs/foo.md` → allowed (exit 0) (non-records unaffected).
- [ ] Bash `cat <<'EOF' > records/claims/foo.yaml` → allowed (exit 0) (other records/** paths unaffected).
- [ ] Execution time under 100ms.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Path extraction regex misses valid write patterns | Medium | Medium | Cover `>`, `>>`, heredoc, `tee`. Strip quotes and `./`. Accept that exotic patterns (e.g. `exec 3> records/foo`, env-var paths) may miss; operator can record observation proactively. |
| Path extraction regex false-positive on `tee` in string args | Low | Low | Use `\btee\b` word boundary. Segment command on `[;&|]+` before matching. |
| Constrained commands that write to records still evaluated for both risks | Low | Medium | Both checks run independently. A `docker run` command with a redirect to `records/**` is checked for BOTH constraint and path-write violations. Safer than sequential fallback. |
| Double-checking (constraint + path) adds latency | Low | Low | Path check runs on every Bash command. Observations are small YAML files in a single directory. Benchmark: < 5ms for typical observation count (< 20 files). |

## Next Steps

- Phase 4: Update Tests (adds bash gate path-write tests).
