---
phase: 3
title: "Experiment Rerun"
status: blocked
priority: P1
effort: "1.5h"
dependencies: [2]
---

# Phase 3: Experiment Rerun

## Overview

Rerun the install experiment for `vnstock-data` using the env-var-driven vendor script installer (`vnstock-cli-installer.run` from `vnstocks.com`) — NOT `pip install` (the package is subscriber-only and not on public PyPI). Operator's shell injects `VNSTOCK_API_KEY`; agent verifies inheritance via pre-flight check, sets venv-path env vars, runs the installer, and verifies import in the installer-created venv. Capture new evidence with `secret_injection_class`, `installer_url_class`, `static_dimension_consistency`, and `## Supersedes` sections.

## Current Outcome

Blocked on 2026-05-08 rerun. The agent inherited `VNSTOCK_API_KEY`, approval was obtained, the official installer downloaded, old disproved flags were still absent, and the env-var key path was confirmed. The vendor installer then stopped at the subscribed package device-limit gate before installing `vnstock_data`, so `from vnstock_data import Reference` could not pass. Evidence: `records/evidence/vnstock-data/experiment-install-20260508T171112Z.md`.

## Requirements

- Original functional target: create a new evidence file at `records/evidence/vnstock-data/experiment-install-<UTC>.md` with `validation_status: passed`, `claim_support: supports`, envelope fields `secret_injection_class: api-key-via-shell-env-var`, `installer_url_class: vnstocks-official-download`, `static_dimension_consistency: matches-snapshot | diverges-from-snapshot`, and `## Supersedes` section linking to `installer-prior-notes.md`. Existing experiment-install-20260508T101723Z.md remains unchanged.
- Actual functional outcome: `records/evidence/vnstock-data/experiment-install-20260508T171112Z.md` was created with `validation_status: failed`, `claim_support: does-not-support`, `static_dimension_consistency: not-evaluable`, and `## Supersedes`. The install claim remains unverified because the vendor device-limit gate stopped installation before `vnstock_data` import verification.
- Non-functional: agent transcript contains zero literal API key value. Substrate (temp dir, installer-created venv) is disposable. Approval gate per Runtime Validation Request Protocol obtained before download/exec. Env-var inheritance verified via pre-flight before any other action.

## Architecture

```
operator shell                          agent process
─────────────                           ─────────────
read -s VNSTOCK_API_KEY      ─────►     pre-flight: VNSTOCK_API_KEY present?
export VNSTOCK_API_KEY                  │ if no → halt, report to operator
env | grep -c VNSTOCK_API_KEY           ▼
invoke agent IN SAME SHELL              substrate: mktemp -d
                                        curl vnstock-cli-installer.run
                                        chmod +x; ./...run --help (inspect)
                                        export VNSTOCK_VENV_PATH/TYPE/LANGUAGE
                                        ./vnstock-cli-installer.run (env-var driven)
                                        $VNSTOCK_VENV_PATH/bin/python smoke import
                                        │
                                        ▼
                                        records/evidence/vnstock-data/
                                        experiment-install-<UTC>.md
                                        ├── secret_injection_class: api-key-via-shell-env-var
                                        ├── installer_url_class: vnstocks-official-download
                                        ├── static_dimension_consistency: not-evaluable
                                        ├── validation_status: failed
                                        ├── claim_support: does-not-support
                                        └── ## Supersedes → installer-prior-notes.md
```

## Related Code Files

- **Create:** `records/evidence/vnstock-data/experiment-install-<UTC>.md` (UTC = ISO timestamp at run time)
- **Read for context:** `records/evidence/vnstock-data/experiment-install-20260508T101723Z.md` (prior disproof; envelope shape; documents env-var contract VNSTOCK_API_KEY/LANGUAGE/VENV_TYPE/VENV_PATH)
- **Read for context:** `records/evidence/vnstock-data/installer-prior-notes.md` (claim to be superseded)
- **Read for context:** `records/evidence/vnstock-data/unified-ui-snapshot/README.md` ("runtime wins on disagreement" caveat)
- **Read for context:** `records/evidence/vnstock-data/unified-ui-snapshot/00-migration-guide.md` (Unified UI rationale; class-name mapping)
- **Read for context:** `records/evidence/vnstock-data/unified-ui-snapshot/01-reference-layer.md` (canonical `from vnstock_data import Reference` shape)
- **Read for context:** `records/evidence/meta/secret-injection-class.md` (Phase 2 output; class label source)
- **Read for context:** `records/evidence/meta/capability-dir-scan-rule.md` (Phase 2 output; rule that surfaced the snapshot)
- **Read for context:** `plans/260508-1545-vnstock-install-knowledge-encoding/phase-02-execute-install-experiment.md` (predecessor; install method was script-based; flag contract was wrong but URL/Makeself shape is canonical)
- **Read for context:** `docs/operator-guide.md` Agent Intake Flow + Runtime Validation Request Protocol sections
- **Read for context:** `plans/reports/brainstorm-20260508-resume-vnstock-and-meta-loop.md` Q1+Q2 sections

