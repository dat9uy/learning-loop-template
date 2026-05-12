---
phase: 2
title: "Schema + Collapse"
status: pending
priority: P3
effort: "30m"
dependencies: [1]
---

# Phase 2: Schema + Collapse

## Overview

Atomic change: add the URI pattern to 5 schemas, remove the two now-redundant hand-roll branches, retarget the two negative-fixture expected strings. All three sub-changes must land together — partial application leaves the validator either silently weaker (pattern without fixture update) or noisier (fixture update without pattern). Single commit.

## Requirements

- Functional: AJV now enforces source-ref prefix grammar; hand-roll handles only ledger semantics.
- Non-functional: error wording for the two affected fixtures changes to AJV-native form (e.g., `/source_refs/0 pattern: must match pattern "^(local|record|pack|legacy):.+"`). Per the AJV-adoption decision, this is the accepted posture.

## Architecture

Pattern is anchored at AJV's `validateRecordSchemas` stage (runs first in `validateRecords`). Hand-roll `validateSourceRefs` continues to iterate `source_refs` for ledger checks; the `typeof !== "string"` guard stays as defense-in-depth (AJV `items.type: string` is now redundant but the guard costs nothing and decouples from schema state).

Key behavioral invariants preserved:
- `record:<id>` cross-record existence — hand-rolled (ledger).
- `local:<path>` realpath + repo-root containment + per-type allowlist — hand-rolled (filesystem, ledger).
- `legacy:<anything>` gated by `--allow-disallowed-fixtures` flag — hand-rolled (stateful).
- `pack:<id>` — hand-rolled is currently a no-op (no existence check today); pattern just enforces non-empty suffix. Behavior parity intact.

## Related Code Files

- Modify: `schemas/claim.schema.json`
- Modify: `schemas/experiment.schema.json`
- Modify: `schemas/decision.schema.json`
- Modify: `schemas/risk.schema.json`
- Modify: `schemas/capability.schema.json`
- Modify: `tools/validate-records/record-validation-rules.js` (delete lines ~89-93)
- Modify: `tools/validate-records/validate-records.js` (update lines 32, 46 expected strings)
- Read: `fixtures/negative/unsupported-source-ref/claims/unsupported-source-ref.yaml` (to predict AJV pattern error path)
- Read: `fixtures/negative/malformed-pack-ref/claims/claim-bad-pack-ref.yaml`

## Implementation Steps

1. **Schema pattern adoption.** In each of `schemas/claim.schema.json`, `schemas/experiment.schema.json`, `schemas/decision.schema.json`, `schemas/risk.schema.json`, `schemas/capability.schema.json`, change:
   ```json
   "source_refs": { "type": "array", "items": { "type": "string" } }
   ```
   to:
   ```json
   "source_refs": { "type": "array", "items": { "type": "string", "pattern": "^(local|record|pack|legacy):.+" } }
   ```
   Keep object key ordering otherwise stable to minimize diff noise.

2. **Validator hand-roll collapse.** In `tools/validate-records/record-validation-rules.js` `validateSourceRefs` (around lines 74-95), delete:
   - The `pack:` length check (the `if (sourceRef.length <= "pack:".length) errors.push(...)` line and the unconditional `continue` for `pack:` becomes the only body — keep the `continue`).
   - The trailing `errors.push(...unsupported source reference)` catchall.
   After collapse, the function body becomes: legacy branch, local branch, record branch, pack branch (no-op continue), end. No `else` fallthrough.

3. **Negative-fixture expected-string update.** In `tools/validate-records/validate-records.js`:
   - Line 32: change `["unsupported-source-ref", "unsupported source reference"]` to `["unsupported-source-ref", "/source_refs/0 pattern: must match pattern"]`.
   - Line 46: change `["malformed-pack-ref", "malformed pack reference"]` to `["malformed-pack-ref", "/source_refs/0 pattern: must match pattern"]`.
   - Rationale: both fixtures now trip on the same AJV pattern error; the substring is shared. The pattern body itself (`"^(local|record|pack|legacy):.+"`) is appended by AJV to the error string and can be matched against if a more specific assertion is later wanted.

4. **Local validation.** Run `pnpm check` from repo root. Expect:
   - Exit 0.
   - `Validated N records.` line identical to Phase 1 baseline.
   - No new errors from records under `records/` (they all currently use supported prefixes).
   - All 30+ negative fixtures still trip (silent — they only print if the expected substring is missing).

5. **Edge-case probe (manual, throwaway).** Briefly inject a `claim` record with `source_refs: ["unknown:foo"]` and confirm `pnpm check` errors with the new AJV pattern message. Remove the probe before commit.

6. **Stage edits.** `git add schemas/ tools/validate-records/`. Do **not** commit yet — Phase 3 lands the decision YAML, then both go in one commit (or two adjacent commits, ledger first).

## Success Criteria

- [ ] All 5 schemas show `pattern: "^(local|record|pack|legacy):.+"` on `source_refs.items`.
- [ ] `validateSourceRefs` body has no `unsupported source reference` string and no `pack:` length check.
- [ ] `validate-records.js` lines 32 and 46 hold the updated expected substrings.
- [ ] `pnpm check` exit 0 with identical `Validated N records.` count from Phase 1 baseline.
- [ ] Throwaway edge-case probe with `unknown:foo` source_ref trips AJV pattern error (manual verify, removed before commit).
- [ ] No unrelated edits staged.

## Risk Assessment

- **Risk:** AJV error path string format differs from what we predict (e.g., AJV uses a leading `must match pattern` without the slash-prefixed instancePath). Then the new expected substring won't match `.some(includes(...))`.
  - **Mitigation:** Phase 4 first does a dry run reading the actual emitted error before declaring DONE. If the format differs, update the expected substring to what AJV actually emits. Precedent from `bad-timestamp` test case (`"/created_at pattern: must match pattern"`) suggests our prediction is correct.

- **Risk:** A record under `records/` somehow uses an unprefixed source_ref that the hand-roll's catchall caught but no other check would (so removing catchall lets a bad ref pass).
  - **Mitigation:** This is the precise reason we keep AJV pattern. If a record under `records/` violates the pattern, `pnpm check` will exit nonzero in Step 4 and reveal the bad record. Fix the record, not the pattern.

- **Risk:** Diff includes JSON formatting drift (whitespace, key reorder) from editor auto-format on the 5 schema files.
  - **Mitigation:** use targeted `Edit` tool on each schema rather than rewrite. Verify with `git diff --stat` that exactly one line per schema file changed (plus the closing comma adjustments if needed).
