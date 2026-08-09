---
title: Heredoc blanker + recurrence-key normalization shipped
date: 2026-08-09
summary: Closed the bash-gate heredoc data-blanking gap and normalized recurrence keys; resolved mislabeled finding; reviewer caught+fixed a herestring constraint bypass
---

# Heredoc blanker + recurrence-key normalization shipped

## What happened
Implemented plan 260809-1548 across 3 phases:
- **Phase 1:** Added `stripHeredocBodies` to the gate's blanker chain (`gate-logic.js`), wired into `matchConstraintPattern`, `matchGateVerb`, `applyPromotedRules` with per-wiring-site allowlists (node excluded from constraint layer), fail-closed wrapper, and `GATE_HEREDOC_BLANKER=0` kill-switch. 8-shape matrix now matches expected verdicts.
- **Phase 2:** Added `blankDataPayloadsForKey`/`normalizePrefixForKey` — a tracker-only coarser recurrence key collapsing heredoc bodies (quoted + unquoted), node -e escaped-quote bodies, redirect targets/delimiters. Memoized per entry; over-collapse guard salts with post-terminator residue.
- **Phase 3:** Resolved `meta-260809T1433Z-promoted-rule-rule-no-raw-stdout-vitest-v2-pattern-vitest-ru` (v2, `resolved_by: operator`) with corrected characterization; recorded change-log.

## Decision
- Code review (mandatory) caught a **critical herestring bug**: the `<<<` exclusion emitted only one `<`, re-parsing the remaining `<<` as a heredoc and blanking a real command after a newline — hiding container/sudo commands from constraints (bypass). Fixed in both `stripHeredocBodies` and `blankDataPayloadsForKey`; regression tests added.
- The **description-keyed dedup fallback was dead code**: finding descriptions redact commands, so no prefix is recoverable. Embedding the prefix leaked redacted data (secret-redaction test failed). Removed the fallback; re-file burst is handled by `existingKeys` + post-ship triage.

## Next steps
- Watch the first post-ship SessionStart for residual changed-key heredoc re-files; triage as duplicates per the phase-03 step.
- No docs churn beyond the recurrence paragraph in `docs/architecture.md`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
