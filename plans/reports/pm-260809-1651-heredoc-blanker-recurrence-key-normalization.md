# Progress Report — Heredoc blanker + recurrence-key normalization

- **Plan:** `plans/260809-1548-heredoc-blanker-recurrence-key-normalization/plan.md`
- **Status:** Complete (all 3 phases, 16/16 acceptance checkboxes)
- **Date:** 2026-08-09
- **Branch:** `chore/loop-debug-toolchain-failure`

## Summary

Closed the heredoc data-blanking gap in the bash gate and normalized recurrence keys so one root-cause class files one finding, not N. The mislabeled `gate-logic-bug` finding that motivated the plan is resolved with the corrected characterization.

## Phase completion

| Phase | Status | Acceptance |
|-------|--------|-----------|
| 1. stripHeredocBodies blanker | Complete | 4/4 |
| 2. Recurrence-key normalization | Complete | 8/8 |
| 3. Registry disposition + verification | Complete | 4/4 |

## Delivered

- `stripHeredocBodies(command, allowlist)` — quote-aware heredoc data-blanker, wired into `matchConstraintPattern`, `matchGateVerb`, `applyPromotedRules` with per-wiring-site allowlists, fail-closed wrapper, `GATE_HEREDOC_BLANKER=0` kill-switch. Herestrings, executor-verb heredocs, unquoted heredocs stay visible.
- `blankDataPayloadsForKey` + `normalizePrefixForKey` — tracker-only coarser recurrence key (heredoc bodies quoted+unquoted, node -e escaped-quote, redirect target + delimiter word), memoized per entry, over-collapse guard (post-terminator residue salt).
- 8-shape matrix verified: shapes 1–2 escalate (real), 3–4 ok (blanked), 5 escalate (unquoted residual), 6–8 ok/escalate per design.
- Finding `meta-260809T1433Z-…-vitest-ru` resolved (v2, `resolved_by: operator`); change-log entry recorded.
- Re-file burst: dry-run 14 groups / 0 findings emitted.

## Review findings addressed

- **Critical:** herestring `<<<` exclusion over-blanked a real command after a newline (constraint bypass) — fixed in both blanker + tracker, regression tests added.
- **Medium:** description-keyed dedup fallback was dead code (finding descriptions redact commands) — removed; burst mitigation is `existingKeys` + triage. Embedding the prefix would have leaked redacted data (secret-redaction test verified).

## Verification

- Full `legacy-mcp` suite: 170 files passed, 1 skipped; 1929 tests passed, 4 skipped — green.
- 8-shape matrix: expected verdicts match exactly.

## Unresolved questions

- Residual re-file of changed-key heredoc classes is handled by `existingKeys` + post-ship triage; a previously-resolved heredoc class could still file one new finding on the first post-ship SessionStart if it recurs (the description fallback cannot suppress it without leaking redacted data). Acceptable; triage step documented.
