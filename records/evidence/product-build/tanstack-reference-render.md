---
record_type: evidence
scope: product-build
validation_status: passed
claim_support: supports
output_level: metadata-only
created: "2026-05-11T00:30:00Z"
---

# TanStack Reference Render Metadata

## Runtime Envelope

- `run_id`: product-web-20260511T003000Z
- `temp_root_class`: os-temp-outside-repo
- `approval_gate`: render-smoke-test
- `command_class`: fixture-backed-node-test
- `allowed_outputs`: metadata, schema-shape, fixture-checksum
- `blocked_outputs`: raw-external-data, live-backend-calls, screenshots-of-real-data, credentials, config-contents
- `cleanup_status`: succeeded
- `temp_root_deleted`: true
- `validation_status`: pending

## Render Metadata

| Route path | Component | Assertion metadata |
|---|---|---|
| `/reference/equity` | `EquityTable` | table headers match `symbol`, `org_name`; fixture row count matches row array length |
| `/reference/company/$symbol` | `CompanyDetail` | detail fields match `symbol`, `name`, `sector`, `profile`, `listing_date`, `issued_share`; fixture row count matches row array length |

## Fixture

- Path: `product/web/fixtures/fastapi-reference-response.json`
- SHA-256: `8b7bcbcc8bae99bceb01d490959ac476c9db3dd6894f4559bfb95cd35c24f9ad`
- Contains sanitized fixture rows only; no live backend call was made by the smoke tests.

## Post-Fix Re-run - 2026-05-11T18:07:00+07:00

- `run_id`: product-web-20260511T180700+0700
- `temp_root_class`: os-temp-outside-repo
- `approval_gate`: render-smoke-test
- `command_class`: fixture-backed-node-test-and-vite-build
- `allowed_outputs`: metadata, schema-shape, fixture-checksum, build-status
- `blocked_outputs`: raw-external-data, live-backend-calls, screenshots-of-real-data, credentials, config-contents
- `cleanup_status`: succeeded
- `temp_root_deleted`: true
- `validation_status`: passed

| Route path | Component | Assertion metadata |
|---|---|---|
| `/reference/equity` | `EquityTable` | table headers match `symbol`, `org_name`; fixture row count matches row array length |
| `/reference/company/$symbol` | `CompanyDetail` | detail fields match `symbol`, `name`, `sector`, `profile`, `listing_date`, `issued_share`; fixture row count matches row array length |

Validation:
- `pnpm --dir product/web test` passed.
- `pnpm --dir product/web build` passed.
- Fixture SHA-256 remained `8b7bcbcc8bae99bceb01d490959ac476c9db3dd6894f4559bfb95cd35c24f9ad`.
