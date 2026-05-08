---
name: vnstock-install-knowledge-encoding
description: Brainstorm report on encoding vnstock install knowledge into the learning loop at process and meta levels.
type: report
date: 2026-05-08
---

# Brainstorm: Encode vnstock Install Knowledge into Learning Loop

## Summary

Encode the verified vnstock install method so future cleared-context agents can install without re-exploring, and the learning loop treats this as settled knowledge rather than "unsure." The solution is a full claim → experiment → knowledge-pack chain with specific metadata-only output classes.

## Problem Statement

- Raw evidence exists: `records/evidence/vnstock-data/installer-prior-notes.md` and `unified-ui-snapshot/`
- No claim, experiment, or knowledge pack exists for vnstock
- Future agents must re-explore the install process (non-standard: pip + external script + API key)
- The loop has no verified dimension, so it cannot answer "can we install vnstock?" with certainty

## Requirements

1. **Process-side:** Future agents with cleared context can discover and execute the install without exploring scripts
2. **Meta-side:** Loop encodes the install as verified experimentation and does not revert to "unsure"
3. **Security:** External script download is a boundary; must be risk-recorded and scoped
4. **Cleanup:** Temp venv/temp home must be created and deleted as part of proof

## Gap Analysis

### Process-Side Gaps

| Gap | Impact |
|-----|--------|
| `installer-prior-notes.md` is prose evidence, not a structured recipe | Agents must interpret; no executable certainty |
| No knowledge pack for vnstock-data | Verified knowledge has no consumer-facing artifact |
| No capabilities.yaml install entry | Agents scanning packs find nothing about vnstock |
| No structured install command sequence in pack | Each agent must rediscover exact steps |

### Meta-Side Gaps

| Gap | Impact |
|-----|--------|
| No claim record | Loop has no assertion to verify |
| No experiment record | Install dimension has no proof |
| No human approval | `install` dimension validation requires `requires_human_approval: true` + `approval_status: approved` |
| No risk record | External script download is unrecorded security boundary |
| No knowledge pack manifest | Publication gate cannot be evaluated |

## Evaluated Approaches

### Approach 1: Full Loop Integration (Selected)

Create claim → run approved install experiment → update claim dimension → publish knowledge pack.

- **Pros:** Fully compliant with loop architecture; pack is the intended consumer artifact; loop never becomes "unsure" again
- **Cons:** Requires actual experiment execution and human approval

### Approach 2: Recipe Script + Loop Integration

Same as Approach 1, plus standalone install script in `tools/install-recipes/`.

- **Pros:** Agents execute script directly without parsing YAML
- **Cons:** Extra file to maintain; no precedent in operator guide for install-recipes directory

### Approach 3: Evidence-Only (Rejected)

Keep everything in `installer-prior-notes.md`. Skip claim, experiment, pack.

- **Pros:** Minimal work
- **Cons:** Violates loop design; agents re-interpret prose each time; no verification; loop stays permanently uncertain

## Final Recommended Solution

Approach 1 with specific metadata-only output classes.

### Install Experiment Metadata Specification

Per `docs/operator-guide.md` Runtime Artifact Standard, the install experiment captures metadata only with these classes:

**Allowed outputs (captured into evidence envelope):**

| Class | Description |
|-------|-------------|
| `package-metadata` | Package name, version string, author, license from pip metadata |
| `import-verification` | Boolean: `import vnstock` succeeds in temp venv |
| `module-symbol-list` | Top-level modules/classes available (names only, no invocation) |
| `dependency-list` | Required dependencies from package metadata (names only) |
| `install-command-success` | Exit codes of pip install and script download steps |
| `script-download-url-class` | URL class label (e.g. `github-raw-tcbs`) not the literal URL |

**Blocked outputs (explicitly excluded):**

| Class | Reason |
|-------|--------|
| `raw-external-data` | No provider data capture at install gate |
| `api-credentials` | API key stays in env; never captured |
| `config-contents` | `~/.tcbs/` contents forbidden |
| `install-logs` | pip verbose logs may contain paths/env |
| `live-api-calls` | No runtime method calls during install gate |
| `private-artifacts` | No wheel files, downloaded scripts, or venv binaries retained |
| `temp-dirs` | No literal temp paths in durable evidence |
| `venvs` | Temp venv deleted after proof; not referenced by path |

### Evidence Envelope Requirements

The experiment evidence file must include:

- `run_id`: `runtime-YYYYMMDD-HHMMSS-<random>`
- `temp_root_class`: `os-temp-outside-repo`
- `approval_gate`: `install-import`
- `command_class`: `temp-venv-install`
- `allowed_outputs`: `[package-metadata, import-verification, module-symbol-list, dependency-list, install-command-success, script-download-url-class]`
- `blocked_outputs`: `[raw-external-data, api-credentials, config-contents, install-logs, live-api-calls, private-artifacts, temp-dirs, venvs]`
- `cleanup_status`: `succeeded`
- `temp_root_deleted`: `true`

### Experiment Steps

1. Create disposable temp directory outside repo (`/tmp/learning-loop-run-<run_id>`)
2. Create temp venv inside temp directory
3. Run `pip install vnstock` in temp venv
4. Download external TCBS script (as required by package)
5. Verify `python -c "import vnstock; print(vnstock.__version__)"` succeeds
6. Capture allowed metadata only
7. Delete temp directory
8. Record cleanup confirmation

### Claim Structure

