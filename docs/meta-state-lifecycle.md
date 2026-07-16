---
date: "2026-06-10T00:00:00Z"
tags: [meta-state, lifecycle, status, registry, mcp]
---

<!-- level: L2 | surface: mechanism -->

# Meta-State Lifecycle and Status Management

This document is the L2 mechanism surface for the meta-state registry. It names the tools (L2) that realize the L1 exit roles named in `docs/loop-engine.md`. The L1 doc holds the conceptual statement (a finding is a deferred decision with explicit exits: promote, resolve, re-verify, supersede, dispatch); this L2 doc maps each L1 exit to the mechanism that runs it. Implementation detail — change with care.

## Finding Exit Roles → Mechanism Tools

The L1 doc (`docs/loop-engine.md`) names five exit roles for a finding. Each is realized today by exactly one mechanism (the table below). The roles are stable; the tools can be renamed or split without breaking the L1 contract, but the table must stay accurate.

| L1 exit role (from `docs/loop-engine.md`) | Mechanism tool (L2) | Effect on finding |
|---|---|---|
| **promote** | `meta_state_promote_rule` | `finding` becomes the origin of a new `rule` entry; `promoted_to_rule` back-pointer set |
| **resolve** | `meta_state_resolve` | `status` → `resolved`; `resolved_at`, `resolved_by`, `resolution` recorded |
| **re-verify** | `meta_state_re_verify` | `open` → `open` on passing verification (stamps `last_verified_at`, no transition); used to re-ground `stale`-view findings |
| **supersede** | `meta_state_supersede` | `status` → `superseded`; `consolidated_into` points at the absorbing change-log |
| **dispatch** | `meta_state_dispatch_finding` | Non-terminal routing action — ledger event + `ledger_ref` back-pointer; finding stays in its current status until resolve/promote |

**Dispatch is not a terminal status** — it is a routing action that lets the finding stay in its current state while a fix happens in an external issue-tracker substrate. The finding resolves when the fix ships.

The rest of this document describes the lifecycle status model + the L2 tools in detail.

## Layer Separation: Domain, Meta, Gate

The loop keeps two state systems separate. **Domain state** (observations) is external system state — budgets, device slots, vendor API status — operator-managed and durable. **Meta-state** (this registry) is the loop's self-model — findings, change-logs, rules — agent-maintained. The **gate** sits between them.

| Layer | What it tracks | Who owns it | Durability |
|-------|----------------|-------------|------------|
| Domain | External system state (budgets, device slots, vendor status) | Operator | Durable, versioned |
| Meta | System-level findings + change-log (this registry) | Agent | Discriminated union: findings ephemeral, change-logs permanent |
| Gate | Constraint pattern matching, observation existence | Code | Stateless, reads fresh every call |

**The gate is meta-only.** It reads domain observations to check whether they *exist* (meta-level: "has someone recorded this constraint?"). It does not enforce domain resource limits (domain-level: "do we have budget left?"). Budget enforcement belongs to the agent, which has the context to decide. The gate is the first filter; the agent is the second filter; meta-state is the audit trail.

Getting this boundary wrong produces two failure modes: the gate enforcing domain budgets blocks unrelated commands globally when one budget exhausts; or budget data leaking into meta-state conflates domain state with reasoning. Domain state stays in observations; meta-state tracks reasoning, not numbers.

## The Four Entry Kinds

The registry is a discriminated union on `entry_kind`. Each kind has its own status model and durability rules.

| Entry Kind | Purpose | Status Model | Durability |
|---|---|---|---|
| `finding` | Bug reports, design gaps, observed anti-patterns | 3-status: `open \| resolved \| superseded` (+ `archived` runtime); `stale` is a derived view, not a status | No TTL (`expires_at` vestigial); operator/agent-managed; `stale`-view re-verifiable |
| `change-log` | Immutable audit log of system changes | Always `active` | Permanent: no TTL, no auto-resolve |
| `rule` | Promoted findings that enforce invariants | Binary `active / inactive` | Permanent: operator-managed |
| `loop-design` | Deferred designs (not yet shipped) | Binary `active / inactive` | Permanent: operator-managed |

---

## Finding Status Lifecycle

Findings are the only entry kind with a multi-state lifecycle. The canonical status enum is defined in `core/meta-state.js#metaStateFindingEntrySchema`.

### Status Definitions

