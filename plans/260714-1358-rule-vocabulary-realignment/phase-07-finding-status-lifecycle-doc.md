---
phase: 7
title: "finding-status-lifecycle-doc"
status: pending
effort: ""
dependencies: [4]
---

# Phase 07 — docs/ finding-status lifecycle consistent with the post-migration model

`docs/meta-state-lifecycle.md` § Finding Status Lifecycle (L55-97), the Four Entry Kinds row
(L48), the Tools table (L154-168), and Key Design Decisions #2 (L187) still describe the
**pre-migration 6-state model** (`reported / active / stale / resolved / superseded / auto-resolved`,
`meta_state_ack`, 24h TTL). The code shipped a different model in plans `260611-1000-remove-expired-
status` and `260707-0812` (status collapse + stale-flag redesign). This phase rewrites those sections
to match the code. Docs-only; no code, no registry.

## Source of truth (verified against code 2026-07-14)

- `core/meta-state.js:162` — finding `status: z.enum(["open","resolved","superseded"]).optional()`.
  `archived` is applied at runtime by `archiveEntry`, not in the enum.
- `core/stale-view.js:27` — `import { STALENESS_WINDOW_MS, isOpen } from "./constants.js";`
- `core/constants.js:32` — `const TERMINAL_STATUSES = new Set(["resolved", "superseded", "archived"]);`
  (predicate-effective terminal set used by `isOpen` at line 46)
- `core/constants.js:42` — `isOpen` definition canonical home (re-exported through `core/stale-view.js:29`).
- `core/meta-state.js:91` — `export const TERMINAL_STATUSES = new Set(["resolved", "superseded"]);`
  (schema-enum terminal set — schema enum has 3 values; the predicate's effective set has 3 too
  when `archived` is included). **Both sets are documented; the predicate set is the
  load-bearing one for `isOpen(e)` callers.**
- `core/stale-view.js` — `isOpen` (accepts legacy `active`/`reported`/`stale` for migration tolerance)
  and `isStaleView` (an `open` finding past the 7-day staleness window from `last_verified_at`/
  `created_at`, OR with drifted evidence in `file-index.jsonl`). `stale` is a **derived view**, not a
  status.
- `meta_state_report` writes `status:"open"`; `expires_at` is no longer written (vestigial). No TTL.
- `meta_state_ack` removed (plan 260707-0812). No handler file.
- `meta_state_sweep` is read-only — emits the derived stale-view set as a dry-run report; **no status
  writes** (the `apply:true` mode was removed in plan 260707-0812 Phase 3).
- `meta_state_re_verify` stamps `last_verified_at` on a passing run; **no status transition**.
- `meta_state_resolve` consult-gate `rule-no-orphaned-evidence` may block on drift; cascade path
  closes a stale-view parent in 1 step via `cascade_from`.
- `meta_state_list`: `status:"open"` → `isOpen(e)`; `status:"stale"` → derived `isStaleView` set
  (via `meta_state_query_drift` + `meta_state_sweep`, not via `meta_state_list` directly).

## 7.1 Four Entry Kinds table (L48) — finding row

Change:
- Status Model: `6-state enumerated lifecycle` → `3-status: open | resolved | superseded (+ archived
  runtime); stale is a derived view, not a status`.
- Durability: `Ephemeral: TTL on reported; otherwise operator-managed` → `No TTL (expires_at
  vestigial); operator/agent-managed; stale-view re-verifiable`.

## 7.2 Status Definitions table (L61-68) — replace wholesale

| Status | Meaning | How entered |
|---|---|---|
| `open` | Unresolved (canonical post-migration status; replaces legacy `reported`/`active`/`stale`) | `meta_state_report` creates `open`; `meta_state_re_verify` re-grounds (stamps `last_verified_at`, no transition) |
| `resolved` | Closed by operator/agent with resolution note | `meta_state_resolve` (consult-gate `rule-no-orphaned-evidence` may block on drift; cascade closes stale-view parents) |
| `superseded` | Consolidated into a change-log | `meta_state_supersede` |
| `archived` (runtime-only) | Registry-size trim; not in the persisted enum | `meta_state_archive` / `meta_state_batch` op:archive |

Note: `stale` is **not** a status. It is the `isStaleView` derived view: an `open` finding past the
7-day staleness window or with drifted evidence. Surfaced by `meta_state_query_drift` +
`meta_state_sweep` (read-only); re-grounded via `meta_state_re_verify`. Legacy `reported`/`active`/
`auto-resolved` were removed (plans 260611-1000, 260707-0812); `isOpen` tolerates any legacy persisted
values until the migration flips them.

## 7.3 Status Transitions diagram (L72-81) — replace

```
open      --[meta_state_resolve]-->              resolved
open      --[meta_state_supersede]-->            superseded
open      --[meta_state_dispatch_finding]-->     open  (non-terminal routing; ledger_ref set)
open      --[meta_state_re_verify pass]-->       open  (stamps last_verified_at; no transition)
resolved  --[meta_state_archive]-->              archived
superseded--[meta_state_archive]-->              archived
stale-view parent --[meta_state_resolve(cascade_from=[child])]--> resolved  (1-step cascade)
```

`stale` is not a node — it is a derived property of `open`. The legacy `reported --[ack]--> active`
and `--TTL--> stale` edges are removed (`meta_state_ack` gone, no TTL).

## 7.4 Terminal vs Non-Terminal (L85-97) — rewrite

**Terminal** (two sets exist; document both):
- **Schema-enum terminal** (`core/meta-state.js:91`): `{resolved, superseded}`. The Zod enum on
  `status` has 3 values (`open | resolved | superseded`); `archived` is not in the enum.
