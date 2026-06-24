---
phase: 1
title: "post-plan-3-verification"
status: pending
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: Post-Plan-3 Functional Verification (gating)

## Overview

**This is the gating step for Plan 4.** Per `plans/reports/brainstorm-260618-1538-phase-d-plan-split-report.md` lines 152-160 and 173, and per `docs/journals/260624-phase-d-plan-3-post-review-hardened.md` line 53 ("Post-Plan-3 verification ... still required before Plan 4 starts"), the operator must run the conditional e2e test with a real `KIMI_API_KEY` and journal the agent outputs before Plan 4 can proceed.

**Why this is Phase 1 (not a separate plan):** the verification is small (~150 LOC of test, already shipped in Plan 3; + 1 journal entry). It doesn't have multi-phase work, doesn't need its own PR, doesn't introduce new architecture. It's a gating checkpoint, not a plan. (Brainstorm line 159: "It's a gating checkpoint, not a plan.")

## Requirements

- Functional: each of the 3 `ask_*` agents produces expected output with a real LLM (not just mocked machinery).
- Non-functional: the verification artifact is queryable via `meta_state_list` and the journal is committable.

## Architecture

- **Test:** `tools/learning-loop-mastra/__tests__/debug/agent-e2e-integration.test.cjs` (already shipped by Plan 3; conditional on `KIMI_API_KEY`).
- **Journal:** `docs/journals/260623-post-plan-3-verification.md` (operator-filled).
- **Audit trail:** 1 `meta_state_log_change` with `change_target: 'docs/journals/260623-post-plan-3-verification.md'`.

## Related Code Files

- **Read (verification):** `tools/learning-loop-mastra/__tests__/debug/agent-e2e-integration.test.cjs` (the conditional e2e test)
- **Read (verification):** `tools/learning-loop-mcp/scout/run-scout.js` (verify scoutAgent can invoke the scout pipeline through real LLM)
- **Read (verification):** `meta-state.jsonl` (verify agents can read + write meta-state entries through real LLM)
- **Create:** `docs/journals/260623-post-plan-3-verification.md` (operator-filled; non-empty output for each of 3 agents)
- **Create (log change):** `meta-state.jsonl` (1 `meta_state_log_change` entry)

## Implementation Steps

### Step 1.1: Verify the e2e test exists and is conditional on KIMI_API_KEY

```bash
ls -la tools/learning-loop-mastra/__tests__/debug/agent-e2e-integration.test.cjs
# Should exist (shipped in Plan 3)
```

Read the file to confirm:
- It tests all 3 agents (`ask_intake_agent`, `ask_scout_agent`, `ask_self_improvement_agent`).
- It skips cleanly when `KIMI_API_KEY` is unset (e.g., `if (!process.env.KIMI_API_KEY) { t.skip("KIMI_API_KEY not set"); return; }`).

### Step 1.2: Set KIMI_API_KEY in the operator's shell

The operator must set `KIMI_API_KEY` to a real Kimi router key. Options:
- (Recommended) Use `direnv` with the project's `.envrc` + a local `.env` file (gitignored).
- (Fallback) Set in shell rc file (`~/.bashrc`, `~/.zshrc`).
- (One-shot) `export KIMI_API_KEY=sk-...` in the current shell.

The `.env.example` file has `KIMI_API_KEY` commented out. The loop reads `process.env.KIMI_API_KEY` directly — no `dotenv` import (per `MASTRA_AGENT_MODEL.md` § "No `dotenv` Import").

### Step 1.3: Run the e2e test

```bash
KIMI_API_KEY=<key> node --test tools/learning-loop-mastra/__tests__/debug/agent-e2e-integration.test.cjs
```

Expected: 3 tests pass (one per agent). If a test fails, the agent is not following the learning loop correctly — escalate before proceeding to Plan 4.

Alternative: run via `pnpm test:debug` (the `package.json#scripts.test:debug` entry, which runs all `tools/learning-loop-mastra/__tests__/debug/*.test.cjs`). Plan 3's `__tests__/debug/` directory may contain the e2e test or a wrapper.

### Step 1.4: Capture agent output for the journal

For each of the 3 agents, capture:
- The full prompt sent to the LLM (input args).
- The full response text returned by the LLM.
- The elapsed time (wall-clock seconds).
- A 2-3 sentence operator commentary on whether the response is on-loop (mentions meta-state concepts, bound surface, etc.) or off-loop (references product-surface, etc.).

### Step 1.5: Write the journal entry

Create `docs/journals/260623-post-plan-3-verification.md` with this structure:

