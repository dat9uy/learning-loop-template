---
phase: 2
title: "Execute Install Experiment"
status: pending
priority: P1
effort: "1h"
dependencies: [1]
---

# Phase 2: Execute Install Experiment

## Overview

Run the vnstock install in a disposable temp venv with human approval, capture metadata-only output, and clean up.

## Requirements

- Functional: Install succeeds. Import succeeds. Metadata captured.
- Non-functional: Temp directory outside repo. Deleted after proof. No credentials captured.

## Architecture

```
OS temp directory (/tmp/learning-loop-run-<run_id>)
├── vnstock-cli-installer.run   (downloaded from vnstocks.com)
│   └── executed with --non-interactive --api-key <key> --venv-path <path> --language python
├── temp-venv/                  (created by installer or manually)
│   └── python -c "import vnstock; print(vnstock.__version__)"
│   └── list top-level modules (names only)
└── [deleted after proof]

records/evidence/vnstock-data/
└── experiment-install-<run_id>.md (evidence envelope)
```

## Related Code Files

- **Create:** `records/evidence/vnstock-data/experiment-install-<run_id>.md`
- **Read for context:** `records/claims/claim-vnstock-install-sandbox.yaml` (from phase 1)
- **Read for context:** `docs/operator-guide.md` (Runtime Artifact Standard)

## Implementation Steps

1. Request human approval per Runtime Validation Request Protocol:
   - Dimension: install, Scope: sandbox
   - Output level: metadata-only
   - Exact command class: download-installer-run + makeself-exec + temp-venv-install
   - Temp boundaries: `/tmp/learning-loop-run-<run_id>`
   - Expected output: package-metadata, import-verification, module-symbol-list, installer-options-verified
   - Local config needed: API key at `~/.vnstock/user.json` (pre-existing, not captured)
   - Blocked: credentials, config contents, install logs, raw data, live calls

2. Create temp directory: `mktemp -d /tmp/learning-loop-run-XXXXXX`

3. Download installer to temp directory:
   ```bash
   curl -fsSL -o vnstock-cli-installer.run https://vnstocks.com/files/vnstock-cli-installer.run
   chmod +x vnstock-cli-installer.run
   ```

4. Inspect installer options (Makeself archive):
   ```bash
   ./vnstock-cli-installer.run --help
   ./vnstock-cli-installer.run --check
   ```
   Verify options include `--non-interactive`, `--api-key`, `--venv-path`, `--language`.

5. Execute installer with sandbox options:
   ```bash
   ./vnstock-cli-installer.run \
     --non-interactive \
     --venv-path <temp-venv-path> \
     --language python
   ```
   The installer reads the pre-existing API key from `~/.vnstock/user.json`.

6. Verify install in the created temp venv:
   ```bash
   <temp-venv-path>/bin/python -c "import vnstock; print(vnstock.__version__)"
   <temp-venv-path>/bin/python -c "import vnstock; print([x for x in dir(vnstock) if not x.startswith('_')])"
   ```

7. Capture metadata (allowed outputs only):
   - package-metadata: version, name, author, license
   - import-verification: true/false
   - module-symbol-list: top-level symbols (names only)
   - installer-options-verified: which options were exposed and tested
   - install-command-success: exit codes of download, inspect, and exec steps
   - installer-url-class: `vnstocks-official-download` (label, not literal URL)

8. Delete temp directory and confirm deletion

9. Write evidence envelope `records/evidence/vnstock-data/experiment-install-<run_id>.md` with all required fields:
   - run_id, temp_root_class, approval_gate, command_class
   - allowed_outputs, blocked_outputs
   - cleanup_status: succeeded, temp_root_deleted: true

## Success Criteria

- [ ] Human approval obtained before execution
- [ ] Temp venv created outside repo
- [ ] Installer `.run` file downloads successfully
- [ ] Installer options inspected and verified (`--non-interactive`, `--api-key`, `--venv-path`, `--language`)
- [ ] Installer executes successfully with `--non-interactive`
- [ ] `import vnstock` succeeds in installer-created venv
- [ ] Metadata captured (allowed outputs only)
- [ ] Temp directory deleted
- [ ] Evidence envelope written with all required fields
- [ ] No credentials, config contents, or raw data captured

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| External `.run` installer is malicious | medium | Sandbox scope, temp directory, no credential access, delete after |
| Cleanup fails | medium | Manual confirmation required; fail-closed rule |
| API key accidentally captured | low | Explicit blocked output class; do not read `~/.vnstock/user.json` contents |
| Install pollutes real Python env | low | Installer scoped to temp venv via `--venv-path` |