## Implementation Steps

### 3.1 Operator pre-experiment setup

Operator (human) runs in their own terminal BEFORE invoking the agent for the experiment:

```bash
read -s VNSTOCK_API_KEY
export VNSTOCK_API_KEY
# verify it's set without echoing the value
[ -n "$VNSTOCK_API_KEY" ] && echo "key is set" || echo "key is NOT set"
# pre-launch verification: confirm exported (count must be 1)
env | grep -c '^VNSTOCK_API_KEY='
```

Then invoke the agent **IN THE SAME SHELL SESSION** so the env var is inherited. If the agent is launched in a separate process (new IDE session, fresh terminal, container) the env var will NOT be inherited — that is the documented failure mode that blocked the previous Phase 3 run.

The agent does NOT execute the `read -s` step. Agent's first action in step 3.4 is a pre-flight check that halts cleanly if inheritance failed.

### 3.2 Agent intake (per claims-first + capability-dir scan rules from Phase 2.6)

Agent reads in this order:
1. Claim file for `vnstock-data` capability
2. Prior experiment evidence (20260508T101723Z) referenced via `record_ref`. Note its env-var contract findings: VNSTOCK_API_KEY/LANGUAGE/VENV_TYPE/VENV_PATH; archive-level flags `--non-interactive --api-key --venv-path --language` do NOT exist.
3. `installer-prior-notes.md` (referenced by claim) — note it is the file to be superseded
4. **Capability-dir scan (Q6)**: list everything in `records/evidence/vnstock-data/` not yet read. Hits: `unified-ui-snapshot/` directory. Read its `README.md`, `00-migration-guide.md`, and `01-reference-layer.md`. Note the snapshot caveat: "installed subscriber runtime inspection wins when behavior differs". The Phase 3 import shape (`from vnstock_data import Reference`) comes from this snapshot.
5. **Predecessor plan reference**: read `plans/260508-1545-vnstock-install-knowledge-encoding/phase-02-execute-install-experiment.md`. The install method (download `.run`, Makeself archive, env-var driven) is canonical; only the flag contract was disproved. New Phase 3.4 keeps the script-install method.
6. **Pre-experiment meta scan (Q5 R2)**: scan `records/evidence/meta/` for `## Trigger` matching `next-install-experiment` event class. Hits: `install-experiment-template-gap.md` (N=2 — second case; per-trigger guidance applies in Phase 4). Also: `secret-injection-class.md` and `capability-dir-scan-rule.md` provide rule context.

### 3.3 Request approval (Runtime Validation Request Protocol)

Agent emits a structured approval request specifying:
- scope: `sandbox`
- dimension: `install`
- substrate: ephemeral temp dir + installer-created venv
- network: `vnstocks.com` (script download), then network within installer for vendor-controlled package fetch
- secrets: `VNSTOCK_API_KEY` already injected by operator (no agent-side handling)
- expected output: metadata-only evidence envelope (no captured response payloads beyond shape/types)
- pre-flight contract: agent verifies `$VNSTOCK_API_KEY` non-empty before any network/exec action; halts cleanly if missing

Operator approves before any network or exec action.

### 3.4 Execute experiment

Substrate steps (all in ephemeral temp dir, all logged in evidence):