```markdown
# Phase D Plan 3 — Post-Plan-3 Functional Verification — Complete

**Date:** 2026-06-24
**Plan:** `plans/260624-1111-phase-d-plan-4-cutover/`
**Test:** `tools/learning-loop-mastra/__tests__/debug/agent-e2e-integration.test.cjs`
**LLM:** Kimi router (provider `kimi-for-coding/k2p6` per agents-manifest.json)

## Summary

All 3 `ask_*` agents produce expected output with a real LLM. Plan 4 is unblocked.

## Per-agent results

### ask_intake_agent

- Input: { ... }
- Output: { ... }
- Wall-clock: X.XX s
- Operator commentary: The agent correctly oriented into the meta-state and produced a verification plan. No product-surface references.

### ask_scout_agent

- Input: { ... }
- Output: { ... }
- Wall-clock: X.XX s
- Operator commentary: The agent invoked the scout pipeline and surfaced a structured readiness report. ...

### ask_self_improvement_agent

- Input: { ... }
- Output: { ... }
- Wall-clock: X.XX s
- Operator commentary: The agent classified the gap and proposed a meta_state_propose_design entry. ...

## Test exit code

`pnpm test:debug` exit code: 0 (all 3 e2e tests pass).

## Acceptance

Per brainstorm lines 158-160: "Acceptance criteria for Post Plan 3 to be 'complete': Journal entry exists with non-empty output for each of the 3 agents AND conditional e2e test either passes (when run with `KIMI_API_KEY`) or is properly skipped (when run without)."
```

If `KIMI_API_KEY` is NOT available, the test SKIPS. The journal should still be filed, with the skip explicitly documented:

```markdown
## Test exit code

`pnpm test:debug` exit code: 0 (test SKIPPED — `KIMI_API_KEY` not set in operator shell).

## Operator decision

Per brainstorm line 159 ("It's a gating checkpoint, not a plan"), Plan 4 may proceed with the test in skip state. The Plan 3 mocked-LLM tests + `agent-prompt-content.test.cjs` content-aware assertions are sufficient coverage for the cutover. Real-LLM verification is recommended but not blocking.
```

### Step 1.6: File the `meta_state_log_change`

Call the `mastra_meta_state_log_change` MCP tool with:

```json
{
  "change_dimension": "semantic",
  "change_target": "docs/journals/260623-post-plan-3-verification.md",
  "change_diff": {
    "added": ["docs/journals/260623-post-plan-3-verification.md (operator-filled journal)"]
  },
  "reason": "Post-Plan-3 functional verification complete. The conditional e2e test (agent-e2e-integration.test.cjs) ran with [KIMI_API_KEY set / skipped]. The 3 ask_* agents produce expected output with a real LLM. Plan 4 is unblocked."
}
```

## Success Criteria

- [ ] `docs/journals/260623-post-plan-3-verification.md` exists with non-empty output (or skip-justification) for each of the 3 agents.
- [ ] `tools/learning-loop-mastra/__tests__/debug/agent-e2e-integration.test.cjs` passes (with `KIMI_API_KEY`) OR is properly skipped (without).
- [ ] 1 `meta_state_log_change` entry filed with `change_target: 'docs/journals/260623-post-plan-3-verification.md'`.
- [ ] Operator has confirmed Plan 4 can proceed (no follow-up needed).

## Risk Assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| Operator has no `KIMI_API_KEY` | Medium | Test skips cleanly. Plan 4 can proceed with skip-justified journal per the alternative acceptance path above. |
| One of the 3 agents does not produce expected output with a real LLM (LLM interprets instructions differently than the test fixture) | Medium | This is the "post-Plan-3 verification" gate exactly to catch this. If a test fails, escalate; do NOT proceed to Plan 4. Open a `meta_state_report` finding with `category: mcp-tool-missing` or `category: loop-anti-pattern` and address in a Plan 3a before retrying. |
| LLM call takes >2 minutes (default `node:test` timeout) | Low | The e2e test should set a per-test timeout of 120s. Verify the test file. |
| The 3 agents' instructions reference `tools/learning-loop-mcp/scout/run-scout.js` (locked instruction markers) — if the file path changes, the agents' instructions break | Low | The agent instructions are LOCKED markers per Plan 3's hardening review (C3). Plan 4 phase-07 explicitly updates the fixture + agents simultaneously in one commit. Phase 1's verification runs against the pre-Plan-4-Phase-7 state. |
| The operator runs the test against a stale checkout (e.g., before pulling main) | Low | Confirm `git status` is clean + `git log -1` shows the current main HEAD before running. |
