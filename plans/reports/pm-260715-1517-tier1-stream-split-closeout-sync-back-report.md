# PM Sync-Back: Tier 1 change-log stream split → completed

**Plan:** `plans/260715-0801-change-log-stream-split-tier1/`
**Trigger:** PR #60 merged (merge `f6766b3`, 2026-07-15) — operator requested
marking plan + phase files completed.
**Session:** 260715-1517

## What was verified against PR #60

| Acceptance item | State |
|---|---|
| `change-log.jsonl` exists, all+only change-logs; `meta-state.jsonl` 0 change-logs | ✓ 218 / 0 |
| `change-log.jsonl` 0 intra-file dup ids | ✓ |
| `.gitattributes change-log.jsonl merge=union` | ✓ (comment corrected this session) |
| `meta_state_log_change` / `metaStateBatch` true-append to change-log.jsonl | ✓ |
| 8-site core+handler immutability guard + `assertNoChangeLogLeak` | ✓ |
| Dual-source read seam + cold-tier SHA + identity projection + created_at sort | ✓ |
| `registry-table.sh` multi-file PATH_ARG | ✓ |
| `consolidates: z.array(z.string())` + migration | ✓ (17 CSV entries normalized) |
| `migrate-change-log-stream.mjs` (withRegistryLock, idempotent) | ✓ 309→92 / 0→217 |
| Pre-merge advisory (jq ref-extraction, WARN-on-own-diff) | ✓ |
| Post-merge `meta-state-refs-check.yml` + `validate-registry-refs.js` | ✓ (WARN-mode pending orphan cleanup) |
| `finding-stream` finding OPEN (Tier-2 ticket) | ✓ verified |
| `change-log-stream` finding resolved | ✗ GATED (see below) |
| merge=union dry-run | ✓ this session — surfaced + fixed driver gap |
| F11b inbound-gate docs fix | ✓ this session (CLAUDE.md) |

## Sync-back performed

| File | Change |
|---|---|
| `plan.md` | frontmatter `status: completed`; progress block all completed; Phases table all Completed; acceptance criteria DEFERRED items flipped to `[x]` with shipped notes; Validation Log action items flipped |
| `phase-01a` | already completed (no change) |
| `phase-01` | already completed (no change) |
| `phase-02` | `status: completed`; 7 DEFERRED success criteria → `[x]` |
| `phase-03` | `status: completed`; 5 success criteria → `[x]` |
| `phase-04` | `status: completed`; 4/5 success criteria `[x]`; finding-resolve criterion left `[ ]` (gated) |

**Residual `[ ]` (2, both the same gated item):** `change-log-stream` finding
resolution in `phase-04` + `plan.md` acceptance. Requires
`LOOP_SESSION_MODE=live` (not set this session). Not a code/acceptance gap —
the substantive Tier 1 work is shipped and verified; this is registry
closeout ceremony.

## Phase 4 closeout work done this session

1. **F11b docs fix** — CLAUDE.md inbound-gate instruction →
   `tools/scripts/registry-table.sh | tail -20` (reads the union; the old
   `meta-state.jsonl` (last 20 lines) read missed every change-log post-split).
2. **merge=union dry-run (Red Team F10)** — verified the payoff AND surfaced a
   real defect:
   - Default merge conflicts correctly (3 markers).
   - Canonical `git merge-file --union %O %A %B` driver silently keeps only
     "ours" → data-loss (the exact failure the attribute exists to prevent).
     Root cause: `git merge-file` writes its result to the FIRST arg; the
     canonical driver passes `%O` first, so the result lands in `%O` and git
     reads the unchanged `%A`.
   - Corrected `git merge-file --union %A %O %B` → both appends kept, 0 dup
     ids, no conflict.
   - Repo had NO `merge.union.driver` config anywhere → `merge=union` was a
     silent no-op on every clone.
   - Fix: `.gitattributes` comment corrected + `AGENTS.md` §8 (new) documents
     the one-time per-clone `git config merge.union.driver "git merge-file
     --union %A %O %B"`.
3. **Closeout journal** — `docs/journals/journal-260715-1517-tier1-phase4-closeout.md`.

## Operator action required to fully close Phase 4

Run in a `LOOP_SESSION_MODE=live` session (runbook in the closeout journal):

1. `meta_state_list({ id: 'meta-260715T0633Z-finding-stream-…' })` → assert
   `open` (pre-resolve guard, Red Team F15b).
2. `meta_state_log_change(...)` — record the Tier 1 ship (PR #60 ref).
3. `meta_state_resolve({ id: 'meta-260715T0633Z-change-log-stream-…', resolution: 'Shipped via PR #60 (merge f6766b3) + change-log' })`.
4. Re-list `finding-stream` → confirm still `open`.

Then flip the 2 residual `[ ]` → `[x]` in `phase-04` + `plan.md`.

## Open follow-ups (not Phase 4)

- 98 pre-existing registry orphans → cleanup, then flip
  `meta-state-refs-check.yml` to BLOCK (`continue-on-error: true` removal).
- Per-clone union-driver config is a one-time operator step (AGENTS.md §8); not
  committable. Consider a `tools/scripts/setup-git-merge-drivers.sh` if clone
  consistency becomes a concern.

## Unresolved questions

- Should the union-driver-config gap be recorded as a meta-state finding
  (`meta_state_report`, category `loop-anti-pattern` or `gate-logic-bug`)?
  It is a shipped-mechanism defect discovered by verification. Not done this
  session — operator decision.
- Is a setup script for `merge.union.driver` worth adding, or is the AGENTS.md
  §8 doc note sufficient given the single-PR convention keeps parallel registry
  PRs rare?