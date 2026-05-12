---
phase: 1
title: "Baseline"
status: completed
priority: P1
effort: "15m"
dependencies: []
---

# Phase 1: Baseline

## Overview

Capture pre-swap `pnpm validate:records` and `pnpm check` output. Confirm `ajv` 8.20.0 already installed (uncommitted via `pnpm add ajv` during research phase). Freeze the regression baseline so Phase 5 can diff against it.

## Requirements

- Functional: `pnpm validate:records` exit 0 captured to ephemeral file.
- Functional: `pnpm check` exit 0 captured.
- Functional: `package.json` confirmed to include `"ajv": "^8.20.0"` in dependencies; `pnpm-lock.yaml` reflects the install.
- Non-functional: No record/schema/code edits in this phase.

## Architecture

Pure observation phase. No artifacts persist beyond the in-conversation capture (no log files committed).

## Related Code Files

- Read: `package.json`, `pnpm-lock.yaml` (verify ajv install).
- No modifications.

## Implementation Steps

1. `pnpm validate:records` — capture stdout/stderr/exit code. Expected: exit 0, `Validated 34 records.`
2. `pnpm check` — capture stdout/stderr/exit code. Expected: exit 0.
3. `grep '"ajv"' package.json` — confirm `"ajv": "^8.20.0"` present.
4. Record the baseline output mentally (or in plan notes) for Phase 5 diff.

## Success Criteria

- [ ] `pnpm validate:records` exit 0 with `Validated 34 records.` line present.
- [ ] `pnpm check` exit 0.
- [ ] `package.json` includes `"ajv": "^8.20.0"`.
- [ ] No file edits committed in this phase.

## Risk Assessment

- **Risk**: baseline is already red (validator fails). **Mitigation**: extremely unlikely — last commit `55511f5` is post-YAML-swap with documented green state. If red, abort and investigate before any AJV work.
- **Risk**: `ajv` install was reverted by accident between brainstorm and plan execution. **Mitigation**: step 3 confirms; if absent, run `pnpm add ajv` to restore.
