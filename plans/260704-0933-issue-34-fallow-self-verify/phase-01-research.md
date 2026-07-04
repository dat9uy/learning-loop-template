---
phase: 1
title: Research
status: completed
effort: ''
---

# Phase 1: Research

## Overview

Confirm the failure modes the finding describes are still reproducible on main, identify the minimum-viable wrapper surface, and confirm `meta_state_refresh_file_index` is reachable from CLI without operator mode.

## Implementation Steps

1. Locate `meta_state_refresh_file_index` in the MCP server; verify it accepts `{path}` and writes to `file-index.jsonl` without requiring OPERATOR_MODE.
2. Confirm the `fallow:gate` script invocation in `package.json` and verify the Istanbul coverage wiring (`coverage/coverage-final.json`).
3. Check `file-index.jsonl` for paths the finding cites (`buildInverseIndexes`, `buildRegistrySummary`).
4. Read docs/journals/260629-fallow-tools-v2-action-swap-shipped.md to confirm SARIF parity decisions for the local CLI invocation.
5. Confirm the absence of any existing wrapper script (`grep gate:self-verify`).
6. Decide: CLI wrapper via `pnpm exec node` is simplest; no `ck` or `gh` dependency required.

## Success Criteria

- [x] `meta_state_refresh_file_index` reachable from CLI without OPERATOR_MODE
- [x] `fallow:gate` script target confirmed
- [x] Coverage wiring documented
- [x] Existing-CLI-wrappers landscape confirmed clean
