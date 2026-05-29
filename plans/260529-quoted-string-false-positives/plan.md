---
title: "Strip Message Flags to Fix Quoted-String False Positives in Bash Gate"
description: "Fix the bash gate's pattern matching so it does not match constraint keywords inside quoted message flags (e.g., git commit -m 'fix pnpm add issue'). Use --tdd: add tests first, then implement."
status: pending
priority: P2
branch: "main"
tags: [gate, pattern-matching, false-positive, tdd]
blockedBy: []
blocks: []
created: "2026-05-29T17:17:52.058Z"
createdBy: "ck:plan"
source: skill
---

# Strip Message Flags to Fix Quoted-String False Positives in Bash Gate

## Overview

The bash gate's `matchConstraintPattern` function checks command strings against regex patterns without distinguishing between actual commands and text inside quoted strings. The `package-manager` pattern `\b(pip|npm|yarn|pnpm|uv)\s+(install|add|sync|bootstrap|setup)\b` matches `pnpm add` inside a `git commit -m "fix pnpm add issue"` message, causing the gate to block the commit as a package-manager command.

This plan implements Approach B from `plans/reports/brainstorm-260529-pattern-matching-quoted-strings.md`: strip only message flags (`-m`, `--message`, `--title`, `--description`, etc.) from command segments before pattern matching. This preserves the gate's ability to catch wrapper commands (`bash -c "docker run ubuntu"`) while removing the false positive for commands that embed non-executable text in messages.

## Background

From `plans/reports/brainstorm-260529-pattern-matching-quoted-strings.md`:

> The bash gate's `matchConstraintPattern` function checks command strings against regex patterns without distinguishing between actual commands and text inside quoted strings. This is a pre-existing issue separate from the budget escalation fix. It affects all constraint patterns, not just `package-manager`.

The gate splits on `;`, `&`, `|` and checks each segment. A segment like `git commit -m "fix pnpm add issue"` is checked against `\b(pip|npm|yarn|pnpm|uv)\s+(install|add|sync|bootstrap|setup)\b`, and `pnpm add` matches.

## Phases

| Phase | Name | Status | Effort |
|-------|------|--------|--------|
| 1 | [Tests-First](./phase-01-tests-first.md) | Completed | 1h |
| 2 | [Implementation](./phase-02-implementation.md) | Completed | 1h |
| 3 | [Integration Validation](./phase-03-integration-validation.md) | Completed | 1h |

## Dependencies

### Cross-Plan
- None. This is a targeted bug fix with no file overlap with active plans.

### Informed By
- `plans/reports/brainstorm-260529-pattern-matching-quoted-strings.md` — the brainstorm that identified this bug.
- `docs/observation-vs-meta-state.md` — the separation between gate (meta-level) and agent (domain-level).

## Risk Summary

| Risk | Severity | Mitigation |
|------|----------|------------|
| New message flag not in list | Medium | Conservative initial list; review periodically |
| Flag collision (e.g., `-t` for timeout vs title) | Low | `-t` omitted from flag list; `--title` used instead |
| Wrapper command regression | Low | Test cases explicitly cover `bash -c`, `python -c`, `ssh -t` |
| Strip all quoted strings by mistake | High | Code review: only message flags, not all quotes |
| Multi-word unquoted message values | Low | `git` requires quoting; test case documents behavior |
| `-body` (single dash) in flag list | Low | Removed; not a standard flag for any known CLI tool |

## Validation Log

### Verification Results
- **Tier:** Light (3 phases)
- **Claims checked:** 6
- **Verified:** 6 | **Failed:** 0 | **Unverified:** 0

#### Verified Claims
1. [Fact Checker] `gate-logic.js:52` — `matchConstraintPattern` exists and is exported
2. [Fact Checker] `patterns.json` — exists with constraint patterns
3. [Fact Checker] `bash-gate.js:68` — imports `matchConstraintPattern` and calls it
4. [Contract Verifier] `matchConstraintPattern` — 4 callers found: `bash-gate.js`, `gate-tool.js`, `core/index.js`, `gate-logic.js` (self)
5. [Fact Checker] `__tests__/gate-logic-budget.test.js` — exists, uses `makeGateDecision`
6. [Fact Checker] `__tests__/cross-surface.test.js` — exists with e2e bash gate tests

### Validation Decisions
1. `-t` omitted from flag list → confirmed (user prefers `--title` only)
2. Unquoted multi-word messages → confirmed (document behavior, skip one token only)
3. Flag list configurable in `patterns.json` → accepted (user wants it now)

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01-tests-first.md, phase-02-implementation.md, phase-03-integration-validation.md
- Decision deltas checked: 1 (configurable flag list)
- Reconciled stale references: 2 (phase-02 hardcoded → patterns.json, phase-03 documentation)
- Unresolved contradictions: 0

## Success Metrics

| Metric | Target |
|--------|--------|
| `git commit -m "fix pnpm add issue"` → `ok` | Yes |
| `bash -c "docker run ubuntu"` → `block` (docker) | Yes |
| `python -c "import docker"` → `block` (docker) | Yes |
| All 224+ tests pass | Yes |
| New test file covers false positives + wrapper commands | Yes |
| Flag list in `patterns.json` | Yes |
