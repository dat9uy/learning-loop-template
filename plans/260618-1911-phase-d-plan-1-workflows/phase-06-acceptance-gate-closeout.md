---
phase: 6
title: "Acceptance gate + closeout"
status: completed
priority: P1
effort: "30min"
dependencies: ["5"]
---

# Phase 6: Acceptance gate + closeout

## Overview

Final verification phase. Runs the full test suite, asserts the acceptance gate ("all 10 test namespaces pass + 8/8 workflow parity GREEN + 37 tools enumerated in cold-session"), flips the master tracker D1/D2/D3 checkboxes to `[x]`, files a `meta_state_log_change` entry, writes a journal entry, and prepares the PR body.

## Why a dedicated closeout phase

The closeout is the contract surface between Plan 1 and downstream plans (Plan 3 agents, Plan 4 cutover). Each closeout artifact (tracker flip, change-log, journal) has a different consumer and format. A dedicated phase ensures each artifact is correct before the PR is shipped, not bundled with code changes that could fail review.

## Requirements

- **Functional:** all 10 test namespaces pass; 9/9 workflow parity tests pass (8 per-workflow + 1 enumeration); cold-session test passes; tracker D1/D2/D3 flipped `[x]`; `meta_state_log_change` filed; journal entry written; PR body drafted.
- **Non-functional:** no code changes in this phase. Verify-only + metadata. If any verification fails, return to the failing phase — don't fix forward in Phase 6.

## Acceptance gate (the durable sentence)

*"All 10 test namespaces pass; 8 of 8 migrated workflows produce output identical (byte-equal where structured, deep-equal otherwise) to the legacy handler when invoked via `run_<key>` MCP tool call; cold-session discoverability test confirms the 31 remaining legacy manifest entries all register with name/description/schema; mastra server's `tools/list` enumerates all 39 tools (31 `mastra_*` + 8 `run_workflow_*`) with valid inputSchemas."*

**Count math (verified 2026-06-18):** post-Phase-4 tool count = 39 total (31 `mastra_*` + 8 `run_*`; no count change vs pre-Phase-4).

**Corrected acceptance sentence:** *"All 10 test namespaces pass; 8 of 8 migrated workflows produce output identical (byte-equal where structured, deep-equal otherwise) to the legacy handler when invoked via `run_<key>` MCP tool call; cold-session discoverability test confirms the 31 remaining legacy manifest entries all register with name/description/schema; mastra server's `tools/list` enumerates all 39 tools (28 deterministic `mastra_*` + 3 stay-as-createTool `mastra_workflow_*` + 8 new `run_workflow_*`) with valid inputSchemas."*

