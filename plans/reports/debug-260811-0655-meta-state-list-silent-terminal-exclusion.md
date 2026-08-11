# Debug report — `meta_state_list` silent terminal-status exclusion

**Finding:** `meta-260801T2348Z-meta-state-list-compact-projection-silently-strips-fields-yi`
**Date:** 2026-08-11
**System:** meta-state-tools
**Severity:** warning

## Executive summary

The finding documented two failure modes in `meta_state_list`:

1. **"Screens of undefined"** — the compact projection silently stripping fields on id-filtered queries.
2. **Silent terminal-status exclusion** — an id-filtered query returning `entries: [], count: 0` for an id that exists but is resolved/accepted/archived, with no notice that the id exists or how to include it.

**Mode 1 is already fixed** — the current `summarize` projection (in `core/loop-introspect.js`) guards every optional field with `if (entry.xxx)`, so no `undefined` values can be emitted. The "screens of undefined" symptom from the original session was a transient bug in an earlier projection, resolved before this investigation.

**Mode 2 is a live bug, confirmed by reproduction.** An id-filtered query on a terminal id silently returns `count: 0`. The tool's own documentation conflates this with "missing ids are silently skipped", which is exactly the confusion the finding records — field-hungry agents bypassed the tool and grepped `meta-state.jsonl` raw.

## Reproduction

```
meta_state_list({ id: "meta-260614T1236Z-no-mcp-path-exists-to-unarchive-..." })
  → entries: [], count: 0        # id EXISTS, is resolved

meta_state_list({ id: <same>, include_archived: true })
  → entries: [ {...status: "resolved"...} ]   # revealed
```

An open id returns normally; a nonexistent id returns `count: 0` (correct, handled by the `id_prefix_hints` did-you-mean path). The terminal id fell into the same silent bucket as the nonexistent id.

## Root cause

`tools/learning-loop-mastra/tools/handlers/meta-state-list-tool.js` applies the default terminal-status exclusion (`EXCLUDABLE_STATUSES` = resolved/superseded/accepted, plus `archived`) to the id-filtered `result` set unconditionally. When the caller narrows by `id`, they have explicitly named the entries they want — an empty result with no notice is indistinguishable from "no such id", so the agent is pushed to raw file reads to disambiguate.

The exclusion itself is deliberate and pinned by tests (terminal entries are excluded from default views by design). The bug is that the exclusion is **silent** on the id-filtered path.

## Fix

Purely additive — existing return shapes and the pinned terminal-exclusion tests are unchanged.

### 1. `meta-state-list-tool.js` — `excluded_ids` notice

- Snapshot the id-filtered match set **before** the terminal-status exclusion (`preExclusionIds`).
- After the exclusion, for id-filtered queries where terminal entries were excluded by default (`includeTerminal` false), emit `excluded_ids: [{ id, entry_kind, status, note }]` for each queried id that exists in the registry but was dropped. The note names the retry incantation: `pass include_archived:true (or an explicit status filter) to include it`.
- Suppressed when the caller opted into terminal entries (`include_archived: true` or an explicit terminal `status` filter), and absent for nonexistent ids (the `id_prefix_hints` path owns that case).
- Tool description + `id` schema doc updated to document the notice.

### 2. `core/hint-registry.js` — `narrow-query` hint enriched

Added the finding's "steering hint" (proposal 3d) to the existing `narrow-query` discoverability hint (index-stable, append-only registry untouched):
- `meta_state_list` default = live latest-version projection.
- `include_all_versions: true` is audit-only — never a workaround for a fresh write; a just-written record that reads stale → re-query once, do not grep `meta-state.jsonl`.
- An `excluded_ids` notice on an id query means pass `include_archived: true`.

The hint-registry append-only invariant (locked slug lists + numeric indices) is preserved — no rows added, only the `narrow-query` text/suggestion enriched.

## Verification

