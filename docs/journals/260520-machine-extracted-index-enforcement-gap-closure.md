# machine-extracted-index enforcement gap closure (G1 + G2)

**Date**: 2026-05-20 15:30
**Severity**: High
**Component**: `tools/extract-index/` — index extraction pipeline
**Status**: Resolved (commit `8566d85` on `main`)

## What Happened

Closed two mechanical-enforcement gaps that had been quietly betraying the index-first redesign:

- **G1 — supersession write-back was never implemented.** `index-entry-builder.js` hard-coded `superseded_by: null` and `supersedes: []` on every build. `checkSupersession()` logged errors but never patched anything. The only reason the live `device-id-injection-required` ↔ `device-id-injection-not-required` pair had linked fields was because someone hand-edited them — exactly the "agent-derived, never hand-edited" rule the brainstorm forbids.
- **G2 — Mechanism 2 Scope A (frozen-claim drift) was never wired.** No tool code referenced `records/claims/` at all. New extractions could contradict frozen claims and the pipeline would shrug and keep going.

TDD-strict: 8 failing tests first (4 per gap), then implementation. New module `tools/extract-index/frozen-claim-drift.js` hard-stops on topic-tag opposition (`X-required` ↔ `X-not-required` on the same `(capability, dimension)` pair), with `notes: SUPERSEDED` or the new assertion-id as the operator's escape hatch. `applySupersessionWriteBack()` in `extract-index.js` mutates new entries (`supersedes`) and old entries (`superseded_by`, `status: superseded`) in the same extraction pass.

## Verification

- `pnpm check`: 144/144 tests pass.
- Real-corpus regeneration: `device-id-injection-*` pair now byte-correct purely from `## Confirmation / Disproof Notes` + evidence frontmatter — no hand-edits.
- Synthetic drift fixture (fabricated claim + opposing-tag evidence, no `SUPERSEDED` note) hard-stops with non-zero exit.

## The Brutal Truth

Two gaps in production for an unknown stretch of time. G1 in particular is the embarrassing kind: the brainstorm explicitly called the linked fields "agent-derived, never hand-edited", yet the only working example in the live corpus only worked because a human had reached in and patched the YAML by hand. The doctrine was correct; the code never caught up. If the redesign's whole point is mechanical enforcement, an unenforced hand-edit is the worst possible failure mode — silently plausible, structurally false.

## Two Surprises Worth Recording

### 1. Orphan detection must consult the in-pass cache

When *both* halves of a supersession pair are freshly extracted in the same run, neither is in `existingEntries`. First implementation produced false-positive "old entry not found" errors during corpus regeneration because the "old" entry had just been built fresh by the same pass. Fix: old-entry lookup checks `existingEntries` **and** `newById` (the in-pass map). Obvious in retrospect; not obvious when writing the loop.

### 2. Multi-finding evidence files leak `supersedes` across siblings

Caught when `records/evidence/vnstock-data/capability-revalidation-20260518.md` produced two findings — `device-id-injection-not-required` and `home-env-for-api-key`. The disproof note ("Disproves assertion-...-device-id-injection-required") leaked onto **both** new entries, so `home-env-for-api-key.yaml` incorrectly inherited `supersedes: [device-id-injection-required]`. Fix: when an evidence file produces multiple findings, the disproof note only pairs with the finding whose topic-tag is the explicit opposite of the disproof ID's stem. When the file produces a single finding, the pairing is unambiguous and the opposition filter is skipped — necessary because test-suite fixtures use neutral tags like `tag-new`/`tag-old` without the `-required` suffix.

## How To Apply Going Forward

- **Multi-finding evidence + disproof notes:** the disproof IDs **must** end in the explicit opposite suffix (`X-required` ↔ `X-not-required`) of the finding they target, or the write-back silently skips them. Operators either split the evidence into separate files or name disproof IDs with matching suffixes. There is no warning for this — by design, because the operator is asserting intent.
- **Drift detection scope:** the hard-stop only catches the explicit `X-required` ↔ `X-not-required` topic-tag opposition. Free-form contradictions remain operator judgment. This is documented in the `frozen-claim-drift.js` header so the next person reading it doesn't assume the check is broader than it is.
- **`shouldWrite()` had to grow:** `applySupersessionWriteBack()` mutates `newEntries` in place, so `file-writer.js#shouldWrite()` now compares `status`, `superseded_by`, and `supersedes` — otherwise mutated old entries don't actually get rewritten to disk. Quiet but critical.

## Files Touched

- New: `tools/extract-index/frozen-claim-drift.js`
- Modified: `tools/extract-index/extract-index.js`, `index-entry-builder.js`, `file-writer.js`, `extract-index.test.js`
- Evidence: `records/evidence/vnstock-data/capability-revalidation-20260518.md` (added `## Confirmation / Disproof Notes` section)
- Index regenerated: 3 vnstock-data assertion YAMLs
- Plan/brainstorm status: `plans/260520-1530-machine-extracted-index-enforcement-gaps/` (plan + 5 phases) and `plans/reports/brainstorm-20260518-machine-extracted-index.md` (Plan 5 marked complete)

## Lesson

When a redesign's selling point is "mechanical enforcement", the test that matters is not "does the happy path produce the right YAML" — it's "does regeneration from scratch reproduce the live corpus byte-for-byte, with zero hand-edits in the working tree?" That's the only check that catches doctrine-vs-code drift. Add it to the regeneration smoke-test going forward.
