---
phase: 4
title: "TanStack Reference Implementation"
status: pending
priority: P1
effort: "4h"
dependencies: [3]
---

# Phase 4: TanStack Reference Implementation

## Overview

Invoke `ck:tanstack` for scaffold and route infrastructure, and `ck:frontend-development` for React components. Both skills read the same inputs but write to disjoint paths. Frontend tests use a recorded backend response — no live backend during web tests.

## Requirements

- Functional: TanStack Start app with 2 routes — equity list table view and company detail view.
- Non-functional: Smoke tests render against recorded response. No live backend calls in web tests.

## Related Code Files

- Create: `product/web/package.json` (project init)
- Create: `product/web/app.config.ts`
- Create: `product/web/src/routes/reference/equity.tsx`
- Create: `product/web/src/routes/reference/company.$symbol.tsx`
- Create: `product/web/src/components/EquityTable.tsx`
- Create: `product/web/src/components/CompanyDetail.tsx`
- Create: `product/web/tests/smoke-reference.test.tsx`
- Create: `product/web/fixtures/fastapi-reference-response.json` (recorded backend response)
- Read: `records/capabilities/capability-tanstack-reference-render.yaml`
- Read: `records/capabilities/capability-fastapi-reference-rest.yaml`
- Read: `records/evidence/product-build/fastapi-reference-endpoints.md`

## Implementation Steps

1. Pre-flight: verify `product/api/.venv/bin/python -c 'import vnstock_data'` succeeds. If not, stop.
2. Read capability records for route/view mapping.
3. Read phase-03 evidence for endpoint metadata and sample response shape.
4. `ck:tanstack` writes scaffold:
   - Project init under `product/web/`
   - `app.config.ts`, router config, file-based routes
   - Route loaders that call FastAPI endpoints (or use recorded fixture in tests)
   - Server functions if needed for SSR data fetch
5. `ck:frontend-development` writes components:
   - `EquityTable` — data table for equity list
   - `CompanyDetail` — detail view for company info
   - Suspense boundaries and error handling
6. Record a sample backend response during phase 03 or at start of phase 04:
   - Save to `product/web/fixtures/fastapi-reference-response.json`
   - Contains only metadata + 1-2 sanitized rows (no real identifiers or values)
7. Write smoke tests using recorded fixture:
   - Render routes with fixture data
   - Assert table headers match expected columns
   - Assert detail view renders fields
8. Run web tests (`pnpm test` or equivalent in `product/web/`).
9. Run `pnpm validate:records` and `pnpm check`.

## Pre-Drafted Constraint Prompt

```text
Task: Implement the TanStack Start Reference slice.

Work context: /home/datguy/codingProjects/learning-loop-template

Read first:
- records/capabilities/capability-tanstack-reference-render.yaml
- records/capabilities/capability-fastapi-reference-rest.yaml
- records/evidence/product-build/fastapi-reference-endpoints.md

Pre-flight check (MUST pass before any code):
- Run: product/api/.venv/bin/python -c 'import vnstock_data'
- If this fails, STOP. Report: "Bootstrap missing. Run pnpm bootstrap:api and retry."
- Do NOT run scripts/install-vnstock.sh or any installer.

Skill split and write-path boundaries:

ck:tanstack owns (scaffold + infrastructure):
- product/web/package.json
- product/web/app.config.ts
- product/web/src/routes/ (all route files, route loaders, server functions)
- product/web/src/router.tsx
- product/web/index.html
- product/web/vite.config.ts or equivalent

ck:frontend-development owns (components + styling):
- product/web/src/components/ (React components: EquityTable, CompanyDetail)
- product/web/src/features/ (if feature-based organization is used)
- product/web/src/lib/ (shared utilities, hooks)
- Component-level styles (CSS modules, Tailwind, or MUI as appropriate)

Neither skill may write to the other's paths. If a component needs to be imported into a route file, the route file imports it; ck:tanstack may add import statements but not component implementation.

Goal:
- TanStack Start app with 2 routes: /reference/equity (table) and /reference/company/:symbol (detail).
- Route loaders fetch from FastAPI endpoints (or use fixtures in test mode).
- Components render data with Suspense boundaries.
- Smoke tests use recorded fixture; no live backend calls in tests.

Allowed write paths:
- product/web/src/routes/*.tsx
- product/web/src/components/*.tsx
- product/web/src/features/*.tsx
- product/web/src/lib/*.ts
- product/web/tests/*.test.tsx
- product/web/fixtures/*.json
- product/web/package.json
- product/web/app.config.ts
- product/web/vite.config.ts
- product/web/index.html
- product/web/tsconfig.json

Forbidden actions:
- Do NOT create or modify any file under records/.
- Do NOT create or modify any file under records/evidence/.
- Do NOT create or modify any file under records/capabilities/.
- Do NOT capture raw external data, credentials, or config contents.
- Do NOT make live backend calls in smoke tests.
- Do NOT use bare "capability" or "user" language.

Validation:
- Run web tests — all smoke tests must pass.
- Run pnpm validate:records and pnpm check — must pass (confirms no record edits).

Stop conditions:
- Pre-flight import check fails.
- Any test fails and cannot be fixed within skill context.
- Skill attempts to write outside allowed paths or to records/.
```

## Success Criteria

### Process Steps
- [x] Pre-flight import check passed.
- [x] Capability records and API evidence read.
- [x] TanStack Start scaffold created.
- [x] 2 route files with loaders created.
- [x] React components (EquityTable, CompanyDetail) created.
- [x] Recorded fixture saved under product/web/fixtures/.
- [x] Smoke tests pass using fixture.
- [x] `pnpm validate:records` and `pnpm check` pass.

### Experiment Outcome
- `supports` — both routes render correctly in smoke tests; no record files modified.

## Risk Assessment
- Risk: ck:tanstack and ck:frontend-development write to same file. Mitigation: explicit path split in prompt; review diff before phase 05.
- Risk: Frontend tests require live backend. Mitigation: fixture-based smoke tests; no live calls.
- Risk: Skill phase edits records. Mitigation: forbidden explicitly; validate after.

## Approval Gate
Operator approval required before phase 05. Review:
- Diff of `product/web/src/`.
- Confirm no files under `records/` were modified.
- Confirm fixture contains no raw data or credentials.
