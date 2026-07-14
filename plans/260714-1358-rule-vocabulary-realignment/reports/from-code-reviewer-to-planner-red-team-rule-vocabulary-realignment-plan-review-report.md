# Red Team Review — Rule Pattern_type Vocabulary Realignment

**Plan:** `plans/260714-1358-rule-vocabulary-realignment/`
**Session:** 2026-07-14
**Reviewers:** 4 parallel (Security Adversary + Failure Mode Analyst + Assumption Destroyer + Scope & Complexity Critic)
**Tier:** Full (7 phases → all 4 verification roles active)
**Status:** Awaiting operator adjudication

## Findings — 15 (after dedup from 38 raw)

| # | Finding | Severity | Reviewer(s) | Disposition |
|---|---------|----------|-------------|-------------|
| 1 | Registry `description` field retains `Pattern type=consult-checklist` post-Phase 2 | Critical | FMA | Accept |
| 2 | `rule_count` acceptance criterion is structurally unsatisfiable (9, not 11) | Critical | FMA | Accept |
| 3 | `tools/learning-loop-mastra/core/README.md:68` missing from Phase 1 inventory | Critical | AD, SC | Accept |
| 4 | Phase 6 YAML `dependencies: [4, 7]` contradicts plan prose + multi-reviewer agreement | Critical | AD, SC, FMA | Accept |
| 5 | Phase 7 source-of-truth off-by-one (`meta-state.js:161` is `:162`; `meta-state.js:1277` is a comment) + missing `constants.js:32` second `TERMINAL_STATUSES` (includes `archived`) | High | AD | Accept (partial) |
| 6 | `rule.pattern` for `agent-checklist` rules has no schema validation — direct registry write = injection vector | High | SEC | Accept (as follow-up finding) |
| 7 | Phase 3 test-file renames are gold-plating — vitest uses glob discovery | High | SC | Pending (operator decision — flag, do not auto-reject) |
| 8 | H6 stale-warning window undetectable by Phase 5.4 verification gate | High | FMA | Accept |
| 9 | Late `meta-260714T1334Z` resolver writes old `consult-checklist` enum → new schema rejects | High | FMA, AD | Accept |
| 10 | Operator decision #2 perpetuates source report Inconsistency B (`agent + regex/glob` rules carry dead match specs) | High | SC | Pending (operator decision — flag, do not auto-reject) |
| 11 | Phase 7 §7.7 acknowledges doc/code mismatch but defers resolution (archive rule uses `isOpen`, not `status=reported`) | High | SEC, AD | Accept |
| 12 | Phase 6 has independent cause (assertinvariant report) but is bound to Phase 7 doc-edit pass — schedule as separate docs commit | High | SC | Accept |
| 13 | `promotedRulesCache` is per-process MCP server; atomic git commit does NOT restart the server — module cache holds old `gate-logic.js` | High | SEC | Accept |
| 14 | `core/patterns.json` "consult-checklist" key is dead code (gate-logic.js:28-32 builds regex from prose description) — rename perpetuates confusion | High | FMA | Accept |
| 15 | Plan header "12 rename targets in 9 files" understates actual scope (≥14 in 10+ files) | High | AD | Accept |

## Verification Summary

**Fact Checker (24 verified, 1 failed):**
- All 23 plan-cited file:line locations VERIFIED
- 1 FAILED: `docs.maxLoc (800)` does not exist as configured repo limit

**Flow Tracer:** 4 traced paths, 1 FAILED (Phase 5 §5.4 rule_count), 3 CONFIRMED

**Scope Auditor:** PASSED — no shared-state leaks; no duplicated state

**Contract Verifier:** PASSED with 1 omission (`core/README.md:68` not enumerated in Phase 1)

## Files Cited by Findings

- `/home/datguy/codingProjects/learning-loop-template/plans/260714-1358-rule-vocabulary-realignment/plan.md`
- `/home/datguy/codingProjects/learning-loop-template/plans/260714-1358-rule-vocabulary-realignment/phase-{01..07}-*.md`
- `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/core/README.md`
- `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/core/loop-introspect.js`
- `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/core/meta-state.js`
- `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/core/constants.js`
- `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/core/entry/rule.js`
- `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/core/gate-logic.js`
- `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/core/patterns.json`
- `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/tools/handlers/meta-state-promote-rule-tool.js`
- `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/tools/handlers/meta-state-resolve-tool.js`
- `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/tools/handlers/loop-describe-tool.js`
- `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/tools/handlers/meta-state-archive-tool.js`
- `/home/datguy/codingProjects/learning-loop-template/meta-state.jsonl`
- `/home/datguy/codingProjects/learning-loop-template/docs/loop-engine.md`
- `/home/datguy/codingProjects/learning-loop-template/docs/meta-state-lifecycle.md`