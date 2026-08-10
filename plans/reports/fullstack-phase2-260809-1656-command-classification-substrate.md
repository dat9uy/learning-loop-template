# Phase 2 — Shared command classification substrate

**Plan:** `plans/260809-1538-vitest-recurrence-telemetry-and-unexpected-match-classification/`
**Phase:** 2 (Shared command classification substrate)
**Date:** 2026-08-09
**Status:** DONE

## Summary

Built the pure, runtime-neutral classifier `core/command-classification.js` with
explicit `gate`, `recurrence`, and `event` modes. Gate mode reproduces the
fail-closed blanking chain from `applyPromotedRules`; recurrence mode reproduces
the tracker's coarser `blankDataPayloadsForKey`/`normalizePrefixForKey`
grouping; event mode implements the dual-view algorithm (raw regex detection for
telemetry + inert-span containment proof for `unexpected-match`). The classifier
never throws — every error path returns an unblanked fallback view with
`classification_error: true`, so it can be dropped into `applyPromotedRules`'
catch/continue path in Phase 3 without changing fail-closed semantics.

`core/gate-logic.js` gained three additive exports (`stripEchoProse`,
`BLANKABLE_HEREDOC_VERBS_PROMOTED`, `applyInertSinkBlanking`) so the classifier
reuses the exact production policies instead of forking them. No behavior change;
all existing gate/heredoc/evaluator tests stay green.

## (a) Classifier API surface

File: `tools/learning-loop-mastra/core/command-classification.js`

- `classifyCommand(command, options)` — returns a never-throwing classified view.
  - `options.mode` ∈ `CLASSIFIER_MODES` = `["gate", "recurrence", "event"]` (default `"gate"`).
  - `options.rulePattern` — string; only consumed by `event` mode. A non-string
    (e.g. `RegExp` object) is treated as absent → `unknown`/`unclassified`.
  - Return shape: `{ mode, normalized, match_origin, candidate_kind,
    classification_error?, ...mode-specific fields }`.
    - `match_origin` ∈ `"executable" | "inert-data" | "mixed" | "unknown"`
    - `candidate_kind` ∈ `"ordinary-rule-fire" | "unexpected-match" | "unclassified"`
  - Gate mode adds `{ regions, perSegmentNormalized, segments }`.
  - Recurrence mode adds `{ blanked }`.
  - Event mode adds `{ match_origin, candidate_kind, matches, spans }`.
- `gateFallback(command, mode)` — module-internal; returns the raw unblanked
  command with `classification_error: true`, `match_origin: "unknown"`,
  `candidate_kind: "unclassified"`. Used for null input, invalid mode, classifier
  exception, and non-string `rulePattern`.

Mode policy:

- **Gate** — reuses `safeStripHeredocBodies(command, BLANKABLE_HEREDOC_VERBS_PROMOTED)`,
  then `applyInertSinkBlanking`, then per-segment
  `stripCliArgvPayload(stripDataCommandQuotes(stripNodeEvalBody(stripMessageFlags(segment))))`,
  then the full `stripEchoProse(...)` chain over the per-segment results. Executor
  bodies (`bash -c`, `sh -c`, `python -c`), command substitutions, redirects,
  process substitution, unquoted heredoc bodies, and unknown syntax remain visible.
- **Recurrence** — `blanked = blankDataPayloadsForKey(command)`,
  `normalized = normalizePrefixForKey(command)`. Coarser grouping: heredoc
  quoted/unquoted variants, `node -e` quote variants, and redirect-target
  variants collapse; distinct trailing real commands do NOT collapse.
- **Event** — dual-view: (1) raw regex scan for telemetry; (2) provenance proof.

## (b) Dual-view event-mode proof (how `unexpected-match` is proven)

`unexpected-match` is emitted ONLY when the raw regex match lies entirely inside
a single provably-inert span. The proof has four stages:

1. `findPatternMatches(command, rulePattern)` — raw detection (string pattern
   only; invalid pattern → no matches). Used for telemetry counts.
2. `collectAllInertSpans(command)` — gathers every span the gate-mode strip chain
   proves inert: quoted heredoc bodies (via `safeStripHeredocBodies` +
   `BLANKABLE_HEREDOC_VERBS_PROMOTED`), `node -e`/`nodejs -e` bodies, data-command
   quoted args (`grep/jq/rg/...`), and inert-sink prose (char-diff of
   `applyInertSinkBlanking` against the original, with whitespace-gap merging so
   interior literal spaces do not fragment a single quoted-token run into pieces).
3. `collectMalformedRegions(command)` — unterminated single/double quotes → the
   region's provenance is unknowable.
