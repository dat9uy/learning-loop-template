---
record_type: evidence
capability: vnstock-data
dimension: install
scope: sandbox
validation_status: passed
claim_support: supports
created: "2026-05-18T00:30:00+07:00"
---

# Vendor Compat Archived — vnstock-data — 20260518

## Findings

- [vendor-compat-archived] The `product/api/src/vendor_compat/` module is no longer required for vnstock_data >= 3.1.8 and is archived.
  - Context: Direct import of vnstock_data without vendor_compat patching now succeeds.
