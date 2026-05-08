---
phase: 3
title: "Experiment Rerun"
status: pending
priority: P1
effort: "1.5h"
dependencies: [2]
---

# Phase 3: Experiment Rerun

## Overview

Rerun the install experiment for `vnstock-data` using the env-var-driven installer contract proven by the prior failed run. Operator's shell injects `VNSTOCK_API_KEY` into the agent process environment via `read -s`. Agent never reads or echoes the value. Capture a new evidence envelope with `secret_injection_class` field and a `## Supersedes` section that disproves the prior `installer-prior-notes.md` claim.

## Requirements

- Functional: new evidence file at `records/evidence/vnstock-data/experiment-install-<UTC>.md` with `validation_status: supports`, envelope field `secret_injection_class: api-key-via-shell-env-var`, and `## Supersedes` section linking to `installer-prior-notes.md`. Existing experiment-install-20260508T101723Z.md remains unchanged (read-only input, archived disproof).
- Non-functional: agent transcript contains zero literal API key value. Substrate (temp dir, venv) is disposable. Approval gate per Runtime Validation Request Protocol must be obtained before any network/import action.

## Architecture

```
operator shell                          agent process
─────────────                           ─────────────
read -s VNSTOCK_API_KEY      ─────►     VNSTOCK_API_KEY in env (never read by agent)
export VNSTOCK_API_KEY                  │
invoke agent                            ▼
                                        substrate: mktemp -d
                                        python -m venv .venv
                                        pip install vnstock
                                        python -c "from vnstock import Vnstock; ..."
                                        │
                                        ▼
                                        records/evidence/vnstock-data/
                                        experiment-install-<UTC>.md
                                        ├── secret_injection_class: api-key-via-shell-env-var
                                        ├── validation_status: supports
                                        └── ## Supersedes → installer-prior-notes.md
```

## Related Code Files

- **Create:** `records/evidence/vnstock-data/experiment-install-<UTC>.md` (UTC = ISO timestamp at run time)
- **Read for context:** `records/evidence/vnstock-data/experiment-install-20260508T101723Z.md` (prior disproof; envelope shape reference)
- **Read for context:** `records/evidence/vnstock-data/installer-prior-notes.md` (claim to be superseded)
- **Read for context:** `records/evidence/meta/secret-injection-class.md` (Phase 2 output; class label source)
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
```

Then invoke the agent in the same shell so the env var is inherited.

The agent does NOT execute the `read -s` step. The agent's instructions for this experiment must explicitly state: assume `VNSTOCK_API_KEY` is already exported in the inherited environment. Agent may verify `[ -n "$VNSTOCK_API_KEY" ]` but MUST NOT echo, log, or print the value.

### 3.2 Agent intake (per claims-first rule from Phase 2.5)

Agent reads in this order:
1. Claim file for `vnstock-data` capability
2. Prior experiment evidence (20260508T101723Z) referenced via `record_ref`
3. `installer-prior-notes.md` (referenced by claim) — note it is the file to be superseded
4. Pre-experiment scan of `records/evidence/meta/` for `## Trigger` matching `next-install-experiment` event class. Hits: `install-experiment-template-gap.md` (N=2 threshold — this is the second case, so per-trigger guidance applies: compare envelope shapes against the first run; if repeated fields appear, draft template candidate as an addendum to that meta-evidence file in Phase 4 if applicable)

### 3.3 Request approval (Runtime Validation Request Protocol)

Agent emits a structured approval request specifying:
- scope: `sandbox`
- dimension: `install`
- substrate: ephemeral temp dir
- network: `pypi.org` for pip install only
- secrets: `VNSTOCK_API_KEY` already injected by operator (no agent-side handling)
- expected output: metadata-only evidence envelope (no captured response payloads beyond shape/types)

Operator approves before any network or import action.

### 3.4 Execute experiment

Substrate steps (all in ephemeral temp dir, all logged in evidence):

