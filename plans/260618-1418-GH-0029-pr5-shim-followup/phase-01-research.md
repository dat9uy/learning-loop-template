---
phase: 1
title: "Research — Q3 refutation + fix strategy analysis"
status: completed
priority: P1
effort: "1h (DONE)"
dependencies: []
---

# Phase 1: Research

## Overview

Confirm/refute Q3 (override bypass) and analyze 3 candidate fix strategies. **Already completed** by the two parallel researcher reports launched during planning. This phase is the input to phase-02; no further work is needed.

## Implementation Steps

1. **Researcher A: confirm Q3 + analyze 3 strategies.** Output: `plans/reports/researcher-A-260618-1418-GH-0029-pr5-shim-fix-strategies-report.md`. Verdict: Q3 REFUTED, no fix needed, comment + test recommended.

2. **Researcher B: design e2e parity test.** Output: `plans/reports/researcher-B-260618-1418-e2e-parity-test-design-report.md`. Verdict: design concrete, test would pass on current code (independently confirms Q3 refutation).

3. **Cross-check: both researchers agree Q3 is refuted by the live e2e probe.** 39 of 41 manifest tools register (2 skipped, including `mastra_trigger_workflow`); all 39 return real JSON Schemas via `tools/list`. The override propagates through `MCPServer.convertSchema` → `standardSchemaToJSONSchema` → `~standard.jsonSchema.input` → `process` + `finalize`.

## Success Criteria

- [x] Researcher A report written + empirical probe at `plans/260618-1418-GH-0029-pr5-shim-followup/e2e-tools-list-parity-probe.cjs` (confirmed Q3 refuted)
- [x] Researcher B report written + design at `tools/learning-loop-mastra/__tests__/mcp-tools-list-parity.test.js` (independently confirms Q3 refutation)
- [x] Recommendation: comment fix + regression test (no shim refactor)
- [x] 3 fix strategies evaluated; A and B rejected, C already done

## Research Artifacts

- `plans/reports/researcher-A-260618-1418-GH-0029-pr5-shim-fix-strategies-report.md` (DONE)
- `plans/reports/researcher-B-260618-1418-e2e-parity-test-design-report.md` (DONE_WITH_CONCERNS)
- `plans/260618-1418-GH-0029-pr5-shim-followup/e2e-tools-list-parity-probe.cjs` (researcher A's probe)
- `plans/260618-1418-GH-0029-pr5-shim-followup/e2e-tools-list-output.json` (39 tools, all good)
- `/tmp/probe-e2e/probe-all-tools.test.js` (researcher B's aggregate probe)

## Key Findings

| Item | Verdict | Confidence |
|------|---------|-----------|
| Q3 (override bypass) | REFUTED — all 39 tools return correct inputSchema | 95% (e2e verified) |
| Strategy A (`jsonSchema()` helper) | NOT AVAILABLE in @mastra/core/utils | 99% (read full utils.d.ts) |
| Strategy B (`toStandardSchema` wrap) | NOT NEEDED — current path works | 90% (source verified) |
| Strategy C (pin zod 4.4.x) | ALREADY DONE in package.json:48 | 99% |
| Comment at create-loop-tool.js:35-37 | MISLEADING — needs update | 95% (researcher A confirmed) |
| Migration shim correctness | WORKS IN PRODUCTION | 95% (e2e probe) |
