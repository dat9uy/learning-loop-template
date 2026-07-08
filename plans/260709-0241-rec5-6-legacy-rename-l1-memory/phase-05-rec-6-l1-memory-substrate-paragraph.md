---
phase: 5
title: "Rec 6 L1 memory-substrate paragraph"
status: pending
priority: P3
dependencies: []
---

# Phase 5: Rec 6 L1 memory-substrate paragraph

## Overview

Close the Rec 7 seam: add the second half of the memory-substrate statement to the
concept surface (L1). `docs/loop-engine.md:5,40` already says "the record is the
memory"; `architecture.md` (L3) names the three stores. L1 never states that three
stores *realize* the memory. One short paragraph completes it — without leaking L3
mechanism detail (L1 names roles, not mechanisms; the store file names are the boundary
between L1 and L3).

## Requirements

- Functional: `loop-engine.md` states that the record (the loop's memory) is realized by
  three stores, naming them, and states each store's *role* (not its file format or
  access path).
- Non-functional: stays implementation-agnostic per the L1 contract — names the stores as
  the realization of the memory role, points to `architecture.md` for mechanism. Matches
  the two-surfaces invariant ("concept and implementation surfaces must never share
  vocabulary" — but the store *names* are the seam the original Rec 7 explicitly wanted
  named at L1, per the source report).

## Architecture

Per the source report Rec 6: "`loop-engine.md:5,40` now states 'the record is the
memory' (first half). `runtime-contract.md` (L2) splits the three concerns and
`architecture.md` (L3) names the three stores (`meta-state.jsonl`, `runtime-state.jsonl`,
`file-index.jsonl`), but the concept surface (L1) still does not name the *three stores
realize it* half." The paragraph lands at L1, completes the statement, and points down
to L2/L3 for mechanism. This is a concept-surface docs edit — keep it short and
role-focused.

## Related Code Files

- Modify: `docs/loop-engine.md` (the `record` role section, near `:40`; add the paragraph
  after the existing "the record is the loop's memory across sessions" sentence).

## Implementation Steps

1. **Read the current `record` role section** in `docs/loop-engine.md` (around `:40`)
   and the existing memory mentions at `:5` to match voice and altitude.
2. **Add the paragraph.** Draft (adapt to surrounding voice):

   > The record is the loop's memory across sessions, and three stores realize it:
   > `meta-state.jsonl` holds the four kinds (findings, change-logs, rules, loop-designs)
   > — the loop's self-model; `runtime-state.jsonl` holds mutable runtime state (budgets,
   > counters, ledger events) — the loop's short-term memory; `file-index.jsonl` holds
   > the path-keyed evidence fingerprints that ground mechanism-check findings — the
   > loop's contact with the filesystem. The concept surface names these as the
   > realization of the memory role; how each store is read, written, and kept consistent
   > is implementation-surface detail in `docs/architecture.md`, and the contract a
   > runtime must satisfy to participate is in `docs/runtime-contract.md`.

   Keep it one paragraph. Do not expand into mechanism (no Zod schemas, no MCP tool
   names, no gate logic).
3. **Verify altitude.** The paragraph names stores + their *roles*, points to L2/L3 for
   mechanism, and introduces no mechanism vocabulary. If a reviewer would say "this
   belongs in architecture.md," trim the mechanism and keep the role.
4. **Rec 12 trigger.** Editing a bound concept-surface doc (`docs/loop-engine.md`) is a
   change-log trigger per the shipped Rec 12 rule. Record via `meta_state_log_change`
   (this is bundled with the rename change-log in Phase 6, or logged here — either is
   acceptable as long as it is logged before the plan ships).

## Success Criteria

- [ ] `docs/loop-engine.md` contains a one-paragraph statement that three stores realize
  the record/memory, naming `meta-state.jsonl` / `runtime-state.jsonl` / `file-index.jsonl`
  with their roles.
- [ ] The paragraph points to `architecture.md` (L3) + `runtime-contract.md` (L2) for
  mechanism and introduces no mechanism vocabulary.
- [ ] A `meta_state_log_change` entry records the L1 doc edit (Rec 12 trigger).

## Risk Assessment

- **Risk:** the paragraph drifts into L3 mechanism (schema shapes, tool calls).
  **Mitigation:** step 3 altitude check; keep to roles + the down-pointer.
- **Risk:** naming the store files at L1 violates the "two surfaces never share
  vocabulary" invariant. **Mitigation:** the source report's Rec 7 explicitly asked for
  these names at L1 as the seam-closer; the store *names* are the legitimate boundary,
  while the *access mechanisms* stay L3. State the names, point down for mechanism.