```bash
WORKDIR=$(mktemp -d)
cd "$WORKDIR"
python -m venv .venv
. .venv/bin/activate
pip install vnstock 2>&1 | tee install.log
python - <<'PY'
import os
assert os.environ.get("VNSTOCK_API_KEY"), "env var missing"
from vnstock import Vnstock
v = Vnstock()
# minimal smoke check — call shape only, do not print response payload
result = v.stock(symbol="VCB", source="VCI")
print(type(result).__name__)
PY
deactivate
```

Capture install.log (truncated to non-sensitive lines), python output, and exit codes.

### 3.5 Write evidence envelope

New file `records/evidence/vnstock-data/experiment-install-<UTC>.md` (use actual UTC timestamp at write time, format `YYYYMMDDTHHMMSSZ`).

Envelope shape (mirroring prior file plus new fields):

```markdown
---
record_type: evidence
capability: vnstock-data
dimension: install
scope: sandbox
validation_status: supports
secret_injection_class: api-key-via-shell-env-var
created: "<UTC ISO 8601>"
substrate: ephemeral-temp-dir
---

# Install Experiment — vnstock-data — <UTC>

## Summary
<one-line outcome>

## Substrate
<temp dir path, venv version, pip version>

## Steps Executed
<numbered list mirroring 3.4>

## Observations
- pip install vnstock: exit 0
- import vnstock: success
- Vnstock().stock(...) call shape: <type name only>
- env var presence verified: yes (value never read or echoed)

## Disproof / Confirmation Notes
<any deviations from claim text; cross-reference Phase 2 secret-injection-class.md>

## Supersedes
- `local:records/evidence/vnstock-data/installer-prior-notes.md` — prior claim that installer reads `~/.vnstock/user.json` was empirically disproved by this run plus the prior 20260508T101723Z run. Installer reads `VNSTOCK_API_KEY` env var.

## Source
- Operator: <handle>
- Plan: `plans/260508-2030-vnstock-install-resume/`
- Phase: 3
```

### 3.6 Transcript audit

Before closing the phase, scan agent transcript (output buffer + saved evidence file) for the literal API key value. The check is structural: ensure the value is never present as a substring anywhere the agent generated text. If found, abort the phase, redact, and investigate which step leaked it.

### 3.7 Validate

Run `pnpm validate:records` and `pnpm check`. Both must pass. Validator should accept the new envelope including the new `secret_injection_class` field if Phase 2 added it as an allowed field; if validator rejects, treat that as Phase 2 incompleteness and patch the schema before proceeding.

## Success Criteria

- [ ] Operator-side env-var injection completed; agent inherits but never reads the value
- [ ] Approval gate obtained before network/import action
- [ ] New evidence file created with `validation_status: supports`, `secret_injection_class: api-key-via-shell-env-var`, and `## Supersedes` section
- [ ] Prior `experiment-install-20260508T101723Z.md` unmodified
- [ ] `installer-prior-notes.md` not deleted (Q4 rule: trust the claims-first scan; superseded files stay on disk)
- [ ] Agent transcript audit: zero literal API key value
- [ ] `pnpm validate:records` passes
- [ ] `pnpm check` passes

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Agent inadvertently echoes `$VNSTOCK_API_KEY` in a debug print | high | Phase instructions explicitly forbid echoing; transcript audit step 3.6 catches it; redact and re-run if found |
| Approval gate skipped under "small-step" reasoning | high | Protocol is non-negotiable; if missed, phase is invalid and must rerun |
| pip install fails (network, package version) | medium | Capture log; if package-side, file as new disproof evidence and stop — do not workaround silently |
| `secret_injection_class` field rejected by validator | medium | Phase 2 must add field to allowed envelope schema; if rejected, patch validator first |
| `Vnstock().stock(...)` smoke call returns payload that contains key fragments | low | Print only `type(result).__name__`, never the payload; if structural inspection needs more, document why and audit |
| UTC timestamp collision with prior file | very low | New run is hours/days later; format ensures uniqueness |
