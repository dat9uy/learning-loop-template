---
phase: 1
title: "Validator blocking-policy refinement"
status: pending
priority: P1
dependencies: []
---

# Phase 1: Validator blocking-policy refinement

## Overview

Refine `tools/learning-loop-mastra/scripts/validate-registry-refs.js#computeDanglingRefs` so it blocks only on **real corruption**. Three buckets: `blocking` (active/open mutable source with `missing` target — typo, truncation, hard-deleted-without-tombstone; AND any `duplicate_id` across the union), `historical` (`missing` from immutable change-log sources + terminal-status sources), `informational` (`stale`-view targets + `superseded`/`resolved` targets). Tests first. Also adds a `change_log_immutable` guard to the `metaStateBatch` `update` op (closes a silent-no-op immutability gap).

## Why this exists

The post-merge BLOCK validator flags 124 dangling refs, but 55 are `consolidates` on **immutable change-logs** (Tier 1 invariant — cannot be patched, so they can never be cleaned) and 26 are `stale`-view targets (target exists; stale is a freshness signal, not ref corruption). Without this refinement, BLOCK-mode is unachievable — the immutable `consolidates` orphans are permanent. The refinement shrinks the blocking set to the genuinely-fixable residual (active-mutable-source `missing`: measured **~27** after terminal-source exemption — 16 active loop-design `addresses` + 1 active `proposed_design_for` + 9 active rule `origin` + 1 open finding `reopens`; 18 inactive loop-design `addresses` auto-exempt as `historical`).

## Requirements

- Functional: `computeDanglingRefs` returns three buckets — `blocking`, `historical`, `informational`. The CLI prints `historical` + `informational` counts as non-blocking and exits 1 only when `blocking.length > 0`.
- Non-functional: the blocking policy is a pure, unit-testable function; no disk reads in the classification. CLI exit-code contract unchanged (0/1/2).
- Invariant: `outboundRefsOf` extraction is unchanged — only classification + the new `duplicate_id` guard change.

## Architecture

`computeDanglingRefs(entries)` new classification:

