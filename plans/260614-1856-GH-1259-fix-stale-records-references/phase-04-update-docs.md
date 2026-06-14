---
phase: 4
title: "Update docs"
status: pending
priority: P2
effort: "1h"
dependencies: [2]
---

# Phase 4: Update docs

## Overview

Update documentation that still states observations live in `records/observations/*.yaml`. Keep references that remain accurate (write blocking, archive paths, cache paths).

## Related Code Files

- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `docs/system-architecture.md`
- Modify: `docs/record-system-architecture.md`
- Modify: `docs/operator-guide.md`
- Modify: `docs/philosophy.md`
- Modify: `tools/learning-loop-mcp/references/prompt-blueprints-state-gated.md`
- Modify: `tools/learning-loop-mcp/references/resource-budget-rules.md`

## Implementation Steps

1. Update `README.md` line 50 and 78: replace "records/observations" with "runtime-state.jsonl" for observation state.
2. Update `AGENTS.md`: clarify that `records/observations/` is archived/blocked and mutable operator state lives in `runtime-state.jsonl`.
3. Update `docs/system-architecture.md` lines referencing `records/observations/`: describe runtime-state sidecar as the source of truth for constraint state.
4. Update `docs/record-system-architecture.md`: mark `records/observations/` as archived/legacy.
5. Update `docs/operator-guide.md`: replace observation record instructions with runtime-state instructions.
6. Update `tools/learning-loop-mcp/references/prompt-blueprints-state-gated.md` and `resource-budget-rules.md`: replace `records/observations/*-resource-budget.yaml` with `runtime-state.jsonl` `budget-state` entries.
7. Do NOT modify docs that correctly describe `records/**` write blocking or `records/_unbound/` archive paths.

## Success Criteria

- [ ] No active docs instruct agents to read or write `records/observations/*.yaml` for constraint state.
- [ ] `docs/project-changelog.md` receives an entry for this closeout fix.
