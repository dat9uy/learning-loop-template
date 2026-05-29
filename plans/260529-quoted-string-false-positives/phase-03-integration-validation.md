---
phase: 3
title: "Integration Validation"
status: completed
priority: P1
effort: "1h"
dependencies: [2]
---

# Phase 3: Integration Validation

## Overview

Run the full test suite, verify the bash hook e2e behavior, and update documentation.

## Requirements

- **Functional:** All tests pass, no regressions.
- **Non-functional:** Documentation is updated to reflect the new behavior.

## Related Code Files

- **Read:** `tools/learning-loop-mcp/__tests__/cross-surface.test.js` (verify no stale tests)
- **Read:** `tools/learning-loop-mcp/__tests__/budget-option-c-e2e.test.js` (verify no stale tests)
- **Modify:** `docs/observation-vs-meta-state.md` or `docs/charter.md` (add note about quote stripping)

## Implementation Steps

1. **Run the full test suite**
   ```bash
   pnpm test
   ```
   Verify all 224+ tests pass.

2. **Run e2e cross-surface tests**
   Verify `cross-surface.test.js` and `budget-option-c-e2e.test.js` pass with the new behavior.
   Specifically verify the `ssh -t user@host "npm install"` test case from the red team findings.

3. **Update documentation**
   Add a note to `docs/observation-vs-meta-state.md` or `docs/charter.md` explaining that the bash gate strips message flags (`-m`, `--message`, `--title`, etc.) from commands before pattern matching. This prevents false positives for quoted strings in commit messages, PR titles, etc.

4. **Update `patterns.json` documentation** (if any adjacent docs reference patterns.json)
   Document that `patterns.json` now contains `message_flags` in addition to constraint patterns.

5. **Update the plan status**
   Mark all phases as completed.

## Success Criteria

- [ ] All 224+ tests pass
- [ ] `cross-surface.test.js` passes
- [ ] `budget-option-c-e2e.test.js` passes
- [ ] Documentation updated with note about message-flag stripping
- [ ] Plan status updated