1. **Duplicate-id guard (new).** Before per-ref classification, scan the union for ids appearing >1 time. For each duplicate id, push `{ source_id: "<id>", reason: "duplicate_id", ... }` to `blocking`. This closes a present-day masking vector (an appended change-log line with an existing open finding's id + `status:superseded` would otherwise overwrite the open entry in the `entryById` Map via last-write-wins) and gives an early Tier-2 warning. `entryById` is still last-write-wins for target lookup, but the dup guard surfaces the collision as blocking.
2. Resolve `target = entryById.get(ref.id)`.
3. If `!target`:
   - If `sourceKind === "change-log"` → `historical` (immutable source; can't be patched).
   - Else if `isTerminalSource(source)` → `historical` (terminal source; its refs are history).
   - Else → `blocking` (`reason: "missing"` — active/open mutable source; real corruption).
4. Else if `isStaleViewLike(target)` → `informational` (`reason: "stale"` — freshness signal, not corruption).
5. Else if `target.status === "superseded"` → `informational` (unchanged).
6. Else if `target.status === "resolved"` → `informational` (unchanged).

**`isTerminalSource(entry)`.** `entry.status ∈ {superseded, resolved, archived, inactive}`. Include `inactive` for **both `loop-design` and `rule`** sources — both schemas are `status: z.enum(["active","inactive"])` (`meta-state.js:421` rules, `:461` loop-designs); a deprecated (`inactive`) rule with a dangling `origin` is historical, not blocking. Findings use `open/resolved/superseded` (+ runtime `archived`); do NOT treat `inactive` as terminal for findings. Mirror `core/stale-view.js` predicates only where they truly apply — see the `isStaleViewLike` decision below.

**`isStaleViewLike` decision (keep + document, do NOT switch to canonical).** The validator's `isStaleViewLike` (`validate-registry-refs.js:52-59`) uses `created_at` only. The canonical `core/stale-view.js#isStaleView` uses `last_verified_at‖created_at` (`:74`). These diverge intentionally: post-merge on main the registry is the source of truth and drift detection is handled by `meta_state_check_grounding`, not this validator (the existing comment at `:48-51` says so). **Keep `isStaleViewLike`**; remove the plan's earlier "mirror canonical" instruction; add a one-line code comment cross-referencing `core/stale-view.js` and stating the validator deliberately uses a creation-age approximation (post-merge freshness ≠ runtime staleness). Do NOT swap to `isStaleView` — that would change the stale set and re-introduce drift coupling the validator was designed to avoid.

**Relationships-tool parity — ACCEPT DIVERGENCE (no refactor).** `tools/handlers/meta-state-relationships-tool.js#computeDanglingRefs(refs, entries)` (`:89-113`) has no source entry in scope (it receives only outbound `refs` + the entry list), so it cannot classify `historical` without a signature refactor. Per YAGNI, **do not refactor** the interactive tool. The validator adds the `historical` bucket; the relationships tool's `dangling_refs` retains its flat `missing`/`stale`/`superseded`/`resolved` reasons. Document this divergence in a code comment on both files + the plan: agents using `meta_state_relationships` see `dangling_refs` as today (no `historical` label); the `historical` classification lives only in the post-merge validator. Step 7 becomes "add the divergence comment to both files; no behavior change to the relationships tool."

**Pre-merge backstop for the change-log exemption (new — harden the advisory workflow).** The source-keyed change-log exemption means a typo'd/fabricated `consolidates` or `supersedes` ref on a NEW change-log is `historical` post-merge and never caught — and the existing `meta-state-pr-body-advisory.yml` is advisory-only (never fails the check). To close this hole, **harden `meta-state-pr-body-advisory.yml` in place**: keep its existing path-filter + `ci-registry-deltas.sh` jq extraction, but make the change-log ref-resolution step FAIL the check (exit non-zero) when a NEW `consolidates`/`supersedes` ref on the PR's added change-log lines targets an id absent from the base union. Non-change-log diffs stay advisory (unchanged). This catches typos BEFORE they become immutable, reusing the existing scaffolding (smallest blast radius). The post-merge source-keyed exemption then relies on this hardened pre-merge gate as its backstop (document this dependency).

**`metaStateBatch` `update` immutability guard (new, closes a Tier-1 gap).** `metaStateBatch`'s `update` op (`core/meta-state.js:1290-1336`) does NOT reject change-log entries — it `Object.assign`s the mutation, then `persistRegistryAtomic(tableOnly(entries, root), root)` (`:1452`) strips change-logs before writing `meta-state.jsonl`, and the mutated change-log is never appended to `change-log.jsonl`. The mutation is silently discarded; `applied: N` is returned as if it succeeded. Add a `change_log_immutable` guard to the batch `update` op, mirroring the `delete` op's `assertinvariant` at `:1344-1358`, so the silent no-op becomes an explicit rejection. Test: a batch `update` on a change-log id throws `change_log_immutable`.

## Related Code Files

- Modify: `tools/learning-loop-mastra/scripts/validate-registry-refs.js` (3-bucket classification; `isTerminalSource`; `duplicate_id` guard; `isStaleViewLike` divergence comment).
- Modify: `tools/learning-loop-mastra/tools/handlers/meta-state-relationships-tool.js` (divergence comment only — no behavior change).
- Modify: `tools/learning-loop-mastra/core/meta-state.js` (`metaStateBatch` `update` op `change_log_immutable` guard).
- Modify: `.github/workflows/meta-state-pr-body-advisory.yml` — harden the change-log ref-resolution step to FAIL the check (exit non-zero) on a new unresolved `consolidates`/`supersedes` ref; non-change-log diffs stay advisory.
- Modify: `tools/learning-loop-mastra/__tests__/legacy-mcp/validate-registry-refs.test.js` (TDD — new tests first).
- Reference: `tools/learning-loop-mastra/core/stale-view.js` (cross-reference only; do not call).

## Implementation Steps (TDD — tests first)

1. **Read** the existing `validate-registry-refs.test.js` + the batch test (`meta-state-batch-tool.test.js`) to learn fixture styles.
2. **Write tests first** (RED):
   - `missing` from a `change-log` source's `consolidates` → `historical`.
   - `missing` from a `change-log` source's `supersedes` → `historical` (pin the supersedes-from-change-log exemption branch — red-team F6/F3).
   - `missing` from a `superseded` finding's `reopens` → `historical`.
   - `missing` from an `inactive` **rule**'s `origin` → `historical` (red-team F7a — rules use active/inactive).
   - `missing` from an `inactive` loop-design's `addresses` → `historical`.
   - `missing` from an **active** finding's `consolidated_into` → `blocking`.
   - `missing` from an **active** loop-design's `addresses` → `blocking`.
   - `missing` from an **active** rule's `origin` → `blocking`.
   - `missing` from a finding with **absent `entry_kind` AND absent `status`** → `blocking` (legacy entry treated as active-open — red-team F7c).
   - `stale` target (open + >7d) → `informational` (downgrade from current blocking).
   - `superseded`/`resolved` target → `informational` (regression guard).
   - **Duplicate id** across the union → `blocking` (`reason: "duplicate_id"`) — red-team F8.
   - **Batch `update` on a change-log id → throws `change_log_immutable`** — red-team F14.
   - CLI: union with only `historical` + `informational` + 0 blocking → exit 0; one `blocking` → exit 1.
3. **Run** the new tests → confirm RED.
4. **Implement** the 3-bucket `computeDanglingRefs` + `isTerminalSource` (inactive for rule + loop-design) + `duplicate_id` guard + `isStaleViewLike` divergence comment + relationships-tool divergence comment; add the batch `update` `change_log_immutable` guard.
5. **Run** the new tests → GREEN. Run `pnpm test` → no regression.
6. **HARD GATE — measure the residual (red-team F10).** Run `node tools/learning-loop-mastra/scripts/validate-registry-refs.js` on the live union; record the EXACT `blocking` count + id list (expected ~27), the `historical` count (≈55 change-log consolidates + terminal-source missing + 18 inactive loop-design addresses), and `informational` (≈26 stale + superseded/resolved). This list is Phase 2's input. Do NOT start Phase 2 without it.
7. **Pre-merge backstop gate.** Harden `meta-state-pr-body-advisory.yml`'s change-log ref-resolution step to FAIL on a new unresolved `consolidates`/`supersedes` ref (non-change-log diffs stay advisory); test it against a fixture PR with a typo'd `consolidates` ref → exits non-zero; clean PR → exits 0.
8. **Relationships-tool divergence comment** on both files (no behavior change).

## Success Criteria

- [ ] `computeDanglingRefs` returns `{ blocking, historical, informational }` + `duplicate_id` blocking; `historical` holds immutable-source + terminal-source `missing`; `informational` holds `stale` + `superseded`/`resolved`.
- [ ] `isTerminalSource` includes `inactive` for `rule` + `loop-design` (not findings).
- [ ] TDD tests (step 2) pass; immutable/stale/inactive-rule/legacy-no-status/supersedes/duplicate-id branches all pinned.
- [ ] CLI exit 0 when `blocking.length === 0`; exit 1 only on `blocking > 0` (incl. `duplicate_id`).
- [ ] Live-union residual `blocking` list captured (HARD GATE, step 6) — record exact count + ids (expected ~27).
- [ ] `metaStateBatch` `update` on a change-log id throws `change_log_immutable` (no silent no-op).
- [ ] Pre-merge change-log diff BLOCK gate added + tested (typo'd ref → non-zero; clean → 0).
- [ ] `isStaleViewLike` kept + divergence documented (not switched to canonical `isStaleView`).
- [ ] Relationships-tool divergence documented (no refactor; `dangling_refs` shape unchanged).
- [ ] `pnpm test` green.

## Risk Assessment

- **Over-exemption / supersede-to-bury (red-team F7b)** — terminal-source exemption can silently reclassify a bad ref on a superseded finding as `historical`. Mitigation: Phase 2's triage report MUST list every ref reclassified blocking→historical via terminal-source status with an explicit justification (auditable, not silent). The `duplicate_id` guard also catches the "append a superseded copy to bury" vector.
- **Change-log exemption unmonitored hole (red-team F6)** — mitigated by the pre-merge change-log diff BLOCK gate (step 7); typos are caught before immutability. Document the dependency: the post-merge source-keyed exemption relies on the pre-merge backstop.
- **`inactive`-for-findings misclassification** — `isTerminalSource` includes `inactive` only for rule + loop-design; findings never carry `inactive`. Test the boundary.
- **Relationships-tool divergence** — accepted (YAGNI); documented in-code so a future agent doesn't expect `historical` in `dangling_refs`.