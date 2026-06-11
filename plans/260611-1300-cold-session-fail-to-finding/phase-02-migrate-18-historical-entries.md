---
phase: 2
title: "Migrate 9 stale historical entries"
status: pending
priority: P2
effort: "30m"
dependencies: [1]
---

# Phase 2: Migrate 9 stale historical entries

## Overview

The 9 stale `mcp-client-loading` entries in `meta-state.jsonl` (8 cold-session L2 + 1 claude-code; verified per Red-team Finding 5) are pollution from the unconditional-write pattern. This phase writes a single change-log entry explaining the conditional-emission refactor and supersedes the 9 stale entries via `meta_state_supersede`. The 8 `archived` and 1 `resolved` entries are pre-existing terminal states and are not migrated. The audit trail moves to the change-log; the per-run history was never the registry's job. This phase is mechanical: it does not modify the test files (Phase 1 did that) and does not touch the rule (the rule is unchanged).

## Requirements

- **Functional**:
  - One change-log entry is created in `meta-state.jsonl` via `meta_state_log_change`. The entry's `change_dimension` is `surface`, `change_target` is `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` (and the analogous claude-code test), `change_diff.added` lists the conditional-emission invariant, `change_diff.removed` lists the soft-delete branch, and `reason` explains the operator's pushback on the channel-split plan.
  - All 9 stale historical `mcp-client-loading` entries (8 cold-session L2 + 1 claude-code) are superseded via `meta_state_supersede` with `consolidated_into: <change-log-id>`. Each supersede sets `status: "superseded"`, `superseded_at: <now>`, `superseded_by: "operator"`, and `resolution: "<reason>"`.
  - The 8 `archived` and 1 `resolved` entries are skipped (pre-existing terminal states; Red-team Finding 5).
  - The migration is idempotent: re-running it does not create duplicate change-log entries or re-supersede already-superseded entries.
- **Non-functional**:
  - The change-log entry's `applies_to` lists the test files and the rule.
  - The change-log entry's `evidence_code_ref` points at the test file (the code that changed) and the 1300 report (the design rationale).
  - The migration does not touch any entry whose `entry_kind` is not `finding` (change-logs, rules, loop-designs are preserved).

## Architecture

> **Red-team correction (Finding 4):** `meta_state_log_change` is NOT idempotent — it generates a fresh timestamp-based id via `generateId(slugify(change_target))` and calls `writeEntry` unconditionally (`tools/learning-loop-mcp/tools/meta-state-log-change-tool.js:38, 70`). The migration script must implement idempotency manually: read the registry, check for an existing change-log with matching `change_target+change_dimension+change_diff.removed`, and skip the write if found.

> **Red-team correction (Finding 6):** `meta_state_supersede` requires `OPERATOR_MODE=1` (line 17 of `meta-state-supersede-tool.js`). The script must abort with a clear error if `process.env.OPERATOR_MODE !== "1"`. The script is operator-only; an AI agent running it without `OPERATOR_MODE=1` will see 18 `operator_role_required` rejections and a half-written change-log.

> **Red-team correction (Finding 5):** The 18 historical entries are NOT all `status: "stale"`. Verified count from `meta-state.jsonl`: 8 are `archived` (lines 18, 60, 61, 487, 488, 501, 502, 506), 1 is `resolved` (line 58, the `meta-260608T1410Z-...` correction finding), 1 is `stale` (line 43, claude-code probe), and 8 are `stale` (lines 519, 523, 526-531, cold-session L2). The migration script must filter for `status === "stale"` only. The 8 `archived` entries and 1 `resolved` entry are already terminal and must NOT be re-stamped with `superseded_at`.

> **Red-team correction (Finding 9):** The 18-entry count includes 1 claude-code entry (line 43, `session_id: "test-claude-code-mcp-client-loading"`) and 1 `meta-260608T1410Z-...` (line 58, no `session_id`). The migration must handle these explicitly:
>
> - **Line 43 (claude-code, stale)**: include in the migration (the conditional-emission refactor applies to both probes per Plan.md "Cross-CLI parity" goal).
> - **Line 58 (loop-anti-pattern, resolved, no session_id)**: skip. This is a `loop-anti-pattern` finding, not a test-emitted finding; it represents a meta-observation about the cold-session test design, not test churn.
>
> The migration target is **9 stale entries** (8 cold-session L2 + 1 claude-code). The "18 entries" framing in Plan.md Overview is a misstatement; this phase migrates the 9 stale subset only. The 8 archived and 1 resolved entries are pre-existing terminal states and require no migration.