| Status | Meaning | How It Is Entered |
|---|---|---|
| `open` | Unresolved (canonical post-migration status; replaces legacy `reported`/`active`/`stale`) | `meta_state_report` creates `open`; `meta_state_re_verify` re-grounds (stamps `last_verified_at`, no transition) |
| `resolved` | Closed by operator/agent with resolution note | `meta_state_resolve` (consult-gate `rule-no-orphaned-evidence` may block on drift; cascade closes `stale`-view parents) |
| `superseded` | Consolidated into a change-log | `meta_state_supersede` |
| `archived` (runtime-only) | Registry-size trim; not in the persisted enum | `meta_state_archive` / `meta_state_batch` op:`archive` |

Note: `stale` is **not** a status. It is the `isStaleView` derived view: an `open` finding past the 7-day staleness window (from `last_verified_at` or `created_at`) or with drifted evidence in `file-index.jsonl`. Surfaced by `meta_state_query_drift` + `meta_state_sweep` (read-only); re-grounded via `meta_state_re_verify`. The legacy `reported`/`active`/`auto-resolved` statuses were removed (plans 260611-1000 and 260707-0812); `isOpen` tolerates legacy persisted values until the migration flips them. Only `stale`-view parents are cascade-closeable via `meta_state_resolve`.

### Status Transitions

```
open      --[meta_state_resolve]-->              resolved
open      --[meta_state_supersede]-->            superseded
open      --[meta_state_dispatch_finding]-->     open  (non-terminal routing; ledger_ref set)
open      --[meta_state_re_verify pass]-->       open  (stamps last_verified_at; no transition)
resolved  --[meta_state_archive]-->              archived
superseded--[meta_state_archive]-->              archived
stale-view parent --[meta_state_resolve(cascade_from=[child])]--> resolved  (1-step cascade)
```

`stale` is not a node — it is a derived property of `open`. The legacy `reported --[ack]--> active` and `--TTL--> stale` edges are removed (`meta_state_ack` gone, no TTL).

The `expired` status was removed in plan 260611-1000-remove-expired-status; the stale-flag redesign (plan 260609-stale-flag-redesign) replaced auto-resolve-by-clock with `isStaleView` (derived) plus explicit re-verification; the schema enum shrink to `{open, resolved, superseded}` completed the migration.

### Terminal vs Non-Terminal

**Terminal** (two sets exist; document both):
- **Schema-enum terminal** (`core/meta-state.js:91`): `{resolved, superseded}`. The Zod enum on `status` has 3 values (`open | resolved | superseded`); `archived` is not in the enum.
- **Predicate-effective terminal** (`core/constants.js:32`, consumed by `isOpen` at line 46): `{resolved, superseded, archived}`. An `archived` entry is treated as terminal by `isOpen` for filtering; it is not a status value but is a runtime annotation.

**Non-terminal**: `open`. It has **staleness pressure** as a derived view (`isStaleView`), not a status: a stale-view `open` finding is re-verifiable via `meta_state_re_verify` and cascade-closeable to `resolved` in 1 step. There is no `auto-resolved` status (removed).

`archived` is the only runtime-applied annotation; it is in the predicate terminal set but not in the schema enum.

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

The decision rule is **documented, not enforced** (soft rule). It lives in `tools/learning-loop-mastra/tools/handlers/meta-state-archive-tool.js`:

> **Note:** The Archive Decision Rule text was last updated for the pre-migration status model. The current implementation (`tools/learning-loop-mastra/tools/handlers/meta-state-archive-tool.js`) uses `isOpen(entry)` rather than `status="reported"`; see plan `<TBD: archive-rule-doc-alignment>` for the reconciliation phase.

---

## Change-Log, Rule, and Loop-Design Status Models

These three kinds have simpler, binary or fixed status models.

### Change-Log (`entry_kind: "change-log"`)

- Status is always `active`
- Immutable audit log: no TTL, no auto-resolve, no archive
- Created by `meta_state_log_change`
- Change-logs may `consolidates` findings (inverse of `finding.consolidated_into`) or `supersedes` other change-logs
- **`operation_envelope`** (optional, auto-emitted): annotates a batch mutation's magnitude for audit. Shape: `{ kind, target, pre_count, post_count, content_hash }`. `kind ∈ { migration, sweep, closeout, consolidation, backfill, archive-wave, escalation-batch, manual-batch }`. `pre_count` / `post_count`: `{ total, by_status:{open,resolved,superseded,archived}, by_kind:{finding,change-log,rule,loop-design} }`. `content_hash`: SHA-256 of kind+target+canonical op-list+entry-id-set (content-deduplication semantics, NOT replay protection). Auto-emitted by `meta_state_batch` after the ops loop; `case "write"` rejects caller-supplied envelopes (forge-vector guard) — envelopes are system-emitted, not caller-supplied.

### Rule (`entry_kind: "rule"`)

