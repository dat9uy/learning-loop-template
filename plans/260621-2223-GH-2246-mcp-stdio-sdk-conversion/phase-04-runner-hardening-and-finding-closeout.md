---
phase: 4
title: "Runner hardening and finding closeout"
status: pending
priority: P2
dependencies: [2, 3]
---

# Phase 4: Runner hardening and finding closeout

## Overview

Add a global test timeout so future hangs fail fast, and close the meta-state finding with the corrected root cause and evidence.

## Requirements

- Functional: any test hanging >30s is killed and reported as a failure instead of blocking pre-commit indefinitely.
- Functional: `meta-260621T1743Z` is updated with the confirmed root cause, corrected `evidence_test` path, and resolution evidence.

## Related Code Files

- Modify: `package.json`
- Mutate via MCP: `meta-260621T1743Z-the-full-pnpm-test-glob-fired-by-pre-commit-hook-package-jso`
- Optionally log: `meta_state_log_change` for the surface change (test transport layer).

## Implementation Steps

1. In `package.json`, append `--test-timeout=30000` to the `test` script.
2. Do **not** add it to `test:cold-session`; cold-session tests may legitimately run longer.
3. Patch the finding:
   - Update `description` with the confirmed root cause (hand-rolled parser + missing `notifications/initialized`, now fixed by SDK client).
   - Correct `evidence_test` to `.claude/coordination/__tests__/claude-code-mcp-loading.test.cjs`.
   - Add resolution note and mark `resolved` (or `active` pending final verification, depending on meta-state workflow).
4. Optionally file a `meta_state_log_change` entry documenting the migration from hand-rolled JSON-RPC to SDK client across 5 test files + 1 hook.

## Success Criteria

- [ ] `pnpm test` script includes `--test-timeout=30000`.
- [ ] Finding `meta-260621T1743Z` reflects the actual root cause and correct test path.
- [ ] Finding status moved toward resolution with evidence.

## Risk Assessment

- **Risk:** 30s timeout is too short for the full suite's slowest test. Mitigation: the timeout is per-test-file (Node `--test-isolation=process`), not per-suite; 30s is generous for a single test file.
- **Risk:** `--test-timeout` changes the operator's slow-test-as-signal. Mitigation: it only fails a single hung test file; the full suite still takes ~10 min and preserves the signal.
