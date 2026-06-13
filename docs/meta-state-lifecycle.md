---
date: "2026-06-10T00:00:00Z"
tags: [meta-state, lifecycle, status, registry, mcp]
---

# Meta-State Lifecycle and Status Management

This document describes the lifecycle of entries in `meta-state.jsonl`, the registry that serves as the loop's self-model. It covers the four entry kinds, their valid statuses, transition rules, and the tools that drive each transition.

## The Four Entry Kinds

The registry is a discriminated union on `entry_kind`. Each kind has its own status model and durability rules.

| Entry Kind | Purpose | Status Model | Durability |
|---|---|---|---|
| `finding` | Bug reports, design gaps, observed anti-patterns | 6-state enumerated lifecycle | Ephemeral: TTL on `reported`; otherwise operator-managed |
| `change-log` | Immutable audit log of system changes | Always `active` | Permanent: no TTL, no auto-resolve |
| `rule` | Promoted findings that enforce invariants | Binary `active / inactive` | Permanent: operator-managed |
| `loop-design` | Deferred designs (not yet shipped) | Binary `active / inactive` | Permanent: operator-managed |

---

## Finding Status Lifecycle

Findings are the only entry kind with a multi-state lifecycle. The canonical status enum is defined in `core/meta-state.js#metaStateFindingEntrySchema`.

### Status Definitions

| Status | Meaning | How It Is Entered |
|---|---|---|
| `reported` | Fresh finding, unverified by operator | `meta_state_report` creates with 24h TTL (`expires_at`) |
| `active` | Operator has acknowledged the finding | `meta_state_ack` transitions from `reported`; clears TTL |
| `stale` | Past TTL or past staleness window (7d) | TTL sweep or `meta_state_sweep`; re-verifiable via `meta_state_re_verify` |
| `resolved` | Closed by operator or agent with resolution note | `meta_state_resolve` |
| `superseded` | Consolidated into a change-log entry | `meta_state_supersede` |
| `auto-resolved` | Closed automatically by mechanism (test pass, file modified, etc.) | Auto-sweep or cold-session test on gap-close |

### Status Transitions

```
reported --[meta_state_ack]--> active
reported --[TTL elapsed]--> stale
active   --[meta_state_resolve]--> resolved
active   --[meta_state_supersede]--> superseded
stale    --[meta_state_re_verify pass]--> active
stale    --[meta_state_resolve]--> resolved
resolved --[meta_state_archive]--> archived
superseded --[meta_state_archive]--> archived
```

The `expired` status was removed in plan 260611-1000-remove-expired-status. The stale-flag redesign (plan 260609-stale-flag-redesign) had already replaced auto-resolve-by-clock with `stale` (non-terminal) plus explicit re-verification; the schema enum shrink completes that migration. The data layer is already stale-only (0 entries with `status: "expired"` in `meta-state.jsonl`).

### Terminal vs Non-Terminal

**Terminal statuses** (hard-coded in `core/meta-state.js` as `TERMINAL_STATUSES`):
- `resolved`
- `superseded`
- `auto-resolved`

**Non-terminal statuses**:
- `reported` (has TTL pressure)
- `active` (stable)
- `stale` (has re-verification pressure; cascade-closeable to `resolved` in 1 step)

`archived` is effectively terminal but is not in the `TERMINAL_STATUSES` set because it is applied outside the schema enum as a runtime-only status.

---

## Archive Mechanics

`archived` is a **registry-size management status**, not part of the formal finding lifecycle enum. It exists to trim the active set without deleting history.

### How Archive Works

- Applied via `meta_state_archive` MCP tool or `meta_state_batch` with `op: "archive"`
- Only `entry_kind: "finding"` can be archived; rules, change-logs, and loop-designs are rejected
- Sets `status: "archived"` plus `archived_at`, `archived_by`, `archived_reason`
- Re-archiving is a no-op (`already_archived`)
- `meta_state_list` excludes archived entries by default; pass `include_archived: true` to query them

### Archive Decision Rule

The decision rule is **documented, not enforced** (soft rule). It lives in `tools/meta-state-archive-tool.js`:

> Archive entries that are `(status=reported AND age > 30d AND not acked)` OR `(status=resolved AND resolved > 90d)`.

Operators may bypass the rule with the `override` parameter.

---

## Change-Log, Rule, and Loop-Design Status Models

These three kinds have simpler, binary or fixed status models.

### Change-Log (`entry_kind: "change-log"`)

