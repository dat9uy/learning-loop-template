# Tier 2 — Mutable Stream → Union-Safe Versioned-Append (Brainstorm Report)

**Date:** 2026-07-16 11:01
**Subject:** `meta-260715T0633Z-…-finding-stream-…` (open, Tier 2 ticket) + `meta-260715T2311Z-gratuitous-mutations-…` (open, resolved in-scope)
**Predecessors:** PR #60 (Tier 1 change-log split), #61 (orphan semantics + union-driver hardening), #62 (refs-check PR trigger), #63 (stale-view hash drift)
**Mode:** `/ck:plan --tdd` handoff (Phase B refactors the write path of a well-tested core module → tests-first locks current behavior)
**Decisions captured:** per-id monotonic versioning; staged sub-PRs; reuse `archived` for delete; manual compaction script + signal

## 1. Problem

Tier 1 split the immutable change-log stream to `change-log.jsonl` (`merge=union`, safe) and built the read chokepoint as a swappable projection seam. It deliberately did **not** touch the mutable table (`meta-state.jsonl`): findings/rules/loop-designs are still written by read-all → tmp-rename full-rewrite (`appendRegistryEntryAtomic` meta-state.js:139, `persistRegistryAtomic` :79, `updateEntry` :950, `archiveEntry` :1067, `deleteEntry`, `metaStateBatch`). In-place mutation + full rewrite is what makes `merge=union` **unsafe** on `meta-state.jsonl` (`.gitattributes` explicitly forbids it). The operator self-limits parallel finding-resolve because this mechanical fix is absent — the operator is the safety (report §1). Tier 2 pays the debt: make the mutable stream union-safe so the self-limiter comes off.

## 2. Why not smaller / defer (brutal honesty)

No smaller Tier 2 exists. The speed limiter **is** the in-place-mutation+full-rewrite pattern unsafe under union. Removing it requires making mutations union-safe = versioned-append rewrite. Compaction is already deferred (Q3); the CI advisory is additive. Tier 2 is minimally scoped. The "defer until a parallel PR mutates a finding" trigger is self-defeating under behavioral safety (report §5) — the operator suppresses the symptom → trigger never fires → defer forever. Tier 2 is the committed next phase, not gated on a symptom.

## 3. Evaluated forks (decided this session)

| Fork | Options | Decision | Rationale |
|---|---|---|---|
| Version numbering | per-id monotonic / global lamport | **per-id monotonic** | `updateEntry` already reads the registry in-lock; max-version-for-id is O(n) in-memory, no new I/O; matches `max_by(.version)` projection. Tied: resolve `meta-260715T2311Z` in-scope (no-op short-circuit — more important under append, since gratuitous mutations become permanent versioned lines). |
| PR structure | staged sub-PRs / one big bang | **staged (3 sub-PRs)** | Each independently green + reviewable; `.gitattributes` flip lands only after write-path rewrite proven. |
| Delete shape | `deleted_at` field / `status:"deleted"` enum / reuse `archived` | **reuse `archived`** | `archived` is runtime-applied (outside persisted enum), `meta_state_list` already filters `e.status !== "archived"` by default, `archiveEntry` already produces it. Zero new schema/exclusion logic. Accept semantic loss: hard-delete is gone (union-safety forbids line removal). |
| Compaction trigger | manual script / MCP tool / CI step | **manual script + signal** | Operator/agent need a "when to run" signal. Ship `compact-registry.sh --check` + `loop_describe` warm-tier `registry_stats` block (agent runtime) + CI advisory notice (operator PR cadence). Three surfaces, one DRY stats helper. |

## 4. Final solution — 3 staged sub-PRs

### Phase A — projection swap + version backfill (no-op behavior change)
- Swap JS seam (`_readAndParseRegistry`) projection: "concat + sort by `created_at`" → "concat + `group_by(.id) | map(max_by(.version))` **then re-sort by `created_at`**". Re-sort preserves `meta_state_list` chronological ordering; `registry-table.sh` unchanged (already dedupes).
- One-time migration: backfill `version: 0` on any of the 100 existing entries missing a non-null `version` (jq `max_by(.version)` undefined on nulls — must backfill before projection goes live).
- Behavior identical (each id singleton today). No write-path change, no `.gitattributes` change. Safe standalone.

### Phase B — write-path rewrite to versioned-append + resolve `meta-260715T2311Z`
- `appendRegistryEntryAtomic` → true append (drop read-all); new entries `version: 0`.
- `updateEntry` → read (validate id, invariants, CAS) → compute patched entry → **no-op short-circuit: no field changed ⇒ return true, no append, no version bump** (resolves `meta-260715T2311Z` tool-side) → else append new line `version = maxVersionForId + 1`. No full rewrite. `persistRegistryAtomic` retired for mutable stream (kept for compaction only).
- `archiveEntry` + `deleteEntry` → both append highest-version line `status: "archived"`; `deleteEntry` sets `archived_reason: "deleted: <reason>"` to distinguish intent. Existing `meta_state_list` `e.status !== "archived"` filter hides both.
- `shipLoopDesign` / `metaStateBatch` → same append-new-version pattern. `tableOnly` + `assertNoChangeLogLeak` still guard change-log leak.
- Inline compaction in `updateEntry` removed (no full rewrite to piggyback).
- Agent-side arm of `meta-260715T2311Z`: prune stale split-patch guidance in AGENTS.md/CLAUDE.md (the wire-format bug is fixed; array+scalar split is outdated ceremony).
- No `.gitattributes` flip yet — Phase B = internal correctness (in-process concurrent appends safe via lock+queue); cross-branch parallel appends still conflict at merge until Phase C.

