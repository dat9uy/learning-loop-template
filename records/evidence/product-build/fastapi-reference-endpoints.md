---
record_type: evidence
scope: product-build
validation_status: passed
claim_support: supports
output_level: metadata-only
created: "2026-05-11T00:30:00Z"
---

# FastAPI Reference Endpoints Metadata Check

## Runtime Envelope

- `run_id`: product-api-20260511T003000Z
- `temp_root_class`: os-temp-outside-repo
- `approval_gate`: runtime-method
- `command_class`: metadata-only-testclient-request
- `allowed_outputs`: metadata, schema-shape, sanitized-exception
- `blocked_outputs`: raw-external-data, cell-values, row-indexes, identifiers, credentials, config-contents, install-logs, private-artifacts, venvs, caches, temp-dirs
- `cleanup_status`: succeeded
- `temp_root_deleted`: true
- `validation_status`: pending

## Observations

- `/reference/equity`: blocked before metadata completion by provider JSON decode failure; sanitized exception class captured only.
- `/reference/company/{symbol}`: not executed after first endpoint blocked.
- `/reference/search`: not executed after first endpoint blocked.

## Post-Fix Re-run - 2026-05-11T18:07:00+07:00

- `run_id`: product-api-20260511T180700+0700
- `temp_root_class`: os-temp-outside-repo
- `approval_gate`: runtime-method
- `command_class`: metadata-only-testclient-request
- `allowed_outputs`: metadata, schema-shape, sanitized-command-status
- `blocked_outputs`: raw-external-data, cell-values, row-indexes, identifiers, credentials, config-contents, install-logs, private-artifacts, venvs, caches, temp-dirs
- `cleanup_status`: succeeded
- `temp_root_deleted`: true
- `validation_status`: passed

| Route | Status | Columns | Row count |
|---|---:|---|---:|
| `/reference/equity` | 200 | `symbol`, `org_name` | 1742 |
| `/reference/company/{symbol}` | 200 | `symbol`, `name`, `sector`, `profile`, `listing_date`, `issued_share` | 1 |
| `/reference/search` | 200 | `symbol`, `org_name` | 5 |

Notes:
- `/reference/search` used the phase 2b VCI-backed equity-list filter.
- Vendor runtime emitted a promotional banner during execution; it was not retained as evidence.
- No raw provider rows, row values, credential values, config contents, or response bodies were retained.

## Output Policy Review

No raw external data, credential values, config contents, row values, or response bodies were retained.