```yaml
id: claim-vnstock-install-sandbox
verification:
  static:
    status: claimed
    reason: Static docs inspection pending.
    proof_refs: []
  install:
    status: verified
    scope: sandbox
    reason: Install succeeded in temp venv with metadata-only output.
    proof_refs:
      - record:experiment-vnstock-install-sandbox
  runtime:
    status: claimed
    scope: sandbox
    output: metadata-only
    reason: Runtime proof not run yet.
    proof_refs: []
  product:
    status: claimed
    reason: Product use not approved.
    decision_refs: []
  blocked_actions:
    - live-provider-calls
    - credential-capture
    - raw-data-export
```

### Experiment Structure

```yaml
id: experiment-vnstock-install-sandbox
scope: install
verification:
  claim_refs:
    - record:claim-vnstock-install-sandbox
  proves:
    - dimension: install
      scope: sandbox
      output_level: metadata-only
  requires_human_approval: true
  approval_status: approved
```

### Knowledge Pack Structure

`knowledge-packs/vnstock-data/manifest.yaml`:
- `id: vnstock-data`
- `domain: vnstock`
- `status: approved` (after experiment succeeds)
- Publication gate: `min_assurance: install`, `scope: sandbox`

`knowledge-packs/vnstock-data/facts.yaml`:
- Fact: vnstock install method (pip + external script)
- `record_ref: record:experiment-vnstock-install-sandbox`

`knowledge-packs/vnstock-data/capabilities.yaml`:
- Capability: `install-vnstock` — install package in sandbox scope
- Capability: `import-vnstock` — import package after install

## Implementation Considerations

- Human approval required before running install experiment (per operator guide)
- Temp directory must be outside repo and deleted after proof
- API key at `~/.tcbs/` is pre-existing env state; do not capture contents
- External script download is the main security boundary; risk record required
- `pnpm check` must pass after all records created

## Risk Assessment

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| External script from third-party source | medium | high | Sandbox scope, temp venv, no credential capture, delete after proof |
| Install pollutes real environment | low | low | Temp venv + temp home isolation |
| Cleanup fails, temp artifacts remain | low | medium | Cleanup is part of proof success; fail-closed rule |

## Success Criteria

- [ ] `pnpm validate:records` passes with new claim, experiment, risk, and pack records
- [ ] Install experiment executed with approved human gate
- [ ] Temp directory created and deleted
- [ ] Evidence envelope captures allowed metadata only
- [ ] Knowledge pack `vnstock-data` created with manifest, facts, capabilities
- [ ] Future agent reading `knowledge-packs/vnstock-data/capabilities.yaml` knows install steps without re-exploring

## Scope Decision: Option A (Capture-and-Defer)

Meta-loop improvements are deferred. This session focuses on vnstock implementation only. Observations about loop gaps are captured as evidence in `records/evidence/meta/` during implementation, then elevated to claims/risks/experiments in a follow-up self-improvement cycle.

Reason: Canonical schema/doc changes require explicit decision approval per operator guide. Deriving the improvement from real use (vnstock pack) produces stronger evidence than inventing in a vacuum.

## Meta-Loop Improvement Observations

These surfaced during brainstorming. Capture as evidence during implementation, then process in a self-improvement session.

| # | Observation | Where to Capture | Proposed Improvement |
|---|-------------|------------------|---------------------|
| 1 | User confusion: "not sure about the output artifact" | `records/evidence/meta/process-side-artifact-ambiguity.md` | Operator guide should state that **knowledge pack = process-side artifact** for cleared-context agents |
| 2 | `capabilities.yaml` has no schema (`capabilities: []`) | `records/evidence/meta/capability-schema-gap.md` | Define capability record schema after deriving it from real vnstock pack |
| 3 | First install experiment in repo; no template exists | `records/evidence/meta/install-experiment-template-gap.md` | Create reusable install experiment template from vnstock execution |
| 4 | "Runtime Artifact Standard" says envelope fields live as markdown until repeated cases prove pattern | `records/evidence/meta/runtime-run-schema-deferral.md` | This install case may justify a generic `runtime_run` YAML schema |

## Next Steps

### Vnstock Implementation

1. Create risk record for external script download
2. Create claim record for vnstock installability
3. Request human approval for install experiment
4. Execute install experiment in temp venv with metadata capture
5. Create experiment record with `verification.proves`
6. Update claim: `install.status: verified`
7. Create `knowledge-packs/vnstock-data/` with manifest, facts, capabilities
8. Run `pnpm check`

### During Implementation: Capture Meta Evidence

9. Write `records/evidence/meta/process-side-artifact-ambiguity.md` — document the artifact confusion and resolution
10. Write `records/evidence/meta/capability-schema-gap.md` — document the schema-less capabilities.yaml
11. Write `records/evidence/meta/install-experiment-template-gap.md` — document what a reusable template needs
12. Write `records/evidence/meta/runtime-run-schema-deferral.md` — document whether this case justifies schema formalization

### After Plan Implementation: Next Action to Improve the Skill

13. Create meta claim: *"Learning loop needs a documented capability schema and install experiment template"*
14. Create meta experiment: Derive schema from vnstock pack, propose template
15. Create meta decision: Approve or reject schema/template adoption
16. Update operator guide / lab model if approved

## Unresolved Questions

- Should the `static` dimension also be verified via docs snapshot inspection before the install experiment?
- Should a separate `runtime` experiment be planned now, or deferred until runtime capabilities are needed?
- Does the vnstock-data pack need a `product` decision before any product code generation, or is sandbox-only sufficient for now?
