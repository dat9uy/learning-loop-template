# FastAPI Reference Build Closeout

Date: 2026-05-11

## Summary

Closed the FastAPI Reference Build after the runtime blocker fix. `/reference/search` now filters the VCI-backed equity catalog instead of using the Dukascopy-backed symbol search path.

## Changes

- Re-routed `GET /reference/search` to `Reference().equity.list()` with case-insensitive substring matching over symbol/name columns.
- Preserved the `SymbolSearchResponse` envelope and configured HTTP serialization to omit stale nullable search fields.
- Added unit and live-smoke coverage for the new VCI search path.
- Updated API/web evidence, experiments, claims, capability record, and plan statuses.

## Validation

- API tests: 8 passed, 1 skipped.
- Live VCI smoke tests: 4 passed.
- Web smoke test: passed.
- Web build: passed.
- Record validation: 29 records validated.

## Unresolved Questions

None.
