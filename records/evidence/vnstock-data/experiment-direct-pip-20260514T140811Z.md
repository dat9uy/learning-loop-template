---
record_type: evidence
capability: vnstock-data
dimension: install
scope: sandbox
validation_status: passed
claim_support: supports
secret_injection_class: none
installer_url_class: vnstocks-official-download
static_dimension_consistency: not-evaluable
created: "2026-05-14T14:08:11Z"
substrate: host-direct-curl-and-pip-probes
---

# Install Experiment - vnstock-data - Direct Pip Install from Vendor Index - 20260514T140811Z

## Summary

Probed the vendor's `https://vnstocks.com/api/simple` URL to test whether
`vnstock_data` can be installed directly via pip without the proprietary Makeself installer.
The endpoint is **not a PEP 503 simple API index**. Direct pip install is **not viable**.

## Steps Executed

1. Probed `https://vnstocks.com/api/simple` with `curl -sI` and `curl -sL`.
2. Probed `https://vnstocks.com/api/simple/vnstock_data/` and `/vnstock-data/`.
3. Probed `https://vnstocks.com/api/packages/vnstock_data`.
4. Attempted `pip install --extra-index-url https://vnstocks.com/api/simple vnstock_data`
   in a fresh container (timed out due to non-index response).

## Observations

### Index Root Probe

```text
HTTP/2 200
content-type: text/html; charset=utf-8
```

Body is an HTML page (Next.js application) titled **"Kho Gói Python Vnstocks"**.
This is a web UI, not a PEP 503 simple index.

### Package Sub-Path Probe

```text
GET /api/simple/vnstock_data/      → {"error":"Package 'vnstock-data' not found"}
GET /api/simple/vnstock-data/      → {"error":"Package 'vnstock-data' not found"}
GET /api/packages/vnstock_data     → HTTP 404
```

### Pip Install Attempt

`pip install --extra-index-url https://vnstocks.com/api/simple vnstock_data`
hangs/fails because pip cannot parse the HTML page as a package index.

## Conclusion

- The vendor does **not** expose a PEP 503-compatible simple index.
- The proprietary installer is the **only supported delivery mechanism** for `vnstock_data`.
- No pip bypass strategy exists.
- The bootstrap script (`product/api/scripts/install-vnstock.sh`) remains the correct install path.

## Findings

- [direct-pip-not-viable] Direct pip install from the vendor index is not viable; the vendor endpoint is a web UI, not a PEP 503 simple index.
  - Context: Probed `https://vnstocks.com/api/simple` with curl and attempted `pip install --extra-index-url` on 2026-05-14.

## Source

- Operator: local
- Plan: `docs/journals/260513-vnstock-bootstrap-substrate-experiment.md`
- Phase: B (direct pip install)
