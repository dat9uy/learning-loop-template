---
phase: 4
title: "Pack Verification"
status: pending
priority: P1
effort: "45m"
dependencies: [3]
---

# Phase 4: Pack Verification

## Overview

Promote the `vnstock-data` knowledge pack from draft to verified now that the install dimension has supporting evidence under sandbox scope. Update the claim's install-dimension verification record to cite the new evidence file. Run final validators and confirm transcript audit. This phase produces the agent-facing artifact (per `process-side-artifact-ambiguity.md` meta-evidence) that future agents will consume when asked about vnstock-data capability.

## Requirements

- Functional: claim file's install-dimension verification block updated with `record_ref` to the new evidence; pack `capabilities.yaml` (or equivalent) marked verified for install dimension under sandbox scope; `pnpm check` and `pnpm validate:records` pass; final transcript audit confirms zero literal API key.
- Non-functional: no schema additions (Phase 2 + Phase 3 already covered new fields). No changes to runtime/static/product dimensions — those remain unverified or out-of-scope.

## Architecture

```
records/claims/vnstock-data.md (or equivalent)
└── verification block
    └── install:
        scope: sandbox
        status: verified
        evidence: record_ref → records/evidence/vnstock-data/experiment-install-<UTC>.md

knowledge-packs/vnstock-data/
└── capabilities.yaml (or pack manifest)
    └── install: verified (sandbox)

Phase 2 meta-evidence trigger fires:
└── install-experiment-template-gap.md
    └── threshold N=2 reached (this run is case #2)
    └── Action: compare envelopes, draft template candidate if repeated fields appear
        (addendum work — does NOT block this phase)
```

## Related Code Files

- **Modify:** `records/claims/vnstock-data.md` (or actual claim file path; locate via `pnpm` script or grep)
- **Modify:** `knowledge-packs/vnstock-data/capabilities.yaml` (or actual manifest path)
- **Read for context:** `records/evidence/vnstock-data/experiment-install-<UTC>.md` (Phase 3 output)
- **Read for context:** `records/evidence/meta/install-experiment-template-gap.md` (trigger fires; addendum optional)
- **Read for context:** `docs/operator-guide.md` claim verification section
- **Read for context:** `package.json` scripts to identify exact verify/validate commands

## Implementation Steps

### 4.1 Locate claim and pack manifest

Identify exact paths:

```bash
ls records/claims/ | grep -i vnstock
ls knowledge-packs/ | grep -i vnstock
```

Read both files end-to-end before editing.

### 4.2 Update claim verification block

In the claim file, locate the install-dimension verification entry. Update:
- `status` → `verified`
- `scope` → `sandbox` (do not claim production)
- `evidence` (or `record_ref`) → path to Phase 3 evidence file
- preserve any existing fields (date, validator, etc.)

If the claim still cites `installer-prior-notes.md` directly, remove that citation — the new evidence's `## Supersedes` section is the authoritative pointer (per Q4 E rule). The `installer-prior-notes.md` file itself stays on disk untouched.

### 4.3 Promote pack manifest

In the pack manifest (`capabilities.yaml` or equivalent), update install-dimension entry to verified-under-sandbox. If the manifest schema is informal (per `capability-schema-gap.md` meta-evidence), use the same field shape as any existing verified capability in the repo; if no such precedent exists, mirror the claim file's verification block format and note the choice in the commit message.

Do NOT promote runtime, static, or product dimensions. Those remain at their prior status.

### 4.4 Run validators

```bash
pnpm validate:records
pnpm check
```

Both must pass. If either fails, fix and rerun before declaring the phase complete. Common failure modes: stale frontmatter, broken record_ref, missing required field on the new envelope.

If a `pnpm verify:claim` (or similar dimension-specific verification command) exists, run it for the install dimension of vnstock-data:

```bash
pnpm verify:claim vnstock-data --dimension install --scope sandbox
```

If no such command exists yet, the validators above are sufficient.

### 4.5 Final transcript audit

Re-scan the entire session transcript (Phase 3 + Phase 4) for the literal API key value. The audit must be conclusive: zero occurrences. Document the audit result in the commit message (e.g., "transcript audit: 0 occurrences of $VNSTOCK_API_KEY value").

### 4.6 Optional: address fired meta-evidence triggers

The Phase 3 run is the second install experiment, so `install-experiment-template-gap.md`'s N=2 trigger fires. Per the trigger guidance, compare envelope shapes between `experiment-install-20260508T101723Z.md` and the Phase 3 evidence:
- If shape is identical (same field set, same ordering), append a note to `install-experiment-template-gap.md` stating "N=2 reached; envelope shape stable; template candidate ready for Phase 5 of next loop iteration"
- If shape differs, append a note describing the divergence and defer template adoption
- This is an addendum, not a meta-claim promotion. Promotion requires explicit user decision.

This step is optional within Phase 4; if skipped, leave the trigger for the next install experiment to handle.

### 4.7 Commit

Create a focused commit covering:
- new evidence file (Phase 3)
- claim verification update
- pack manifest update
- any optional addendum from 4.6

Conventional commit format. No AI references. Include "transcript audit: 0 occurrences" in the body.

## Success Criteria

- [ ] Claim file install-dimension block: `status: verified`, `scope: sandbox`, evidence record_ref points to Phase 3 file
- [ ] Pack manifest: install dimension marked verified under sandbox
- [ ] `installer-prior-notes.md` citation removed from claim (file itself unchanged on disk)
- [ ] `pnpm validate:records` passes
- [ ] `pnpm check` passes
- [ ] `pnpm verify:claim` passes (if command exists)
- [ ] Final transcript audit: 0 occurrences of literal API key
- [ ] Commit landed with audit attestation in body

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Validator rejects pack promotion due to capability-schema-gap | medium | Schema is informal; mirror existing verified entry shape; if no precedent, document choice in commit and treat any validator failure as Phase 2 schema incompleteness |
| Claim file references prior evidence in multiple places | low | Grep for `installer-prior-notes.md` across `records/claims/` and update all references; do not delete the prior-notes file |
| Transcript audit finds key value | high | If found, abort phase. Identify leak source (which agent step). Redact, fix root cause, re-run Phase 3 with corrected instructions. Do NOT just delete the line — investigate why the leak happened |
| Pack manifest format unknown | medium | Read existing verified pack (if any) for reference; if vnstock-data is the first verified pack, this becomes the precedent and should be noted in commit |
| Commit accidentally includes substrate temp dir paths | low | Substrate temp dir is outside repo; only evidence file references it by path string. Verify with `git status` and `git diff --cached` before commit |
