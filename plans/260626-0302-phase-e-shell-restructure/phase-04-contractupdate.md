---
phase: 4
title: "ContractUpdate"
status: pending
priority: P2
dependencies: [3]
---

# Phase 4: ContractUpdate

## Overview

Verify the interface contract (`tools/learning-loop-mastra/interface/contract.js`) is consistent with the post-move state, then exercise the contract against the 3 known runtimes via the CLI smoke test. Phase 3 already updated the `endsWith(...)` literal at `contract.js:94` via the bulk sed; this phase is a verification + smoke-test step.

## Requirements

- Functional: `node tools/learning-loop-mastra/interface/contract.js <runtimeId>` returns the correct shape for all 3 runtimes
- Non-functional: the contract's `mcp-client-config` check (Requirement #2) gates on the new path; `claude-code` and `droid` pass; `mastra-code` returns the expected 4-missing shape
- TDD gate: Phase 1's `meta-state-fingerprints-repointed.test.js` still RED (deferred to Phase 5); Phase 2/3 regression guards GREEN

## Architecture

The contract validator (`tools/learning-loop-mastra/interface/contract.js`) exports `validate(runtimeId, rootPath?)` and `validateAll(ids, rootPath?)`. It runs 5 checks per runtime:
1. `hook-shim-set` — 4 shim files exist in `<surface>/coordination/hooks/`
2. `mcp-client-config` — `.mcp.json` / `.factory/mcp.json` / `.mastracode/config.json` has `mcpServers.learning-loop.args` ending in the canonical shell entry path
3. `skill-spec` — `<surface>/skills/learning-loop/SKILL.md` exists with `loop_describe` + `meta_state_list` references
4. `identity-marker` — `process.env.RUNTIME_ID` matches (advisory; never in `missing[]`)
5. `settings-integration` — `<surface>/settings.json` references all 4 hook shims

Requirement #2 is the load-bearing check for Plan 6. Post-Phase-3, the literal is updated; this phase verifies the smoke test passes.

## Related Code Files

- Verify: `tools/learning-loop-mastra/interface/contract.js` (already updated in Phase 3)
- Verify: `tools/learning-loop-mastra/__tests__/interface/runtimes-pass-contract.test.js` (Plan 2 regression guard)
- Verify: `tools/learning-loop-mastra/__tests__/interface/contract-js-exports-validate.test.js` (Plan 2 regression guard)

## Implementation Steps

### Step 1: Verify the contract literal is updated

```bash
grep -n 'endsWith("tools/learning-loop-mastra' tools/learning-loop-mastra/interface/contract.js
```

**Expected output:** `entry.args.some((a) => typeof a === "string" && a.endsWith("tools/learning-loop-mastra/mastra/server.js"));`

If the output shows the old path (`tools/learning-loop-mastra/server.js`), the Phase 3 sed missed the file. Manually edit `interface/contract.js:94`.

### Step 2: Smoke test the contract against the 3 known runtimes

```bash
cd /home/datguy/codingProjects/learning-loop-template

# claude-code — expect {ok: true, missing: [], notes: ["identity-marker-not-adopted"]}
node tools/learning-loop-mastra/interface/contract.js claude-code
echo "Exit: $?"  # Expected: 0

# droid — expect {ok: true, missing: [], notes: ["identity-marker-not-adopted"]}
node tools/learning-loop-mastra/interface/contract.js droid
echo "Exit: $?"  # Expected: 0

# mastra-code — expect {ok: false, missing: [4], notes: ["identity-marker-not-adopted"]}
node tools/learning-loop-mastra/interface/contract.js mastra-code
echo "Exit: $?"  # Expected: 1

# --list — expect JSON output with 3 runtimes + 5 requirements
node tools/learning-loop-mastra/interface/contract.js --list
echo "Exit: $?"  # Expected: 0
```

### Step 3: Run Plan 2's regression guards

```bash
node --test tools/learning-loop-mastra/__tests__/interface/*.test.js
```

