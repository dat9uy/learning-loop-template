---
phase: 4
title: "Journal + loop-design closeout"
status: completed
priority: P3
effort: "20m"
dependencies: [1, 2, 3]
---

# Phase 4: Journal + loop-design closeout

## Overview

This phase closes the loop: it writes a journal entry in `docs/journals/` recording the conditional-emission refactor, the operator's pushback on the channel-split plan, and the loop-design's ship event. It also flips the `loop-design-cold-session-fail-to-finding-conditional-emission` design from `status: "active"` to `status: "inactive"` with `shipped_in_plan: "plans/260611-1300-cold-session-fail-to-finding"` and `shipped_at: <now>`. The journal is the human-readable record; the design's status flip is the machine-readable signal that the work is done.

## Requirements

- **Functional**:
  - A journal entry exists at `docs/journals/260611-cold-session-fail-to-finding.md`.
  - The journal entry's frontmatter follows the project's journal convention (date, author, summary, related-loop-design, related-plans).
  - The journal entry's body covers: the original symptom (18-entry pollution pattern), the operator's pushback on the channel-split plan, the conditional-emission insight, the test-first refactor, the migration, the regression guard, and the loop-design's ship event.
  - The loop-design `loop-design-cold-session-fail-to-finding-conditional-emission` is patched to `status: "inactive"`, `shipped_in_plan: "plans/260611-1300-cold-session-fail-to-finding"`, `shipped_at: <now>`.
- **Non-functional**:
  - The journal is concise (1-2 pages; not a re-statement of the 1300 report; it points to the 1300 report for the full design).
  - The loop-design patch is atomic (uses `meta_state_patch` with CAS via `_expected_version`).

## Architecture

The journal is a markdown file with frontmatter. It follows the project's journal convention (see `docs/journals/` for examples; the most recent entries are the `260610-...` and `260609-...` ones).

The loop-design patch uses `meta_state_patch` with `_expected_version` to ensure atomicity. The patch is the ship event; after the patch, the design's `status: "inactive"` makes it discoverable via `loop_describe({tier: "warm"})` in the "shipped designs" block (if such a block exists; otherwise the design is simply not in the "active" list).

## Related Code Files

- **Create**: `docs/journals/260611-cold-session-fail-to-finding.md`
- **Modify**: `meta-state.jsonl` (the loop-design entry is patched in place)

## Implementation Steps

### Step 1: Write the journal entry

Create `docs/journals/260611-cold-session-fail-to-finding.md` with the following structure:

```markdown
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

[summary of the 4 phases, with links to plan files]

## Loop-design ship event

This plan ships `loop-design-cold-session-fail-to-finding-conditional-emission`. The design is patched to `status: "inactive"` with `shipped_in_plan: "plans/260611-1300-cold-session-fail-to-finding"`.

## What this changes for future contributors

A future contributor who wants to add a new probe that logs to the registry should follow the same conditional-emission pattern: pass → silent, fail → one finding. The regression-guard test in `cold-session-discoverability.test.cjs` and `claude-code-mcp-loading.test.cjs` catches re-introductions of unconditional writes at PR time.
```

The body is concise; it points to the 1300 report for the full design rationale and to the plan files for the implementation details.

### Step 2: Patch the loop-design

> **Red-team correction (Finding 11):** `meta_state_patch` returns `{patched: false, reason: "version_mismatch"}` on CAS failure (no exception is thrown; the tool handler at `meta-state-patch-tool.js:60-65` returns the string). The plan must explicitly check the return value. The loop-design entry at `meta-state.jsonl:533` has no `version` field; the script must first read the current version via `meta_state_list` before patching.

Two sub-steps:

**Step 2a: Fetch current version**

Call `meta_state_list({entry_kind: "loop-design", ids: ["loop-design-cold-session-fail-to-finding-conditional-emission"]})` and read the entry's `version` field. If the entry has no `version` field, default to `0` (the schema's initial version).

**Step 2b: Patch with explicit return-value check**

Call `meta_state_patch` with:

```js
{
  id: "loop-design-cold-session-fail-to-finding-conditional-emission",
  entry_kind: "loop-design",
  patch: {
    status: "inactive",
    shipped_in_plan: "plans/260611-1300-cold-session-fail-to-finding",
    shipped_at: <now-iso>
  },
  _expected_version: <current-version>
}
```

Then assert:

```js
const result = await meta_state_patch(...);
if (result.patched === false) {
  throw new Error(`loop-design patch failed: ${result.reason}; re-fetch version and retry`);
}
```

The patch is atomic via CAS. On version mismatch, the tool returns `patched: false` with a reason; the operator re-fetches the current version and retries. The explicit assertion prevents the silent-failure mode where the agent continues to verification with an un-patched loop-design.

### Step 3: Verify

- The journal file exists and renders correctly in the project's docs viewer (no specific verification step; just open it).
- `loop_describe({tier: "warm"})` no longer lists `loop-design-cold-session-fail-to-finding-conditional-emission` in the active block (or, if the active block lists it, the entry's `status: "inactive"` is reflected).
- `meta_state_list({entry_kinds: ["loop-design"]})` shows the design with `status: "inactive"` and `shipped_in_plan: "plans/260611-1300-cold-session-fail-to-finding"`.
- The plan's `Status: done` reflects in `ck plan status plans/260611-1300-cold-session-fail-to-finding` (all 4 phases completed).

## Success Criteria

- [ ] Step 1: journal entry written; frontmatter is valid; body is concise.
- [ ] Step 2: loop-design patched to `status: "inactive"`; `shipped_in_plan` and `shipped_at` set.
- [ ] Step 3: verification commands return the expected results.
- [ ] All 4 phases checked; `ck plan status` reports the plan as `Status: done`.

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| The journal entry's frontmatter does not match the project's journal convention | low | Step 1 references recent journal entries (`260610-...`, `260609-...`) for the convention. The frontmatter schema is small and stable. |
| The `meta_state_patch` CAS fails (version mismatch) | low | The tool returns the current version on mismatch; the operator re-fetches and retries. The patch is idempotent (re-running it on an already-shipped design is a no-op). |
| The loop-design is patched before the test refactor is fully verified | low | Phase 3 (regression guard + cross-CLI parity) is a hard dependency of this phase. The plan's `dependencies: [1, 2, 3]` enforces the order. |
| The plan is marked done before the journal is written | low | Phase 4 is the last phase; `ck plan check 4` is only fired after the journal exists. |
