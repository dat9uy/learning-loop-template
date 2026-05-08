---
phase: 4
title: "Build Knowledge Pack"
status: blocked
priority: P1
effort: "30m"
dependencies: [3]
---

# Phase 4: Build Knowledge Pack

## Overview

Create the `vnstock-data` knowledge pack with manifest, facts, and capabilities. This is the process-side artifact future agents consume.

## Requirements

- Functional: Pack contains verified install method. Capabilities state what agents may do.
- Non-functional: Pack files cite `record_ref` for provenance, not direct evidence refs. Publication gate requires install dimension verified.

## Architecture

```
knowledge-packs/
└── vnstock-data/
    ├── manifest.yaml
    ├── facts.yaml
    └── capabilities.yaml
```

## Related Code Files

- **Create:** `knowledge-packs/vnstock-data/manifest.yaml`
- **Create:** `knowledge-packs/vnstock-data/facts.yaml`
- **Create:** `knowledge-packs/vnstock-data/capabilities.yaml`
- **Read for context:** `docs/knowledge-pack-contract.md`
- **Read for context:** `knowledge-packs/_template/manifest.yaml`

## Implementation Steps

1. Create `knowledge-packs/vnstock-data/manifest.yaml`
   - `id`: vnstock-data
   - `domain`: vnstock
   - `status`: approved
   - `version`: 0.1.0
   - `summary`: Verified vnstock install and import capabilities
   - `approval.reviewer`: operator
   - `approval.reviewed_at`: <date>
   - `approval.status`: approved
   - `pack_ref`: pack:vnstock-data
   - `files`: [manifest.yaml, facts.yaml, capabilities.yaml]
   - `publication_gate`:
     - `claims.min_assurance`: install
     - `claims.required_outcome`: supports
     - `claims.scope`: sandbox
     - `risks.exposure`: reviewed-actionable-scope-relevant
     - `decisions.required_effect`: approve
     - `decisions.scope`: install

2. Create `knowledge-packs/vnstock-data/facts.yaml`
   ```yaml
   facts:
     - id: vnstock-install-method
       statement: "vnstock is installed by downloading and executing a Makeself .run installer from vnstocks.com, not via pip"
       record_ref: record:experiment-vnstock-install-sandbox
       scope: sandbox
     - id: vnstock-installer-options
       statement: "Installer exposes --non-interactive, --api-key, --venv-path, and --language options"
       record_ref: record:experiment-vnstock-install-sandbox
       scope: sandbox
     - id: vnstock-import-verified
       statement: "import vnstock succeeds after installer execution"
       record_ref: record:experiment-vnstock-install-sandbox
       scope: sandbox
     - id: vnstock-api-key-prerequisite
       statement: "API key must be pre-configured at ~/.vnstock/user.json"
       record_ref: record:claim-vnstock-install-sandbox
       scope: sandbox
   ```

3. Create `knowledge-packs/vnstock-data/capabilities.yaml`
   ```yaml
   capabilities:
     - id: install-vnstock
       description: Install vnstock by downloading and executing the official .run installer
       method:
         - "curl -fsSL -o vnstock-cli-installer.run https://vnstocks.com/files/vnstock-cli-installer.run"
         - "chmod +x vnstock-cli-installer.run"
         - "./vnstock-cli-installer.run --help"
         - "./vnstock-cli-installer.run --non-interactive --venv-path <path> --language python"
         - "<venv-path>/bin/python -c 'import vnstock'"
       prerequisites:
         - temp directory outside repo
         - API key at ~/.vnstock/user.json
       verified_by: record:experiment-vnstock-install-sandbox
       scope: sandbox
     - id: import-vnstock
       description: Import vnstock after installer execution
       method:
         - "import vnstock"
       prerequisites:
         - install-vnstock completed
       verified_by: record:experiment-vnstock-install-sandbox
       scope: sandbox
   ```

4. Run `pnpm validate:records`

## Success Criteria

- [x] Manifest created with correct publication gate
- [x] Facts cite `record_ref` not evidence refs
- [ ] Capabilities describe agent-runnable methods
- [ ] Pack status is approved
- [x] `pnpm validate:records` passes
- [ ] `pnpm check` passes

## Blocker

The pack remains `draft` with empty facts and capabilities because publishing an approved install capability would overstate the failed experiment.

Current validators permit an empty draft pack. Passing validation is not publication readiness.

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Pack cites evidence directly | low | Review knowledge-pack-contract rules; use record_ref only |
| Capabilities include blocked actions | low | Scope to sandbox only; no live API calls |
| Publication gate insufficient | low | Match gate to claim's verified install dimension |
