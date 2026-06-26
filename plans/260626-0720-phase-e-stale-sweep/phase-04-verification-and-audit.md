---
phase: 4
title: "Verification & Audit — test, log change, journal"
status: pending
priority: P3
dependencies: [3]
---

# Phase 4: Verification & Audit

## Overview

Verify the batch transition from Phase 3 succeeded by running the cold-tier regression test and the full `pnpm test` suite. File a `meta_state_log_change` entry referencing this plan (audit-trail invariant per Plan 1 + Plan 3 D9). Write the journal entry documenting the sweep. Finalize the git commit.

**Risk:** Low — verification + audit only; no mutations.

## Requirements

- Functional:
  - Cold-tier regression test passes (`node --test tools/learning-loop-mastra/__tests__/legacy-mcp/cold-tier-regression.test.js` GREEN)
  - Full `pnpm test` GREEN across all 13 namespaces
  - `meta_state_log_change` entry filed with `change_target: plans/260626-0720-phase-e-stale-sweep/plan.md`
  - Journal entry: `docs/journals/260626-phase-e-plan-7-stale-sweep-shipped.md`
- Non-functional:
  - The journal entry captures the open items (O1, O2, O3 from `plan.md`) for follow-up
  - The git commit uses conventional commit format without AI references
  - No secrets, tokens, or credentials committed
- TDD gate: cold-tier test + `pnpm test` both GREEN

## Architecture

The cold-tier regression test (`tools/learning-loop-mastra/__tests__/legacy-mcp/cold-tier-regression.test.js:67`) iterates `mechanism_check=true` findings and asserts grounding. After Phase 3's batch transition:

- All 14 swept entries are `status: active` + grounded (Phase 2 refreshed the 1 drifted fingerprint; Phase 3 transitioned status)
- The 2 remaining stale entries are `mechanism_check: false`, so the cold-tier test skips them (the test only iterates `mechanism_check === true`)
- The cold-tier test should pass without modification

The `meta_state_log_change` MCP tool files a `change-log` entry in the meta-state registry. Per Plan 3 D9, one entry per plan; per Plan 1 D9 convention, `change_target` references the plan path.

The journal entry follows the project's journal convention (see `docs/journals/260624-phase-d-plan-4-cutover-shipped.md` for an example).

## Related Code Files

- Create: `docs/journals/260626-phase-e-plan-7-stale-sweep-shipped.md`
- Modify: `meta-state.jsonl` (via `meta_state_log_change` tool — appends 1 entry)
- No code modifications

## File Inventory (deep mode)

| File | Operation | Lines affected | Notes |
|------|-----------|----------------|-------|
| `docs/journals/260626-phase-e-plan-7-stale-sweep-shipped.md` | Create | ~30 lines | Journal entry |
| `meta-state.jsonl` | Modify (via MCP tool) | +1 entry (change-log) | Audit trail |

## Test Scenario Matrix (deep mode)

| # | Scenario | Expected | Verification |
|---|----------|----------|--------------|
| 1 | `node --test tools/learning-loop-mastra/__tests__/legacy-mcp/cold-tier-regression.test.js` returns all assertions pass | After phase 3 | Cold-tier grounding invariant |
| 2 | `pnpm test` returns all 13 namespaces GREEN | After phase 3 | Full regression |
| 3 | `meta_state_log_change` invocation returns `logged: true, id: meta-YYMMDDTHHmmZ-...` | After invocation | Audit entry filed |
| 4 | `meta_state_list --change_dimension surface --compact` includes the new entry | After invocation | Audit entry visible |
| 5 | `ls docs/journals/260626-phase-e-plan-7-stale-sweep-shipped.md` returns the file | After journal write | Journal artifact |
| 6 | `git status` shows only `docs/journals/260626-phase-e-plan-7-stale-sweep-shipped.md` as new (plus `meta-state.jsonl` modification) | After commit prep | Scope confirmation |
| 7 | `git log -1 --format="%s"` shows the conventional commit message (no AI references) | After commit | Commit hygiene |

## Function/Interface Checklist (deep mode)