### Phase C — `.gitattributes` flip + CI advisory + compaction signal
- Flip `.gitattributes`: add `meta-state.jsonl merge=union` (replace forbidding comment with now-valid justification). **Load-bearing mechanical fix that removes the parallel-resolve speed limiter.** Lands only after Phase B on main + green.
- CI same-id-concurrent-mutation advisory (Q2): extend `ci-registry-deltas.sh` + `meta-state-pr-body-advisory.yml` with `group_by(.id) | map(group_by(.version)) | any(map(length) > 1)` — pre-merge WARNING, no block. Both version lines retained (audit-complete).
- AGENTS.md/CLAUDE.md read instruction formalized: `tools/scripts/registry-table.sh | tail -20` (session-start hint already says this).
- Compaction: `tools/scripts/compact-registry.sh` (`--check` reports eligibility, no write; full run rewrites keeping `max_by(.version)` per id, dropping superseded tombstones) + `loop_describe` warm-tier `registry_stats` block (`raw_lines`, `deduped_ids`, `dead_version_lines`, `compaction_eligible`) + CI non-blocking "compaction eligible" notice. Threshold: `raw_lines >= 1000`.

## 5. Touchpoints (from scout)

- `core/meta-state.js`: `appendRegistryEntryAtomic` (139), `persistRegistryAtomic` (79), `updateEntry` (950), `archiveEntry` (1067), `deleteEntry`, `metaStateBatch`, `shipLoopDesign`, `_readAndParseRegistry` (641), `tableOnly` (99), `assertNoChangeLogLeak` (127)
- `core/read-registry-cache.js`: seam `parseFn`
- `tools/scripts/registry-table.sh` (unchanged), new `tools/scripts/compact-registry.sh`
- `.gitattributes`: `meta-state.jsonl merge=union` (Phase C)
- `.github/workflows/meta-state-pr-body-advisory.yml` + `tools/scripts/ci-registry-deltas.sh` (Q2 advisory + compaction notice)
- `tools/learning-loop-mastra/tools/handlers/meta-state-list-tool.js` (archived filter — verify still correct)
- `tools/learning-loop-mastra/tools/handlers/meta-state-promote-rule-tool.js:190` (gratuitous-mutations tool-side fix)
- `loop_describe` warm tier (registry_stats block)
- `AGENTS.md` / `CLAUDE.md` (read instruction + prune split-patch guidance)
- Tests: `__tests__/` meta-state suite (write-path, projection, CAS, archive/delete semantics) — TDD anchor

## 6. Risks

1. **Phase A ordering** — projection re-sort must preserve `meta_state_list` chronological order. Pin in Phase A tests.
2. **Phase B no-op short-circuit** — compare post-`Object.assign` entry vs existing max-version entry field-by-field, excluding `version` itself. Shallow equality suffices (patches are flat). Must not short-circuit on `_expected_version`-only patches (CAS-only call with no field change is still a no-op → no bump).
3. **Phase C `.gitattributes` flip** — irreversible-in-effect once a parallel merge relies on it. Must land after Phase B on main + green. Same-clone `git config merge.union.driver` setup already documented in `.gitattributes` comment.
4. **`deleteEntry` semantic loss** — hard-delete gone; `include_archived: true` now shows deleted entries (previously truly gone). Benign (more complete audit) but a public-contract shift — document in change-log.
5. **Version-backfill correctness** — entries created before CAS existed may have null/missing `version`; backfill must be idempotent and not clobber existing non-zero versions.

## 7. Success metrics / validation

- Phase A: `meta_state_list` output byte-identical before/after projection swap (singleton ids); all existing tests green; `version` present on every entry.
- Phase B: mutation appends a new line (file line count +1 per real mutation, +0 per no-op); `meta_state_list` hides archived/delete tombstones; CAS still works; `meta-260715T2311Z` repro (promote an already-open finding) → no version bump, no append; parallel-branch dry-run shows appends don't conflict at the line level (still conflict at EOF until Phase C).
- Phase C: two branches from shared base each mutate the same id → `git merge` auto-resolves via `merge=union` → projection dedupes to last-wins → CI advisory surfaces the duplicate-version-per-id; compaction `--check` reports eligibility accurately; `loop_describe` warm tier shows `registry_stats`.

## 8. Out of scope (Tier 3)

Real DB / event store; auto-compaction; global lamport versioning; post-merge BLOCK workflow for same-id mutations (Q4 post-merge BLOCK is for relationship orphans, already shipped in Tier 1 follow-up).

## 9. Next steps

Hand off to `/ck:plan --tdd` with this report path. Plan produces 3 phase files (A/B/C) with tests-first per phase. Single PR on main per phase, no parallel registry-PR window during each (Q6 discipline). Do **not** resolve `meta-260715T0633Z-…-finding-stream-…` until Phase C lands — it stays open as the Tier 2 ticket across all three sub-PRs. Resolve `meta-260715T2311Z-gratuitous-mutations` in Phase B (no-op short-circuit + guidance prune) and record via change-log.

## 10. Unresolved questions (settle at plan/implementation time)

- Phase A: exact `version` default for backfill (`0` vs `1`) — pick `0` (matches "no CAS history yet"); verify no existing entry has `version: 0` meaning something else.
- Phase C: whether the post-merge relationship-validate workflow also runs the Q2 same-id-concurrent-mutation advisory, or it stays pre-merge-only (report §residual).
- Phase C compaction: whether `compact-registry.sh` drops superseded tombstones entirely or keeps the latest tombstone per id (audit completeness vs file size) — recommend keep-latest-tombstone.
- Phase B: whether `metaStateBatch`'s multi-id mutations each append independently (one line per id per op) — yes, that's the natural shape.