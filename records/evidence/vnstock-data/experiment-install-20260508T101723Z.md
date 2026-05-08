# vnstock Install Experiment Evidence

## Envelope

- run_id: runtime-20260508-101723-vnstock-install
- temp_root_class: os-temp-outside-repo
- approval_gate: install-import
- command_class: download-installer-run + makeself-extract + temp-venv-install
- output_level: metadata-only
- validation_status: does-not-support
- cleanup_status: succeeded
- temp_root_deleted: true

## Allowed Outputs Captured

- package-metadata: unavailable
- import-verification: false
- module-symbol-list: unavailable
- installer-options-verified: false
- install-command-success: false
- script-download-url-class: vnstocks-official-download
- installer-file-type: POSIX shell script executable, self-executable Makeself 2.5.0 archive
- archive-entry-count: 4
- archive-entrypoint-class: Python installer script

## Blocked Outputs

- raw-external-data
- api-credentials
- config-contents
- install-logs
- live-api-calls
- private-artifacts
- temp-dirs
- venvs

## Result

The install experiment did not support the claim as written.

The archive downloaded successfully and `--check` succeeded. The archive-level help did not expose `--non-interactive`, `--api-key`, `--venv-path`, or `--language`. Passing those flags to the archive wrapper failed with an unknown-option class error before creating the target venv.

The extracted Python installer entrypoint requires `requests` to run. After adding that dependency to a disposable runner venv, invoking the entrypoint still did not expose the planned flags. Source inspection of the extracted entrypoint showed environment-variable driven behavior:

- `VNSTOCK_API_KEY` is read from the environment.
- `VNSTOCK_LANGUAGE` controls language.
- `VNSTOCK_VENV_TYPE` and `VNSTOCK_VENV_PATH` control venv selection.

The current installer therefore does not match the prior note that it reads a pre-existing API key from `~/.vnstock/user.json` or that the archive wrapper exposes the planned noninteractive flags.

## Cleanup Confirmation

The temp root was deleted after each attempted run. No installer logs, credentials, config contents, raw data, downloaded installer file, extracted scripts, or venv binaries were retained.