**Two distinct gates (reframed from red team BLOCKER #4):**
1. **Workflow parity gate** = `pnpm test` namespace 10 must pass 9/9 workflow-parity tests (Phase 5). This is the load-bearing assertion.
2. **Cold-session discoverability gate** = `pnpm test:cold-session` must pass; the test verifies the 31-entry legacy manifest's tool registration shape (existence of name/description/schema per entry). It does NOT check workflow parity.

## Architecture

No code changes. Phase 6 is verify + metadata.

```
Phase 6 closeout flow
  ├── pnpm test → assert 10/10 namespaces pass + 9/9 workflow parity
  ├── pnpm test:cold-session → assert passes (8 run_<key> tools + 31 mastra_* = 39 total)
  ├── Edit plans/reports/productization-260612-1530-master-tracker.md → flip D1/D2/D3 [x]
  ├── OPERATOR_MODE=1 npx ... → meta_state_log_change(...) → audit trail
  ├── Write journal entry → plans/reports/journal-260618-1911-phase-d-plan-1-shipped.md
  └── Draft PR body → include acceptance sentence + parity matrix + test counts
```

## Related Code Files

- **Modify:** `plans/reports/productization-260612-1530-master-tracker.md` (tracker flip for D1/D2/D3)
- **Append to:** `meta-state.jsonl` (1 `meta_state_log_change` entry)
- **Create:** `plans/reports/journal-260618-1911-phase-d-plan-1-shipped.md` (journal entry)
- **No code files.** Verify-only + metadata.

## Implementation Steps

1. **Run the full test suite:**
   ```bash
   cd /home/datguy/codingProjects/learning-loop-template
   pnpm test
   ```
   Expected: all 10 namespaces pass. Specifically namespace 10 (`tools/learning-loop-mastra/__tests__/`) now has 70 + 9 = 79 tests (70 from Phase C + 4 factory tests from Phase 2 + 8 direct parity from Phase 3 + 9 MCP parity from Phase 5 = wait, that's 91, not 79. Recount: 70 + 4 + 8 + 9 = 91. Update the math: post-Phase-6 namespace 10 = 91 tests. Or — to be safe — re-count at implementation time from the actual `node --test` output, not from the plan's pre-count).

2. **Run the cold-session test:**
   ```bash
   pnpm test:cold-session
   ```
   Expected: passes; the cold-session test verifies the 31-entry legacy manifest's tool registration shape. **It does NOT check workflow parity** — that's `pnpm test` namespace 10 (Phase 5's 9/9 tests). The two gates are separate.

3. **Run the deterministic mutex race test** (sanity check that the workflow migration didn't break mutex invariants):
   ```bash
   node --test tools/learning-loop-mastra/__tests__/mutex-scope.test.js
   node --test tools/learning-loop-mastra/__tests__/connect-mcp-server-mutex.test.js
   ```
   Expected: pass.

4. **Flip tracker D1/D2/D3 to `[x]`:**
   - In `plans/reports/productization-260612-1530-master-tracker.md` §Phase D, edit:
     - `- [ ] **D1** Promote ~8 meta-state workflow tools to ...` → `- [x] **D1** Promote ~8 meta-state workflow tools to ...`
     - `- [ ] **D2** Use `stateSchema` to carry orientation context ...` → `- [x] **D2** ...`
     - `- [ ] **D3** Use `suspend`/`resume` for operator checkpoints ...` → `- [x] **D3** ...`
   - Note: D1/D2/D3 are flipped; D4 (agents), D5 (storage), D6 (memory), D7 (per-agent model config) remain `[ ]` (those ship in Plans 2-3, not this plan).

5. **File `meta_state_log_change`** via the MCP tool (gated on `OPERATOR_MODE=1`):
   ```bash
   OPERATOR_MODE=1 npx -y --package=@modelcontextprotocol/sdk -- node -e "
     // (use the meta_state_log_change MCP tool)
   "
   ```
   - `change_dimension`: `"semantic"`
   - `change_target`: `"plans/reports/productization-260612-1530-master-tracker.md"`
   - `change_diff`: `{ "added": [], "removed": [], "changed": ["D1", "D2", "D3 (Phase D checkboxes)"] }`
   - `reason`: `"Phase D Plan 1 shipped 2026-06-18: 8 workflow_* tools promoted to createWorkflow with createLoopWorkflow factory; workflow parity harness proven via 9 MCP run_<key> tests; cold-session 37 tools; all 10 namespaces pass."`
   - `applies_to`: `{ "tools": ["MCPServer", "createLoopWorkflow"], "rules": ["runtime-agnostic-features"], "statuses": ["completed"] }`

6. **Write journal entry** at `plans/reports/journal-260618-1911-phase-d-plan-1-shipped.md`:
   - Summary (1 paragraph): what shipped, test counts, link to PR
   - Decisions (1-2 paragraphs): Q1 conflict resolution, parity-faithful default, factory pattern reuse
   - Lessons (1-2 paragraphs): what was hard, what would be different
   - Forward-looking (1 paragraph): what Plans 2-4 should know
   - Unresolved questions: list from `plan.md` and Phase 5's empirical probe notes

7. **Draft PR body** (saved to `plans/260618-1911-phase-d-plan-1-workflows/pr-body.md` for review):
   ```markdown
   ## Phase D Plan 1 — Mastra Workflows Migration (D1+D2+D3)

   ### Summary
   Promotes 8 deterministic `workflow_*` tools from `createTool` to `createWorkflow` wrappers. Ships `createLoopWorkflow` factory mirroring `createLoopTool` parity-shim pattern. Includes per-workflow parity harness (8 direct unit tests + 8 MCP `run_<key>` tests + 1 enumeration test).

   ### Acceptance gate
   All 10 test namespaces pass; 8/8 workflows parity GREEN; cold-session 37 tools (29 + 8); 91 tests in namespace 10.

   ### Parity matrix
   | Workflow | Direct parity | MCP parity | Description match |
   |----------|---------------|------------|-------------------|
   | `workflow_intake_orient` | ✅ | ✅ | ✅ |
   | `workflow_intake_plan` | ✅ | ✅ | ✅ |
   | `workflow_classify_prompt` | ✅ | ✅ | ✅ |
   | `workflow_prepare_runtime_request` | ✅ | ✅ | ✅ |
   | `workflow_self_improvement` | ✅ | ✅ | ✅ (deferred multi-step) |
   | `workflow_intentional_skip` | ✅ | ✅ | ✅ |
   | `workflow_report_phase_status` | ✅ | ✅ | ✅ |
   | `workflow_runtime_probe` | ✅ | ✅ | ✅ (deferred multi-step) |

   ### Out of scope (downstream plans)
   - D4 + D7: agents → Plan 3
   - D5 + D6: storage → Plan 2 (parallel)
   - agent-manifest.json 5-group final reconcile → Plan 4 (cutover)
   - `§3.10` research report reconciliation → Plan 4
   ```

## Success Criteria

- [x] `pnpm test` exits 0 (all 10 namespaces pass)
- [x] `pnpm test:cold-session` exits 0 (31 legacy tools enumerated)
- [x] Tracker D1/D2/D3 flipped to `[x]`
- [x] `meta_state_log_change` filed with semantic change dimension
- [x] Journal entry written
- [x] PR body drafted with parity matrix
- [x] No code changes in this phase

## Risk Assessment

- **Risk:** a test fails in `pnpm test` due to Phase 1-5 work. **Mitigation:** if any test fails, return to the failing phase. Phase 6 does not fix forward; verify-only.
- **Risk:** cold-session test fails because the new `run_<key>` tools don't appear in `tools/list`. **Mitigation:** the cold-session test in `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` enumerates the **legacy** server's tool list (which doesn't exist post-Phase C Plan 3 cut-over). If the cold-session test has been updated to enumerate the **mastra** server (per `plans/260617-1950-phase-c-plan-3-cut-over/`), the 37 tools count should match. If it hasn't, Phase 6 documents the test surface gap and files a follow-up.
- **Risk:** `meta_state_log_change` fails because `OPERATOR_MODE` env var isn't set. **Mitigation:** the operator runs the closeout with `OPERATOR_MODE=1` (per the Pre-flight Checklist in `plan.md`). If the env var is missing, the MCP tool call returns a clear error; the operator retries with the env var set.

## Security Considerations

None. Verify-only phase. No privilege boundaries crossed beyond the gated `meta_state_log_change` call (which requires `OPERATOR_MODE=1` per the loop's audit protocol).

## Next Steps

After Phase 6:
- **Plan 1 is shippable** as a single PR (6 commits, one per phase). Branch: `260618-1911-phase-d-plan-1-workflows`.
- **Plan 2 (storage)** ships in parallel; no dependency.
- **Plan 3 (agents)** is blocked on Plan 1; cannot start author until Plan 1's PR is merged.
- **Plan 4 (cutover)** is blocked on Plans 1 + 2 + 3.
- **Phase E** (Mastra Code Mode 1) is post-Phase-D; deferred.

The operator reviews Plan 1's PR; if approved, merge to `main`. The diamond DAG (Plan 1 + Plan 2 → Plan 3 → Plan 4) proceeds.