4. `classifyMatch(match, spans, malformed, command)`:
   - Overlaps a malformed region → `unknown` (fail-closed).
   - No inert-span overlap → `executable` (ordinary content — the rule fired on a
     real executable pattern, e.g. `vitest run ... | tail`).
   - Fully inside exactly ONE inert span → `inert-data`.
   - Partial overlap or multi-span coverage (pipe-spanning greedy matches, e.g.
     the full rule pattern spanning a closing quote and a real pipe) → `unknown`,
     never guessed inert.

Decision: all matches `inert-data` → `unexpected-match`; all matches `executable`
→ `ordinary-rule-fire`; any `mixed`/`unknown` → `unclassified`. This is the
discriminated, fail-closed pair from Phase 1's frozen vocabulary: a match is never
labelled unexpected unless the whole match is provably inside inert data.

## (c) Regression-test outcome (RED count)

Full Phase-1 RED baseline preserved exactly, re-verified after the seed step:

- 5-file RED set
  `command-classification-contract | gate-decision-log | gate-promoted-rules | evaluate-bash-gate | gate-recurrence`:
  **4 failed / 1 passed files; 15 failed | 181 passed | 196 total** — identical to
  Phase 1. The 15 are: contract 7, decision-log 1, promoted-rules 3, recurrence 4,
  evaluator 0.
- Classifier unit suite: `core/command-classification.test.js` → **39 passed**.
- Parser/guard regression set (heredoc, data-command-quotes, shell-parse,
  shell-parse-classify, shell-quote-guard): **129 passed / 7 failed (136)** — the 7
  failures are the Phase-1 RED contract tests only; the guard/parser files are all
  green.

An apparent 16th failure in the full legacy-mcp run (`cold-tier-regression.test.js`,
drift-stale count 1 > 0 for `meta-260807T1704Z-adopt-shell-quote-...`) was
investigated and proven to be a **seed-ordering artifact, not a regression**: the
test reads the live file-index baseline (`file-index.jsonl`) which, under bare
`npx vitest run`, had NOT been re-seeded after `gate-logic.js` gained its three
additive exports — so the baseline still held the pre-edit hash and the finding
referencing `gate-logic.js:1` looked drifted. Running the documented seed step
(`seed-file-index.mjs`, which `pnpm test` prepends) and re-running the test → exit
0, pass. The test comment itself notes it only runs cleanly under the seeded
`pnpm test` path.

## (d) shell-parse.js change made (and why)

**None.** No change was made to `tools/learning-loop-mastra/core/shell-parse.js`.

Rationale: the classifier's inert-span source for the event-mode proof was kept
internal to `core/command-classification.js`. Heredoc bodies, `node -e` bodies,
data-command quoted args, and inert-sink prose spans are derived from the
already-exported gate-logic primitives (`safeStripHeredocBodies`,
`applyInertSinkBlanking`, `stripDataCommandQuotes`, `stripNodeEvalBody`) via
offset-preserving char-diff, so no tokenizer surface had to change. Keeping the
spans private avoids widening `shell-parse.js`'s public API and keeps the
classifier's proofs co-located with the strip chain they mirror.

## Files modified

| File | Action | Change |
|---|---|---|
| `tools/learning-loop-mastra/core/command-classification.js` | Created | Pure classifier: `classifyCommand` + `CLASSIFIER_MODES`; gate/recurrence/event modes; never-throwing fail-closed fallback. |
| `tools/learning-loop-mastra/core/command-classification.test.js` | Created | 39 unit tests covering the Phase-2 "Tests Before" matrix. |
| `tools/learning-loop-mastra/core/gate-logic.js` | Modified | 3 additive exports only (`stripEchoProse`, `BLANKABLE_HEREDOC_VERBS_PROMOTED`, `applyInertSinkBlanking`); no behavior change. |

## Verification performed

- `core/command-classification.test.js` → 39 passed.
- 5-file Phase-1 RED baseline → 15 failed / 181 passed / 196 (unchanged).
- Parser/guard regression set → 129 passed / 7 RED (the contract RED only).
- `cold-tier-regression.test.js` → passes after documented file-index seed; the
  bare-run failure is a seed-ordering artifact (see (c)).
- No vitest stdout piped to tail/grep/head; vitest output captured to files.
- No commit made; plan files untouched; no registry edits.

## Notes / open items

- Phase 3 will consume `classifyCommand` inside `applyPromotedRules` to populate
  `match_origin`/`candidate_kind` and feed the decision-log provenance fields.
  Phase 4 will consume the recurrence view + provenance for candidate filtering.
- The classifier's `normalized` in gate mode is intentionally NOT identical to
  `applyPromotedRules`' internal normalized string in every quoted-heredoc case
  (the gate keeps the blankable verb structure; the promoted-rule matcher uses its
  own pre-computed strip). The invariant this phase pins is policy equivalence on
  executability vs inertness, which the unit matrix asserts directly.
