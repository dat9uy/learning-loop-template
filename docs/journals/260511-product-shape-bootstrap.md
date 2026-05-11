# Product Shape Bootstrap

Date: 2026-05-11

## Summary

Closed product shape bootstrap plan. Added local dev scripts, root landing route, symbol-search UI, equity-to-company links, stack READMEs, and schema-shape-only walkthrough records.

## Changes

- Added root `pnpm dev:api`, `pnpm dev:web`, and combined `pnpm dev` scripts.
- Added Vite `pnpm dev` script under `product/web`.
- Added `/` landing route with search input and equity-list navigation.
- Added `/reference/search` client helper and inline result table with company-detail links.
- Updated equity list symbol cells to use TanStack `<Link>` to company detail.
- Added product API/web run READMEs.
- Added operator walkthrough evidence, experiment record, and product-shape verification-class tripwire.

## Validation

- API preflight import: passed with Matplotlib cache warning.
- FastAPI dev smoke: `/health` returned `{"status":"ok"}`.
- Vite dev smoke: `/` returned HTTP 200.
- Web smoke test: passed.
- Web build: passed.
- Record validation: 30 records validated.

## Unresolved Questions

None.
