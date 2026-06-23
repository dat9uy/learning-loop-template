---
phase: 6
title: "Acceptance gate + closeout"
status: pending
priority: P1
effort: "~30min"
dependencies: [5]
---

# Phase 6: Acceptance gate + closeout

## Overview

Run the full `pnpm test` (all 12 namespaces), confirm the closeout acceptance gate, file the per-plan `meta_state_log_change` for D4 + D7 closure, draft the journal entry, update the master tracker (D4 + D7 flip `[x]`), and prepare the PR body with the count matrix. Mirrors Plan 1 + Plan 2 closeout patterns.

## Requirements

- **Functional:**
  - `pnpm test` exits 0 with the expected pass/fail/skip count.
  - Cold-session test passes against the legacy 31-entry manifest (scope unchanged; Plan 4 owns the 44-tool enumeration update).
  - `agent-manifest.json` (mastra) has 6 groups; the `agent` group has 3 entries.
  - `tools/learning-loop-mcp/agent-manifest.json` (legacy) workflow group has 7 entries (3 existing + 4 D-11).
  - `tools/list` enumeration returns 44 tools (31 `mastra_*` + 10 `run_workflow_*` + 3 `ask_*`); `workflow-parity.test.cjs:159` asserts 44.
  - Master tracker D4 + D7 flipped to `[x]`.
  - `meta_state_log_change` filed (semantic, D4+D7 closure).
  - Journal entry: `docs/journals/260623-phase-d-plan-3-shipped.md`.
  - PR body drafted (count matrix, scope summary, deferred items).
- **Non-functional:**
  - No new vendor deps.
  - No `dotenv` import.
  - All 3 agents have `memory === undefined` (asserted by Phase 3 tests).
  - `MASTRA_AGENT_MODEL` + `KIMI_API_KEY` env vars are operator-facing only (no test exposure).

## Architecture

Phase 6 is verify + closeout. No code changes. The phase:

