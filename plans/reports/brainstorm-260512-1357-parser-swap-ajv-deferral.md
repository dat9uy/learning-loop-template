# Brainstorm: Parser Swap Scope — YAML Now, AJV Deferred With Met Trigger

**Date:** 2026-05-12 13:57 (Asia/Saigon)
**Source decision:** `records/decisions/decision-20260510T172056Z-yaml-parser-library-swap.yaml` (draft)
**Context journal:** `docs/journals/260512-meta-evidence-gap-revisit.md`
**Status:** Brainstorm complete, framing approved

## Problem Statement

Parser-swap decision draft (`decision-20260510T172056Z-yaml-parser-library-swap`) replaces hand-rolled `simple-yaml-parser.js` with `eemeli/yaml`. Draft's alternative #3 floats bundling AJV in the same change to also retire hand-rolled `validateSchema` in `record-validation-rules.js`. Draft defers AJV pending an inventory of which JSON Schema 2020-12 features project schemas use. This brainstorm produces that inventory and answers: do we need AJV alongside the YAML swap, or is YAML parse enough at this stage.

## Inventory: JSON Schema Features Used vs Hand-Rolled Validator Coverage

Audit of 5 schemas (`claim`, `experiment`, `decision`, `capability`, `risk`):

| Feature | Used in project schemas | Handled by `validateSchema` |
|---|---|---|
| `type` (string/object/array/boolean) | yes | yes |
| `required` (top-level) | yes | yes |
| `properties` (top-level + 1 level nested) | yes | yes |
| `enum` | yes | yes |
| `const` | yes | yes |
| `items` (primitive type only) | yes | yes |
| `items` with nested `required`/`properties` | yes (`experiment.proves[]`, `capability.maps[]`) | **NO** — items only get type check, no recursion into items' required/properties |
| `$ref` + `$defs` | yes (`claim.schema.json` verification dimensions) | **NO** — no $ref resolution |
| `additionalProperties` | no | no (n/a) |
| `oneOf` / `anyOf` / `allOf` / `not` | no | no (n/a) |
| `if` / `then` / `else` | no | no (n/a) |
| `pattern` | no | no (n/a) |
| `format` (e.g. `date-time`) | no | no (n/a) |
| `minItems` / `maxItems` / `uniqueItems` | no | no (n/a) |
| `minLength` / `maxLength` | no | no (n/a) |

**Two real silent-pass gaps:** (a) `claim.verification` dimensions unchecked due to no $ref resolution; (b) `experiment.proves[]` and `capability.maps[]` items' required/properties unchecked.

**Two-day friction ledger:** YAML parser bit twice (pipe block scalar in vnstock-installer notes, colon-in-sequence-scalar in artifact-timestamp tradeoffs). Schema validator bit zero times. Journal's four documented validator quirks are all YAML-parser or ref-allowlist policy, none JSON Schema.

## Reframing

Closing theoretical silent-pass gaps is YAGNI. AJV's load-bearing reason is not "stop owning grammar as posture" but "we want authoring rules our validator literally cannot express." Three rules named in clarifying-question pass: datetime UTC-Z pinning (needs `pattern` or `format`), ID pattern (needs `pattern`), source-ref shape/uniqueness (needs `uniqueItems`/`minItems`). All three require keywords the hand-rolled validator does not have.

**Trigger criterion is met today** by the first rule alone: datetime drift just got fixed manually in commit `e2a82d6`, and without schema enforcement the format zoo recurs.

## Evaluated Approaches

### A. Bundle YAML + AJV in one commit (alternative #3 of decision draft, "single posture shift")
**Pros:**
- Both gaps closed in one regression baseline.
- `simple-yaml-parser.js` and `validateSchema` retire together; project owns only ledger rules.

**Cons:**
- Two dependency surfaces in one commit; harder to bisect regressions.
- AJV regression baseline (compile-mode + meta-schema 2020-12 + ajv-formats for `date-time`) layered onto YAML regression baseline.
- Schema-validator gaps are theoretical-only; bundling implies they share urgency with YAML parser, which they do not.
- Authoring-rule scope (datetime/ID/refs) gets dragged into a posture-only PR or punted again; either way the commit's stated reason mismatches load-bearing reason.

### B. Sequence: YAML now, AJV next session (recommended)
**Pros:**
- Single posture shift per change. Clean regression baseline diff (33 records, identical parse+validate output).
- AJV decision lands with load-bearing reason already named (datetime enforcement) instead of "posture."
- Trigger criterion explicit and falsifiable; future-self knows when to act and on what scope.
- Decision draft as written needs no edits except adding this brainstorm to `source_refs`.

**Cons:**
- Two commits/decisions instead of one.
- Schema-validator silent-pass gaps remain open for the interim (low risk: zero authoring failures observed).

