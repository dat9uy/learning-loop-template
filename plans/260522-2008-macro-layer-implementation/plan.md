---
title: "Macro Layer Implementation Plan"
status: completed
---

# Macro Layer Implementation Plan

Implements the Macro data layer (Layer 5) from `records/vnstock/evidence/unified-ui-snapshot/05-macro-layer.md` into the product.

## Surfaces

- `product` (FastAPI backend + TanStack frontend)

## Decision Record

- `records/product/decisions/decision-product-260522T2007Z-implement-macro-layer-api-with-economy-currency-and-commodity-endpoints-using-the-established-envelope-pattern-split-across-multiple-routers-to-keep-files-under-200-lines.yaml`

## Phases

| Phase | Description | Status |
|-------|-------------|--------|
| [Phase 1](phase-01-api-models-and-routers.md) | API models + 3 macro routers + main.py registration | Complete |
| [Phase 2](phase-02-frontend-client-and-components.md) | Frontend client lib + macro page + router registration | Complete |
| [Phase 3](phase-03-tests-and-integration.md) | Unit tests, run tests, verify integration | Complete |

## Key Insights

- Split into 3 routers (`macro_economy`, `macro_currency`, `macro_commodity`) to stay under 200 lines per file.
- Economy/Currency endpoints use MBK source; Commodity uses SPL source.
- Economy endpoints have no symbol param (macro-level); commodity endpoints have optional `market` param.
- All endpoints return the established `DataFrameEnvelope` pattern (columns + rows).

## Dependencies

- `vnstock_data.Macro` must be importable (verified by existing install).
- `product/api/.venv` must be provisioned (`pnpm bootstrap:api`).

## Risks

- `Macro` class may not expose all 21 methods in the installed vnstock_data version.
- If a method is missing, stub it with a clear TODO instead of blocking the whole layer.
