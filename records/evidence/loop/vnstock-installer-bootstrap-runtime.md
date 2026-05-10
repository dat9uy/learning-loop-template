# vnstock Installer Bootstrap Runtime Evidence

Date: 2026-05-10
Run ID: `runtime-20260510-1709-vnstock-bootstrap`

## Trigger

Operator approved the runtime bootstrap after confirming `VNSTOCK_API_KEY` handling and vendor device-limit action. The proof target was the clean `product/api/.venv` bootstrap required by `record:decision-20260510T170623Z-vnstock-installer-bootstrap`.

## Approval Gate

- Dimension: install/runtime
- Scope: sandbox
- Output policy: metadata-only
- Command class: clean `product/api/.venv` recreation followed by `pnpm bootstrap:api`
- Approved cleanup boundary: delete only `product/api/.venv`
- Credential handling: `VNSTOCK_API_KEY` supplied through the shell environment and not captured

## Runtime Envelope

- `run_id`: `runtime-20260510-1709-vnstock-bootstrap`
- `temp_root_class`: `script-managed-os-temp-outside-repo`
- `approval_gate`: `install-import`
- `command_class`: `clean-product-api-venv-bootstrap`
- `allowed_outputs`: `metadata`, `command-status`, `hash-match-status`, `package-version`, `import-result`, `cleanup-status`
- `blocked_outputs`: `credentials`, `config-contents`, `installer-logs`, `private-package-files`, `raw-external-data`, `provider-device-id`, `provider-account-device-list`, `local-config-values`
- `cleanup_status`: `succeeded`
- `temp_root_deleted`: `true`
- `validation_status`: `passed`

## Observed Metadata

- Deleted path before proof: `product/api/.venv`
- Bootstrap command: `pnpm bootstrap:api`
- Public dependency stage: `uv sync` recreated `product/api/.venv`
- Installer SHA-256 expected: `1982f7f93386daa57e1a1c0b18a87c8a299b9ad1d331f4123ab534656fa4c7ed`
- Installer SHA-256 observed: matched expected value
- Vendor stage result: completed successfully
- Post-flight import result: `product/api/.venv/bin/python -c "import vnstock_data"` passed
- Package metadata version: `vnstock_data==3.1.7`
- Repository extraction residue: `product/api/.build_cli_package` absent after run

## Notes

The vendor installer emitted console progress, local paths, and provider/device status. Those details were not copied into this evidence because the approval boundary was metadata-only and explicitly blocked device identifiers, installer logs, config contents, and account device-list contents.

The first runtime attempt exposed an environment issue: the vendor installer executed its Python entrypoint without the stack venv first in `PATH`, then failed to import `requests`. `product/api/scripts/install-vnstock.sh` was updated to run the installer from the script temp directory with `PATH` and `VIRTUAL_ENV` pointed at `product/api/.venv`; the clean proof above used that corrected script.

## Source Records

- `record:decision-20260510T170623Z-vnstock-installer-bootstrap`
- `record:claim-vnstock-install-sandbox`
- `record:claim-vnstock-device-limit-mechanism`
- `local:records/evidence/loop/vnstock-installer-bootstrap.md`
- `local:records/evidence/vnstock-data/experiment-install-20260509T071800Z-sandbox-1.md`