### C. Defer AJV indefinitely, keep hand-rolled `validateSchema`
**Pros:**
- Smallest change. Hand-rolled validator is 169 lines, comprehensible, debuggable.
- No new dependency.

**Cons:**
- Three named authoring rules cannot be expressed; either bolt them onto JS rules (DRY violation, schema-as-spec breaks), or accept they will not be enforced.
- Datetime drift recurrence is the most likely future failure mode and this option cannot prevent it.
- $ref silent pass remains; if `claim` schema grows, more verification dimensions silently unchecked.

## Recommendation: Approach B — Sequence

**Now (this commit):** Land `decision-20260510T172056Z-yaml-parser-library-swap` as drafted. Add this brainstorm and a forthcoming evidence MD to its `source_refs`. Promote `draft` → `approved` after green regression run.

**Next session (separate decision):** New decision record proposing AJV adoption, scoped to **datetime UTC-Z enforcement only**. Rationale ties to the recent manual normalization in commit `e2a82d6` plus the still-unconstrained `created_at`/`updated_at` schema strings. ID-pattern and source-ref-uniqueness rules deferred until each earns its own trigger (an actual drift, duplicate, or convention break).

### AJV Promotion Trigger Criteria (forward-looking)

AJV decision promotes from deferred to actionable when **any one** of:
1. **Stricter-rule trigger** *(MET as of 2026-05-12 by the user's stated desire to enforce datetime UTC-Z)*: at least one authoring rule named that the hand-rolled validator cannot express, and the user wants it enforced.
2. **Silent-miss-bites trigger:** an authored record passes validation but is later flagged malformed downstream (N=1 record).
3. **Corpus-sweep trigger:** ad-hoc AJV-against-current-schemas dry run flags ≥1 existing record. Free check anyone can run before opening the AJV decision; gathers evidence.

## Implementation Considerations and Risks

### YAML swap (this commit)
- Regression: parse all 33 records with eemeli/yaml and diff against current parser output. Library parsers can be stricter on duplicate keys and implicit type coercion (per decision draft's own tradeoff #4). Surface any diff before swap lands.
- Authors gain pipe/folded block scalars; do not retrofit historical records to use them (decision draft's `blocked_actions` already covers this).
- `node_modules` grows ~0.5 MB. Crosses zero-runtime-dependency threshold (first runtime dep in `package.json`); `pnpm-lock.yaml` machinery already wired.

### AJV scope when triggered (informational, not part of this commit)
- Pin schemas' `created_at` and `updated_at` to `format: date-time` plus AJV's `ajv-formats` add-on, or to a tight `pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$"` regex. `pattern` is hermetic and avoids the formats-package dependency; preferred unless other format keywords are added.
- Compile schemas at validator startup; cache compiled validators.
- Decide on `strict: true` (rejects unknown keywords) vs `strict: false`. Project currently relies on schema-as-doc; `strict: true` is the AJV-idiomatic choice but requires schemas be clean first.
- Regression-baseline against current 33 records: ANY new error means either a real existing bad record (good — fix it or remove rule) or a rule mis-specified (good — refine rule).

## Success Metrics and Validation Criteria

**YAML swap success (this commit):**
- `pnpm validate:records` exit 0 against existing 33 records pre- and post-swap.
- `pnpm check` exit 0.
- `tools/validate-records/simple-yaml-parser.js` deleted; no remaining imports.
- All six caller files migrated.
- One regression smoke: a hand-crafted record with pipe block scalar in `notes` parses cleanly post-swap (proves the new capability).

**AJV-deferral success (this brainstorm):**
- Decision draft's `source_refs` gains this report and a follow-on evidence MD.
- Trigger criteria documented (this report); future AJV decision can cite trigger met.

## Next Steps and Dependencies

1. **This session, after brainstorm:** Author follow-on evidence MD pairing the YAML parser friction with the inventory in this report, so the parser-swap decision can leave draft cleanly. Add both to `source_refs`.
2. **Next plan/cook cycle:** Execute YAML swap per decision draft's `decision_effect.allowed_actions`. Regression-diff and land as single commit.
3. **Subsequent session (no fixed date):** Draft new AJV decision scoped to datetime UTC-Z enforcement. Cite trigger #1 met and reference commit `e2a82d6` as motivating drift event.
4. **Not in scope:** ID-pattern enforcement, source-ref uniqueness, scope-enum `meta` extension (defer until each earns own trigger).

## Unresolved Questions

- Should the YAML swap commit also add a one-line `tools/validate-records/README.md` documenting the four validator quirks from `260512-meta-evidence-gap-revisit.md`? Journal's "Next Steps" flags this as nice-to-have, not urgent. Out of scope for this brainstorm; defer to YAML-swap implementation plan.
- When AJV decision triggers, should `claim.schema.json`'s `verification` block be flattened to inline shapes vs keeping `$ref` + `$defs`? AJV resolves $ref natively, so no forced change. Defer to AJV decision drafting.