- **New regression tests** in `meta-state-list-id-filter.test.js` (7 added):
  - terminal id emits `excluded_ids` notice with status + include_archived hint
  - `include_archived: true` suppresses the notice
  - open id emits no notice
  - nonexistent id emits no notice
  - mixed `[open, terminal]` id query: open returns, terminal excluded + noticed
  - explicit `status:"archived"` filter is a caller opt-in → no notice (reviewer Major #1 fix)
  - same-version tie-break (later created_at terminal) → notice fires with terminal status (reviewer Minor #3 fix)
- **Live reproduction** against the real registry + isolated temp-registry fixtures (11 cases):
  - resolved id-only → notice fires; archived id-only → notice fires
  - `include_all_versions` terminal id → notice fires; same-version tie-break → notice fires
  - `status:"archived"` explicit → NO notice (caller opted in)
  - `status:"resolved"` / `include_archived:true` → entry returned, no notice
  - `status:"open"` on a terminal-projected id → no notice (caller's own filter dropped it)
  - nonexistent / open ids → no notice; mixed `[open, terminal]` → open returned + terminal noticed
- **Test suites green:**
  - `meta-state-list-id-filter.test.js` — 21 tests (13 original + 8 new)
  - Full `meta_state_list` + archive + hint regression set — 92 tests
  - Full unit suite — 1315/1315 (independently verified by code-reviewer)
  - `cli-context-savings.test.js` — 22 tests; snapshot refreshed (+377 bytes for `meta_state_list` description growth — the snapshot test's intended review gate)
- **Grounding:** finding's `evidence_code_ref` (`core/meta-state.js`) hash matches the file-index baseline; `meta_state_derive_status` → `active-uncertain`, recommendation `investigate` (resolved by this work).
- **Orphan-evidence gate:** `rule-no-orphaned-evidence` check passes (satisfied: true) — no drifted open mechanism_check findings block resolution.

## Code-review findings addressed

The ak-fix Step 5 code-review pass (independent reviewer) surfaced two issues in the initial `excluded_ids` implementation, both fixed:

1. **False positive on explicit `status:"archived"`** — `archived` is not in `EXCLUDABLE_STATUSES`, so `isExplicitStatusFilter` was false and the notice fired even when the caller explicitly queried archived. Fixed: `status:"archived"` now counts as an explicit terminal opt-in, suppressing the notice.
2. **Same-version tie-break false negative** — the notice's projection used only version (no created_at tie-break), disagreeing with Step 4's `later created_at wins` on equal version, so a same-version terminal line could be dropped silently. Fixed: the notice now projects from the same post-Step-3 `result` set with the identical tie-break, guaranteeing the reported status always matches what Step 4 actually excluded.
3. **Docs over-promise** — the hint text implied `count:0` + no notice always means "id does not exist"; clarified in the notice's scope comment.

The reviewer independently verified the full unit suite (1315/1315) and confirmed no contract breaks on primary paths.

## Files changed

- `tools/learning-loop-mastra/tools/handlers/meta-state-list-tool.js` (excluded_ids notice + opt-in handling + projection-scope alignment + docs)
- `tools/learning-loop-mastra/core/hint-registry.js` (narrow-query hint enrichment)
- `tools/learning-loop-mastra/__tests__/integration/meta-state-list-id-filter.test.js` (8 regression tests)
- `tools/learning-loop-mastra/__tests__/__snapshots__/cli-context-savings-script.test.js.snap` (refresh for tool-description growth)

## Notes / unresolved

- Runtime-agnostic checklist (hint #3) not invoked: this is a single-surface additive change to an existing read tool with no new shim/fork or cross-runtime surface, so the shim-not-fork + cross-surface-iteration checklist does not apply.
- The finding's `evidence_code_ref` still points at `core/meta-state.js` (unchanged). The fix lives in the list-tool handler + hint-registry; the cited file is the mechanism owner the list tool imports from, so the evidence reference remains valid and grounded.
- Pre-existing, unchanged by this fix: `{ id, status:"archived" }` (without `include_archived`) returns `count:0` — the caller's explicit archived filter is dropped by the `!include_archived` per-line guard. This asymmetry predates the notice; the notice is now correctly suppressed for it (the caller opted in), but the underlying "archived via status filter alone returns nothing" behavior is a separate pre-existing issue the reviewer flagged as a decision point.
