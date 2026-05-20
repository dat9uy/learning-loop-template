---
phase: 4
title: "Update Tests"
status: completed
priority: P1
effort: "3h"
dependencies: [2, 3]
---

# Phase 4: Update Tests

## Overview

Update and extend the test suite for write gate, bash gate, and gate-utils to cover observation-based path approval. Follow TDD structure: write tests first (or alongside implementation), then verify.

## Requirements

- Functional: All existing tests continue to pass.
- Functional: New tests cover write-path observations for write gate.
- Functional: New tests cover path-write detection for bash gate.
- Functional: New tests cover `pathMatchesObservation` helper.
- Functional: Integration test verifies end-to-end write → observation → allow flow.
- Non-functional: Test execution time under 5s total.

## Architecture

### Test File Changes

| File | Changes |
|------|---------|
| `gate-utils.test.cjs` | Add `pathMatchesObservation` test group |
| `write-coordination-gate.test.cjs` | Add observation-allow, observation-stale, observation-missing tests |
| `bash-coordination-gate.test.cjs` | Add path-write detection tests, heredoc tests, observation-allow/stale tests |
| `gate-integration.test.cjs` | Add end-to-end: mock observation → write gate allow → bash gate allow |

### Test Helper Strategy

Use the same temp-project pattern as `gate-integration.test.cjs`:
- Create temp dir with `records/observations/`.
- Write mock observation YAMLs.
- Set `GATE_ROOT` and `GATE_MARKER_PATH` env vars.
- Run hook via `spawnSync`.
- Clean up temp dir.

### Mock Observation YAML

```yaml
id: obs-write-evidence-001
constraint_type: write-path
constraint: records-evidence
status: active
updated_at: "2026-05-20T22:33:00Z"
description: Operator approved evidence file creation
```

## Related Code Files

- Modify: `.claude/coordination/__tests__/gate-utils.test.cjs`
- Modify: `.claude/coordination/__tests__/write-coordination-gate.test.cjs`
- Modify: `.claude/coordination/__tests__/bash-coordination-gate.test.cjs`
- Modify: `.claude/coordination/__tests__/gate-integration.test.cjs`
- Read: `.claude/coordination/__tests__/gate-integration.test.cjs` line 242 (async IIFE exit trap)

## Implementation Steps

### gate-utils.test.cjs

1. Add `describe('pathMatchesObservation')` block.
2. Test cases:
   - Matching `records-evidence` to `records/evidence/foo.md` → true
   - Missing constraint → false
   - Wrong constraint_type → false
   - Archived status → false
   - `records/observations/**` at helper level → false (helper blocks unconditionally)

### write-coordination-gate.test.cjs

1. Add helper functions: `createTempProject`, `writeObservation`, `clearMarker`, `setMarker`.
2. Test cases:
   - Write `records/evidence/foo.md` with fresh observation → exit 0
   - Write `records/evidence/foo.md` with stale observation → exit 2, `inbound_gate: true`
   - Write `records/evidence/foo.md` with no observation → exit 2, `matched_rule: 'records/evidence/**'`
   - Write `records/observations/foo.yaml` with fresh observation → exit 2 (unconditional block)
   - Write `records/claims/foo.yaml` with no observation → exit 0 (general records allow)
   - Performance < 50ms with observations

### bash-coordination-gate.test.cjs

1. Add helper functions: `createTempProject`, `writeObservation`, etc.
2. Test cases:
   - `cat <<'EOF' > records/evidence/foo.md` with no observation → exit 2, `observation_required: true`
   - `cat <<'EOF' > records/evidence/foo.md` with fresh observation → exit 0
   - `cat <<'EOF' > records/evidence/foo.md` with stale observation → exit 2, `inbound_gate: true`
   - `echo x | tee records/evidence/foo.md` with fresh observation → exit 0
   - `echo x > "./records/evidence/foo.md"` with fresh observation → allowed (quote stripping)
   - `echo x > records/observations/foo.yaml` with fresh observation → blocked unconditionally
   - `docker run ubuntu` → exit 2 (existing logic, no regression)
   - `ls -la` → exit 0 (unaffected)
   - `cat <<'EOF' > docs/foo.md` → exit 0 (non-records unaffected)
   - `cat <<'EOF' > records/claims/foo.yaml` → exit 0 (other records/** paths unaffected)
   - Performance < 100ms

### gate-integration.test.cjs

1. Add `runWriteGate(filePath)` helper (before the async IIFE that calls `process.exit` at line 242):
   - Spawns `write-coordination-gate.cjs` with `tool_name: 'Write'` and `file_path`.
   - Returns `{ exitCode, stdout, stderr }`.
2. Add new integration test block BEFORE the terminal async IIFE:
   - Create temp project.
   - Write `write-path` observation for `records-evidence`.
   - Test write gate allows `Edit records/evidence/foo.md`.
   - Test bash gate allows `Bash cat <<'EOF' > records/evidence/foo.md`.
   - Write stale marker.
   - Test both gates escalate.
   - Clean up.

## Success Criteria

- [ ] `gate-utils.test.cjs` passes with new `pathMatchesObservation` tests.
- [ ] `write-coordination-gate.test.cjs` passes with all existing + new tests.
- [ ] `bash-coordination-gate.test.cjs` passes with all existing + new tests.
- [ ] `gate-integration.test.cjs` passes with new end-to-end tests.
- [ ] `inbound-state-gate.test.cjs` passes (no changes expected).
- [ ] Total test suite execution under 5s.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Temp dir cleanup failures on test abort | Low | Low | Use `try/finally` in every test. |
| Test env var leakage between tests | Medium | Medium | Unset `GATE_ROOT` and `GATE_MARKER_PATH` in `finally` blocks. |
| Integration test requires MCP server startup | Low | Medium | Skip MCP portion if SDK import fails; test hook behavior independently. |

## Next Steps

- Phase 5: Update Docs.
