---
phase: 2
title: "Implement stripCliArgvPayload and wire match sites"
status: pending
priority: P1
effort: "5h"
dependencies: [1]
---

# Phase 2: Implement stripCliArgvPayload and wire match sites

## Overview

Add `stripCliArgvPayload` to `gate-logic.js` — a segment-scoped helper that
blanks the inline JSON argument of a **canonical** `node .../loop.mjs <tool>
<quoted>` segment — and wire it into the two `applyPromotedRules` match sites.
The blanking is **quote-kind-aware** (single-quoted always; double-quoted only
when free of `$(...)`/backticks) so it never masks a real command-substitution
execution. Phase 1 contract tests go green; no locked invariant changes.

## Requirements

- Functional: a canonical `loop.mjs <tool> <quoted-json>` segment's quoted JSON
  is blanked before the rule regex runs, in both the per-segment and
  full-command passes of `applyPromotedRules`.
- Non-functional (red-team hardening):
  - **Recognition is anchored** to the script-path token — the token immediately
    after `node` (skipping env-assignments and one command prefix, mirroring
    `segmentVerb`'s logic), where that token ends with `bin/loop.mjs` or is
    exactly a `loop.mjs` path token. NOT `/loop\.mjs\b/` anywhere in the segment
    (red-team Findings 2/4).
  - **Verb normalization:** accept `node`, `nodejs`, and absolute-path node
    (`/usr/bin/node`, basename ending in `node`) (red-team Finding 7).
  - **Quote-kind-aware blanking (Critical, red-team Finding 1):** single-quoted
    regions are always inert → blank fully. Double-quoted regions are blanked
    ONLY if they contain no `$(` and no backtick; otherwise preserved (a
    double-quoted `$(...)` is real shell execution → must stay matchable).
  - **Bypass-free:** loop.mjs JSON argv is data; the only execution vector is
    `$(...)`/backticks in double quotes, which the blanking preserves. Grounded
    by the Phase 1 static guard test.
- Constraint: do NOT wire `matchConstraintPattern` (red-team Finding 4 — extends
  the `$(...)` bypass to security constraints like `package-manager`/`docker`/
  `sudo` with no observed false-positive; YAGNI). Do NOT touch `stripEchoProse`
  placement, the per-segment echo limitation, or the rule regex.

## Architecture

Generalize `blankQuotedArgsFor(command, verbSet)` (red-team Finding 12) to
accept either a `Set` or a predicate `(verb, segment) => boolean`, plus an
optional `blanker` function (default `blankAllQuoted`). One loop, one invariant.

`stripCliArgvPayload(command)`:
1. `splitKeepingDelims(command)` → parts (segments + `; & |` delimiter tokens).
2. For each segment part: if `isLoopCliSegment(segment)` (normalized verb is
   node-family AND the script-path token ends with `bin/loop.mjs` or is a
   `loop.mjs` path token, positionally anchored after `node`), replace with
   `blankInertQuoted(segment)`.
3. Rejoin and return.

`blankInertQuoted(segment)` — new quote-kind-aware blanker:
- Walk the segment with a quote-aware state machine (extend `blankStep` or a
  sibling). Single-quoted region: blank fully (inert). Double-quoted region:
  scan for `$(` or backtick; if present, preserve the region verbatim (real
  execution); if absent, blank it (inert data). Outside quotes: emit as-is.
- Reuses the quote-awareness of the existing `blankAllQuoted` state machine;
  the only new branch is the double-quoted `$(`/backtick pre-scan.

Recognition helper `isLoopCliSegment(segment)`:
- Compute the verb via `segmentVerb` and normalize: `node`, `nodejs`, or a token
  whose basename ends with `node` (`/(^|\/)node$/`).
- Find the script-path token: the first executable token after env-assignments
  and one command prefix (reuse `segmentVerb`'s skipping logic, then take the
  NEXT token). Require that token to match `/loop\.mjs$/` AND (end with
  `bin/loop.mjs` OR be the repo-canonical `tools/learning-loop-mastra/bin/loop.mjs`
  OR a bare `loop.mjs`). This rejects `node evil.mjs ... loop.mjs` (loop.mjs is
  not the script token) and `node ./loop.mjs` (non-canonical path — conservative:
  may still false-positive, but does not bypass; document as accepted limitation
  if the bare-`loop.mjs` form is too loose — prefer requiring `bin/loop.mjs`).

Wire sites (applyPromotedRules ONLY):
- Per-segment pass (gate-logic.js ~line 991): after `stripDataCommandQuotes`,
  add `stripCliArgvPayload(dataStripped)`.
- Full-command pass (~line 1016): compose into
  `stripEchoProse(stripDataCommandQuotes(stripCliArgvPayload(stripNodeEvalBody(stripMessageFlags(command)))))`.
- **NOT** `matchConstraintPattern` (red-team Finding 4).

Export `stripCliArgvPayload` (Phase 2 unit tests + parity with
`stripDataCommandQuotes`).

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/gate-logic.js`
  - Generalize `blankQuotedArgsFor` to accept a predicate + optional blanker (~line 390).
  - Add `blankInertQuoted` + `isLoopCliSegment` + `stripCliArgvPayload` near `stripEchoProse` (~line 430).
  - Wire 2 `applyPromotedRules` sites (~lines 991, 1016).
- Reference (reuse): `splitKeepingDelims`, `segmentVerb`, `blankAllQuoted`, `blankStep`, `walkQuoteState`.

## Implementation Steps

1. Generalize `blankQuotedArgsFor` to accept a `Set | (verb, segment) => boolean`
   predicate and an optional `blanker` (default `blankAllQuoted`); refactor
   `stripDataCommandQuotes` and `stripEchoProse` onto it unchanged (same behavior).
2. Add `blankInertQuoted(segment)`: quote-aware blanking, single-quoted always
   blanked, double-quoted blanked only when free of `$(` and backtick.
3. Add `isLoopCliSegment(segment)`: normalized node-family verb + anchored
   script-path token ending in `bin/loop.mjs`.
4. Add `stripCliArgvPayload(command)` = `blankQuotedArgsFor(command,
   isLoopCliSegment, blankInertQuoted)`. Export it.
5. Wire the per-segment pass: `const cliStripped = stripCliArgvPayload(dataStripped);`
   test `re.test(cliStripped)`.
6. Wire the full-command pass: insert `stripCliArgvPayload` into the compose
   chain before `stripDataCommandQuotes`/`stripEchoProse`.
7. Add `stripCliArgvPayload` unit tests (moved from Phase 1): blanks the quoted
   JSON of a canonical loop.mjs segment; leaves sibling segments intact (case
   4d); preserves double-quoted `$(...)` (case 7); no-ops on `--args-file` and
   on spoofed recognition shapes.
8. Run the Phase 1 test file → expect green (cases 4/4b now ok; case 7 escalate;
   spoofed cases escalate; 4d/5/6 escalate).
9. Run the locked-invariant suites:
   `pnpm test tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-quoted-strings.test.js tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-data-command-quotes.test.js tools/learning-loop-mastra/__tests__/legacy-mcp/gate-promoted-rules.test.js tools/learning-loop-mastra/__tests__/cli-bash-gate-guard.test.js`
   → expect all green.

## Success Criteria

- [ ] Phase 1 test file fully green (including case 7 and spoofed-recognition cases)
- [ ] `stripCliArgvPayload` exported; `blankQuotedArgsFor` generalized (one loop); `blankInertQuoted` quote-kind-aware
- [ ] Recognition anchored to canonical script-path token; verb normalized (node/nodejs/basename-node)
- [ ] Only the two `applyPromotedRules` sites wired (NOT `matchConstraintPattern`)
- [ ] `gate-logic-quoted-strings`, `gate-logic-data-command-quotes`, `gate-promoted-rules`, `cli-bash-gate-guard` all green
- [ ] case 7 (`$(...)`) stays escalate; case 4d stays escalate; case 5 stays escalate

## Risk Assessment

- **`$(...)` bypass (Critical):** the quote-kind-aware blanker is the mitigation.
  The case-7 test is the lock. If case 7 goes red, the blanker is
  over-blanking double-quoted `$(...)` — fix before proceeding.
- **Recognition too loose / too tight:** too loose → spoof bypass (Phase 1
  spoofed cases catch it); too tight → the canonical `node
  tools/learning-loop-mastra/bin/loop.mjs` form must still match (case 4/4b).
  The `nodejs` normalization must not accidentally match unrelated verbs.
- **Compose order:** `stripCliArgvPayload` runs before
  `stripDataCommandQuotes`/`stripEchoProse`; the three blank disjoint segment
  sets keyed by verb, so order does not change correctness, but keep the
  documented order for readability.
- **Generalizing `blankQuotedArgsFor`:** refactor must preserve
  `stripDataCommandQuotes`/`stripEchoProse` behavior exactly — the locked
  `gate-logic-data-command-quotes.test.js` and `gate-logic-quoted-strings.test.js`
  suites guard this.