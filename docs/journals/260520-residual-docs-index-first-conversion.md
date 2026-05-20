# Residual docs index-first conversion (G4 + G5 + G7)

**Date**: 2026-05-20 17:00
**Severity**: Low
**Component**: `docs/` — editorial consistency
**Status**: Resolved

## What Happened

Closed three documentation gaps from the machine-extracted-index brainstorm that survived Plans 1–5:

- **G4** — `docs/artifact-reference.md` had a deprecation banner and index-entry schema table but no index-first parallel sections for Dimension Overview, Experiment Proof, or Product Decisions. Added three parallel sections with bidirectional "Frozen-legacy claim counterpart" links. Removed the explicit deferral note.
- **G5** — Five docs still referenced claims as the live/primary state store without the frozen-legacy qualifier: `charter.md` (2 refs), `record-system-architecture.md` (5 refs), `problem-classification.md` (4 refs), `red-team-review.md` (7 refs), `vendor-vnstock-installer.md` (2 refs). Each evaluated: rewritten to index-first, qualified as frozen-legacy, or preserved as verb/idiom. Nuance: "claim" as verb/idiom ("a claim with a weak experiment") and as schema field name (`claim_refs`) preserved; only record-type references converted.
- **G7** — `records/evidence/vnstock-data/unified-ui-snapshot/` is a vendor-doc snapshot mislabelled as evidence. Added `_KIND.md` marker: class `vendor-documentation-snapshot`, extractable=no.

## Verification

- `pnpm check`: 78 records, 144/144 tests pass.
- Grep for unqualified "claims" in docs: remaining hits are in acceptable categories (journals = historical, artifact-reference claim-field mechanics = inherently frozen-legacy context, operator-guide historical Q-sections = explicitly marked).
- Cross-document consistency: philosophy, operator-guide, artifact-reference, record-system-architecture all agree on index-first routing rule.
- Code review: two oversights caught and fixed (red-team-review "Claim record" row unqualified; record-system-architecture verification-axis table "claims" without frozen-legacy qualifier in Applies-to column).

## Follow-up

- `docs/operator-guide.md` line 436 states a current-tense routing rule through claims ("Evidence is referenced via claims, never browsed standalone") inside a historical Q-section. This contradicts philosophy.md's index-first rule but was out of scope for this plan. Track as a future cleanup item.
