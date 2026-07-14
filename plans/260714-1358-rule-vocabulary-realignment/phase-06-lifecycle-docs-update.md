# Phase 06 — docs/ lifecycle terms consistent with the assertinvariant report

Driven by `plans/reports/assertinvariant-meta-pattern-260711-0516-resolution-plan-report.md`
(Implementations 2 + 3 shipped; registry gap #1 closed 2026-07-14). `docs/meta-state-lifecycle.md`
still describes the pre-shipping loop-design + change-log lifecycle and is now inconsistent with the
shipped tools/fields. This phase updates the L2 lifecycle doc only — no code, no registry.

**Independent of the rename (phases 1–5)** in cause, but edits the same file as phase-04
(`docs/meta-state-lifecycle.md`). Do both doc edits in one pass to avoid a stale intermediate.
Can commit with the atomic rename commit or as a separate docs commit — operator choice at
execution time (see plan.md Dependencies).

## 6.1 Loop-Design section (`docs/meta-state-lifecycle.md` L142-149)

Current L146: "Flips to `inactive` when the design ships (`shipped_in_plan` and `shipped_at` are
populated)." — true but names no tool and hides the deny-list constraint that caused registry gap #1.

Replace the loop-design bullets to state:

- Status: `active | inactive`. Created `active` by `meta_state_propose_design`.
- **Shipping:** flip `active → inactive` via **`meta_state_ship_loop_design`**, which atomically
  stamps `shipped_in_plan` + `shipped_at`. Idempotent (re-shipping returns `already_shipped`); gated
  on `LOOP_SESSION_MODE=live`.
- **`meta_state_patch` cannot ship a design** — `status` is on the `IMMUTABLE_PATCH_FIELDS` deny-list,
  so patching `shipped_in_plan`/`shipped_at` leaves `status: active` (the root cause of registry gap
  #1 in the assertinvariant report). Use `meta_state_ship_loop_design`, not `meta_state_patch`.
- `proposed_design_for` = forward refs (what the design creates/modifies); `addresses` = backward
  refs (findings that motivate it). Lineage via `supersedes` (design-to-design).

## 6.2 Tools table (`docs/meta-state-lifecycle.md` L154-168)

Add a row (place after the `meta_state_propose_design` row, L165):

| `meta_state_ship_loop_design` | loop-design | `active` → `inactive` | Atomically stamps `shipped_in_plan` + `shipped_at`; idempotent on `already_shipped`; gated on `LOOP_SESSION_MODE=live` |

Update the `meta_state_batch` row (L167) Notes to add: "auto-emits an `operation_envelope`-annotated
change-log after the ops loop (see §6.3)."

## 6.3 Change-Log section (`docs/meta-state-lifecycle.md` L127-132)

Add a bullet (after the existing `consolidates`/`supersedes` bullet):

- **`operation_envelope`** (optional, auto-emitted): annotates a batch mutation's magnitude for
  audit. Shape: `{ kind, target, pre_count, post_count, content_hash }`.
  - `kind ∈ { migration, sweep, closeout, consolidation, backfill, archive-wave, escalation-batch, manual-batch }`
  - `pre_count` / `post_count`: `{ total, by_status:{open,resolved,superseded,archived}, by_kind:{finding,change-log,rule,loop-design} }`
  - `content_hash`: SHA-256 of kind+target+canonical op-list+entry-id-set (content-deduplication
    semantics, NOT replay protection).
  - Auto-emitted by `meta_state_batch` after the ops loop. `case "write"` **rejects** caller-supplied
    envelopes (forge-vector guard) — envelopes are system-emitted, not caller-supplied.

## 6.4 Do NOT touch (out of scope for this phase)

- The **Finding status lifecycle** section (L55-97) still documents the pre-migration 6-state model
  (`reported / active / stale / resolved / superseded / auto-resolved`, `meta_state_ack`, TTL). That
  is stale too — but it was obsoleted by plans `260611-1000` + `260707-0812` (status collapsed to
  `{open, resolved, superseded}` + `archived`; `stale` is now a derived view, not a status), **not**
  by the assertinvariant report. It is a separate, larger doc migration — leave it for a dedicated
  phase/plan. Flag it here so it is not mistaken for in-scope.

## 6.5 Verify

- `grep -n "meta_state_ship_loop_design" docs/meta-state-lifecycle.md` → ≥ 2 hits (section + table).
- `grep -n "operation_envelope" docs/meta-state-lifecycle.md` → ≥ 1 hit (change-log bullet).
- No other docs/ file needs change for this phase (`architecture.md` may separately mention the
  `assertinvariant` primitive at `core/operation-invariant.js`, but that is architecture, not
  lifecycle — out of scope here).

## Constraints

- Stay under `docs.maxLoc` (800). Net additions ~12 lines; the file is ~200 lines.
- Keep the L2 tone: name tools + fields, not implementation file paths (one path reference for
  `IMMUTABLE_PATCH_FIELDS` is fine since the deny-list is the load-bearing fact).