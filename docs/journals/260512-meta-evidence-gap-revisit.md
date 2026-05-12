# Meta-Evidence Gap Revisit: Validator Quirks Surfaced

**Date**: 2026-05-12 00:46
**Severity**: Low
**Component**: records/ (meta-evidence layer) + tools/validate-records
**Status**: Resolved

## What Happened

Executed plan `plans/260512-0046-meta-evidence-gap-revisit/` in cook --auto. Single commit `a2cd03e` on main. Resolved two meta-evidence gaps without touching the validator or the capability JSON schema. Validation gates clean (`pnpm validate:records`, `pnpm check`, 33 records, exit 0).

Gap 1 (install-experiment-template-gap): four vnstock-install evidence MDs blew past the N=2 trigger. Three converged on a stable 7-section + 11-key-frontmatter envelope; the fourth (T101723Z) predates the convention and is now classified pre-convention legacy. Produced a candidate template (`records/evidence/meta/install-experiment-template-candidate.md`) plus a meta-experiment validating the template against the four cases. Trigger reframed to next-non-vnstock-install/N=1.

Gap 2 (capability-schema-gap): the gap MD was authored before `schemas/capability.schema.json` shifted to a map-oriented shape (`stack` + `surface` + `maps[]`) during the capabilities-stack migration. The schema is now a minimal partial supersession of the gap; field enrichment defers until N>=3 verified packs. Recorded as `## Partial Supersession` with a field-disposition table. No schema edits.

Both resolutions pinned by `records/decisions/decision-260512T0046Z-loop-meta-evidence-gap-revisit.yaml` (draft). Parser-swap decision explicitly out of scope.

## The Brutal Truth

The plan itself was anti-climactic — the real value of this session is the four validator-quirk findings below. Anyone authoring meta-experiments or meta-decisions next will trip on the same things if they don't have these notes. The plan doc captures the *what*; this entry captures the *gotchas you only learn by feeding the validator broken YAML repeatedly*.

## Technical Details — Four Non-Obvious Validator Behaviors

### 1. Empty `claim_refs` is the wrong fix — omit the verification block entirely

`tools/validate-records/claim-verification-rules.js` short-circuits with `if (!verification) return;`. Meta-experiments that test no concrete claim should drop both `verification` and `claim_refs` rather than supply empty arrays — empty arrays still flow into downstream rules and fail. Pattern used in `experiment-meta-install-template-candidate-260512T0046Z.yaml`.

### 2. `simple-yaml-parser.js` is hostile to colons and pipes

The hand-rolled parser at `tools/validate-records/simple-yaml-parser.js` rejects unquoted plain scalars matching `/[ \t]:|:[ \t]|:$/` and has **no pipe block scalar support**. Practical rules when authoring record YAML:
- Multi-line `notes` must collapse to a single line, or be fully quoted.
- Free-form strings containing colon-space (e.g. `"Scope enum deviation: the meta-experiment..."`) need em-dash substitution or full quoting.
- `|` and `>` block scalars are silently broken — do not use them.

### 3. `source_refs` enforces a per-record-type path allowlist; `plans/` is not on it

`validateLocalRef` allows `records/evidence` and `knowledge-packs` by default; capability records additionally permit `product/*/capabilities`. Plan and brainstorm paths (`plans/`, `plans/reports/`) are not allowlisted anywhere. Workaround: cite them in `notes` (free-form, no path validation) and/or `decision_effect.affected_refs` (no path validation on that field either). Do NOT put them in `source_refs` — the validator will reject them and the obvious fix (extend the allowlist) is out of scope for content work.

### 4. `scope` enum lacks `meta`

Experiment/decision schemas constrain `scope` to `planning|install|runtime|product|schema-improvement`. Meta-artifacts have nowhere clean to land; current convention is `schema-improvement` with the deviation documented in `notes`. If meta artifacts continue accumulating, a future loop-evolution decision should extend the enum.

## Root Cause Analysis

These quirks aren't bugs — they're the cost of the minimal hand-rolled YAML parser plus a deliberately strict ref-allowlist. Both predate meta-artifact work. The meta layer is the first user to consistently need plan-path citations and free-form colon-heavy notes, so the friction surfaces here first.

## Lessons Learned

- **Before authoring any new meta-experiment/decision YAML**: re-read these four points. The validator's error messages do not point at the parser's plain-scalar regex or at the per-type allowlist, so the failure modes are opaque.
- **Gap MDs go stale silently**: Gap 2's predicate-oriented fields drifted away from the schema's map-oriented reality across one migration. A periodic "do open gap MDs still match current schema/records?" sweep is cheap insurance.
- **`schema-improvement` is overloaded** — it now covers both real schema work and meta-artifact fallback. Once a third meta-record appears, push the `meta` enum extension.

## Next Steps

- Defer Gap 1 template promotion until the next non-vnstock install evidence lands (N=1 trigger).
- Defer Gap 2 field enrichment until N>=3 verified capability packs exist.
- Consider a small follow-up: extend `scope` enum with `meta`, or document the four parser/validator quirks in `tools/validate-records/README` if one exists. Not urgent.
- Promote `decision-260512T0046Z-loop-meta-evidence-gap-revisit.yaml` from `draft` to `approved` once a reviewer confirms the partial-supersession framing for Gap 2.