- Status: `active | inactive`
- Created by `meta_state_promote_rule` (promotes a finding to a rule)
- Inactive rules remain in the registry for lineage; `supersedes` points to the replacement rule
- Loaded by the gate via `loadPromotedRules` and `applyPromotedRules`
- **Guard:** `meta_state_resolve` and `meta_state_archive` reject rule entries. To deprecate a rule, use `meta_state_patch` to set `status: "inactive"` (or `supersedes` if replaced).
- **Vocabulary axis (`pattern_type` ↔ consumption state).** `pattern_type` names the consumption axis: `agent-checklist` rules (7 total: 4 original plus 3 advisory rules reclassified from `regex`/`glob`) are state-2 — deterministic injection via a `PROCESS_HINTS` row in `core/loop-introspect.js`, enforced by the H6 ordering gate in `loop_describe`, plus agentic consumption (the model interprets the checklist). `determinism-checklist` rules (2 total) are state-3 — the `meta_state_resolve` consult-gate evaluates them deterministically and blocks on drift (`rule-no-orphaned-evidence`). **`regex` and `glob` survive only for the 2 gate-enforced rules** (`rule-no-new-artifact-types` regex, `rule-project-skill-boundary` glob) — match-language, state-3: `regex` matches bash commands, `glob` matches write paths. The 3 advisory rules previously typed `agent + regex/glob` were `agent`-skip-by-`applyPromotedRules` regardless of their pattern body (no command/path matching), so reclassifying them to `agent-checklist` with checklist bodies — see Phase 2 of `plans/260714-1358-rule-vocabulary-realignment` — eliminates dead match specs without changing gate behavior. `enforcement` mirrors consumption: `gate` = state-3 deterministic, `agent` = state-2 agentic. The concept term `consult-gate` (in `docs/loop-engine.md` and `docs/philosophy.md`) is preserved on the L1 concept surface; it is now lexically distinct from `agent-checklist`.

### Loop-Design (`entry_kind: "loop-design"`)

- Status: `active | inactive`
- Created by `meta_state_propose_design`
- **Shipping:** flip `active → inactive` via **`meta_state_ship_loop_design`**, which atomically stamps `shipped_in_plan` + `shipped_at`. Idempotent (re-shipping returns `already_shipped`); gated on `LOOP_SESSION_MODE=live`.
- **`meta_state_patch` cannot ship a design** — `status` is on the `IMMUTABLE_PATCH_FIELDS` deny-list, so patching `shipped_in_plan`/`shipped_at` leaves `status: active`. Use `meta_state_ship_loop_design`, not `meta_state_patch`.
- `proposed_design_for` is forward references (what the design will create/modify)
- `addresses` is backward references (what findings motivate the design)

---

## Tools That Drive Transitions

| Tool | Entry Kinds | Transition | Notes |
|---|---|---|---|
| `meta_state_report` | finding | -> `open` | Creates finding `open`; no TTL (`expires_at` vestigial) |
| `meta_state_resolve` | finding | -> `resolved` | Consult-gate `rule-no-orphaned-evidence` may block if drift detected. Rejects rules, loop-designs, and change-logs. Cascade closes a `stale`-view parent in 1 step via `cascade_from`. |
| `meta_state_supersede` | finding | -> `superseded` | Sets `consolidated_into`, `superseded_at`, `superseded_by` |
| `meta_state_re_verify` | finding | `open` -> `open` (no transition) | Runs `verification.steps`; stamps `last_verified_at` on pass; no status transition |
| `meta_state_sweep` | finding | read-only (derived stale-view report) | Dry-run report of the `isStaleView` set; no status writes (apply mode removed in plan 260707-0812 Phase 3) |
| `meta_state_archive` | finding | -> `archived` | Decision rule + operator override; rejects rules, change-logs, and loop-designs |
| `meta_state_log_change` | change-log | -> `active` | Immutable; no transitions after creation |
| `meta_state_promote_rule` | finding -> rule | finding promoted; rule `active` | Extracts rule from finding |
| `meta_state_propose_design` | loop-design | -> `active` | Idempotent by `addresses` + `proposed_design_for` set equality |
| `meta_state_ship_loop_design` | loop-design | `active` -> `inactive` | Atomically stamps `shipped_in_plan` + `shipped_at`; idempotent on `already_shipped`; gated on `LOOP_SESSION_MODE=live` |
| `meta_state_patch` | finding, rule, loop-design, change-log | Update existing fields | CAS via `_expected_version` |
| `meta_state_batch` | any | write / update / delete / archive | Atomic; cap 500 ops; rollback on failure; auto-emits an `operation_envelope`-annotated change-log after the ops loop (see §6.3 in Change-Log section) |

---

## Grounding and Drift

