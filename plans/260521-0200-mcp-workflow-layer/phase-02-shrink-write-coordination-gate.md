---
phase: 2
title: "Shrink Write Coordination Gate"
status: completed
priority: P1
effort: "3h"
dependencies: [1]
---

# Phase 2: Shrink Write Coordination Gate

## Overview

Replace the current `write-coordination-gate.cjs` (~120 lines) with a minimal safety net (~50 lines) that enforces only unconditional hard blocks. Move all policy logic (domain rules, staleness for non-critical paths, budget checks) to the MCP server which the agent calls voluntarily.

## Requirements

- Functional: Hook blocks `records/observations/**`, `schemas/**`, and enforces evidence write-path observation
- Functional: Hook allows everything else; agent calls MCP `check_gate` for policy decisions
- Non-functional: Hook < 70 lines; exit 2 on block; exit 0 on allow

## Architecture

```
PreToolUse (Edit/Write)
       |
       v
minimal-write-gate.cjs
  - records/observations/** → block (exit 2)
  - records/evidence/** → check write-path obs locally → block/escalate/allow
  - schemas/** → block (exit 2)
  - node_modules/**, dist/**, build/** → block (exit 2)
  - catch-all ** → block (exit 2)
  - docs/**, plans/**, tools/**, .claude/** → allow (exit 0)
       |
       v
Agent calls MCP check_gate for policy + notify_artifact_change for workflow
```

## Related Code Files

- Modify: `.claude/coordination/hooks/write-coordination-gate.cjs`
- Modify: `.claude/coordination/hooks/bash-coordination-gate.cjs`
- Read for context: `tools/constraint-gate/gate-logic.js` (evaluateWritePath)

## Implementation Steps

1. **Prerequisite: Fix F12 race condition** in `inbound-state-gate.cjs`: replace `fs.writeFileSync` for `.last-operator-message` with atomic write (temp file + `renameSync`). Verify no regression in inbound gate tests.
2. **Backup current hook** to `write-coordination-gate.cjs.bak` — keep until one full production cycle validates the minimal hook (do NOT delete in Phase 5)
3. **Document rollback procedure** in plan and in code comment: `cp write-coordination-gate.cjs.bak write-coordination-gate.cjs` restores previous gate
4. **Write minimal hook** keeping only:
   - `globMatch` and `readObservations` imports from `gate-utils.cjs`
   - Unconditional block for `records/observations/**`
   - Evidence write-path check (active observation + staleness)
   - Unconditional block for `schemas/**`
   - Unconditional blocks for `node_modules/**`, `dist/**`, `build/**`
   - Catch-all `**` block for unknown paths
   - Allow `docs/**`, `plans/**`, `tools/**`, `.claude/**`, `product/**`
5. **Remove from hook**:
   - Full `DOMAIN_RULES` array (replaced by explicit allow/block list above)
   - Redundant per-path allow rules (consolidated into explicit list)
6. **Refactor `bash-coordination-gate.cjs`**:
   - Keep constraint pattern matching + observation/budget checks (these ARE hard blocks)
   - Keep path-write detection for `records/observations/**` and `records/evidence/**`
   - Extract shared utility functions into `lib/gate-utils.cjs` if duplication exists
   - Do NOT set an arbitrary line-count target; maintainability > line count
7. **Run tests from Phase 1** against new hook
8. **Update or retire existing hook tests** (`write-coordination-gate.test.cjs`, `bash-coordination-gate.test.cjs`) to match new behavior
9. **Fix any regressions** until all tests pass

## Success Criteria

- [ ] `write-coordination-gate.cjs` retains hard blocks for observations, schemas, build artifacts, and unknown paths
- [ ] `bash-coordination-gate.cjs` keeps all constraint/budget/observation checks; no arbitrary line-count target
- [ ] All Phase 1 tests pass
- [ ] Existing `server.test.js` and `gate-logic.test.js` still pass
- [ ] Existing hook tests updated or retired to match new behavior
- [ ] `records/observations/**` still blocks unconditionally
- [ ] `schemas/**` still blocks unconditionally
- [ ] `node_modules/**`, `dist/**`, `build/**` still block unconditionally
- [ ] Unknown paths (`**`) still block unconditionally
- [ ] Evidence write-path still requires active observation
- [ ] Rollback procedure documented and `.bak` retained until validation

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Agent forgets to call MCP before writing to docs/plans | Medium | Inbound gate still warns on stale observations; agent trained to check gate |
| Removing domain rules creates unintended allow paths | Low | Keep all block rules locally; only consolidate allow rules |
| Bash gate and write gate diverge further | Low | Both keep same unconditional blocks; policy divergence is acceptable since MCP is primary |
| F12 race condition causes missed escalation | Medium | Fix F12 with atomic writes before shrinking hook |
| No rollback if minimal hook fails | High | Keep `.bak` until validation; document one-command rollback |
| Backup file deleted too early | Medium | Do NOT delete `.bak` in Phase 5; schedule deletion after production validation |
