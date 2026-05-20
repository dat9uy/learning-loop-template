---
phase: 4
title: "Integration and Testing"
status: pending
priority: P1
effort: "1.5h"
dependencies: [2, 3]
---

# Phase 4: Integration and Testing

## Overview

Run the full test suite: backend unit tests, frontend TypeScript compile, record validation, and manual end-to-end smoke test. Ensure the fundamental capability integrates cleanly with the existing reference build.

## Requirements

- Functional:
  - All backend tests pass (reference + fundamental)
  - Frontend builds without TypeScript errors
  - Record validation passes (`pnpm validate:records`)
  - End-to-end smoke: dev API + dev web show fundamental data for VIC
- Non-functional:
  - No regression in reference endpoints
  - Commit messages use conventional format

## Architecture

No new architecture. This phase validates the integration of Phase 2 + Phase 3.

## Related Code Files

- Read: `product/api/tests/test_fundamental.py`
- Read: `product/api/tests/test_reference.py`
- Read: `product/web/tests/smoke-reference.test.tsx`
- Create: `product/web/tests/smoke-fundamental.test.tsx` (optional, or extend smoke)

## Implementation Steps

1. **Run backend tests**
   ```bash
   cd product/api && python -m pytest tests/test_fundamental.py -v
   cd product/api && python -m pytest tests/ -v
   ```

2. **Run frontend type check / build**
   ```bash
   cd product/web && npx tsc --noEmit
   cd product/web && pnpm build
   ```

3. **Run record validation**
   ```bash
   pnpm validate:records
   pnpm check
   ```

4. **Manual smoke test (operator-gated, requires live gate)**
   - Terminal 1: `VNSTOCK_FUNDAMENTAL_LIVE_GATE=approved pnpm dev:api`
   - Terminal 2: `pnpm dev:web`
   - Browser: navigate to `http://localhost:5173/fundamental/VIC`
   - Verify all 4 tabs load data
   - Verify `http://localhost:8000/fundamental/income/VIC?limit=4` returns JSON

5. **Capture evidence** from smoke test to `records/evidence/vnstock-data/`
   - Screenshot or curl output saved as evidence
   - `## Findings` section with `[fundamental-product]` assertions

6. **Run `pnpm extract:index`** to regenerate index entries from new evidence

## Success Criteria

- [ ] `pytest tests/` passes (all tests green)
- [ ] `npx tsc --noEmit` passes in `product/web`
- [ ] `pnpm build` succeeds in `product/web`
- [ ] `pnpm validate:records` passes
- [ ] Manual smoke test shows data in all 4 tabs
- [ ] Evidence file written and indexed

## Risk Assessment

- **Live gate not available for smoke test**: Document in evidence that smoke test was deferred. Unit tests provide coverage.
- **Record validation fails due to new evidence format**: Fix frontmatter or `## Findings` syntax before proceeding.
- **Reference test regression**: Check `test_reference.py` still passes after main.py changes.
