---
phase: 4
title: "Fallow Health Triage"
status: pending
priority: P2
effort: "15min"
dependencies: [1, 2, 3]
---

# Phase 4: Fallow Health Triage

## Overview

Triage the 218 fallow health findings after dead-code deletion and reference cleanup. Phases 1-3 eliminate findings for deleted files. This phase categorizes the remaining findings.

## Triage Categories

### Auto-Resolved by Phase 1 (dead code deleted)

~23 findings disappear once the dead files are deleted. These include all functions in `extract-index/`, `list-verified.js`, and `search-index.js`.

### Suppress (legitimate complexity, not worth refactoring)

**Requires evidence:** Before suppressing, verify with `git log --oneline --follow -p -- <file> | head -50` that the function has low change frequency.

- `gate-logic.js:425 isSafeRegexPattern` (cc=34) — regex safety checker, complexity inherent to the domain
- `gate-logic.js:80 splitSegments` (cc=18) — URL/path parsing
- `gate-logic.js:701 applyPromotedRules` (cc=18) — rule evaluation engine
- `gate-logic.js:641 checkResolutionEvidence` (cc=13) — evidence validation
- `tool-registry.js:77 coerceParamsToSchema` (cc=24) — type coercion, complexity inherent
- `record-validation-rules.js:138 validateSourceRefs` (cc=24) — multi-format validation

**Note on `meta-state.js:450`:** This is an anonymous arrow function. Identify the enclosing named function before deciding to suppress.

### Refactor (high complexity, frequently changed, low coverage)

Document as a separate future plan:
- `meta-state-list-tool.js:85 handler` (cc=47, cog=65) — highest complexity
- `loop-introspect.js:409 summarize` (cc=37) — massive switch/if chain
- `loop-introspect.js:259 buildInverseIndexes` (cc=21) — nested loops
- `meta-state-relationships-tool.js:23 handler` (cc=33) — deeply nested conditionals
- `budget-estimator.js:43 stripComments` (cc=28) — regex-heavy

### Skip (test files)

Test files with high complexity are acceptable — skip.

## Implementation Steps

1. Run `fallow health --format json` to get updated findings count after Phases 1-3
2. For each "Suppress" candidate, verify low change frequency via git log
3. Add `// fallow-ignore-next-line complexity` comments to verified suppress targets
4. Document refactor candidates in a report file
5. Verify fallow health count decreased

## Success Criteria

- [ ] ~23 dead-code findings auto-resolved
- [ ] 6 functions suppressed with fallow-ignore (after git-log verification)
- [ ] Refactor candidates documented
- [ ] Fallow health critical count reduced
