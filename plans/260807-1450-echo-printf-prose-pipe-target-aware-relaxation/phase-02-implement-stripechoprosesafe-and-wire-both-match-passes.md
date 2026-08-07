---
phase: 2
title: "Implement per-segment safe echo/printf blank and wire"
status: completed
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 2: Implement per-segment safe echo/printf blank and wire

## Overview

Add `stripEchoProseSafe(command)`: blank an echo/printf segment's quoted args
ONLY when the segment has no redirect operator (`>`/`>>`/`<` outside quotes) AND
is not followed by a single real `|`-pipe (`||`/`&&`/`;`/`&`/end are NOT pipes
→ blank). Reuse `blankInertQuoted` (quote-kind-aware) and `splitKeepingDelims`.
Wire it into the **per-segment pass** (new — where the locked limitation lived)
by applying it once to the whole command before `splitSegments`. **Leave the
full-command-pass `stripEchoProse` UNCHANGED** and **leave
`matchConstraintPattern` UNCHANGED.** No inert-set, no chain-walk.

## Requirements

- Functional: echo/printf quoted args blanked iff (no redirect in segment) AND
  (the next non-empty delimiter-joined segment is not via a single real `|`).
  `||`/`&&` (two same-char delim tokens with an empty segment between) =
  logical operators → blank. Quote-kind-aware (single always; double only
  without `$(`/backtick). Unquoted args untouched.
- Non-functional: delimiter-preserving. Reuse existing helpers
  (`splitKeepingDelims`, `segmentVerb`, `blankInertQuoted`, `ECHO_PROSE_COMMANDS`)
  — no new tokenizer. Conservative default: when in doubt (redirect, real pipe,
  ambiguous delimiter), preserve prose. Minimal duplication of
  `blankQuotedArgsFor`'s walk (accepted; the logic is simpler than a chain-walk).

## Architecture

In `core/gate-logic.js`, next to `stripEchoProse` (line ~426):

1. Add `segmentHasRedirect(segment)` — true if the segment contains `>`, `>>`,
   or `<` OUTSIDE quoted regions (use a quote-aware scan; `echo "a > b"` has the
   `>` inside double quotes → not a redirect). A redirect persists the output →
   preserve. (Redirects inside quoted echo args are data, not real redirects.)
2. Add `followedByRealPipe(parts, i)` — given the `splitKeepingDelims` parts
   array and an echo segment's index, inspect `parts[i+1]` (the delimiter after
   the segment) and `parts[i+3]` (the delimiter after the next segment):
   - If `parts[i+1] === "|"` AND `parts[i+3] !== "|"` → single real `|`-pipe →
     true (preserve).
   - If `parts[i+1] === "|"` AND `parts[i+3] === "|"` → `||` (logical-OR) →
     false (not a pipe → blank, subject to redirect check).
   - Else (`;`/`&`/`&&`/end) → false (not a pipe → blank).
   - `&`/`&&`: `parts[i+1] === "&"` → false (background/AND, not a pipe). Two
     `&` tokens (`&&`) handled the same — `&` is never a pipe.
3. Add `stripEchoProseSafe(command)` — `splitKeepingDelims(command)`; for each
   part that is an echo/printf segment (verb via `segmentVerb` ∈
   `ECHO_PROSE_COMMANDS`), if `!segmentHasRedirect(part)` AND
   `!followedByRealPipe(parts, i)` → replace with `blankInertQuoted(part)`,
   else leave verbatim; join. Return original if no change. (Shape close to
   `blankQuotedArgsFor` but the blanking decision consults the next delimiter
   and the segment's own redirect status — sibling/delimiter context that
   `blankQuotedArgsFor`'s `(segment)=>bool` predicate lacks. Minimal
   duplication; do not abstract prematurely — YAGNI.)
4. `stripEchoProse` (blanket, internal, not exported): **KEEP IT** — it remains
   the full-command-pass blanker, unchanged. Do NOT remove or rename it. (The
   prior draft proposed replacing it; Option A keeps it as-is to preserve the
   existing `echo "label" | tail` → ok relaxation.)

### Wiring in `applyPromotedRules` (line ~1043)

- **Per-segment pass (line ~1086):** apply `stripEchoProseSafe` ONCE to the
  whole `command` before the `splitSegments` loop (the next-delimiter check
  needs `splitKeepingDelims` context, which per-segment lacks):
  ```
  const echoSafe = stripEchoProseSafe(command);
  for (const segment of splitSegments(echoSafe)) {
    const stripped = stripMessageFlags(segment);
    const nodeStripped = stripNodeEvalBody(stripped);
    const dataStripped = stripDataCommandQuotes(nodeStripped);
    const cliStripped = stripCliArgvPayload(dataStripped);
    if (re.test(cliStripped)) { matched = true; break; }
  }
  ```
- **Full-command pass (line ~1120):** UNCHANGED — keep
  `stripEchoProse(stripDataCommandQuotes(stripCliArgvPayload(stripNodeEvalBody(stripMessageFlags(command)))))`.
  This preserves the existing real-pipe-to-inert relaxation (`echo "label" |
  tail` → ok). The per-segment pass now catches the bypass shapes (redirect,
  real pipe to exec) first because it preserves the prose → `|`-inside-quotes
  matches; the full-command blanket strip only runs for the no-bypass
  false-positive shapes it already handled.