> **Red-team correction (Finding 12):** The checkpoint file `migrated-ids.txt` in the script's tempdir is a data-integrity hazard (tempdir can be cleaned by OS; not git-tracked). The script must use a registry-resident marker: check `entry.status === "superseded" && entry.consolidated_into === <change-log-id>` before re-superseding. The registry is the durable record; the script reads it on every run.

> **Red-team correction (Finding 13):** The script bypasses the write-gate and bash-gate (neither protects `scripts/**`). The script is operator-only (Finding 6) and adds a top-of-file guard: `if (process.env.OPERATOR_MODE !== "1") throw new Error("operator_role_required; set OPERATOR_MODE=1")`. The script also writes a guard to a sibling file `scripts/.migrate-cold-session-pollution-OPERATOR_ONLY` that signals to future readers this is operator-only.

The migration uses two MCP tools in sequence:

1. `meta_state_log_change` creates the canonical change-log entry. The entry is immutable, status: `active`, no TTL. The `change_diff` follows the schema's `mechanical` or `surface` dimension. **Idempotency**: the script reads the registry first and skips the write if a change-log with matching `change_target + change_dimension + change_diff.removed` already exists.
2. `meta_state_supersede` (called once per historical entry) marks each finding as `status: "superseded"` with `consolidated_into: <change-log-id>`. **Filter**: only entries with `status === "stale"` AND `subtype === "mcp-client-loading"` AND `entry_kind === "finding"`. **Idempotency**: skip entries already `status === "superseded"` AND `consolidated_into === <change-log-id>`.

A migration script (`scripts/migrate-cold-session-pollution.mjs`) wraps both calls. The script is *not* part of the test suite; it is a one-shot operator tool, run once and deleted. The script implements idempotency manually (Finding 4, Finding 12) and the operator-mode guard (Finding 6, Finding 13).

## Related Code Files

- **Create**: `scripts/migrate-cold-session-pollution.mjs` (one-shot migration runner; deleted after use)
- **Modify**: `meta-state.jsonl` (the registry; the change-log is appended; 18 entries are superseded)

## Implementation Steps

### Step 1: Inventory the historical entries

The script reads `meta-state.jsonl` and filters for:
- `subtype === "mcp-client-loading"`
- `entry_kind === "finding"`
- `status === "stale"` (skip archived/resolved per Finding 5)
- `session_id !== undefined` (skip `meta-260608T1410Z-...` which has no session_id per Finding 9)

Expected count: 9 entries (8 cold-session L2 + 1 claude-code). Save the list of entry ids.

### Step 2: Idempotency check for the change-log

Before writing, the script reads the registry and checks for an existing change-log with:
- `change_target` containing `cold-session-discoverability.test.cjs` AND `claude-code-mcp-loading.test.cjs`
- `change_dimension === "surface"`
- `change_diff.removed` includes `soft-delete-on-gap-close branch`

If a match exists, the script captures its id and skips Step 3 (the change-log write). If not, it proceeds to Step 3. This implements the idempotency that `meta_state_log_change` does not provide (Finding 4).

### Step 3: Write the change-log entry

Call `meta_state_log_change` with:

```js
{
  change_dimension: "surface",
  change_target: "tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs + .claude/coordination/__tests__/claude-code-mcp-loading.test.cjs",
  change_diff: {
    added: [
      "conditional-emission invariant: probe writes a finding only on novel failure (pass -> silent, fail -> dedup-write via tryClaimSessionId)",
      "regression-guard test asserting the probe does NOT write to meta-state.jsonl on pass"
    ],
    removed: [
      "soft-delete-on-gap-close branch (replaced by gap-close meta_state_resolve on the active finding)",
      "unconditional write on every gap-open run (preserved as atomic dedup via tryClaimSessionId on the first novel failure)"
    ],
    changed: []
  },
  reason: "Implements the loop-design loop-design-cold-session-fail-to-finding-conditional-emission. Replaces the rejected channel-split plan (plans/reports/problem-solving-260611-1220-meta-state-evidence-channel-split.md, status: superseded) with the simpler conditional-emission fix in plans/reports/problem-solving-260611-1300-cold-session-fail-to-finding-promotion.md. Operator review rejected the parallel records/meta/probe-evidence/ JSONL as over-engineered; the test runner's pass/fail exit code is the authoritative signal, and the registry captures only what was learned from a novel failure.",
  applies_to: {
    tools: ["meta_state_resolve", "meta_state_supersede"],
    surfaces: ["test/cold-session-discoverability", "test/claude-code-mcp-loading"],
    rules: ["rule-cold-session-test-must-pass-before-resolution"],
    schemas: ["core/gate-logic.js"]
  },
  evidence_code_ref: "tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs#probeL1",
  evidence_journal: "plans/reports/problem-solving-260611-1300-cold-session-fail-to-finding-promotion.md"
}
```