```bash
WORKDIR=$(mktemp -d)
cd "$WORKDIR"

# Pre-flight: env var must be inherited from operator's shell
if [ -z "$VNSTOCK_API_KEY" ]; then
  echo "VNSTOCK_API_KEY not present in inherited environment. Halting."
  echo "Operator: in the SAME shell where 'read -s VNSTOCK_API_KEY; export VNSTOCK_API_KEY' ran, re-invoke the agent."
  echo "If agent runs in a separate process (IDE/container), forward VNSTOCK_API_KEY explicitly via that process's env passthrough."
  exit 1
fi

# Download installer (script-download-url-class: vnstocks-official-download)
curl -fsSL -o vnstock-cli-installer.run https://vnstocks.com/files/vnstock-cli-installer.run
chmod +x vnstock-cli-installer.run

# Inspect installer (Makeself archive). Confirm env-var contract still holds.
./vnstock-cli-installer.run --help 2>&1 | tee installer-help.log
# Expected per prior evidence: NO --api-key/--non-interactive/--venv-path/--language flags.
# If those flags now appear, document divergence in evidence — contract changed.

# Optional: extract archive without running for entrypoint inspection
./vnstock-cli-installer.run --noexec --target installer-extract 2>&1 | tee installer-extract.log
ls installer-extract/

# Configure venv-related env vars (agent-set; non-secret per prior evidence)
export VNSTOCK_VENV_PATH="$WORKDIR/.vnstock-venv"
export VNSTOCK_VENV_TYPE=venv
export VNSTOCK_LANGUAGE=python

# Execute installer (reads VNSTOCK_API_KEY + VNSTOCK_VENV_* + VNSTOCK_LANGUAGE from env)
./vnstock-cli-installer.run 2>&1 | tee install.log
# Original expectation: installer creates venv at $VNSTOCK_VENV_PATH and installs vnstock + vnstock_data.
# Actual 20260508T171112Z result: installer created venv but stopped at vendor device-limit gate.

# Verify import using the installer-created venv (not a separately-created python -m venv)
"$VNSTOCK_VENV_PATH/bin/python" - <<'PY'
import os
assert os.environ.get("VNSTOCK_API_KEY"), "env var missing"
from vnstock_data import Reference
r = Reference()
print(type(r).__name__)
# Static-dimension consistency check vs unified-ui-snapshot
import vnstock_data
expected = {"Reference", "Market", "Fundamental", "Macro", "Analytics", "Insights"}
present = expected & set(dir(vnstock_data))
print("snapshot_classes_present:", sorted(present))
print("snapshot_classes_missing:", sorted(expected - present))
PY
```

Capture installer-help.log, installer-extract.log, install.log (all truncated to non-sensitive lines), python output, and exit codes.

Failure modes to handle without workaround:
- `curl` fails → record exit code; installer URL availability is itself a finding
- `./vnstock-cli-installer.run --help` shows the disproved flags now exposed → record divergence; contract changed
- installer exits nonzero → record stderr (redacted of any key value); stop and file as new disproof
- venv created at unexpected path → record actual path; reuse for verify step
- import succeeds but `Reference` not in top-level namespace → set `static_dimension_consistency: diverges-from-snapshot`; record actual entry-class shape

### 3.5 Write evidence envelope

New file `records/evidence/vnstock-data/experiment-install-<UTC>.md` (use actual UTC timestamp at write time, format `YYYYMMDDTHHMMSSZ`).

Target envelope shape for a successful rerun:

```markdown
---
record_type: evidence
capability: vnstock-data
dimension: install
scope: sandbox
validation_status: passed
claim_support: supports
secret_injection_class: api-key-via-shell-env-var
installer_url_class: vnstocks-official-download
static_dimension_consistency: matches-snapshot
created: "<UTC ISO 8601>"
substrate: ephemeral-temp-dir-plus-installer-venv
---

# Install Experiment — vnstock-data — <UTC>

## Summary
<one-line outcome>

## Substrate
<temp dir path, installer-created venv path, python version inside venv, installer file SHA-256 if captured>

## Steps Executed
<numbered list mirroring 3.4 substeps>

## Observations
- pre-flight env var check: passed
- curl vnstock-cli-installer.run: exit 0
- installer --help flag set: <flags actually exposed; compare to prior evidence's disproved set>
- installer execution: exit 0
- venv created at $VNSTOCK_VENV_PATH: <true|false>
- import vnstock_data: success
- Reference() construction: type name <recorded>
- snapshot entry-class presence: <list>
- env var presence verified inside venv python: yes (value never read or echoed)

## Static Dimension Consistency
- Reference snapshot: `local:records/evidence/vnstock-data/unified-ui-snapshot/01-reference-layer.md` @ upstream commit 6adcd80
- Runtime shape: <matches | diverges>
- Divergences (if any): <list>

## Process-Side Findings
- Env-var inheritance from operator's shell: <succeeded | failed and recovered via X>
- If failed initially: document the launch context (IDE session, container, fresh terminal) — feeds back into `secret-injection-class.md` refinement on next loop iteration

## Disproof / Confirmation Notes
<any deviations from claim text; cross-reference Phase 2 secret-injection-class.md and capability-dir-scan-rule.md>

## Supersedes
- `local:records/evidence/vnstock-data/installer-prior-notes.md` — prior claim that installer reads `~/.vnstock/user.json` was empirically disproved. Installer reads `VNSTOCK_API_KEY` env var. Package imports as `vnstock_data`, not `vnstock`. Install method is the vendor `.run` script, not `pip install`.

## Source
- Operator: <handle>
- Plan: `plans/260508-2030-vnstock-install-resume/`
- Phase: 3
```

