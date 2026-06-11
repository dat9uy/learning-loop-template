---
date: 2026-06-11
author: operator
summary: "Refactored the cold-session probe to emit a meta-state finding only on novel failure. Replaces the rejected channel-split plan with a ~50 LOC test refactor. Implements loop-design-cold-session-fail-to-finding-conditional-emission."
related-loop-design: "loop-design-cold-session-fail-to-finding-conditional-emission"
related-plans: ["plans/260611-1300-cold-session-fail-to-finding"]
related-reports: ["plans/reports/problem-solving-260611-1220-meta-state-evidence-channel-split.md (status: superseded)", "plans/reports/problem-solving-260611-1300-cold-session-fail-to-finding-promotion.md"]
related-findings: ["meta-260606T0443Z-mcp-tools-not-loaded-into-agent-tool-list", "meta-260608T1410Z-finding-meta-260606t0443z-mcp-tools-not-loaded-into-agent-to", "meta-260608T1522Z-test-1-cold-session-hangs-in-mcp-gapped-env"]
---

# Cold-session probe: fail-to-finding conditional emission

## Symptom

The cold-session probe wrote 18 `entry_kind: "finding"` entries to `meta-state.jsonl` over its operational history, all with `subtype: "mcp-client-loading"`. The entries were dedup-via-`tryClaimSessionId`, so they represented one *logical* finding being re-logged on every test run. The conflation: the test was logging "I ran" as "I learned something."

## Operator pushback on the channel-split plan

The 1220 report (`plans/reports/problem-solving-260611-1220-meta-state-evidence-channel-split.md`) proposed option A: a parallel `records/meta/probe-evidence/` JSONL channel for test output, plus a rule rewrite to consult that channel. The operator rejected this as "bloated and defeated the self purpose of 'self-learning' loop." The diagnosis (test evidence is not self-knowledge) was correct, but the prescription (build another registry) was heavier than the disease.

## The conditional-emission insight

The 1300 report (`plans/reports/problem-solving-260611-1300-cold-session-fail-to-finding-promotion.md`) flips the framing: the test runner's pass/fail exit code is the authoritative signal, and the registry's role is to capture *what was learned* from a failure, not to log the test's existence. Pass path: write nothing. Fail path: dedup-write via the existing `tryClaimSessionId` helper. The soft-delete-on-gap-close branch is removed.

The cascade: ~50 LOC of test refactor, no new schemas, no new entry_kind, no parallel evidence channel. The 9 stale historical entries migrate to a single change-log via `meta_state_supersede` (8 archived + 1 resolved entries are pre-existing terminal states and are not migrated).

## Implementation

### Phase 1: Test-first refactor of L1+L2 probes

- Extracted `probeL1` and `probeL2` helpers into `tools/learning-loop-mcp/__tests__/probe-helpers.cjs`.
- Helpers accept a `root` parameter for hermetic testing.
- Gap-close branch resolves active findings (status → resolved) instead of soft-deleting (status → stale).
- Gap-open branch preserves atomic `tryClaimSessionId` dedup.
- `cold-session-discoverability.test.cjs` tests 3 and 5 refactored to use helpers.

### Phase 2: Migrate 9 stale historical entries

- Created change-log `meta-260611T2140Z-tools-learning-loop-mcp-tests-cold-session-discoverability-t`.
- Superseded 9 stale `mcp-client-loading` entries (8 cold-session L2 + 1 claude-code).
- 8 archived + 1 resolved entries left untouched (pre-existing terminal states).

### Phase 3: Regression guard + cross-CLI parity

- Added regression-guard test in `cold-session-discoverability.test.cjs`: asserts `probeL1`/`probeL2` write NOTHING on synthetic pass.
- Added regression-guard test in `claude-code-mcp-loading.test.cjs`: same invariant.
- Refactored claude-code probe to use `probeL1` helper (eliminates TOCTOU race; Finding 8).
- Full test suite: 949 tests, 0 failures.

### Phase 4: Loop-design closeout

- Patched `loop-design-cold-session-fail-to-finding-conditional-emission` to `status: "inactive"` with `shipped_in_plan: "plans/260611-1300-cold-session-fail-to-finding"`.

## Loop-design ship event

This plan ships `loop-design-cold-session-fail-to-finding-conditional-emission`. The design is patched to `status: "inactive"` with `shipped_in_plan: "plans/260611-1300-cold-session-fail-to-finding"`.

## What this changes for future contributors

A future contributor who wants to add a new probe that logs to the registry should follow the same conditional-emission pattern: pass → silent, fail → one finding. The regression-guard tests in `cold-session-discoverability.test.cjs` and `claude-code-mcp-loading.test.cjs` catch re-introductions of unconditional writes at PR time.
