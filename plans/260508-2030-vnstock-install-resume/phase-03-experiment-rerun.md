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

Rerun the install experiment for `vnstock-data` using the env-var-driven installer contract proven by the prior failed run. Operator's shell injects `VNSTOCK_API_KEY` into the agent process environment via `read -s`. Agent never reads or echoes the value. Capture a new evidence envelope with `secret_injection_class` field, `static_dimension_consistency` field (does runtime alignment with the unified-ui-snapshot hold?), and a `## Supersedes` section that disproves the prior `installer-prior-notes.md` claim. Package import shape (`from vnstock_data import Reference`) per the unified-ui-snapshot evidence, surfaced via Phase 2.6 Q6 capability-dir scan rule.

## Requirements

- Functional: new evidence file at `records/evidence/vnstock-data/experiment-install-<UTC>.md` with `validation_status: passed`, `claim_support: supports`, envelope fields `secret_injection_class: api-key-via-shell-env-var` and `static_dimension_consistency: matches-snapshot | diverges-from-snapshot`, and `## Supersedes` section linking to `installer-prior-notes.md`. Existing experiment-install-20260508T101723Z.md remains unchanged (read-only input, archived disproof).
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
                                        pip install vnstock_data
                                        python -c "from vnstock_data import Reference; Reference()"
                                        │
                                        ▼
                                        records/evidence/vnstock-data/
                                        experiment-install-<UTC>.md
                                        ├── secret_injection_class: api-key-via-shell-env-var
                                        ├── static_dimension_consistency: matches-snapshot
                                        ├── validation_status: supports
                                        └── ## Supersedes → installer-prior-notes.md
```

## Related Code Files

- **Create:** `records/evidence/vnstock-data/experiment-install-<UTC>.md` (UTC = ISO timestamp at run time)
- **Read for context:** `records/evidence/vnstock-data/experiment-install-20260508T101723Z.md` (prior disproof; envelope shape reference)
- **Read for context:** `records/evidence/vnstock-data/installer-prior-notes.md` (claim to be superseded)
- **Read for context:** `records/evidence/vnstock-data/unified-ui-snapshot/README.md` (snapshot purpose; "runtime wins on disagreement" caveat)
- **Read for context:** `records/evidence/vnstock-data/unified-ui-snapshot/00-migration-guide.md` (Unified UI rationale; class-name mapping)
- **Read for context:** `records/evidence/vnstock-data/unified-ui-snapshot/01-reference-layer.md` (canonical `from vnstock_data import Reference` shape)
- **Read for context:** `records/evidence/meta/secret-injection-class.md` (Phase 2 output; class label source)
- **Read for context:** `records/evidence/meta/capability-dir-scan-rule.md` (Phase 2 output; rule that surfaced the snapshot)
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

### 3.2 Agent intake (per claims-first + capability-dir scan rules from Phase 2.6)

Agent reads in this order:
1. Claim file for `vnstock-data` capability
2. Prior experiment evidence (20260508T101723Z) referenced via `record_ref`
3. `installer-prior-notes.md` (referenced by claim) — note it is the file to be superseded
4. **Capability-dir scan (Q6)**: list everything in `records/evidence/vnstock-data/` not yet read. Hits: `unified-ui-snapshot/` directory. Read its `README.md`, `00-migration-guide.md`, and `01-reference-layer.md`. Note the snapshot caveat: "installed subscriber runtime inspection wins when behavior differs". The Phase 3 import shape (`from vnstock_data import Reference`) comes from this snapshot.
5. **Pre-experiment meta scan (Q5 R2)**: scan `records/evidence/meta/` for `## Trigger` matching `next-install-experiment` event class. Hits: `install-experiment-template-gap.md` (N=2 threshold — this is the second case, so per-trigger guidance applies: compare envelope shapes against the first run; if repeated fields appear, draft template candidate as an addendum to that meta-evidence file in Phase 4 if applicable). Also: `secret-injection-class.md` (Phase 2 output) and `capability-dir-scan-rule.md` (Phase 2 output) provide direct rule context.

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
pip install vnstock_data 2>&1 | tee install.log
python - <<'PY'
import os
assert os.environ.get("VNSTOCK_API_KEY"), "env var missing"
from vnstock_data import Reference
r = Reference()
print(type(r).__name__)
# Static-dimension consistency check: confirm the entry-class shape from the snapshot
# (Reference, Market, Fundamental, Macro, Analytics, Insights are top-level imports)
import vnstock_data
expected = {"Reference", "Market", "Fundamental", "Macro", "Analytics", "Insights"}
present = expected & set(dir(vnstock_data))
print("snapshot_classes_present:", sorted(present))
print("snapshot_classes_missing:", sorted(expected - present))
PY
deactivate
```

Capture install.log (truncated to non-sensitive lines), python output, and exit codes.

If `pip install vnstock_data` fails (e.g., subscriber-only package not on public PyPI), document the failure mode and stop — that is itself a disproof finding for the install dimension. Do not work around silently.

If import succeeds but `Reference` is not in `vnstock_data`'s top-level namespace, set `static_dimension_consistency: diverges-from-snapshot` and record the actual entry-class shape. Per snapshot caveat, runtime wins.

### 3.5 Write evidence envelope

New file `records/evidence/vnstock-data/experiment-install-<UTC>.md` (use actual UTC timestamp at write time, format `YYYYMMDDTHHMMSSZ`).

Envelope shape (mirroring prior file plus new fields):

```markdown
---
record_type: evidence
capability: vnstock-data
dimension: install
scope: sandbox
validation_status: passed
claim_support: supports
secret_injection_class: api-key-via-shell-env-var
static_dimension_consistency: matches-snapshot
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
- pip install vnstock_data: exit 0
- import vnstock_data: success
- Reference() construction: type name <recorded>
- snapshot entry-class presence: <list of present classes>
- env var presence verified: yes (value never read or echoed)