Actual envelope shape for the 20260508T171112Z blocked rerun:

```markdown
---
record_type: evidence
capability: vnstock-data
dimension: install
scope: sandbox
validation_status: failed
claim_support: does-not-support
secret_injection_class: api-key-via-shell-env-var
installer_url_class: vnstocks-official-download
static_dimension_consistency: not-evaluable
substrate: ephemeral-temp-dir-plus-runner-venv-plus-installer-venv
---
```

### 3.6 Transcript audit

Before closing the phase, scan agent transcript (output buffer + saved evidence file + all `*.log` files captured) for the literal API key value. The check is structural: ensure the value is never present as a substring anywhere the agent generated text or any log was tee'd. If found, abort the phase, redact, and investigate which step leaked it.

### 3.7 Validate

Run `pnpm validate:records` and `pnpm check`. Both must pass. Validator should accept the new envelope including `secret_injection_class`, `installer_url_class`, and `static_dimension_consistency` fields if Phase 2 added them as allowed fields; if validator rejects, treat as Phase 2 incompleteness and patch the schema before proceeding.

## Success Criteria

- [x] Operator-side env-var injection completed; agent inherits and pre-flight passes
- [x] Approval gate obtained before download/exec action
- [x] Installer downloaded and inspected; flag set matches prior evidence (or divergence is documented)
- [x] Installer executed via env-var contract; venv created at `$VNSTOCK_VENV_PATH`
- [ ] `from vnstock_data import Reference; Reference()` succeeds in the installer-created venv
- [x] New evidence file created with failed outcome, `secret_injection_class: api-key-via-shell-env-var`, `installer_url_class: vnstocks-official-download`, `static_dimension_consistency: not-evaluable`, and `## Supersedes` section
- [x] Static Dimension Consistency block records that runtime entry-class shape was not evaluable because install was vendor-blocked
- [x] Process-Side Findings block records env-var inheritance outcome
- [x] Prior `experiment-install-20260508T101723Z.md` unmodified
- [x] `installer-prior-notes.md` not deleted (Q4 rule: trust the claims-first scan; superseded files stay on disk)
- [x] Agent transcript audit: zero literal API key value printed in agent/tool output; temp-local vendor config files contained the key and were deleted with substrate
- [x] `pnpm validate:records` passes
- [x] `pnpm check` passes

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Env-var inheritance fails (agent launched in separate process) | high | Pre-flight check at top of 3.4 halts cleanly with operator-recovery instructions; this was the documented blocker on the prior Phase 3 run |
| Agent inadvertently echoes `$VNSTOCK_API_KEY` in a debug print or log | high | Phase instructions explicitly forbid echoing; transcript audit step 3.6 covers tee'd logs too; redact and re-run if found |
| Approval gate skipped under "small-step" reasoning | high | Protocol non-negotiable; if missed, phase invalid and must rerun |
| `curl` fails / installer URL changed | medium | Record exit code; the URL itself is a class label (`vnstocks-official-download`) — if replaced, file as new evidence and update class label |
| Installer flag contract changed (now exposes `--api-key` etc.) | medium | Document divergence in Observations; flag contract change is a vendor-side update, not a planner error; future loop iterations may shift to flag-driven if the env-var path is deprecated |
| Installer creates venv at unexpected path | low | Capture actual path from install.log; use that path for verify step |
| Snapshot diverges from runtime (Reference renamed in newer release) | medium | Record divergence in `static_dimension_consistency: diverges-from-snapshot`; snapshot's caveat says runtime wins; feeds next plan iteration |
| `secret_injection_class` / `installer_url_class` / `static_dimension_consistency` fields rejected by validator | medium | Phase 2 must add fields to allowed envelope schema; if rejected, patch validator first |
| `pip install vnstock_data` attempted accidentally | low | Phase 3.4 explicitly forbids pip install; the package is subscriber-only and not on public PyPI; use vendor script only |
| Installer requires interactive prompts on this version | low | Inspect `--help` output first (3.4); if `--noninteractive` is needed and missing, document and stop |
| UTC timestamp collision with prior file | very low | New run is hours/days later; format ensures uniqueness |