- [ ] Cold-tier regression test runs and passes
- [ ] `pnpm test` runs all 13 namespaces and passes
- [ ] `meta_state_log_change` filed with correct `change_target` + `change_dimension` + `change_diff`
- [ ] Journal entry created with: date, plan reference, scope (14 entries swept), open items (O1/O2/O3), verification results
- [ ] Git commit message follows conventional format (e.g., `chore(phase-e): sweep 14 stale mechanism_check=true entries to active`)
- [ ] No AI references in commit message or journal entry

## Dependency Map (deep mode)

**Depends on:**
- Phase 3 of this plan (DONE) — 14 entries transitioned to active + grounded

**Does not depend on:**
- Any other plan

**Does not block:**
- Anything — plan completion

## Implementation Steps

### Step 1: Run cold-tier regression test

```bash
cd /home/datguy/codingProjects/learning-loop-template
node --test tools/learning-loop-mastra/__tests__/legacy-mcp/cold-tier-regression.test.js 2>&1 | tail -30
```

**Expected output:** all assertions pass. The grounding invariant assertion (line 67-100) iterates `mechanism_check=true` findings; after Phase 3, all 14 are grounded (13 with original fingerprints, 1 with refreshed fingerprint).

**If test fails:** inspect the failure. Most likely cause: a fingerprint drifted between Phase 1 and Phase 3 (concurrent code edit). Repeat Phase 1 + Phase 2 + Phase 3 for the newly drifted entry.

### Step 2: Run full `pnpm test`

```bash
pnpm test 2>&1 | tail -30
```

**Expected output:** all 13 namespaces GREEN. If any namespace fails, surface to operator (likely unrelated to this plan — fix or defer).

### Step 3: File `meta_state_log_change`

```bash
mcp__learning-loop__mastra_meta_state_log_change \
  --change_dimension "surface" \
  --change_target "plans/260626-0720-phase-e-stale-sweep/plan.md" \
  --change_diff '{"changed":["meta-state.jsonl#14-entries-status"]}' \
  --reason "Sweep 14 stale mechanism_check=true entries to active via meta_state_batch. Verified fingerprints (13 match, 1 refreshed for meta-260609T1206Z). Closes Plan 3 red-team Unresolved Q5."
```

**Expected response:**
```json
{
  "logged": true,
  "id": "meta-YYMMDDTHHmmZ-plans-260626-0720-phase-e-stale-sweep-plan-md",
  "cache_hit": false
}
```

**If `logged: true` but no file append:** this is the `mcp-tool-silent-persistence-fail` bug (per entry `meta-260619T2233Z-...`). Re-run and immediately `grep` the registry:

```bash
grep -c "meta-YYMMDDTHHmmZ-plans-260626-0720-phase-e-stale-sweep-plan-md" meta-state.jsonl
# Expected: 1 (or higher after retries)
```

If still 0 after retry, file the change-log via direct JSONL edit (escape hatch, document in journal).

### Step 4: Verify the change-log entry

```bash
mcp__learning-loop__mastra_meta_state_list \
  --change_dimension surface \
  --compact true
```

**Expected:** includes the new entry referencing `plans/260626-0720-phase-e-stale-sweep/plan.md`.

### Step 5: Write journal entry

Create `docs/journals/260626-phase-e-plan-7-stale-sweep-shipped.md` with the following structure:

```markdown
# Phase E Plan 7: Stale Sweep — Shipped 2026-06-26

## Scope
- Swept 14 stale `mechanism_check=true` entries to `status: active`
- Refreshed 1 drifted fingerprint (`meta-260609T1206Z-handoff-md-...`)
- Single atomic `meta_state_batch` invocation (14 ops)
- Cold-tier regression test + `pnpm test` GREEN

## Open items
- **O1:** Registry consistency: `meta-260606T1830Z-context-pollution-...` has `resolved_by: auto-resolve` + `resolved_at` set but was `status: stale`. Now `status: active` — the inconsistency is preserved. Future plan: `meta_state_consistency_check` MCP probe (per finding `meta-260614T1236Z-no-automated-registry-consistency-check-exists-...`).
- **O2:** Same as O1 for `meta-260613T1615Z-import-chain-...` (has `promoted_to_rule` set, status was stale).
- **O3:** Entry `meta-260618T0558Z-post-migration-...` was Plan 3 phase 5's target but remained stale (version 14, last_verified_at 2026-06-26T00:58:00Z). Plan 7 re-processed it.

## Verification
- Cold-tier regression test: GREEN
- `pnpm test`: GREEN across 13 namespaces
- `meta_state_list --status stale`: 2 entries remain (both `mechanism_check: false`)

## Audit
- Change-log entry: `<id from Step 3>` with `change_target: plans/260626-0720-phase-e-stale-sweep/plan.md`
- Commit: see git log
```