1. Runs `pnpm test` to verify the gate.
2. Files the `meta_state_log_change` (one entry, with `change_target: plans/reports/productization-260612-1530-master-tracker.md`).
3. Updates the master tracker (D4 + D7 flip).
4. Drafts the journal entry (mirrors Plan 1b's journal at `docs/journals/260622-phase-d-plan-1b-shipped.md`).
5. Drafts the PR body (mirrors Plan 1b's PR body at `plans/260622-2119-phase-d-plan-1b-review-fixups/pr-body.md`).

**Count matrix for the PR body:**

| Source | Pre-Plan 3 | Post-Plan 3 |
|---|---|---|
| `tools/learning-loop-mastra/tools/manifest.json` | 31 | 31 (unchanged) |
| `tools/learning-loop-mastra/workflows-manifest.json` | 10 | 10 (unchanged) |
| `tools/learning-loop-mastra/agents-manifest.json` (new) | 0 | **3** (NEW) |
| `mastra_*` tools registered at runtime | 31 | 31 (unchanged) |
| `run_workflow_*` tools registered at runtime | 10 | 10 (unchanged) |
| `ask_*` tools registered at runtime | 0 | **3** (NEW) |
| **Total tools registered** | **41** | **44** (+3) |
| `agent-manifest.json` (mastra) groups | 5 | **6** (adds `agent` group) |
| `agent-manifest.json` (legacy) workflow group | 3 | **7** (D-11: +4) |
| Test namespaces | 11 | **12** (adds `agent-parity`) |
| Tests pass (Plan 1b baseline) | 1140 | **~1154** (+7-9 from agent-parity + +4 from Phase 2 + +3 from Phase 3) |

**Estimated test count after Phase 6:** 1140 (Plan 1b) + 4 (Phase 2) + 3 (Phase 3) + 7-9 (Phase 5) = **1154-1156 pass / 0 fail / 1 skipped**.

## Related Code Files

- **Create:**
  - `docs/journals/260623-phase-d-plan-3-shipped.md` (journal entry; ~200 lines; mirrors Plan 1b's journal structure)
  - `plans/260623-1619-phase-d-plan-3-agents/pr-body.md` (PR body; ~150 lines; mirrors Plan 1b's PR body)
- **Modify:**
  - `plans/reports/productization-260612-1530-master-tracker.md` (D4 + D7 flip `[x]`; D-11 status update)
  - `meta-state.jsonl` (1 new `meta_state_log_change` entry)
  - `package.json` (root — no change; verify no new deps were added)
- **Delete:** none
- **Read (verification):**
  - `pnpm test` output (the full suite)
  - `tools/learning-loop-mastra/agent-manifest.json` (verify 6 groups)
  - `tools/learning-loop-mcp/agent-manifest.json` (verify D-11)
  - `tools/learning-loop-mastra/workflows-manifest.json` (verify 10 entries)
  - `tools/learning-loop-mastra/agents-manifest.json` (verify 3 entries)

## File Inventory (deep mode)

| File | Action | Rough size | Test impact |
|---|---|---|---|
| `docs/journals/260623-phase-d-plan-3-shipped.md` | Create | ~200 lines | none (journal) |
| `plans/260623-1619-phase-d-plan-3-agents/pr-body.md` | Create | ~150 lines | none (PR body) |
| `plans/reports/productization-260612-1530-master-tracker.md` | Modify | -2 lines, +2 lines | D4 + D7 flip |
| `meta-state.jsonl` | Modify (1 entry) | +1 line | registry delta |

## Implementation Steps

1. **Run `pnpm test`.** Verify exit code 0; pass count is 1154-1156; fail count is 0; skip count is 1. If any test fails, escalate to operator (do not flip the tracker until all tests pass).
2. **Run `pnpm test:cold-session`.** Verify exit code 0. The cold-session test enumerates the legacy 31-entry manifest; Plan 3 does not change the manifest's tool set. The test should pass unchanged.
3. **Verify the count math.** Grep `tools/learning-loop-mastra/agents-manifest.json` for the 3 entries. Grep `tools/learning-loop-mastra/agent-manifest.json` for the 6 groups. Grep `tools/learning-loop-mcp/agent-manifest.json` for the 7-entry workflow group. Grep `tools/learning-loop-mastra/__tests__/workflow-parity.test.cjs:159` for the assertion 44.
4. **File the `meta_state_log_change`.** Use the MCP tool with:
   - `change_target`: `plans/reports/productization-260612-1530-master-tracker.md`
   - `change_dimension`: `semantic`
   - `change_diff.added`: `["D4 [x] (3 agents ship)", "D7 [x] (per-agent model config)", "agent group in agent-manifest.json (3 entries)", "ask_intake_agent, ask_scout_agent, ask_self_improvement_agent MCP tools", "createLoopAgent factory", "agents-manifest.json (3 entries)", "D-11 [x] (legacy agent-manifest.json reconciled)"]`
   - `change_diff.removed`: `[]`
   - `change_diff.changed`: `["tools/list enumeration 41 → 44", "agent-manifest.json groups 5 → 6"]`
   - `reason`: `Plan 3 ships D4 + D7 from master tracker. 3 createAgent wrappers (intakeAgent, scoutAgent, selfImprovementAgent) with per-agent model config (kimi-for-coding/k2p6) + agent parity harness (mocked LLM via @mastra/core/test-utils). 6-phase rhythm per Plan 1 + Plan 2. D-11 reconciliation closes the structural gap in legacy agent-manifest.json. Closes Plan 3; Plan 4 (cutover) owns the cold-session enumeration update + final manifest reconciliation.`
   - `evidence_code_ref`: `tools/learning-loop-mastra/create-loop-agent.js:1`
   - `evidence_journal`: `docs/journals/260623-phase-d-plan-3-shipped.md` (the journal this phase creates)
   - `affected_system`: `meta`
5. **Update the master tracker.** Flip D4 + D7 to `[x]`. Update the "Last updated" line at the top. Update the D-11 row to `[x]`. The diff is:
   - `- [ ] **D4** Add 3 meta-state agents...` → `- [x] **D4** Add 3 meta-state agents...`
   - `- [ ] **D7** Document per-agent model config...` → `- [x] **D7** Document per-agent model config...`
   - Update the "Last updated" line with the current date.
6. **Draft the journal entry.** Write `docs/journals/260623-phase-d-plan-3-shipped.md` mirroring Plan 1b's journal structure:
   - Summary (1 paragraph: scope, test count, log-change filed, decisions made).
   - Outcomes per finding (table: finding ID, severity, outcome, evidence).
   - Decisions (numbered list: process decisions made during execution).
   - Lessons (what was hard, what would be different).
   - Forward-looking (what Plan 4 inherits, deferred items).
   - Unresolved questions (none; all 6 of researcher B's open questions resolved in this plan).
   - Acceptance gate (the single durable anchor; verbatim from `plan.md § Acceptance gate`).
7. **Draft the PR body.** Write `plans/260623-1619-phase-d-plan-3-agents/pr-body.md` mirroring Plan 1b's PR body:
   - Branch name (`260623-1619-phase-d-plan-3-agents`).
   - Plan summary (1 paragraph).
   - Test count (delta from Plan 1b baseline 1140 → ~1155).
   - Count matrix (the table above).
   - Deferred items (5 deferred items from the brainstorm; OUT of scope per user decisions).
   - Cross-references (the 2 research reports, the brainstorm, the master tracker).
   - Acceptance criteria (verbatim from `plan.md § Acceptance gate`).
8. **Verify the PR body meets the `rule-pr-body-registry-deltas` consult-checklist.** The rule requires the PR body to sweep entries by id + reason (status=stale), list resolved entries, list new entries, list promoted rules, list superseded entries, and list archived entries. The PR body includes:
   - Sweep entries: N/A (no stale entries in this plan; the log-change is a single new entry).
   - Resolved entries: 0 (no findings resolved in this plan; all open findings stay open).
   - New entries: 1 (`meta_state_log_change` for D4+D7 closure; `meta_state_log_change` for the no-dotenv contract from Phase 1).
   - Promoted rules: 0.
   - Superseded entries: 0.
   - Archived entries: 0.
9. **Update the `agent-manifest.json` "Last updated" line** (if present in the file). The current mastra `agent-manifest.json` does not have a "Last updated" line; this step is N/A.
10. **Run the per-namespace test runner from Plan B** (if `tools/scripts/run-pnpm-test-namespaced.mjs` exists). Verify the per-glob counts are consistent with the full-suite count.

## Function/Interface Checklist (deep mode)

- [ ] `pnpm test` exits 0
- [ ] `pnpm test:cold-session` exits 0
- [ ] Master tracker D4 + D7 flipped to `[x]`
- [ ] D-11 row updated to `[x]`
- [ ] Master tracker "Last updated" line updated
- [ ] `meta_state_log_change` filed with `change_target: plans/reports/productization-260612-1530-master-tracker.md`
- [ ] Journal entry written at `docs/journals/260623-phase-d-plan-3-shipped.md`
- [ ] PR body written at `plans/260623-1619-phase-d-plan-3-agents/pr-body.md`
- [ ] PR body satisfies `rule-pr-body-registry-deltas` consult-checklist
- [ ] `agent-manifest.json` (mastra) has 6 groups
- [ ] `agent-manifest.json` (legacy) workflow group has 7 entries
- [ ] `workflow-parity.test.cjs:159` asserts 44
- [ ] `tools/list` returns 44 tools

## Test Scenario Matrix (deep mode)

| Scenario | Critical | High | Medium | Notes |
|---|---|---|---|---|
| `pnpm test` exits 0 with expected count | ✓ | | | the load-bearing gate |
| `pnpm test:cold-session` exits 0 | | ✓ | | scope unchanged for Plan 3 |
| Master tracker D4 + D7 flipped | ✓ | | | the tracker update |
| `meta_state_log_change` filed | ✓ | | | the audit trail |
| Journal entry written | ✓ | | | the session reflection |
| PR body meets `rule-pr-body-registry-deltas` | | ✓ | | the consult-checklist rule |
| D-11 row updated | | ✓ | | the deferred item closure |
| No new vendor deps in `package.json` (root) | | ✓ | | the dep discipline |

## Dependency Map (deep mode)

- **Reads from:**
  - `pnpm test` output (the full suite; the count math)
  - `tools/learning-loop-mastra/agent-manifest.json` (the 6 groups)
  - `tools/learning-loop-mcp/agent-manifest.json` (the 7-entry workflow group)
  - `tools/learning-loop-mastra/agents-manifest.json` (the 3 entries)
  - `tools/learning-loop-mastra/workflows-manifest.json` (the 10 entries)
  - `docs/journals/260622-phase-d-plan-1b-shipped.md` (the journal structure to mirror)
  - `plans/260622-2119-phase-d-plan-1b-review-fixups/pr-body.md` (the PR body structure to mirror)
- **Writes to:**
  - `docs/journals/260623-phase-d-plan-3-shipped.md` (new journal)
  - `plans/260623-1619-phase-d-plan-3-agents/pr-body.md` (new PR body)
  - `plans/reports/productization-260612-1530-master-tracker.md` (modified; D4 + D7 + D-11)
  - `meta-state.jsonl` (modified; 1 new `meta_state_log_change` entry)
- **Blocks:** Plan 4 (the cutover; depends on Plan 3's `agent-manifest.json` 6-group structure)
- **Blocked by:** Phase 5 (the agent-parity harness)

## Success Criteria

- [ ] `pnpm test` exits 0 with the expected count (1154-1156 pass / 0 fail / 1 skipped)
- [ ] `pnpm test:cold-session` exits 0
- [ ] Master tracker D4 + D7 flipped to `[x]`
- [ ] D-11 row updated to `[x]`
- [ ] `meta_state_log_change` filed with the locked reason + change_target
- [ ] Journal entry written with: summary, outcomes, decisions, lessons, forward-looking, acceptance gate
- [ ] PR body written with: branch name, plan summary, test count, count matrix, deferred items, cross-references, acceptance criteria
- [ ] PR body satisfies `rule-pr-body-registry-deltas` consult-checklist
- [ ] No new vendor deps in `package.json` (root)
- [ ] All 3 agents have `memory === undefined` (regression guard)
- [ ] `MASTRA_AGENT_MODEL` + `KIMI_API_KEY` env vars are operator-facing only (no test exposure)

## Risk Assessment

- **A test fails in the full `pnpm test` run.** Risk: low. **Mitigation:** Phase 5's tests are the load-bearing surface; if any fail, the closeout does not flip the tracker. Escalate to operator with the test output.
- **The cold-session test breaks.** Risk: very low (Plan 3 does not change the legacy `tools/manifest.json`). **Mitigation:** Phase 4 step 7 verifies the cold-session test is unaffected. If it breaks (e.g., a transitive change to the legacy manifest), the closeout blocks until the issue is resolved.
- **The PR body fails the `rule-pr-body-registry-deltas` consult-checklist.** Risk: very low (the rule is new; only a few PRs have been validated against it). **Mitigation:** Step 8 explicitly walks through the checklist items. If a checklist item is missed, the rule blocks the PR; the closeout loops back to update the PR body.
- **The master tracker edit conflicts with concurrent edits.** Risk: very low (master tracker is updated in single-commit plans; no concurrent edits expected). **Mitigation:** The edit is a 2-line flip (D4 + D7) + 1-line flip (D-11) + 1-line date update. The diff is small and reviewable.
- **The journal entry omits a decision that should be documented.** Risk: low. **Mitigation:** The journal structure mirrors Plan 1b's journal (which was reviewed and approved by the operator). The "Decisions" section is a numbered list of process decisions; the structure is fixed.

## Security Considerations

- **The `meta_state_log_change` does NOT include any operator secrets.** Risk: very low. **Mitigation:** The log-change fields are public (change_target, change_diff, reason). No API keys, no env var values, no personal data.
- **The journal entry does NOT include any operator secrets.** Risk: very low. **Mitigation:** The journal follows the Plan 1b structure; the "Decisions" section references env var names (`MASTRA_AGENT_MODEL`, `KIMI_API_KEY`) but not values.
- **The PR body does NOT include any operator secrets.** Risk: very low. **Mitigation:** The PR body follows the Plan 1b structure; the "Deferred items" section references the locked decisions but not the operator's deployment config.

## Next Steps

After Phase 6 ships, Plan 4 (cutover) is the only remaining Phase D work. Plan 4 owns:
- The final 5→6-group `agent-manifest.json` reconciliation (D-9).
- The cold-session discoverability enumeration update for the 3 new `ask_*` tools (Plan 1 review deferred item 4.2).
- The §3.10 reconciliation in `plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md` (per brainstorm Q5).
- The `AGENTS.md` §1 contract note (per brainstorm Touchpoints Plan 4).
- The F4 PR security note in the PR body (D-13).

The 4-plan Phase D stack completes with Plan 4. Phase E (Mastra Code Mode 1), Phase F (Bridge 7), and Phase G (skill migration) are separate phases.
