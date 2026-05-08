---
phase: 4
title: "Pack Verification"
status: blocked
priority: P1
effort: "45m"
dependencies: [3]
---

# Phase 4: Pack Verification

## Overview

Pack verification is blocked. Phase 3 produced failed evidence, not supporting install evidence: `records/evidence/vnstock-data/experiment-install-20260508T171112Z.md` records a vendor device-limit stop before `vnstock_data` import verification. Do not promote the `vnstock-data` knowledge pack or mark the install dimension verified until a later rerun produces `validation_status: passed` and `claim_support: supports`.

## Requirements

- Functional: no claim or pack promotion from the failed Phase 3 evidence. A future rerun must first produce supporting install evidence, then this phase can be revised to update the claim verification block and pack manifest.
- Non-functional: no schema additions (Phase 2 + Phase 3 already covered new fields). No changes to runtime/static/product dimensions — those remain unverified or out-of-scope.

## Architecture

```
records/evidence/vnstock-data/experiment-install-20260508T171112Z.md
└── validation_status: failed
└── claim_support: does-not-support
└── blocker: vendor device-limit gate

records/claims/vnstock-data.md (or equivalent)
└── verification block
    └── install:
        scope: sandbox
        status: remains unverified / not promoted from failed evidence
        evidence: no supporting Phase 3 record_ref yet

knowledge-packs/vnstock-data/
└── capabilities.yaml (or pack manifest)
    └── install: remains unverified / blocked

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

### 4.2 Block claim verification update

Do not set the install dimension to `verified` from `experiment-install-20260508T171112Z.md`.

If updating the claim file, only record the failed evidence as a blocking/disproof reference if the repository has an established field for failed proof records. Do not remove historical references solely to make promotion possible. The `installer-prior-notes.md` file itself stays on disk untouched.

### 4.3 Block pack manifest promotion

Do not update install-dimension entry to verified-under-sandbox from failed evidence.

Runtime, static, and product dimensions also remain at their prior status.

### 4.4 Run validators

```bash
pnpm validate:records
pnpm check
```

Both must pass. If either fails, fix and rerun before declaring the phase complete. Common failure modes: stale frontmatter, broken record_ref, missing required field on the new envelope.

If a `pnpm verify:claim` command is used, it must preserve the install dimension as unverified or rejected/blocked per the repository's established semantics. Do not run an apply command that marks install verified.

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
- plan updates showing Phase 3 and Phase 4 blocked
- any claim/pack updates only if they preserve the blocked/unverified status
- any optional addendum from 4.6

Conventional commit format. No AI references. Include "transcript audit: 0 occurrences" in the body.

## Success Criteria

- [ ] Claim file install-dimension block remains unverified/blocked; no failed evidence is used as support
- [ ] Pack manifest install dimension remains unverified/blocked
- [ ] `installer-prior-notes.md` file unchanged on disk
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
