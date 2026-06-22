---
title: "GH-2246 pnpm test probes A — data gathering"
description: "Read-only investigation closing the 3 blocking probes (1, 4, 7) from brainstorm-260621-1355 §11. Each probe delivers a concrete answer with file:line evidence; new constraints are added back to the brainstorm's §7. No code changes, no meta-state mutations. This is the precondition for Plan B (fix design + implementation)."
status: completed
priority: P2
branch: "260619-2246-phase-d-plan-2-storage"
tags: [gh-2246, pnpm-test, data-gathering, read-only]
blockedBy: []
blocks: [260622-plan-b-pnpm-test-fix-design]
created: "2026-06-21T17:46:42.114Z"
createdBy: "ck:plan"
source: skill
related:
  - plans/reports/brainstorm-260621-1355-GH-2246-pnpm-test-glob-problem-report.md
  - meta-260620T2108Z-the-full-pnpm-test-glob-11-directories-1100-tests-takes-10-m
  - meta-260620T2108Z-when-code-is-modified-findings-anchored-to-file-paths-drift
  - plans/260621-2223-GH-2246-mcp-stdio-sdk-conversion (sibling, completed)
---

# GH-2246 pnpm test probes A — data gathering

## Overview

Plan A from `brainstorm-260621-1355-GH-2246-pnpm-test-glob-problem-report.md` §11. Pure read-only investigation. Closes the 3 blocking probes that Plan B cannot answer without data. Each probe produces a concrete answer (not "probably" or "unclear") with file:line evidence.

Sibling to `plans/260621-2223-GH-2246-mcp-stdio-sdk-conversion/` (resolved 2026-06-21). The resolved plan closed the *binary* failure mode (MCP stdio deadlock) and added 30s test timeout; this plan addresses the *continuous* failure mode (10-min silent output + agent loop) that remains.

## Phases

| Phase | Name | Status | Probe |
|-------|------|--------|-------|
| 1 | [Probe 1: Runtime Parity](./phase-01-probe-1-runtime-parity.md) | Completed | Mastra Agent ↔ direct `pnpm test` invocation parity |
| 2 | [Probe 4: pnpm test consumers](./phase-02-probe-4-pnpm-test-consumers.md) | Completed | Enumerate + classify every `pnpm test` consumer |
| 3 | [Probe 7: Fingerprint-drift dependency](./phase-03-probe-7-fingerprint-drift-dependency.md) | Completed | Does drift detection require full E2E or per-namespace? |
| 4 | [Report compile](./phase-04-report-compile.md) | Completed | Assemble <300 line report at `plans/260622-0044-GH-2246-pnpm-test-probes-A/pnpm-test-probes-data-gathering-report.md` |

## Dependencies

- Phase 4 (report compile) is `blockedBy` Phases 1, 2, 3.
- Phases 1, 2, 3 are independent — they may run in parallel if 3 investigators are available.
- This plan is `blocks` the future Plan B (fix design + implementation). Without this report, Plan B designs in the dark.
- Out of scope for this plan: design, code, meta-state changes, fix proposal.

## Acceptance Criteria

- [ ] Each of the 3 probes has a concrete answer (not "probably" or "unclear")
- [ ] Each answer cites the `file:line` evidence that grounds it
- [ ] Any new constraints discovered are added back to the brainstorm report's §7
- [ ] Final report is at `plans/260622-0044-GH-2246-pnpm-test-probes-A/pnpm-test-probes-data-gathering-report.md` and <300 lines
- [ ] No files outside `plans/260622-0044-GH-2246-pnpm-test-probes-A/` are modified
- [ ] No meta-state mutations (no `meta_state_report`, no `meta_state_resolve`, etc.)

## Deliverable

A single report file at `plans/260622-0044-GH-2246-pnpm-test-probes-A/pnpm-test-probes-data-gathering-report.md` (target <300 lines) with 3 sections — one per probe — each containing:

1. The question
2. The concrete answer (1-2 sentences, no hedging)
3. The evidence (file:line citations, command outputs, or path traces)
4. New constraints discovered (or "None")

## Open Questions (for Plan B)

These are NOT questions to answer in this plan — they are constraints Plan B will face once the probe answers are in. Listed here for traceability.

1. Does the Mastra Agent's invocation path allow per-namespace stdout, or only batched output? (Answered by Probe 1)
2. Which `pnpm test` consumers can tolerate a `[ns] ==> start` / `[ns] ==> pass` / `[ns] ==> FAIL` prefix? (Answered by Probe 4)
3. Does the operator's "slow test is the signal" claim hold at the full-suite level, or only per-namespace? (Answered by Probe 7)

## Validation Log

### Session 1 — 2026-06-22
**Trigger:** Post-creation validation of Plan A; user invoked `/ck:plan validate` after writing the 4-phase plan.
**Questions asked:** 4
**Tier:** Standard (4 phases, Fact Checker + Contract Verifier)
**Claims checked:** 25 | Verified: 23 | Failed: 1 | Unverified: 1