> **Red-team correction (Finding 10):** `applies_to.schemas` uses plain paths (no `#anchor` suffix). The 6 prior change-logs (`meta-state.jsonl:1,2,3,22,24,50`) all use plain paths. The `#anchor` syntax is for `evidence_code_ref`, not for `applies_to.schemas`.

Capture the change-log id from the response.

### Step 4: Supersede the 9 stale historical entries

For each of the 9 entry ids from Step 1, the script first reads the current entry and checks (Finding 12, registry-resident marker):
- If `entry.status === "superseded" && entry.consolidated_into === <change-log-id>`, skip (already migrated).
- Else, call `meta_state_supersede` with:

```js
{
  id: <entry-id>,
  consolidated_into: <change-log-id-from-step-3>,
  resolution: "Superseded by the conditional-emission refactor. The unconditional-write pattern is replaced by fail-to-finding promotion; the audit trail moves to the change-log."
}
```

The tool is atomic per entry; on idempotency (entry already superseded with the same `consolidated_into`), the script logs a warning and continues. The script is operator-only (requires `OPERATOR_MODE=1` per Finding 6).

### Step 5: Verify

- `grep -c '"status":"superseded".*"subtype":"mcp-client-loading"' meta-state.jsonl` returns 9 (the migrated count).
- `grep -c '"status":"stale".*"subtype":"mcp-client-loading"' meta-state.jsonl` returns 0 (all stale entries were migrated; 8 archived + 1 resolved remain as pre-existing terminal states).
- `meta_state_query_drift` returns no new drift events related to the cold-session probe.
- `loop_describe({tier: "warm"})` includes the new change-log in the recent-changes block.

### Step 6: Delete the migration script

The one-shot script is deleted after use. The change-log + supersede cascade is the durable audit trail; the script is not needed again. The script's git history preserves the migration logic for audit.

## Success Criteria

- [ ] Step 1: inventory complete; 9 stale entry ids saved (8 cold-session L2 + 1 claude-code).
- [ ] Step 2: idempotency check performed; if existing change-log found, skip Step 3.
- [ ] Step 3: change-log entry created; id captured; `applies_to.schemas` uses plain paths (no `#anchor`).
- [ ] Step 4: all 9 stale historical entries superseded; the 8 archived + 1 resolved entries remain untouched.
- [ ] Step 5: verification grep commands return the expected counts (9 superseded; 0 stale; 8 archived; 1 resolved); no new drift events.
- [ ] Step 6: `scripts/migrate-cold-session-pollution.mjs` deleted; the change-log is the durable record.
- [ ] `meta_state_query_drift` run before and after the migration; drift count is unchanged (or decreased, if the 9 stale entries were drift candidates).
- [ ] The script ran with `OPERATOR_MODE=1`; an attempt to run without it aborts with `operator_role_required`.

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| The 9-entry count has changed since the `260610-1203` churn fix | low | Step 1's inventory is authoritative; the script reads the current count, not a hardcoded 9. |
| The migration script crashes mid-loop, leaving partial state | medium | The script uses a registry-resident marker (not a tempdir checkpoint): before each supersede, the script reads the entry and skips if `status === "superseded" && consolidated_into === <change-log-id>`. The change-log entry's idempotency is enforced by Step 2's lookup. |
| The change-log entry's `evidence_code_ref` is too narrow | low | The `change_target` field lists both test files; the `evidence_code_ref` points at the primary test file. The full design rationale is in the 1300 report (cited as `evidence_journal`). |
| The migration accidentally supersedes a *current* finding (not a historical one) | low | The migration script filters by `subtype === "mcp-client-loading" && entry_kind === "finding" && status === "stale" && session_id !== undefined`. Active findings (which represent *current* gaps) are preserved; archived/resolved entries are pre-terminal and skipped; the no-session_id `meta-260608T1410Z-...` correction finding is skipped. |
| `meta_state_log_change` is not idempotent at the tool level (Finding 4) | medium | The script implements idempotency manually via Step 2's registry lookup (skip if a change-log with matching `change_target+change_dimension+change_diff.removed` exists). |
| `meta_state_supersede` requires `OPERATOR_MODE=1` (Finding 6) | medium | The script's first line is `if (process.env.OPERATOR_MODE !== "1") throw new Error("operator_role_required")`. The plan documents this as an operator-only step. |
| Script bypasses write-gate and bash-gate (Finding 13) | medium | The script is operator-only (Finding 6 guard). A sibling file `scripts/.migrate-cold-session-pollution-OPERATOR_ONLY` is created as a signpost for future readers. |
