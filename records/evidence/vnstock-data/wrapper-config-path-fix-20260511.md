---
record_type: evidence
capability: vnstock-data
dimension: install
scope: sandbox
validation_status: passed
claim_support: supports
created: "2026-05-11T14:35:00+07:00"
---

# Wrapper Config Path Fix — vnstock-data — 20260511

## Findings

- [wrapper-config-path-root] The install-vnstock.sh wrapper must set `VNSTOCK_CONFIG_PATH` to the `.vnstock` root, not one segment deeper, for the installer and runtime to agree on where `user.json`, `api_key.json`, and `device.id` live.
  - Context: Applies to the wrapper at `product/api/scripts/install-vnstock.sh` running against vnstock_data 3.0.x and 3.1.x.
