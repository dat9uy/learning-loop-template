# Operator Product Shape Walkthrough

- run_id: operator-product-shape-260511T1900Z
- run_timestamp: 2026-05-11T19:00:00+07:00
- operator_identity_class: operator
- approval_gate: product-shape-walkthrough
- command_class: local-dev-server-walkthrough
- allowed_outputs: metadata, schema-shape, counts, redacted-labels
- blocked_outputs: raw-external-data, cell-values, row-indexes, identifiers, time-series-values, credentials, config-contents, install-logs, private-artifacts, screenshots
- validation_status: passed

## Walkthrough

| Step | URL | HTTP status | Component visible | Shape observed | Navigation outcome |
|---|---:|---:|---|---|---|
| 1 | `/` | 200 | `LandingPage`, `SearchBox` | title, equity-list link, search input | root route rendered |
| 2 | `/reference/equity` | 200 | `EquityTable` | columns: `symbol`, `org_name`; row_count: 1742 | symbol cells link to company route |
| 3 | `/reference/company/{symbol}` | 200 | `CompanyDetail` | columns: `symbol`, `name`, `sector`, `profile`, `listing_date`, `issued_share`; row_count: 1 | company detail route rendered from linked symbol |
| 4 | `/` search for redacted ticker class | 200 | `SearchBox` results table | columns: `symbol`, `org_name`; row_count: 1 | result symbol links to company route |
| 5 | `/reference/company/{search_result_symbol}` | 200 | `CompanyDetail` | columns match company detail shape; row_count: 1 | company detail route rendered from search result |

## Observed Schema Shape

- Landing route: title text, equity-list link, search label, search input, submit button.
- Equity list: `symbol`, `org_name`; count only retained.
- Company detail: `symbol`, `name`, `sector`, `profile`, `listing_date`, `issued_share`; count only retained.
- Search results: `symbol`, `org_name`; count only retained.

## Redacted Samples

- Equity row class: `{ symbol: "<symbol>", org_name: "<text>" }`
- Company detail row class: `{ symbol: "<symbol>", name: "<text>", sector: "<text>", profile: "<text>", listing_date: "<date>", issued_share: "<numeric>" }`
- Search query class: `<symbol>`
- Search result row class: `{ symbol: "<symbol>", org_name: "<text>" }`

## UX Observations

- Product shape is inspectable from `/` without manual URL editing.
- Search result count was nonzero for the redacted ticker-class query.
- No route 404 observed during the fixed click-path.

## Cleanup

- No screenshots captured.
- No raw provider rows, cell values, row identifiers, credentials, or config contents retained.
- Dev servers were used as executable substrate only; durable evidence is this curated envelope.
