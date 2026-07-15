# meta-state.jsonl Parallel-PR Conflict — Lifecycle Split as Staged Tier-2 Migration

**Date:** 2026-07-15 (rewritten same-day after operator reframe + decision pass)
**Subject:** `meta-260709T1017Z-parallel-prs-that-each-commit-append-only-meta-state-jsonl-c` (superseded) → `meta-260715T0633Z-change-log-stream-…` + `meta-260715T0633Z-finding-stream-…` (both open)
**Core move:** split the registry by **mutability/lifecycle** so each stream gets the merge strategy its write pattern needs — Tier 1 (immutable change-log stream) now, Tier 2 (mutable table stream) as the committed next phase. All seven open questions resolved (§11).

## 1. Problem

Parallel PRs that each append to `meta-state.jsonl` conflict at EOF on sequential merge — git cannot auto-merge same-position adds (observed 2026-07-09: PR #44/#45). Two facts together make this hard:

- **Mechanical:** git EOF-append conflict is inherent to JSONL appends; `merge=union` would auto-resolve it, BUT…
- **Co-location:** the same file is *both* an append-log (new entries) *and* a mutable table (resolve/patch/batch/archive rewrite entries in place). `merge=union` on a mutable file keeps both the stale base-version and the mutated version of the same id → duplicate ids → corruption. So union is unsafe on the file as a whole.

The original 2026-07-15 reframe called this a **"two-target mismatch on one file"** (Target A = in-PR handoff writes; Target B = parallel-PR async). **That framing was a misdiagnosis and is retired here.** A and B are not in product-level tension — both want in-PR appends and both are satisfied by appends. The real constraint is the write-model co-location above, not a target conflict. The "two targets cannot both be satisfied on one file" claim is only true *under the current write model* (mixed append+mutate on one file) — the qualifier was load-bearing and the headline dropped it.

**The deeper premise the original report missed (operator-supplied):** current safety is **behavioral, not mechanical.** The table stream is not safely mergeable; the operator self-limits parallel finding-resolve because the mechanical fix (Tier 2) is absent. *The operator is the safety.* This changes the decision: Tier 2 is not "scale YAGNI" — it is real debt that imposes a speed limiter the operator pays for every session.

## 2. Why documented mitigations don't resolve it (code-verified)

| Mitigation | Verdict | Evidence |
|---|---|---|
| (a) post-merge logging | Safe mechanically, kills in-PR handoff | in-PR branch can't raise a finding/change-log for the next session |
| (b) `merge=union` on meta-state.jsonl | **Unsafe** | `appendRegistryEntryAtomic` (meta-state.js:76-83) reads-all→rewrites; `persistRegistryAtomic` (:68-74) full-rewrite via tmp-rename; resolve/patch/batch/archive mutate in place. Union keeps stale base-version + mutated version of same id → duplicate ids → corruption. `.gitattributes` already documents this exclusion. |
| (c) sequence PRs | Process discipline | doesn't fix already-cut async branches; pure friction |

Read path confirmed: `_readAndParseRegistry` (:554-567) is `lines.map(parse)` — **no dedupe by id**, one entry per line. The file is a TABLE stored as JSONL.

## 3. Root cause, restated

Two co-located write patterns on one file (append + in-place mutate) + a git merge model that can auto-resolve appends but not mutations. The fix shape follows the partition: **separate streams by mutability/lifecycle, give each the merge strategy its pattern needs.**

| Kind | Lifecycle | Write pattern | Safe merge strategy |
|---|---|---|---|
| change-log | immutable (`status=active` forever) | append-only | `merge=union` ✅ |
| finding | mutable (resolve/patch) | append new + rewrite-on-mutate | union unsafe → needs versioned-dedupe (Tier 2) |
| rule | mutable (refine) | same | same |
| loop-design | mutable (ship: active→inactive) | same | same |

The split is by **mutability invariant**, not by target. This is plain data partitioning — not the "write-model inversion" the original report named. (Change-logs were already append-only; relocating them is physical separation, not an inversion.)

## 4. Tiers

| Tier | What | Solves | Cost |
|---|---|---|---|
| **0 (shipped)** | In-PR commits + manual `git merge-file --union` for rare parallel case + `.gitattributes runtime-state.jsonl merge=union` | nothing structurally; relies on operator self-limiting | none — accepted friction |
| **1 — split change-log stream** | Move immutable change-logs to `change-log.jsonl` (append-only + `merge=union`); keep mutable findings/rules/loop-designs as table entries in `meta-state.jsonl`; extend the read chokepoint to load both | change-log EOF conflict (the observed case) | low — one read-chokepoint edit + `.gitattributes` line + post-merge CI validation gate + one-time migration |
| **2 — mutable stream becomes union-safe** | Mutable file becomes append-only + versioned last-wins dedupe; every reader routed through the jq projection | the actual debt: parallel finding-resolve (operator's speed limiter) | medium — rewrite write path to versioned-append; route direct readers through the jq projection; compaction deferred |
| **3 — real DB / event store** | — | — | out of scope |

**Tier 1 is a staged prerequisite, not a substitute.** It narrows Tier 2's blast radius — change-logs get offloaded now and won't need version-dedupe later — but it does **not** touch the hard half of Tier 2 (mutable table + reader projection) and leaves the parallel-resolve speed limiter **100% in place.** After Tier 1 ships, the operator still cannot parallel-resolve findings. Debt is paid only when the mutable table is union-safe and the self-limiter comes off.

**Tier 2 conflict semantics (decided Q2):** when two parallel branches mutate the same id, **last-wins by max version** in the projection; **both version lines are retained** in the file (audit trail stays complete — nothing silently lost); a **CI advisory surfaces same-id concurrent mutations** (detected as duplicate version numbers for one id in the merged union — `group_by(.id) | map(group_by(.version)) | any(map(length) > 1)`) so the operator is told, not blocked. Removes the speed limiter fully (no merge step) while preserving audit completeness + awareness.

## 5. Why the original "defer Tier 2" was self-defeating

The original finding-stream finding ended: *DEFER Tier 2 until a parallel PR actually MUTATES a finding — at solo-operator scale the manual workaround is cheaper than the migration.*

That defer-trigger is **structurally self-defeating under the behavioral-safety premise.** The operator self-limits parallel finding-resolve *because* Tier 2 is absent. The trigger is calibrated to the exact event the operator suppresses → it never fires → Tier 2 defers forever → Tier 1 decays into the workaround the operator rejected. "Defer until symptom" = "defer forever" when the operator is the safety preventing the symptom.

**Corrected trigger:** Tier 2 is the **committed next phase** after Tier 1 lands — scheduled, not gated on a symptom the operator suppresses.

## 6. Tier 1 done-right criteria (stepping stone, not workaround)

Tier 1 is legitimate **iff all three hold:**

1. **Tier 2 committed, not deferred-until-symptom.** Trigger is "next workstream after Tier 1," not "until a parallel PR mutates."
2. **The finding-stream finding stays OPEN as the Tier-2 ticket.** Shipping Tier 1 must not retire the debt visually.
3. **The read-chokepoint is built as the swappable projection seam Tier 2 plugs into — not a one-off two-file concat.** The seam's contract is "load sources → produce one entry array." Tier 1's projection is identity (one-line-per-id); Tier 2 swaps it to last-wins-by-max-version. Build the seam once.

## 7. Operator ergonomics — the jq projection (decided Q7)

Operator inspects the registry today via:
```
fx meta-state.jsonl '?.entry_kind != "change-log"' '?.entry_kind != "rule"' '?.entry_kind != "loop-design"' '?.status != "resolved"' '?.status != "archived"' '?.status != "superseded"' '?.status != "inactive"' | fx
```
This reads the RAW file as a TABLE (one line per id) — the operator's "what's next" workflow. Tier 2 puts N versioned lines per id in the raw file, which would break this.

**Resolution (operator-chosen): a `jq` projection pipe, not a bespoke CLI wrapper.** Mirror the `tools/scripts/vitest-failures.sh` idiom (small bash script, `jq` does the work, read-only, no side effects). Ship `tools/scripts/registry-table.sh`:
```bash
#!/usr/bin/env bash
# registry-table.sh — project versioned meta-state.jsonl to one-line-per-id (last-wins).
# Mirrors vitest-failures.sh: jq pipe, read-only, no side effects. Forward-compatible:
# identity on one-line-per-id files (Tier 0/1); real dedupe once Tier 2 versions entries.
set -euo pipefail
PATH_ARG="${1:-meta-state.jsonl}"
jq -s 'group_by(.id) | map(max_by(.version))[]' "$PATH_ARG"
```
Operator workflow becomes:
```
tools/scripts/registry-table.sh | fx '?.status != "resolved"' '?.status != "archived"' '?.status != "superseded"' '?.status != "inactive"' | fx
```
**Key simplification cascade:** `group_by(.id) | map(max_by(.version))[]` is an **identity** on the current one-line-per-id file (each id is a singleton, `max_by` returns it). So the operator can adopt `registry-table.sh | fx` **now, at Tier 0**, and it stays valid through Tier 1 and Tier 2 with **zero relearning.** The raw file no longer being directly table-readable stops mattering because the projection is the read surface — adopted early, not retrofitted.

**Direct-consumer audit (Q1, code-verified):** the inbound gate *code* does NOT read raw `meta-state.jsonl` (`inbound-gate.js` reads stdin + gate marker; `inbound-state.js` reads the operator message + `GATE_MARKER_PATH`). The "read meta-state.jsonl last 20 lines" is an **agent/operator instruction** in AGENTS.md/CLAUDE.md — a behavior, not code. Code-side raw readers are: `loop-introspect-cache.js:59` (hashes the file for cache invalidation — **not** a line-per-entry semantic consumer → **no Tier 2 cost**), `strip-code-fingerprint-field.mjs` (one-off migration script), and ~10 test files (all code-controllable). So the **only non-code direct consumers are exactly two: the operator `fx` query and the agent last-20-lines instruction** — both handled by the jq projection. At Tier 2, the AGENTS.md/CLAUDE.md instruction updates from "read last 20 raw lines" to "run `tools/scripts/registry-table.sh | tail -20`" (or use `meta_state_list`). Everything else is bounded code edits. **Q1 collapses into Q7.**

## 8. Validating finding↔change-log across two files (Tier 1)

**Key insight:** relationships are **id-keyed, not file-keyed.** The file boundary is invisible to the relationship layer *if* all reads funnel through one chokepoint. Verified: `read-registry-cache.js:4` hardcodes `REGISTRY_FILENAME = "meta-state.jsonl"` and every consumer (writes, relationship tools, schema validator) goes through `readRegistryWithCache`.

Existing validation (already built, works on the union):
- `entryIdRefsRefine` (meta-state.js:163) — write-time ref-format check.
- `meta_state_relationship_validate` + `meta_state_relationships` (`dangling_refs`) — existence/orphan check, id-indexed.
- Bidirectional invariants in schema: `finding.consolidated_into` ↔ `change-log.consolidates` (:208/:271); `superseded_by`, `promoted_to_rule`/`origin`, `proposed_design_for`/`addresses`, `reopens`.

**Tier-1 changes needed:**
1. Extend read chokepoint (as the projection seam per §6.3) to load `meta-state.jsonl` + `change-log.jsonl` → one entry array. All relationship logic inherits the union unchanged.
2. CI validation gate (decided Q4 + Q5 — see §11): pre-merge WARNING in the existing advisory workflow; post-merge BLOCK in a net-new workflow.

**New failure mode:** transient orphans (branch B change-log refs finding on un-merged branch A) → self-heals post-merge; that is exactly why pre-merge is WARNING-only and post-merge is BLOCK.

## 9. Registry actions

| Entry | Kind | Status | Role |
|---|---|---|---|
| `meta-260709T1017Z-…` | finding | **superseded** | original combined finding (carried the misdiagnosed two-target framing) |
| `meta-260715T0630Z-…-append-only` | change-log | active | consolidation record; `consolidates` old id |
| `meta-260715T0633Z-…-change-log-stream-…` | finding | open | **Tier 1**: split change-logs + `merge=union`; read-chokepoint as projection seam |
| `meta-260715T0633Z-…-finding-stream-…` | finding | open | **Tier 2 ticket**: mutable table → union-safe via versioned dedupe + jq projection; self-limiter removal |

**Prior-session patches (description-only, no status change):** both open findings reframed via `meta_state_patch` —
- *finding-stream*: replaced "DEFER until MUTATES / workaround cheaper" with behavioral-safety premise + "Tier 2 is the committed next phase" + the self-defeating-trigger argument.
- *change-log-stream*: added DESIGN NOTE — read-chokepoint must be the swappable projection seam for Tier 2, not a one-off concat.

**Process notes:** `meta_state_supersede` is live-gated (`LOOP_SESSION_MODE=live`); the supersede was completed in a separate live-mode session. `meta_state_report` auto-mints ids from the description prefix. `meta_state_patch` on `description` is NOT live-gated → the reframe patches applied inline.

## 10. Recommendation

- **Now:** Tier 1 — ship the change-log stream split as **phase 1 of a committed two-phase Tier-2 migration.** Justified on the narrow, honest ground: change-logs are the high-frequency append lane and the observed conflict; putting them on `merge=union` removes the most common conflict surface and narrows Tier 2's scope. Not justified as "reconciling two irreconcilable targets" (that framing is retired).
- **Adopt now (Tier-0-compatible):** `tools/scripts/registry-table.sh` + the `registry-table.sh | fx` workflow. Forward-compatible across all tiers — adopt early so Tier 2 breaks no workflow.
- **Next:** Tier 2 — make the mutable stream union-safe (versioned last-wins append + jq projection at the read surface + CI advisory for same-id concurrent mutations). This removes the operator's parallel-resolve speed limiter. Build the last-wins projection into the seam created in Tier 1.
- **Keep** `.gitattributes runtime-state.jsonl merge=union` defense-in-depth.
- **Do not** resolve the finding-stream finding when Tier 1 ships — it stays open as the Tier-2 ticket.

## 11. Decisions (all seven open questions resolved)

| Q | Decision | Basis |
|---|---|---|
| **Q1** direct raw-line consumers | Only two non-code consumers: operator `fx` query + agent last-20-lines instruction. Gate code reads through the chokepoint; `loop-introspect-cache.js` is SHA-only (no cost); rest are code-controllable tests/scripts. → collapses into Q7. | scouting: `inbound-gate.js`, `inbound-state.js`, `loop-introspect-cache.js:59`, test audit |
| **Q2** same-id concurrent mutation | **Last-wins + advisory.** Max version wins in projection; both version lines retained (audit-complete); CI advisory surfaces duplicate-version-per-id, no block. | operator decision |
| **Q3** compaction | **Projection ships with Tier 2 (mandatory); compaction rewrite defers to ~1k entries (YAGNI).** Distinguish read-time dedupe (small, required) from write-time file-shrink (big, deferrable). | recommendation, operator-accepted |
| **Q4** pre-merge ref-validation | **Pre-merge = WARNING** (can't resolve transient cross-file orphans); **post-merge = BLOCK** (full union present → real orphans = typos / deleted-but-referenced). Split by where the union is visible. | recommendation, operator-accepted |
| **Q5** CI home | **Pre-merge → extend `meta-state-pr-body-advisory.yml` + `tools/scripts/ci-registry-deltas.sh`** (already id-aware, advisory-only). **Post-merge → net-new workflow on push to main** running `meta_state_relationship_validate` on the union. | scouting: `.github/workflows/*` |
| **Q6** one-time change-log migration | **Single PR on main, no parallel window.** Coordinate by not cutting concurrent registry PRs that session. No `.loop-version` gate (over-engineering for a one-time solo migration). | recommendation, operator-accepted |
| **Q7** fx ergonomics | **`jq` projection pipe** mirroring `vitest-failures.sh` — `tools/scripts/registry-table.sh` doing `group_by(.id) \| map(max_by(.version))[]`. Forward-compatible (identity on Tier 0/1). Agent read instruction updates at Tier 2. | operator decision |

## Residual open

None blocking. Two minor items to settle at Tier 2 implementation time (not now):
- The exact `version` numbering for mutated entries under Tier 2 (monotonic per-id increment vs global lamport) — pick whichever the write-path rewrite finds natural; last-wins works under either.
- Whether the post-merge relationship-validate workflow also runs the Q2 same-id-concurrent-mutation advisory, or that's a separate step in the same workflow.