- Status is always `active`
- Immutable audit log: no TTL, no auto-resolve, no archive
- Created by `meta_state_log_change`
- Change-logs may `consolidates` findings (inverse of `finding.consolidated_into`) or `supersedes` other change-logs

### Rule (`entry_kind: "rule"`)

- Status: `active | inactive`
- Created by `meta_state_promote_rule` (promotes a finding to a rule)
- Inactive rules remain in the registry for lineage; `supersedes` points to the replacement rule
- Loaded by the gate via `loadPromotedRules` and `applyPromotedRules`
- **Guard:** `meta_state_resolve` and `meta_state_archive` reject rule entries. To deprecate a rule, use `meta_state_patch` to set `status: "inactive"` (or `supersedes` if replaced).

### Loop-Design (`entry_kind: "loop-design"`)

- Status: `active | inactive`
- Created by `meta_state_propose_design`
- Flips to `inactive` when the design ships (`shipped_in_plan` and `shipped_at` are populated)
- `proposed_design_for` is forward references (what the design will create/modify)
- `addresses` is backward references (what findings motivate the design)

---

## Tools That Drive Transitions

| Tool | Entry Kinds | Transition | Notes |
|---|---|---|---|
| `meta_state_report` | finding | -> `reported` | Creates finding with 24h TTL |
| `meta_state_ack` | finding | `reported` -> `active` | Clears `expires_at` |
| `meta_state_resolve` | finding | -> `resolved` | Consult-gate `rule-no-orphaned-evidence` may block if drift detected. Rejects rules, loop-designs, and change-logs. |
| `meta_state_supersede` | finding | -> `superseded` | Sets `consolidated_into`, `superseded_at`, `superseded_by` |
| `meta_state_re_verify` | finding | `stale` -> `active` | Runs `verification.steps`; updates `last_verified_at` on pass |
| `meta_state_sweep` | finding | -> `stale` / `auto-resolved` | Batch lifecycle sweep; dry-run by default |
| `meta_state_archive` | finding | -> `archived` | Decision rule + operator override; rejects rules, change-logs, and loop-designs |
| `meta_state_log_change` | change-log | -> `active` | Immutable; no transitions after creation |
| `meta_state_promote_rule` | finding -> rule | finding promoted; rule `active` | Extracts rule from finding |
| `meta_state_propose_design` | loop-design | -> `active` | Idempotent by `addresses` + `proposed_design_for` set equality |
| `meta_state_patch` | finding, rule, loop-design, change-log | Update existing fields | CAS via `_expected_version` |
| `meta_state_batch` | any | write / update / delete / archive | Atomic; cap 500 ops; rollback on failure |

---

## Grounding and Drift

Findings with `mechanism_check: true` participate in the grounding system (SP2):

1. `meta_state_check_grounding` computes the SHA-256 of the file at `evidence_code_ref` and compares it to `code_fingerprint`
2. `meta_state_refresh_fingerprint` updates the stored fingerprint after a legitimate code change
3. `meta_state_derive_status` reasons about whether a finding is still true based on code drift, test signals, and derivation kinds

The consult-gate `rule-no-orphaned-evidence` blocks `meta_state_resolve` when any active `mechanism_check=true` finding has drifted (`hash_mismatch`). This prevents resolving findings against stale evidence.

---

## Key Design Decisions

1. **Why `archived` is outside the schema enum**: It allows the archive tool to operate without a schema migration. The trade-off is that archived entries bypass Zod validation on read.

2. **Why `stale` replaces `expired`**: The old TTL sweep auto-resolved findings on expiry, which silenced bugs without trace. `stale` is non-terminal and requires explicit re-verification via `meta_state_re_verify`. Plan 260611-1000-remove-expired-status completed the migration by dropping the `expired` enum value from the schema, deleting the legacy migrate tool, and retargeting the cascade to operate on `stale` parents in 1 step.

3. **Why change-logs have no TTL**: They are the immutable audit trail. A change-log entry records that a system change happened; time does not invalidate that fact.

4. **Why rules and loop-designs are binary**: They represent operator decisions, not ephemeral observations. A rule is either active (enforced) or inactive (replaced). A design is either active (pending) or inactive (shipped).

---

## Related Documents

- `AGENTS.md` — operational rules for agents, including the Internalization Rule and gate protocols
- `docs/observation-vs-meta-state.md` — separation between domain observations and meta-state findings
- `docs/operator-guide.md` — mechanics for operators, including resolving findings and consult-gate behavior
- `docs/trajectory.md` — long-term direction, Bridge 6 (self-model as product)
- `tools/learning-loop-mcp/core/meta-state.js` — source-of-truth schema definitions and registry operations
