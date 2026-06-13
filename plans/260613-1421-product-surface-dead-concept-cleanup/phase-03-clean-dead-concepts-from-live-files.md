---
phase: 3
title: "Clean Dead Concepts from Live Files"
status: pending
priority: P2
effort: "15min"
dependencies: [1, 2]
---

# Phase 3: Clean Dead Concepts from Live Files

## Overview
Remove dead product-surface functions from 2 live files. These files have mixed concerns — live meta-surface code coexists with dead product-surface code.

## Related Code Files
- Modify: `tools/learning-loop-mcp/core/gate-logic.js`
- Modify: `tools/learning-loop-mcp/core/record-validation-rules.js`

## Implementation Steps

### gate-logic.js
1. Remove `checkDecisionRecords` function (lines 316-345) — exported but only imported by the now-deleted `workflow-product-build-tool.js`
2. Remove `hasDecisionRecords` private function (lines 389-393) — calls `checkDecisionRecords` but is itself never called by anything

### record-validation-rules.js
3. Remove `import { validateClaimVerification } from "./claim-verification-rules.js"` (line 5) — file deleted in Phase 1
4. Remove `validateCandidateConsumption` function (lines 49-117) — validates product-surface candidate assertion consumption, dead concept
5. Remove the call `validateCandidateConsumption(records, errors)` from `validateRecords` (line 167)
6. Remove the call `errors.push(...validateClaimVerification(records))` from `validateRecords` (line 168)
7. Run `pnpm test` — all tests should pass

## Success Criteria
- [ ] `checkDecisionRecords` removed from gate-logic.js
- [ ] `hasDecisionRecords` removed from gate-logic.js
- [ ] `validateClaimVerification` import and call removed from record-validation-rules.js
- [ ] `validateCandidateConsumption` function and call removed from record-validation-rules.js
- [ ] `pnpm test` passes with 0 failures
- [ ] MCP server starts without errors
- [ ] Hooks execute without errors

## Risk Assessment
- **gate-logic.js:** `checkDecisionRecords` is exported but has zero live importers. Safe to remove.
- **record-validation-rules.js:** `validateRecords` is still imported by `source-ref-validator.js`. Removing the dead internal calls does not change the function signature or its live behavior (source-ref validation, schema validation, outside-reference validation).
