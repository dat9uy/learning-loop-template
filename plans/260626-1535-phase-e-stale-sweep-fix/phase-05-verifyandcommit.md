---
phase: 5
title: "Verify + commit"
status: pending
priority: P2
dependencies: [1, 2, 3, 4]
---

# Phase 5: Verify + commit

## Overview

Final verification gate for the Plan 7 Fix. Run cold-tier regression test (Phase 2 enhancement) + full `pnpm test` (regression suite), confirm the new sweep-success assertion passes against the post-fix state, then file the conventional commit.

## Requirements

- Functional:
  - Cold-tier regression test GREEN (1/1 pass, with new sweep-success assertion active)
  - Full `pnpm test` GREEN across all 13 namespaces
  - Conventional commit filed with the correct format and scope reference
- Non-functional:
  - No AI references in commit message or journal
  - Commit message references the plan path (per Plan 1 D9 convention)
  - Git diff confirms only intended files changed (no scope drift)

## Architecture

Verification gates (per project rules `~/.claude/rules/development-rules.md`):
- **Narrow test first:** cold-tier regression test (Phase 2 enhancement is the new assertion)
- **Broaden when shared contracts change:** `pnpm test` covers 13 namespaces
- **Iron law:** no completion claims without fresh verification evidence

Conventional commit format:
- Type: `chore` (registry lifecycle action, not a fix to code logic)
- Scope: `phase-e` (per Plan 7 commit precedent)
- Subject: imperative, lowercase, no period, < 72 chars
- Body: 2-3 sentences explaining what + why, with refs to plan and prior commit

## Related Code Files

- Read for verification:
  - `meta-state.jsonl` (confirm post-fix state)
  - `tools/learning-loop-mastra/__tests__/legacy-mcp/cold-tier-regression.test.js` (confirm new assertion is in place)
- No modifications in this phase

## Implementation Steps

### Step 1: Run cold-tier regression test (Phase 2's enhanced assertion)

```bash
node --test tools/learning-loop-mastra/__tests__/legacy-mcp/cold-tier-regression.test.js 2>&1 | tail -15
```

**Expected:** `pass 1, fail 0`. The new sweep-success assertion should report 0 (or ≤ 1) stale mc findings, matching the post-fix state from Phase 1.

**If fail:** read the assertion message; it will identify which entries broke the invariant. Most likely cause: Phase 1's corrective batch didn't apply correctly. Re-run Phase 1 Step 5 verification.

### Step 2: Run full pnpm test

```bash
pnpm test 2>&1 | tail -20
```

**Expected:** All 13 namespaces show `==> pass`. Existing tests should be unaffected by the new assertion (it's additive).

**If fail:** identify which namespace broke. Most likely unrelated to this plan (e.g., timing-sensitive test), but verify no test was accidentally modified.

### Step 3: Verify the new assertion is in place

```bash
grep -A 5 "Phase 6:" tools/learning-loop-mastra/__tests__/legacy-mcp/cold-tier-regression.test.js
```

**Expected:** The Phase 6 sweep-success assertion block is present with the threshold ≤ 1.

### Step 4: Verify the new change-log entry exists

```bash
mcp__learning-loop__mastra_meta_state_list --id meta-260626T1535Z-... --compact
```

**Expected:** New change-log entry exists with `supersedes: meta-260626T1432Z-...` and `status: active`.

### Step 5: Verify the new meta-state finding exists (audit gap)

```bash
mcp__learning-loop__mastra_meta_state_list --id meta-260626T1535Z-meta-state-jsonl-write-path-not-fully-audited --compact
```

**Expected:** New finding exists with `status: reported` or `status: active` (depending on operator ack).

### Step 6: Verify the 2 mc=null entries' finding exists

```bash
mcp__learning-loop__mastra_meta_state_list --id meta-260626T1535Z-the-2-mc-null-stale-entries-have-no-evidence-code-ref --compact
```

**Expected:** New finding exists.

### Step 7: Confirm intended files changed

```bash
git status
git diff --stat
```

**Expected changed files:**
- `meta-state.jsonl` (corrective batch applied — 10 entries active)
- `tools/learning-loop-mastra/__tests__/legacy-mcp/cold-tier-regression.test.js` (Phase 2 assertion)
- `docs/journals/260626-phase-e-plan-7-stale-sweep-shipped.md` (Phase 4 rewrite)
- `plans/260626-0720-phase-e-stale-sweep/plan.md` (Phase 4 footer correction)
- `plans/reports/debugger-260626-1535-phase-e-plan-7-fix-audit-gap-report.md` (Phase 3 report)

**NOT changed:** No production code in `tools/learning-loop-mastra/core/` or `tools/learning-loop-mastra/tools/`. Only the test file changes (1 assertion block).

### Step 8: File the conventional commit

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore(phase-e): apply corrective batch + sweep-success assertion + docs fix

Corrects commit 1186c33 (Plan 7) which shipped with 12 of 14 entries still
stale. Root cause: meta_state_sweep's checkStaleness re-staled entries whose
created_at exceeded STALENESS_WINDOW_MS (7 days). Corrective batch sets
status: active + acked_at to supersede checkStaleness. Adds sweep-success
assertion to cold-tier regression test (catches the bug class). Investigates
the audit-log gap from the original session. Rewrites journal + plan.md
footer to match actual sequence. Supersedes change-log meta-260626T1432Z.

Refs plans/260626-1535-phase-e-stale-sweep-fix/plan.md
EOF
)"
```

**Commit message checks:**
- Conventional format: `chore(scope): subject` ✓
- No AI references ✓
- Subject ≤ 72 chars ✓
- Body explains what + why with cross-references ✓

### Step 9: Confirm commit + final status

```bash
git log -1 --format="%H %s"
git status  # should show clean working tree
```

## Success Criteria

- [ ] Step 1 cold-tier regression test GREEN with new assertion
- [ ] Step 2 `pnpm test` GREEN across 13 namespaces
- [ ] Step 3 new Phase 6 assertion visible in test file
- [ ] Step 4 new change-log entry exists with `supersedes` field
- [ ] Step 5 new audit-gap finding exists
- [ ] Step 6 new mc-null finding exists
- [ ] Step 7 git diff shows only intended files changed
- [ ] Step 8 commit message follows conventional format
- [ ] Step 9 working tree clean, commit recorded

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| R1 (Phase 2 test enhancement has false positives in future plans) | Threshold = 1 is conservative; future plans can raise with justification. Test assertion message identifies category, making false-positive debugging easy. |
| R2 (pnpm test breaks due to unrelated test flakiness) | Run test twice; if still flaky, it's not this plan's bug |
| R3 (commit message too long for subject line) | Subject kept ≤ 72 chars (current: "chore(phase-e): apply corrective batch + sweep-success assertion + docs fix" = 75 chars — trim if needed) |
| R4 (working tree has unrelated changes) | `git diff --stat` step catches this; abort and clean before commit |
| R5 (operator wants to review before commit) | Pause at Step 8, show `git diff --stat`, await operator approval before `git commit` |