---
title: Repair vitest recurrence L2 event contract
date: 2026-08-09
summary: "Gate+tracker share mode-aware classifier; ordinary rule fires stay telemetry, only evaluator-proven unexpected-match auto-files; 2 critical review defects fixed; full suite 3352/4/0."
---

# Repair vitest recurrence L2 event contract

## What happened

Implemented plan 260809-1538 (Vitest recurrence telemetry and unexpected-match classification) across 5 phases. The recurrence tracker previously filed a `recurring-false-positive` finding for ANY repeated `rule_id` event — so legitimate `rule-no-raw-stdout-vitest` fires (real violations, correctly escalated) were auto-filed as bugs. Root cause: the tracker could not distinguish a legitimate rule fire from an unexpected inert-data match because the decision log carried no provenance.

## Decision

Repaired the L2 event contract instead of adding rule-level suppression:
- A rule match is telemetry; only an evaluator-proven `unexpected-match` event (inert-data origin + `event_source:"bash-gate-evaluator"`) enters automatic recurrence filing.
- Discriminated, fail-closed provenance pair on decision-log rows: `match_origin` (`executable|inert-data|mixed|unknown`) × `candidate_kind` (`ordinary-rule-fire|unexpected-match|unclassified`). Contradictory/missing/wrong-producer/cross-surface-conflicted rows → unclassified, never auto-file.
- New pure `core/command-classification.js` (gate/recurrence/event modes; dual-view inert-span proof) shared by gate + tracker.
- Proven inert matches emit a separate non-permission `event:"unexpected-match"` telemetry (decision stays `ok`, no deny/allow override); the gate hook logs it without changing the permission result.

## Critical review defects fixed

1. Telemetry short-circuit (R1-D1): first inert match returned from the rule loop, masking a real violation from a later rule. Fixed with `pendingTelemetry` deferral to after the loop; real escalate wins inline.
2. Forgeable decision-log rows (R1-D2 + R2-NEW-1): `.gate-decision.log` was ungated, so bash commands AND Write/Edit tools could append forged producer-trio rows the tracker trusts. Closed both seams: per-surface bash patterns (`DECISION_LOG_WRITE_PATTERNS`, dedicated reason, path-variant coverage) + a write-gate `decision-log` rule (`DECISION_LOG_PATHS`).
3. LOW cleanups: unused `matched` param, stale "RED" test comment, conservative regex over-match documented.

## Next steps

- Operator: review and commit (recommend a single conventional-commit message; ~18 modified + 9 new files, 5 phase reports + completion report in `plans/reports/`).
- The 3 `rule-no-raw-stdout-vitest` registry rows (v0/v1/v2) are legitimate versioned history; the drift test resolves canonical max-version v2 and reports disagreement without suppressing.
- Residual decision-log path-named over-match (`.gate-decision.log.backup`) is fail-closed and documented; no action needed.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
