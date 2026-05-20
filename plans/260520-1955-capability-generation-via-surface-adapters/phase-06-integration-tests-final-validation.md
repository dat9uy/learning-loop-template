---
phase: 6
title: "Integration Tests + Final Validation"
status: completed
priority: P1
effort: "1h"
dependencies: [5]
---

# Phase 6: Integration Tests + Final Validation

## Overview

Run integration tests against actual dev servers. Perform final validation of the entire pipeline: generation, validation, check, docs, and skill references.

## Requirements
- Functional: Integration test runs FastAPI adapter against running dev server
- Functional: Integration test runs TanStack adapter against source files (no server needed)
- Functional: End-to-end `pnpm check` passes
- Functional: Red-team review of generated records finds no issues
- Non-functional: Integration tests isolated from unit tests; can run independently

## Architecture

Integration test suite lives alongside unit tests but is gated behind an environment flag:
- `INTEGRATION=1 pnpm test` runs integration tests
- Default `pnpm test` skips integration tests (fast feedback)

CI can run integration tests after unit tests pass.

## Related Code Files
- Create: `tools/generate-capabilities/adapters/fastapi-adapter.integration.test.js`
- Create: `tools/generate-capabilities/adapters/tanstack-adapter.integration.test.js`

## Implementation Steps
1. Write integration test for FastAPI adapter:
   - Spawn dev server on dynamic port (port 0 → resolve actual port)
   - Poll `GET /health` until ready (max 10s, 200ms interval)
   - Run adapter against `http://localhost:{port}/openapi.json`
   - Assert 3 entries returned with correct `source` values
   - Assert domain grouping produces `reference` domain
   - Kill server in `finally` block; fail test if process leaks
2. Write integration test for TanStack adapter:
   - Run adapter against actual `product/web/src/router.tsx`
   - Assert 2 entries returned with correct `source` values
3. Run `pnpm check` end-to-end:
   - `pnpm generate:capabilities --dry-run`
   - `pnpm validate:records`
   - `pnpm test`
4. Red-team review:
   - Verify generated records contain no `source_refs`
   - Verify generated records are minimal
   - Verify lookup pattern doc has STOP guards
   - Verify no capability record infers dependency from filename
5. Fix any red-team findings

## Success Criteria
- [x] Integration tests pass against running FastAPI server
- [x] Integration tests pass against actual TanStack router files
- [x] `pnpm check` passes end-to-end
- [x] Red-team review finds zero unresolved issues
- [x] All 6 phase success criteria met
- [x] Plan marked complete

## Risk Assessment
| Risk | Mitigation |
|------|-----------|
| Dev server not running during integration test | Test starts server or skips with clear message; CI ensures server is up |
| Integration tests are flaky | Use fixed port, short timeout, retry once |
| Red-team finds issues requiring schema change | Phase 5 allows schema edits; this phase is the gate |

## Security Considerations
- Integration tests only hit localhost
- No external API calls during tests
- Verify no secrets in generated YAML output

## Next Steps
- Archive this plan
- Update `docs/development-roadmap.md` and `docs/project-changelog.md`
