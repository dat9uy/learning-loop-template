# Tier 1 change-log stream split — Phase 4 closeout (session 260715-1517)

## Context

PR #60 (`feat(meta): tier1 change-log stream split + jq projection CI gates`,
merge `f6766b3`, 2026-07-15) shipped Phases 01a / 1 / 2 / 3 of
`plans/260715-0801-change-log-stream-split-tier1/`. The migration journal
`journal-260715-1253` explicitly deferred Phase 4 (verify + closeout). This
session runs the deferred Phase 4 work.

## What shipped this session (non-gated closeout)

1. **F11b docs fix (CLAUDE.md inbound-gate instruction).** The inbound-gate
   instruction read `meta-state.jsonl` (last 20 lines). Post-Tier-1-split the
   registry is two files, so that read missed every change-log. Updated
   CLAUDE.md line 13 to `tools/scripts/registry-table.sh | tail -20`
   (`registry-table.sh` reads the union of `meta-state.jsonl` +
   `change-log.jsonl`, dedupes by id, emits one-line-per-id). This is the
   Validation Session 1 Q1 / Red Team F11b fix. (The plan said update AGENTS.md
   and let CLAUDE.md inherit; the instruction actually lives in CLAUDE.md, so
   CLAUDE.md was edited directly.)

2. **merge=union dry-run (Phase 4 step 3 / Red Team F10) — and the gap it
   surfaced.** Constructed two branches from a shared base, each appending a
   different change-log line at the same EOF position of `change-log.jsonl`,
   `meta-state.jsonl` left byte-identical to base. Findings:
   - **Default merge (no union driver):** correctly CONFLICTS (content
     conflict, 3 markers). This is the parallel-PR EOF class the plan targets.
   - **With the canonical `git merge-file --union %O %A %B` driver:** the
     driver fires but returns RC=0 and keeps only "ours", silently dropping
     the other side. That is the data-loss the attribute exists to prevent.
   - **Root cause:** `git merge-file <current> <base> <other>` writes its
     result into the FIRST argument. The canonical driver passes `%O` first,
     so the result lands in `%O` and git reads the unchanged `%A` (ours).
   - **Corrected driver `git merge-file --union %A %O %B`:** merge succeeds,
     no conflict, both appended lines present, 0 duplicate ids. The payoff
     works — but only with the corrected arg order AND a per-clone
     `git config merge.union.driver` (git config is not committable).

3. **Driver-config gap fix (files).** The repo had NO `merge.union.driver`
   config anywhere, so `.gitattributes`'s `merge=union` was a silent no-op on
   every clone. Fixed:
   - `.gitattributes`: corrected the misleading comment (it claimed the
     attribute "lets the merge succeed automatically" — true only after
     per-clone driver config) and documented the correct `git merge-file
     --union %A %O %B` arg order plus the wrong-arg-order data-loss failure.
   - `AGENTS.md` §8 (new): "Git Union Merge Driver (one-time per-clone
     setup)" — the one-time `git config merge.union.driver` command, the
     load-bearing arg order, and the verification reference.

## What did NOT ship this session (gated on LOOP_SESSION_MODE=live)

`LOOP_SESSION_MODE` is unset in this session, so the two registry mutations
Phase 4 step 6 requires are blocked (live-gated MCP tools):

- **Resolve `meta-260715T0633Z-change-log-stream-…`** with PR + change-log
  refs. The finding is currently `open` (verified). Red Team F15b pre-resolve
  guard: `meta-260715T0633Z-finding-stream-…` is `open` (verified) and MUST
  stay open as the Tier-2 ticket — do not close it.
- **Write the ship change-log** via `meta_state_log_change` (it would land in
  `change-log.jsonl`, also exercising the new path).

Operator runbook to finish Phase 4 step 6 in a live session
(`LOOP_SESSION_MODE=live`):

1. `meta_state_list({ id: 'meta-260715T0633Z-finding-stream-half-of-the-superseded-meta-260709t1017z-two' })`
   → assert `status === 'open'` BEFORE resolving anything.
2. `meta_state_log_change(...)` recording the Tier 1 ship (target
   `meta-state.jsonl`/`change-log.jsonl`, reason ≥20 chars, PR #60 ref).
3. `meta_state_resolve({ id: 'meta-260715T0633Z-change-log-stream-half-of-the-superseded-meta-260709t1017z-t', resolution: 'Shipped via PR #60 (merge f6766b3) + this change-log' })`.
4. Re-list `finding-stream` → confirm still `open`.

## Verification snapshot (post-PR #60, this session)

- `change-log.jsonl`: 218 lines, 0 intra-file duplicate ids.
- `meta-state.jsonl`: 0 `entry_kind=change-log` entries.
- `.gitattributes`: `change-log.jsonl merge=union` present (line 25).
- `meta-state-refs-check.yml` (post-merge BLOCK, WARN-mode) +
  `validate-registry-refs.js` shipped.
- `migrate-change-log-stream.mjs` shipped.
- `finding-stream` finding: `open` (Tier-2 ticket, correct).
- `change-log-stream` finding: `open` (awaiting live-session resolve).

## Plan status

Phases 01a / 1 / 2 / 3 / 4 marked completed in
`plans/260715-0801-change-log-stream-split-tier1/`. Phase 4 success criteria:
merge=union dry-run ✓ (with the corrected driver now documented),
finding-stream-open ✓, journal ✓. The change-log-stream finding resolution is
the one residual, gated on a live session, flagged in the plan and here.

## Open follow-up (not Phase 4)

- 98 pre-existing registry orphans flagged by `validate-registry-refs.js`
  (deferred cleanup; once clean, flip `meta-state-refs-check.yml` to BLOCK by
  removing `continue-on-error: true`). Tracked in `journal-260715-1253`.
- Per-clone `git config merge.union.driver "git merge-file --union %A %O %B"`
  is a one-time operator setup now documented in AGENTS.md §8; not automatable
  via a committable file.