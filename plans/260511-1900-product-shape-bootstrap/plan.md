---
title: "Product Shape Bootstrap"
description: "Add dev scripts + landing route + symbol-search UI + nav links so operator can run the FastAPI Reference Build end-to-end and inspect the product shape. Records-light: one walkthrough experiment, one tripwire meta-evidence file."
status: completed
priority: P2
branch: "main"
tags: [product-build, dx, operator-walkthrough, records-light, follow-up]
blockedBy: []
blocks: []
created: "2026-05-11T19:00:00+07:00"
createdBy: "ck:plan"
source: skill
---

# Product Shape Bootstrap

## Overview

Parent plan `260511-0030-fastapi-reference-build` shipped 3 FastAPI endpoints + 2 TanStack routes with passing contract tests. This iteration adds the run-substrate gaps blocking operator inspection: dev scripts, a `/` landing route, symbol-search UI surfacing the phase-2b `/reference/search` endpoint, and `<Link>` navigation between equity list and company detail. After bootstrap, operator walks the product and authors a single experiment record (no new claim shape, no new dimension, no schema work). Tripwire meta-evidence file deferred-defers product-side learning-loop conventions until N≥3 product slices.

Adopts Approach B (records-light) from `plans/reports/brainstorm-260511-1900-product-shape-bootstrap.md`.

## Phases

| Phase | Name | Status | Type |
|-------|------|--------|------|
| 1 | [Bootstrap and UI Surfaces](./phase-01-bootstrap-and-ui-surfaces.md) | Completed | skill |
| 2 | [Operator Walkthrough and Records](./phase-02-operator-walkthrough-and-records.md) | Completed | loop |

## Dependencies

- `plans/260511-0030-fastapi-reference-build/` (completed) — product code under `product/api/` and `product/web/` ships the surfaces this plan bootstraps.
- `product/api/.venv` exists and `vnstock_data` imports cleanly.
- `product/web/node_modules` installed.
- Existing claims `claim-product-fastapi-reference`, `claim-product-tanstack-reference-view` validated.
- `records/evidence/meta/` exists for the tripwire file.

## Key Constraints

- Phase 1 (skill): may write product code + scripts; **must not** edit any file under `records/`.
- Phase 2 (loop): may author records + evidence + meta files; **must not** edit any file under `product/api/src/` or `product/web/src/`.
- No new schema fields, no new claim shape, no new verification dimension. Existing `runtime` dimension covers operator walkthrough.
- Existing claims cited but **not flipped** this iteration. Walkthrough produces an experiment record; whether to flip downstream claims is a separate decision.
- No CSS / styling / design work. "Click-through works" is the bar; "looks like a product" is out-of-scope.
- No new third-party deps (no `concurrently`, no UI library).
- Do not run `scripts/install-vnstock.sh` — bootstrap already consumed device slot in parent plan.
- Do not capture raw external data, credentials, or config contents in walkthrough evidence.
- Do not use bare "capability" or "user" language.

## Success Criteria

- `pnpm dev:api` starts FastAPI on `:8000`. `pnpm dev:web` starts Vite on `:5173`. `pnpm dev` runs both (or documented two-terminal flow).
- Root `/` route renders with title + link to `/reference/equity` + symbol-search input.
- Symbol-search input on `/` calls `/reference/search` and renders results inline.
- Each result row links to `/reference/company/{symbol}`.
- `EquityTable` `symbol` column renders as `<Link>` to company detail.
- READMEs under `product/api/` and `product/web/` document run commands + ports + env vars.
- Walkthrough experiment record validates against schema.
- Tripwire file at `records/evidence/meta/product-shape-verification-class.md` present.
- `pnpm validate:records` + `pnpm check` pass after phase 2.

## Cook Handoff

Run after plan approval:

```bash
/ck:cook /home/datguy/codingProjects/learning-loop-template/plans/260511-1900-product-shape-bootstrap/plan.md
```
