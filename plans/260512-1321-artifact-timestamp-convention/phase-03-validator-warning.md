---
phase: 3
title: "Validator Warning"
status: completed
priority: P2
effort: "15m"
dependencies: ["1", "2"]
---

# Phase 3: Validator Warning

## Context Links

- Brainstorm: `plans/reports/brainstorm-260512-1310-artifact-timestamp-unification.md`
- Validator: `tools/validate-records/validate-records.js`
- Record loader: `tools/validate-records/record-loader.js`
- Record validation rules: `tools/validate-records/record-validation-rules.js`

## Overview

Add a filename-pattern check to the validator that emits warnings (not blocking errors) when new artifacts in `decisions/`, `experiments/`, or `risks/` use the old full-year timestamp format or lack a timestamp entirely.

## Requirements

### Warning behavior (non-blocking)

For files in `records/decisions/`, `records/experiments/`, `records/risks/`:
- If filename does NOT match `/<prefix>-\d{6}T\d{4}Z-/`, emit a warning.
- Prefixes: `decision`, `experiment`, `risk`
- The regex checks for `YYMMDDTmmZ` (6 digits + T + 4 digits + Z = 13 chars)

For files in `records/claims/`, `records/capabilities/`:
- No timestamp check. These are intentionally timeless.

### Pre-convention exemption

Existing pre-convention files (full-year timestamps, date-only, no timestamp) must NOT trigger warnings. The simplest way: only check files created AFTER the convention decision date.

Since we don't have file-creation metadata in the validator, use a hardcoded cutoff: files with timestamps >= `20260508` in full-year format are pre-convention and exempt. Files with short-year format `260512` or later follow the convention.

Simpler approach: only warn on files that match the OLD pattern but not the new one, AND were created after the convention date. But the validator doesn't know creation dates.

Pragmatic approach: warn on any decision/experiment/risk file whose basename does NOT match the short-year pattern AND does NOT match known pre-convention full-year patterns. But that's complex.

Simplest correct approach: maintain a list of pre-convention filenames that are exempt. Or: only warn on files whose basename contains a full-year date pattern (`20\d{6}` or `2026\d{4}`) — these are clearly old format. Files with NO timestamp at all in decisions/experiments/risks should also warn.

Actually, the cleanest approach:
- Files in decisions/experiments/risks with `20\d{6}T` pattern (full-year datetime) → warn: "uses deprecated full-year timestamp format; use YYMMDDTmmZ"
- Files in decisions/experiments/risks with no timestamp pattern at all → warn: "missing timestamp; event-like artifacts should use YYMMDDTmmZ"
- Files with `\d{6}T\d{4}Z` (short-year) → pass

This catches:
- `decision-20260508-loop-dimension-model.yaml` → warns (full-year)
- `experiment-meta-install-template-candidate-260512T0046Z.yaml` → pass (short-year)
- `decision-260512T1310Z-artifact-timestamp-convention.yaml` → pass (short-year)

### Implementation location

Add a new module: `tools/validate-records/filename-convention-validation.js`

Export a function `validateFilenameConventions(records)` that returns warnings as strings.

Call it from `validate-records.js` and print warnings separately from errors.

### Warning output format

Warnings print to stderr but do NOT cause exit 1.

```
Warning: records/decisions/decision-20260508-loop-dimension-model.yaml uses deprecated full-year timestamp format; use YYMMDDTmmZ
Warning: records/experiments/experiment-product-build-fastapi-reference-20260511T003000Z.yaml uses deprecated full-year timestamp format; use YYMMDDTmmZ
```

## Related Code Files

- Create: `tools/validate-records/filename-convention-validation.js`
- Modify: `tools/validate-records/validate-records.js`

## Implementation Steps

1. Create `filename-convention-validation.js` with regex-based warning logic.
2. Modify `validate-records.js` to import and call the new function.
3. Print warnings to stderr after the success message.
4. Ensure warnings do not affect exit code.

## Success Criteria

- [ ] Validator emits warnings for all pre-convention full-year decision/experiment/risk files
- [ ] Validator emits no warnings for short-year format files
- [ ] Validator emits no warnings for claims or capabilities
- [ ] `pnpm validate:records` still exits 0 when only warnings are present
- [ ] `pnpm validate:records` still exits 1 when actual errors are present

## Risk Assessment

- **Risk:** Warning spam on every validation run may be annoying.
  **Mitigation:** Warnings are correct — those files ARE pre-convention. Once they age out or get migrated, warnings disappear. Number of pre-convention files is small (~15).
- **Risk:** Regex may false-positive on edge-case filenames.
  **Mitigation:** Keep regex tightly scoped to the basename prefix patterns.
