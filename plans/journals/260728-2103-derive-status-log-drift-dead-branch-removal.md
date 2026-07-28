---
title: "derive_status log_drift dead-branch and enum removal"
date: 2026-07-28 21:03
plan: none
status: completed
tags: [meta-state, derive-status, drift, cleanup, dead-code, recommendation]
---

# derive_status log_drift dead-branch and enum removal

## Context

Follow-up to `260728-2058-derive-status-terminal-recommendation-guard.md`. That session
added the leading `if (!isOpen(entry)) return "no_action";` guard in
`core/derive-status.js#computeRecommendation`, which made the pre-existing
`mechanism-shipped + terminal → log_drift` branch unreachable. The operator's scope
then was "Aggressive (full)" — retain the branch as documentation — and that session
deferred the branch+enum removal as an open question. This session executed the
deferred cleanup (operator chose Option A: full removal).

## What happened

1. Confirmed `log_drift` has no remaining producer: grep across `core/`, `tools/`,
   and tests showed it only in the dead branch's `return "log_drift"` and the
   `META_STATE_RECOMMENDATIONS` enum definition (plus historical `plans/`/`docs/`
   records, which are stateful and left untouched). `core/query-drift.js`'s
   `computeRecommendation` never returned it.
2. Removed the unreachable branch from `core/derive-status.js#computeRecommendation`
   (the `mechanism-shipped + terminal → log_drift` block after the `isOpen → resolve`
   block). The leading `!isOpen` guard above it is what made it dead.
3. Dropped `"log_drift"` from `META_STATE_RECOMMENDATIONS` (exported enum → public
   contract). Consumers checked first: only the enum-shape `deepStrictEqual` in
   `derive-status.test.js` and a `.includes("re_verify")` check in
   `meta-state-stale-flag.test.js` (the latter is unaffected — `re_verify` stays).
   Updated the enum-shape assertion to the 4-value form.
4. Refreshed the two stale comments: `derive-status.js` terminal-guard comment
   (the "leftover sub-signal" example no longer names `log_drift`) and the
   `query-drift.js#computeRecommendation` doc-comment (now lists the 4-value enum
   without `log_drift`, and corrects the already-stale "4 values" count to reference
   `re_verify`).

## Tests

No behavioral test asserted `log_drift` (grep-confirmed), so the only test edit was
the enum-shape assertion. The prior session's regression tests (terminal
resolved/superseded + mechanism-shipped → `no_action`) stay green — they assert
`no_action`, which the leading guard returns regardless of the deleted branch.

## Verification

6 recommendation-asserting suites green: `derive-status.test.js` (39),
`query-drift.test.js` (27), `meta-state-derive-status-tool.test.js` (10),
`meta-state-query-drift-tool.test.js` (24), `meta-state-stale-flag.test.js` (9),
`loop-describe.test.js` (23) = 132 tests. Full `pnpm test` suite: 2620 passed / 1
skipped / 0 failed (284 files). End-to-end: `meta_state_derive_status` on superseded
finding `meta-260717T1026Z` → `recommendation:"no_action"`, `drift:false`. CLI
read-parity tests green (enum change did not disturb the CLI/MCP surface).
Re-grounded both edited core paths via `meta_state_refresh_file_index` (status
`no-op`: the `pnpm test` pretest seed had already refreshed the fingerprints).

## Reflection

Dropping a value from an exported enum is a public-contract change, so the A-vs-B
call (remove the value vs. keep it reserved) was an operator decision, not a silent
one — the dead branch alone could have been removed conservatively. Grep first
mattered here: "no other producer" is what made the enum value itself dead, and the
two test consumers had to be checked before the enum assertion was edited.

## Process note

Bundled with the prior session's uncommitted fix into one commit
(`fix(meta-state): make derive_status recommendation agree with drift for terminal
findings`), per the operator's instruction to ship fix + cleanup together. The
`meta-state.jsonl` self-model delta (the resolved terminal finding + the
runtime-agnostic resolve that surfaced it) is a separate staging decision — the
loop self-model, not part of the code fix.

## Publishing

AgentWiki publishing skipped: no AgentWiki CLI (`agentwiki whoami`) or MCP surface
available. This local journal is the work-history record.
