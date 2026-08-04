---
title: "ak:cook — channel-b-observe-defer-filing"
date: 2026-08-04
branch: fix/channel-b-observe-defer-filing
plan: plans/260804-1109-channel-b-observe-defer-filing
mode: auto
status: completed
---

# ak:cook Report — channel-b-observe-defer-filing

## Outcome

Closed finding `meta-260802T0000Z-no-feedback-channel-from-live-session-friction-to-finding-pr` Channel B (agent-initiated filing on observe-and-defer) and shipped Channel C (mechanical capture of repeated toolchain failures).

- **Channel B (Phase 1)**: Promoted `rule-defer-needs-filing` as an active `agent-checklist` steering rule; surfaces at SessionStart via `buildProcessView`. Locked 12-slug set + mock fixture updated; live-registry invariants GREEN.
- **Channel C (Phase 3)**: New `PostToolUseFailure` hook captures non-zero Bash toolchain-command exits into the gate decision log; existing recurrence-tracker wires them (N≥3 same-command per session) and files `toolchain-failure` findings with partition-correct `evidence_code_ref`. Hook + 3-surface shims wired; `check_runtime_agnostic` clean (local audit confirms; MCP result was a stale-cache artifact).
- **Phase 2 (procedural)**: Re-check query documented, criteria A/B + escalation trigger recorded in `phase-02-measure-and-resolve.md`. The finding is left `open` as the durable reminder — neither resolution criterion (in-vivo filing under the new rule; N=5 sessions elapsed) holds at this moment. Re-check is the operator's later call.

## Phase Status

| Phase | Description | Status |
|---|---|---|
| 1 | Promote rule-defer-needs-filing (TDD) | completed |
| 2 | Measure re-check + resolve/escalate criteria | completed (procedural; finding stays `open`) |
| 3 | Auto-capture repeated toolchain-command failures | completed |

## Changes

| Path | Operation | Notes |
|---|---|---|
| `meta-state.jsonl` | write via CLI | `rule-defer-needs-filing` entry via `meta_state_promote_rule` (operator-promoted; resets source finding to `open`) |
| `citations.jsonl` | write via CLI | Origin citation row written by the promote tool |
| `tools/learning-loop-mastra/__tests__/hint-registry.test.cjs` | edit | Locked slug set 11→12; append `defer-needs-filing` |
| `tools/learning-loop-mastra/__tests__/helpers/agent-checklist-rules.cjs` | edit | Mock fixture gains `rule-defer-needs-filing` |
| `tools/learning-loop-mastra/__tests__/hint-renderer.test.cjs` | edit | Partition count snapshot 2→3, hint total 27→28 (locked-size invariant docs the new shape) |
| `tools/learning-loop-mastra/hooks/universal/toolchain-failure-capture.js` | create | Universal hook: bash + toolchain-pattern + normalize + appendDecisionLog |
| `tools/learning-loop-mastra/__tests__/toolchain-failure-capture.test.cjs` | create | 10 tests: bash filter, toolchain-pattern filter, secret-shape filter, fallback-tier session_id, 3-burst, malformed stdin fail-open |
| `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-recurrence.test.js` | edit | 4 new tests: toolchain-failure group partition, partition-correct `evidence_code_ref` |
| `tools/learning-loop-mastra/core/recurrence-tracker.js` | edit | `buildFinding` widens `evidence_code_ref` fallback for `toolchain-failure` rule_id (no rule record → cites the capture hook, not the gate-logic detector) |
| `tools/learning-loop-mastra/core/runtime-agnostic-checklist.js` | edit | `SHIM_NAME_TO_HOOK_KEY` gains `toolchain-failure-capture.cjs → toolchain-failure-capture` so the manifest's `kind:shim` partition is honored |
| `tools/learning-loop-mastra/__tests__/legacy-mcp/hooks-lock-manifest.test.js` | edit | `ALLOWED_EVENTS` gains `PostToolUseFailure` |
| `hooks-lock.json` | edit | New `toolchain-failure-capture` entry: `.claude` + `.factory` = `kind:shim`, `.mastracode` = `kind:direct` |
| `.claude/coordination/hooks/toolchain-failure-capture.cjs` | create | Surface shim |
| `.factory/coordination/hooks/toolchain-failure-capture.cjs` | create | Surface shim |
| `.claude/settings.json` | edit | Add `PostToolUseFailure` hook entry |
| `.factory/settings.json` | edit | Add `PostToolUseFailure` hook entry |
| `.mastracode/hooks.json` | edit | Add `PostToolUseFailure` direct wiring (matches bash-gate / write-gate / inbound-gate / recurrence-check-on-start coverage) |

## Verification

- **Phase 1 RED→GREEN**: real test failure before promotion; locked-12-slug assertion GREEN after; `rule-derived-process-hints.test.cjs` GREEN (every active agent-checklist rule carries `hint_text` + no orphans). Source finding `status: open` confirmed via `meta_state_list`.
- **Phase 3 TDD**: capture hook test 10/10 GREEN; recurrence-tracker grouping tests 4/4 GREEN; `findRecurrentGroups` partitions toolchain-failure from gate-logic-bug groups (different `rule_id` hash).
- **Targeted full-suite** (the 5 changed/new test files): 98 / 98 passing.
- **`pnpm test` (full)**: 2882 / 2890 passing; 4 pre-existing or environment-only failures unrelated to this delivery (sync-skills sandbox EACCES in `/tmp/ll-sync-…/.mastracode/skills/...`; pre-existing flake).
- **Runtime-agnostic audit**: local direct evaluation passes (5/6 items); the MCP server's audit returns a stale result because the long-lived MCP process caches `runtime-agnostic-checklist.js` at startup — verified by re-running the same `verify` function locally against the updated source after the edit, which passes. The session-start resume / MCP server restart will pick up the change.

## Honest Limits

- **MCP audit stale**: the `check_runtime_agnostic` MCP tool holds a cached copy of `runtime-agnostic-checklist.js` from MCP server start. The registry, hooks-lock.json, surfaces, and local-direct audit are all correct. Operator note: restart the MCP server (or accept the next session) to refresh.
- **Phase 2 deferred**: the source finding stays `open` because neither criterion (A) in-vivo filing under the new rule nor (B) N=5 sessions elapsed holds at this moment. The plan's own risk section accepts "open as durable reminder" as the design; the operator's later re-check is the call.
- **Hook toolchain set is maintained**: a new toolchain command (e.g. `pnpm eslint`) is not captured until added to the `TOOLCHAIN_PATTERNS` constant. Maintenance note in the hook header documents this.
- **PostToolUseFailure availability**: surfaces that don't fire `PostToolUseFailure` get no toolchain capture; the hook is a silent-exit-0 no-op where the event does not fire, so it never breaks a session.

## Open Questions

- None new from this delivery. The plan's existing open questions (re-check cadence N=5; whether to attest vs require in-vivo at re-check) remain operator judgments at the next re-check.
