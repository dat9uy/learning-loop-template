---
phase: 5
title: "Update Documentation"
status: pending
priority: P2
effort: "1.5h"
dependencies: [4]
---

# Phase 5: Update Documentation

## Overview

Update `docs/system-architecture.md` and other relevant docs to reflect the new minimal hook + MCP workflow layer architecture. Remove stale references to the old hook behavior.

## Requirements

- Functional: Architecture diagram shows minimal hook + MCP workflow layer
- Functional: Operator guide explains when MCP tools are called vs. hook enforcement
- Non-functional: No plan artifact references in code comments (per `review-audit-self-decision.md`)

## Related Code Files

- Modify: `docs/system-architecture.md`
- Modify: `docs/operator-guide.md` (if workflow section exists)
- Modify: `docs/code-standards.md` (if hook conventions documented)

## Implementation Steps

1. **Update `docs/system-architecture.md`**:
   - Rewrite "Outbound Gates" section to describe minimal hook (retained hard blocks for observations, schemas, build artifacts, unknown paths)
   - Document F12 fix with atomic marker writes
   - Add "MCP Workflow Layer" section with `notify_artifact_change` and `trigger_workflow`
   - Document workflow allowlist (only `node` under `tools/`)
   - Document stdio isolation (`{ stdio: "pipe", detached: true }`)
   - Document log rotation (10 MB rollover, 5 backups)
   - Update architecture diagram ASCII art
   - Document workflow registry location and format
2. **Update `docs/operator-guide.md`**:
   - Explain that agent calls MCP before writing non-critical paths
   - Document workflow auto-trigger behavior and failure notification (`.workflow-failures` marker)
   - Explain how to add new workflows to `workflows.json` (commands as arrays, not shell strings)
   - Document rollback procedure (`cp write-coordination-gate.cjs.bak write-coordination-gate.cjs`)
   - Warn that `observation-changed` workflow is not auto-triggered (hook blocks observation writes)
3. **Verify no stale references**: search for old `DOMAIN_RULES`, full hook logic, or 5-second extract-index claims
4. **Update README** if it mentions hook behavior or test commands

## Success Criteria

- [ ] `docs/system-architecture.md` accurately describes new architecture (retained hard blocks, F12 fix, workflow layer)
- [ ] Diagram shows minimal hook → MCP server → workflow trigger flow
- [ ] `docs/operator-guide.md` explains workflow registry editing, allowlist, rollback
- [ ] No references to removed hook behavior (e.g., full domain rules in hook)
- [ ] No references to 5-second extract-index guarantee
- [ ] No references to `observation-changed` auto-trigger

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Docs drift from actual implementation | Low | Read modified code files while writing docs |
| Over-documenting internal details | Low | Focus on operator-visible behavior, not code internals |
