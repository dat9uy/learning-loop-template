---
title: "derive_status terminal recommendation self-contradiction fix"
date: 2026-07-28 20:58
plan: none
status: completed
tags: [meta-state, derive-status, drift, bugfix, terminal, recommendation]
---

# derive_status terminal recommendation self-contradiction fix

## Context

Finding `meta-260728T2029Z-derive-status-returns-a-self-contradicting-result-for-termin`
(loop-anti-pattern) resolved. `meta_state_derive_status` returned self-contradicting
results for terminal (resolved/superseded) findings — e.g. `{drift:false,
recommendation:"investigate"}` on a superseded code-only finding. `drift:false` is
authoritative; the recommendation contradicted it.

## What happened

1. Verified the symptom site against source. The tool handler
   (`tools/learning-loop-mastra/tools/handlers/meta-state-derive-status-tool.js:49`)
   calls `deriveStatus()` from `core/derive-status.js` directly — NOT `queryDrift`.
   The finding's `evidence_code_ref` pointed at `core/query-drift.js#computeRecommendation`,
   a MISATTRIBUTION: that function only runs inside `queryDrift`, where terminal
   findings are filtered at `query-drift.js:44` (`computeIsDrift` L84 `isOpen` guard)
   before `computeRecommendation` is reached.
2. Real site: `core/derive-status.js#computeRecommendation`. Its `code-only → investigate`
   and `code-missing → investigate` branches fired regardless of terminal status, while
   the sibling `computeDrift` (L176) WAS terminal-aware → `drift:false`. The recommendation
   sub-signal missed the terminal treatment the drift field got.
3. Fix (user scope = "Aggressive (full)"): added a LEADING terminal guard in
   `core/derive-status.js#computeRecommendation`: `if (!isOpen(entry)) return "no_action";`,
   first so it covers every kind including `mechanism-shipped`. This collapses the prior
   `mechanism-shipped + terminal → log_drift` branch (now unreachable, retained as
   documentation per chosen scope).
4. Parity: threaded `entry` into `core/query-drift.js#computeRecommendation` (caller L47
   already had it) and added the mirroring leading `!isOpen` guard so the two sibling
   helpers stay consistent; behavior-preserving there since terminal findings are filtered
   at L44.
5. `isOpen` lives in `core/stale-view.js` (re-exported from `core/constants.js`);
   `TERMINAL_RAW_STATUSES` in `core/derive-status.js:28`; `TERMINAL_STATUSES` in
   `core/meta-state.js:212`.

## Tests

Added in `tools/learning-loop-mastra/__tests__/legacy-mcp/derive-status.test.js`:
terminal resolved + code-only → no_action; terminal superseded + code-only → no_action;
terminal resolved + code-missing → no_action; terminal resolved + mechanism-shipped →
no_action; terminal superseded + mechanism-shipped → no_action. All FAIL without the fix
(would return `investigate` / `log_drift`) and PASS with it. Open-finding behavior
unchanged (`investigate`) — asserted by pre-existing tests.

## Verification

6 recommendation-asserting suites green: `derive-status.test.js` (39),
`query-drift.test.js` (27), `meta-state-derive-status-tool.test.js` (10),
`meta-state-query-drift-tool.test.js` (24), `meta-state-stale-flag.test.js` (9),
`loop-describe.test.js` (23) = 132 tests. End-to-end: `meta_state_derive_status` on
superseded finding `meta-260717T1026Z` now returns `recommendation:no_action` (was
`investigate`). Re-grounded both code paths via `meta_state_refresh_file_index`.

## Reflection

The two-sibling design (separate `computeDrift` / `computeRecommendation`) meant a
terminal-status check added to one was silently absent from the other, and nothing
caught it because the public surface reports both as a pair. The finding's own
`evidence_code_ref` pointed at the wrong file — a reminder that drift evidence can
misattribute across near-duplicate helpers; verify the call path before acting.

## Process note

The bash gate (`rule-no-raw-stdout-vitest`) escalated twice during verification because
I piped `pnpm test:one` to `tail`/`grep`. Re-ran without pipes per the loop's test
discipline (`test:one` prints its own parsed summary).

## Follow-up / open question

The `mechanism-shipped + terminal → log_drift` branch in `core/derive-status.js` is now
unreachable dead code. User chose to retain it as documentation ("Aggressive", not
"Aggressive + remove dead branch"). A future cleanup could delete it plus the
`META_STATE_RECOMMENDATIONS` `"log_drift"` value if no other producer exists (grep showed
none in core/tools — only the enum definition and this branch).

## Publishing

AgentWiki publishing skipped: no AgentWiki CLI (`agentwiki whoami`) or MCP surface was
available. This local journal is the work-history record.
