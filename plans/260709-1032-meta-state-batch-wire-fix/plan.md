# Plan — meta_state_batch wire-format array-coercion fix

**Finding:** `meta-260709T1017Z-…-meta-state-batch-…` (schema-drift / meta-state-tools, warning)
**Status:** not started
**Date:** 2026-07-09

## Problem

`meta_state_batch` rejects valid batch operations with `validation_failed`. Root cause: the MCP wire layer coerces array-typed fields into the SDK envelope form `{item: [...]}`. The tool schema (`meta-state-batch-tool.js:35`) declares `operations: z.array(opSchema)` with **no preprocess**, so a coerced top-level `operations: {item:[...]}` is rejected — and even when `operations` survives, nested arrays inside `entry` (e.g. `change_diff.added/removed/changed`, loop-design `addresses`/`proposed_design_for`) arrive as `{item:[...]}` and fail `metaStateEntrySchema.safeParse` inside `metaStateBatch` core (`core/meta-state.js:707`).

The `entry` field already uses `z.preprocess(stripEnvelope, …)` (`meta-state-batch-tool.js:12`) to unwrap one envelope level — proving the pattern is known — but it covers only `entry`, not `operations`, and not nested arrays. `meta_state_patch` avoids the issue by nesting arrays inside `patch`; `meta_state_batch` cannot nest `operations` without breaking the contract.

Observed 2026-07-09 during the #44/#45 merge-conflict resolution: an agent attempted `meta_state_batch` for a multi-op closeout, got `validation_failed`, fell back to N× `meta_state_log_change`. This blocks the tool's stated purpose (atomic batch, cap 500).

## Fix

Add a **recursive** envelope-strip to `core/envelope-stripper.js` (`deepStripEnvelope`) that unwraps `{item: X}` envelopes anywhere in the tree, and apply it as a `z.preprocess` on the `operations` field. Fail-closed: only unwraps exact single-key `item` envelopes (same predicate as `stripEnvelope`); all other shapes pass through unchanged. Subsumes the per-field `stripEnvelope` on `entry`, which becomes redundant and is removed for DRY.

## Phases

- [`phase-01-deep-envelope-strip.md`](./phase-01-deep-envelope-strip.md) — helper + schema preprocess + tests + verify.

Single phase; self-contained; no contract change to the tool's external shape.

## Dependencies

- None. Independent of the deferred EOF-conflict / M2 debate.
- Reuses existing `isEnvelope` / `stripEnvelope` concept in `envelope-stripper.js`.

## Acceptance criteria

1. `meta_state_batch` accepts `operations` coerced to `{item:[...]}` and applies the batch.
2. `meta_state_batch` accepts a write op whose `entry` contains nested array fields (`change_diff.added`) coerced to `{item:[...]}`, and `metaStateEntrySchema.safeParse` passes.
3. A change-log entry accepted by `meta_state_log_change` is now equally accepted by `meta_state_batch` (parity repro from the finding).
4. New tests in `meta-state-batch-tool.test.js` cover both coercion levels (top-level `operations`, nested `change_diff`).
5. Existing batch tests still pass; `deepStripEnvelope` is fail-closed on non-envelope input (no behavior change for uncoerced payloads).
6. Per-finding Rec 12 change-log committed in-PR; finding `meta-260709T1017Z-…-batch` resolved post-merge.

## Risks / rollback

- **Risk:** a legitimate meta-state entry whose body is exactly `{item: X}` would be unwrapped. `stripEnvelope` already carries this same risk on `entry` today; real entries always carry `id`/`entry_kind`/etc., so the single-`item`-key shape never occurs in practice. No new risk.
- **Rollback:** revert the preprocess + helper; the tool returns to its current (broken-for-coerced-input) state. No data/registry impact.