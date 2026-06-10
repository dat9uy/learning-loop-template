---
phase: 3
title: 'Phase 3: End-to-end verification + closeout'
status: completed
priority: P2
effort: 1h
dependencies:
  - '1'
  - '2'
---

# Phase 3: End-to-end verification + closeout

## Overview

Verify the fix in a real environment (not just in unit tests), measure churn reduction, ship the journal entry, and close the loop with the meta-state registry. This is the report's TDD step 6-7 + the "Next steps" section.

## Requirements

**Functional**:
- Run `pnpm test:cold-session` in a real droid env (or claude env) and confirm the test passes.
- Capture the before/after churn count: `meta-state.jsonl` entries with `session_id=test-cold-session-mcp-client-loading` and `status ∈ {stale, expired, resolved}` ends at ≤2 (no specific baseline claim — see plan.md Validation Log §Session 1).
- Full `pnpm test` suite shows 0 regressions; freshness test passes after `pnpm test:cold-session` is run once.
- All 5 success criteria from the report §Success criteria are met.

**Non-functional**:
- Journal entry written per the project's journaling convention.
- Optional: log this design as `entry_kind: loop-design` in `meta-state.jsonl` via `meta_state_propose_design` MCP tool (per report §Next steps item 6).
- Worktree commit hygiene: 2 commits matching the report's commit structure.

## Architecture

This phase is operational verification, not new code. The verification commands form the success criteria.

## Related Code Files

**Create**:
- `docs/journals/2026-06-10-cold-session-churn-fix-journal.md` — new journal entry (per project journaling convention)

**Modify**: none (this phase does not modify code; it verifies and documents)

**Delete**: none

## Implementation Steps

### Step 1: End-to-end run in real env
**Commands** (run from project root):

```bash
# Capture pre-state churn count
echo "=== Pre-state churn count ==="
grep "test-cold-session-mcp-client-loading" meta-state.jsonl | \
  jq -r 'select(.status == "stale" or .status == "expired" or .status == "resolved") | .id' | \
  wc -l

# Run cold-session test (real droid or claude env)
pnpm test:cold-session

# Run full suite (freshness test should pass after cold-session ran)
pnpm test

# Capture post-state churn count
echo "=== Post-state churn count ==="
grep "test-cold-session-mcp-client-loading" meta-state.jsonl | \
  jq -r 'select(.status == "stale" or .status == "expired" or .status == "resolved") | .id' | \
  wc -l
```

**Expected**: post-state count is ≤ 2 (one L1 finding + one L2 finding at most, both with `runtime: <detected-cli>` markers; no churn).

If pre-state is not 11 (e.g., the registry was cleaned up between plan creation and this run), document the actual pre-state in the journal and use it as the baseline.

### Step 2: 5-concurrent race stress test
**Command** (run the new core test 5 times in a row to flush out flakes):

```bash
for i in 1 2 3 4 5; do
  echo "=== Run $i ==="
  node --test tools/learning-loop-mcp/core/__tests__/meta-state.test.js
done
```

**Expected**: 0 flakes; the 5-concurrent race test passes on every run.

### Step 3: Commit hygiene check
**Commands**:

```bash
git log --oneline -5
git diff main..HEAD --stat
```

**Expected**:
- 2 commits (or 1 squashed commit if the team prefers — confirm with operator).
- Commit 1: helper + tests (Phase 1).
- Commit 2: freshness + cross-compat (Phase 2).
- No `chore` or `docs` prefixes (per CLAUDE.md §Git rule).
- Conventional commit format (`feat:`, `fix:`, etc.).

### Step 4: Write journal entry
**File**: `docs/journals/2026-06-10-cold-session-churn-fix-journal.md` (new)

Use the project's journal template. Cover:
- Problem (4-second ping-pong; ≤2 churn entries target — actual baseline ≈10, see plan.md Validation Log)
- Root cause (logical collision + TOCTOU race)
- Fix (atomic helper + freshness + cross-compat)
- Before/after churn counts
- Reference to the brainstorm report (`plans/reports/brainstorm-260610-1200-cold-session-test-churn-and-cross-compat-report.md`) and the plan directory.
- Open questions (none — all resolved pre-implementation per report §Status).

### Step 5: Optional — log the design via meta_state_propose_design
**Tool**: `mcp__learning-loop-mcp__meta_state_propose_design`

```js
{
  title: "atomic tryClaimSessionId + description-marker pattern for session-id-keyed findings",
  description: "Server-side atomic claim helper under enqueue lock eliminates TOCTOU race for session-id-keyed findings. Runtime/layer distinction goes in description markers, not in session_id, so the rule's exact-match contract is preserved. Reusable for any future session-id-keyed claims.",
  proposed_design_for: ["core/meta-state.js#tryClaimSessionId"],
  addresses: [
    "meta-260609T1746Z-cold-session-test-finding-churn"  // or actual finding id
  ],
  affected_system: "gate-logic",
  severity_hint: "low"
}
```

This is optional (report §Next steps item 6). Skip if the operator prefers to keep the registry clean.

### Step 6: Final pre-commit + push check
**Commands**:

```bash
# Pre-commit (must be < 1s)
time pnpm validate:records
time pnpm extract:index

# Full test
pnpm test

# Worktree cleanup (if applicable)
git worktree remove <path> --force 2>/dev/null || true
```

**Expected**:
- `pnpm validate:records` < 1s.
- `pnpm extract:index` < 5s.
- `pnpm test` 0 regressions.

## Success Criteria

- [ ] Step 1 churn count is ≤ 2 (target — no specific baseline claim, see plan.md Validation Log §Session 1)
- [ ] Step 2 5-concurrent race test passes 5/5 runs
- [ ] Step 3 2 commits, no `chore`/`docs` prefix
- [ ] Step 4 journal entry written
- [ ] Step 5 design logged (if operator approves)
- [ ] Step 6 pre-commit hook still < 1s; full test suite 0 regressions
- [ ] Rule `rule-cold-session-test-must-pass-before-resolution.pattern` is unchanged (verify with `meta_state_relationships` or by reading the rule entry in `meta-state.jsonl`)

## Risk Assessment

- **Pre-state churn count baseline is not 11 if the registry was already cleaned.** Document the actual baseline in the journal; the "≤2" target is the source of truth, not the delta.
- **`pnpm test:cold-session` may take 60-90s in real envs.** This is the report's documented cost. Plan operator time accordingly; do not run it in the pre-commit chain.
- **The freshness test fails loud on the first run after a fresh clone.** This is the intended onboarding path. The journal entry should mention it so a future operator doesn't file it as a bug.

## Security Considerations

- No security-relevant changes in this phase. The journal entry and meta_state_propose_design call do not modify code or run side-effect operations.

## Next Steps

After Phase 3 ships:
1. The fix is merged to main.
2. Subsequent PRs that touch the cold-session test will be gated by the freshness test (3-day cadence).
3. The churn count in `meta-state.jsonl` should stabilize at ≤2 entries.
4. If a future contributor wants to add a third probe layer (e.g., L3 = CLI tool-call actually invoking the MCP), the `tryClaimSessionId` helper is the entry point.

End-of-plan: this directory is the canonical reference for the fix. Future audits of the cold-session test should cite `plans/260610-1203-cold-session-churn-and-cross-compat-fix/`.