#### Verification Failures
1. [Fact Checker] `.claude/hooks/loop-surface-inject.cjs` — path not found. The Claude Code surface lacks this hook; only `.factory/hooks/loop-surface-inject.cjs` (Droid) exists. The Claude Code hooks live at `.claude/coordination/hooks/` (bash-coordination-gate, write-coordination-gate, inbound-state-gate, etc.) — different naming convention and different purpose.
2. [Unverified] `package.json:7` (per `meta-260620T2108Z-the-full-pnpm-test-glob-...`'s `evidence_code_ref`) vs `package.json:17` (actual `test` script line in current file) — pre-existing stale-ref from when the `--test-timeout=30000` was added in `plans/260621-2223-GH-2246-mcp-stdio-sdk-conversion/`. Not introduced by this plan.

#### Questions & Answers

1. **[Fact-checker follow-up]** How should Probe 1 handle the missing `.claude/hooks/loop-surface-inject.cjs` path?
   - Options: Update plan to reflect asymmetry (Recommended) | Rely on probe to discover
   - **Answer:** Update plan to reflect asymmetry
   - **Rationale:** the probe should investigate the actual Claude Code hooks, not waste cycles rediscovering the asymmetry.

2. **[Scope]** How should Plan A handle the pre-existing `package.json:7` → `package.json:17` drift?
   - Options: Note in report, defer to Plan B (Recommended) | Refresh evidence_code_ref now
   - **Answer:** Note in report, defer to Plan B
   - **Rationale:** Plan A is strictly read-only; refreshing evidence_code_ref is a meta-state mutation that belongs in Plan B.

3. **[Scope]** How should Probe 4 scope the consumer enumeration?
   - Options: Filter to executable consumers only (Recommended) | Enumerate all exhaustively
   - **Answer:** Filter to executable consumers only
   - **Rationale:** Class C (docs) and D (config) consumers are prefix-tolerant by inspection; only Class A (exit-code) and B (output-parsed) need per-row analysis. Keeps the <300 line budget intact.

4. **[Output format]** Where should Phase 1's "1-paragraph trace" live?
   - Options: Trace inline in the probe section (Recommended) | Trace as separate appendix file
   - **Answer:** Trace inline in the probe section
   - **Rationale:** matches the Output Format template already defined in Phase 1; the trace is short enough not to need a separate file.

#### Confirmed Decisions
- **D1:** Phase 1's Related Code Files will be updated to drop the failed path and add the actual Claude Code hook locations.
- **D2:** Phase 4 will add an explicit instruction to record the `package.json:7` → `package.json:17` drift in the report's "New constraints" section as a Plan B follow-up.
- **D3:** Phase 2 will be updated with an explicit enumeration policy: Class A/B exhaustive, Class C/D/E counted and noted as prefix-tolerant by inspection.
- **D4:** No change needed — the 1-paragraph trace format is already inline per Phase 1's existing Output Format.

#### Action Items
- [x] Update Phase 1 Related Code Files (D1)
- [x] Update Phase 2 to add the enumeration policy (D3)
- [x] Update Phase 4 to record the stale-ref drift (D2)
- [x] No update needed for D4 (already inline)

#### Impact on Phases
- **Phase 1:** Related Code Files section updated — removed `.claude/hooks/loop-surface-inject.cjs`, added `.claude/coordination/hooks/{bash,write,inbound-state}-coordination-gate.cjs` as the Claude Code hook surface to investigate.
- **Phase 2:** Added explicit enumeration policy: "Class A/B consumers enumerated exhaustively with full table; Class C/D/E consumers counted and noted as prefix-tolerant by inspection."
- **Phase 4:** Added Step 10 — "Record the `package.json:7` → `package.json:17` evidence_code_ref drift in the report's 'New constraints' section as a Plan B follow-up."

#### Prior Signal (Informational, Not a Failure)
The verification pass also confirmed:
- `tools/learning-loop-mastra/agent-manifest.json` declares only `mastra_*` workflow / meta_state / gate tools — **no `Bash` tool**.
- `tools/learning-loop-mastra/server.js` contains no `child_process`, `spawn`, `exec`, or `pnpm test` references.
- Prior: Probe 1's most likely answer is "Mastra Agent is off the pnpm test path; the test runner is invoked by Claude Code / Droid, not by the Mastra Agent."

This is consistent with the plan's existing success criterion: "If the answer is 'does not invoke pnpm test' (Probe 1 negative), record this as a new constraint for the brainstorm §7."

### Whole-Plan Consistency Sweep

- **Files reread:** plan.md, phase-01-probe-1-runtime-parity.md, phase-02-probe-4-pnpm-test-consumers.md, phase-03-probe-7-fingerprint-drift-dependency.md, phase-04-report-compile.md
- **Decision deltas checked:** 4 (D1-D4)
- **Reconciled stale references:** 1 (`.claude/hooks/loop-surface-inject.cjs` removed from Phase 1)
- **New constraints added:** 1 (`package.json:7` → `:17` drift, deferred to Plan B)
- **Unresolved contradictions:** 0
- **Sweep result:** clean. Plan A is consistent across all files. Phase 4's report assembly reflects the new instruction. Phase 1's success criteria correctly handle the "Mastra Agent off the path" outcome. Phase 2's enumeration policy is now explicit.
