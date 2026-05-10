# vnstock Installer Bootstrap

Date: 2026-05-10

Implemented the two-stage API bootstrap. `product/api/pyproject.toml` now carries public dependencies only, with Python floor aligned to the pandas requirement. Root `pnpm bootstrap:api` runs `uv sync` and then `product/api/scripts/install-vnstock.sh`.

The installer script is explicit operator action only. It requires `VNSTOCK_API_KEY`, short-circuits when `vnstock_data` already imports, verifies the pinned installer SHA, runs with `product/api` as `HOME`, and fails closed when post-install `import vnstock_data` does not pass.

Living docs now point operators to `pnpm bootstrap:api` and state the vendor stage requires explicit approval and may consume a device slot. Plan status is synced: phases 1-3 complete; phase 4 static validation complete; runtime proof and decision approval remain pending.

Validation passed: `bash -n product/api/scripts/install-vnstock.sh`, `uv sync` for public deps, `pnpm validate:records`, and `pnpm check`. Runtime bootstrap was later approved by the operator, `product/api/.venv` was deleted and recreated, `pnpm bootstrap:api` passed, and `vnstock_data==3.1.7` imported successfully. `.vnstock` contents were not read.

Unresolved questions: none.
