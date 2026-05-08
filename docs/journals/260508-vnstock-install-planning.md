# Journal: vnstock Install Knowledge Encoding — Planning Session

**Date:** 2026-05-08
**Type:** Planning
**Related:** `plans/reports/260508-1545-vnstock-install-knowledge-encoding.md`

## What Happened

Brainstormed how to encode vnstock install knowledge (non-standard: pip + external TCBS script + API key) into the learning loop at two levels:

1. **Process-side:** Future cleared-context agents must install without re-exploring
2. **Meta-side:** Loop must treat install as verified, not "unsure"

## Key Decisions

### Approach Selected: Full Loop Integration

Claim → approved install experiment → verified claim dimension → knowledge pack. Not a standalone script. The pack itself is the process-side artifact.

### Metadata-Only Specificity

Install experiment output classes defined explicitly:

- **Allowed:** package-metadata, import-verification, module-symbol-list, dependency-list, install-command-success, script-download-url-class
- **Blocked:** raw-external-data, api-credentials, config-contents, install-logs, live-api-calls, private-artifacts, temp-dirs, venvs

### Scope Decision: Option A (Capture-and-Defer)

Meta-loop improvements deferred to a separate self-improvement cycle. Vnstock implementation runs first; observations captured as evidence in `records/evidence/meta/` during execution.

### Key Insight: Knowledge Pack = Process-Side Artifact

The user's original confusion ("not sure about the output artifact") revealed the operator guide never states this explicitly. Documented as meta evidence: `records/evidence/meta/process-side-artifact-ambiguity.md`.

## Plan Created

`plans/plan.md` — 5 phases:

1. Setup Records (risk + claim)
2. Execute Install Experiment (temp venv, metadata capture)
3. Create Experiment Record + Verify Claim
4. Build Knowledge Pack (vnstock-data)
5. Validate + Capture Meta Evidence

## Impact

- First real install experiment in the repo
- First knowledge pack with structured capabilities
- Seeds future capability schema and install template improvements

## Next

Execute plan via `/ck:cook`. After completion, trigger self-improvement cycle for capability schema and install template.
