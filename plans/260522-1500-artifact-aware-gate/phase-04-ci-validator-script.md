---
phase: 4
title: "CI Validator Script"
status: pending
priority: P2
effort: "3h"
dependencies: [1, 3]
---

# Phase 4: CI Validator Script

## Overview

Build `tools/validate-plan-loop.js` — a post-facto validator that scans `plans/**/plan.md` files for product-build compliance. It checks: (a) Phase 0 loop pre-flight exists, (b) declared surfaces have decision records, (c) no product code plans lack decision coverage. Integrates into `pnpm check` as a tertiary safety net.

## Requirements

- **Functional**: Scan all `plans/**/plan.md` files. Detect `tags: [product-build]`. Check Phase 0 presence. Verify decision records for declared surfaces. Report violations with file paths and specific errors.
- **Non-functional**: Exit 0 on clean scan, exit 1 on violations. Fast (< 1s for 50 plans). Reuses frontmatter parser from gate (phase 1). No side effects (read-only).

## Architecture

```
tools/validate-plan-loop.js
  ├── scanPlans(plansDir)
  │     └── For each plan.md:
  │           ├── extractFrontmatter()
  │           ├── if hasProductBuildTag:
  │           │     ├── checkPhase0Present(content)
  │           │     ├── extractSurfaces(frontmatter)
  │           │     ├── checkDecisionRecords(surfaces)
  │           │     └── collect violations
  │           └── else: skip
  ├── reportViolations(violations)
  │     └── Print structured report to stdout
  └── exit(violations.length > 0 ? 1 : 0)
```

## Related Code Files

- **Create**: `tools/validate-plan-loop/validate-plan-loop.js` — main validator
- **Create**: `tools/validate-plan-loop/validate-plan-loop.test.js` — TDD test suite
- **Modify**: `package.json` — add `"validate:plan-loop": "node tools/validate-plan-loop/validate-plan-loop.js"` script
- **Modify**: `package.json` — add to `pnpm check` chain if appropriate

## Implementation Steps

1. **Write tests first** (`validate-plan-loop.test.js`):
   - Test: valid product-build plan with Phase 0 and decision records → pass
   - Test: product-build plan missing Phase 0 → fail, error "Missing Phase 0"
   - Test: product-build plan with Phase 0 but missing decision records → fail, error "Missing decision records for surface: X"
   - Test: non-product plan → pass (ignored)
   - Test: malformed plan frontmatter → pass (fail-open, log warning)
   - Test: empty plans directory → pass
   - Test: plan with multiple surfaces, one missing decision → fail, list only missing surface
   - Test: completed (`status: completed`) product-build plan without Phase 0 → pass (grandfathered)

2. **Create validator script**:
   - Reuse `frontmatter-reader.cjs` from phase 1 (copy or require from hooks lib)
   - `scanPlans(dir)`:
     - `globSync('plans/**/plan.md', { cwd: projectRoot })`
     - For each file: read content, extract frontmatter
     - Skip plans with `status: completed` or `status: cancelled` (grandfather existing plans)
     - If `tags` includes `product-build`:
       - Check for `## Phase 0` or `Phase 0:` in content
       - Extract surfaces from frontmatter `surfaces` field or Phase 0 text
       - Check decision records for each surface
       - Record violations
   - `reportViolations(violations)`:
     - Group by plan file
     - Print: `plans/.../plan.md: <error>`
     - Summary: `X plans checked, Y violations found`

3. **Wire into package.json**:
   - Add script: `"validate:plan-loop": "node tools/validate-plan-loop/validate-plan-loop.js"`
   - Optionally add to existing `"check"` or `"validate:records"` chain
   - Document in README quick commands

4. **Run tests**: `node validate-plan-loop.test.js`

## Success Criteria

- [ ] All 8 test cases pass
- [ ] Validator detects missing Phase 0 in product-build plans
- [ ] Validator detects missing decision records for declared surfaces
- [ ] Validator ignores non-product plans
- [ ] Validator grandfather completed plans (no retroactive enforcement)
- [ ] Validator fail-open on malformed frontmatter
- [ ] Exit code 0 on clean scan, 1 on violations
- [ ] Wired into `package.json` scripts
- [ ] Runs in < 1s on current repo (currently ~30 plans)

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Validator duplicates gate logic | Reuse shared `frontmatter-reader.cjs`; extract common utilities to hooks/lib |
| Validator produces false positives | Extensive test coverage; fail-open on ambiguous cases |
| Operator never runs validator | Wire into `pnpm check` chain; CI runs it automatically |
| Performance degrades with many plans | Only reads frontmatter (~2KB per file); glob is fast |