- **Predicate-effective terminal** (`core/constants.js:32`, consumed by `isOpen` at line 46):
  `{resolved, superseded, archived}`. An `archived` entry is treated as terminal by `isOpen` for
  filtering purposes; it is not a status value but is a runtime annotation.

**Non-terminal**: `open`. It has **staleness pressure** as a derived view (`isStaleView`), not a
status: a stale-view `open` finding is re-verifiable via `meta_state_re_verify` and cascade-closeable
to `resolved` in 1 step. There is no `auto-resolved` status (removed).

Remove the `auto-resolved` bullet from the Terminal list and the `reported`/`stale` bullets from
Non-Terminal. Keep the `archived` runtime-only note.

## 7.5 Tools That Drive Transitions table (L154-168) — edit rows

- `meta_state_report`: `-> reported` → `-> open`; Notes "Creates finding with 24h TTL" → "Creates
  finding `open`; no TTL (`expires_at` vestigial)".
- **Delete** the `meta_state_ack` row (tool removed).
- `meta_state_re_verify`: Transition `stale -> active` → `open -> open (no transition)`; Notes →
  "Runs `verification.steps`; stamps `last_verified_at` on pass; no status transition".
- `meta_state_sweep`: Transition `-> stale / auto-resolved` → `read-only (derived stale-view report)`;
  Notes → "Dry-run report of the `isStaleView` set; no status writes (apply mode removed in
  260707-0812 Phase 3)".
- `meta_state_resolve`: keep consult-gate note; add "cascade closes a stale-view parent in 1 step via
  `cascade_from`".
- Add a `meta_state_query_drift` row? Only if the table is meant to be exhaustive over lifecycle
  tools — it currently isn't (no `derive_status`/`check_grounding` rows). **Leave it out** to avoid
  scope creep; the §7.2 note already names `query_drift`/`sweep` as the stale-view surfaces.

## 7.6 Key Design Decisions #2 (L187) — rewrite

Replace "Why `stale` replaces `expired`" with:

> 2. **Why status collapsed to `{open, resolved, superseded}`** (plans 260611-1000 + 260707-0812):
> the old 6-state model auto-resolved findings on TTL expiry, silencing bugs without trace, and
> required an `ack` step (`meta_state_ack`, now removed) to promote `reported → active`. The
> collapse keeps three terminal/non-terminal statuses and moves freshness out of the status enum:
> `stale` is a **derived view** (`isStaleView` over `open` findings), surfaced read-only by
> `meta_state_query_drift`/`meta_state_sweep` and re-grounded by `meta_state_re_verify` (no status
> transition). `isOpen` tolerates legacy persisted values until the migration flips them, so the
> collapse is read-safe mid-migration.

## 7.7 Archive Mechanics (L101-119) — minor (forward-reference only)

- L108 "Only `entry_kind: "finding"` can be archived" — unchanged (still true).
- The Archive Decision Rule (L117) references `status=reported` and `status=resolved` ages, but the
  current code at `tools/learning-loop-mastra/tools/handlers/meta-state-archive-tool.js:36-55` uses
  `isOpen(entry)` (not `entry.status === "reported"`) and measures age from
  `last_verified_at || created_at`. This is a known code/doc mismatch.

**Out of scope for this phase (red-team Finding 11):** reconciling the archive-rule text. Restrict
§7.7 to a single forward-reference paragraph:

> **Note:** The Archive Decision Rule text was last updated for the pre-migration status model. The
> current implementation (`tools/learning-loop-mastra/tools/handlers/meta-state-archive-tool.js`)
> uses `isOpen(entry)` rather than `status="reported"`; see plan `<TBD: archive-rule-doc-alignment>`
> for the reconciliation phase.

Do NOT silently rewrite the doc to a rule the code doesn't enforce (Phase 7's discipline). Do NOT
expand §7.7 scope to reconcile the archive rule — that's its own dedicated phase with proper
audit scope.

## 7.8 Do NOT touch

- The Finding Exit Roles → Mechanism Tools table (L16-22): `promote/resolve/re-verify/supersede/
  dispatch` L1→L2 mapping is still accurate. (`re-verify` row says `stale → active` — **fix this
  one line** to `open -> open (stamps last_verified_at)` for consistency with §7.5; it's the same
  correction.)
- § Grounding and Drift (L171-179): accurate; keep. The `rule-no-orphaned-evidence` reference stays
  (rule id unchanged by phase-02; only its pattern_type + enforcement change).

## 7.9 Verify

- `grep -n "reported\|active\|auto-resolved\|meta_state_ack\|6-state\|TTL" docs/meta-state-lifecycle.md`
  → only acceptable residuals are: the "legacy ... removed" explanatory sentences in §7.2/§7.6, and
  any `tools/meta-state-archive-tool.js` quote in §7.7 if the code still says `reported` (flagged, not
  silently rewritten). No remaining normative use of the old statuses as current behavior.
- File stays under `docs.maxLoc` (800); net change is roughly +5/-15 lines.

## Constraints

- This is a **doc-vs-code alignment**, not a design change. Every status/transition stated must
  trace to a code fact in § "Source of truth" above. If a code reference at execution time disagrees
  with this phase (e.g. the archive tool still mentions `reported`), surface it as a mismatch — do
  not invent doc text the code doesn't back.
- Coordinate with phase-04 + phase-06: all three edit `docs/meta-state-lifecycle.md`. Do them in one
  doc-edit pass (phase-04 Rule-section note, phase-06 loop-design/change-log, phase-07 finding-status)
  so the file is consistent at each save.