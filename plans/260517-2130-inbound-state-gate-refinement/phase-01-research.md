---
phase: 1
title: "Research"
status: pending
priority: P1
effort: "30m"
dependencies: []
---

# Phase 1: Research

## Overview

Verify the `UserPromptSubmit` hook behavior by examining the existing `simplify-gate.cjs` reference implementation and testing the hook format against Claude Code's actual behavior.

## Key Questions to Answer

1. What JSON fields does Claude Code send on stdin to `UserPromptSubmit` hooks?
2. Does `hookSpecificOutput.additionalContext` from `UserPromptSubmit` appear in the agent's context?
3. What happens when a `UserPromptSubmit` hook exits with code 2? Does it block the prompt?
4. Does the hook fire on every message, or only on certain types (e.g., not on `/clear`, `/help`)?
5. What is the timing: does the hook complete before the agent's reasoning loop starts?

## Design Decisions (from red-team review)

**Soft-only gate (F9):** The inbound gate is deliberately soft-only — it injects context via `additionalContext` and always exits 0. It never blocks prompts (no exit code 2). This is a conscious design choice: the gate warns the agent about stale observations but doesn't prevent the operator from proceeding. Phase 2 should NOT include blocking test cases unless the plan explicitly decides to add hard-blocking behavior.

**Known code defect — findProjectRoot dead branch (F7):** `inbound-state-gate.cjs:72-76` has a dead conditional branch. Both branches return `path.join(__dirname, '..', '..', '..')`. The `records/` existence check does nothing. This must be fixed as part of Phase 1 logic audit — either remove the dead branch or add a proper fallback.

## Implementation Steps

1. Read research report at `plans/reports/research-260517-2100-inbound-gate-platform-options.md` for documented hook format (F10: avoids external dependency on `~/.claude/hooks/simplify-gate.cjs`)
2. **Logic audit (F7):** Verify `inbound-state-gate.cjs` logic correctness — specifically:
   - Fix `findProjectRoot()` dead branch at lines 72-76 (both branches return identical path)
   - Verify all `process.exit()` calls match soft-only design (F9: exit 0 only, no exit 2)
   - Verify `writeOperatorMessageMarker()` ordering relative to staleness check (F1)
3. Read Claude Code docs on `UserPromptSubmit` hook event (if accessible)
4. Test hook with various inputs:
   - Normal message
   - Short message (< 10 chars)
   - Empty message
   - Message with special characters
   - Slash command (`/clear`, `/help`)
5. Test context injection:
   - Hook outputs `additionalContext` → verify agent sees it
   - Document that exit code 2 blocking is NOT in scope (soft-only gate)
6. **Produce concrete deliverable:** Write a test that pipes known JSON to the hook and verifies the output format matches expectations
7. Document findings in this phase file

## Success Criteria

- [ ] Exact stdin JSON schema documented (from research report, not external file)
- [ ] Context injection confirmed working or issues identified
- [ ] Soft-only design documented — exit code 2 blocking explicitly out of scope
- [ ] Edge cases (empty, short, slash commands) documented
- [ ] Any mismatches between our implementation and actual behavior identified
- [ ] `findProjectRoot()` dead branch fixed (F7)
- [ ] Concrete deliverable: passing test that verifies hook stdin/output format

## Risk Assessment

- **Risk:** `additionalContext` placement may not be where we expect
  - **Mitigation:** Test with a distinctive string and grep for it in agent output
- **Risk:** Hook may not fire on all message types
  - **Mitigation:** Test with various message formats