- **`matchConstraintPattern` (line ~527):** UNCHANGED. Add a comment noting the
  deliberate asymmetry: the first-class `docker`/`sudo` gate never strips echo
  prose (maximally conservative; `echo "docker" | bash` caught there), and
  promoted-rule-only tokens have NO constraint backstop, so the per-segment
  relaxation must be no-bypass on its own (Option A).

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/gate-logic.js` (add `segmentHasRedirect`, `followedByRealPipe`, `stripEchoProseSafe`; wire per-segment pass; comment `matchConstraintPattern`; KEEP `stripEchoProse`)
- Read: `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-echo-prose-pipe-target.test.js` (Phase 1 red tests now turn green)

## Implementation Steps

1. Add `segmentHasRedirect(segment)`: quote-aware scan for `>`/`>>`/`<` outside single/double quotes (honor `\"`/`\\` escapes). Return boolean.
2. Add `followedByRealPipe(parts, i)`: inspect `parts[i+1]` and `parts[i+3]` per the Architecture rules; return true only for a single real `|` (not `||`).
3. Add `stripEchoProseSafe(command)`: `splitKeepingDelims` walk; blank echo/printf segments iff `!segmentHasRedirect(part) && !followedByRealPipe(parts, i)` using `blankInertQuoted`; preserve otherwise; return original if unchanged.
4. In `applyPromotedRules` per-segment pass: introduce `const echoSafe = stripEchoProseSafe(command);` and iterate `splitSegments(echoSafe)`. Leave the rest of the per-segment chain and the full-command pass intact.
5. Add/update comments above the per-segment pass (line ~1083) describing Option A (preserve on redirect or real `|`; `||`/`&&`/`;`/`&`/end → blank) and citing the no-bypass tests; add the no-backstop comment above `matchConstraintPattern`.
6. Run `pnpm test:one tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-echo-prose-pipe-target.test.js` → all groups A-F GREEN. Run the three flipped in-place tests → GREEN.
7. Run the touched existing test files via `pnpm exec vitest --changed` (or `:one` per file): `gate-logic-data-command-quotes`, `gate-logic-cli-argv-payload`, `gate-promoted-rules`, `gate-logic-quoted-strings`, `bash-gate-decision-visibility`, and `tools/learning-loop-mastra/__tests__/cli-bash-gate-guard.test.js` (FULL path — this file is NOT in `legacy-mcp/`) → all GREEN. Explicitly confirm the three echo-prose tests at `gate-logic-data-command-quotes.test.js:131-149` stay GREEN (they depend on the unchanged full-command `stripEchoProse`).

## Success Criteria

- [ ] `stripEchoProseSafe` implemented: blank iff `!segmentHasRedirect && !followedByRealPipe`; `||`/`&&`/`;`/`&`/end → blank; single real `|` → preserve; redirect → preserve.
- [ ] Per-segment pass applies `stripEchoProseSafe` once before `splitSegments`; full-command pass `stripEchoProse` UNCHANGED; `matchConstraintPattern` UNCHANGED with no-backstop comment.
- [ ] `stripEchoProse` kept (not removed/renamed) — full-command pass still uses it.
- [ ] Phase 1 test file all groups A-F GREEN.
- [ ] Three flipped in-place tests GREEN (with `rule_id` assertions removed).
- [ ] All touched existing gate-logic test files GREEN, including `cli-bash-gate-guard.test.js` (full path) and `gate-logic-data-command-quotes.test.js:131-149` echo-prose tests.
- [ ] No new tokenizer; helpers reused; minimal duplication (KISS/DRY).

## Risk Assessment

- **`||`/`&&` tokenization (High):** `splitKeepingDelims` emits `||` as `["...", "|", "", "|", "..."]`. `followedByRealPipe` must distinguish single `|` (real pipe → preserve) from `||` (logical-OR → blank) by checking `parts[i+3]`. A bug here either over-preserves (false positive — `||` read as pipe) or, worse, under-preserves (`|` read as `||` → blank a real pipe → bypass). Mitigated by Group B (`echo "vitest run | tail" | bash` → escalate, real single pipe) and Group C (`echo "pnpm test | tail" || bash` → ok, logical-OR) tests in Phase 1.
- **Redirect detection inside quotes (Medium):** `echo "a > b"` has `>` inside double quotes (data, not a redirect) → must NOT trigger preserve. `segmentHasRedirect` must be quote-aware. Mitigated by Group A (`echo "pnpm test foo | grep bar"` → ok, no redirect despite `|` inside quotes — the `|` is inside quotes, not a redirect; and no real pipe). Add an explicit `echo "a > b"` → ok test if not already covered (the `>` is inside quotes → not a redirect → blank).
- **Double-blank interaction (Low):** after `stripEchoProseSafe` blanks echo prose, `stripDataCommandQuotes`/`stripCliArgvPayload` run per-segment on already-blanked text. echo is not a DATA_COMMAND nor a loop CLI segment → no double-blank mismatch. Confirmed by the existing data-command and cli-argv suites staying green.
- **Full-command pass interaction (Low):** the full-command blanket `stripEchoProse` still runs when the per-segment pass does not match. For bypass shapes, the per-segment pass now matches first (preserve → `|`-inside-quotes match) → full-command skipped. For no-bypass false-positive shapes (`echo "label" | tail`), per-segment no match → full-command blanks → ok (unchanged). Trace confirmed by Group E tests.
- **Performance (Low):** `stripEchoProseSafe` runs once per `applyPromotedRules` call (same cost class as the existing full-command `stripEchoProse`). Cheap.