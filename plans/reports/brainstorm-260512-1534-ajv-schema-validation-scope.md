# Brainstorm: AJV Schema Validation — Starting Scope

**Date:** 2026-05-12 15:34 (Asia/Saigon)
**Continues:** `plans/260512-1410-yaml-parser-library-swap/` (completed) and `plans/reports/brainstorm-260512-1357-parser-swap-ajv-deferral.md`
**Trigger:** AJV Trigger #1 met by user's intent to enforce datetime UTC-Z; motivating drift event = commit `e2a82d6`.
**Status:** Brainstorm complete, scope agreed, awaiting plan.

## Problem Statement

YAML parser swap (`260512-1410`) is done. AJV was explicitly deferred. The deferral named three rules the hand-rolled `validateSchema` cannot express: datetime UTC-Z, ID pattern, source-ref uniqueness. One trigger is met (datetime). Question: which scope ships in the first AJV-related commit?

## Inventory Recap (from prior brainstorm)

- 5 schemas × `created_at` + `updated_at` = 10 timestamp fields. Plus 1 nested `reviewed_at` in `claim.approval`. Total: **11 fields** to enforce.
- Silent-pass gaps the hand-rolled validator hides today: `$ref` resolution (`claim.verification` dimensions) and nested `items.required`/`properties` (`experiment.proves[]`, `capability.maps[]`). AJV closes both natively.
- Three "named rules" from prior brainstorm: datetime (trigger met), ID pattern (no trigger), source-ref uniqueness (no trigger).

## Evaluated Approaches

### A. Pure engine swap, no schema changes
Replace `validateSchema` with AJV 2020. Silent-pass gaps close for free. Datetime drift remains unconstrained.
**Pros:** smallest diff; cleanest engine-only regression baseline.
**Cons:** does NOT satisfy the trigger; ships infra-only commit with no user-visible win.

### B. Engine swap + datetime enforcement (CHOSEN)
Engine swap PLUS `pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$"` on all 11 timestamp fields. Silent-pass gaps closed as a side effect of AJV honoring `$ref`/`items`.
**Pros:** load-bearing reason (datetime drift prevention) addressed in same commit as engine swap; single posture shift per change; convention from commit `e2a82d6` becomes machine-enforced; tech-debt-free if we accept AJV native error format.
**Cons:** two concerns in one commit (engine + rule), but they share a single new dependency surface and the rule is mechanical.

### C. Engine swap + all three named rules
Engine + datetime + ID pattern + source-ref uniqueness.
**Pros:** all named gaps closed at once.
**Cons:** ID-pattern requires deciding the regex now (existing filenames already drift between `YYYYMMDD` and `YYMMDDT` shapes); only datetime trigger is met; YAGNI violation per prior brainstorm's deferral logic.

### D. Phased — engine PR, then datetime PR
**Pros:** maximum bisectability if engine swap surfaces unexpected behaviour.
**Cons:** two PRs for a tightly-coupled change; engine-only PR has no user-visible win and may be hard to justify in isolation.

## Recommendation: Approach B

### Locked decisions (post dry-run)

| Concern | Choice | Rationale |
|---|---|---|
| Datetime mechanism | `pattern` regex only, strict UTC-Z | Hermetic; no `ajv-formats` dep; rejects `+07:00` and millisecond drift forms. |
| AJV strict mode | `strict: true` | Catches typos in schema files; current schemas use only standard 2020-12 keywords so risk is low. |
| Existing records | Enforce on all 34, retro-normalize 23 date-only records | Dry-run flipped the prior `e2a82d6 already normalized` assumption: `e2a82d6` only touched 2 records; 23 records still use date-only `"2026-05-08"` form. User accepted retro-normalization scope. |
| Convention-decision scoping | `decision-260512T1321Z-artifact-timestamp-convention`'s blocked_actions are filename-scoped only | The convention text explicitly says "filename timestamp convention"; all 4 blocked_actions reference renames/filenames. Normalizing YAML field content for schema compliance is categorically different from filename renames and stays outside that decision's scope. New AJV decision must cite this nuance. |
| Error output format | AJV native | Translator adapter grows linearly with each new AJV keyword used; AJV native preserves richer context (`params`, `schemaPath`); baseline byte-identical anyway since success emits nothing. |
| Pre-plan dry-run | Done | 8/34 passed, 26/34 failed. See `records/evidence/meta/ajv-dryrun-results-260512.md`. |
| Required-field gaps | Fix 3 records in swap commit | Silent-pass gap closing surfaces real data bugs: `claim-vnstock-runtime-403-root-cause` missing `verification.product.decision_refs`; `experiment-vnstock-capabilities` and `experiment-...-sandbox-2` missing `verification.proves[0].output_level`. |

### Why not C (all three rules now)