Findings with `mechanism_check: true` participate in the grounding system (SP2):

1. `meta_state_check_grounding` computes the SHA-256 of the file at `evidence_code_ref` and compares it to `code_fingerprint`
2. `meta_state_refresh_file_index` upserts the path's current hash into the shared `file-index.jsonl` after a legitimate code change, re-grounding every anchored finding in one call
3. `meta_state_derive_status` reasons about whether a finding is still true based on code drift, test signals, and derivation kinds

The consult-gate `rule-no-orphaned-evidence` blocks `meta_state_resolve` when any active `mechanism_check=true` finding has drifted (`hash_mismatch`). This prevents resolving findings against stale evidence.

### Stale-view (derived evidence-freshness view)

The `isStaleView` predicate defines a finding as stale-view when:

```
isStaleView(entry) = isOpen(entry) && (ageStale || hashDrifted)
```

where:

- `ageStale`: reference time (`last_verified_at || created_at`) > `STALENESS_WINDOW_MS` (default 7d).
- `hashDrifted`: `currentHash !== storedHash`.
  - `currentHash` = `codeHashes.get(canonical)` — caller-injected map of path → on-disk SHA-256.
  - `storedHash` = `indexBaseline ?? entry.code_fingerprint` (both regex-validated via `TERMINAL_HASH_REGEX`).

**Caller injection contract**: `isStaleView` is pure — it does NOT read the filesystem. Callers wanting the drift signal build `codeHashes` via `computeCurrentHashes(entries, root)`:

```js
const fileIndex = readFileIndex(root);
const { ok: codeHashes, skipped } = computeCurrentHashes(entries, root);
// Log non-"missing" skipped paths as gate-log breadcrumbs (RT: M20).
const staleSet = derivedStaleSet(entries, { fileIndex, codeHashes });
```

`computeCurrentHashes` returns `{ ok: Map<canonicalKey, currentHash>, skipped: Array<{canonical, reason}> }`:
- `ok` — successful hashes.
- `skipped` — `reason: "missing"` (ENOENT, no log breadcrumb — high-frequency), `reason: "containment_violation:<r>"` (traversal/symlink/hardlink rejected by `resolveSafePath`), or `reason: "fs_error:<code>"` (permission/I/O).

**Backward compat**: When `codeHashes` is omitted, the drift branch returns `false` (age-only). Pre-fix consumers like `meta_state_derive_status` continue to work without the caller building the map.

**Clearing drift**: `meta_state_re_verify` clears the drift signal ONLY when called with `refresh: true` AND verification passes AND CAS update succeeds. Default behavior (no `refresh`) preserves the `rule-no-orphaned-evidence` consult-gate — operators wanting explicit operator-mediated refresh should use `meta_state_refresh_file_index` instead.

**Plan reference**: Plan 260716-0624 (stale-view hash-drift fix) replaced the path-presence predicate with the SP2-consistent hash comparison. The pre-fix `hasDrifted` returned `true` whenever a path was present in the file-index (the opposite of drift, because `seed-file-index.mjs` re-hashes every cited path to its current bytes before each test run).

---

## Key Design Decisions

1. **Why `archived` is outside the schema enum**: It allows the archive tool to operate without a schema migration. The trade-off is that archived entries bypass Zod validation on read.

2. **Why status collapsed to `{open, resolved, superseded}`** (plans 260611-1000 + 260707-0812): the old 6-state model auto-resolved findings on TTL expiry, silencing bugs without trace, and required an `ack` step (`meta_state_ack`, now removed) to promote `reported → active`. The collapse keeps three terminal/non-terminal statuses and moves freshness out of the status enum: `stale` is a **derived view** (`isStaleView` over `open` findings), surfaced read-only by `meta_state_query_drift`/`meta_state_sweep` and re-grounded by `meta_state_re_verify` (no status transition). `isOpen` tolerates legacy persisted values until the migration flips them, so the collapse is read-safe mid-migration.

3. **Why change-logs have no TTL**: They are the immutable audit trail. A change-log entry records that a system change happened; time does not invalidate that fact.

4. **Why rules and loop-designs are binary**: They represent operator decisions, not ephemeral observations. A rule is either active (enforced) or inactive (replaced). A design is either active (pending) or inactive (shipped).

---

## Related Documents

- `AGENTS.md` — operational rules for agents, including the Internalization Rule and gate protocols
- `docs/trajectory.md` — long-term direction, Bridge 6 (self-model as product)
- `docs/architecture.md` — gate system internals, the 3-layer mechanism that realizes this separation
- `tools/learning-loop-mastra/core/meta-state.js` — source-of-truth schema definitions and registry operations