### Step 6: Git commit

```bash
cd /home/datguy/codingProjects/learning-loop-template
git add docs/journals/260626-phase-e-plan-7-stale-sweep-shipped.md meta-state.jsonl
git status
# Expected: 2 files staged (journal + meta-state.jsonl); no other files
git commit -m "chore(phase-e): sweep 14 stale mechanism_check=true entries to active

Sweep all 14 meta-state entries where status=stale AND mechanism_check=true.
Transition stale → active via single atomic meta_state_batch (14 ops).
Refresh 1 drifted fingerprint for meta-260609T1206Z-handoff-md-...

Closes Plan 3 red-team Unresolved Q5.
Refs plans/260626-0720-phase-e-stale-sweep/plan.md"
```

**Commit hygiene checks:**
- [ ] Conventional commit format (`chore(...)`)
- [ ] No AI references in message
- [ ] No secrets, tokens, or credentials

### Step 7: Verify final state

```bash
git log -1 --format="%H %s"
# Expected: <commit-hash> chore(phase-e): sweep 14 stale mechanism_check=true entries to active

git status
# Expected: clean working tree

mcp__learning-loop__mastra_meta_state_list --status stale --compact true
# Expected: 2 entries (mechanism_check=false leftovers)
```

## Success Criteria

- [ ] Step 1 cold-tier regression test GREEN
- [ ] Step 2 `pnpm test` GREEN across 13 namespaces
- [ ] Step 3 `meta_state_log_change` filed; registry contains the new change-log entry
- [ ] Step 4 `meta_state_list --change_dimension surface` includes the new entry
- [ ] Step 5 journal entry created at `docs/journals/260626-phase-e-plan-7-stale-sweep-shipped.md`
- [ ] Step 6 git commit with conventional format + no AI references
- [ ] Step 7 final state verified: clean working tree, commit message correct, registry shows 2 stale entries

## Risk Assessment

- **R-Phase4-A:** Cold-tier test fails due to a fingerprint that drifted between Phase 3 and Phase 4. **Mitigation:** Re-run Phase 1 (re-verify all 14 fingerprints), Phase 2 (refresh any new drifts), Phase 3 (re-apply batch). If a code edit happened during this plan's execution, the editor's commit should land AFTER this plan's commit.
- **R-Phase4-B:** `pnpm test` fails due to an unrelated test regression. **Mitigation:** Inspect the failing test; if unrelated to this plan (e.g., a pre-existing flake), document in journal and defer fix. If related (e.g., a test depends on a specific entry's status), inspect and adjust.
- **R-Phase4-C:** `meta_state_log_change` returns `logged: true` but doesn't persist (per `meta-260619T2233Z-...` finding). **Mitigation:** Step 3's grep verification catches this; retry or use the direct JSONL edit escape hatch documented in journal.
- **R-Phase4-D:** Journal entry creation fails (filesystem permission). **Mitigation:** Verify `docs/journals/` is writable; fix permissions; re-create the file.
- **R-Phase4-E:** Git commit fails (pre-commit hook rejects). **Mitigation:** Inspect the hook's rejection reason; fix the underlying issue (likely a secret scan false positive or a format violation); re-commit.
- **R-Phase4-F:** A code edit happens during Phase 4 that invalidates a fingerprint. **Mitigation:** Defer the code edit until Plan 7 lands; or re-run Phase 1-3 after the code edit (plan becomes a no-op or a refresh).

## Revision notes

This phase was added during plan expansion (2026-06-26) to capture the verification + audit trail. The stub plan referenced filing `meta_state_log_change` at plan completion but didn't detail the verification gates. This phase makes those gates explicit.