ID-pattern regex is contested: existing decision filenames mix `decision-20260508-...`, `decision-20260509T070411Z-...`, `decision-260512T1321Z-...`. Choosing one regex retro-invalidates the others. That's its own decision (which canonical ID grammar?), not a swap concern. Defer until the convention is settled.

Source-ref uniqueness has zero observed duplicate-ref bugs. Premature.

## Implementation Considerations and Risks

### AJV integration
- AJV 8.x. Use `ajv/dist/2020` import for native 2020-12 support.
- `new Ajv2020({ strict: true, allErrors: true })` — `allErrors` keeps multi-error-per-record parity with current `errors.push(...)` style.
- Compile each of 5 schemas once at validator startup. Cache compiled validators in module scope.
- Replace `validateSchema` (record-validation-rules.js:17-30) with `validators[record.type](record)`. Caller code at line 37 changes signature minimally.
- `validateClaimVerification` stays hand-rolled — out of scope.

### Pre-swap dry-run methodology
- Standalone script `tools/validate-records/ajv-dryrun.js` (delete or `.gitignore` after research). Loads schemas + records via current loader, runs AJV 2020 strict:true with the datetime pattern added in-memory, dumps per-record pass/fail.
- Expected results: 0 failures (records were normalized in `e2a82d6`). Any failure becomes a fix task in the plan.
- Risk: `$ref` resolution may flag `claim.verification.*` dimensions that the hand-rolled validator silently passed. If so, fix the record (not the schema).
- Risk: `experiment.proves[]` items may be missing `dimension` or `output_level`. If so, fix the record.

### Schema edits
- Five files: claim, experiment, decision, capability, risk. Each gets `"pattern": "..."` added to `created_at` and `updated_at`. Claim's `approval.reviewed_at` also gets the pattern.
- No `$schema` bump (still 2020-12). No `schema_version` bump (no breaking change for already-compliant records).

### Dependency footprint
- `ajv` ^8.x and (if we add `format` later) `ajv-formats`. For this commit: `ajv` only.
- `package.json` `dependencies` grows to 2. `node_modules` ~+3 MB.

### Regression baseline
- Capture `pnpm validate:records` output pre-swap, post-swap (both expected exit 0, zero error output if records clean).
- Smoke test: hand-craft a temp record with `created_at: "2026-05-12T15:34:00+07:00"` and confirm AJV rejects it. Delete after.

## Success Metrics

- `pnpm validate:records` exit 0 against all 34 records.
- `pnpm check` exit 0 (includes test suite).
- AJV correctly rejects a smoke record with non-UTC-Z timestamp.
- `tools/validate-records/record-validation-rules.js` no longer contains `validatePrimitive` / hand-rolled `validateSchema`; `validateClaimVerification` and source-ref/pack/reference helpers retained.
- 23 records normalized to canonical UTC-Z (date-only forms → `T00:00:00Z`); 1 record `+07:00` form converted; 3 records' missing required fields filled.
- One focused commit on `main` (large diff: AJV install + schema edits + engine swap + 27 record edits + decision draft).
- New decision record `decision-260512TNNNNZ-ajv-schema-validation-adoption.yaml` (draft → approved) cites this brainstorm, the dry-run evidence MD, commit `e2a82d6` as motivating drift event, and explicitly scopes the retro-normalization as YAML-field-content (not filename) edits outside `decision-260512T1321Z-artifact-timestamp-convention`'s filename-scoped blocked_actions.

## Next Steps

1. ✅ **Dry-run research phase** complete. Evidence at `records/evidence/meta/ajv-dryrun-results-260512.md`. 8/34 passed, 26/34 failed (23 datetime drift, 1 local-tz, 3 missing-required).
2. **Plan via `/ck:plan`**: phases will look like Baseline → Schema edits → Engine swap → Record normalization (23+1+3) → Regression → Decision draft. Plan can reference both this brainstorm and the dry-run evidence MD.
3. **Decision record drafted alongside plan**: new `decision-260512TNNNNZ-ajv-schema-validation-adoption.yaml`. Author in draft during plan execution; promote to approved after green regression. Must explicitly note the YAML-field-content vs filename scoping distinction relative to `decision-260512T1321Z-artifact-timestamp-convention`.
4. **Throwaway dry-run script** (`tools/validate-records/ajv-dryrun.js`) deleted as part of the plan's cleanup phase, or sooner.

## Unresolved Questions

- Should the dry-run also flag existing records that would fail under future ID-pattern enforcement, even though that rule is out of scope here? **Defer** — useful intel but not blocking. Could be a follow-up evidence MD if a contributor wants to build the case for ID-pattern adoption.
- AJV strict:true may complain about `title` at schema root being non-standard at certain places? **Quick check during dry-run** — `title` is standard JSON Schema; expected to pass. If it does fail, the dry-run surfaces it.
- Does enforcing the pattern via JSON Schema's `pattern` keyword interact badly with AJV's `format` validation if we add `ajv-formats` later? **No** — keywords are independent; both can apply.