## Static Dimension Consistency
- Reference snapshot: `local:records/evidence/vnstock-data/unified-ui-snapshot/01-reference-layer.md` @ upstream commit 6adcd80
- Runtime shape: <matches | diverges>
- Divergences (if any): <list>

## Disproof / Confirmation Notes
<any deviations from claim text; cross-reference Phase 2 secret-injection-class.md and capability-dir-scan-rule.md>

## Supersedes
- `local:records/evidence/vnstock-data/installer-prior-notes.md` — prior claim that installer reads `~/.vnstock/user.json` was empirically disproved by this run plus the prior 20260508T101723Z run. Installer reads `VNSTOCK_API_KEY` env var. Package imports as `vnstock_data`, not `vnstock`.

## Source
- Operator: <handle>
- Plan: `plans/260508-2030-vnstock-install-resume/`
- Phase: 3
```

### 3.6 Transcript audit

Before closing the phase, scan agent transcript (output buffer + saved evidence file) for the literal API key value. The check is structural: ensure the value is never present as a substring anywhere the agent generated text. If found, abort the phase, redact, and investigate which step leaked it.

### 3.7 Validate

Run `pnpm validate:records` and `pnpm check`. Both must pass. Validator acceptance must be tested before marking Phase 3 complete. `secret_injection_class`, `static_dimension_consistency`, and `claim_support` are evidence-envelope fields in markdown/frontmatter, not schema-backed fields from Phase 2. If validators reject them, stop and resolve the schema/policy mismatch before proceeding.

## Success Criteria

- [ ] Operator-side env-var injection completed; agent inherits but never reads the value
- [ ] Approval gate obtained before network/import action
- [ ] New evidence file created with `validation_status: passed`, `claim_support: supports`, `secret_injection_class: api-key-via-shell-env-var`, `static_dimension_consistency: <matches|diverges>-snapshot`, and `## Supersedes` section
- [ ] Static Dimension Consistency block records actual runtime entry-class shape vs snapshot
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
| `pip install vnstock_data` fails (subscriber-only package, not on public PyPI, version pinning) | medium | Capture log; if package-side, file as new disproof evidence and stop — do not workaround silently |
| Snapshot diverges from runtime (e.g., Reference renamed in newer release) | medium | Record divergence in `static_dimension_consistency: diverges-from-snapshot`; the snapshot's own caveat says runtime wins; this becomes input for next plan iteration |
| `secret_injection_class`, `static_dimension_consistency`, or `claim_support` field rejected by validator | medium | Stop and resolve the schema/policy mismatch before proceeding |
| `Reference()` constructor requires arguments not in snapshot examples | low | Snapshot examples consistently show `Reference()` no-arg; if it errors, capture the error and treat as divergence input |
| UTC timestamp collision with prior file | very low | New run is hours/days later; format ensures uniqueness |
