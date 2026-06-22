---
phase: 6
title: "6-acceptance-gate-closeout"
status: pending
priority: P2
effort: "30min"
dependencies: ["5"]
---

# Phase 6: 6-acceptance-gate-closeout

## Overview

Final verification phase. Runs the full test suite (`pnpm test`), runs cold-session discoverability (`pnpm test:cold-session`, legacy 31-entry manifest per BLOCKER #4 — scope unchanged), runs `workflow-parity.test.cjs` (the SEPARATE 41-tool enumeration gate per BLOCKER #4), asserts the acceptance gate ("all 11 test namespaces pass + 11/11 storage-parity tests GREEN on native driver + 41 tools enumerated by workflow-parity"), flips the master tracker D5/D6 checkboxes to `[x]`, files a `meta_state_log_change` entry, writes a journal entry, and prepares the PR body.

## Why a dedicated closeout phase

The closeout is the contract surface between Plan 2 and downstream plans (Plan 3 agents, Plan 4 cutover). Each closeout artifact (tracker flip, change-log, journal, PR body) has a different consumer and format. A dedicated phase ensures each artifact is correct before the PR is shipped, not bundled with code changes that could fail review.

## Requirements

- **Functional:** all 11 test namespaces pass; 11/11 storage-parity tests GREEN on native driver (9/11 + 2 skips on memory driver per BLOCKER #2 + MINOR #4 fixes — Test 3 + the MCP `before` skip Test 4 + Test 6 together); cold-session test passes (unchanged scope: legacy 31-entry manifest); `workflow-parity.test.cjs:159` asserts 41 (SEPARATE gate per BLOCKER #4); tracker D5/D6 flipped `[x]`; `meta_state_log_change` filed; journal entry written; PR body drafted.
- **Non-functional:** no code changes in this phase. Verify-only + metadata. If any verification fails, return to the failing phase — don't fix forward in Phase 6.

## Acceptance gate (the durable sentence)

*"All 11 test namespaces pass (was 10; storage-parity adds one); storage factory `initStorage()` succeeds on cold start and is idempotent on restart; 11 storage-parity tests GREEN on native driver (4 substrate direct + 2 MCP integration + 5 workflow-direct unit); 9 GREEN + 2 skips on memory driver (Test 3 substrate-direct + the MCP `before` block skipping Test 4 + Test 6 together; documented per MINOR #4); the 2 new `run_workflow_storage_*` workflows persist and read back records via `getMastraStorage()` across server restart; tools/list enumeration = 41 tools total (31 `mastra_*` + 8 `run_workflow_*` + 2 `run_workflow_storage_*`) per `workflow-parity.test.cjs:159`; cold-session discoverability test passes against the legacy 31-entry manifest (its scope is unchanged by Plan 2; the mastra server's 41-tool enumeration is checked separately by workflow-parity). Whole-suite count (native): 1109 pass / 0 fail / 1 skipped (1 pre-existing). After BLOCKER #3 glob fix: existing 15 .cjs tests (workflow-parity + mcp-protocol-e2e) join the suite, baseline 1083 → 1098; +11 from storage-parity = 1109."*

**Count math (verified 2026-06-19):**
- **native driver:** **1109 pass / 0 fail / 1 skipped** (1 pre-existing skip; no storage skips on native).
- **memory driver:** **1108 pass / 0 fail / 2 skipped** (1 pre-existing + Test 4 + Test 6 skip together via shared `before`; Test 3 also skips independently).
- Post-Plan 2 tools count = **41 total** (was 39; +2 storage workflows).

**Two distinct gates (per Plan 1's pattern):**
1. **Storage parity gate** = `pnpm test` namespace 11 (`storage-parity.test.cjs`) must pass 11/11 on native driver (or 9/11 + 2 skips on memory driver: Test 3 substrate-direct + the MCP `before`-block skip on Test 4 + Test 6). This is the load-bearing assertion.
2. **Cold-session discoverability gate** = `pnpm test:cold-session` must pass; the test verifies the LEGACY 31-entry `tools/learning-loop-mcp/tools/manifest.json` tool registration shape. **Scope unchanged by Plan 2.** The mastra server's 41-tool enumeration is a SEPARATE gate: `workflow-parity.test.cjs:159` (bumped 39→41 in Phase 4 step 5).

## Architecture

No code changes. Phase 6 is verify + metadata.

```
Phase 6 closeout flow
├── MASTRA_STORAGE_DRIVER=native pnpm test → assert 11/11 namespaces pass + 11/11 storage-parity
├── MASTRA_STORAGE_DRIVER=memory pnpm test → assert 9/11 + 2 skips (Test 3 substrate-direct + Test 4 + Test 6 share the MCP before-skip)
├── pnpm test:cold-session → assert passes (legacy 31-entry manifest; scope unchanged by Plan 2)
├── node --test tools/learning-loop-mastra/__tests__/workflow-parity.test.cjs → assert 41-tool enumeration
├── node --test tools/learning-loop-mastra/__tests__/mutex-scope.test.js
├── node --test tools/learning-loop-mastra/__tests__/connect-mcp-server-mutex.test.js
├── Edit plans/reports/productization-260612-1530-master-tracker.md → flip D5/D6 [x]
├── OPERATOR_MODE=1 ... → meta_state_log_change(...) → audit trail
├── Write journal entry → plans/reports/journal-260619-2246-phase-d-plan-2-shipped.md
└── Draft PR body → include acceptance sentence + parity matrix + test counts
```

## Related Code Files

- **Modify:** `plans/reports/productization-260612-1530-master-tracker.md` (tracker flip for D5/D6)
- **Append to:** `meta-state.jsonl` (1 `meta_state_log_change` entry)
- **Create:** `plans/reports/journal-260619-2246-phase-d-plan-2-shipped.md` (journal entry)
- **Create:** `plans/260619-2246-phase-d-plan-2-storage/pr-body.md` (PR body for review)
- **No code files.** Verify-only + metadata.

## Implementation Steps

1. **Run the full test suite** under `native` driver (the production path):
   ```bash
   cd /home/datguy/codingProjects/learning-loop-template
   MASTRA_STORAGE_DRIVER=native pnpm test
   ```
   Expected: 11 namespaces pass. Specifically the new `storage-parity.test.cjs` has 11/11 GREEN (4 substrate direct + 2 MCP integration + 5 workflow-direct unit). Whole-suite count: **1109 pass / 0 fail / 1 skipped** (the 1 skipped is the pre-existing skip; no storage skips on native driver).

2. **Run the full test suite** under `memory` driver (verify the fallback path; multiple tests skip):
   ```bash
   cd /home/datguy/codingProjects/learning-loop-template
   MASTRA_STORAGE_DRIVER=memory pnpm test
   ```
   Expected: 11 namespaces pass. Specifically `storage-parity.test.cjs` has **9/11 GREEN + 2 skipped** (Test 3 substrate-direct skips independently; the MCP `before` block skips Test 4 + Test 6 together per MINOR #4 fix). Whole-suite count: **1108 pass / 0 fail / 2 skipped** (1 pre-existing + 1 storage-skip group). The skip MUST log to stderr: `MASTRA_STORAGE_DRIVER=memory; cross-process persistence requires file-backed storage`.

3. **Run the cold-session test** (verifies the LEGACY 31-entry manifest's tool registration shape; scope unchanged by Plan 2):
   ```bash
   cd /home/datguy/codingProjects/learning-loop-template
   pnpm test:cold-session
   ```
   Expected: passes. The cold-session test reads the legacy `tools/learning-loop-mcp/tools/manifest.json` (31 entries) and asserts that all entries register with name/description/schema. **It does NOT enumerate the mastra server's 41 tools** — that is checked separately by `workflow-parity.test.cjs:159` (bumped 39→41 in Phase 4 step 5). Per BLOCKER #4 fix (Option B): Plan 4 owns the cold-session mastra enumeration update.

3a. **Run `workflow-parity.test.cjs`** to verify the mastra server's 41-tool enumeration (the SEPARATE gate that the cold-session test does NOT cover):
   ```bash
   cd /home/datguy/codingProjects/learning-loop-template
   node --test tools/learning-loop-mastra/__tests__/workflow-parity.test.cjs
   ```
   Expected: pass. Specifically the enumeration test (bumped in Phase 4 step 5) asserts 41 tools total (31 `mastra_*` + 8 `run_workflow_*` + 2 `run_workflow_storage_*`).

4. **Run the deterministic mutex race tests** (sanity check that the storage wiring didn't break mutex invariants):
   ```bash
   cd /home/datguy/codingProjects/learning-loop-template
   node --test tools/learning-loop-mastra/__tests__/mutex-scope.test.js
   node --test tools/learning-loop-mastra/__tests__/connect-mcp-server-mutex.test.js
   ```
   Expected: pass. The mutex guards `meta-state.jsonl` writes; storage wiring doesn't touch this path.

5. **Flip tracker D5/D6 to `[x]`:**
   - In `plans/reports/productization-260612-1530-master-tracker.md` §Phase D, edit:
     - `- [ ] **D5** Wire @mastra/libsql as the runtime substrate for Mastra persistence ...` → `- [x] **D5** ...`
     - `- [ ] **D6** Use the storage backend for workflow stateSchema + suspend/resume snapshots ...` → `- [x] **D6** ...`
   - Note: D5/D6 are flipped; D1/D2/D3 are already flipped (Plan 1, 2026-06-18); D4 (agents) and D7 (per-agent model config) remain `[ ]` (those ship in Plan 3, not this plan).

6. **File `meta_state_log_change`** via the MCP tool (gated on `OPERATOR_MODE=1`):
   - `change_dimension`: `"semantic"`
   - `change_target`: `"plans/reports/productization-260612-1530-master-tracker.md"`
   - `change_diff`: `{ "added": [], "removed": [], "changed": ["D5", "D6 (Phase D checkboxes)"] }`
   - `reason`: `"Phase D Plan 2 shipped 2026-06-19: @mastra/libsql@1.13.0 wired as runtime substrate (Pattern A2a: build LoopMCPServer first; new Mastra({ storage, mcpServers: {...} })); storage.js factory with mkdirSync prerequisite + connection_limit=1 + MASTRA_STORAGE_DRIVER=memory fallback; 2 storage workflows (round-trip + read) via createLoopWorkflow; 11-test storage-parity harness (4 substrate direct + 2 MCP integration + 5 workflow-direct unit; Test 4+6 share a before-skip on memory driver per MINOR #4); tools/list bumped 39→41 (workflow-parity.test.cjs:159); cold-session scope unchanged (legacy 31-entry manifest; mastra 41-tool enumeration is a separate gate per BLOCKER #4); pnpm test glob extended to include *.test.cjs (BLOCKER #3 fix); 1109 pass / 0 fail / 1 skipped on native driver (1083 → 1098 baseline via +15 existing .cjs + 11 new = 1109)."`
   - `applies_to`: `{ "tools": ["MCPServer", "Mastra", "LibSQLStore"], "rules": ["runtime-agnostic-features"], "statuses": ["completed"] }`
   - `supersedes`: (none — this is a new change-log entry)
   - `consolidates`: (none — Plan 2 closed cleanly without pre-existing findings)

   Use the MCP tool:
   ```bash
   OPERATOR_MODE=1 npx -y --package=@modelcontextprotocol/sdk -- node -e "
     // (use the meta_state_log_change MCP tool — see mcp__learning-loop-mastra__mastra_meta_state_log_change)
   "
   ```
   Or call the MCP tool directly if the harness is connected. The tool returns an entry id; record the id in the journal entry.

7. **Write journal entry** at `plans/reports/journal-260619-2246-phase-d-plan-2-shipped.md`:
   - **Summary** (1 paragraph): what shipped, test counts, link to PR
   - **Decisions** (1-2 paragraphs): file path correction (root `package.json` not `tools/learning-loop-mastra/package.json`); Pattern A1/A2 wiring decision; 2 new storage workflows for the integration test; JSONL sidecar boundary clarification
   - **Lessons** (1-2 paragraphs): what was hard (Q1.A API surface verification; `mkdirSync` prerequisite discovery); what would be different (schema-fingerprint test deferred to Plan 2a)
   - **Forward-looking** (1 paragraph): what Plans 3-4 should know (factory pattern reuse; `getMastraStorage()` is the seam for Plan 3's agents)
   - **Unresolved questions**: 0 (Q1.A resolved at Phase 2 author time; Q1.B corrected in this plan)

8. **Draft PR body** (saved to `plans/260619-2246-phase-d-plan-2-storage/pr-body.md` for review):
   ```markdown
   ## Phase D Plan 2 — Mastra LibSQL Storage (D5+D6)

   ### Summary
   Wires `@mastra/libsql@1.13.0` as the runtime substrate for Mastra persistence (Pattern A2a: build `LoopMCPServer` first; `new Mastra({ storage, mcpServers: { ... } })` wires storage via `Mastra` constructor's `__registerMastra(server)` call). Ships `storage.js` factory with `mkdirSync` prerequisite + `connection_limit=1` + `MASTRA_STORAGE_DRIVER=memory` fallback. Adds 2 storage workflows (`run_workflow_storage_round_trip` + `run_workflow_storage_read`) that exercise the substrate from inside the Mastra runtime. Includes 11-test `storage-parity.test.cjs` (4 substrate direct + 2 MCP integration + 5 workflow-direct unit). Also fixes the `pnpm test` glob to pick up `.test.cjs` under `tools/learning-loop-mastra/__tests__/` (BLOCKER #3 fix; brings in 15 existing tests).

   ### Acceptance gate
   All 11 test namespaces pass; 11/11 storage-parity tests GREEN on native driver (4 substrate + 2 MCP + 5 workflow-direct unit; Test 4 + Test 6 share a `before` block that skips on `memory` driver per MINOR #4); 9/11 + 2 skips on memory driver (Test 3 substrate-direct + the MCP `before`-block skip); cold-session passes (legacy 31-entry manifest verified; scope unchanged by Plan 2); 41 tools enumerated by `workflow-parity.test.cjs:159` (separate gate per BLOCKER #4); whole-suite = **1109 pass / 0 fail / 1 skipped** on native (1108 / 0 / 2 skipped on memory).

   ### Count matrix
   | Surface | Pre-Plan 2 | Post-Plan 2 | Delta |
   |---|---|---|---|
   | `tools/manifest.json` | 31 entries | 31 entries | 0 |
   | `workflows-manifest.json` | 8 entries | 10 entries | +2 |
   | `mastra_*` tools registered | 31 | 31 | 0 |
   | `run_workflow_*` tools registered | 8 | 8 | 0 |
   | `run_workflow_storage_*` tools registered | 0 | 2 | +2 |
   | **Total tools registered** | **39** | **41** | **+2** |
   | Test namespaces | 10 | 11 | +1 |
   | Tests pass (native) | 1083 | **1109** | +26 (= +15 existing .cjs + +11 new) |
   | Tests skipped (native) | 1 | 1 | 0 (no storage skips on native) |
   | Tests pass (memory) | 1083 | 1108 | +25 |
   | Tests skipped (memory) | 1 | 2 | +1 (Test 4 + Test 6 skip together) |

   ### Parity matrix (storage-parity.test.cjs)
   | Test | Type | Status |
   |---|---|---|
   | 1. libsql round-trip | substrate direct | GREEN |
   | 2. jsonl sidecar | substrate direct | GREEN (per-test fixture, not meta-state) |
   | 3. cross-restart persistence | substrate direct | GREEN (SKIPS on `MASTRA_STORAGE_DRIVER=memory`) |
   | 4. MCP server restart preserves state | MCP integration | GREEN (shares `before` with Test 6; SKIPS on `memory` per MINOR #4) |
   | 5. storage isolation | substrate direct | GREEN |
   | 6. tools/list enumerates 2 storage workflows | MCP integration | GREEN (shares `before` with Test 4; SKIPS on `memory`) |
   | 7. workflow round-trip writes + reads | workflow-direct unit | GREEN |
   | 8. workflow read missing key | workflow-direct unit | GREEN |
   | 9. workflow complex payload survives | workflow-direct unit | GREEN |
   | 10. workflow idempotent overwrite | workflow-direct unit | GREEN |
   | 11. workflow createdAt ISO 8601 | workflow-direct unit | GREEN |

   ### Out of scope (downstream plans)
   - D4 + D7: agents → Plan 3 (depends on this plan's `getMastraStorage()` seam)
   - `agent-manifest.json` 5-group final reconcile → Plan 4 (cutover)
   - Cold-session test mastra-server 41-tool enumeration update → Plan 4 (per BLOCKER #4 fix; Plan 1 review deferred item)
   - Schema-fingerprint test → Plan 2a (recommended in researcher A §Open Questions Q5)
   - `Mastra.shutdown()` lifecycle hook for `storage.close()` → Plan 3 (when agents land)
   ```

## Success Criteria

- [ ] `MASTRA_STORAGE_DRIVER=native pnpm test` exits 0 (all 11 namespaces pass; **1109 / 0 / 1 skip** on native)
- [ ] `MASTRA_STORAGE_DRIVER=memory pnpm test` exits 0 (9/11 + 2 skips on memory driver — Test 3 substrate-direct + the MCP `before`-block skip on Test 4 + Test 6 per MINOR #4; **1108 / 0 / 2 skip** on memory)
- [ ] `pnpm test:cold-session` exits 0 (legacy 31-entry manifest verified; scope unchanged by Plan 2)
- [ ] `workflow-parity.test.cjs` exits 0 (the SEPARATE 41-tool enumeration gate per BLOCKER #4 fix)
- [ ] Mutex race tests pass (no regression)
- [ ] Tracker D5/D6 flipped to `[x]`
- [ ] `meta_state_log_change` filed with semantic change dimension
- [ ] Journal entry written at `plans/reports/journal-260619-2246-phase-d-plan-2-shipped.md`
- [ ] PR body drafted at `plans/260619-2246-phase-d-plan-2-storage/pr-body.md`
- [ ] No code changes in this phase

## Risk Assessment

- **Risk:** a test fails in `pnpm test` due to Phase 1-5 work. **Mitigation:** if any test fails, return to the failing phase. Phase 6 does not fix forward; verify-only.
- **Risk:** cold-session test fails (BLOCKER #4 fix). **Mitigation:** Plan 2 does NOT change the cold-session test's scope (it still verifies the LEGACY 31-entry `tools/learning-loop-mcp/tools/manifest.json` tool registration shape). The 2 new `run_workflow_storage_*` tools appear in the mastra server's `tools/list` (verified by `workflow-parity.test.cjs:159`, the SEPARATE gate per step 3a). If the cold-session test fails, the cause is unrelated to Plan 2 (the legacy manifest was updated to 31 entries by Plan 1's red team closure). Per BLOCKER #4: updating the cold-session test to also enumerate the mastra server's 41 tools is Plan 4's job.
- **Risk:** `MASTRA_STORAGE_DRIVER=memory` causes Phase 5 Test 4 (MCP integration) to fail because cross-process persistence requires file-backed storage. **Mitigation:** per MINOR #4 fix, the MCP `before` block (Phase 5 step 4) checks the env var and skips the entire describe on `memory`. Both Test 4 + Test 6 skip together with the same skip message. Test 3 substrate-direct also skips independently (its own skip message). Net on memory driver: **9/11 storage-parity tests pass + 2 skips** (Test 3 + Test 4/6). Documented in Phase 5 step 4 + step 7.
- **Risk:** `meta_state_log_change` fails because `OPERATOR_MODE` env var isn't set. **Mitigation:** the operator runs the closeout with `OPERATOR_MODE=1` (per the Pre-flight Checklist in `plan.md`). If the env var is missing, the MCP tool call returns a clear error; the operator retries with the env var set.

## Security Considerations

None. Verify-only phase. No privilege boundaries crossed beyond the gated `meta_state_log_change` call (which requires `OPERATOR_MODE=1` per the loop's audit protocol).

## Next Steps

After Phase 6:
- **Plan 2 is shippable** as a single PR (6 commits, one per phase, stacked on a feature branch off `main`). Branch name: `260619-2246-phase-d-plan-2-storage`.
- **Plan 3 (agents)** is blocked on Plan 1 + Plan 2. Plan 1 PR is already merged (2026-06-18). Once this PR merges, Plan 3 can start author.
- **Plan 4 (cutover)** is blocked on Plans 1 + 2 + 3.
- **Phase E** (Mastra Code Mode 1) is post-Phase-D; deferred.

The operator reviews Plan 2's PR; if approved, merge to `main`. The diamond DAG (Plan 1 ✅ merged + Plan 2 → Plan 3 → Plan 4) proceeds.