**Expected:** all 5 tests GREEN (Plan 2's regression guards verify the contract shape).

### Step 4: Run Plan 2's contract test suite

```bash
node --test tools/learning-loop-mastra/interface/__tests__/contract.test.js
```

**Expected:** all 24 tests GREEN (the contract's 24-test suite).

### Step 5: Spot-check the contract test fixture

```bash
grep -n "tools/learning-loop-mastra" tools/learning-loop-mastra/interface/__tests__/contract.test.js
```

**Expected:** the fixture at line 42 references `tools/learning-loop-mastra/mastra/server.js` (post-move).

If the sed missed this fixture, manually edit `contract.test.js:42`.

### Step 6: Document the post-move contract shape

Save the CLI output for Phase 5's `meta_state_log_change`:

```bash
mkdir -p plans/260626-0302-phase-e-shell-restructure/reports

# Capture the 3 smoke-test outputs
node tools/learning-loop-mastra/interface/contract.js claude-code > plans/260626-0302-phase-e-shell-restructure/reports/contract-claude-code.json
node tools/learning-loop-mastra/interface/contract.js droid > plans/260626-0302-phase-e-shell-restructure/reports/contract-droid.json
node tools/learning-loop-mastra/interface/contract.js mastra-code > plans/260626-0302-phase-e-shell-restructure/reports/contract-mastra-code.json
```

These JSON snapshots are evidence for the `meta_state_log_change` in Phase 5.

### Step 7: Sanity-check that the post-move shape matches pre-Plan-6

Compare the smoke-test outputs to the pre-Plan-6 verification (from Plan 2's PR #17 verification, scope report line 275–279):

| Runtime | Pre-Plan-6 | Post-Plan-6 (this phase) |
|---------|-----------|--------------------------|
| claude-code | `{ok: true, missing: [], notes: ["identity-marker-not-adopted"]}` | Same shape (exit 0) |
| droid | `{ok: true, missing: [], notes: ["identity-marker-not-adopted"]}` | Same shape (exit 0) |
| mastra-code | `{ok: false, missing: [4], notes: ["identity-marker-not-adopted"]}` | Same shape (exit 1) |

If the shapes differ, the contract broke during the move. STOP and investigate.

## Success Criteria

- [ ] `contract.js:94` literal updated (verified via Step 1 grep)
- [ ] All 3 runtime smoke tests pass with correct exit codes (0, 0, 1)
- [ ] All 5 Plan 2 regression guards pass
- [ ] All 24 Plan 2 contract tests pass
- [ ] Contract test fixture at `contract.test.js:42` updated
- [ ] 3 smoke-test JSON snapshots saved to `reports/contract-*.json`
- [ ] Smoke-test output shapes match pre-Plan-6 verification

## Risk Assessment

- **R-Phase4-A:** The sed in Phase 3 missed the `interface/contract.js` literal because of quote variations or escape characters. Mitigation: Step 1 grep verification; manual edit if needed.
- **R-Phase4-B:** The contract test fixture at `interface/__tests__/contract.test.js:42` was missed by sed. Mitigation: Step 5 grep verification; manual edit if needed.
- **R-Phase4-C:** The contract returns the wrong shape because of a subtle code path change (e.g., the `RUNTIMES` const needs updating too). Mitigation: Step 7 sanity-check against pre-Plan-6 shapes; investigate on mismatch.
- **R-Phase4-D:** The 3 runtime smoke tests reveal an actual issue with the post-move state (e.g., a hidden file dependency that breaks the contract). Mitigation: STOP and investigate before Phase 5; the contract is the source of truth.

---

## Phase Checklist (for `ck plan check 4`)

```bash
# Phase 4 done when:
grep -c "tools/learning-loop-mastra/mastra/server" tools/learning-loop-mastra/interface/contract.js  # ≥1
node tools/learning-loop-mastra/interface/contract.js claude-code | jq .ok  # true
node tools/learning-loop-mastra/interface/contract.js droid | jq .ok  # true
node tools/learning-loop-mastra/interface/contract.js mastra-code | jq .ok  # false
node --test tools/learning-loop-mastra/__tests__/interface/*.test.js 2>&1 | tail -10  # GREEN
node --test tools/learning-loop-mastra/interface/__tests__/contract.test.js 2>&1 | tail -10  # GREEN
ls plans/260626-0302-phase-e-shell-restructure/reports/contract-{claude-code,droid,mastra-code}.json

cd /home/datguy/codingProjects/learning-loop-template/plans/260626-0302-phase-e-shell-restructure && ck plan check 4
```